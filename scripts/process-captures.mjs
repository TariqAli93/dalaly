/**
 * pnpm capture:process — يحوّل المواد الخام التي أنتجها Playwright إلى
 * أصول جاهزة للموقع.
 *
 * المدخلات:
 *   source-assets/captures/dalaly/<group>/<name>/meta.json     (بطاقة الميزة)
 *   source-assets/captures/dalaly/<group>/<name>/screenshot*.png
 *   <meta.outputDir>/video.webm                                (فيديو Playwright الخام)
 *
 * المخرجات:
 *   public/videos/dalaly/<group>/<name>/desktop.webm
 *   public/videos/dalaly/<group>/<name>/desktop.mp4
 *   public/posters/dalaly/<group>/<name>.webp
 *   public/images/products/dalaly/<group>/<name>/desktop.webp
 *   docs/capture-manifest.json
 *
 * قواعد ثابتة: بلا صوت، بلا تسريع، بلا تغيير نسبة العرض، والملفات الخام تبقى.
 */
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { ROOT } from "./web-demo-env.mjs";

const PRODUCT = "dalaly";
const RAW_DIR = path.join(ROOT, "source-assets", "captures", PRODUCT);
const PUBLIC_DIR = path.join(ROOT, "public");
const MANIFEST = path.join(ROOT, "docs", "capture-manifest.json");

/** أقصى سكون يُترك في نهاية الفيديو بعد آخر حركة (ثانية). */
const TAIL_HOLD = 1.8;
/**
 * تقدّم بسيط بعد أول ظهور للمحتوى (ثانية). موجب عمداً: أول ~0.4s من كل
 * فيديو هي شاشة بيضاء/رمادية أثناء إقلاع الواجهة، فنبدأ بعدها بقليل حتى
 * لا يفتتح الفيديو بإطار فارغ. لا نرجع للخلف إطلاقاً.
 */
const HEAD_LEAD = 0.12;
/** لا نُخرج فيديو أقصر من هذا مهما قال الكشف. */
const MIN_DURATION = 3;

function which(command) {
  const probe = spawnSync(command, ["-version"], { shell: process.platform === "win32" });
  return probe.status === 0;
}

if (!which("ffmpeg") || !which("ffprobe")) {
  console.error(
    "✗ FFmpeg غير متوفر في PATH.\n" +
      "  هذا السكربت لا يثبّت شيئاً عالمياً. ثبّت FFmpeg يدوياً ثم أعد التشغيل:\n" +
      "  https://ffmpeg.org/download.html  (على Windows: winget install Gyan.FFmpeg)",
  );
  process.exit(1);
}

function ffprobeDuration(file) {
  const out = execFileSync(
    "ffprobe",
    ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file],
    { encoding: "utf8" },
  );
  return Number(out.trim()) || 0;
}

function ffmpegStderr(args) {
  const result = spawnSync("ffmpeg", args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  return `${result.stderr ?? ""}`;
}

/**
 * أول لحظة يظهر فيها محتوى فعلي (نهاية شاشة الإقلاع الفارغة).
 *
 * لا نعتمد على تغيّر البكسل (scene): أول ~1s من كل فيديو هي قشرة التطبيق
 * الفارغة (أبيض ثم رمادي موحّد) قبل أن تُرسم الواجهة، وتغيّر البكسل يلتقط
 * ومضة الرمادي فيبقى الفيديو مفتتحاً بإطار فارغ.
 *
 * المقياس الموثوق: «مدى الإضاءة» لكل إطار (YMAX − YMIN). الإطار الفارغ
 * الموحّد (أبيض أو رمادي) مداه ≈ 0، وأول إطار فيه أي محتوى (بطاقة دخول،
 * شريط علوي، جدول) يقفز مداه إلى مئتين لوجود نصّ داكن على خلفية فاتحة.
 * يعمل مع الشاشات المزدحمة والقليلة المحتوى معاً.
 */
function detectFirstMotion(file) {
  const stderr = ffmpegStderr([
    "-hide_banner",
    "-i", file,
    "-vf", "signalstats,metadata=print",
    "-an", "-f", "null", "-",
  ]);

  const lines = stderr.split(/\r?\n/);
  let pts = 0;
  let ymin = null;
  for (const line of lines) {
    const timeMatch = /pts_time:([0-9.]+)/.exec(line);
    if (timeMatch) {
      pts = Number(timeMatch[1]);
      ymin = null;
      continue;
    }
    const minMatch = /signalstats\.YMIN=([0-9.]+)/.exec(line);
    if (minMatch) {
      ymin = Number(minMatch[1]);
      continue;
    }
    const maxMatch = /signalstats\.YMAX=([0-9.]+)/.exec(line);
    if (maxMatch && ymin !== null && Number(maxMatch[1]) - ymin >= 60) {
      return pts;
    }
  }
  return 0;
}

/** آخر لحظة سكنت فيها الصورة (بداية الثبات النهائي). */
function detectLastFreeze(file) {
  const stderr = ffmpegStderr([
    "-hide_banner",
    "-i", file,
    "-vf", "freezedetect=n=-55dB:d=0.6",
    "-an", "-f", "null", "-",
  ]);
  const times = [...stderr.matchAll(/freeze_start:\s*([0-9.]+)/g)].map((m) => Number(m[1]));
  return times.length ? times[times.length - 1] : null;
}

/** يحسب نافذة القص مع ضمانات ألّا نقصّ محتوى مفيداً. */
function computeTrim(file) {
  const duration = ffprobeDuration(file);
  if (!duration) return { start: 0, duration: 0, original: 0 };

  const firstMotion = detectFirstMotion(file);
  // نبدأ عند أول ظهور للمحتوى + تقدّم بسيط للأمام (لا رجوع للخلف).
  let start = firstMotion > 0 ? firstMotion + HEAD_LEAD : 0;
  // حارس: لا نقصّ أكثر من نصف الفيديو من البداية.
  if (start > duration / 2) start = 0;

  const lastFreeze = detectLastFreeze(file);
  let end = duration;
  if (lastFreeze !== null && lastFreeze > start) {
    end = Math.min(duration, lastFreeze + TAIL_HOLD);
  }

  let length = end - start;
  if (length < MIN_DURATION) {
    length = Math.min(duration - start, Math.max(MIN_DURATION, length));
  }
  if (length <= 0) {
    return { start: 0, duration, original: duration };
  }

  return { start, duration: length, original: duration };
}

function run(args) {
  const result = spawnSync("ffmpeg", args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  if (result.status !== 0) {
    throw new Error(`ffmpeg فشل:\n${result.stderr}`);
  }
}

function sizeOf(file) {
  return fs.existsSync(file) ? fs.statSync(file).size : 0;
}

function human(bytes) {
  if (!bytes) return "—";
  const mb = bytes / (1024 * 1024);
  return mb >= 1 ? `${mb.toFixed(2)} MB` : `${(bytes / 1024).toFixed(0)} KB`;
}

/** يجمع كل بطاقات الميزات من مجلد المواد الخام. */
function collectFeatures(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      collectFeatures(full, out);
    } else if (entry.name === "meta.json") {
      out.push({ dir, meta: JSON.parse(fs.readFileSync(full, "utf8")) });
    }
  }
  return out;
}

if (!fs.existsSync(RAW_DIR)) {
  console.error(`✗ لا توجد مواد خام في ${path.relative(ROOT, RAW_DIR)}. شغّل pnpm capture:all أولاً.`);
  process.exit(1);
}

const features = collectFeatures(RAW_DIR).sort((a, b) => a.meta.id.localeCompare(b.meta.id));
console.log(`→ ${features.length} ميزة في المواد الخام.\n`);

const manifest = [];

for (const { dir, meta } of features) {
  const relId = meta.id;
  const videoOutDir = path.join(PUBLIC_DIR, "videos", PRODUCT, ...relId.split("/"));
  const posterFile = path.join(PUBLIC_DIR, "posters", PRODUCT, `${relId}.webp`);
  const imageOutDir = path.join(PUBLIC_DIR, "images", "products", PRODUCT, ...relId.split("/"));

  fs.mkdirSync(videoOutDir, { recursive: true });
  fs.mkdirSync(path.dirname(posterFile), { recursive: true });
  fs.mkdirSync(imageOutDir, { recursive: true });

  const entry = {
    id: relId,
    title: meta.title,
    route: meta.route,
    raw: path.relative(ROOT, dir).replace(/\\/g, "/"),
    screenshots: [],
    video: null,
    poster: null,
  };

  // ---------- الصور الثابتة ----------
  const shots = fs
    .readdirSync(dir)
    .filter((name) => name.startsWith("screenshot") && name.endsWith(".png"))
    .sort();

  for (const shot of shots) {
    const isPrimary = shot === "screenshot.png";
    const target = path.join(
      imageOutDir,
      isPrimary ? "desktop.webp" : `${shot.replace(/\.png$/, "")}.webp`,
    );
    run([
      "-y", "-loglevel", "error",
      "-i", path.join(dir, shot),
      "-quality", "88",
      target,
    ]);
    entry.screenshots.push({
      source: `${entry.raw}/${shot}`,
      output: path.relative(ROOT, target).replace(/\\/g, "/"),
      bytes: sizeOf(target),
    });
  }

  // ---------- الفيديو ----------
  const rawVideo = meta.outputDir ? path.join(meta.outputDir, "video.webm") : null;

  if (!rawVideo || !fs.existsSync(rawVideo)) {
    console.log(`⚠ ${relId} — لا يوجد فيديو خام (${rawVideo ?? "بلا مسار"})`);
    manifest.push(entry);
    continue;
  }

  const trim = computeTrim(rawVideo);
  const webm = path.join(videoOutDir, "desktop.webm");
  const mp4 = path.join(videoOutDir, "desktop.mp4");

  const trimArgs = ["-ss", trim.start.toFixed(2), "-t", trim.duration.toFixed(2)];

  // WebM (VP9) — بلا صوت، بلا تغيير أبعاد أو سرعة.
  run([
    "-y", "-loglevel", "error",
    ...trimArgs,
    "-i", rawVideo,
    "-an",
    "-c:v", "libvpx-vp9",
    "-crf", "32", "-b:v", "0",
    "-row-mt", "1", "-deadline", "good", "-cpu-used", "2",
    "-pix_fmt", "yuv420p",
    webm,
  ]);

  // MP4 (H.264) للتوافق الواسع.
  run([
    "-y", "-loglevel", "error",
    ...trimArgs,
    "-i", rawVideo,
    "-an",
    "-c:v", "libx264",
    "-crf", "23", "-preset", "slow",
    "-profile:v", "high", "-level", "4.1",
    "-pix_fmt", "yuv420p",
    "-movflags", "+faststart",
    mp4,
  ]);

  // Poster من الحالة النهائية للميزة (لا من الإطار الأول الفارغ).
  const posterAt = Math.max(0, trim.duration - 1.0);
  run([
    "-y", "-loglevel", "error",
    "-ss", (trim.start + posterAt).toFixed(2),
    "-i", rawVideo,
    "-frames:v", "1",
    "-quality", "88",
    posterFile,
  ]);

  entry.video = {
    source: path.relative(ROOT, rawVideo).replace(/\\/g, "/"),
    webm: path.relative(ROOT, webm).replace(/\\/g, "/"),
    mp4: path.relative(ROOT, mp4).replace(/\\/g, "/"),
    originalSeconds: Number(trim.original.toFixed(2)),
    seconds: Number(trim.duration.toFixed(2)),
    webmBytes: sizeOf(webm),
    mp4Bytes: sizeOf(mp4),
  };
  entry.poster = {
    output: path.relative(ROOT, posterFile).replace(/\\/g, "/"),
    bytes: sizeOf(posterFile),
  };

  console.log(
    `✓ ${relId.padEnd(32)} ${trim.duration.toFixed(1)}s  ` +
      `webm ${human(entry.video.webmBytes)}  mp4 ${human(entry.video.mp4Bytes)}  ` +
      `poster ${human(entry.poster.bytes)}`,
  );

  manifest.push(entry);
}

fs.mkdirSync(path.dirname(MANIFEST), { recursive: true });
fs.writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2), "utf8");

const withVideo = manifest.filter((entry) => entry.video).length;
const shotCount = manifest.reduce((sum, entry) => sum + entry.screenshots.length, 0);

console.log("");
console.log(`✓ ${manifest.length} ميزة · ${shotCount} لقطة · ${withVideo} فيديو.`);
console.log(`  البيان: ${path.relative(ROOT, MANIFEST)}`);
console.log("  الملفات الخام لم تُحذف.");
