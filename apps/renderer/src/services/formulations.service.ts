import { request } from "./api.service";
export type Formulation = {
  id: number;
  title: string;
  content: string;
  contract_type: "sale" | "rental" | "general";
  is_default: boolean;
  system_key: string | null;
  version: number;
  updated_at: string;
  source_legacy_id: number | null;
};
export type FormulationInput = Pick<
  Formulation,
  "title" | "content" | "contract_type"
> & { version?: number };
export const list = () => request<Formulation[]>("/legal-content/formulations");
export const variables = () => request<string[]>("/legal-content/variables");
export const save = (input: FormulationInput, id?: number) =>
  request<Formulation>(`/legal-content/formulations${id ? `/${id}` : ""}`, {
    method: id ? "PUT" : "POST",
    body: JSON.stringify(input),
  });
export const copy = (id: number) =>
  request<Formulation>(`/legal-content/formulations/${id}/copy`, {
    method: "POST",
  });
export const remove = (id: number) =>
  request(`/legal-content/formulations/${id}`, { method: "DELETE" });
export const makeDefault = (id: number) =>
  request(`/legal-content/formulations/${id}/default`, { method: "POST" });
export const restore = (contract_type: "sale" | "rental") =>
  request<Formulation>("/legal-content/formulations/restore", {
    method: "POST",
    body: JSON.stringify({ contract_type }),
  });
export const importFile = (filename: string, data: string) =>
  request<{ title: string; content: string }>(
    "/legal-content/formulations/import",
    { method: "POST", body: JSON.stringify({ filename, data }) },
  );
export function fileData(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1]);
    reader.onerror = () => reject(new Error("تعذرت قراءة الملف."));
    reader.readAsDataURL(file);
  });
}
