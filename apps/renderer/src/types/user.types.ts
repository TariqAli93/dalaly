import type { AuthUserRecord } from "./auth.types";
import type { RoleRecord } from "./rbac.types";

export type ManagedUserRecord = AuthUserRecord & {
  role_ids: number[];
  roles: RoleRecord[];
};

export type UserFormPayload = {
  username: string;
  display_name: string;
  pin: string;
  is_active: boolean;
  role_ids: number[];
};
