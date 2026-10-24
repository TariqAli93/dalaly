import { getToken } from "../services/api.service";
import { makeThumbnail } from "../utils/thumbnails";

type ThumbnailJob = {
  /** فريد لكل صورة، مثل `property:12`؛ تُجرَّب مرة واحدة في الجلسة. */
  key: string;
  /** رابط ملف الأصل (الذي يعرضه صف الجدول أصلاً). */
  source: string;
  save: (thumbnail: string) => Promise<unknown>;
};

const tried = new Set<string>();
const jobs: ThumbnailJob[] = [];
let running = false;

/** ينتظر لحظة خمول كي لا تنافس المصغّراتُ عرضَ الصفحة. */
function idle() {
  return new Promise<void>((resolve) =>
    requestIdleCallback(() => resolve(), { timeout: 2000 }),
  );
}

async function drain() {
  running = true;
  try {
    for (let job = jobs.shift(); job; job = jobs.shift()) {
      await idle();
      // خرج المستخدم: الروابط المنتظرة تحمل توكن الجلسة السابقة.
      if (!getToken()) {
        jobs.length = 0;
        break;
      }
      try {
        const response = await fetch(job.source);
        if (!response.ok) continue;
        const thumbnail = await makeThumbnail(await response.blob());
        if (thumbnail) await job.save(thumbnail);
      } catch {
        // المصغّرة اختيارية: يبقى الجدول يعرض الأصل.
      }
    }
  } finally {
    running = false;
  }
}

/**
 * يصنع مصغّرات الصور المرفوعة قبل وجود المصغّرات، أول مرة يعرضها جدول:
 * واحدة تلو الأخرى، في وقت الخمول، مرة لكل صورة في الجلسة. يعرضها الجدول
 * من تحميل القائمة التالي.
 */
export function useThumbnailBackfill() {
  function queueThumbnail(job: ThumbnailJob) {
    if (tried.has(job.key)) return;
    tried.add(job.key);
    jobs.push(job);
    if (!running) void drain();
  }
  return { queueThumbnail };
}
