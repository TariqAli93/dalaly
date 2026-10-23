import { readFileAsDataUrl } from "./files";

/**
 * أطول ضلع للمصغّرة بالبكسل: يكفي خلية الجدول (48×40) على شاشات مكبَّرة
 * حتى 2x مع القص، ويبقى الملف بعشرات الكيلوبايت بدل ميغابايتات الأصل.
 */
const THUMBNAIL_SIZE = 320;

/**
 * يصغّر صورة إلى JPEG ويعيده data URL، أو null إن لم يستطع المتصفح فكّها.
 * createImageBitmap يفك الصورة خارج الخيط الرئيسي ويطبّق اتجاه EXIF كما
 * يعرضها <img>. الأصل لا يُمس: المصغّرة نسخة إضافية.
 */
export async function makeThumbnail(source: Blob): Promise<string | null> {
  let bitmap: ImageBitmap | undefined;
  try {
    bitmap = await createImageBitmap(source, {
      imageOrientation: "from-image",
    });
    const scale = Math.min(
      1,
      THUMBNAIL_SIZE / Math.max(bitmap.width, bitmap.height),
    );
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext("2d");
    if (!context) return null;
    // JPEG بلا شفافية: خلفية بيضاء لصور PNG الشفافة بدل الأسود.
    context.fillStyle = "#fff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.imageSmoothingQuality = "high";
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", 0.8),
    );
    return blob ? await readFileAsDataUrl(blob) : null;
  } catch {
    return null;
  } finally {
    bitmap?.close();
  }
}
