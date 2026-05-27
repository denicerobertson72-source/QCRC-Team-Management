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

  const profilePayload = {
    id: user.id,
    email: user.email ?? "",
    full_name: (user.user_metadata?.full_name as string | undefined) ?? user.email ?? "Unknown Member",
  };

  const { error } = await supabase.from("profiles").upsert(profilePayload, { onConflict: "id" });

  if (error) {
    throw error;
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
