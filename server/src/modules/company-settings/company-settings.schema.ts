import { z } from "zod";
const optionalText = z.string().trim().optional().nullable().transform((value) => value || null);
export const companySettingsSchema = z.object({
  company_name: z.string().trim().default(""),
  phone_primary: optionalText,
  phone_secondary: optionalText,
  email: optionalText,
  address: optionalText,
  additional_contact: optionalText,
});
export const companyLogoSchema = z.object({ data: z.string().min(1), original_name: optionalText, file_type: z.string().trim().min(1).default("image/png") });
export type CompanySettingsPayload = z.infer<typeof companySettingsSchema>;
export type CompanyLogoPayload = z.infer<typeof companyLogoSchema>;
