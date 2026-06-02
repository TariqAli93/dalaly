import type { PropertyRecord } from "./property.types";

export type PropertyImage = {
  id: number;
  property_id: number;
  file_path: string;
  original_name: string | null;
  is_primary: boolean;
  sort_order: number;
  created_at: string;
};

export type FollowupType =
  | "phone_call"
  | "meeting"
  | "visit"
  | "negotiation"
  | "other";

export type FollowupRecord = {
  id: number;
  property_id: number;
  user_id: number | null;
  user_name: string | null;
  type: FollowupType;
  notes: string | null;
  scheduled_at: string | null;
  created_at: string;
};

export type BackupJob = {
  id: number;
  type: string;
  status: string;
  file_path: string | null;
  file_size: number | null;
  duration_ms: number | null;
  error: string | null;
  created_at: string;
};

export type BackupHistory = {
  jobs: BackupJob[];
  last_backup_at: string | null;
  backup_dir: string;
};

export type ReminderRecord = {
  id: number;
  property_id: number;
  property_code: string;
  type: string;
  notes: string | null;
  scheduled_at: string;
};

export type ActivityRecord = {
  id: number;
  action: string;
  entity_id: number;
  property_code: string | null;
  user_name: string | null;
  created_at: string;
};

export type DashboardSummary = {
  counts: {
    total: number;
    available: number;
    reserved: number;
    negotiating: number;
    sold: number;
    rented: number;
    archived: number;
  };
  financial: {
    total_value: number;
    avg_price: number;
    max_price: number;
    min_price: number;
  };
  latest: PropertyRecord[];
  recent_activity: ActivityRecord[];
  top_governorates: Array<{ name: string | null; count: number }>;
  top_districts: Array<{ name: string | null; count: number }>;
  needs_review: PropertyRecord[];
  reminders: ReminderRecord[];
};

export type ImportValidation = {
  total: number;
  valid_count: number;
  duplicate_count: number;
  error_count: number;
  errors: Array<{ row: number; message: string }>;
  duplicates: Array<{ row: number; reason: string }>;
};

export type ScheduledBackupConfig = {
  enabled: boolean;
  recipient: string;
  smtpHost: string;
  smtpPort: string | number;
  smtpUser: string;
  hasPassword: boolean;
  frequency: "daily" | "weekly";
  time: string;
  lastRunAt?: string | null;
  lastError?: string | null;
};
