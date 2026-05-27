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

function parseCrew(value: FormDataEntryValue | null) {
  if (!value) return [] as string[];
  return String(value)
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
}

function appendCrewNamesToNotes(notes: string, crewNames: string) {
  const trimmedNotes = notes.trim();
  const trimmedCrew = crewNames.trim();
  if (!trimmedCrew) return trimmedNotes;
  const crewLine = `Crew: ${trimmedCrew}`;
  return trimmedNotes ? `${trimmedNotes}\n${crewLine}` : crewLine;
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

  const result = await supabase.rpc("reserve_boat", {
    p_boat_id: boatId,
    p_start_time: startTime,
    p_end_time: endTime,
    p_checkout_location: checkoutLocation || null,
    p_notes: finalNotes || null,
    p_crew: crew,
  });

  const destination = new URL(returnTo, "http://local");

  if (result.error) {
    const rawMessage = result.error.message || "Reservation failed.";
    const message = rawMessage.includes("Reservation blocked")
      ? "Reservation blocked. Check dues, waiver, skill tier, weight class, or boat availability."
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

  const { error } = await supabase
    .from("reservations")
    .update({
      start_time: startTime,
      end_time: endTime,
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

  const emails = [...new Set(records.map((record) => (record.email ?? "").trim().toLowerCase()).filter(Boolean))];
  const { data: existingProfiles, error: existingProfilesError } = await admin
    .from("profiles")
    .select("id, email")
    .in("email", emails);
  if (existingProfilesError) throw existingProfilesError;

  const existingByEmail = new Map((existingProfiles ?? []).map((profile) => [profile.email.toLowerCase(), profile.id]));
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://qcrc-team-management.vercel.app";

  let imported = 0;
  let invited = 0;
  let updated = 0;
  const errors: string[] = [];

  for (const record of records) {
    const email = (record.email ?? "").trim().toLowerCase();
    if (!email) {
      errors.push("Skipped a row with no email.");
      continue;
    }

    const fullName = (record.full_name ?? record.name ?? "").trim() || email;
    let profileId = existingByEmail.get(email) ?? null;

    if (!profileId) {
      const inviteResult = await admin.auth.admin.inviteUserByEmail(email, {
        data: { full_name: fullName },
        redirectTo: `${appUrl}/auth/confirm?next=/reservations`,
      });

      if (inviteResult.error || !inviteResult.data.user?.id) {
        errors.push(`Could not invite ${email}: ${inviteResult.error?.message ?? "unknown error"}`);
        continue;
      }

      profileId = inviteResult.data.user.id;
      existingByEmail.set(email, profileId);
      invited += 1;
    }

    const profilePayload = {
      id: profileId,
      email,
      full_name: fullName,
      phone: (record.phone ?? "").trim() || null,
      role: (record.role ?? "").trim() || "member",
      status: (record.status ?? "").trim() || "active",
      membership_type: (record.membership_type ?? "").trim() || "community",
      skill_level: (record.skill_level ?? "").trim() || "Beginner",
      weight_class: (record.weight_class ?? "").trim() || "Mid-weight",
      dues_ok: parseBooleanLike(record.dues_ok),
      dues_renewal_date: normalizeCsvDate(record.dues_renewal_date),
      usrowing_membership_date: normalizeCsvDate(record.usrowing_membership_date),
      safesport_date: normalizeCsvDate(record.safesport_date),
      owns_private_boat: parseBooleanLike(record.owns_private_boat),
      boat_storage_fee_ok: parseBooleanLike(record.boat_storage_fee_ok),
      boat_storage_fee_renewal_date: normalizeCsvDate(record.boat_storage_fee_renewal_date),
      sms_opt_in: parseBooleanLike(record.sms_opt_in),
    };

    const { error } = await admin.from("profiles").upsert(profilePayload, { onConflict: "id" });
    if (error) {
      errors.push(`Could not import ${email}: ${error.message}`);
      continue;
    }

    imported += 1;
    if (existingProfiles?.some((profile) => profile.email.toLowerCase() === email)) {
      updated += 1;
    }
  }

  revalidatePath("/admin/members");
  const message = `${imported} row(s) imported. ${updated} updated. ${invited} invited.${errors.length > 0 ? ` ${errors.length} issue(s): ${errors.slice(0, 3).join(" | ")}` : ""}`;
  redirect(`/admin/members?import_status=${errors.length > 0 ? "error" : "success"}&import_message=${encodeURIComponent(message)}`);
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
  revalidatePath("/safety");
  destination.searchParams.set("reservation_status", "success");
  destination.searchParams.set("reservation_message", "Launch recorded.");
  redirect(`${destination.pathname}?${destination.searchParams.toString()}`);
}

export async function checkinAction(formData: FormData) {
  const { supabase } = await ensureProfile();
  const reservationId = String(formData.get("reservation_id") ?? "");
  const notes = String(formData.get("notes") ?? "");
  const gateStatus = String(formData.get("gate_status") ?? "");
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

  if (gateStatus) {
    const updateResult = await supabase.from("reservations").update({ gate_status: gateStatus }).eq("id", reservationId);
    if (updateResult.error) {
      destination.searchParams.set("reservation_status", "error");
      destination.searchParams.set("reservation_message", updateResult.error.message || "Return recorded, but gate status was not saved.");
      redirect(`${destination.pathname}?${destination.searchParams.toString()}`);
    }
  }

  revalidatePath("/reservations");
  revalidatePath("/safety");
  destination.searchParams.set("reservation_status", "success");
  destination.searchParams.set("reservation_message", "Return recorded.");
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
  const memberId = String(formData.get("member_id") ?? "");
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

  const { data: existingMember, error: existingMemberError } = await supabase
    .from("profiles")
    .select("full_name, email, phone, sms_opt_in, dues_ok, dues_renewal_date, usrowing_membership_date, safesport_date, owns_private_boat, boat_storage_fee_ok, boat_storage_fee_renewal_date")
    .eq("id", memberId)
    .single();
  if (existingMemberError) throw existingMemberError;

  const updatePayload = {
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
  const boatType = String(formData.get("boat_type") ?? "training");
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
      boat_type: (record.boat_type ?? "").trim() || "training",
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
  const boatType = String(formData.get("boat_type") ?? "training");
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
  const startTime = String(formData.get("start_time") ?? "");
  const endTime = String(formData.get("end_time") ?? "");

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

export async function toggleSessionSignupAction(formData: FormData) {
  const { supabase, user } = await ensureProfile();
  const sessionId = String(formData.get("session_id") ?? "");
  const signedUp = String(formData.get("signed_up") ?? "true") === "true";

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
            `${year}-${String(monthIndex + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}T18:45`,
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
            `${year}-${String(monthIndex + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}T07:45`,
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
    return { start: "17:30", end: "18:45" };
  }
  return { start: "06:30", end: "07:45" };
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
