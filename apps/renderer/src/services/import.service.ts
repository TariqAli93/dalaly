import type { ImportValidation } from "../types";
import { request } from "./api.service";

type ImportRow = Record<string, unknown>;

export function validateImport(rows: ImportRow[]) {
  return request<ImportValidation>("/import/properties/validate", {
    method: "POST",
    body: JSON.stringify({ rows }),
  });
}

export function commitImport(rows: ImportRow[]) {
  return request<{
    inserted: number;
    skipped: number;
    errors: Array<{ row: number; message: string }>;
  }>("/import/properties/commit", {
    method: "POST",
    body: JSON.stringify({ rows }),
  });
}
