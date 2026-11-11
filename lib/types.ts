export type UserRole = 'teacher' | 'student';

export type Profile = {
  id: string;
  email: string;
  role: UserRole;
  grade: string | null;
  display_name: string | null;
};

export type Activity = {
  id: string;
  teacher_id: string;
  title: string;
  subject: string | null;
  grade: string | null;
  description: string | null;
  language: string | null;
  html: string;
  public_slug: string | null;
  is_published: boolean;
  current_version: number;
  created_at: string;
  updated_at: string;
};

export type ActivityVersion = {
  id: string;
  activity_id: string;
  teacher_id: string;
  version: number;
  html: string;
  language: string | null;
  prompt: string | null;
  change_note: string | null;
  created_at: string;
};
