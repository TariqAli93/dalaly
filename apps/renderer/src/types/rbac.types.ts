export type RoleRecord = {
  id: number;
  name: string;
  description: string | null;
  is_system: boolean;
  permission_ids: number[];
};

export type PermissionRecord = {
  id: number;
  key: string;
  name: string;
  description: string | null;
  module: string;
};
