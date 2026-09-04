import { redirect } from "next/navigation";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

export const requireUser = cache(async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return { supabase, user };
});

export const ensureProfile = cache(async function ensureProfile() {
  const { supabase, user } = await requireUser();

  const authFullName = (user.user_metadata?.full_name as string | undefined)?.trim() ?? "";
  const fallbackName = authFullName || (user.email ?? "Unknown Member");
  const { data: existingProfile, error: existingProfileError } = await supabase
    .from("profiles")
    .select("id, full_name, email, role, password_set_at")
    .eq("id", user.id)
    .maybeSingle();

  if (existingProfileError) throw existingProfileError;

  let profile = existingProfile;

  if (!existingProfile) {
    const { data: inserted, error } = await supabase
      .from("profiles")
      .insert({
        id: user.id,
        email: user.email ?? "",
        full_name: fallbackName,
      })
      .select("id, full_name, email, role, password_set_at")
      .single();
    if (error) throw error;
    profile = inserted;
  } else {
    const currentName = existingProfile.full_name?.trim() ?? "";
    const resolvedName = currentName && !currentName.includes("@") ? currentName : fallbackName;
    const emailChanged = (existingProfile.email ?? "") !== (user.email ?? "");
    const nameChanged = currentName !== resolvedName;

    if (emailChanged || nameChanged) {
      const { data: updated, error } = await supabase
        .from("profiles")
        .update({
          email: user.email ?? "",
          full_name: resolvedName,
        })
        .eq("id", user.id)
        .select("id, full_name, email, role, password_set_at")
        .single();
      if (error) throw error;
      profile = updated;
    }
  }

  return { supabase, user, profile: profile! };
});

export const ensureAdminProfile = cache(async function ensureAdminProfile() {
  const { supabase, user, profile } = await ensureProfile();
  if (profile.role !== "admin" && profile.role !== "coach" && profile.role !== "equipment_manager") {
    redirect("/reservations");
  }
  return { supabase, user, profile };
});

export const ensureSiteAdmin = cache(async function ensureSiteAdmin() {
  const { supabase, user, profile } = await ensureProfile();
  if (profile.role !== "admin") {
    redirect("/reservations");
  }
  return { supabase, user, profile };
});
