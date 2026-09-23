import { eq } from "drizzle-orm";
import { db } from "../../infrastructure/database/db.js";
import { companySettings } from "../../infrastructure/database/schema.js";
import { toApiObject } from "../../shared/utils/case.js";
import { saveManagedFile } from "../documents/documents.storage.js";
import type {
  CompanyLogoPayload,
  CompanySettingsPayload,
} from "./company-settings.schema.js";

async function ensureRow() {
  const [row] = await db
    .insert(companySettings)
    .values({ id: 1 })
    .onConflictDoNothing()
    .returning();
  if (row) return row;
  const [existing] = await db
    .select()
    .from(companySettings)
    .where(eq(companySettings.id, 1))
    .limit(1);
  return existing;
}
export async function getCompanySettings() {
  return toApiObject(await ensureRow());
}
export async function updateCompanySettings(payload: CompanySettingsPayload) {
  await ensureRow();
  const [row] = await db
    .update(companySettings)
    .set({
      companyName: payload.company_name,
      phonePrimary: payload.phone_primary,
      phoneSecondary: payload.phone_secondary,
      email: payload.email,
      address: payload.address,
      additionalContact: payload.additional_contact,
      updatedAt: new Date(),
    })
    .where(eq(companySettings.id, 1))
    .returning();
  return toApiObject(row);
}
export async function updateCompanyLogo(payload: CompanyLogoPayload) {
  await ensureRow();
  const stored = saveManagedFile(
    "company",
    payload.data,
    payload.original_name,
    payload.file_type,
  );
  const [row] = await db
    .update(companySettings)
    .set({ logoFilePath: stored.filePath, updatedAt: new Date() })
    .where(eq(companySettings.id, 1))
    .returning();
  return toApiObject(row);
}
