import { computed } from "vue";
import { useAuth } from "./useAuth";

export function usePermissions() {
  const { currentPermissions } = useAuth();

  const permissionKeys = computed(() =>
    currentPermissions.value.map((permission) => permission.key),
  );

  /** One key, or a list of which any one is enough (the tasks list). */
  function can(permission: string | readonly string[]) {
    return typeof permission === "string"
      ? permissionKeys.value.includes(permission)
      : permission.some((key) => permissionKeys.value.includes(key));
  }

  return { permissionKeys, can };
}
