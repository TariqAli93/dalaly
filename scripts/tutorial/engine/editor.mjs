// Automated editing with FFmpeg: one template for every lesson. The narration
// track is assembled sample-exactly from the clips at the times the executor
// recorded; subtitles come from the same timeline; zooms are an eased
// push-in (zoompan) on the live recording; loudness is normalised (EBU R128);
// output is H.264/AAC 1080p30 MP4 with a soft Arabic subtitle track and, by
// default, burned-in subtitles.
import fs from "node:fs";
import path from "node:path";
import { ROOT, run } from "./util.mjs";
import { readWav, writeWav } from "./narrator.mjs";

// ---------- FFmpeg ----------
const LOCAL_FFMPEG = path.join(ROOT, "tools", "ffmpeg");
// gyan.dev is the FFmpeg project's recommended Windows build source; it
// publishes a SHA-256 next to each archive. Pin `sha256` in the config to
// accept only one exact build.
const GYAN = "https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip";

async function works(binary) {
  try {
    await run(binary, ["-hide_banner", "-version"], { timeoutMs: 15_000 });
    return true;
  } catch {
    return false;
  }
}

/** Finds ffmpeg/ffprobe: project-local tools/ffmpeg, then PATH, then a verified download into tools/ffmpeg. */
export async function resolveFfmpeg({ log, allowDownload = true, pinnedSha256 = "" }) {
  const local = { ffmpeg: path.join(LOCAL_FFMPEG, "bin", "ffmpeg.exe"), ffprobe: path.join(LOCAL_FFMPEG, "bin", "ffprobe.exe"), source: "tools/ffmpeg" };
  if (fs.existsSync(local.ffmpeg) && (await works(local.ffmpeg))) return local;
  if ((await works("ffmpeg")) && (await works("ffprobe"))) return { ffmpeg: "ffmpeg", ffprobe: "ffprobe", source: "PATH" };
  if (!allowDownload || process.platform !== "win32") throw new Error("FFmpeg not found. Install it (e.g. `winget install Gyan.FFmpeg`) or put ffmpeg.exe and ffprobe.exe in tools/ffmpeg/bin.");
  log.warn("ffmpeg.download", { message: `not found; downloading ${GYAN} into tools/ffmpeg (project-local, nothing system-wide)` });
  const staging = path.join(LOCAL_FFMPEG, ".download");
  fs.rmSync(staging, { recursive: true, force: true });
  fs.mkdirSync(staging, { recursive: true });
  const archive = path.join(staging, "ffmpeg.zip");
  const response = await fetch(GYAN);
  if (!response.ok) throw new Error(`FFmpeg download failed: HTTP ${response.status}`);
  fs.writeFileSync(archive, Buffer.from(await response.arrayBuffer()));
  const published = (await (await fetch(`${GYAN}.sha256`)).text()).trim().split(/\s+/)[0].toLowerCase();
  const { createHash } = await import("node:crypto");
  const actual = createHash("sha256").update(fs.readFileSync(archive)).digest("hex");
  const expected = pinnedSha256 || published;
  if (!/^[0-9a-f]{64}$/.test(expected) || actual !== expected) throw new Error(`FFmpeg archive checksum mismatch (expected ${expected}, got ${actual}); nothing installed`);
  const extracted = path.join(staging, "x");
  await run("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", `Expand-Archive -LiteralPath '${archive}' -DestinationPath '${extracted}' -Force`], { timeoutMs: 5 * 60_000 });
  const folder = fs.readdirSync(extracted).find((name) => fs.existsSync(path.join(extracted, name, "bin", "ffmpeg.exe")));
  if (!folder) throw new Error("FFmpeg archive has no bin/ffmpeg.exe");
  fs.mkdirSync(path.join(LOCAL_FFMPEG, "bin"), { recursive: true });
  for (const name of ["ffmpeg.exe", "ffprobe.exe"]) fs.copyFileSync(path.join(extracted, folder, "bin", name), path.join(LOCAL_FFMPEG, "bin", name));
  fs.rmSync(staging, { recursive: true, force: true });
  if (!(await works(local.ffmpeg))) throw new Error("Downloaded FFmpeg does not run");
  log.info("ffmpeg.installed", { message: `tools/ffmpeg (sha256 ${actual.slice(0, 12)}…)` });
  return { ...local, source: "downloaded to tools/ffmpeg" };
}

export async function probe(ffprobe, file) {
  const { stdout } = await run(ffprobe, ["-v", "error", "-show_streams", "-show_format", "-show_chapters", "-count_frames", "-of", "json", file], { timeoutMs: 5 * 60_000 });
  return JSON.parse(stdout);
}

// ---------- subtitles ----------
const stamp = (seconds) => {
  const ms = Math.max(0, Math.round(seconds * 1000));
  const pad = (value, size = 2) => String(value).padStart(size, "0");
  return `${pad(Math.floor(ms / 3_600_000))}:${pad(Math.floor(ms / 60_000) % 60)}:${pad(Math.floor(ms / 1000) % 60)},${pad(ms % 1000, 3)}`;
};

/** Splits narration into readable subtitle lines (≤ ~70 chars) at clause boundaries. */
export function splitCaption(text, max = 70) {
  const words = text.split(/\s+/);
  const chunks = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length > max && current) {
      chunks.push(current);
      current = word;
    } else current = next;
    if (/[،,.؟?!:]$/.test(word) && current.length > max * 0.55) {
      chunks.push(current);
      current = "";
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

export function buildCues(timeline, offset = 0) {
  const cues = [];
  for (const clip of timeline) {
    const parts = splitCaption(clip.text);
    const total = parts.reduce((sum, part) => sum + part.length, 0);
    let at = clip.start;
    for (const part of parts) {
      const length = (clip.duration * part.length) / total;
      cues.push({ start: offset + at, end: offset + at + length, text: part });
      at += length;
    }
  }
  return cues;
}

const RLM = String.fromCharCode(0x200f);

export function writeSrt(file, cues) {
  // RLM marks make each line a right-to-left paragraph, so a renderer that
  // defaults to left-to-right (libass does) keeps end punctuation on the left.
  const body = cues.map((cue, index) => `${index + 1}\n${stamp(cue.start)} --> ${stamp(cue.end - 0.02)}\n${RLM}${cue.text}${RLM}\n`).join("\n");
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${body}\n`, "utf8");
}

// ---------- narration track ----------
/** Mixes the timeline's clips into one mono track exactly `duration` long. */
export function buildNarrationTrack(timeline, duration, sampleRate, file) {
  const total = Math.round(duration * sampleRate);
  const mix = new Int32Array(total);
  for (const clip of timeline) {
    const wav = readWav(clip.file);
    const start = Math.round(clip.start * sampleRate);
    const count = wav.samples.length / 2;
    for (let index = 0; index < count && start + index < total; index += 1) mix[start + index] += wav.samples.readInt16LE(index * 2);
  }
  const out = Buffer.alloc(total * 2);
  for (let index = 0; index < total; index += 1) out.writeInt16LE(Math.max(-32768, Math.min(32767, mix[index])), index * 2);
  writeWav(file, out, sampleRate);
  return file;
}

// ---------- zoom ----------
const RAMP = 0.6;

/**
 * Push-in windows for steps marked `zoom`, from the element rectangles the
 * executor measured (CSS px → video px). Neighbouring windows merge into one
 * framing the union of their elements, so the camera does not pump in and out
 * between consecutive fields.
 */
export function zoomSegments(steps, lessonSteps, video, duration) {
  const scale = video.width / video.viewport.width;
  const raw = [];
  for (const result of steps) {
    const spec = lessonSteps.find((step) => step.id === result.id);
    if (!spec?.zoom || result.status !== "ok" || !result.rect) continue;
    const start = result.started + 0.5;
    const end = Math.min(duration - 0.6, (result.finished ?? result.started) - 0.1);
    if (end - start < RAMP * 2 + 0.4) continue;
    const r = result.rect;
    raw.push({ steps: [result.id], start, end, maxZoom: Math.min(video.maxZoom, typeof spec.zoom === "number" ? spec.zoom : video.maxZoom), box: [r.x * scale, r.y * scale, (r.x + r.width) * scale, (r.y + r.height) * scale] });
  }
  const merged = [];
  for (const segment of raw) {
    const last = merged.at(-1);
    if (last && segment.start - last.end < 1.5) {
      last.end = segment.end;
      last.steps.push(...segment.steps);
      last.maxZoom = Math.min(last.maxZoom, segment.maxZoom);
      last.box = [Math.min(last.box[0], segment.box[0]), Math.min(last.box[1], segment.box[1]), Math.max(last.box[2], segment.box[2]), Math.max(last.box[3], segment.box[3])];
    } else merged.push({ ...segment, steps: [...segment.steps], box: [...segment.box] });
  }
  return merged
    .map((segment) => {
      // Zoom no further than keeps the whole framed area (plus a margin) in view.
      const [x1, y1, x2, y2] = segment.box;
      const fit = Math.min(video.width / (x2 - x1 + 160), video.height / (y2 - y1 + 120));
      const zoom = Math.min(segment.maxZoom, fit);
      return { steps: segment.steps, start: Number(segment.start.toFixed(3)), end: Number(segment.end.toFixed(3)), zoom: Number(zoom.toFixed(3)), cx: Math.round((x1 + x2) / 2), cy: Math.round((y1 + y2) / 2) };
    })
    .filter((segment) => segment.zoom >= 1.08);
}

/** One zoompan filter: eased push-in and pull-out per window, still frame in between. */
function zoomFilter(zooms, video) {
  const ease = (u) => `(${u})*(${u})*(3-2*(${u}))`;
  const ramps = zooms.map((zoom) => {
    const up = `clip((in_time-${zoom.start})/${RAMP},0,1)`;
    const down = `clip((${zoom.end}-in_time)/${RAMP},0,1)`;
    return { zoom, ramp: `${ease(up)}*${ease(down)}` };
  });
  const z = `1${ramps.map(({ zoom, ramp }) => `+${(zoom.zoom - 1).toFixed(3)}*${ramp}`).join("")}`;
  const centre = (key, fallback) => ramps.reduceRight((inner, { zoom }) => `if(between(in_time,${zoom.start - 0.05},${zoom.end + 0.05}),${zoom[key]},${inner})`, fallback);
  const x = `max(0,min(iw-iw/zoom,${centre("cx", video.width / 2)}-iw/zoom/2))`;
  const y = `max(0,min(ih-ih/zoom,${centre("cy", video.height / 2)}-ih/zoom/2))`;
  return `zoompan=z='${z}':x='${x}':y='${y}':d=1:s=${video.width}x${video.height}:fps=${video.fps}`;
}

const subtitleStyle = (video) =>
  `FontName=${video.subtitleFont},FontSize=12,PrimaryColour=&H00F6F1EA,OutlineColour=&H40332A0F,BackColour=&H40332A0F,BorderStyle=3,Outline=7,Shadow=0,MarginV=18,Alignment=2,Bold=0`;

/**
 * Renders one lesson to MP4 + SRT. Returns { file, srt, duration, zooms, cues, cueList }.
 * `recording` is the recorder result, `timeline` the narration placements.
 */
export async function renderLesson({ ffmpeg, recording, timeline, steps, lesson, outFile, srtFile, workDir, video, narration, test = false, log }) {
  const duration = recording.frames / video.fps;
  fs.mkdirSync(workDir, { recursive: true });
  const track = buildNarrationTrack(timeline, duration, narration.sampleRate, path.join(workDir, `${lesson.id}.narration.wav`));
  const cues = buildCues(timeline);
  writeSrt(srtFile, cues);
  const localSrt = path.join(workDir, `${lesson.id}.srt`);
  fs.copyFileSync(srtFile, localSrt);
  const zooms = zoomSegments(steps, lesson.steps, video, duration);

  // Window recordings carry extra rows below the picture (rounded corners and
  // the frame counter, see recorder.mjs): keep only the picture.
  const graph = [`[0:v]crop=${video.width}:${video.height}:0:0[picture]`];
  let current = "[picture]";
  if (zooms.length) {
    graph.push(`${current}${zoomFilter(zooms, video)}[zoomed]`);
    current = "[zoomed]";
  }
  const fadeOut = Math.max(0, duration - video.fadeSeconds).toFixed(3);
  let tail = `${current}format=yuv420p,fade=t=in:st=0:d=${video.fadeSeconds},fade=t=out:st=${fadeOut}:d=${video.fadeSeconds}`;
  if (video.burnSubtitles && cues.length) tail += `,subtitles=filename=${path.basename(localSrt)}:charenc=UTF-8:force_style='${subtitleStyle(video)}'`;
  graph.push(`${tail}[vout]`);
  const loud = narration.loudness;
  // A silent test track stays silent (loudnorm would only add noise-floor work).
  const audio = test ? "[1:a]aresample=48000" : `[1:a]loudnorm=I=${loud.I}:TP=${loud.TP}:LRA=${loud.LRA},aresample=48000`;
  graph.push(`${audio},aformat=channel_layouts=stereo,apad,atrim=0:${duration.toFixed(3)},afade=t=in:st=0:d=0.2,afade=t=out:st=${Math.max(0, duration - 0.3).toFixed(3)}:d=0.3[aout]`);

  const args = [
    "-hide_banner", "-loglevel", "error", "-y",
    // The recording's step clock starts at `offset` (after the sync marker).
    ...(recording.offset ? ["-ss", recording.offset.toFixed(3)] : []), "-i", recording.file, "-i", track, "-f", "srt", "-i", path.basename(localSrt),
    "-filter_complex", graph.join(";"),
    "-map", "[vout]", "-map", "[aout]", "-map", "2:s",
    "-c:v", "libx264", "-preset", video.preset, "-crf", String(video.crf), "-profile:v", "high", "-pix_fmt", "yuv420p", "-r", String(video.fps), "-g", String(video.fps * 2),
    "-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709", "-color_range", "tv",
    "-c:a", "aac", "-b:a", video.audioBitrate, "-ar", "48000", "-ac", "2",
    "-c:s", "mov_text", "-metadata:s:s:0", "language=ara", "-metadata:s:a:0", "language=ara",
    "-metadata", `title=دلالي — ${lesson.title}`,
    "-t", duration.toFixed(3), "-movflags", "+faststart", outFile,
  ];
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  // The subtitles filter reads a relative name, avoiding Windows drive-colon escaping.
  await run(ffmpeg, args, { cwd: workDir, timeoutMs: 60 * 60_000 });
  log.info("edit.lesson", { lesson: lesson.id, message: `${path.basename(outFile)} ${duration.toFixed(1)}s, ${cues.length} subtitle cues, ${zooms.length} zoom(s)` });
  return { file: outFile, srt: srtFile, duration, zooms, cues: cues.length, cueList: cues };
}

/**
 * Joins finished lessons into one course with FFmpeg's concat filter and one
 * encode. (Stream-copying with the concat demuxer left each lesson's MP4 edit
 * list in the timeline, so the course was not exactly 30/1.) Every lesson's
 * audio is padded or trimmed to its own video length, so sync cannot drift.
 */
export async function assembleCourse({ ffmpeg, lessons, outFile, srtFile, video, title = "دلالي — الدليل المصوّر", log }) {
  const cues = [];
  let offset = 0;
  for (const lesson of lessons) {
    cues.push(...lesson.cueList.map((cue) => ({ ...cue, start: cue.start + offset, end: cue.end + offset })));
    offset += lesson.duration;
  }
  writeSrt(srtFile, cues);
  // One chapter per lesson (FFmpeg metadata file), so players can jump between lessons.
  const escape = (text) => String(text).replace(/\s+/g, " ").replace(/[=;#\\]/g, (char) => `\\${char}`);
  let at = 0;
  const chapters = lessons.map((lesson, index) => {
    const start = Math.round(at * 1000);
    at += lesson.duration;
    return ["[CHAPTER]", "TIMEBASE=1/1000", `START=${start}`, `END=${Math.round(at * 1000)}`, `title=${escape(lesson.title ?? `${index + 1}`)}`];
  });
  const metadata = `${srtFile}.ffmeta`;
  fs.writeFileSync(metadata, `${[";FFMETADATA1", `title=${escape(title)}`, ...chapters.flat()].join("\n")}\n`, "utf8");
  const inputs = lessons.flatMap((lesson) => ["-i", lesson.file]);
  const parts = lessons.map((lesson, index) => {
    const length = lesson.duration.toFixed(3);
    return `[${index}:v]trim=duration=${length},setpts=PTS-STARTPTS,fps=${video.fps}[v${index}];[${index}:a]aresample=48000,apad,atrim=0:${length},asetpts=N/SR/TB[a${index}]`;
  });
  const graph = `${parts.join(";")};${lessons.map((_, index) => `[v${index}][a${index}]`).join("")}concat=n=${lessons.length}:v=1:a=1[vout][aout]`;
  await run(ffmpeg, [
    "-hide_banner", "-loglevel", "error", "-y",
    ...inputs, "-f", "srt", "-i", srtFile, "-f", "ffmetadata", "-i", metadata,
    "-filter_complex", graph,
    "-map", "[vout]", "-map", "[aout]", "-map", `${lessons.length}:s`, "-map_metadata", String(lessons.length + 1), "-map_chapters", String(lessons.length + 1),
    "-c:v", "libx264", "-preset", video.preset, "-crf", String(video.crf), "-profile:v", "high", "-pix_fmt", "yuv420p", "-r", String(video.fps), "-g", String(video.fps * 2),
    "-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709", "-color_range", "tv",
    "-c:a", "aac", "-b:a", video.audioBitrate, "-ar", "48000", "-ac", "2",
    "-c:s", "mov_text", "-metadata:s:s:0", "language=ara", "-metadata:s:a:0", "language=ara",
    "-metadata", `title=${title}`, "-movflags", "+faststart", outFile,
  ], { timeoutMs: 2 * 60 * 60_000 });
  fs.rmSync(metadata, { force: true });
  log.info("edit.course", { message: `${path.basename(outFile)} ${offset.toFixed(1)}s from ${lessons.length} lesson(s), ${chapters.length} chapters` });
  return { file: outFile, srt: srtFile, duration: offset, cues: cues.length, chapters: lessons.map((lesson) => lesson.title) };
}

/** A still frame (PNG) for visual QA of titles and subtitle shaping. */
export async function extractFrame(ffmpeg, file, seconds, png) {
  fs.mkdirSync(path.dirname(png), { recursive: true });
  await run(ffmpeg, ["-hide_banner", "-loglevel", "error", "-y", "-ss", seconds.toFixed(2), "-i", file, "-frames:v", "1", png]);
  return png;
}

