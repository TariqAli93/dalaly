import { setImmediate as yieldToEventLoop } from "node:timers/promises";
import { inArray } from "drizzle-orm";
import { db } from "../../infrastructure/database/db.js";
import {
  withRecordCodeLock,
  type Transaction,
} from "../../infrastructure/database/record-codes.js";
import { people, properties } from "../../infrastructure/database/schema.js";
import { MAX_IMPORT_ROWS } from "../../shared/constants/limits.js";
import { DuplicatePlotError } from "../../shared/errors.js";
import { postgresError } from "../../shared/utils/postgres-errors.js";
import {
  getLocationNamesByIds,
  locationNamesOf,
} from "../locations/locations.repository.js";
import {
  findPlotOwners,
  insertProperties,
  plotIdentityKey,
  propertyValues,
  recordPropertiesCreated,
} from "../properties/properties.repository.js";
import {
  propertyPayloadSchema,
  type PropertyPayload,
} from "../properties/properties.schema.js";

type RawRow = Record<string, unknown>;

export class ImportError extends Error {
  constructor(
    message: string,
    readonly statusCode: 400 | 409 = 400,
  ) {
    super(message);
    this.name = "ImportError";
  }
}

function assertRowLimit(rows: RawRow[]) {
  if (rows.length > MAX_IMPORT_ROWS) {
    throw new ImportError(
      `يحتوي الملف على ${rows.length} صف، والحد الأقصى ${MAX_IMPORT_ROWS} صف في الاستيراد الواحد. قسّم الملف إلى ملفات أصغر.`,
    );
  }
}

async function existingPhones(database: Pick<Transaction, "select"> = db) {
  const rows = await database
    .select({ phone: properties.ownerPhone })
    .from(properties);
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

export async function validateImport(
  rows: RawRow[],
): Promise<ValidationResult> {
  assertRowLimit(rows);
  const phones = await existingPhones();
  const seenPhones = new Set<string>();
  const result: ValidationResult = {
    total: rows.length,
    valid_count: 0,
    duplicate_count: 0,
    error_count: 0,
    errors: [],
    duplicates: [],
  };

  rows.forEach((row, index) => {
    const rowNumber = index + 1;
    const parsed = propertyPayloadSchema.safeParse(row);
    if (!parsed.success) {
      result.error_count += 1;
      result.errors.push({
        row: rowNumber,
        message: parsed.error.issues
          .map((i) => `${i.path.join(".")}: ${i.message}`)
          .join("، "),
      });
      return;
    }

    const phone = parsed.data.owner_phone.trim();
    if (phones.has(phone) || seenPhones.has(phone)) {
      result.duplicate_count += 1;
      result.duplicates.push({
        row: rowNumber,
        reason: `رقم هاتف مكرر: ${phone}`,
      });
      return;
    }

    seenPhones.add(phone);
    result.valid_count += 1;
  });

  return result;
}

/**
 * يُدرج الصفوف الصالحة في معاملة واحدة: إما تُحفظ كلها أو لا يُحفظ شيء.
 * الصفوف غير الصالحة أو المكررة تُتجاهل كما في التحقق، ويُبلَّغ عن سببها.
 * المعاملة تحمل قفل رموز العروض، فتنتظر الإضافات الأخرى حتى تنتهي.
 */
export async function commitImport(rows: RawRow[], userId?: number) {
  assertRowLimit(rows);
  const errors: Array<{ row: number; message: string }> = [];
  const parsed: Array<{ row: number; payload: PropertyPayload }> = [];
  for (let index = 0; index < rows.length; index += 1) {
    // Parsing 5,000 rows takes 20–65 ms; let other requests in between.
    if (index > 0 && index % 500 === 0) await yieldToEventLoop();
    const result = propertyPayloadSchema.safeParse(rows[index]);
    if (result.success) {
      parsed.push({ row: index + 1, payload: result.data });
    } else {
      errors.push({
        row: index + 1,
        message: result.error.issues.map((i) => i.message).join("، "),
      });
    }
  }

  let created;
  try {
    created = await withRecordCodeLock("properties", async (tx) => {
      // Every lookup reads the whole file's rows at once, after the lock,
      // so it sees the listings committed before this import.
      const phones = await existingPhones(tx);
      const names = await getLocationNamesByIds(
        parsed.map((entry) => entry.payload),
        tx,
      );
      const candidates = parsed.map((entry) => ({
        ...entry,
        values: propertyValues(
          entry.payload,
          locationNamesOf(names, entry.payload),
        ),
      }));
      const plotOwners = await findPlotOwners(
        tx,
        candidates.map((candidate) => candidate.values),
      );
      const owners = await existingPeople(
        tx,
        parsed.map((entry) => entry.payload.owner_person_id),
      );

      // A row skipped here is not "seen": a later row with its phone or plot
      // still goes in, as when each row was saved on its own.
      const seenPhones = new Set<string>();
      const accepted = [];
      for (const { row, payload, values } of candidates) {
        const phone = payload.owner_phone.trim();
        if (phones.has(phone) || seenPhones.has(phone)) continue;

        const plotKey = plotIdentityKey(values);
        const plotOwner =
          plotKey === null ? undefined : plotOwners.get(plotKey);
        if (plotOwner !== undefined) {
          errors.push({
            row,
            message: new DuplicatePlotError(plotOwner).message,
          });
          continue;
        }
        if (payload.owner_person_id && !owners.has(payload.owner_person_id)) {
          errors.push({ row, message: "الشخص المحدد كمالك غير موجود." });
          continue;
        }

        seenPhones.add(phone);
        if (plotKey !== null) plotOwners.set(plotKey, values.ownerName);
        accepted.push(values);
      }
      return insertProperties(tx, accepted);
    });
  } catch (error) {
    throw importFailure(error);
  }

  await recordPropertiesCreated(created, userId);
  errors.sort((a, b) => a.row - b.row);
  return {
    inserted: created.length,
    skipped: rows.length - created.length,
    errors,
  };
}

async function existingPeople(
  tx: Transaction,
  ids: Array<number | null | undefined>,
) {
  const wanted = [...new Set(ids.filter((id): id is number => Boolean(id)))];
  if (wanted.length === 0) return new Set<number>();
  const rows = await tx
    .select({ id: people.id })
    .from(people)
    .where(inArray(people.id, wanted));
  return new Set(rows.map((row) => row.id));
}

/** رفضت قاعدة البيانات صفاً أثناء الإدراج، فأُلغي الاستيراد كله. */
function importFailure(error: unknown) {
  const sqlState = postgresError(error)?.code ?? "";
  if (sqlState.startsWith("22")) {
    return new ImportError(
      "تعذّر حفظ الاستيراد ولم يُضف أي عرض: في الملف قيمة خارج الحدود المسموحة، مثل مساحة أو سعر كبير جداً.",
    );
  }
  if (sqlState.startsWith("23")) {
    return new ImportError(
      "تعذّر حفظ الاستيراد ولم يُضف أي عرض: أحد الصفوف يتعارض مع عرض محفوظ للتو. تحقق من الملف مجدداً ثم أعد الاستيراد.",
      409,
    );
  }
  return error;
}
