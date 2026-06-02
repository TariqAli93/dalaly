import { request } from "./api.service";

export type RemoteStatus = {
  enabled: boolean;
  running: boolean;
  url: string | null;
  message: string | null;
};

export function fetchRemoteStatus() {
  return request<RemoteStatus>("/remote-access/status");
}

export function enableRemote() {
  return request<RemoteStatus>("/remote-access/enable", { method: "POST" });
}

export function disableRemote() {
  return request<RemoteStatus>("/remote-access/disable", { method: "POST" });
}
