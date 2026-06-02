export type AuditLogRecord = {
  id: number;
  entity_type: string;
  entity_id: number;
  action: string;
  old_value: unknown;
  new_value: unknown;
  user_id: number | null;
  user_name: string | null;
  created_at: string;
};
