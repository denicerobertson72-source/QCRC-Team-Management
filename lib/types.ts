export type Boat = {
  id: string;
  name: string;
  boat_number: string | null;
  photo_url: string | null;
  boat_class_id: "1x" | "2x" | "4x" | string;
  boat_type: string;
  required_skill_level: "Beginner" | "Intermediate" | "Advanced" | "Elite" | string;
  weight_class: "Lightweight" | "Mid-weight" | "Heavyweight" | null | string;
  required_clearance: number;
  status: "available" | "maintenance" | "locked" | string;
  rigging_notes: string | null;
};

export type ProfileSummary = {
  id: string;
  full_name: string;
  email: string;
  phone?: string | null;
  sms_opt_in?: boolean;
  sms_opt_in_at?: string | null;
  role: string;
  status: string;
  dues_ok: boolean;
  dues_renewal_date?: string | null;
  dues_last_paid_at?: string | null;
  usrowing_membership_date?: string | null;
  safesport_date?: string | null;
  owns_private_boat?: boolean;
  boat_storage_fee_ok?: boolean;
  boat_storage_fee_renewal_date?: string | null;
  boat_storage_fee_last_paid_at?: string | null;
  membership_type: string;
  skill_level: "Beginner" | "Intermediate" | "Advanced" | "Elite" | string;
  weight_class: "Lightweight" | "Mid-weight" | "Heavyweight" | string;
};

export type Reservation = {
  id: string;
  boat_id: string;
  created_by: string;
  start_time: string;
  end_time: string;
  status: string;
  checked_out_at: string | null;
  checked_in_at: string | null;
  checkout_location: string | null;
  river_direction?: string | null;
  gate_status?: string | null;
  notes: string | null;
  boats?: { name: string } | null;
};

export type SafetyEntry = {
  id: string;
  boat_name: string;
  rower_name: string;
  start_time: string;
  end_time: string;
  checked_out_at: string | null;
  checked_in_at: string | null;
  checkout_location: string | null;
  river_direction: string | null;
  gate_status: string | null;
  status: string;
  is_overdue: boolean;
};

export type SafetyResource = {
  id: string;
  title: string;
  description: string | null;
  resource_type: "photo" | "procedure" | "quiz" | string;
  external_url: string | null;
  storage_path: string | null;
  mime_type: string | null;
  sort_order: number;
  is_published: boolean;
  resource_url?: string | null;
};

export type RowingMeetupMember = {
  member_id: string;
  full_name: string;
  email: string;
  skill_level: string;
  wants_2x: boolean;
  wants_4x: boolean;
  notes: string | null;
  created_at: string;
};

export type RowingMeetupAvailability = {
  id: string;
  member_id: string;
  weekday: number;
  start_time: string;
  end_time: string;
};

export type OverdueBoatAlert = {
  reservation_id: string;
  boat_name: string;
  rower_name: string;
  checked_out_at: string;
  checkout_location: string | null;
  river_direction: string | null;
};

export type NotificationEvent = {
  id: string;
  notification_type: string;
  payload: Record<string, unknown>;
  sent_at: string;
  read_at: string | null;
};

export type BoatAvailabilityBlock = {
  id: string;
  title: string;
  starts_at: string;
  ends_at: string;
  applies_to_membership_type: string | null;
  applies_to_boat_class_id: "1x" | "2x" | "4x" | string | null;
  is_active: boolean;
  notes: string | null;
};

export type ProgramSession = {
  id: string;
  title: string;
  session_type: string;
  starts_at: string;
  ends_at: string;
  location: string | null;
  notes: string | null;
  is_cancelled: boolean;
  cancelled_reason: string | null;
  my_signed_up: boolean;
  signup_count: number;
};
