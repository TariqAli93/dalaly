import type { BackupHistory } from "../types";
import { API_BASE, getToken, request } from "./api.service";

type RestoreScope = "full" | "properties" | "images" | "users" | "settings";

export function fetchBackupHistory() {
  return request<BackupHistory>("/backup/history");
}

export function exportBackup(outputPath: string) {
  return request<{
    ok: boolean;
    job_id: number;
    file_path: string;
    file_size: number;
  }>("/backup/export", {
    method: "POST",
    body: JSON.stringify({ outputPath }),
  });
}

export function createBackup() {
  return request<{
    ok: boolean;
    job_id: number;
    file_path: string;
    file_size: number;
    duration_ms: number;
  }>("/backup/create", { method: "POST" });
}

export function setBackupDir(dir: string) {
  return request<{ ok: boolean; dir: string }>("/backup/dir", {
    method: "PUT",
    body: JSON.stringify({ dir }),
  });
}

export function restoreBackup(input: {
  scope: RestoreScope;
  file_path?: string;
  data?: string;
}) {
  return request<{ ok: boolean; scope: string; images_restored: number }>(
    "/backup/restore",
    { method: "POST", body: JSON.stringify(input) },
  );
}

export function backupDownloadUrl(jobId: number) {
  return `${API_BASE}/backup/download/${jobId}?token=${encodeURIComponent(getToken())}`;
}
