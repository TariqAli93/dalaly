import { computed } from "vue";
import { useAuth } from "./useAuth";

export function usePermissions() {
  const { currentPermissions } = useAuth();

  const permissionKeys = computed(() =>
    currentPermissions.value.map((permission) => permission.key),
  );

  function can(permission: string) {
    return permissionKeys.value.includes(permission);
  }

  return { permissionKeys, can };
}
