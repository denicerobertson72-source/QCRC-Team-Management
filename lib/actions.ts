"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ensureProfile, ensureSiteAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { easternLocalInputToIso } from "@/lib/time";
import { formatCurrencyStatusLine, sendTransactionalEmail } from "@/lib/email";
import { formatEasternDateTime } from "@/lib/time";
import { deriveReservationEndLocal } from "@/lib/reservations";
import { sendSms } from "@/lib/sms";
import { appendCrewNamesToNotes } from "@/lib/crew";
import { getAppUrl } from "@/lib/app-url";

function skillLevelToClearance(level: string) {
  switch (level) {
    case "Elite":
      return 4;
    case "Advanced":
      return 3;
    case "Intermediate":
      return 2;
    case "Beginner":
    default:
      return 1;
  }
}

function clearanceValueFromForm(value: FormDataEntryValue | null) {
  const raw = String(value ?? "Beginner");
  const numeric = Number(raw);
  if (!Number.isNaN(numeric) && numeric >= 1 && numeric <= 4) {
    return numeric;
  }
  return skillLevelToClearance(raw);
}

async function assertAdmin() {
  const { supabase, user } = await ensureProfile();
  const { data, error } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (error) throw error;
  if (!data || (data.role !== "admin" && data.role !== "equipment_manager" && data.role !== "coach")) {
    throw new Error("Admin permissions required");
  }
  return { supabase, user };
}

async function assertSiteAdmin() {
  const { supabase, user } = await ensureSiteAdmin();
  return { supabase, user };
}

type ProtectedMemberReference = {
  label: string;
  count: number;
};

async function getProtectedMemberReferences(admin: ReturnType<typeof createAdminClient>, memberId: string) {
  const [
    reservations,
    crewAssignments,
    reportedDamage,
    responsibleDamage,
    damagePhotos,
    privateBoatOutings,
    createdSessions,
    sessionSignups,
    programSignups,
    raceSignups,
  ] = await Promise.all([
    admin.from("reservations").select("id", { head: true, count: "exact" }).eq("created_by", memberId),
    admin.from("reservation_crew").select("reservation_id", { head: true, count: "exact" }).eq("member_id", memberId),
    admin.from("damage_reports").select("id", { head: true, count: "exact" }).eq("reported_by", memberId),
    admin.from("damage_reports").select("id", { head: true, count: "exact" }).eq("responsible_member_id", memberId),
    admin.from("damage_photos").select("id", { head: true, count: "exact" }).eq("uploaded_by", memberId),
    admin.from("private_boat_outings").select("id", { head: true, count: "exact" }).eq("member_id", memberId),
    admin.from("sessions").select("id", { head: true, count: "exact" }).eq("created_by", memberId),
    admin.from("session_signups").select("session_id", { head: true, count: "exact" }).eq("member_id", memberId),
    admin.from("program_signups").select("member_id", { head: true, count: "exact" }).eq("member_id", memberId),
    admin.from("race_signups").select("member_id", { head: true, count: "exact" }).eq("member_id", memberId),
  ]);

  const results = [
    { label: "reservations", result: reservations },
    { label: "crew assignments", result: crewAssignments },
    { label: "damage reports filed", result: reportedDamage },
    { label: "damage reports as responsible member", result: responsibleDamage },
    { label: "damage photo uploads", result: damagePhotos },
    { label: "private boat outings", result: privateBoatOutings },
    { label: "created sessions", result: createdSessions },
    { label: "session signups", result: sessionSignups },
    { label: "program signups", result: programSignups },
    { label: "race signups", result: raceSignups },
  ];

  for (const entry of results) {
    if (entry.result.error) {
      throw entry.result.error;
    }
  }

  return results
    .map((entry) => ({ label: entry.label, count: entry.result.count ?? 0 }))
    .filter((entry): entry is ProtectedMemberReference => entry.count > 0);
}

function parseCrew(value: FormDataEntryValue | null) {
  if (!value) return [] as string[];
  return String(value)
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
}

function sanitizeStorageFileName(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]/g, "-");
}

function parseBooleanLike(value: string | undefined) {
  const normalized = (value ?? "").trim().toLowerCase();
  return normalized === "true" || normalized === "yes" || normalized === "y" || normalized === "1";
}

function normalizeCsvDate(value: string | undefined) {
  const raw = (value ?? "").trim();
  return raw || null;
}

function csvTextValue(value: string | undefined) {
  const raw = (value ?? "").trim();
  return raw.length > 0 ? raw : null;
}

function csvBooleanValue(value: string | undefined) {
  const raw = (value ?? "").trim();
  if (!raw) return null;
  return parseBooleanLike(raw);
}

function normalizeMeetupTime(value: FormDataEntryValue | null) {
  const raw = String(value ?? "").trim().toLowerCase();
  if (!raw) return "";

  const twentyFourHourMatch = raw.match(/^(\d{1,2}):(\d{2})$/);
  if (twentyFourHourMatch) {
    const hour = Number(twentyFourHourMatch[1]);
    const minute = Number(twentyFourHourMatch[2]);
    if (hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59) {
      return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
    }
  }

  const twelveHourMatch = raw.match(/^(\d{1,2})(?::?(\d{2}))?\s*([ap]m)$/);
  if (twelveHourMatch) {
    const hourRaw = Number(twelveHourMatch[1]);
    const minute = Number(twelveHourMatch[2] ?? "0");
    const meridiem = twelveHourMatch[3];
    if (hourRaw >= 1 && hourRaw <= 12 && minute >= 0 && minute <= 59) {
      const normalizedHour = hourRaw % 12 + (meridiem === "pm" ? 12 : 0);
      return `${String(normalizedHour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
    }
  }

  const hourOnlyMatch = raw.match(/^(\d{1,2})$/);
  if (hourOnlyMatch) {
    const hour = Number(hourOnlyMatch[1]);
    if (hour >= 0 && hour <= 23) {
      return `${String(hour).padStart(2, "0")}:00`;
    }
  }

  throw new Error("Please enter times like 6:00, 06:00, 6am, or 6:30pm.");
}

function resolveMeetupTime(formData: FormData, inputName: string, presetName: string) {
  const typedValue = String(formData.get(inputName) ?? "").trim();
  const presetValue = String(formData.get(presetName) ?? "").trim();
  return normalizeMeetupTime(typedValue || presetValue);
}

type WeekdayNumber = 0 | 1 | 2 | 3 | 4 | 5 | 6;

function weekdayNumberFromCode(value: string): WeekdayNumber | null {
  switch (value) {
    case "sun":
      return 0;
    case "mon":
      return 1;
    case "tue":
      return 2;
    case "wed":
      return 3;
    case "thu":
      return 4;
    case "fri":
      return 5;
    case "sat":
      return 6;
    default:
      return null;
  }
}

function parseCsv(text: string) {
  const rows: string[][] = [];
  let current = "";
  let row: string[] = [];
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];

    if (char === "\"") {
      if (inQuotes && next === "\"") {
        current += "\"";
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      row.push(current.trim());
      current = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") {
        i += 1;
      }
      row.push(current.trim());
      if (row.some((cell) => cell.length > 0)) {
        rows.push(row);
      }
      row = [];
      current = "";
      continue;
    }

    current += char;
  }

  if (current.length > 0 || row.length > 0) {
    row.push(current.trim());
    if (row.some((cell) => cell.length > 0)) {
      rows.push(row);
    }
  }

  return rows;
}

function csvRowsToObjects(text: string) {
  const rows = parseCsv(text);
  if (rows.length === 0) {
    return [] as Record<string, string>[];
  }

  const headers = rows[0].map((header) => header.trim().toLowerCase());
  return rows.slice(1).map((cells) => {
    const record: Record<string, string> = {};
    headers.forEach((header, index) => {
      record[header] = cells[index] ?? "";
    });
    return record;
  });
}

function normalizeBoatClassId(value: string | undefined) {
  const raw = (value ?? "").trim();
  return raw || "1x";
}

function normalizeBoatStatus(value: string | undefined) {
  const raw = (value ?? "").trim().toLowerCase();
  if (raw === "maintenance" || raw === "locked" || raw === "available") {
    return raw;
  }
  return "available";
}

function normalizeBoatBrand(value: string | undefined) {
  const raw = (value ?? "").trim();
  if (!raw) return null;
  const normalized = raw.toLowerCase();
  if (normalized === "training" || normalized === "performance" || normalized === "stable" || normalized === "race") {
    return null;
  }
  return raw;
}

async function listAllAuthUsersByEmail(admin: ReturnType<typeof createAdminClient>) {
  const byEmail = new Map<string, string>();
  let page = 1;

  while (true) {
    const { data, error } = await admin.auth.admin.listUsers({
      page,
      perPage: 200,
    });
    if (error) throw error;

    const users = data.users ?? [];
    for (const user of users) {
      const email = user.email?.trim().toLowerCase();
      if (email) {
        byEmail.set(email, user.id);
      }
    }

    if (users.length < 200) break;
    page += 1;
  }

  return byEmail;
}

async function generateAndSendMemberAuthLink(
  admin: ReturnType<typeof createAdminClient>,
  {
    email,
    fullName,
    type,
  }: {
    email: string;
    fullName: string;
    type: "invite" | "magiclink";
  },
) {
  const appUrl = getAppUrl();
  const { data, error } = await admin.auth.admin.generateLink({
    type,
    email,
    options: {
      data: { full_name: fullName },
      redirectTo: `${appUrl}/auth/confirm?next=/reservations`,
    },
  });

  if (error || !data.properties.action_link || !data.user?.id) {
    throw new Error(error?.message || `Unable to create a ${type} link for ${email}.`);
  }

  const sendResult = await sendTransactionalEmail({
    to: email,
    subject: type === "invite" ? "QCRC invitation link" : "QCRC sign-in link",
    text:
      type === "invite"
        ? `Hello ${fullName},\n\nYou have been invited to join QCRC Team Management. Use this secure link to get started:\n\n${data.properties.action_link}\n\nAfter opening the link, you will land on your reservations page.`
        : `Hello ${fullName},\n\nUse this secure link to sign in to QCRC Team Management:\n\n${data.properties.action_link}\n\nAfter opening the link, you will land on your reservations page.`,
    html:
      type === "invite"
        ? `<p>Hello ${fullName},</p><p>You have been invited to join QCRC Team Management.</p><p><a href="${data.properties.action_link}">Accept Invitation</a></p><p>If the button does not work, paste this link into your browser:</p><p>${data.properties.action_link}</p><p>After opening the link, you will land on your reservations page.</p>`
        : `<p>Hello ${fullName},</p><p>Use this secure link to sign in to QCRC Team Management:</p><p><a href="${data.properties.action_link}">Open QCRC Team Management</a></p><p>If the button does not work, paste this link into your browser:</p><p>${data.properties.action_link}</p><p>After opening the link, you will land on your reservations page.</p>`,
  });

  if (!sendResult.sent) {
    return {
      userId: data.user.id,
      delivery: "manual" as const,
      actionLink: data.properties.action_link,
      reason: sendResult.reason || "Email provider not configured",
    };
  }

  return {
    userId: data.user.id,
    delivery: "email" as const,
    actionLink: data.properties.action_link,
    reason: null,
  };
}

export async function reserveBoatAction(formData: FormData) {
  const { supabase } = await ensureProfile();

  const boatId = String(formData.get("boat_id") ?? "");
  const startTime = String(formData.get("start_time") ?? "");
  const endTime = deriveReservationEndLocal(startTime);
  const checkoutLocation = String(formData.get("checkout_location") ?? "");
  const notes = String(formData.get("notes") ?? "");
  const crewNames = String(formData.get("crew_names") ?? "");
  const crew = [] as string[];
  const rawReturnTo = String(formData.get("return_to") ?? "/reserve");
  const returnTo = rawReturnTo.startsWith("/") ? rawReturnTo : "/reserve";
  const finalNotes = appendCrewNamesToNotes(notes, crewNames);
  if (!endTime) {
    const destination = new URL(returnTo, "http://local");
    destination.searchParams.set("reservation_status", "error");
    destination.searchParams.set("reservation_message", "Reservations must be two hours or less and stay within a single day.");
    redirect(`${destination.pathname}?${destination.searchParams.toString()}`);
  }

  const startTimeIso = easternLocalInputToIso(startTime);
  const endTimeIso = easternLocalInputToIso(endTime);

  if (!startTimeIso || !endTimeIso) {
    const destination = new URL(returnTo, "http://local");
    destination.searchParams.set("reservation_status", "error");
    destination.searchParams.set("reservation_message", "Reservation time could not be understood. Please choose the time again.");
    redirect(`${destination.pathname}?${destination.searchParams.toString()}`);
  }

  const result = await supabase.rpc("reserve_boat", {
    p_boat_id: boatId,
    p_start_time: startTimeIso,
    p_end_time: endTimeIso,
    p_checkout_location: checkoutLocation || null,
    p_notes: finalNotes || null,
    p_crew: crew,
  });

  const destination = new URL(returnTo, "http://local");

  if (result.error) {
    const rawMessage = result.error.message || "Reservation failed.";
    const message = rawMessage.includes("another active or reserved outing within 90 minutes")
      ? "You already have a reservation or active outing in this time block."
      : rawMessage.includes("Reservation blocked")
        ? "Reservation blocked. Check dues status, waiver, skill tier, weight class, or boat availability."
        : rawMessage;
    destination.searchParams.set("reservation_status", "error");
    destination.searchParams.set("reservation_message", message);
    redirect(`${destination.pathname}?${destination.searchParams.toString()}`);
  }

  revalidatePath("/reservations");
  revalidatePath("/reserve");
  destination.searchParams.set("reservation_status", "success");
  destination.searchParams.set("reservation_message", "Reservation confirmed.");
  redirect(`${destination.pathname}?${destination.searchParams.toString()}`);
}

export async function updateReservationAction(formData: FormData) {
  const { supabase, user } = await ensureProfile();
  const reservationId = String(formData.get("reservation_id") ?? "");
  const startTime = String(formData.get("start_time") ?? "");
  const endTime = String(formData.get("end_time") ?? "");
  const checkoutLocation = String(formData.get("checkout_location") ?? "");
  const notes = String(formData.get("notes") ?? "");
  const crewNames = String(formData.get("crew_names") ?? "");
  const finalNotes = appendCrewNamesToNotes(notes, crewNames);
  const startTimeIso = easternLocalInputToIso(startTime);
  const endTimeIso = easternLocalInputToIso(endTime);

  if (!startTimeIso || !endTimeIso) {
    const destination = new URL("/reservations", "http://local");
    destination.searchParams.set("reservation_status", "error");
    destination.searchParams.set("reservation_message", "Reservation time could not be understood. Please choose the time again.");
    redirect(`${destination.pathname}?${destination.searchParams.toString()}`);
  }

  const { error } = await supabase
    .from("reservations")
    .update({
      start_time: startTimeIso,
      end_time: endTimeIso,
      checkout_location: checkoutLocation || null,
      notes: finalNotes || null,
    })
    .eq("id", reservationId)
    .eq("created_by", user.id)
    .eq("status", "reserved");

  const destination = new URL("/reservations", "http://local");
  if (error) {
    destination.searchParams.set("reservation_status", "error");
    destination.searchParams.set("reservation_message", error.message || "Unable to update reservation.");
    redirect(`${destination.pathname}?${destination.searchParams.toString()}`);
  }

  revalidatePath("/reservations");
  revalidatePath("/reserve");
  destination.searchParams.set("reservation_status", "success");
  destination.searchParams.set("reservation_message", "Reservation updated.");
  redirect(`${destination.pathname}?${destination.searchParams.toString()}`);
}

export async function cancelReservationAction(formData: FormData) {
  const { supabase, user } = await ensureProfile();
  const reservationId = String(formData.get("reservation_id") ?? "");

  const { error } = await supabase
    .from("reservations")
    .update({ status: "cancelled" })
    .eq("id", reservationId)
    .eq("created_by", user.id)
    .eq("status", "reserved");

  const destination = new URL("/reservations", "http://local");
  if (error) {
    destination.searchParams.set("reservation_status", "error");
    destination.searchParams.set("reservation_message", error.message || "Unable to cancel reservation.");
    redirect(`${destination.pathname}?${destination.searchParams.toString()}`);
  }

  revalidatePath("/reservations");
  revalidatePath("/reserve");
  destination.searchParams.set("reservation_status", "success");
  destination.searchParams.set("reservation_message", "Reservation cancelled.");
  redirect(`${destination.pathname}?${destination.searchParams.toString()}`);
}

export async function addSafetyResourceAdminAction(formData: FormData) {
  const { supabase, user } = await assertAdmin();
  const title = String(formData.get("title") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const resourceType = String(formData.get("resource_type") ?? "procedure");
  const externalUrl = String(formData.get("external_url") ?? "").trim();
  const sortOrder = Number(formData.get("sort_order") ?? 0);
  const isPublished = String(formData.get("is_published") ?? "true") === "true";
  const fileEntry = formData.get("file");
  const file = typeof File !== "undefined" && fileEntry instanceof File && fileEntry.size > 0 ? fileEntry : null;

  let storagePath: string | null = null;
  let mimeType: string | null = null;

  if (file) {
    const safeName = sanitizeStorageFileName(file.name);
    storagePath = `${user.id}/${Date.now()}-${safeName}`;
    mimeType = file.type || null;
    const { error: uploadError } = await supabase.storage.from("safety-resources").upload(storagePath, file, {
      contentType: file.type || "application/octet-stream",
      upsert: false,
    });
    if (uploadError) throw uploadError;
  }

  const { error } = await supabase.from("safety_resources").insert({
    title,
    description: description || null,
    resource_type: resourceType,
    external_url: externalUrl || null,
    storage_path: storagePath,
    mime_type: mimeType,
    sort_order: Number.isFinite(sortOrder) ? sortOrder : 0,
    is_published: isPublished,
    created_by: user.id,
  });

  if (error) throw error;
  revalidatePath("/admin/safety");
  revalidatePath("/safety");
  redirect("/admin/safety");
}

export async function importMembersCsvAdminAction(formData: FormData) {
  await assertSiteAdmin();
  const admin = createAdminClient();
  const fileEntry = formData.get("file");
  const file = typeof File !== "undefined" && fileEntry instanceof File && fileEntry.size > 0 ? fileEntry : null;

  if (!file) {
    redirect("/admin/members?import_status=error&import_message=Please%20choose%20a%20CSV%20file.");
  }

  const text = await file.text();
  const records = csvRowsToObjects(text);
  if (records.length === 0) {
    redirect("/admin/members?import_status=error&import_message=The%20CSV%20file%20did%20not%20contain%20any%20rows.");
  }

  const { data: existingProfiles, error: existingProfilesError } = await admin
    .from("profiles")
    .select(
      "id, email, full_name, phone, role, status, membership_type, skill_level, weight_class, dues_ok, dues_renewal_date, usrowing_membership_date, safesport_date, owns_private_boat, boat_storage_fee_ok, boat_storage_fee_renewal_date, sms_opt_in",
    );
  if (existingProfilesError) throw existingProfilesError;
  const markMissingInactive = String(formData.get("mark_missing_inactive") ?? "false") === "true";

  const existingProfilesByEmail = new Map(
    (existingProfiles ?? [])
      .filter((profile) => profile.email)
      .map((profile) => [profile.email.toLowerCase(), profile]),
  );
  const existingByEmail = new Map(
    (existingProfiles ?? [])
      .filter((profile) => profile.email)
      .map((profile) => [profile.email.toLowerCase(), profile.id]),
  );
  const existingEmailSet = new Set(existingByEmail.keys());
  const authUsersByEmail = await listAllAuthUsersByEmail(admin);

  let imported = 0;
  let invited = 0;
  let updated = 0;
  let deactivated = 0;
  const warnings: string[] = [];
  const errors: string[] = [];
  const seenEmails = new Set<string>();

  for (const record of records) {
    const email = (record.email ?? "").trim().toLowerCase();
    if (!email) {
      warnings.push("Skipped a row with no email.");
      continue;
    }
    seenEmails.add(email);

    const existingProfile = existingProfilesByEmail.get(email) ?? null;
    const csvFullName = csvTextValue(record.full_name ?? record.name);
    const fullName = csvFullName ?? existingProfile?.full_name?.trim() ?? email;
    let profileId = existingByEmail.get(email) ?? authUsersByEmail.get(email) ?? null;

    if (!profileId) {
      try {
        const inviteResult = await generateAndSendMemberAuthLink(admin, {
          email,
          fullName,
          type: "invite",
        });
        profileId = inviteResult.userId;
        if (inviteResult.delivery !== "email") {
          warnings.push(`Imported ${email}, but no invite email was sent: ${inviteResult.reason}`);
        }
      } catch (error) {
        errors.push(`Could not invite ${email}: ${error instanceof Error ? error.message : "unknown error"}`);
        continue;
      }
      existingByEmail.set(email, profileId);
      authUsersByEmail.set(email, profileId);
      invited += 1;
    }

    const profilePayload = {
      id: profileId,
      email,
      full_name: fullName,
      phone: csvTextValue(record.phone) ?? existingProfile?.phone ?? null,
      role: csvTextValue(record.role) ?? existingProfile?.role ?? "member",
      status: csvTextValue(record.status) ?? existingProfile?.status ?? "active",
      membership_type: csvTextValue(record.membership_type) ?? existingProfile?.membership_type ?? "community",
      skill_level: csvTextValue(record.skill_level) ?? existingProfile?.skill_level ?? "Beginner",
      weight_class: csvTextValue(record.weight_class) ?? existingProfile?.weight_class ?? "Mid-weight",
      dues_ok: csvBooleanValue(record.dues_ok) ?? existingProfile?.dues_ok ?? false,
      dues_renewal_date: csvTextValue(record.dues_renewal_date) ?? existingProfile?.dues_renewal_date ?? null,
      usrowing_membership_date:
        csvTextValue(record.usrowing_membership_date) ?? existingProfile?.usrowing_membership_date ?? null,
      safesport_date: csvTextValue(record.safesport_date) ?? existingProfile?.safesport_date ?? null,
      owns_private_boat: csvBooleanValue(record.owns_private_boat) ?? existingProfile?.owns_private_boat ?? false,
      boat_storage_fee_ok: csvBooleanValue(record.boat_storage_fee_ok) ?? existingProfile?.boat_storage_fee_ok ?? false,
      boat_storage_fee_renewal_date:
        csvTextValue(record.boat_storage_fee_renewal_date) ?? existingProfile?.boat_storage_fee_renewal_date ?? null,
      sms_opt_in: csvBooleanValue(record.sms_opt_in) ?? existingProfile?.sms_opt_in ?? false,
    };

    const { error } = await admin.from("profiles").upsert(profilePayload, { onConflict: "id" });
    if (error) {
      errors.push(`Could not import ${email}: ${error.message}`);
      continue;
    }

    imported += 1;
    if (existingEmailSet.has(email)) {
      updated += 1;
    }
  }

  if (markMissingInactive) {
    const { data: activeProfiles, error: activeProfilesError } = await admin
      .from("profiles")
      .select("id, email, role, status")
      .neq("role", "admin")
      .neq("role", "equipment_manager")
      .neq("status", "inactive");
    if (activeProfilesError) throw activeProfilesError;

    const idsToDeactivate = (activeProfiles ?? [])
      .filter((profile) => profile.email && !seenEmails.has(profile.email.toLowerCase()))
      .map((profile) => profile.id);

    if (idsToDeactivate.length > 0) {
      const { error: deactivateError } = await admin.from("profiles").update({ status: "inactive" }).in("id", idsToDeactivate);
      if (deactivateError) throw deactivateError;
      deactivated = idsToDeactivate.length;
    }
  }

  revalidatePath("/admin/members");
  const parts = [`${imported} row(s) imported.`, `${updated} updated.`, `${invited} invited.`];
  if (markMissingInactive) {
    parts.push(`${deactivated} missing member(s) marked inactive.`);
  }
  if (warnings.length > 0) {
    parts.push(`${warnings.length} warning(s): ${warnings.slice(0, 3).join(" | ")}`);
  }
  if (errors.length > 0) {
    parts.push(`${errors.length} error(s): ${errors.slice(0, 3).join(" | ")}`);
  }
  const message = parts.join(" ");
  redirect(`/admin/members?import_status=${errors.length > 0 ? "error" : "success"}&import_message=${encodeURIComponent(message)}`);
}

export async function sendMemberMagicLinkAdminAction(formData: FormData) {
  await assertSiteAdmin();
  const admin = createAdminClient();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const fullName = String(formData.get("full_name") ?? "").trim() || email;
  const destination = new URL("/admin/members", "http://local");

  if (!email) {
    destination.searchParams.set("invite_status", "error");
    destination.searchParams.set("invite_message", "Member email is required to send a magic link.");
    redirect(`${destination.pathname}?${destination.searchParams.toString()}`);
  }

  try {
    const magicLinkResult = await generateAndSendMemberAuthLink(admin, {
      email,
      fullName,
      type: "magiclink",
    });
    if (magicLinkResult.delivery !== "email") {
      destination.searchParams.set("invite_status", "success");
      destination.searchParams.set(
        "invite_message",
        `Email delivery is not configured in this environment, so a fresh magic link for ${email} could not be emailed. Use Copy Invite Guidance on the member row for next steps.`,
      );
      redirect(`${destination.pathname}?${destination.searchParams.toString()}`);
    }
  } catch (sendError) {
    destination.searchParams.set("invite_status", "error");
    destination.searchParams.set(
      "invite_message",
      sendError instanceof Error ? sendError.message : `Magic link created for ${email}, but the email could not be sent.`,
    );
    redirect(`${destination.pathname}?${destination.searchParams.toString()}`);
  }

  destination.searchParams.set("invite_status", "success");
  destination.searchParams.set("invite_message", `Magic link sent to ${email}.`);
  redirect(`${destination.pathname}?${destination.searchParams.toString()}`);
}

export async function deleteMemberPermanentlyAdminAction(formData: FormData) {
  const { user } = await assertSiteAdmin();
  const admin = createAdminClient();
  const memberId = String(formData.get("member_id") ?? "");
  const confirmDelete = String(formData.get("confirm_delete") ?? "false") === "true";
  const destination = new URL("/admin/members", "http://local");

  if (!memberId) {
    destination.searchParams.set("member_status", "error");
    destination.searchParams.set("member_message", "Member id is required for permanent delete.");
    redirect(`${destination.pathname}?${destination.searchParams.toString()}`);
  }

  if (!confirmDelete) {
    destination.searchParams.set("member_status", "error");
    destination.searchParams.set("member_message", "Check the confirmation box before permanently deleting a member.");
    redirect(`${destination.pathname}?${destination.searchParams.toString()}`);
  }

  if (memberId === user.id) {
    destination.searchParams.set("member_status", "error");
    destination.searchParams.set("member_message", "You cannot permanently delete your own admin account.");
    redirect(`${destination.pathname}?${destination.searchParams.toString()}`);
  }

  const { data: member, error: memberError } = await admin
    .from("profiles")
    .select("id, full_name, email, role")
    .eq("id", memberId)
    .single();
  if (memberError) {
    destination.searchParams.set("member_status", "error");
    destination.searchParams.set("member_message", memberError.message || "Member could not be found.");
    redirect(`${destination.pathname}?${destination.searchParams.toString()}`);
  }

  if (member.role === "admin") {
    destination.searchParams.set("member_status", "error");
    destination.searchParams.set("member_message", "Admin accounts must be downgraded first; they cannot be permanently deleted from this screen.");
    redirect(`${destination.pathname}?${destination.searchParams.toString()}`);
  }

  const references = await getProtectedMemberReferences(admin, memberId);
  if (references.length > 0) {
    destination.searchParams.set("member_status", "error");
    destination.searchParams.set(
      "member_message",
      `Permanent delete is blocked for ${member.full_name}. This member still has linked history: ${references
        .slice(0, 4)
        .map((entry) => `${entry.label} (${entry.count})`)
        .join(", ")}. Mark the member inactive instead.`,
    );
    redirect(`${destination.pathname}?${destination.searchParams.toString()}`);
  }

  const { error: authDeleteError } = await admin.auth.admin.deleteUser(memberId);
  if (authDeleteError) {
    destination.searchParams.set("member_status", "error");
    destination.searchParams.set(
      "member_message",
      authDeleteError.message || `Unable to permanently delete ${member.email ?? member.full_name}.`,
    );
    redirect(`${destination.pathname}?${destination.searchParams.toString()}`);
  }

  revalidatePath("/admin/members");
  destination.searchParams.set("member_status", "success");
  destination.searchParams.set("member_message", `${member.full_name} was permanently deleted.`);
  redirect(`${destination.pathname}?${destination.searchParams.toString()}`);
}

export async function inviteMemberAdminAction(formData: FormData) {
  await assertSiteAdmin();
  const admin = createAdminClient();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const fullName = String(formData.get("full_name") ?? "").trim() || email;
  const destination = new URL("/admin/members", "http://local");

  if (!email) {
    destination.searchParams.set("invite_status", "error");
    destination.searchParams.set("invite_message", "Member email is required.");
    redirect(`${destination.pathname}?${destination.searchParams.toString()}`);
  }

  const authUsersByEmail = await listAllAuthUsersByEmail(admin);

  if (authUsersByEmail.has(email)) {
    const magicLinkForm = new FormData();
    magicLinkForm.set("email", email);
    magicLinkForm.set("full_name", fullName);
    await sendMemberMagicLinkAdminAction(magicLinkForm);
  }

  let invitedUserId = "";
  try {
    const inviteResult = await generateAndSendMemberAuthLink(admin, {
      email,
      fullName,
      type: "invite",
    });
    invitedUserId = inviteResult.userId;

    if (inviteResult.delivery !== "email") {
      const { error } = await admin.from("profiles").upsert(
        {
          id: invitedUserId,
          email,
          full_name: fullName,
        },
        { onConflict: "id" },
      );
      if (error) {
        destination.searchParams.set("invite_status", "error");
        destination.searchParams.set("invite_message", error.message || `Profile setup failed for ${email}.`);
        redirect(`${destination.pathname}?${destination.searchParams.toString()}`);
      }

      revalidatePath("/admin/members");
      destination.searchParams.set("invite_status", "success");
      destination.searchParams.set(
        "invite_message",
        `Email delivery is not configured in this environment, so the invite for ${email} was created but not emailed. Use Copy Invite Guidance on the member row for next steps.`,
      );
      redirect(`${destination.pathname}?${destination.searchParams.toString()}`);
    }
  } catch (error) {
    destination.searchParams.set("invite_status", "error");
    destination.searchParams.set("invite_message", error instanceof Error ? error.message : `Unable to invite ${email}.`);
    redirect(`${destination.pathname}?${destination.searchParams.toString()}`);
  }

  const { error } = await admin.from("profiles").upsert(
    {
      id: invitedUserId,
      email,
      full_name: fullName,
    },
    { onConflict: "id" },
  );
  if (error) {
    destination.searchParams.set("invite_status", "error");
    destination.searchParams.set("invite_message", error.message || `Invite sent, but profile setup failed for ${email}.`);
    redirect(`${destination.pathname}?${destination.searchParams.toString()}`);
  }

  revalidatePath("/admin/members");
  destination.searchParams.set("invite_status", "success");
  destination.searchParams.set("invite_message", `Invite sent to ${email}.`);
  redirect(`${destination.pathname}?${destination.searchParams.toString()}`);
}

export async function updateSafetyResourceAdminAction(formData: FormData) {
  const { supabase, user } = await assertAdmin();
  const resourceId = String(formData.get("resource_id") ?? "");
  const title = String(formData.get("title") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const resourceType = String(formData.get("resource_type") ?? "procedure");
  const externalUrl = String(formData.get("external_url") ?? "").trim();
  const sortOrder = Number(formData.get("sort_order") ?? 0);
  const isPublished = String(formData.get("is_published") ?? "true") === "true";
  const fileEntry = formData.get("file");
  const file = typeof File !== "undefined" && fileEntry instanceof File && fileEntry.size > 0 ? fileEntry : null;

  const { data: existingResource, error: existingError } = await supabase
    .from("safety_resources")
    .select("storage_path, mime_type")
    .eq("id", resourceId)
    .single();
  if (existingError) throw existingError;

  let storagePath = existingResource.storage_path as string | null;
  let mimeType = existingResource.mime_type as string | null;

  if (file) {
    const safeName = sanitizeStorageFileName(file.name);
    const nextStoragePath = `${user.id}/${Date.now()}-${safeName}`;
    const { error: uploadError } = await supabase.storage.from("safety-resources").upload(nextStoragePath, file, {
      contentType: file.type || "application/octet-stream",
      upsert: false,
    });
    if (uploadError) throw uploadError;

    if (storagePath) {
      await supabase.storage.from("safety-resources").remove([storagePath]);
    }

    storagePath = nextStoragePath;
    mimeType = file.type || null;
  }

  const { error } = await supabase
    .from("safety_resources")
    .update({
      title,
      description: description || null,
      resource_type: resourceType,
      external_url: externalUrl || null,
      storage_path: storagePath,
      mime_type: mimeType,
      sort_order: Number.isFinite(sortOrder) ? sortOrder : 0,
      is_published: isPublished,
    })
    .eq("id", resourceId);

  if (error) throw error;
  revalidatePath("/admin/safety");
  revalidatePath("/safety");
  redirect("/admin/safety");
}

export async function checkoutAction(formData: FormData) {
  const { supabase } = await ensureProfile();
  const reservationId = String(formData.get("reservation_id") ?? "");
  const location = String(formData.get("location") ?? "");
  const direction = String(formData.get("river_direction") ?? "");

  const destination = new URL("/reservations", "http://local");

  const { error } = await supabase.rpc("checkout_reservation", {
    p_reservation_id: reservationId,
    p_location: location || null,
  });

  if (error) {
    destination.searchParams.set("reservation_status", "error");
    destination.searchParams.set("reservation_message", error.message || "Unable to launch.");
    redirect(`${destination.pathname}?${destination.searchParams.toString()}`);
  }

  if (direction) {
    const updateResult = await supabase.from("reservations").update({ river_direction: direction }).eq("id", reservationId);
    if (updateResult.error) {
      destination.searchParams.set("reservation_status", "error");
      destination.searchParams.set("reservation_message", updateResult.error.message || "Launch recorded, but direction was not saved.");
      redirect(`${destination.pathname}?${destination.searchParams.toString()}`);
    }
  }

  revalidatePath("/reservations");
  revalidatePath("/reserve");
  revalidatePath("/safety");
  destination.searchParams.set("reservation_status", "success");
  destination.searchParams.set("reservation_message", "Launch recorded.");
  redirect(`${destination.pathname}?${destination.searchParams.toString()}`);
}

export async function checkinAction(formData: FormData) {
  const { supabase } = await ensureProfile();
  const reservationId = String(formData.get("reservation_id") ?? "");
  const notes = String(formData.get("notes") ?? "");
  const destination = new URL("/reservations", "http://local");

  const { error } = await supabase.rpc("checkin_reservation", {
    p_reservation_id: reservationId,
    p_notes: notes || null,
  });

  if (error) {
    destination.searchParams.set("reservation_status", "error");
    destination.searchParams.set("reservation_message", error.message || "Unable to mark returned.");
    redirect(`${destination.pathname}?${destination.searchParams.toString()}`);
  }

  revalidatePath("/reservations");
  revalidatePath("/safety");
  revalidatePath("/reserve");
  destination.searchParams.set("reservation_status", "success");
  destination.searchParams.set("reservation_message", "Return recorded. Update gate status when leaving the marina.");
  redirect(`${destination.pathname}?${destination.searchParams.toString()}`);
}

export async function updateReservationGateStatusAction(formData: FormData) {
  const { supabase, user } = await ensureProfile();
  const reservationId = String(formData.get("reservation_id") ?? "");
  const gateStatus = String(formData.get("gate_status") ?? "");
  const destination = new URL("/reservations", "http://local");

  const { error } = await supabase
    .from("reservations")
    .update({ gate_status: gateStatus || null })
    .eq("id", reservationId)
    .eq("created_by", user.id)
    .eq("status", "checked_in");

  if (error) {
    destination.searchParams.set("reservation_status", "error");
    destination.searchParams.set("reservation_message", error.message || "Unable to save gate status.");
    redirect(`${destination.pathname}?${destination.searchParams.toString()}`);
  }

  revalidatePath("/reservations");
  revalidatePath("/safety");
  destination.searchParams.set("reservation_status", "success");
  destination.searchParams.set("reservation_message", "Gate status saved.");
  redirect(`${destination.pathname}?${destination.searchParams.toString()}`);
}

export async function privateBoatLaunchAction(formData: FormData) {
  const { supabase, user } = await ensureProfile();
  const privateOutingId = String(formData.get("private_outing_id") ?? "");
  const location = String(formData.get("location") ?? "");
  const direction = String(formData.get("river_direction") ?? "");
  const destination = new URL("/reservations", "http://local");

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("full_name, status, owns_private_boat, boat_storage_fee_ok")
    .eq("id", user.id)
    .single();
  if (profileError) throw profileError;

  if (!profile?.owns_private_boat) {
    destination.searchParams.set("reservation_status", "error");
    destination.searchParams.set("reservation_message", "Your account is not marked as a private boat owner.");
    redirect(`${destination.pathname}?${destination.searchParams.toString()}`);
  }

  if (!profile.boat_storage_fee_ok) {
    destination.searchParams.set("reservation_status", "error");
    destination.searchParams.set("reservation_message", "Private boat launch is unavailable until boat storage dues are current.");
    redirect(`${destination.pathname}?${destination.searchParams.toString()}`);
  }

  const { data: existingOuting, error: existingOutingError } = await supabase
    .from("private_boat_outings")
    .select("id")
    .eq("member_id", user.id)
    .eq("status", "checked_out")
    .maybeSingle();
  if (existingOutingError) throw existingOutingError;

  if (existingOuting) {
    destination.searchParams.set("reservation_status", "error");
    destination.searchParams.set("reservation_message", "You already have an active private boat outing.");
    redirect(`${destination.pathname}?${destination.searchParams.toString()}`);
  }

  const { error } = await supabase.from("private_boat_outings").insert({
    id: privateOutingId || undefined,
    member_id: user.id,
    status: "checked_out",
    checked_out_at: new Date().toISOString(),
    checkout_location: location || null,
    river_direction: direction || null,
    notes: null,
  });

  if (error) {
    destination.searchParams.set("reservation_status", "error");
    destination.searchParams.set("reservation_message", error.message || "Unable to launch private boat.");
    redirect(`${destination.pathname}?${destination.searchParams.toString()}`);
  }

  revalidatePath("/reservations");
  revalidatePath("/safety");
  destination.searchParams.set("reservation_status", "success");
  destination.searchParams.set("reservation_message", "Private boat launch recorded.");
  redirect(`${destination.pathname}?${destination.searchParams.toString()}`);
}

export async function privateBoatReturnAction(formData: FormData) {
  const { supabase, user } = await ensureProfile();
  const privateOutingId = String(formData.get("private_outing_id") ?? "");
  const notes = String(formData.get("notes") ?? "");
  const destination = new URL("/reservations", "http://local");

  const { error } = await supabase
    .from("private_boat_outings")
    .update({
      status: "checked_in",
      checked_in_at: new Date().toISOString(),
      notes: notes || null,
    })
    .eq("id", privateOutingId)
    .eq("member_id", user.id)
    .eq("status", "checked_out");

  if (error) {
    destination.searchParams.set("reservation_status", "error");
    destination.searchParams.set("reservation_message", error.message || "Unable to mark private boat returned.");
    redirect(`${destination.pathname}?${destination.searchParams.toString()}`);
  }

  revalidatePath("/reservations");
  revalidatePath("/safety");
  destination.searchParams.set("reservation_status", "success");
  destination.searchParams.set("reservation_message", "Private boat return recorded. Update gate status when leaving the marina.");
  redirect(`${destination.pathname}?${destination.searchParams.toString()}`);
}

export async function updatePrivateBoatGateStatusAction(formData: FormData) {
  const { supabase, user } = await ensureProfile();
  const privateOutingId = String(formData.get("private_outing_id") ?? "");
  const gateStatus = String(formData.get("gate_status") ?? "");
  const destination = new URL("/reservations", "http://local");

  const { error } = await supabase
    .from("private_boat_outings")
    .update({ gate_status: gateStatus || null })
    .eq("id", privateOutingId)
    .eq("member_id", user.id)
    .eq("status", "checked_in");

  if (error) {
    destination.searchParams.set("reservation_status", "error");
    destination.searchParams.set("reservation_message", error.message || "Unable to save private boat gate status.");
    redirect(`${destination.pathname}?${destination.searchParams.toString()}`);
  }

  revalidatePath("/reservations");
  revalidatePath("/safety");
  destination.searchParams.set("reservation_status", "success");
  destination.searchParams.set("reservation_message", "Private boat gate status saved.");
  redirect(`${destination.pathname}?${destination.searchParams.toString()}`);
}

export async function submitDamageAction(formData: FormData) {
  const destination = new URL("/damage/new", "http://local");
  try {
    const { supabase, user } = await ensureProfile();

    const reservationId = String(formData.get("reservation_id") ?? "");
    const boatId = String(formData.get("boat_id") ?? "");
    const severity = Number(formData.get("severity") ?? 1);
    const description = String(formData.get("description") ?? "");
    const responsibleMemberName = String(formData.get("responsible_member_name") ?? "").trim();
    const rawPaths = String(formData.get("photo_paths") ?? "");
    const photoPaths = rawPaths
      .split("\n")
      .map((v) => v.trim())
      .filter(Boolean);
    const uploadedFiles = formData
      .getAll("photos")
      .filter((entry): entry is File => typeof File !== "undefined" && entry instanceof File && entry.size > 0);

    const uploadedPaths: string[] = [];
    for (const file of uploadedFiles) {
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "-");
      const storagePath = `${user.id}/${Date.now()}-${safeName}`;
      const { error: uploadError } = await supabase.storage.from("damage-photos").upload(storagePath, file, {
        contentType: file.type || "application/octet-stream",
        upsert: false,
      });
      if (uploadError) throw uploadError;
      uploadedPaths.push(storagePath);
    }

    const allPhotoPaths = [...photoPaths, ...uploadedPaths];
    const finalDescription = responsibleMemberName
      ? `${description}\nResponsible rower: ${responsibleMemberName}`
      : description;

    let damageReportId: string | null = null;
    if (allPhotoPaths.length > 0) {
      const { data: rpcResult, error } = await supabase.rpc("submit_damage_report", {
        p_reservation_id: reservationId || null,
        p_boat_id: boatId,
        p_severity: severity,
        p_description: finalDescription,
        p_photo_paths: allPhotoPaths,
        p_responsible_member_id: null,
      });

      if (error) throw error;
      damageReportId = rpcResult;
    } else {
      const { data: inserted, error } = await supabase
        .from("damage_reports")
        .insert({
          reservation_id: reservationId || null,
          boat_id: boatId,
          reported_by: user.id,
          responsible_member_id: null,
          severity,
          description: finalDescription,
        })
        .select("id")
        .single();
      if (error) throw error;
      damageReportId = inserted.id;
    }

    if (severity >= 3) {
      const { data: impactedReservations, error: impactedError } = await supabase
        .from("reservations")
        .select("id, start_time, profiles!reservations_created_by_fkey(id,full_name,email,phone,sms_opt_in), boats(name)")
        .eq("boat_id", boatId)
        .eq("status", "reserved")
        .gte("start_time", new Date().toISOString());
      if (impactedError) throw impactedError;

      const impactedRows = impactedReservations ?? [];
      for (const impacted of impactedRows) {
        const profile = Array.isArray(impacted.profiles) ? impacted.profiles[0] : impacted.profiles;
        const boat = Array.isArray(impacted.boats) ? impacted.boats[0] : impacted.boats;
        if (profile?.id) {
          await supabase.from("notification_events").upsert(
            {
              notification_key: `boat-out:${damageReportId}:${impacted.id}`,
              notification_type: "boat_out_of_service",
              member_id: profile.id,
              reservation_id: impacted.id,
              payload: {
                boat_name: boat?.name ?? boatId,
                reservation_start: impacted.start_time,
              },
            },
            { onConflict: "notification_key" },
          );
        }

        if (profile?.email) {
          try {
            await sendTransactionalEmail({
              to: profile.email,
              subject: `QCRC reservation alert: ${boat?.name ?? "Boat"} is out of service`,
              text: `Your reserved boat ${boat?.name ?? "boat"} is now out of service due to a damage report. Reservation time: ${formatEasternDateTime(
                impacted.start_time,
              )} ET. Please reserve another boat.`,
              html: `<p>Your reserved boat <strong>${boat?.name ?? "boat"}</strong> is now out of service due to a damage report.</p><p><strong>Reservation time:</strong> ${formatEasternDateTime(
                impacted.start_time,
              )} ET</p><p>Please reserve another boat.</p>`,
            });
          } catch {
            // Keep damage submission successful even without email delivery.
          }
        }
        if (profile?.phone && profile?.sms_opt_in) {
          try {
            await sendSms({
              to: profile.phone,
              body: `QCRC alert: ${boat?.name ?? "Your boat"} is out of service for your reservation at ${formatEasternDateTime(
                impacted.start_time,
              )} ET. Please reserve another boat.`,
            });
          } catch {
            // Keep damage submission successful even without SMS delivery.
          }
        }
      }
    }

    revalidatePath("/damage/new");
    revalidatePath("/reservations");
    revalidatePath("/admin/damage");
    revalidatePath("/reserve");
    destination.searchParams.set("damage_status", "success");
    destination.searchParams.set("damage_message", "Damage report submitted.");
  } catch (error) {
    destination.searchParams.set("damage_status", "error");
    destination.searchParams.set("damage_message", error instanceof Error ? error.message : "Damage report failed.");
  }
  redirect(`${destination.pathname}?${destination.searchParams.toString()}`);
}

export async function signOutAction() {
  const { supabase } = await ensureProfile();
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
  redirect("/login");
}

export async function updateMyFullNameAction(formData: FormData) {
  const { supabase, user } = await ensureProfile();
  const admin = createAdminClient();
  const fullName = String(formData.get("full_name") ?? "").trim();
  const destination = new URL("/account/security", "http://local");

  if (!fullName) {
    destination.searchParams.set("profile_status", "error");
    destination.searchParams.set("profile_message", "Full name is required.");
    redirect(`${destination.pathname}?${destination.searchParams.toString()}`);
  }

  const { error } = await supabase.from("profiles").update({ full_name: fullName }).eq("id", user.id);
  if (error) {
    destination.searchParams.set("profile_status", "error");
    destination.searchParams.set("profile_message", error.message || "Unable to save your full name.");
    redirect(`${destination.pathname}?${destination.searchParams.toString()}`);
  }

  await admin.auth.admin.updateUserById(user.id, {
    user_metadata: {
      full_name: fullName,
    },
  });

  revalidatePath("/");
  revalidatePath("/account/security");
  destination.searchParams.set("profile_status", "success");
  destination.searchParams.set("profile_message", "Full name updated.");
  redirect(`${destination.pathname}?${destination.searchParams.toString()}`);
}

export async function markNotificationReadAction(formData: FormData) {
  const { supabase, user } = await ensureProfile();
  const notificationId = String(formData.get("notification_id") ?? "");

  const { error } = await supabase
    .from("notification_events")
    .update({ read_at: new Date().toISOString() })
    .eq("id", notificationId)
    .eq("member_id", user.id);

  if (error) throw error;
  revalidatePath("/notifications");
}

export async function markAllNotificationsReadAction() {
  const { supabase, user } = await ensureProfile();
  const { error } = await supabase
    .from("notification_events")
    .update({ read_at: new Date().toISOString() })
    .eq("member_id", user.id)
    .is("read_at", null);

  if (error) throw error;
  revalidatePath("/notifications");
}

export async function updateMemberAdminAction(formData: FormData) {
  const { supabase } = await assertSiteAdmin();
  const admin = createAdminClient();
  const memberId = String(formData.get("member_id") ?? "");
  const fullName = String(formData.get("full_name") ?? "").trim();
  const role = String(formData.get("role") ?? "member");
  const status = String(formData.get("status") ?? "active");
  const membershipType = String(formData.get("membership_type") ?? "community");
  const phone = String(formData.get("phone") ?? "").trim();
  const smsOptIn = String(formData.get("sms_opt_in") ?? "false") === "true";
  const duesOk = String(formData.get("dues_ok") ?? "false") === "true";
  const duesRenewalDateRaw = String(formData.get("dues_renewal_date") ?? "");
  const duesRenewalDate = duesRenewalDateRaw || null;
  const usrowingMembershipDateRaw = String(formData.get("usrowing_membership_date") ?? "");
  const usrowingMembershipDate = usrowingMembershipDateRaw || null;
  const safeSportDateRaw = String(formData.get("safesport_date") ?? "");
  const safeSportDate = safeSportDateRaw || null;
  const ownsPrivateBoat = String(formData.get("owns_private_boat") ?? "false") === "true";
  const boatStorageFeeOk = String(formData.get("boat_storage_fee_ok") ?? "false") === "true";
  const boatStorageFeeRenewalDateRaw = String(formData.get("boat_storage_fee_renewal_date") ?? "");
  const boatStorageFeeRenewalDate = ownsPrivateBoat ? boatStorageFeeRenewalDateRaw || null : null;
  const skillLevel = String(formData.get("skill_level") ?? "Beginner");
  const weightClass = String(formData.get("weight_class") ?? "Mid-weight");
  const trainingGroupRaw = String(formData.get("training_group") ?? "").trim();
  const trainingGroup = trainingGroupRaw === "beginner_intermediate" || trainingGroupRaw === "advanced" ? trainingGroupRaw : null;

  const { data: existingMember, error: existingMemberError } = await supabase
    .from("profiles")
    .select("full_name, email, phone, sms_opt_in, dues_ok, dues_renewal_date, usrowing_membership_date, safesport_date, owns_private_boat, boat_storage_fee_ok, boat_storage_fee_renewal_date")
    .eq("id", memberId)
    .single();
  if (existingMemberError) throw existingMemberError;

  const updatePayload = {
    full_name: fullName || existingMember.full_name,
    role,
    status,
    membership_type: membershipType,
    phone: phone || null,
    sms_opt_in: smsOptIn,
    sms_opt_in_at: smsOptIn && !existingMember.sms_opt_in ? new Date().toISOString() : smsOptIn ? undefined : null,
    dues_ok: duesOk,
    dues_renewal_date: duesRenewalDate,
    usrowing_membership_date: usrowingMembershipDate,
    safesport_date: safeSportDate,
    dues_last_paid_at: duesOk && !existingMember.dues_ok ? new Date().toISOString() : undefined,
    skill_level: skillLevel,
    weight_class: weightClass,
    owns_private_boat: ownsPrivateBoat,
    boat_storage_fee_ok: ownsPrivateBoat ? boatStorageFeeOk : false,
    boat_storage_fee_renewal_date: boatStorageFeeRenewalDate,
    boat_storage_fee_last_paid_at:
      ownsPrivateBoat && boatStorageFeeOk && !existingMember.boat_storage_fee_ok ? new Date().toISOString() : ownsPrivateBoat ? undefined : null,
    waiver_signed_at: duesOk ? new Date().toISOString() : null,
  };

  const { error } = await supabase
    .from("profiles")
    .update(updatePayload)
    .eq("id", memberId);

  if (error) throw error;

  if (fullName) {
    await admin.auth.admin.updateUserById(memberId, {
      user_metadata: {
        full_name: fullName,
      },
    });
  }

  if (trainingGroup) {
    const { error: signupError } = await admin.from("program_signups").upsert(
      {
        member_id: memberId,
        program_type: "coached_training",
        training_group: trainingGroup,
      },
      { onConflict: "member_id,program_type" },
    );
    if (signupError) throw signupError;
  } else {
    const { error: deleteError } = await admin
      .from("program_signups")
      .delete()
      .eq("member_id", memberId)
      .eq("program_type", "coached_training");
    if (deleteError) throw deleteError;
  }

  const paymentLines: string[] = [];
  if (duesOk && !existingMember.dues_ok) {
    paymentLines.push(formatCurrencyStatusLine("Annual dues", duesOk, duesRenewalDate));
  }
  if (ownsPrivateBoat && boatStorageFeeOk && !existingMember.boat_storage_fee_ok) {
    paymentLines.push(formatCurrencyStatusLine("Boat storage fee", boatStorageFeeOk, boatStorageFeeRenewalDate));
  }

  if (existingMember.email && paymentLines.length > 0) {
    try {
      await sendTransactionalEmail({
        to: existingMember.email,
        subject: "QCRC payment confirmation",
        text: `Hello ${existingMember.full_name},\n\nThe following payment status was confirmed by club admin:\n${paymentLines.join("\n")}\n\nThank you.\nQCRC`,
        html: `<p>Hello ${existingMember.full_name},</p><p>The following payment status was confirmed by club admin:</p><ul>${paymentLines
          .map((line) => `<li>${line}</li>`)
          .join("")}</ul><p>Thank you.<br/>QCRC</p>`,
      });
    } catch {
      // Payment updates should not fail because outbound email is unavailable.
    }
  }

  revalidatePath("/admin/members");
  redirect("/admin/members");
}

export async function addBoatAdminAction(formData: FormData) {
  const { supabase } = await assertAdmin();
  const name = String(formData.get("name") ?? "");
  const boatNumber = String(formData.get("boat_number") ?? "");
  const boatClassId = String(formData.get("boat_class_id") ?? "");
  const boatType = normalizeBoatBrand(String(formData.get("boat_type") ?? ""));
  const photoUrl = String(formData.get("photo_url") ?? "");
  const requiredSkillLevel = String(formData.get("required_skill_level") ?? "Beginner");
  const weightClass = String(formData.get("weight_class") ?? "");
  const requiredClearance = skillLevelToClearance(requiredSkillLevel);
  const status = String(formData.get("status") ?? "available");
  const riggingNotes = String(formData.get("rigging_notes") ?? "");

  const { error } = await supabase.from("boats").insert({
    name,
    boat_number: boatNumber || null,
    boat_class_id: boatClassId,
    boat_type: boatType,
    photo_url: photoUrl || null,
    required_skill_level: requiredSkillLevel,
    weight_class: weightClass || null,
    required_clearance: requiredClearance,
    status,
    rigging_notes: riggingNotes || null,
  });

  if (error) throw error;
  revalidatePath("/admin/boats");
  revalidatePath("/boats");
  revalidatePath("/reserve");
}

export async function importBoatsCsvAdminAction(formData: FormData) {
  const { supabase } = await assertAdmin();
  const fileEntry = formData.get("file");
  const file = typeof File !== "undefined" && fileEntry instanceof File && fileEntry.size > 0 ? fileEntry : null;

  if (!file) {
    redirect("/admin/boats?import_status=error&import_message=Please%20choose%20a%20CSV%20file.");
  }

  const text = await file.text();
  const records = csvRowsToObjects(text);
  if (records.length === 0) {
    redirect("/admin/boats?import_status=error&import_message=The%20CSV%20file%20did%20not%20contain%20any%20rows.");
  }

  const boatNames = [...new Set(records.map((record) => (record.name ?? "").trim()).filter(Boolean))];
  const { data: existingBoats, error: existingBoatsError } = await supabase
    .from("boats")
    .select("id, name")
    .in("name", boatNames);
  if (existingBoatsError) throw existingBoatsError;

  const existingByName = new Map((existingBoats ?? []).map((boat) => [boat.name, boat.id]));
  let imported = 0;
  let updated = 0;
  let created = 0;
  const errors: string[] = [];

  for (const record of records) {
    const name = (record.name ?? "").trim();
    if (!name) {
      errors.push("Skipped a row with no boat name.");
      continue;
    }

    const requiredSkillLevel = (record.required_skill_level ?? "").trim() || "Beginner";
    const payload = {
      name,
      boat_number: (record.boat_number ?? "").trim() || null,
      boat_class_id: normalizeBoatClassId(record.boat_class_id),
      boat_type: normalizeBoatBrand(record.boat_type),
      photo_url: (record.photo_url ?? "").trim() || null,
      required_skill_level: requiredSkillLevel,
      weight_class: (record.weight_class ?? "").trim() || null,
      required_clearance: skillLevelToClearance(requiredSkillLevel),
      status: normalizeBoatStatus(record.status),
      rigging_notes: (record.rigging_notes ?? "").trim() || null,
    };

    const existingBoatId = existingByName.get(name);
    const result = existingBoatId
      ? await supabase.from("boats").update(payload).eq("id", existingBoatId)
      : await supabase.from("boats").insert(payload);

    if (result.error) {
      errors.push(`Could not import ${name}: ${result.error.message}`);
      continue;
    }

    imported += 1;
    if (existingBoatId) {
      updated += 1;
    } else {
      created += 1;
    }
  }

  revalidatePath("/admin/boats");
  revalidatePath("/boats");
  revalidatePath("/reserve");
  const message = `${imported} boat row(s) imported. ${created} created. ${updated} updated.${errors.length > 0 ? ` ${errors.length} issue(s): ${errors.slice(0, 3).join(" | ")}` : ""}`;
  redirect(`/admin/boats?import_status=${errors.length > 0 ? "error" : "success"}&import_message=${encodeURIComponent(message)}`);
}

export async function updateBoatAdminAction(formData: FormData) {
  const { supabase } = await assertAdmin();
  const boatId = String(formData.get("boat_id") ?? "");
  const name = String(formData.get("name") ?? "");
  const boatNumber = String(formData.get("boat_number") ?? "");
  const boatClassId = String(formData.get("boat_class_id") ?? "");
  const boatType = normalizeBoatBrand(String(formData.get("boat_type") ?? ""));
  const photoUrl = String(formData.get("photo_url") ?? "");
  const requiredSkillLevel = String(formData.get("required_skill_level") ?? "Beginner");
  const weightClass = String(formData.get("weight_class") ?? "");
  const requiredClearance = skillLevelToClearance(requiredSkillLevel);
  const status = String(formData.get("status") ?? "available");
  const riggingNotes = String(formData.get("rigging_notes") ?? "");

  const { error } = await supabase
    .from("boats")
    .update({
      name,
      boat_number: boatNumber || null,
      boat_class_id: boatClassId,
      boat_type: boatType,
      photo_url: photoUrl || null,
      required_skill_level: requiredSkillLevel,
      weight_class: weightClass || null,
      required_clearance: requiredClearance,
      status,
      rigging_notes: riggingNotes || null,
    })
    .eq("id", boatId);

  if (error) throw error;
  revalidatePath("/admin/boats");
  revalidatePath("/boats");
  revalidatePath("/reserve");
}

export async function deleteBoatAdminAction(formData: FormData) {
  const { supabase } = await assertAdmin();
  const boatId = String(formData.get("boat_id") ?? "");
  const destination = new URL("/admin/boats", "http://local");

  const { error } = await supabase.from("boats").delete().eq("id", boatId);
  if (error) {
    destination.searchParams.set("boat_status", "error");
    destination.searchParams.set(
      "boat_message",
      error.message.includes("violates foreign key")
        ? "This boat has reservation or damage history and cannot be deleted. Mark it unavailable instead."
        : error.message || "Unable to delete boat.",
    );
    redirect(`${destination.pathname}?${destination.searchParams.toString()}`);
  }

  revalidatePath("/admin/boats");
  revalidatePath("/boats");
  revalidatePath("/reserve");
  destination.searchParams.set("boat_status", "success");
  destination.searchParams.set("boat_message", "Boat removed from the roster.");
  redirect(`${destination.pathname}?${destination.searchParams.toString()}`);
}

export async function updateBoatStatusAdminAction(formData: FormData) {
  const { supabase } = await assertAdmin();
  const boatId = String(formData.get("boat_id") ?? "");
  const status = String(formData.get("status") ?? "available");

  const { error } = await supabase.from("boats").update({ status }).eq("id", boatId);
  if (error) throw error;

  revalidatePath("/admin/boats");
  revalidatePath("/boats");
  revalidatePath("/reserve");
}

export async function addTeamAnnouncementAction(formData: FormData) {
  const { supabase, user } = await assertSiteAdmin();
  const title = String(formData.get("title") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();
  const startsAt = String(formData.get("starts_at") ?? "").trim();
  const endsAt = String(formData.get("ends_at") ?? "").trim();
  const destination = new URL("/", "http://local");

  if (!title || !body) {
    destination.searchParams.set("announcement_status", "error");
    destination.searchParams.set("announcement_message", "Announcement title and message are required.");
    redirect(`${destination.pathname}?${destination.searchParams.toString()}`);
  }

  const { error } = await supabase.from("team_announcements").insert({
    title,
    body,
    starts_at: startsAt ? easternLocalInputToIso(startsAt) : null,
    ends_at: endsAt ? easternLocalInputToIso(endsAt) : null,
    is_published: true,
    created_by: user.id,
  });

  if (error) {
    destination.searchParams.set("announcement_status", "error");
    destination.searchParams.set("announcement_message", error.message || "Unable to post announcement.");
    redirect(`${destination.pathname}?${destination.searchParams.toString()}`);
  }

  revalidatePath("/");
  destination.searchParams.set("announcement_status", "success");
  destination.searchParams.set("announcement_message", "Announcement posted.");
  redirect(`${destination.pathname}?${destination.searchParams.toString()}`);
}

export async function deleteTeamAnnouncementAction(formData: FormData) {
  const { supabase } = await assertSiteAdmin();
  const announcementId = String(formData.get("announcement_id") ?? "");
  const destination = new URL("/", "http://local");

  const { error } = await supabase.from("team_announcements").delete().eq("id", announcementId);
  if (error) {
    destination.searchParams.set("announcement_status", "error");
    destination.searchParams.set("announcement_message", error.message || "Unable to remove announcement.");
    redirect(`${destination.pathname}?${destination.searchParams.toString()}`);
  }

  revalidatePath("/");
  destination.searchParams.set("announcement_status", "success");
  destination.searchParams.set("announcement_message", "Announcement removed.");
  redirect(`${destination.pathname}?${destination.searchParams.toString()}`);
}

export async function updateClearanceAdminAction(formData: FormData) {
  const { supabase, user } = await assertAdmin();
  const memberId = String(formData.get("member_id") ?? "");
  const boatClassId = String(formData.get("boat_class_id") ?? "");
  const clearanceLevel = clearanceValueFromForm(formData.get("clearance_level"));

  const { error } = await supabase.from("member_clearances").upsert(
    {
      member_id: memberId,
      boat_class_id: boatClassId,
      clearance_level: clearanceLevel,
      approved_by: user.id,
      approved_at: new Date().toISOString(),
    },
    { onConflict: "member_id,boat_class_id" },
  );

  if (error) throw error;
  revalidatePath("/admin/clearances");
  revalidatePath("/reserve");
}

export async function triageDamageAdminAction(formData: FormData) {
  const { supabase } = await assertAdmin();
  const damageReportId = String(formData.get("damage_report_id") ?? "");
  const status = String(formData.get("status") ?? "triaged");
  const resolutionNotes = String(formData.get("resolution_notes") ?? "");
  const unlockBoat = String(formData.get("unlock_boat") ?? "false") === "true";
  const laborCostRaw = String(formData.get("labor_cost") ?? "");
  const partsCostRaw = String(formData.get("parts_cost") ?? "");

  const { error } = await supabase.rpc("triage_damage_report", {
    p_damage_report_id: damageReportId,
    p_status: status,
    p_resolution_notes: resolutionNotes || null,
    p_unlock_boat: unlockBoat,
    p_labor_cost: laborCostRaw ? Number(laborCostRaw) : null,
    p_parts_cost: partsCostRaw ? Number(partsCostRaw) : null,
  });

  if (error) throw error;
  revalidatePath("/admin/damage");
  revalidatePath("/admin/analytics");
  revalidatePath("/boats");
  revalidatePath("/reserve");
}

export async function addBoatAvailabilityBlockAdminAction(formData: FormData) {
  const { supabase, user } = await assertAdmin();
  const title = String(formData.get("title") ?? "");
  const startsAt = String(formData.get("starts_at") ?? "");
  const endsAt = String(formData.get("ends_at") ?? "");
  const membershipType = String(formData.get("applies_to_membership_type") ?? "");
  const boatClassId = String(formData.get("applies_to_boat_class_id") ?? "");
  const isActive = String(formData.get("is_active") ?? "true") === "true";
  const notes = String(formData.get("notes") ?? "");

  const startsAtIso = easternLocalInputToIso(startsAt);
  const endsAtIso = easternLocalInputToIso(endsAt);

  const { error } = await supabase.from("boat_availability_blocks").insert({
    title,
    starts_at: startsAtIso,
    ends_at: endsAtIso,
    applies_to_membership_type: membershipType || null,
    applies_to_boat_class_id: boatClassId || null,
    is_active: isActive,
    notes: notes || null,
    created_by: user.id,
  });

  if (error) throw error;
  revalidatePath("/admin/availability");
  revalidatePath("/reserve");
}

export async function addRecurringBoatAvailabilityBlocksAdminAction(formData: FormData) {
  const { supabase, user } = await assertAdmin();
  const title = String(formData.get("title") ?? "").trim();
  const startDate = String(formData.get("start_date") ?? "");
  const endDate = String(formData.get("end_date") ?? "");
  const dailyStartTime = String(formData.get("daily_start_time") ?? "");
  const dailyEndTime = String(formData.get("daily_end_time") ?? "");
  const membershipType = String(formData.get("applies_to_membership_type") ?? "");
  const boatClassId = String(formData.get("applies_to_boat_class_id") ?? "");
  const isActive = String(formData.get("is_active") ?? "true") === "true";
  const notes = String(formData.get("notes") ?? "");
  const weekdays = formData
    .getAll("weekdays")
    .map((value) => weekdayNumberFromCode(String(value)))
    .filter((value): value is WeekdayNumber => value !== null);

  if (!title || !startDate || !endDate || !dailyStartTime || !dailyEndTime || weekdays.length === 0) {
    throw new Error("Recurring availability requires a title, date range, daily time window, and at least one weekday.");
  }

  const start = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T00:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) {
    throw new Error("Recurring availability date range is invalid.");
  }

  const inserts: Array<{
    title: string;
    starts_at: string | null;
    ends_at: string | null;
    applies_to_membership_type: string | null;
    applies_to_boat_class_id: string | null;
    is_active: boolean;
    notes: string | null;
    created_by: string;
  }> = [];

  for (const cursor = new Date(start); cursor <= end; cursor.setDate(cursor.getDate() + 1)) {
    const dayOfWeek = cursor.getDay() as WeekdayNumber;
    if (!weekdays.includes(dayOfWeek)) continue;

    const year = cursor.getFullYear();
    const month = String(cursor.getMonth() + 1).padStart(2, "0");
    const day = String(cursor.getDate()).padStart(2, "0");
    const datePart = `${year}-${month}-${day}`;

    inserts.push({
      title,
      starts_at: easternLocalInputToIso(`${datePart}T${dailyStartTime}`),
      ends_at: easternLocalInputToIso(`${datePart}T${dailyEndTime}`),
      applies_to_membership_type: membershipType || null,
      applies_to_boat_class_id: boatClassId || null,
      is_active: isActive,
      notes: notes || null,
      created_by: user.id,
    });
  }

  if (inserts.length === 0) {
    throw new Error("No dates matched the selected weekday pattern.");
  }

  const { error } = await supabase.from("boat_availability_blocks").insert(inserts);
  if (error) throw error;

  revalidatePath("/admin/availability");
  revalidatePath("/reserve");
}

export async function updateBoatAvailabilityBlockAdminAction(formData: FormData) {
  const { supabase } = await assertAdmin();
  const blockId = String(formData.get("block_id") ?? "");
  const title = String(formData.get("title") ?? "");
  const startsAt = String(formData.get("starts_at") ?? "");
  const endsAt = String(formData.get("ends_at") ?? "");
  const membershipType = String(formData.get("applies_to_membership_type") ?? "");
  const boatClassId = String(formData.get("applies_to_boat_class_id") ?? "");
  const isActive = String(formData.get("is_active") ?? "false") === "true";
  const notes = String(formData.get("notes") ?? "");

  const startsAtIso = easternLocalInputToIso(startsAt);
  const endsAtIso = easternLocalInputToIso(endsAt);

  const { error } = await supabase
    .from("boat_availability_blocks")
    .update({
      title,
      starts_at: startsAtIso,
      ends_at: endsAtIso,
      applies_to_membership_type: membershipType || null,
      applies_to_boat_class_id: boatClassId || null,
      is_active: isActive,
      notes: notes || null,
    })
    .eq("id", blockId);

  if (error) throw error;
  revalidatePath("/admin/availability");
  revalidatePath("/reserve");
}

export async function saveProgramSignupAction(formData: FormData) {
  const { supabase, user } = await ensureProfile();
  const programType = String(formData.get("program_type") ?? "");
  const trainingGroup = String(formData.get("training_group") ?? "");
  const signedUp = String(formData.get("signed_up") ?? "true") === "true";

  if (!signedUp) {
    const { error } = await supabase
      .from("program_signups")
      .delete()
      .eq("member_id", user.id)
      .eq("program_type", programType);
    if (error) throw error;
  } else {
    const { error } = await supabase.from("program_signups").upsert(
      {
        member_id: user.id,
        program_type: programType,
        training_group: trainingGroup || null,
      },
      { onConflict: "member_id,program_type" },
    );
    if (error) throw error;
  }

  revalidatePath("/programs");
  revalidatePath("/admin/lineups");
}

export async function saveRowingMeetupMembershipAction(formData: FormData) {
  const { supabase, user } = await ensureProfile();
  const joined = String(formData.get("joined") ?? "true") === "true";
  const skillLevel = String(formData.get("skill_level") ?? "Beginner");
  const wants1x = String(formData.get("wants_1x") ?? "false") === "true";
  const wants2x = String(formData.get("wants_2x") ?? "false") === "true";
  const wants4x = String(formData.get("wants_4x") ?? "false") === "true";
  const notes = String(formData.get("notes") ?? "").trim();

  const { data: existingMembership, error: existingError } = await supabase
    .from("rowing_meetup_members")
    .select("member_id")
    .eq("member_id", user.id)
    .maybeSingle();
  if (existingError) throw existingError;

  if (!joined) {
    const { error: deleteError } = await supabase.from("rowing_meetup_members").delete().eq("member_id", user.id);
    if (deleteError) throw deleteError;
  } else {
    const { error } = await supabase.from("rowing_meetup_members").upsert(
      {
        member_id: user.id,
        skill_level: skillLevel,
        wants_1x: wants1x,
        wants_2x: wants2x,
        wants_4x: wants4x,
        notes: notes || null,
      },
      { onConflict: "member_id" },
    );
    if (error) throw error;

    if (!existingMembership) {
      const { data: profileRow, error: profileError } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("id", user.id)
        .single();
      if (profileError) throw profileError;

      const { data: memberRows, error: memberRowsError } = await supabase
        .from("rowing_meetup_members")
        .select("member_id")
        .neq("member_id", user.id);
      if (memberRowsError) throw memberRowsError;

      const recipientIds = [...new Set((memberRows ?? []).map((row) => row.member_id))];
      if (recipientIds.length > 0) {
        const notifications = recipientIds.map((memberId) => ({
          notification_key: `rowing-meetup-join:${user.id}:${memberId}`,
          notification_type: "rowing_meetup_signup",
          member_id: memberId,
          payload: {
            member_name: profileRow.full_name ?? user.email ?? "A new rower",
          },
        }));
        const { error: notificationError } = await supabase
          .from("notification_events")
          .upsert(notifications, { onConflict: "notification_key" });
        if (notificationError) throw notificationError;
      }
    }
  }

  revalidatePath("/programs");
  revalidatePath("/programs/meetup");
  revalidatePath("/notifications");
  redirect("/programs/meetup");
}

export async function addRowingMeetupAvailabilityAction(formData: FormData) {
  const { supabase, user } = await ensureProfile();
  const weekday = Number(formData.get("weekday") ?? -1);
  const startTime = resolveMeetupTime(formData, "start_time", "start_time_preset");
  const endTime = resolveMeetupTime(formData, "end_time", "end_time_preset");

  const { data: membership, error: membershipError } = await supabase
    .from("rowing_meetup_members")
    .select("member_id")
    .eq("member_id", user.id)
    .maybeSingle();
  if (membershipError) throw membershipError;
  if (!membership) {
    throw new Error("Join Rowing Meetup before adding availability.");
  }

  const { error } = await supabase.from("rowing_meetup_availability").insert({
    member_id: user.id,
    weekday,
    start_time: startTime,
    end_time: endTime,
  });
  if (error) throw error;

  revalidatePath("/programs/meetup");
}

export async function removeRowingMeetupAvailabilityAction(formData: FormData) {
  const { supabase, user } = await ensureProfile();
  const slotId = String(formData.get("slot_id") ?? "");

  const { error } = await supabase
    .from("rowing_meetup_availability")
    .delete()
    .eq("id", slotId)
    .eq("member_id", user.id);
  if (error) throw error;

  revalidatePath("/programs/meetup");
}

export async function addRaceEventAdminAction(formData: FormData) {
  const { supabase, user } = await assertAdmin();
  const title = String(formData.get("title") ?? "");
  const eventDate = String(formData.get("event_date") ?? "");
  const location = String(formData.get("location") ?? "");
  const notes = String(formData.get("notes") ?? "");

  const { error } = await supabase.from("race_events").insert({
    title,
    event_date: eventDate,
    location: location || null,
    notes: notes || null,
    created_by: user.id,
  });
  if (error) throw error;

  revalidatePath("/programs/racing");
  revalidatePath("/admin/races");
}

export async function saveRaceSignupAction(formData: FormData) {
  const { supabase, user } = await ensureProfile();
  const raceEventId = String(formData.get("race_event_id") ?? "");
  const attending = String(formData.get("attending") ?? "true") === "true";
  const birthdate = String(formData.get("birthdate") ?? "");
  const desiredRaceCount = Number(formData.get("desired_race_count") ?? 1);
  const wants1x = String(formData.get("wants_1x") ?? "false") === "true";
  const wants2x = String(formData.get("wants_2x") ?? "false") === "true";
  const wants4x = String(formData.get("wants_4x") ?? "false") === "true";
  const wants8x = String(formData.get("wants_8x") ?? "false") === "true";
  const comments = String(formData.get("comments") ?? "").trim();

  if (!attending) {
    const { error } = await supabase
      .from("race_signups")
      .delete()
      .eq("race_event_id", raceEventId)
      .eq("member_id", user.id);
    if (error) throw error;
  } else {
    const { error } = await supabase.from("race_signups").upsert(
      {
        race_event_id: raceEventId,
        member_id: user.id,
        birthdate,
        desired_race_count: desiredRaceCount,
        wants_1x: wants1x,
        wants_2x: wants2x,
        wants_4x: wants4x,
        wants_8x: wants8x,
        comments: comments || null,
      },
      { onConflict: "race_event_id,member_id" },
    );
    if (error) throw error;
  }

  revalidatePath("/programs/racing");
  revalidatePath("/admin/races");
  revalidatePath("/admin/lineups");
}

export async function createLineupBoardAdminAction(formData: FormData) {
  const { supabase, user } = await assertAdmin();
  const boardType = String(formData.get("board_type") ?? "");
  const raceEventId = String(formData.get("race_event_id") ?? "");
  const sessionId = String(formData.get("session_id") ?? "");
  const title = String(formData.get("title") ?? "");
  const returnTo = String(formData.get("return_to") ?? "");

  const payload = {
    board_type: boardType,
    race_event_id: raceEventId || null,
    session_id: sessionId || null,
    title,
    created_by: user.id,
  };

  const { error } = await supabase.from("lineup_boards").insert(payload);
  if (error) throw error;

  revalidatePath("/admin/lineups");
  revalidatePath("/admin/races");
  if (returnTo) redirect(returnTo);
}

function seatCountFromClass(boatClassId: string) {
  if (boatClassId === "2x") return 2;
  if (boatClassId === "4x") return 4;
  return 1;
}

export async function addLineupBoatAdminAction(formData: FormData) {
  const { supabase } = await assertAdmin();
  const lineupBoardId = String(formData.get("lineup_board_id") ?? "");
  const boatName = String(formData.get("boat_name") ?? "");
  const boatClassId = String(formData.get("boat_class_id") ?? "4x");
  const returnTo = String(formData.get("return_to") ?? "");

  const { data: existingBoats, error: existingError } = await supabase
    .from("lineup_boats")
    .select("sort_order")
    .eq("lineup_board_id", lineupBoardId)
    .order("sort_order", { ascending: false })
    .limit(1);
  if (existingError) throw existingError;
  const nextSortOrder = (existingBoats?.[0]?.sort_order ?? 0) + 1;

  const { data, error } = await supabase
    .from("lineup_boats")
    .insert({
      lineup_board_id: lineupBoardId,
      boat_name: boatName,
      boat_class_id: boatClassId,
      sort_order: nextSortOrder,
    })
    .select("id")
    .single();
  if (error) throw error;

  const seatCount = seatCountFromClass(boatClassId);
  const seatRows = Array.from({ length: seatCount }, (_, idx) => ({
    lineup_boat_id: data.id,
    seat_number: idx + 1,
    member_id: null as string | null,
  }));

  const { error: seatError } = await supabase.from("lineup_seats").insert(seatRows);
  if (seatError) throw seatError;

  revalidatePath("/admin/lineups");
  revalidatePath("/admin/races");
  if (returnTo) redirect(returnTo);
}

export async function saveLineupAssignmentsAdminAction(formData: FormData) {
  const { supabase } = await assertAdmin();
  const assignmentJson = String(formData.get("assignments_json") ?? "[]");
  const returnTo = String(formData.get("return_to") ?? "");
  const assignments = JSON.parse(assignmentJson) as { seatId: string; memberId: string | null }[];

  for (const item of assignments) {
    const { error } = await supabase
      .from("lineup_seats")
      .update({ member_id: item.memberId })
      .eq("id", item.seatId);
    if (error) throw error;
  }

  revalidatePath("/admin/lineups");
  revalidatePath("/admin/races");
  revalidatePath("/lineups");
  if (returnTo) redirect(returnTo);
}

export async function publishLineupBoardAdminAction(formData: FormData) {
  const { supabase } = await assertAdmin();
  const lineupBoardId = String(formData.get("lineup_board_id") ?? "");
  const publish = String(formData.get("publish") ?? "true") === "true";
  const returnTo = String(formData.get("return_to") ?? "");

  const { error } = await supabase
    .from("lineup_boards")
    .update({
      is_published: publish,
      published_at: publish ? new Date().toISOString() : null,
    })
    .eq("id", lineupBoardId);
  if (error) throw error;

  if (publish) {
    const { data: boardDetail, error: boardDetailError } = await supabase
      .from("lineup_boards")
      .select("title, board_type, race_event_id, session_id")
      .eq("id", lineupBoardId)
      .single();
    if (boardDetailError) throw boardDetailError;

    let recipientIds: string[] = [];
    if (boardDetail.session_id) {
      const { data: signups, error: signupsError } = await supabase
        .from("session_signups")
        .select("member_id")
        .eq("session_id", boardDetail.session_id);
      if (signupsError) throw signupsError;
      recipientIds = [...new Set((signups ?? []).map((row) => row.member_id))];
    } else if (boardDetail.race_event_id) {
      const { data: signups, error: signupsError } = await supabase
        .from("race_signups")
        .select("member_id")
        .eq("race_event_id", boardDetail.race_event_id);
      if (signupsError) throw signupsError;
      recipientIds = [...new Set((signups ?? []).map((row) => row.member_id))];
    }

    if (recipientIds.length > 0) {
      const notifications = recipientIds.map((memberId) => ({
        notification_key: `lineup-published:${lineupBoardId}:${memberId}`,
        notification_type: "lineup_published",
        member_id: memberId,
        payload: {
          title: boardDetail.title,
          lineup_board_id: lineupBoardId,
        },
      }));
      const { error: notificationError } = await supabase
        .from("notification_events")
        .upsert(notifications, { onConflict: "notification_key" });
      if (notificationError) throw notificationError;

      const { data: recipients, error: recipientError } = await supabase
        .from("profiles")
        .select("phone, sms_opt_in")
        .in("id", recipientIds)
        .eq("sms_opt_in", true);
      if (recipientError) throw recipientError;

      const phones = (recipients ?? []).map((row) => row.phone).filter(Boolean) as string[];
      if (phones.length > 0) {
        try {
          await sendSms({
            to: phones,
            body: `QCRC alert: lineup published for ${boardDetail.title}. Open the app to view your boat and seat order.`,
          });
        } catch {
          // Keep lineup publishing successful even if SMS delivery fails.
        }
      }
    }
  }

  revalidatePath("/admin/lineups");
  revalidatePath("/admin/races");
  revalidatePath("/lineups");
  revalidatePath("/notifications");
  if (returnTo) redirect(returnTo);
}

export async function updateLineupBoatRaceTimeAdminAction(formData: FormData) {
  const { supabase } = await assertAdmin();
  const lineupBoatId = String(formData.get("lineup_boat_id") ?? "");
  const raceTime = String(formData.get("race_time") ?? "");
  const returnTo = String(formData.get("return_to") ?? "");
  const raceTimeIso = easternLocalInputToIso(raceTime);

  const { error } = await supabase
    .from("lineup_boats")
    .update({ race_time: raceTimeIso })
    .eq("id", lineupBoatId);
  if (error) throw error;

  revalidatePath("/admin/races");
  revalidatePath("/admin/lineups");
  revalidatePath("/lineups");
  if (returnTo) redirect(returnTo);
}

export async function removeLineupBoatAdminAction(formData: FormData) {
  const { supabase } = await assertAdmin();
  const lineupBoatId = String(formData.get("lineup_boat_id") ?? "");
  const returnTo = String(formData.get("return_to") ?? "");

  const { error } = await supabase.from("lineup_boats").delete().eq("id", lineupBoatId);
  if (error) throw error;

  revalidatePath("/admin/races");
  revalidatePath("/admin/lineups");
  revalidatePath("/lineups");
  if (returnTo) redirect(returnTo);
}

export async function toggleSessionSignupAction(formData: FormData) {
  const { supabase, user } = await ensureProfile();
  const sessionId = String(formData.get("session_id") ?? "");
  const signedUp = String(formData.get("signed_up") ?? "true") === "true";
  const { data: session, error: sessionError } = await supabase
    .from("sessions")
    .select("session_type")
    .eq("id", sessionId)
    .single();
  if (sessionError) throw sessionError;

  if (session.session_type === "coached_training_beginner_intermediate" || session.session_type === "coached_training_advanced") {
    const requiredGroup =
      session.session_type === "coached_training_beginner_intermediate" ? "beginner_intermediate" : "advanced";
    const { data: assignment, error: assignmentError } = await supabase
      .from("program_signups")
      .select("training_group")
      .eq("member_id", user.id)
      .eq("program_type", "coached_training")
      .maybeSingle();
    if (assignmentError) throw assignmentError;
    if (assignment?.training_group !== requiredGroup) {
      throw new Error("You are not assigned to this coached training group.");
    }
  }

  if (signedUp) {
    const { error } = await supabase.from("session_signups").upsert(
      {
        session_id: sessionId,
        member_id: user.id,
      },
      { onConflict: "session_id,member_id" },
    );
    if (error) throw error;
  } else {
    const { error } = await supabase
      .from("session_signups")
      .delete()
      .eq("session_id", sessionId)
      .eq("member_id", user.id);
    if (error) throw error;
  }

  revalidatePath("/programs/saturday");
  revalidatePath("/programs/training");
  revalidatePath("/programs/training/beginner-intermediate");
  revalidatePath("/programs/training/advanced");
  revalidatePath("/admin/programs");
  revalidatePath("/admin/programs/saturday");
  revalidatePath("/admin/programs/training-beginner-intermediate");
  revalidatePath("/admin/programs/training-advanced");
}

export async function cancelSessionAdminAction(formData: FormData) {
  const { supabase } = await assertAdmin();
  const sessionId = String(formData.get("session_id") ?? "");
  const isCancelled = String(formData.get("is_cancelled") ?? "true") === "true";
  const cancelledReason = String(formData.get("cancelled_reason") ?? "");

  const { data: sessionRow, error: sessionLoadError } = await supabase
    .from("sessions")
    .select("title, starts_at")
    .eq("id", sessionId)
    .single();
  if (sessionLoadError) throw sessionLoadError;

  const { error } = await supabase
    .from("sessions")
    .update({
      is_cancelled: isCancelled,
      cancelled_reason: isCancelled ? cancelledReason || "Cancelled by coach/admin" : null,
    })
    .eq("id", sessionId);
  if (error) throw error;

  if (isCancelled) {
    const { data: signups, error: signupsError } = await supabase
      .from("session_signups")
      .select("member_id")
      .eq("session_id", sessionId);
    if (signupsError) throw signupsError;

    const recipientIds = [...new Set((signups ?? []).map((row) => row.member_id))];
    if (recipientIds.length > 0) {
      const notifications = recipientIds.map((memberId) => ({
        notification_key: `session-cancelled:${sessionId}:${memberId}:${sessionRow.starts_at}`,
        notification_type: "session_cancelled",
        member_id: memberId,
        payload: {
          title: sessionRow.title,
          starts_at: sessionRow.starts_at,
          cancelled_reason: cancelledReason || "Cancelled by coach/admin",
        },
      }));
      const { error: notificationError } = await supabase
        .from("notification_events")
        .upsert(notifications, { onConflict: "notification_key" });
      if (notificationError) throw notificationError;

      const { data: recipients, error: recipientError } = await supabase
        .from("profiles")
        .select("phone, sms_opt_in")
        .in("id", recipientIds)
        .eq("sms_opt_in", true);
      if (recipientError) throw recipientError;

      const phones = (recipients ?? []).map((row) => row.phone).filter(Boolean) as string[];
      if (phones.length > 0) {
        try {
          await sendSms({
            to: phones,
            body: `QCRC alert: ${sessionRow.title} has been cancelled. Reason: ${cancelledReason || "Cancelled by coach/admin"}.`,
          });
        } catch {
          // Keep cancellation successful even if SMS delivery fails.
        }
      }
    }
  }

  revalidatePath("/programs/saturday");
  revalidatePath("/programs/training");
  revalidatePath("/programs/training/beginner-intermediate");
  revalidatePath("/programs/training/advanced");
  revalidatePath("/admin/programs");
  revalidatePath("/admin/programs/saturday");
  revalidatePath("/admin/programs/training-beginner-intermediate");
  revalidatePath("/admin/programs/training-advanced");
  revalidatePath("/notifications");
}

function monthWindowFromInput(monthInput: string) {
  const fallback = new Date();
  const [yearRaw, monthRaw] = monthInput.split("-");
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  const safeYear = Number.isFinite(year) && year > 2000 ? year : fallback.getFullYear();
  const safeMonthIndex = Number.isFinite(month) && month >= 1 && month <= 12 ? month - 1 : fallback.getMonth();
  const start = new Date(Date.UTC(safeYear, safeMonthIndex, 1, 0, 0, 0));
  const end = new Date(Date.UTC(safeYear, safeMonthIndex + 1, 1, 0, 0, 0));
  return { start, end };
}

export async function generateProgramSessionsMonthAction(formData: FormData) {
  const { supabase, user } = await assertAdmin();
  const monthInput = String(formData.get("month") ?? "");
  const programScope = String(formData.get("program_scope") ?? "all");
  const { start, end } = monthWindowFromInput(monthInput);

  const scopedTypes =
    programScope === "saturday"
      ? ["saturday_coached_row"]
      : programScope === "training_bi"
        ? ["coached_training_beginner_intermediate"]
        : programScope === "training_advanced"
          ? ["coached_training_advanced"]
          : ["saturday_coached_row", "coached_training_beginner_intermediate", "coached_training_advanced"];

  const { data: existing, error: existingError } = await supabase
    .from("sessions")
    .select("session_type, starts_at")
    .in("session_type", scopedTypes)
    .gte("starts_at", start.toISOString())
    .lt("starts_at", end.toISOString());
  if (existingError) throw existingError;

  const existingKeys = new Set((existing ?? []).map((s) => `${s.session_type}|${new Date(s.starts_at).toISOString()}`));
  const rows: Array<{
    title: string;
    session_type: string;
    starts_at: string;
    ends_at: string;
    created_by: string;
    is_cancelled: boolean;
  }> = [];

  const year = start.getUTCFullYear();
  const monthIndex = start.getUTCMonth();
  const daysInMonth = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();

  for (let day = 1; day <= daysInMonth; day += 1) {
    const date = new Date(Date.UTC(year, monthIndex, day));
    const dayOfWeek = date.getUTCDay();

    if (scopedTypes.includes("saturday_coached_row") && dayOfWeek === 6) {
      const startsAt = easternLocalInputToIso(
        `${year}-${String(monthIndex + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}T08:30`,
      ) as string;
      const key = `saturday_coached_row|${new Date(startsAt).toISOString()}`;
      if (!existingKeys.has(key)) {
        rows.push({
          title: "Saturday Coached Row",
          session_type: "saturday_coached_row",
          starts_at: startsAt,
          ends_at: easternLocalInputToIso(
            `${year}-${String(monthIndex + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}T10:00`,
          ) as string,
          created_by: user.id,
          is_cancelled: false,
        });
      }
    }

    if (scopedTypes.includes("coached_training_beginner_intermediate") && (dayOfWeek === 1 || dayOfWeek === 4)) {
      const startsAt = easternLocalInputToIso(
        `${year}-${String(monthIndex + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}T17:30`,
      ) as string;
      const key = `coached_training_beginner_intermediate|${new Date(startsAt).toISOString()}`;
      if (!existingKeys.has(key)) {
        rows.push({
          title: "Coached Training (Beginner/Intermediate)",
          session_type: "coached_training_beginner_intermediate",
          starts_at: startsAt,
          ends_at: easternLocalInputToIso(
            `${year}-${String(monthIndex + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}T18:30`,
          ) as string,
          created_by: user.id,
          is_cancelled: false,
        });
      }
    }

    if (scopedTypes.includes("coached_training_advanced") && (dayOfWeek === 2 || dayOfWeek === 4)) {
      const startsAt = easternLocalInputToIso(
        `${year}-${String(monthIndex + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}T06:30`,
      ) as string;
      const key = `coached_training_advanced|${new Date(startsAt).toISOString()}`;
      if (!existingKeys.has(key)) {
        rows.push({
          title: "Coached Training (Advanced)",
          session_type: "coached_training_advanced",
          starts_at: startsAt,
          ends_at: easternLocalInputToIso(
            `${year}-${String(monthIndex + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}T07:30`,
          ) as string,
          created_by: user.id,
          is_cancelled: false,
        });
      }
    }
  }

  if (rows.length > 0) {
    const { error } = await supabase.from("sessions").insert(rows);
    if (error) throw error;
  }

  revalidatePath("/programs/saturday");
  revalidatePath("/programs/training");
  revalidatePath("/programs/training/beginner-intermediate");
  revalidatePath("/programs/training/advanced");
  revalidatePath("/admin/programs");
  revalidatePath("/admin/programs/saturday");
  revalidatePath("/admin/programs/training-beginner-intermediate");
  revalidatePath("/admin/programs/training-advanced");
}

function defaultSessionTimesByType(sessionType: string) {
  if (sessionType === "saturday_coached_row") {
    return { start: "08:30", end: "10:00" };
  }
  if (sessionType === "coached_training_beginner_intermediate") {
    return { start: "17:30", end: "18:30" };
  }
  return { start: "06:30", end: "07:30" };
}

export async function resetProgramMonthToDefaultTimesAction(formData: FormData) {
  const { supabase } = await assertAdmin();
  const monthInput = String(formData.get("month") ?? "");
  const sessionType = String(formData.get("session_type") ?? "");
  const { start, end } = monthWindowFromInput(monthInput);
  const times = defaultSessionTimesByType(sessionType);

  const { data: sessions, error } = await supabase
    .from("sessions")
    .select("id, starts_at")
    .eq("session_type", sessionType)
    .gte("starts_at", start.toISOString())
    .lt("starts_at", end.toISOString());
  if (error) throw error;

  for (const session of sessions ?? []) {
    const local = new Date(session.starts_at).toLocaleString("sv-SE", {
      timeZone: "America/New_York",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
    const [datePart] = local.split(" ");
    const startsAtIso = easternLocalInputToIso(`${datePart}T${times.start}`);
    const endsAtIso = easternLocalInputToIso(`${datePart}T${times.end}`);
    const { error: updateError } = await supabase
      .from("sessions")
      .update({ starts_at: startsAtIso, ends_at: endsAtIso })
      .eq("id", session.id);
    if (updateError) throw updateError;
  }

  revalidatePath("/programs/saturday");
  revalidatePath("/programs/training");
  revalidatePath("/programs/training/beginner-intermediate");
  revalidatePath("/programs/training/advanced");
  revalidatePath("/admin/programs");
  revalidatePath("/admin/programs/saturday");
  revalidatePath("/admin/programs/training-beginner-intermediate");
  revalidatePath("/admin/programs/training-advanced");
}

export async function updateSessionTimesAdminAction(formData: FormData) {
  const { supabase } = await assertAdmin();
  const sessionId = String(formData.get("session_id") ?? "");
  const startsAt = String(formData.get("starts_at") ?? "");
  const endsAt = String(formData.get("ends_at") ?? "");

  const startsAtIso = easternLocalInputToIso(startsAt);
  const endsAtIso = easternLocalInputToIso(endsAt);

  const { error } = await supabase
    .from("sessions")
    .update({
      starts_at: startsAtIso,
      ends_at: endsAtIso,
    })
    .eq("id", sessionId);
  if (error) throw error;

  revalidatePath("/programs/saturday");
  revalidatePath("/programs/training");
  revalidatePath("/programs/training/beginner-intermediate");
  revalidatePath("/programs/training/advanced");
  revalidatePath("/admin/programs");
}
