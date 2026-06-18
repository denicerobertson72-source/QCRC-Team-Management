import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return { supabase, user };
}

export async function ensureProfile() {
  const { supabase, user } = await requireUser();

  const authFullName = (user.user_metadata?.full_name as string | undefined)?.trim() ?? "";
  const fallbackName = authFullName || (user.email ?? "Unknown Member");
  const { data: existingProfile, error: existingProfileError } = await supabase
    .from("profiles")
    .select("id, full_name, email")
    .eq("id", user.id)
    .maybeSingle();

  if (existingProfileError) throw existingProfileError;

  if (!existingProfile) {
    const { error } = await supabase.from("profiles").insert({
      id: user.id,
      email: user.email ?? "",
      full_name: fallbackName,
    });
    if (error) throw error;
  } else {
    const currentName = existingProfile.full_name?.trim() ?? "";
    const resolvedName = currentName && !currentName.includes("@") ? currentName : fallbackName;
    const emailChanged = (existingProfile.email ?? "") !== (user.email ?? "");
    const nameChanged = currentName !== resolvedName;

    if (emailChanged || nameChanged) {
      const { error } = await supabase
        .from("profiles")
        .update({
          email: user.email ?? "",
          full_name: resolvedName,
        })
        .eq("id", user.id);
      if (error) throw error;
    }
  }

  return { supabase, user };
}

export async function ensureAdminProfile() {
  const { supabase, user } = await ensureProfile();
  const { data, error } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (error) throw error;
  if (!data || (data.role !== "admin" && data.role !== "coach" && data.role !== "equipment_manager")) {
    redirect("/reservations");
  }
  return { supabase, user };
}

export async function ensureSiteAdmin() {
  const { supabase, user } = await ensureProfile();
  const { data, error } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (error) throw error;
  if (!data || data.role !== "admin") {
    redirect("/reservations");
  }
  return { supabase, user };
}
