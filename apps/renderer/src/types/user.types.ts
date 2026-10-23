import type { AuthUserRecord } from "./auth.types";
import type { PermissionRecord, RoleSummary } from "./rbac.types";

export type ManagedUserRecord = AuthUserRecord & {
  role_ids: number[];
  roles: RoleSummary[];
  permissions: PermissionRecord[];
  created_at: string;
  updated_at: string;
};

export type UserFormPayload = {
  username: string;
  display_name: string;
  pin: string;
  is_active: boolean;
  role_ids: number[];
};
