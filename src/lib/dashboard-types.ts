export type AccessLevel = "view" | "edit" | "add";

export type InvitationCode = {
  id: string;
  code: string;
  role: string;
  can_view_records: boolean;
  can_edit_records: boolean;
  can_add_records: boolean;
  created_by: string | null;
  expires_at: string | null;
  max_uses: number;
  uses: number;
  active: boolean;
  created_at: string;
};

export type UserProfile = {
  id: string;
  full_name: string;
  email: string;
  role: string;
  active: boolean;
  can_view_records: boolean;
  can_edit_records: boolean;
  can_add_records: boolean;
};

export type Student = {
  id: string;
  registration_number: string | null;
  full_name: string;
  ministry: string;
  phone: string | null;
  guardian_name: string | null;
  guardian_phone: string | null;
  contacts: StudentContact[];
  active: boolean;
};

export type StudentContact = {
  type: "Phone number" | "WhatsApp" | "Email" | "Other";
  value: string;
  label?: string;
};

export type AttendanceSession = {
  id: string;
  title: string;
  session_date: string;
  session_type: string;
  notes: string | null;
};

export type AttendanceRecord = {
  id: string;
  session_id: string;
  student_id: string;
  status: "present" | "absent" | "late" | "excused";
};

export const APP_ROLES = [
  "Senior Pastor",
  "Pastor",
  "Church Administrator",
  "Sunday School Coordinator",
  "Sunday School Teacher",
  "Secretary",
  "Attendance Officer",
  "Ministry Leader",
  "Viewer",
] as const;
