import type { PermissionRecord, RoleSummary } from "./rbac.types";

export type AuthUserRecord = {
  id: number;
  username: string;
  display_name: string;
  is_active: boolean;
};

export type AuthPayload = {
  token: string;
  user: AuthUserRecord;
  roles: RoleSummary[];
  permissions: PermissionRecord[];
};

export type CurrentUserPayload = {
  user: AuthUserRecord | null;
  roles: RoleSummary[];
  permissions: PermissionRecord[];
};

export type LoginCredentials = {
  username: string;
  pin: string;
};
