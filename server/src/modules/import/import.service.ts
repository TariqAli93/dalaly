import { db } from "../../infrastructure/database/db.js";
import { properties } from "../../infrastructure/database/schema.js";
import { createProperty } from "../properties/properties.repository.js";
import { propertyPayloadSchema } from "../properties/properties.schema.js";

type RawRow = Record<string, unknown>;

async function existingPhones() {
  const rows = await db.select({ phone: properties.ownerPhone }).from(properties);
  return new Set(rows.map((r) => (r.phone ?? "").trim()).filter(Boolean));
}

type ValidationResult = {
  total: number;
  valid_count: number;
  duplicate_count: number;
  error_count: number;
  errors: Array<{ row: number; message: string }>;
  duplicates: Array<{ row: number; reason: string }>;
};

export async function validateImport(rows: RawRow[]): Promise<ValidationResult> {
  const phones = await existingPhones();
  const seenPhones = new Set<string>();
  const result: ValidationResult = {
    total: rows.length,
    valid_count: 0,
    duplicate_count: 0,
    error_count: 0,
    errors: [],
    duplicates: []
  };

  rows.forEach((row, index) => {
    const rowNumber = index + 1;
    const parsed = propertyPayloadSchema.safeParse(row);
    if (!parsed.success) {
      result.error_count += 1;
      result.errors.push({
        row: rowNumber,
        message: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("، ")
      });
      return;
    }

    const phone = parsed.data.owner_phone.trim();
    if (phones.has(phone) || seenPhones.has(phone)) {
      result.duplicate_count += 1;
      result.duplicates.push({ row: rowNumber, reason: `رقم هاتف مكرر: ${phone}` });
      return;
    }

    seenPhones.add(phone);
    result.valid_count += 1;
  });

  return result;
}

export async function commitImport(rows: RawRow[], userId?: number) {
  const phones = await existingPhones();
  const seenPhones = new Set<string>();
  let inserted = 0;
  let skipped = 0;
  const errors: Array<{ row: number; message: string }> = [];

  for (let index = 0; index < rows.length; index += 1) {
    const rowNumber = index + 1;
    const parsed = propertyPayloadSchema.safeParse(rows[index]);
    if (!parsed.success) {
      skipped += 1;
      errors.push({
        row: rowNumber,
        message: parsed.error.issues.map((i) => i.message).join("، ")
      });
      continue;
    }

    const phone = parsed.data.owner_phone.trim();
    if (phones.has(phone) || seenPhones.has(phone)) {
      skipped += 1;
      continue;
    }

    try {
      await createProperty(parsed.data, userId);
      seenPhones.add(phone);
      inserted += 1;
    } catch (error) {
      skipped += 1;
      errors.push({
        row: rowNumber,
        message: error instanceof Error ? error.message : "تعذر الإدراج."
      });
    }
  }

  return { inserted, skipped, errors };
}
