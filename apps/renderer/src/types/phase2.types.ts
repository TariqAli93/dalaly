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
  "phone_call" | "meeting" | "visit" | "negotiation" | "other";

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

/** متابعة عرض إيجاري: نفس الحقول مع rental_id بدل property_id. */
export type RentalFollowupRecord = Omit<FollowupRecord, "property_id"> & {
  rental_id: number;
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
  /** An encryption password for the emailed copy is stored. */
  hasBackupPassword: boolean;
  frequency: "daily" | "weekly";
  time: string;
  lastRunAt?: string | null;
  lastError?: string | null;
};
