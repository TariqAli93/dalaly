export type RoleRecord = {
  id: number;
  name: string;
  description: string | null;
  is_system: boolean;
  permission_ids: number[];
  created_at: string;
  updated_at: string;
};

/** دور مضمَّن في مستخدم أو جلسة: بلا صلاحياته وتواريخه. */
export type RoleSummary = Pick<
  RoleRecord,
  "id" | "name" | "description" | "is_system"
>;

export type PermissionRecord = {
  id: number;
  key: string;
  name: string;
  description: string | null;
  module: string;
  /** في GET /permissions فقط، لا في صلاحيات الجلسة أو المستخدم. */
  created_at?: string;
  updated_at?: string;
};
