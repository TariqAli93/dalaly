import { z } from "zod";
import { coordinateNumber, googleMapsUrl } from "../utils/google-maps-url.js";

function coordinate(limit: number) {
  return z.preprocess(
    (value) => (value === undefined ? undefined : coordinateNumber(value)),
    z.number().min(-limit).max(limit).nullable().optional(),
  );
}

export const locationFields = {
  latitude: coordinate(90),
  longitude: coordinate(180),
  location_link: z
    .string()
    .trim()
    .max(2048)
    .nullable()
    .optional()
    .transform((value) => (value === "" ? null : value))
    .refine(
      (value) => !value || googleMapsUrl(value) !== null,
      "أدخل رابط خرائط Google صالحاً وآمناً.",
    ),
};

export function refineLocation(
  value: { latitude?: number | null; longitude?: number | null },
  ctx: z.RefinementCtx,
) {
  if (
    (value.latitude === undefined) !== (value.longitude === undefined) ||
    (value.latitude === null) !== (value.longitude === null)
  ) {
    ctx.addIssue({
      code: "custom",
      path: ["latitude"],
      message: "أدخل خط العرض وخط الطول معاً، أو امسحهما معاً.",
    });
  }
}
