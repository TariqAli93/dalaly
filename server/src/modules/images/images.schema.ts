import { z } from "zod";
import { THUMBNAIL_MAX_BYTES } from "./images.service.js";

const JPEG_DATA_URL = "data:image/jpeg;base64,";

/** مصغّرة صنعتها الواجهة: data URL لصورة JPEG. */
const thumbnailData = z
  .string()
  .max(JPEG_DATA_URL.length + Math.ceil(THUMBNAIL_MAX_BYTES / 3) * 4)
  .regex(/^data:image\/jpeg;base64,[A-Za-z0-9+/]+=*$/);

/** رفع صور عقار أو إيجار، لكل صورة مصغّرتها إن صنعتها الواجهة. */
export const imageUploadSchema = z.object({
  images: z
    .array(
      z.object({
        data: z.string().min(1),
        original_name: z.string().optional().nullable(),
        thumbnail: thumbnailData.optional().nullable(),
      }),
    )
    .min(1),
});

export const imageOrderSchema = z.object({
  ids: z.array(z.coerce.number().int().positive()).default([]),
});

export const thumbnailSchema = z.object({ data: thumbnailData });
