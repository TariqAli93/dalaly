import { computed, ref } from "vue";
import {
  clearToken,
  getToken,
  setToken,
} from "../services/api.service";
import * as authService from "../services/auth.service";
import type {
  AuthUserRecord,
  LoginCredentials,
  PermissionRecord,
  RoleRecord,
} from "../types";

const currentUser = ref<AuthUserRecord | null>(null);
const currentRoles = ref<RoleRecord[]>([]);
const currentPermissions = ref<PermissionRecord[]>([]);

const isAuthenticated = computed(() => Boolean(currentUser.value));

function hasToken() {
  return Boolean(getToken());
}

function clearAuthState() {
  clearToken();
  currentUser.value = null;
  currentRoles.value = [];
  currentPermissions.value = [];
}

async function loginWithCredentials(credentials: LoginCredentials) {
  const payload = await authService.login(credentials);
  setToken(payload.token);
  currentUser.value = payload.user;
  currentRoles.value = payload.roles;
  currentPermissions.value = payload.permissions;
}

async function loadCurrentUser() {
  const me = await authService.fetchCurrentUser();
  currentUser.value = me.user;
  currentRoles.value = me.roles;
  currentPermissions.value = me.permissions;
  return me.user;
}

async function logout() {
  await authService.logout().catch(() => undefined);
  clearAuthState();
}

export function useAuth() {
  return {
    currentUser,
    currentRoles,
    currentPermissions,
    isAuthenticated,
    hasToken,
    loginWithCredentials,
    loadCurrentUser,
    logout,
    clearAuthState,
  };
}
