// Quality checks on what was actually produced: media metadata from ffprobe,
// subtitle files, narration placement against the recorded steps, and the
// coverage report. Every result here is measured, never assumed.
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { analyzeAudio, loudness, voicedWithin, wordRecall } from "./audio.mjs";
import { probe } from "./editor.mjs";
import { run } from "./util.mjs";

/** A 16 kHz mono WAV of [start, start + duration] of a file's audio — what speech-to-text accepts. */
export async function listenableExcerpt(ffmpeg, file, out, start = 0, duration) {
  fs.mkdirSync(path.dirname(out), { recursive: true });
  await run(ffmpeg, ["-hide_banner", "-loglevel", "error", "-y", "-ss", start.toFixed(3), ...(duration ? ["-t", duration.toFixed(3)] : []), "-i", file, "-map", "0:a:0", "-ac", "1", "-ar", "16000", "-c:a", "pcm_s16le", out]);
  return out;
}

/**
 * Proves a produced video carries the narration where the timeline put it:
 *  • the track is audible and loudness-normalised (EBU R128);
 *  • each narration window is mostly voiced (catches silence, misplacement);
 *  • listening check: one narrated span is decoded back out of the final
 *    file and transcribed by Azure speech-to-text; the words must match.
 * `timeline` items are { step, start, duration, text } in seconds of this file.
 */
export async function checkNarration({ ffmpeg, file, timeline, limits, transcribe, workDir, label }) {
  const problems = [];
  const analysis = await analyzeAudio(ffmpeg, file, { noiseDb: limits.silenceNoiseDb, minSilence: limits.silenceMinSeconds });
  const level = await loudness(ffmpeg, file);
  const windows = timeline.map((clip) => {
    const voiced = voicedWithin(analysis.silences, clip.start, clip.start + clip.duration);
    return { step: clip.step, start: Number(clip.start.toFixed(2)), duration: Number(clip.duration.toFixed(2)), voicedRatio: Number((voiced / Math.max(0.01, clip.duration)).toFixed(3)) };
  });
  const narrated = timeline.reduce((sum, clip) => sum + clip.duration, 0);
  const voicedInWindows = windows.reduce((sum, window) => sum + window.voicedRatio * window.duration, 0);
  if (!timeline.length) problems.push("no narration was placed in this video");
  if (!(analysis.maxDb >= limits.clipMinPeakDb)) problems.push(`inaudible: peak ${analysis.maxDb} dB`);
  const [low, high] = limits.lessonLoudnessLufs;
  if (!(level.integratedLufs >= low && level.integratedLufs <= high)) problems.push(`integrated loudness ${level.integratedLufs} LUFS outside ${low}…${high}`);
  if (level.truePeakDbfs !== null && level.truePeakDbfs > limits.maxTruePeakDbfs) problems.push(`true peak ${level.truePeakDbfs} dBFS above ${limits.maxTruePeakDbfs}`);
  for (const window of windows) if (window.voicedRatio < limits.windowMinVoicedRatio) problems.push(`${window.step}: only ${Math.round(window.voicedRatio * 100)}% voiced at ${window.start}s where its narration belongs`);
  if (narrated > 0 && voicedInWindows / narrated < limits.lessonMinVoicedShare) problems.push(`only ${Math.round((voicedInWindows / narrated) * 100)}% of the narrated time is voiced`);

  let listening = null;
  if (limits.listeningCheck && timeline.length) {
    // The longest line that fits speech-to-text's short-audio limit.
    const fitting = timeline.filter((clip) => clip.duration <= limits.maxListenSeconds);
    const pick = (fitting.length ? fitting : timeline).reduce((best, clip) => (clip.duration > best.duration ? clip : best));
    const span = Math.min(pick.duration + 0.3, limits.maxListenSeconds);
    const excerpt = await listenableExcerpt(ffmpeg, file, path.join(workDir, `${label}.listen.wav`), Math.max(0, pick.start - 0.1), span);
    const heard = await transcribe(excerpt);
    const recall = wordRecall(pick.text, heard.text);
    listening = { step: pick.step, at: Number(pick.start.toFixed(2)), seconds: Number(span.toFixed(2)), expected: pick.text, heard: heard.text, status: heard.status, recall };
    if (heard.status !== "Success" || recall < limits.minRecall) problems.push(`listening check failed at ${pick.start.toFixed(1)}s: heard "${heard.text}" (${heard.status}, ${Math.round(recall * 100)}% of "${pick.text.slice(0, 50)}…")`);
  }
  return {
    ok: problems.length === 0,
    problems,
    loudness: level,
    meanDb: analysis.meanDb,
    maxDb: analysis.maxDb,
    narratedSeconds: Number(narrated.toFixed(2)),
    voicedInWindowsSeconds: Number(voicedInWindows.toFixed(2)),
    windows,
    listening,
  };
}

const parseStamp = (value) => {
  const match = /^(\d{2}):(\d{2}):(\d{2}),(\d{3})$/.exec(value.trim());
  return match ? Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]) + Number(match[4]) / 1000 : NaN;
};

/** Parses and checks an SRT file: numbering, timing order, Arabic text, within the video. */
export function checkSrt(file, duration) {
  const problems = [];
  if (!fs.existsSync(file)) return { ok: false, cues: 0, problems: ["missing"] };
  const raw = fs.readFileSync(file, "utf8");
  const text = raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw;
  const blocks = text.trim() ? text.trim().split(/\r?\n\r?\n/) : [];
  let previousEnd = 0;
  blocks.forEach((block, index) => {
    const lines = block.split(/\r?\n/);
    if (Number(lines[0]) !== index + 1) problems.push(`cue ${index + 1}: numbered ${lines[0]}`);
    const [from, to] = (lines[1] ?? "").split(" --> ");
    const start = parseStamp(from ?? "");
    const end = parseStamp(to ?? "");
    if (!(end > start)) problems.push(`cue ${index + 1}: end not after start`);
    if (start < previousEnd - 0.001) problems.push(`cue ${index + 1}: overlaps the previous cue`);
    if (end > duration + 0.05) problems.push(`cue ${index + 1}: ends after the video (${end.toFixed(2)} > ${duration.toFixed(2)})`);
    if (!/[؀-ۿ]/.test(lines.slice(2).join(" "))) problems.push(`cue ${index + 1}: no Arabic text`);
    previousEnd = end;
  });
  return { ok: problems.length === 0, cues: blocks.length, problems };
}

/** "30000/1001" → 29.97; "0/0" → NaN. */
export function rational(value) {
  const [num, den = "1"] = String(value ?? "").split("/");
  const result = Number(num) / Number(den);
  return Number.isFinite(result) ? result : NaN;
}

/**
 * ffprobe checks against the delivery spec. Frame rate: the nominal rate
 * (r_frame_rate) must be the configured one, the average rate within 0.05 %
 * of it (a container's rational rounding such as 57054720/1901831 =
 * 29.99998 fps is not a defect), and the decoded frame count must match
 * duration × fps within one frame — that is what constant frame rate means.
 */
export async function checkMedia(ffprobe, file, video, { expectSubtitles = true, chapters: expectedChapters = null } = {}) {
  const problems = [];
  if (!fs.existsSync(file)) return { ok: false, problems: ["file missing"] };
  const info = await probe(ffprobe, file);
  const v = info.streams.find((stream) => stream.codec_type === "video");
  const a = info.streams.find((stream) => stream.codec_type === "audio");
  const s = info.streams.find((stream) => stream.codec_type === "subtitle");
  if (!/mp4/.test(info.format.format_name)) problems.push(`container ${info.format.format_name}`);
  let frameRate = null;
  if (!v) problems.push("no video stream");
  else {
    if (v.codec_name !== "h264") problems.push(`video codec ${v.codec_name}`);
    if (v.width !== video.width || v.height !== video.height) problems.push(`resolution ${v.width}x${v.height}`);
    const nominal = rational(v.r_frame_rate);
    const average = rational(v.avg_frame_rate);
    const frames = Number(v.nb_read_frames ?? v.nb_frames);
    const seconds = Number(v.duration ?? info.format.duration);
    frameRate = { nominal: v.r_frame_rate, average: v.avg_frame_rate, averageFps: Number(average.toFixed(5)), frames, expectedFrames: Math.round(seconds * video.fps) };
    if (Math.abs(nominal - video.fps) > 1e-6) problems.push(`nominal frame rate ${v.r_frame_rate}, expected ${video.fps}/1`);
    if (!(Math.abs(average - video.fps) <= video.fps * 5e-4)) problems.push(`average frame rate ${v.avg_frame_rate} (${average.toFixed(4)} fps) differs from ${video.fps}`);
    if (Number.isFinite(frames) && Math.abs(frames - seconds * video.fps) > 1.5) problems.push(`${frames} frames for ${seconds.toFixed(3)}s — not constant ${video.fps} fps (expected ${Math.round(seconds * video.fps)})`);
    if (v.pix_fmt !== "yuv420p") problems.push(`pixel format ${v.pix_fmt}`);
    // Orientation as a player shows it: no rotation metadata, square pixels,
    // and wider than tall unless the config asks for portrait.
    const rotation = Number(v.side_data_list?.find((item) => item.rotation !== undefined)?.rotation ?? v.tags?.rotate ?? 0);
    if (rotation % 360 !== 0) problems.push(`rotated ${rotation}°`);
    if (v.sample_aspect_ratio && !["1:1", "0:1", "N/A"].includes(v.sample_aspect_ratio)) problems.push(`non-square pixels ${v.sample_aspect_ratio}`);
    const landscape = v.width > v.height;
    if ((video.orientation ?? "landscape") === "landscape" ? !landscape : landscape) problems.push(`orientation ${landscape ? "landscape" : "portrait"}, expected ${video.orientation ?? "landscape"}`);
  }
  if (!a) problems.push("no audio stream");
  else if (a.codec_name !== "aac") problems.push(`audio codec ${a.codec_name}`);
  if (expectSubtitles && !s) problems.push("no subtitle track");
  const videoDuration = Number(v?.duration ?? info.format.duration);
  const audioDuration = Number(a?.duration ?? 0);
  const drift = Math.abs(videoDuration - audioDuration);
  if (drift > 0.1) problems.push(`audio/video length differ by ${drift.toFixed(3)}s`);
  // A course: one chapter per lesson, back to back, each as long as its lesson.
  const chapters = (info.chapters ?? []).map((chapter) => ({ title: chapter.tags?.title ?? "", start: Number(chapter.start_time), end: Number(chapter.end_time) }));
  if (expectedChapters) {
    if (chapters.length !== expectedChapters.length) problems.push(`${chapters.length} chapters for ${expectedChapters.length} lessons`);
    let at = 0;
    expectedChapters.forEach((expected, index) => {
      const chapter = chapters[index];
      if (!chapter) return;
      if (Math.abs(chapter.start - at) > 0.05 || Math.abs(chapter.end - chapter.start - expected.duration) > 0.05) problems.push(`chapter ${index + 1} spans ${chapter.start.toFixed(2)}–${chapter.end.toFixed(2)}s, expected ${at.toFixed(2)}–${(at + expected.duration).toFixed(2)}s`);
      if (chapter.title !== expected.title) problems.push(`chapter ${index + 1} is titled "${chapter.title}", expected "${expected.title}"`);
      at += expected.duration;
    });
    if (chapters.length && Math.abs(chapters.at(-1).end - videoDuration) > 0.1) problems.push(`chapters end at ${chapters.at(-1).end.toFixed(2)}s, the video at ${videoDuration.toFixed(2)}s`);
  }
  return {
    ok: problems.length === 0,
    problems,
    container: info.format.format_name,
    duration: Number(Number(info.format.duration).toFixed(3)),
    sizeBytes: Number(info.format.size),
    video: v ? { codec: v.codec_name, profile: v.profile, width: v.width, height: v.height, orientation: v.width > v.height ? "landscape" : "portrait", fps: v.avg_frame_rate, frameRate, frames: Number(v.nb_read_frames ?? v.nb_frames), pixFmt: v.pix_fmt, duration: videoDuration } : null,
    audio: a ? { codec: a.codec_name, sampleRate: Number(a.sample_rate), channels: a.channels, duration: audioDuration } : null,
    subtitles: s ? { codec: s.codec_name, language: s.tags?.language ?? null } : null,
    chapters: chapters.length ? { count: chapters.length, titles: chapters.map((chapter) => chapter.title) } : null,
  };
}

/**
 * Narration placement: each clip starts at or after the step it describes
 * (never before the action is visible), clips never overlap, and all end
 * inside the video.
 */
export function checkSync(timeline, steps, duration) {
  const problems = [];
  const started = new Map(steps.map((step) => [step.id, step.started]));
  timeline.forEach((clip, index) => {
    const stepStart = started.get(clip.step);
    if (stepStart === undefined) problems.push(`${clip.step}: narration for a step that did not run`);
    else if (clip.start < stepStart - 0.01) problems.push(`${clip.step}: narration starts ${(stepStart - clip.start).toFixed(2)}s before its step`);
    const next = timeline[index + 1];
    if (next && clip.start + clip.duration > next.start + 0.02) problems.push(`${clip.step}: overlaps ${next.step} by ${(clip.start + clip.duration - next.start).toFixed(2)}s`);
    if (clip.start + clip.duration > duration + 0.02) problems.push(`${clip.step}: runs past the end of the video`);
  });
  return { ok: problems.length === 0, clips: timeline.length, problems };
}

/**
 * One full decode of a finished file: decoding errors, long frozen stretches
 * (freezedetect) and black stretches (blackdetect, the fades excluded).
 */
export async function checkPlayback(ffmpeg, file, { fadeSeconds = 0.4, freezeSeconds = 12 } = {}) {
  const { stderr } = await run(ffmpeg, ["-hide_banner", "-nostats", "-v", "info", "-i", file, "-vf", `freezedetect=n=0.002:d=${freezeSeconds},blackdetect=d=0.6:pix_th=0.04:pic_th=0.98`, "-map", "0:v:0", "-f", "null", "-"], { timeoutMs: 60 * 60_000 }).catch((error) => ({ stderr: error.stderr ?? error.message, failed: true }));
  const errors = stderr.split(/\r?\n/).filter((line) => /error|corrupt|invalid|non monoton/i.test(line) && !/freezedetect|blackdetect/.test(line));
  const freezes = [...stderr.matchAll(/freeze_start: ([\d.]+)[\s\S]*?freeze_duration: ([\d.]+)/g)].map((match) => ({ start: Number(match[1]), seconds: Number(match[2]) }));
  const blacks = [...stderr.matchAll(/black_start:([\d.]+) black_end:([\d.]+) black_duration:([\d.]+)/g)].map((match) => ({ start: Number(match[1]), seconds: Number(match[3]) })).filter((black) => black.seconds > fadeSeconds + 0.3);
  const problems = [];
  if (errors.length) problems.push(`decoding reported ${errors.length} error line(s): ${errors[0].trim().slice(0, 160)}`);
  if (blacks.length) problems.push(`${blacks.length} black stretch(es), first ${blacks[0].seconds.toFixed(1)}s at ${blacks[0].start.toFixed(1)}s`);
  return { ok: problems.length === 0, problems, decodeErrors: errors.length, freezes, longestFreezeSeconds: freezes.length ? Math.max(...freezes.map((freeze) => freeze.seconds)) : 0, blackStretches: blacks };
}

/**
 * The real capture rate of a window recording, read from the frame counter
 * the overlay draws below the picture (recorder.mjs): for every frame of the
 * 30 fps file, did it show a new page frame or repeat the last one? Content
 * independent — a still page counts as fresh as long as capture keeps up.
 * Returns the fresh-frame share, the effective capture rate and the stalls
 * (runs of repeated frames of 100 ms or more).
 */
export async function measureCapture(ffmpeg, recording, fps) {
  if (recording.method !== "window" || !recording.counter) return { measured: false, reason: `${recording.method ?? "unknown"} recording has no frame counter` };
  const { x, y, width, rows } = recording.counter;
  const band = Math.max(1, rows - 4);
  const bytes = await new Promise((resolve, reject) => {
    const child = spawn(ffmpeg, ["-hide_banner", "-loglevel", "error", "-ss", recording.offset.toFixed(3), "-t", recording.duration.toFixed(3), "-i", recording.file, "-vf", `crop=${width}:${band}:${x}:${y + Math.floor((rows - band) / 2)},scale=16:1:flags=area,format=gray`, "-f", "rawvideo", "-"], { windowsHide: true });
    const chunks = [];
    child.stdout.on("data", (chunk) => chunks.push(chunk));
    child.on("error", reject);
    child.on("close", (code) => (code === 0 ? resolve(Buffer.concat(chunks)) : reject(new Error(`frame counter decode failed (${code})`))));
  });
  const values = [];
  for (let offset = 0; offset + 16 <= bytes.length; offset += 16) {
    let value = 0;
    for (let bit = 0; bit < 16; bit += 1) if (bytes[offset + bit] > 128) value |= 1 << bit;
    values.push(value);
  }
  if (new Set(values).size < Math.min(10, values.length / 2)) return { measured: false, reason: "frame counter not readable in the capture" };
  let fresh = 0;
  let run = 1;
  const stalls = [];
  for (let index = 1; index < values.length; index += 1) {
    if (values[index] !== values[index - 1]) {
      fresh += 1;
      if (run >= Math.ceil(fps / 10)) stalls.push({ at: Number(((index - run) / fps).toFixed(2)), seconds: Number((run / fps).toFixed(2)) });
      run = 1;
    } else run += 1;
  }
  const ratio = values.length > 1 ? fresh / (values.length - 1) : 0;
  return {
    measured: true,
    frames: values.length,
    freshFrameRatio: Number(ratio.toFixed(4)),
    effectiveFps: Number((ratio * fps).toFixed(2)),
    repeatedFrames: values.length - 1 - fresh,
    stalls: stalls.length,
    longestStallSeconds: stalls.length ? Math.max(...stalls.map((stall) => stall.seconds)) : 0,
    firstStalls: stalls.slice(0, 5),
  };
}

const INTERACTIVE = new Set(["click", "open", "fill", "select", "search", "press", "close", "scroll"]);

/**
 * What a lesson actually demonstrated, from its step results. Step levels:
 * required (failure fails the lesson), optional (UI that may legitimately be
 * absent) and informational (emphasis only, never evidence). A workflow is
 * "demonstrated" only when every required step ran, it includes a real
 * interaction and at least one verified result (an expectation that held);
 * highlights and navigation alone are an overview.
 */
export function classifyLesson(lesson, result) {
  if (!result) return { coverage: "skipped", workflows: [] };
  if (result.status === "failed") return { coverage: "failed", workflows: [] };
  const byWorkflow = new Map();
  for (const step of result.steps) {
    const spec = lesson.steps.find((candidate) => candidate.id === step.id);
    const name = spec?.workflow;
    if (!name || stepLevel(spec) === "informational") continue;
    const entry = byWorkflow.get(name) ?? { name, ok: true, ran: 0, steps: 0, checks: 0, interactions: 0, conditional: true, skipped: [] };
    entry.steps += 1;
    if (step.status === "ok") {
      entry.ran += 1;
      entry.checks += step.checks.length;
      if (INTERACTIVE.has(spec.action)) entry.interactions += 1;
    } else {
      entry.skipped.push(step.id);
      if (stepLevel(spec) === "required") entry.ok = false;
    }
    if (stepLevel(spec) === "required") entry.conditional = false;
    byWorkflow.set(name, entry);
  }
  const workflows = [...byWorkflow.values()].map((entry) => ({
    name: entry.name,
    status: !entry.ok ? "incomplete" : entry.ran === 0 ? "not-shown" : entry.interactions && entry.checks ? "demonstrated" : "shown",
    verifiedChecks: entry.checks,
    interactions: entry.interactions,
    skippedSteps: entry.skipped,
  }));
  const demonstrated = workflows.filter((workflow) => workflow.status === "demonstrated" && workflow.name !== "navigate");
  const incomplete = workflows.filter((workflow) => workflow.status === "incomplete");
  let coverage;
  if (lesson.kind === "workflow") coverage = incomplete.length ? "workflow-partial" : demonstrated.length ? "workflow-demonstrated" : "overview-only";
  else if (lesson.kind === "tour" || lesson.kind === "overview") coverage = demonstrated.length ? "overview+interactions" : "overview-only";
  else coverage = lesson.kind;
  return { coverage, workflows };
}

/** required | optional | informational (`optional: true` is the older spelling of optional). */
export function stepLevel(step) {
  return step.level ?? (step.optional ? "optional" : "required");
}
