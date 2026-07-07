import { ensureProfile } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import type {
  Boat,
  BoatAvailabilityBlock,
  NotificationEvent,
  OverdueBoatAlert,
  OverdueBoatAlertSummary,
  PrivateBoatOuting,
  ProfileSummary,
  ProgramSession,
  Reservation,
  RowingMeetupAvailability,
  RowingMeetupMember,
  SafetyEntry,
  SafetyResource,
  TeamAnnouncement,
} from "@/lib/types";
import { easternLocalInputToIso, getEasternDateKey } from "@/lib/time";
import { splitNotesAndCrew } from "@/lib/crew";

function profileNameFromRelation(profileRelation: unknown) {
  if (Array.isArray(profileRelation)) {
    const first = profileRelation[0] as { full_name?: string } | undefined;
    return first?.full_name ?? "Unknown";
  }
  if (profileRelation && typeof profileRelation === "object") {
    return (profileRelation as { full_name?: string }).full_name ?? "Unknown";
  }
  return "Unknown";
}

function rowerNameFromRelation(profileRelation: unknown) {
  const profile = Array.isArray(profileRelation) ? profileRelation[0] : profileRelation;
  if (profile && typeof profile === "object") {
    const { full_name: fullName, email } = profile as { full_name?: string | null; email?: string | null };
    const trimmedName = fullName?.trim() ?? "";
    if (trimmedName && !trimmedName.includes("@")) {
      return trimmedName;
    }

    const emailName = email?.split("@")[0]?.replace(/[._-]+/g, " ").trim();
    if (emailName) {
      return emailName.replace(/\b\w/g, (char) => char.toUpperCase());
    }
  }
  return "Unknown";
}

function notificationCutoffIso() {
  return new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
}

async function getProfileNamesById(memberIds: string[]) {
  const uniqueIds = [...new Set(memberIds.filter(Boolean))];
  if (uniqueIds.length === 0) return new Map<string, string>();

  const admin = createAdminClient();
  const { data, error } = await admin.from("profiles").select("id, full_name").in("id", uniqueIds);
  if (error) throw error;

  return new Map((data ?? []).map((profile) => [profile.id, profile.full_name?.trim() || "Unknown"]));
}

export async function getMyReservations() {
  const { supabase, user } = await ensureProfile();

  const { data, error } = await supabase
    .from("reservations")
    .select("id, boat_id, created_by, start_time, end_time, status, checked_out_at, checked_in_at, checkout_location, river_direction, gate_status, notes, boats(name)")
    .in("status", ["reserved", "checked_out", "checked_in"])
    .or(`created_by.eq.${user.id}`)
    .order("start_time", { ascending: false });

  if (error) throw error;

  type ReservationRow = Omit<Reservation, "boats"> & {
    boats: { name: string } | { name: string }[] | null;
  };

  const rows = ((data ?? []) as ReservationRow[])
    .map((row) => ({
      ...row,
      ...splitNotesAndCrew(row.notes),
      boats: Array.isArray(row.boats) ? (row.boats[0] ?? null) : row.boats,
    }))
    .filter((row) => {
      if (row.status !== "checked_in") return true;
      return !row.gate_status;
    });

  return rows;
}

export async function getUpcomingOtherReservations() {
  const { user } = await ensureProfile();
  const admin = createAdminClient();

  const now = new Date();
  const startKey = getEasternDateKey(now);
  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const tomorrowKey = getEasternDateKey(tomorrow);
  const endWindow = new Date(now.getTime() + 48 * 60 * 60 * 1000).toISOString();

  const { data, error } = await admin
    .from("reservations")
    .select("id, created_by, start_time, status, boats(boat_class_id), profiles!reservations_created_by_fkey(full_name,email)")
    .in("status", ["reserved", "checked_out"])
    .gte("start_time", now.toISOString())
    .lt("start_time", endWindow)
    .neq("created_by", user.id)
    .order("start_time", { ascending: true });
  if (error) throw error;

  const rows = (data ?? []) as Array<{
    id: string;
    created_by: string;
    start_time: string;
    status: string;
    boats: { boat_class_id?: string | null } | { boat_class_id?: string | null }[] | null;
    profiles:
      | { full_name?: string | null; email?: string | null }
      | { full_name?: string | null; email?: string | null }[]
      | null;
  }>;

  return rows
    .map((row) => {
      const boat = Array.isArray(row.boats) ? row.boats[0] : row.boats;
      const profile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
      return {
        id: row.id,
        member_name: rowerNameFromRelation(profile),
        start_time: row.start_time,
        boat_class_id: boat?.boat_class_id ?? "Unknown",
        date_key: getEasternDateKey(row.start_time),
      };
    })
    .filter((row) => row.date_key === startKey || row.date_key === tomorrowKey);
}

export async function getMyPrivateBoatOutings() {
  const { supabase, user } = await ensureProfile();
  const { data, error } = await supabase
    .from("private_boat_outings")
    .select("id, member_id, status, checked_out_at, checked_in_at, checkout_location, river_direction, gate_status, notes")
    .eq("member_id", user.id)
    .in("status", ["checked_out", "checked_in"])
    .order("checked_out_at", { ascending: false });

  if (error) throw error;
  return ((data ?? []) as PrivateBoatOuting[]).filter((row) => {
    if (row.status !== "checked_in") return true;
    return !row.gate_status;
  });
}

export async function getBoats() {
  const { supabase } = await ensureProfile();
  const { data, error } = await supabase
    .from("boats")
    .select(
      "id, name, boat_number, photo_url, boat_class_id, boat_type, required_skill_level, weight_class, required_clearance, status, rigging_notes",
    )
    .order("boat_class_id")
    .order("name");

  if (error) throw error;
  return (data ?? []) as Boat[];
}

export async function getMyProfileSummary() {
  const { supabase, user } = await ensureProfile();
  const { data, error } = await supabase
    .from("profiles")
    .select(
      "id, full_name, email, phone, sms_opt_in, sms_opt_in_at, role, status, dues_ok, dues_renewal_date, dues_last_paid_at, usrowing_membership_date, safesport_date, owns_private_boat, boat_storage_fee_ok, boat_storage_fee_renewal_date, boat_storage_fee_last_paid_at, membership_type, skill_level, weight_class",
    )
    .eq("id", user.id)
    .single();

  if (error) throw error;
  return data as ProfileSummary;
}

export async function getAvailableBoats(start: string, end: string, boatClassId?: string) {
  const { supabase } = await ensureProfile();
  const startIso = easternLocalInputToIso(start);
  const endIso = easternLocalInputToIso(end);

  if (!startIso || !endIso) {
    return [];
  }

  const { data, error } = await supabase.rpc("available_boats_for_window", {
    p_start_time: startIso,
    p_end_time: endIso,
    p_boat_class_id: boatClassId || null,
  });

  if (error) throw error;
  return (data ?? []) as Boat[];
}

export async function getBoatAvailabilityBlocks() {
  const { supabase } = await ensureProfile();
  const { data, error } = await supabase
    .from("boat_availability_blocks")
    .select("id, title, starts_at, ends_at, applies_to_membership_type, applies_to_boat_class_id, is_active, notes")
    .order("starts_at", { ascending: true });

  if (error) throw error;
  return (data ?? []) as BoatAvailabilityBlock[];
}

export async function getProgramSignupState() {
  const { supabase, user } = await ensureProfile();
  const { data, error } = await supabase
    .from("program_signups")
    .select("program_type, training_group")
    .eq("member_id", user.id);

  if (error) throw error;
  return data ?? [];
}

export async function getMyTrainingGroupAssignment() {
  const { supabase, user } = await ensureProfile();
  const { data, error } = await supabase
    .from("program_signups")
    .select("training_group")
    .eq("member_id", user.id)
    .eq("program_type", "coached_training")
    .maybeSingle();

  if (error) throw error;
  return data?.training_group ?? null;
}

export async function getRaceEventsWithMySignup() {
  const { supabase, user } = await ensureProfile();
  const [{ data: events, error: eventsError }, { data: signups, error: signupsError }] = await Promise.all([
    supabase.from("race_events").select("id, title, event_date, location, notes").order("event_date", { ascending: true }),
    supabase
      .from("race_signups")
      .select("race_event_id, birthdate, desired_race_count, wants_1x, wants_2x, wants_4x, wants_8x, comments")
      .eq("member_id", user.id),
  ]);
  if (signupsError) throw signupsError;
  if (eventsError) throw eventsError;

  const signupByRace = new Map<
    string,
    { birthdate: string; desired_race_count: number; wants_1x: boolean; wants_2x: boolean; wants_4x: boolean; wants_8x: boolean; comments: string | null }
  >();
  for (const signup of signups ?? []) {
    signupByRace.set(signup.race_event_id, {
      birthdate: signup.birthdate,
      desired_race_count: signup.desired_race_count ?? 1,
      wants_1x: signup.wants_1x,
      wants_2x: signup.wants_2x,
      wants_4x: signup.wants_4x,
      wants_8x: signup.wants_8x,
      comments: signup.comments ?? null,
    });
  }

  return (events ?? []).map((event) => ({
    ...event,
    my_signup: signupByRace.get(event.id) ?? null,
  }));
}

export async function getAdminLineupBoards() {
  const { supabase } = await ensureProfile();
  const { data, error } = await supabase
    .from("lineup_boards")
    .select("id, board_type, race_event_id, session_id, title, is_published, published_at")
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function getRosterForBoard(boardType: string, raceEventId?: string, sessionId?: string) {
  const { supabase } = await ensureProfile();

  if (sessionId) {
    const { data, error } = await supabase
      .from("session_signups")
      .select("member_id, profiles(full_name)")
      .eq("session_id", sessionId);
    if (error) throw error;
    return (data ?? []).map((row) => ({
      id: row.member_id,
      full_name: profileNameFromRelation(row.profiles),
    }));
  }

  if (boardType === "racing") {
    if (!raceEventId) return [];
    const { data, error } = await supabase
      .from("race_signups")
      .select("member_id, profiles(full_name)")
      .eq("race_event_id", raceEventId);
    if (error) throw error;
    return (data ?? []).map((row) => ({
      id: row.member_id,
      full_name: profileNameFromRelation(row.profiles),
    }));
  }

  if (boardType === "coached_training_beginner_intermediate" || boardType === "coached_training_advanced") {
    const trainingGroup = boardType === "coached_training_beginner_intermediate" ? "beginner_intermediate" : "advanced";
    const { data, error } = await supabase
      .from("program_signups")
      .select("member_id, profiles(full_name)")
      .eq("program_type", "coached_training")
      .eq("training_group", trainingGroup);
    if (error) throw error;
    return (data ?? []).map((row) => ({
      id: row.member_id,
      full_name: profileNameFromRelation(row.profiles),
    }));
  }

  const { data, error } = await supabase
    .from("program_signups")
    .select("member_id, profiles(full_name)")
    .eq("program_type", "saturday_coached_row");
  if (error) throw error;
  return (data ?? []).map((row) => ({
    id: row.member_id,
    full_name: profileNameFromRelation(row.profiles),
  }));
}

export async function getLineupBoardDetail(lineupBoardId: string) {
  const { supabase } = await ensureProfile();

  const { data: board, error: boardError } = await supabase
    .from("lineup_boards")
    .select("id, board_type, race_event_id, session_id, title, is_published")
    .eq("id", lineupBoardId)
    .single();
  if (boardError) throw boardError;

  const { data: boats, error: boatError } = await supabase
    .from("lineup_boats")
    .select("id, lineup_board_id, boat_name, boat_class_id, race_time, sort_order")
    .eq("lineup_board_id", lineupBoardId)
    .order("sort_order", { ascending: true });
  if (boatError) throw boatError;

  const boatIds = (boats ?? []).map((b) => b.id);
  const seats = boatIds.length
    ? await (async () => {
        const { data: seatData, error: seatError } = await supabase
          .from("lineup_seats")
          .select("id, lineup_boat_id, seat_number, member_id")
          .in("lineup_boat_id", boatIds)
          .order("seat_number", { ascending: true });
        if (seatError) throw seatError;
        return seatData ?? [];
      })()
    : [];
  const profileNamesById = await getProfileNamesById(seats.map((seat) => seat.member_id).filter(Boolean));

  const seatsByBoat = new Map<string, typeof seats>();
  for (const seat of seats) {
    const existing = seatsByBoat.get(seat.lineup_boat_id) ?? [];
    existing.push(seat);
    seatsByBoat.set(seat.lineup_boat_id, existing);
  }

  return {
    board,
    boats: (boats ?? []).map((boat) => ({
      ...boat,
      seats: (seatsByBoat.get(boat.id) ?? []).map((seat) => ({
        id: seat.id,
        seat_number: seat.seat_number,
        member_id: seat.member_id,
        member_name: seat.member_id ? profileNamesById.get(seat.member_id) ?? "Unknown" : "TBD",
      })),
    })),
  };
}

export async function getPublishedLineups() {
  const { supabase } = await ensureProfile();
  const now = new Date();
  const { data, error } = await supabase
    .from("lineup_boards")
    .select("id, board_type, race_event_id, session_id, title, is_published, published_at, race_events(title,event_date), sessions(starts_at)")
    .eq("is_published", true)
    .order("created_at", { ascending: false });
  if (error) throw error;

  const todayEastern = getEasternDateKey(new Date());

  return (data ?? []).filter((board) => {
    const session = Array.isArray(board.sessions) ? board.sessions[0] : board.sessions;
    const race = Array.isArray(board.race_events) ? board.race_events[0] : board.race_events;

    if (session?.starts_at) {
      return new Date(session.starts_at).getTime() > now.getTime();
    }

    if (race?.event_date) {
      return String(race.event_date) >= todayEastern;
    }

    if (board.board_type !== "race" && board.published_at) {
      return getEasternDateKey(board.published_at) >= todayEastern;
    }

    return board.board_type === "race";
  });
}

export async function getProgramSessionsForMonth(programTypes: string[], monthStartIso: string, monthEndIso: string) {
  const { supabase, user } = await ensureProfile();
  const nowIso = new Date().toISOString();
  const effectiveStartIso = monthStartIso > nowIso ? monthStartIso : nowIso;

  const { data: sessions, error: sessionsError } = await supabase
    .from("sessions")
    .select("id, title, session_type, starts_at, ends_at, location, notes, is_cancelled, cancelled_reason")
    .in("session_type", programTypes)
    .gte("starts_at", effectiveStartIso)
    .lt("starts_at", monthEndIso)
    .order("starts_at", { ascending: true });
  if (sessionsError) throw sessionsError;

  const sessionIds = (sessions ?? []).map((s) => s.id);
  if (sessionIds.length === 0) return [] as ProgramSession[];

  const { data: allSignups, error: signupError } = await supabase
    .from("session_signups")
    .select("session_id, member_id")
    .in("session_id", sessionIds);
  if (signupError) throw signupError;

  const countBySession = new Map<string, number>();
  const mine = new Set<string>();

  for (const signup of allSignups ?? []) {
    countBySession.set(signup.session_id, (countBySession.get(signup.session_id) ?? 0) + 1);
    if (signup.member_id === user.id) {
      mine.add(signup.session_id);
    }
  }

  return (sessions ?? [])
    .filter((session) => new Date(session.starts_at) >= new Date(nowIso))
    .map((session) => ({
    ...session,
    my_signed_up: mine.has(session.id),
    signup_count: countBySession.get(session.id) ?? 0,
  })) as ProgramSession[];
}

export async function getNextProgramSessionMonth(programTypes: string[]) {
  const { supabase } = await ensureProfile();
  const nowIso = new Date().toISOString();
  const { data, error } = await supabase
    .from("sessions")
    .select("starts_at")
    .in("session_type", programTypes)
    .gte("starts_at", nowIso)
    .order("starts_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data?.starts_at) return null;

  const startsAt = new Date(data.starts_at);
  return `${startsAt.getUTCFullYear()}-${String(startsAt.getUTCMonth() + 1).padStart(2, "0")}`;
}

export async function getOverdueBoatAlerts() {
  const { supabase } = await ensureProfile();
  const { data, error } = await supabase.rpc("overdue_boat_summary");
  if (error) throw error;
  return (data ?? []) as OverdueBoatAlert[];
}

export async function getOverdueBoatAlertSummary() {
  const { supabase } = await ensureProfile();
  const { data, error } = await supabase.rpc("overdue_boat_alert_summary");
  if (error) throw error;
  const summary = ((data ?? [])[0] ?? null) as OverdueBoatAlertSummary | null;
  return {
    overdue_count: Number(summary?.overdue_count ?? 0),
    first_boat_name: summary?.first_boat_name ?? null,
  };
}

export async function getMyNotifications(limit = 50) {
  const { supabase, user } = await ensureProfile();
  const cutoffIso = notificationCutoffIso();
  const { data, error } = await supabase
    .from("notification_events")
    .select("id, notification_type, payload, sent_at, read_at")
    .eq("member_id", user.id)
    .gte("sent_at", cutoffIso)
    .order("sent_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as NotificationEvent[];
}

export async function getUnreadNotificationCount() {
  const { supabase, user } = await ensureProfile();
  const cutoffIso = notificationCutoffIso();
  const { count, error } = await supabase
    .from("notification_events")
    .select("*", { count: "exact", head: true })
    .eq("member_id", user.id)
    .gte("sent_at", cutoffIso)
    .is("read_at", null);
  if (error) throw error;
  return count ?? 0;
}

function buildSafetyDashboard(
  reservationData: any[] | null,
  privateOutings: any[] | null,
) {
  const now = Date.now();
  const reservationRows = (reservationData ?? []).map((row: any) => {
    const boat = Array.isArray(row.boats) ? row.boats[0] : row.boats;
    const profile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
    const checkedOutTime = row.checked_out_at ? new Date(row.checked_out_at).getTime() : null;
    const parsed = splitNotesAndCrew(row.notes);

    return {
      id: row.id,
      outing_kind: "reservation",
      created_by: row.created_by,
      boat_name: boat?.name ?? row.id,
      rower_name: rowerNameFromRelation(profile),
      start_time: row.start_time,
      end_time: row.end_time,
      checked_out_at: row.checked_out_at,
      checked_in_at: row.checked_in_at,
      checkout_location: row.checkout_location,
      river_direction: row.river_direction,
      gate_status: row.gate_status,
      notes: parsed.notes,
      crew_names: parsed.crewNames,
      status: row.status,
      is_overdue: row.status === "checked_out" && checkedOutTime !== null && now - checkedOutTime >= 2 * 60 * 60 * 1000,
    } satisfies SafetyEntry;
  });

  const privateBoatRows = (privateOutings ?? []).map((row: any) => {
    const profile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
    const checkedOutTime = row.checked_out_at ? new Date(row.checked_out_at).getTime() : null;

    return {
      id: row.id,
      outing_kind: "private_boat",
      created_by: row.member_id,
      boat_name: "Private Boat",
      rower_name: rowerNameFromRelation(profile),
      start_time: row.checked_out_at,
      end_time: row.checked_in_at ?? row.checked_out_at,
      checked_out_at: row.checked_out_at,
      checked_in_at: row.checked_in_at,
      checkout_location: row.checkout_location,
      river_direction: row.river_direction,
      gate_status: row.gate_status,
      notes: row.notes ?? null,
      crew_names: [],
      status: row.status,
      is_overdue: row.status === "checked_out" && checkedOutTime !== null && now - checkedOutTime >= 2 * 60 * 60 * 1000,
    } satisfies SafetyEntry;
  });

  const oneDayAgo = now - 24 * 60 * 60 * 1000;
  const rows = [...reservationRows, ...privateBoatRows]
    .filter((row) => {
      const relevantTime = row.checked_in_at ?? row.checked_out_at ?? row.start_time;
      return new Date(relevantTime).getTime() >= oneDayAgo;
    })
    .sort((a, b) => {
      const aTime = a.checked_out_at ? new Date(a.checked_out_at).getTime() : 0;
      const bTime = b.checked_out_at ? new Date(b.checked_out_at).getTime() : 0;
      return bTime - aTime;
    });

  return {
    onWater: rows.filter((row) => row.status === "checked_out"),
    recentLog: rows,
  };
}

export async function getSafetyDashboardForSupabase(supabase: any) {
  const [{ data: reservationData, error: reservationError }, { data: privateOutings, error: privateOutingError }] = await Promise.all([
    supabase
      .from("reservations")
      .select("id, created_by, start_time, end_time, status, checked_out_at, checked_in_at, checkout_location, river_direction, gate_status, notes, boats(name), profiles!reservations_created_by_fkey(full_name,email)")
      .in("status", ["checked_out", "checked_in"])
      .order("checked_out_at", { ascending: false })
      .limit(100),
    supabase
      .from("private_boat_outings")
      .select("id, member_id, status, checked_out_at, checked_in_at, checkout_location, river_direction, gate_status, notes, profiles!private_boat_outings_member_id_fkey(full_name,email)")
      .in("status", ["checked_out", "checked_in"])
      .order("checked_out_at", { ascending: false })
      .limit(100),
  ]);

  if (reservationError) throw reservationError;
  if (privateOutingError) throw privateOutingError;

  return buildSafetyDashboard(reservationData ?? null, privateOutings ?? null);
}

export async function getSafetyDashboard() {
  const { supabase } = await ensureProfile();
  return getSafetyDashboardForSupabase(supabase);
}

export async function getActiveTeamAnnouncements() {
  const { supabase } = await ensureProfile();
  const { data, error } = await supabase
    .from("team_announcements")
    .select("id, title, body, starts_at, ends_at, is_published, created_at")
    .eq("is_published", true)
    .order("starts_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });

  if (error) throw error;
  const now = Date.now();
  return ((data ?? []) as TeamAnnouncement[]).filter((announcement) => {
    const startsAt = announcement.starts_at ? new Date(announcement.starts_at).getTime() : null;
    const endsAt = announcement.ends_at ? new Date(announcement.ends_at).getTime() : null;
    return (startsAt === null || startsAt <= now) && (endsAt === null || endsAt >= now);
  });
}

export async function getPublishedSafetyResources() {
  const { supabase } = await ensureProfile();
  const { data, error } = await supabase
    .from("safety_resources")
    .select("id, title, description, resource_type, external_url, storage_path, mime_type, sort_order, is_published")
    .eq("is_published", true)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) throw error;

  const resources = (data ?? []) as SafetyResource[];
  const storagePaths = resources.map((resource) => resource.storage_path).filter(Boolean) as string[];
  const signedUrlMap = new Map<string, string>();

  if (storagePaths.length > 0) {
    const uniquePaths = [...new Set(storagePaths)];
    const { data: signedUrls } = await supabase.storage.from("safety-resources").createSignedUrls(uniquePaths, 60 * 60);
    for (const signed of signedUrls ?? []) {
      if (signed.path && signed.signedUrl) {
        signedUrlMap.set(signed.path, signed.signedUrl);
      }
    }
  }

  return resources.map((resource) => ({
    ...resource,
    resource_url: resource.external_url ?? (resource.storage_path ? signedUrlMap.get(resource.storage_path) ?? null : null),
  }));
}

export async function getRowingMeetupState() {
  const { supabase, user } = await ensureProfile();

  const [{ data: myMembership, error: membershipError }, { data: allMembers, error: membersError }, { data: slots, error: slotsError }] =
    await Promise.all([
      supabase
        .from("rowing_meetup_members")
        .select("member_id, skill_level, wants_1x, wants_2x, wants_4x, notes, created_at")
        .eq("member_id", user.id)
        .maybeSingle(),
      supabase
        .from("rowing_meetup_members")
        .select("member_id, skill_level, wants_1x, wants_2x, wants_4x, notes, created_at")
        .order("created_at", { ascending: true }),
      supabase
        .from("rowing_meetup_availability")
        .select("id, member_id, weekday, start_time, end_time")
        .order("weekday", { ascending: true })
        .order("start_time", { ascending: true }),
    ]);

  if (membershipError) throw membershipError;
  if (membersError) throw membersError;
  if (slotsError) throw slotsError;
  const profileNamesById = await getProfileNamesById((allMembers ?? []).map((row: any) => row.member_id));

  const members: RowingMeetupMember[] = (allMembers ?? []).map((row: any) => {
    return {
      member_id: row.member_id,
      full_name: profileNamesById.get(row.member_id) ?? "Unknown",
      skill_level: row.skill_level,
      wants_1x: row.wants_1x,
      wants_2x: row.wants_2x,
      wants_4x: row.wants_4x,
      notes: row.notes,
      created_at: row.created_at,
    };
  });

  const availability = (slots ?? []) as RowingMeetupAvailability[];
  const myAvailability = availability.filter((slot) => slot.member_id === user.id);

  return {
    myMembership: myMembership
      ? {
          member_id: myMembership.member_id,
          skill_level: myMembership.skill_level,
          wants_1x: myMembership.wants_1x,
          wants_2x: myMembership.wants_2x,
          wants_4x: myMembership.wants_4x,
          notes: myMembership.notes,
          created_at: myMembership.created_at,
        }
      : null,
    myAvailability,
    members,
    availabilityByMember: availability.reduce<Record<string, RowingMeetupAvailability[]>>((acc, slot) => {
      acc[slot.member_id] = [...(acc[slot.member_id] ?? []), slot];
      return acc;
    }, {}),
  };
}
