import { z } from "zod";

export const DATABASE_NAME_PATTERN = /^[a-zA-Z0-9_]+$/;

const host = z.string().trim().min(1).default("127.0.0.1");
const port = z.coerce.number().int().positive().max(65535).default(5432);
const adminUsername = z.string().trim().min(1).default("postgres");
const adminPassword = z.string().default("");
const databaseName = z
  .string()
  .trim()
  .min(1)
  .max(63)
  .regex(DATABASE_NAME_PATTERN, "اسم قاعدة البيانات يجب أن يحتوي حروفاً وأرقاماً وشرطة سفلية فقط.")
  .default("dalaly");

export const testPostgresSchema = z.object({
  host,
  port,
  adminUsername,
  adminPassword,
  databaseName,
});

export const initializeSchema = z.object({
  host,
  port,
  adminUsername,
  adminPassword,
  databaseName,
  firstAdminUsername: z.string().trim().min(3).default("admin"),
  firstAdminPin: z.string().trim().min(4).max(12),
});

export type TestPostgresInput = z.infer<typeof testPostgresSchema>;
export type InitializeInput = z.infer<typeof initializeSchema>;
