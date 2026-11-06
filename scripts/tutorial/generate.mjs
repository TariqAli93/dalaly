#!/usr/bin/env node
/* global location, window -- page.evaluate callbacks run in the renderer */
/**
 * pnpm tutorial:generate — Dalaly Tutorial Studio, the one command.
 *
 *   1  checks Node, the output format, FFmpeg, real-time window capture and
 *      the renderer build, then the narration voice: provider and credentials,
 *      one test sentence synthesised, measured and heard back by speech-to-text
 *   2  prepares the isolated environment (dalaly_tutorial, own profile and port)
 *   3  launches the real Electron app, proves the capture works, and records
 *      the opening lesson (login)
 *   4  creates business demo data through the API, discovers every section,
 *      plans lessons and validates them
 *   5  estimates narration cost, synthesises and measures every line, then per
 *      lesson reuses it, re-edits its kept recording when the narration still
 *      fits, or records it again
 *   6  verifies every lesson (media, playback, capture rate, sync, narration in the
 *      finished file), assembles the course only when all of them pass,
 *      verifies it, and writes run, coverage and quality reports
 *
 * Options (maintenance only): --only <id,id>   --fresh (re-record everything)
 *   --silent-test   exercise recording and editing without a voice: output goes
 *                   to output/test-run/, is labelled a test everywhere, and the
 *                   exit code is 3 — never a narrated course.
 * Output: scripts/tutorial/output/ (git-ignored). See docs/TUTORIAL_STUDIO.md.
 */
import fs from "node:fs";
import path from "node:path";
import { answerFileDialogs, closeApp, fitWindow, keepLayout, launchApp, login } from "./engine/app.mjs";
import { analyzeAudio, judgeClip, wordRecall } from "./engine/audio.mjs";
import { discover } from "./engine/discovery.mjs";
import { assembleCourse, extractFrame, renderLesson, resolveFfmpeg } from "./engine/editor.mjs";
import { resetUi, executeLesson } from "./engine/executor.mjs";
import { createApi, createFixtures } from "./engine/fixtures.mjs";
import { NarrationError, createNarrator } from "./engine/narrator.mjs";
import { buildPlan, introLesson, refineNarration } from "./engine/planner.mjs";
import { pickCaptureEncoder, startRecording } from "./engine/recorder.mjs";
import { prepareEnvironment } from "./engine/env.mjs";
import { checkMedia, checkNarration, checkPlayback, checkSrt, checkSync, classifyLesson, listenableExcerpt, measureCapture, stepLevel } from "./engine/validator.mjs";
import { RENDERER_DIR, ROOT, SERVER_DIR, STUDIO_DIR, createLogger, fileHash, formatDuration, readJson, requireRenderer, run, sha256, writeJson } from "./engine/util.mjs";

const args = process.argv.slice(2);
const option = (name) => {
  const index = args.indexOf(`--${name}`);
  return index < 0 ? undefined : args[index + 1] && !args[index + 1].startsWith("--") ? args[index + 1] : true;
};
const only = typeof option("only") === "string" ? option("only").split(",").map((id) => id.trim()) : null;
const fresh = Boolean(option("fresh"));
const silentTest = Boolean(option("silent-test"));

const OUTPUT = path.join(STUDIO_DIR, "output");
// A silent test never shares files with the narrated course.
const OUT = silentTest ? path.join(OUTPUT, "test-run") : OUTPUT;
const runId = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const config = readJson(path.join(STUDIO_DIR, "tutorial.config.json"));
const script = readJson(path.join(STUDIO_DIR, "lessons.json"));
const log = createLogger(path.join(OUT, "logs", `run-${runId}.jsonl`));
const statePath = path.join(OUT, "state.json");
const state = readJson(statePath, { lessons: {} });
const paths = {
  lessons: path.join(OUT, "lessons"),
  subtitles: path.join(OUT, "subtitles"),
  // The Electron profile always lives in output/work (isolated, owner-marked).
  environment: path.join(OUTPUT, "work"),
  recordings: path.join(OUT, "work", "recordings"),
  edit: path.join(OUT, "work", "edit"),
  listen: path.join(OUT, "work", "listen"),
  diagnostics: path.join(OUT, "diagnostics"),
  // Files the app exported during lessons, and studio-made specimen files for uploads.
  exports: path.join(OUT, "work", "exports"),
  fixtures: path.join(OUT, "work", "fixtures"),
  // Silent-test placeholders stay with the test output; real clips are shared across runs.
  narrationCache: path.join(silentTest ? OUT : OUTPUT, "cache", "narration"),
  plannerCache: path.join(OUTPUT, "cache", "planner"),
  course: path.join(OUT, "complete-course.mp4"),
  courseSrt: path.join(OUT, "subtitles", "complete-course.srt"),
};
const limits = config.narration.validation;

const runReport = {
  runId,
  command: "pnpm tutorial:generate",
  mode: silentTest ? "silent-test (NOT a narrated course)" : "narrated",
  options: { only, fresh, silentTest },
  startedAt: new Date().toISOString(),
  finishedAt: null,
  result: "running",
  exitCode: null,
  checks: [],
  environment: null,
  providers: {},
  narrationEstimate: [],
  lessons: [],
  course: null,
  blockers: [],
  limitations: [],
  cleanup: [],
};
const coverage = { runId, mode: runReport.mode, discovery: null, plan: null, fixtures: [], lessons: [], summary: null };
const quality = { runId, mode: runReport.mode, video: { width: config.video.width, height: config.video.height, fps: config.video.fps, orientation: config.video.orientation }, capture: null, narration: null, thresholds: { ...config.quality, narration: limits }, lessons: [], course: null };
const check = (name, ok, detail) => {
  runReport.checks.push({ check: name, ok, detail });
  (ok ? log.info : log.error)(`check.${name}`, { message: `${ok ? "ok" : "FAILED"}${detail ? ` — ${detail}` : ""}` });
};

// ---------- preflight helpers ----------
function newestMtime(target) {
  if (!fs.existsSync(target)) return 0;
  const stat = fs.statSync(target);
  if (!stat.isDirectory()) return stat.mtimeMs;
  return fs.readdirSync(target).reduce((latest, name) => Math.max(latest, newestMtime(path.join(target, name))), 0);
}

/** Builds the renderer (vite build only) when its sources are newer than dist. */
async function ensureRendererBuild() {
  const index = path.join(RENDERER_DIR, "dist", "index.html");
  const sources = [path.join(RENDERER_DIR, "src"), path.join(RENDERER_DIR, "index.html"), path.join(RENDERER_DIR, "splash.html"), path.join(RENDERER_DIR, "vite.config.ts"), path.join(SERVER_DIR, "src", "shared", "contract-document")];
  const built = fs.existsSync(index) ? fs.statSync(index).mtimeMs : 0;
  const newest = Math.max(...sources.map(newestMtime));
  if (built && built >= newest) return "current";
  log.info("renderer.build", { message: built ? "sources changed since the last build; rebuilding apps/renderer/dist" : "no build yet; building apps/renderer/dist" });
  const vite = path.join(path.dirname(requireRenderer.resolve("vite/package.json")), "bin", "vite.js");
  await run(process.execPath, [vite, "build"], { cwd: RENDERER_DIR, timeoutMs: 10 * 60_000 });
  return "rebuilt";
}

/** "window" when this FFmpeg can grab a window in real time (gfxcapture, Windows), else "screencast". */
async function captureSupport(ffmpeg) {
  if (config.video.capture === "screencast") return { method: "screencast", reason: "video.capture is screencast" };
  const help = await run(ffmpeg, ["-hide_banner", "-h", "filter=gfxcapture"]).catch(() => ({ stdout: "" }));
  const available = process.platform === "win32" && /gfxcapture AVOptions/.test(help.stdout);
  if (!available) {
    if (config.video.capture === "window") throw new Error("video.capture is window, but this FFmpeg has no gfxcapture filter (FFmpeg 8.1+ on Windows 10 1903+ needed)");
    return { method: "screencast", reason: "FFmpeg has no gfxcapture filter (needs FFmpeg 8.1+ on Windows)" };
  }
  return { method: "window", encoder: await pickCaptureEncoder(ffmpeg) };
}

async function appFingerprint() {
  const head = (await run("git", ["rev-parse", "HEAD"]).catch(() => ({ stdout: "no-git" }))).stdout.trim();
  const dirty = (await run("git", ["status", "--porcelain", "--", "apps/renderer/src", "apps/desktop/src", "server/src", "server/drizzle"]).catch(() => ({ stdout: "" }))).stdout;
  const dist = path.join(RENDERER_DIR, "dist", "index.html");
  return sha256([head, dirty, fs.existsSync(dist) ? fileHash(dist) : ""].join("|"));
}

const engineFiles = (names) => names.map((name) => fileHash(path.join(STUDIO_DIR, "engine", name)));
/** What a recording depends on: the app, how steps run and how frames are captured. */
const recordingFingerprint = (capture) => sha256([...engineFiles(["app.mjs", "env.mjs", "executor.mjs", "fixtures.mjs", "overlay.mjs", "recorder.mjs"]), JSON.stringify(config.video), JSON.stringify(config.pacing), capture.method].join("|"));
/** What a finished lesson additionally depends on: editing, narration and its checks. */
const editFingerprint = () => sha256([...engineFiles(["audio.mjs", "editor.mjs", "narrator.mjs", "speech.mjs", "validator.mjs"]), JSON.stringify(config.video), JSON.stringify(config.narration), JSON.stringify(config.quality)].join("|"));

/** A PNG of the app window from Electron itself (independent of Playwright's screenshot pipeline). */
async function snapshot(file) {
  const png = await context.app.electron.evaluate(async ({ BrowserWindow }) => {
    const window = BrowserWindow.getAllWindows().find((candidate) => candidate.webContents.getURL().includes("index.html"));
    return (await window.webContents.capturePage()).toPNG().toString("base64");
  });
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, Buffer.from(png, "base64"));
}

// ---------- auth state ----------
async function ensureLoggedOut(app) {
  const { page, electron } = app;
  if (/#\/login/.test(page.url())) return;
  await resetUi(page);
  await page.evaluate(() => {
    localStorage.removeItem("dalaly.session");
    localStorage.removeItem("dalaly.media");
    location.hash = "#/login";
    location.reload();
  });
  await page.waitForURL(/#\/login/, { timeout: 30_000 });
  await page.waitForLoadState("load");
  app.capture = await fitWindow(electron, page, config.video, app.capture.method);
}

async function ensureLoggedIn(app) {
  if (/#\/login/.test(app.page.url())) await login(app.page, config.account);
}

// ---------- narration ----------
let context = null;

const linesOf = (lessons) => [...new Set(lessons.flatMap((lesson) => lesson.steps.filter((step) => step.say).map((step) => step.say)))];

/** Shows what synthesising these lessons' lines will take, and stops when it exceeds the configured budget. */
function estimateNarration(lessons, label) {
  const estimate = context.narrator.estimate(linesOf(lessons));
  const entry = { label, ...estimate, usd: Number(estimate.usd.toFixed(4)), seconds: Number(estimate.seconds.toFixed(1)) };
  runReport.narrationEstimate.push(entry);
  log.info("narration.estimate", { message: `${label}: ${estimate.clips} new clip(s) (~${formatDuration(estimate.seconds)} of speech), ${estimate.cached} cached — at most ~$${entry.usd.toFixed(2)} (${estimate.basis})` });
  const budget = config.narration.maxEstimatedCostUsd;
  if (!context.narrator.test && estimate.usd > budget) throw new NarrationError(`Narration for ${label} is estimated at ~$${entry.usd.toFixed(2)}, above narration.maxEstimatedCostUsd ($${budget}). Raise the budget in tutorial.config.json if that is intended; nothing more was synthesised.`);
}

/** Synthesises and checks every narration line of these lessons before anything is recorded. */
async function narrateAll(lessons, label) {
  estimateNarration(lessons, label);
  const texts = linesOf(lessons);
  let next = 0;
  let made = 0;
  let cached = 0;
  const worker = async () => {
    while (next < texts.length) {
      const clip = await context.narrator.clip(texts[next++]);
      if (clip.cached) cached += 1;
      else made += 1;
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, config.narration.concurrency[context.narrator.provider] ?? 1) }, worker));
  log.info("narration.ready", { message: `${label}: ${texts.length} line(s), ${made} synthesised, ${cached} from cache${context.narrator.test ? " — SILENT TEST, no voice" : ", every one measured as audible speech"}` });
}

async function clipsFor(lesson) {
  const clips = new Map();
  for (const step of lesson.steps) if (step.say) clips.set(step.id, await context.narrator.clip(step.say));
  return clips;
}

/**
 * The new narration placed on an existing recording, when every line still
 * fits before the next step began; otherwise a reason (the lesson is re-recorded).
 */
function remapTimeline(recording, clips) {
  const order = recording.steps.map((step) => step.id);
  const done = new Set(recording.steps.filter((step) => step.status === "ok").map((step) => step.id));
  const spoken = new Set(recording.timeline.map((item) => item.step));
  for (const [stepId] of clips) if (done.has(stepId) && !spoken.has(stepId)) return { reason: `${stepId} gained narration` };
  const timeline = [];
  for (const [index, item] of recording.timeline.entries()) {
    const clip = clips.get(item.step);
    if (!clip) return { reason: `${item.step} lost its narration` };
    const after = recording.steps[order.indexOf(item.step) + 1]?.started ?? recording.duration;
    const nextLine = recording.timeline[index + 1]?.start ?? Infinity;
    const room = Math.min(after, nextLine, recording.duration) - 0.1 - item.start;
    if (clip.duration > room) return { reason: `${item.step}: new narration is ${clip.duration.toFixed(1)}s, the recording left ${room.toFixed(1)}s` };
    timeline.push({ step: item.step, start: item.start, duration: clip.duration, file: clip.file, text: clip.text });
  }
  return { timeline };
}

// ---------- one lesson ----------
function lessonFiles(lesson) {
  const base = `${String(lesson.order).padStart(2, "0")}-${lesson.id}`;
  return { base, mp4: path.join(paths.lessons, `${base}.mp4`), srt: path.join(paths.subtitles, `${base}.srt`), raw: path.join(paths.recordings, `${base}.raw.mkv`) };
}

/** Step-clock times → video times when the capture clock ran at a slightly different rate. */
function onVideoClock(recording, execution) {
  const factor = Math.abs(recording.driftSeconds ?? 0) > config.quality.correctDriftAboveSeconds && recording.clockSeconds > 0 ? recording.duration / recording.clockSeconds : 1;
  const at = (seconds) => (seconds === undefined || seconds === null ? seconds : seconds * factor);
  return {
    factor,
    timeline: execution.timeline.map((item) => ({ ...item, start: at(item.start) })),
    steps: execution.steps.map((step) => ({ ...step, started: at(step.started), finished: at(step.finished) })),
  };
}

/** Records the lesson in the app; returns the recording or throws. */
async function recordLesson(lesson, clips, files, entry) {
  const { app, ffmpeg, api } = context;
  let lastError = null;
  for (let attempt = 1; attempt <= config.run.retries + 1; attempt += 1) {
    entry.attempts = attempt;
    try {
      if (lesson.kind === "intro") await ensureLoggedOut(app);
      else {
        await ensureLoggedIn(app);
        await resetUi(app.page);
      }
      // The window must be on screen to paint (and so to be captured), and a
      // locked Windows session paints nothing: wait for it to be unlocked.
      for (let waited = 0; ; waited += 5) {
        const screen = await app.electron.evaluate(({ BrowserWindow, powerMonitor }) => {
          const window = BrowserWindow.getAllWindows().find((candidate) => candidate.webContents.getURL().includes("index.html"));
          if (window?.isMinimized()) window.restore();
          return powerMonitor.getSystemIdleState(1);
        });
        if (screen !== "locked") break;
        if (waited === 0) log.warn("capture.locked", { lesson: lesson.id, message: "the Windows session is locked; recording resumes when it is unlocked (waiting up to 30 minutes)" });
        if (waited >= 1800) throw new Error("the Windows session stayed locked for 30 minutes; the window cannot be recorded while it is locked");
        await new Promise((resolve) => setTimeout(resolve, 5000));
      }
      const recorder = await startRecording(app.page, files.raw, { ffmpeg: ffmpeg.ffmpeg, ffprobe: ffmpeg.ffprobe, video: config.video, capture: app.capture, log });
      let execution;
      try {
        execution = await Promise.race([
          executeLesson({ page: app.page, lesson, narration: clips, recorder, pacing: config.pacing, api, diagnosticsDir: paths.diagnostics, exportsDir: paths.exports, fixturesDir: paths.fixtures, log, snapshot, ensureLayout: () => keepLayout(app, config.video) }),
          new Promise((_, reject) => setTimeout(() => reject(new Error(`lesson timed out after ${config.run.lessonTimeoutMs} ms`)), config.run.lessonTimeoutMs)),
        ]);
      } catch (error) {
        execution = { status: "failed", steps: [], timeline: [], error: error.message };
      }
      if (execution.status !== "ok") {
        await recorder.abort().catch((error) => log.warn("recording.abort", { lesson: lesson.id, message: error.message }));
        entry.steps = execution.steps.map(({ rect, ...step }) => step);
        entry.failedSteps = entry.steps.filter((step) => step.status === "failed").map((step) => ({ id: step.id, error: step.error, screenshot: step.screenshot && path.relative(ROOT, step.screenshot) }));
        const saved = entry.steps.filter((step) => step.committed).map((step) => step.id);
        // Retrying is safe only while nothing was written: a second attempt would duplicate records.
        if (saved.length) throw Object.assign(new Error(`${execution.error} (not retried: this attempt had already saved data in ${saved.join(", ")})`), { final: true });
        throw new Error(execution.error);
      }
      const captured = await recorder.stop();
      const placed = onVideoClock(captured, execution);
      return { raw: files.raw, method: captured.method, encoder: captured.encoder, counter: captured.counter, received: captured.received, offset: captured.offset, frames: captured.frames, duration: captured.duration, clockSeconds: captured.clockSeconds, driftSeconds: captured.driftSeconds, driftFactor: placed.factor, timeline: placed.timeline, steps: placed.steps };
    } catch (error) {
      lastError = error;
      log.error("lesson.attempt-failed", { lesson: lesson.id, message: `attempt ${attempt}: ${error.message.split("\n")[0]}` });
      await resetUi(app.page).catch(() => undefined);
      if (error.final) break;
    }
  }
  throw lastError;
}

/** Proves the lesson file carries its narration (not in a silent test). */
async function verifyNarration(lesson, file, timeline) {
  if (context.narrator.test) return { ok: null, status: "not run — silent test mode has no voice", problems: [] };
  const result = await checkNarration({ ffmpeg: context.ffmpeg.ffmpeg, file, timeline, limits, transcribe: context.narrator.transcribe, workDir: paths.listen, label: `${String(lesson.order).padStart(2, "0")}-${lesson.id}` });
  (result.ok ? log.info : log.error)("narration.verified", { lesson: lesson.id, message: result.ok ? `${result.loudness.integratedLufs} LUFS, ${Math.round((result.voicedInWindowsSeconds / Math.max(0.01, result.narratedSeconds)) * 100)}% voiced, heard ${Math.round((result.listening?.recall ?? 0) * 100)}% of "${(result.listening?.expected ?? "").slice(0, 30)}…"` : result.problems.join("; ") });
  return {
    ok: result.ok,
    status: result.ok ? "verified" : "failed",
    problems: result.problems,
    loudness: result.loudness,
    meanDb: result.meanDb,
    maxDb: result.maxDb,
    narratedSeconds: result.narratedSeconds,
    voicedShare: result.narratedSeconds ? Number((result.voicedInWindowsSeconds / result.narratedSeconds).toFixed(3)) : 0,
    lowestWindowVoicedRatio: result.windows.length ? Math.min(...result.windows.map((window) => window.voicedRatio)) : null,
    windows: result.windows,
    listening: result.listening,
  };
}

/** Media, playback, capture rate, subtitles, sync and narration of one produced lesson. */
async function verifyLesson(lesson, recording, rendered, files) {
  const { ffmpeg } = context;
  const media = await checkMedia(ffmpeg.ffprobe, files.mp4, config.video);
  const playback = await checkPlayback(ffmpeg.ffmpeg, files.mp4, { fadeSeconds: config.video.fadeSeconds, freezeSeconds: config.quality.reportFreezeSeconds });
  const srt = checkSrt(files.srt, rendered.duration);
  const sync = checkSync(recording.timeline, recording.steps, rendered.duration);
  const capture = fs.existsSync(recording.raw) ? await measureCapture(ffmpeg.ffmpeg, { file: recording.raw, offset: recording.offset ?? 0, duration: recording.duration, method: recording.method, counter: recording.counter }, config.video.fps) : { measured: false, reason: "raw recording missing" };
  // The screencast has no counter: what it delivered is all there is to report.
  if (!capture.measured && recording.received) Object.assign(capture, { screencastFramesPerSecond: Number((recording.received / recording.duration).toFixed(2)) });
  const narration = await verifyNarration(lesson, files.mp4, recording.timeline);
  const warnings = [];
  if (capture.measured && capture.effectiveFps < config.quality.minMotionFps) warnings.push(`capture delivered ~${capture.effectiveFps} fresh frames a second (below ${config.quality.minMotionFps})`);
  if (capture.measured && capture.longestStallSeconds > config.quality.maxStallSeconds) warnings.push(`capture stalled for ${capture.longestStallSeconds}s at ${capture.firstStalls.find((stall) => stall.seconds === capture.longestStallSeconds)?.at ?? "?"}s`);
  if (!capture.measured) warnings.push(`capture rate not measured: ${capture.reason}`);
  if (Math.abs(recording.driftSeconds ?? 0) > config.quality.maxClockDriftSeconds) warnings.push(`capture clock drifted ${recording.driftSeconds}s (corrected ×${recording.driftFactor?.toFixed(5)})`);
  if (playback.longestFreezeSeconds > config.quality.reportFreezeSeconds) warnings.push(`longest still stretch ${playback.longestFreezeSeconds.toFixed(1)}s`);
  const ok = media.ok && playback.ok && srt.ok && sync.ok && narration.ok !== false;
  return {
    ok,
    warnings,
    entry: {
      id: lesson.id,
      order: lesson.order,
      file: path.relative(ROOT, files.mp4),
      capture: { method: recording.method, encoder: recording.encoder, ...capture, clockDriftSeconds: recording.driftSeconds ?? 0, driftCorrectionFactor: recording.driftFactor ?? 1 },
      rendered: { duration: media.duration, nominalFps: media.video?.frameRate?.nominal, averageFps: media.video?.frameRate?.averageFps, frames: media.video?.frameRate?.frames, expectedFrames: media.video?.frameRate?.expectedFrames, resolution: media.video && `${media.video.width}x${media.video.height}`, audio: media.audio, subtitles: media.subtitles },
      media: { ok: media.ok, problems: media.problems },
      playback,
      subtitles: srt,
      sync,
      narration,
      warnings,
    },
  };
}

async function produceLesson(lesson) {
  const { ffmpeg } = context;
  const files = lessonFiles(lesson);
  const entry = { id: lesson.id, order: lesson.order, title: lesson.title, section: lesson.section, kind: lesson.kind, narrationSource: lesson.narrationSource ?? "authored", status: "pending", attempts: 0 };
  coverage.lessons.push(entry);
  log.info("lesson.start", { lesson: lesson.id, message: `${lesson.order}. ${lesson.title}` });

  const clips = await clipsFor(lesson);
  const recordingKey = sha256(JSON.stringify({ steps: lesson.steps.map(({ say, ...step }) => step), kind: lesson.kind, app: context.appHash, engine: context.recordingHash }));
  const finalKey = sha256(JSON.stringify({ recordingKey, lesson, clips: [...clips].map(([id, clip]) => [id, path.basename(clip.file)]), edit: context.editHash }));
  const saved = state.lessons[lesson.id];

  // 1. Unchanged and previously verified: reuse the file after verifying it again.
  if (!fresh && saved?.final?.key === finalKey && fs.existsSync(saved.final.file) && saved.recording) {
    const verified = await verifyLesson(lesson, saved.recording, saved.final, { ...files, mp4: saved.final.file, srt: files.srt });
    if (verified.ok) {
      Object.assign(entry, saved.final.entry, { status: "cached" });
      quality.lessons.push({ ...verified.entry, source: "cached" });
      log.info("lesson.cached", { lesson: lesson.id, message: "unchanged since the last run; reused after it verified again" });
      return { file: saved.final.file, duration: saved.final.duration, cueList: saved.final.cueList, timeline: saved.final.timeline, entry };
    }
    log.warn("lesson.cache-invalid", { lesson: lesson.id, message: `no longer verifies (${[...verified.entry.media.problems, ...verified.entry.playback.problems, ...(verified.entry.narration.problems ?? [])].join("; ")}); rebuilding` });
  }

  // 2. Same recording, new narration: re-edit it when every line still fits.
  let recording = null;
  let source = "recorded";
  if (!fresh && saved?.recording?.key === recordingKey && fs.existsSync(saved.recording.raw)) {
    const remapped = remapTimeline(saved.recording, clips);
    if (remapped.timeline) {
      recording = { ...saved.recording, timeline: remapped.timeline };
      source = "re-edited";
      log.info("lesson.reuse-recording", { lesson: lesson.id, message: "recording unchanged; editing it with the current narration" });
    } else log.info("lesson.rerecord", { lesson: lesson.id, message: `recording cannot take the new narration (${remapped.reason}); recording again` });
  }

  // 3. Otherwise record it in the app.
  try {
    if (!recording) {
      recording = { key: recordingKey, ...(await recordLesson(lesson, clips, files, entry)) };
      state.lessons[lesson.id] = { recording };
      writeJson(statePath, state);
    }
  } catch (error) {
    entry.status = "failed";
    entry.coverage = "failed";
    entry.error = error.message.split("\n").slice(0, 4).join(" ");
    log.error("lesson.failed", { lesson: lesson.id, message: entry.error });
    retire(files, "recording failed");
    return null;
  }

  const rendered = await renderLesson({
    ffmpeg: ffmpeg.ffmpeg, recording: { file: recording.raw, offset: recording.offset ?? 0, frames: recording.frames }, timeline: recording.timeline, steps: recording.steps, lesson,
    outFile: files.mp4, srtFile: files.srt, workDir: paths.edit, video: config.video, narration: config.narration, test: context.narrator.test, log,
  });
  const verified = await verifyLesson(lesson, recording, rendered, files);
  const lessonCoverage = classifyLesson(lesson, { status: "ok", steps: recording.steps });
  // A still from the middle of the first narrated line after the title, for checking Arabic shaping by eye.
  const sample = rendered.cueList[Math.min(1, rendered.cueList.length - 1)];
  const frame = sample ? await extractFrame(ffmpeg.ffmpeg, files.mp4, (sample.start + sample.end) / 2, path.join(paths.diagnostics, `${files.base}-frame.png`)) : null;
  const narrationFailed = verified.entry.narration.ok === false;
  Object.assign(entry, {
    status: narrationFailed ? "failed-narration" : verified.ok ? "produced" : "produced-with-problems",
    source,
    coverage: narrationFailed ? "failed" : lessonCoverage.coverage,
    workflows: lessonCoverage.workflows,
    skippedOptional: recording.steps.filter((step) => step.status === "skipped" && step.level === "optional").map((step) => ({ id: step.id, reason: step.error ?? step.reason })),
    skippedInformational: recording.steps.filter((step) => step.status === "skipped" && step.level === "informational").map((step) => ({ id: step.id, reason: step.error ?? step.reason })),
    failedRequired: [],
    file: path.relative(ROOT, files.mp4),
    srt: path.relative(ROOT, files.srt),
    frame: frame ? path.relative(ROOT, frame) : null,
    duration: Number(rendered.duration.toFixed(2)),
    zooms: rendered.zooms.length,
    steps: recording.steps.map(({ rect, ...step }) => step),
  });
  delete entry.error;
  quality.lessons.push({ ...verified.entry, source });
  state.lessons[lesson.id] = {
    recording,
    final: verified.ok ? { key: finalKey, file: files.mp4, duration: rendered.duration, cueList: rendered.cueList, timeline: recording.timeline, entry: { ...entry } } : null,
  };
  writeJson(statePath, state);
  if (narrationFailed) {
    retire(files, "narration did not verify", true);
    entry.file = path.relative(ROOT, path.join(paths.diagnostics, `${files.base}.failed-narration.mp4`));
  }
  log.info("lesson.done", { lesson: lesson.id, message: `${entry.status} (${source}) ${formatDuration(rendered.duration)} — ${entry.coverage}; capture ${verified.entry.capture.measured ? `${verified.entry.capture.effectiveFps} fresh fps, longest stall ${verified.entry.capture.longestStallSeconds}s` : "not measured"}${verified.warnings.length ? `; ${verified.warnings.join("; ")}` : ""}` });
  return verified.ok ? { file: files.mp4, duration: rendered.duration, cueList: rendered.cueList, timeline: recording.timeline, entry } : null;
}

/** Takes an unusable lesson video out of lessons/ (kept in diagnostics/ when asked). */
function retire(files, reason, keep = false) {
  if (fs.existsSync(files.mp4)) {
    if (keep) {
      fs.mkdirSync(paths.diagnostics, { recursive: true });
      fs.renameSync(files.mp4, path.join(paths.diagnostics, `${files.base}.failed-narration.mp4`));
    } else fs.rmSync(files.mp4);
    log.warn("lesson.retired", { message: `${path.basename(files.mp4)} ${keep ? "moved to diagnostics" : "removed"}: ${reason}` });
  }
  fs.rmSync(files.srt, { force: true });
}

/** Moves an unverified course out of the output root (into diagnostics/), so it cannot pass for a finished one. */
function removeStaleCourse(reason) {
  delete state.course;
  writeJson(statePath, state);
  for (const file of [paths.course, paths.courseSrt]) {
    if (fs.existsSync(file)) {
      fs.mkdirSync(paths.diagnostics, { recursive: true });
      const moved = path.join(paths.diagnostics, path.basename(file).replace(/(\.\w+)$/, ".unverified$1"));
      fs.renameSync(file, moved);
      log.warn("course.removed", { message: `${path.relative(ROOT, file)} moved to ${path.relative(ROOT, moved)}: ${reason}` });
      runReport.cleanup.push({ action: "moved", from: path.relative(ROOT, file), to: path.relative(ROOT, moved), reason });
    }
  }
}

/**
 * After a full run: generated files of lessons that are no longer in the plan
 * (their names follow the studio's own NN-id pattern, inside its own output
 * folders) and this run's intermediate edit files. Each removal is reported.
 */
function cleanOwnedLeftovers(plannedBases, plannedIds) {
  for (const id of Object.keys(state.lessons)) {
    if (plannedIds.includes(id)) continue;
    delete state.lessons[id];
    runReport.cleanup.push({ action: "forgot", lesson: id, reason: "resume state of a lesson that is no longer in the plan" });
  }
  writeJson(statePath, state);
  const studioName = /^\d{2}-[a-z0-9-]+(\.raw)?\.(mp4|mkv|srt|png)$|^\d{2}-[a-z0-9-]+-frame\.png$/;
  const keep = (name) => plannedBases.some((base) => name.startsWith(`${base}.`) || name === `${base}-frame.png`);
  for (const dir of [paths.lessons, paths.subtitles, paths.recordings, paths.diagnostics]) {
    if (!fs.existsSync(dir)) continue;
    for (const name of fs.readdirSync(dir)) {
      if (!studioName.test(name) || keep(name)) continue;
      fs.rmSync(path.join(dir, name), { force: true });
      runReport.cleanup.push({ action: "deleted", file: path.relative(ROOT, path.join(dir, name)), reason: "generated for a lesson that is no longer in the plan" });
    }
  }
  for (const dir of [paths.edit, paths.listen]) {
    if (!fs.existsSync(dir)) continue;
    fs.rmSync(dir, { recursive: true, force: true });
    runReport.cleanup.push({ action: "deleted", file: path.relative(ROOT, dir), reason: "intermediate files of this run (narration mixes, subtitle copies, listening excerpts); reproducible" });
  }
}

// ---------- main ----------
async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  log.info("run.start", { message: `run ${runId}${silentTest ? " — SILENT TEST: no voice, output in output/test-run, never a narrated course" : ""}${only ? ` (only ${only.join(", ")})` : ""}${fresh ? " (fresh)" : ""}` });
  // A course this pipeline did not verify must not stay around looking finished.
  if (fs.existsSync(paths.course) && !state.course?.verified) removeStaleCourse("it was produced without the current verification");
  const major = Number(process.versions.node.split(".")[0]);
  check("node", major >= 20, process.versions.node);
  if (major < 20) throw new Error("Node 20+ is required");
  const landscape = config.video.width > config.video.height;
  const orientation = config.video.orientation ?? "landscape";
  check("orientation", orientation === "landscape" ? landscape : !landscape, `${config.video.width}×${config.video.height} ${landscape ? "landscape" : "portrait"} (configured: ${orientation})`);
  if (orientation === "landscape" ? !landscape : landscape) throw new Error(`video is ${config.video.width}×${config.video.height} but video.orientation is ${orientation}; fix tutorial.config.json`);

  const ffmpeg = await resolveFfmpeg({ log, pinnedSha256: config.ffmpegSha256 ?? "" });
  check("ffmpeg", true, ffmpeg.source);
  const capture = await captureSupport(ffmpeg.ffmpeg);
  check("capture-backend", true, capture.method === "window" ? `real-time window capture (gfxcapture → ${config.video.fps} fps, ${capture.encoder})` : `screencast fallback: ${capture.reason}`);
  if (capture.method !== "window") runReport.limitations.push(`Recording uses the DevTools screencast (${capture.reason}); movement is captured at well below ${config.video.fps} fps — see quality-report.json.`);
  runReport.providers.ffmpeg = { source: ffmpeg.source };
  check("renderer-build", true, await ensureRendererBuild());

  // Narration first: without a working voice nothing else is worth doing.
  const narrator = await createNarrator(config.narration, paths.narrationCache, {
    ffmpeg: ffmpeg.ffmpeg,
    analyze: (file) => analyzeAudio(ffmpeg.ffmpeg, file, { noiseDb: limits.silenceNoiseDb, minSilence: limits.silenceMinSeconds }),
    judge: (analysis, text) => judgeClip(analysis, text, limits),
    log,
    silentTest,
  });
  context = { narrator, ffmpeg, api: null, editHash: editFingerprint() };
  const preflight = await narrator.preflight({
    toListenable: (file) => listenableExcerpt(ffmpeg.ffmpeg, file, path.join(paths.listen, "preflight.wav")),
    recallOf: wordRecall,
    minRecall: limits.minRecall,
  });
  runReport.providers.narration = { provider: narrator.provider, voice: narrator.voice, dialect: narrator.dialect, iraqiVoice: narrator.iraqiVoice, listeningCheck: narrator.listener };
  quality.narration = { ...runReport.providers.narration, preflight: preflight.test };
  if (narrator.test) {
    check("narration-preflight", true, "SILENT TEST — no voice; narration checks are not run and nothing here is a narrated course");
    runReport.limitations.push("Silent test mode: the lessons have no narration. This run validates recording, steps and editing only.");
  } else {
    check("narration-preflight", true, `${narrator.provider} · ${narrator.voice}: test sentence ${preflight.test.duration}s, peak ${preflight.test.maxDb} dB, ${narrator.listener} heard ${Math.round(preflight.test.recall * 100)}% of its words`);
    if (!narrator.iraqiVoice) runReport.limitations.push(`Narration voice: ${narrator.dialect}.`);
  }

  const intro = introLesson(script, config.account);
  if (intro.problems.length) throw new Error(`Intro lesson invalid: ${intro.problems.join("; ")}`);
  intro.lesson.order = 0;
  const runIntro = !only || only.includes("intro");
  if (runIntro) await narrateAll([intro.lesson], "opening lesson");

  const environment = await prepareEnvironment({ config, workDir: paths.environment, log });
  environment.captureMethod = capture.method;
  runReport.environment = { database: environment.databaseName, profile: path.relative(ROOT, environment.profileDir), apiPort: environment.apiPort, seeded: environment.counts };
  check("database-isolation", true, `${environment.databaseName} (owner-marked), profile ${path.relative(ROOT, environment.profileDir)}, API port ${environment.apiPort}`);

  const app = await launchApp(environment, { log });
  // Exports land in the studio's own folder (emptied first); uploads use a generated specimen image.
  fs.rmSync(paths.exports, { recursive: true, force: true });
  fs.mkdirSync(paths.exports, { recursive: true });
  await answerFileDialogs(app.electron, paths.exports);
  fs.mkdirSync(paths.fixtures, { recursive: true });
  await run(ffmpeg.ffmpeg, ["-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i", "color=c=0xEFE8DA:s=1000x630", "-vf", "drawbox=x=40:y=40:w=920:h=550:color=0x1F4E79:t=8,drawbox=x=90:y=110:w=220:h=270:color=0x9FB3C8:t=fill,drawbox=x=360:y=130:w=520:h=30:color=0x1F4E79:t=fill,drawbox=x=360:y=200:w=420:h=24:color=0x5B6B7A:t=fill,drawbox=x=360:y=250:w=460:h=24:color=0x5B6B7A:t=fill", "-frames:v", "1", path.join(paths.fixtures, "specimen-id.png")]);
  if (capture.method === "window" && app.capture.method !== "window") {
    if (config.video.capture === "window") throw new Error(`window capture impossible: ${app.capture.reason}`);
    runReport.limitations.push(`Window capture unavailable (${app.capture.reason}); the screencast fallback was used.`);
  }
  app.capture = { ...app.capture, encoder: capture.encoder };
  Object.assign(context, { app, environment, appHash: await appFingerprint(), recordingHash: recordingFingerprint(app.capture) });
  check("electron-startup", true, `real Electron app, API READY, ${app.capture.method === "window" ? `window client area ${app.capture.contentWidth}×${app.capture.contentHeight} px (display scale ${app.capture.scale})` : `view emulated at ${config.video.width}×${config.video.height}`}, ${config.video.viewport.width} CSS px wide layout`);

  // Prove the capture before any lesson depends on it: markers found, clock in step.
  {
    const probeFile = path.join(paths.recordings, "capture-check.mkv");
    const recorder = await startRecording(app.page, probeFile, { ffmpeg: ffmpeg.ffmpeg, ffprobe: ffmpeg.ffprobe, video: config.video, capture: app.capture, log });
    await app.page.evaluate(() => window.__tutorial.moveTo(200, 200, 600)).catch(() => undefined);
    await new Promise((resolve) => setTimeout(resolve, 1500));
    const probe = await recorder.stop();
    const rate = await measureCapture(ffmpeg.ffmpeg, probe, config.video.fps);
    fs.rmSync(probeFile, { force: true, maxRetries: 20, retryDelay: 250 });
    quality.capture = { method: probe.method, encoder: probe.encoder, selfTest: { seconds: probe.duration, clockDriftSeconds: probe.driftSeconds, ...rate } };
    const live = probe.method !== "window" || (rate.measured && rate.effectiveFps >= config.quality.minMotionFps);
    check("capture", Math.abs(probe.driftSeconds) < 0.2 && live, `${probe.method}: ${probe.duration.toFixed(2)}s captured for ${probe.clockSeconds.toFixed(2)}s on the step clock (drift ${(probe.driftSeconds * 1000).toFixed(0)} ms)${rate.measured ? `, ${rate.effectiveFps} fresh frames a second, ${rate.stalls} stall(s)` : `, rate ${rate.reason}`}`);
  }

  const results = [];
  if (runIntro) results.push({ lesson: intro.lesson, result: await produceLesson(intro.lesson) });
  await ensureLoggedIn(app);
  const navigationVisible = await app.page.getByRole("navigation", { name: "التنقل الرئيسي" }).isVisible();
  check("authentication", navigationVisible, `${config.account.username} through the login screen`);
  if (!navigationVisible) throw new Error("Not logged in after the opening lesson");

  const api = createApi(environment.apiPort, log);
  await api.login(config.account);
  context.api = api;
  coverage.fixtures = await createFixtures(api, log);

  const discovery = await discover(app.page, { log });
  writeJson(path.join(OUT, "discovery.json"), discovery);
  coverage.discovery = {
    navigationSections: discovery.sections.length,
    pages: discovery.pages.map((page) => ({ title: page.title, to: page.to, parent: page.parent, reachable: page.reachable, heading: page.inventory?.heading ?? null, buttons: page.inventory?.buttons.length ?? 0, fields: page.inventory?.textboxes.length ?? 0, selects: page.inventory?.comboboxes.length ?? 0, tabs: page.inventory?.tabs ?? [], error: page.error ?? null })),
    routes: discovery.routes.length,
    routesOutsideNavigation: discovery.routesOutsideNavigation,
    detailRoutes: discovery.detailRoutes,
  };
  check("route-navigation", discovery.pages.every((page) => page.reachable), `${discovery.pages.filter((page) => page.reachable).length}/${discovery.pages.length} navigation pages opened`);

  const plan = buildPlan({ discovery, script, account: config.account, only });
  if (plan.problems.length) throw new Error(`Lesson plan failed validation:\n  ${plan.problems.join("\n  ")}`);
  for (const warning of plan.warnings) log.warn("plan.scope", { message: warning });
  runReport.providers.planner = await refineNarration({ plan, discovery, settings: config.planner, cacheDir: paths.plannerCache, log });
  if (runReport.providers.planner.provider === "authored") runReport.limitations.push(`AI narration rewrite not used: ${runReport.providers.planner.reason}`);
  writeJson(path.join(OUT, "plan.json"), plan);
  coverage.plan = { lessons: plan.lessons.map((lesson) => ({ id: lesson.id, order: lesson.order, title: lesson.title, section: lesson.section, kind: lesson.kind, steps: lesson.steps.length, required: lesson.steps.filter((step) => stepLevel(step) === "required").length })), warnings: plan.warnings, unreachable: plan.unreachable };

  await narrateAll(plan.lessons, "planned lessons");
  for (const lesson of plan.lessons) results.push({ lesson, result: await produceLesson(lesson) });

  const verified = results.filter((item) => item.result).sort((a, b) => a.lesson.order - b.lesson.order);
  const missing = results.filter((item) => !item.result).map((item) => item.lesson.id);
  check("lessons-produced", missing.length === 0, `${verified.length}/${results.length} lessons produced and verified${missing.length ? `; not: ${missing.join(", ")}` : ""}`);
  if (only) {
    runReport.course = { produced: false, reason: "--only run: complete-course.mp4 is built only from a full run" };
    log.info("course.skipped", { message: runReport.course.reason });
  } else if (missing.length) {
    runReport.course = { produced: false, reason: `lessons not produced and verified: ${missing.join(", ")}` };
    removeStaleCourse(runReport.course.reason);
  } else {
    const course = await assembleCourse({ ffmpeg: ffmpeg.ffmpeg, lessons: verified.map((item) => ({ ...item.result, title: item.lesson.title })), outFile: paths.course, srtFile: paths.courseSrt, video: config.video, title: silentTest ? "دلالي — اختبار صامت (بدون صوت)" : undefined, log });
    const media = await checkMedia(ffmpeg.ffprobe, course.file, config.video, { chapters: verified.map((item) => ({ title: item.lesson.title, duration: item.result.duration })) });
    const playback = await checkPlayback(ffmpeg.ffmpeg, course.file, { fadeSeconds: config.video.fadeSeconds, freezeSeconds: config.quality.reportFreezeSeconds });
    const srt = checkSrt(course.srt, course.duration);
    let offset = 0;
    const timeline = verified.flatMap((item) => {
      const shifted = item.result.timeline.map((clip) => ({ ...clip, step: `${item.lesson.id}/${clip.step}`, start: clip.start + offset }));
      offset += item.result.duration;
      return shifted;
    });
    const narration = narrator.test ? { ok: null, problems: [], status: "not run — silent test" } : await checkNarration({ ffmpeg: ffmpeg.ffmpeg, file: course.file, timeline, limits, transcribe: narrator.transcribe, workDir: paths.listen, label: "complete-course" });
    const ok = media.ok && playback.ok && srt.ok && narration.ok !== false;
    runReport.course = { produced: ok, file: path.relative(ROOT, course.file), srt: path.relative(ROOT, course.srt), duration: Number(course.duration.toFixed(2)), lessons: verified.map((item) => item.lesson.id) };
    quality.course = {
      file: path.relative(ROOT, course.file),
      rendered: { duration: media.duration, nominalFps: media.video?.frameRate?.nominal, averageFps: media.video?.frameRate?.averageFps, frames: media.video?.frameRate?.frames, expectedFrames: media.video?.frameRate?.expectedFrames, resolution: media.video && `${media.video.width}x${media.video.height}`, audio: media.audio, subtitles: media.subtitles, chapters: media.chapters, sizeBytes: media.sizeBytes },
      media: { ok: media.ok, problems: media.problems },
      playback,
      subtitles: srt,
      narration: narrator.test ? narration : { ok: narration.ok, problems: narration.problems, loudness: narration.loudness, narratedSeconds: narration.narratedSeconds, voicedShare: narration.narratedSeconds ? Number((narration.voicedInWindowsSeconds / narration.narratedSeconds).toFixed(3)) : 0, lowestWindowVoicedRatio: Math.min(...narration.windows.map((window) => window.voicedRatio)), listening: narration.listening },
    };
    check("course-media", media.ok && playback.ok && srt.ok, `${formatDuration(course.duration)}, ${media.video?.width}x${media.video?.height} ${media.video?.orientation}, ${media.video?.frameRate?.nominal} (avg ${media.video?.frameRate?.averageFps}), ${media.video?.frameRate?.frames} frames, ${media.audio?.codec}, ${srt.cues} cues, decoded without errors: ${playback.decodeErrors === 0}${[...media.problems, ...playback.problems].length ? ` — ${[...media.problems, ...playback.problems].join("; ")}` : ""}`);
    if (!narrator.test) check("course-narration", narration.ok, narration.ok ? `${narration.loudness.integratedLufs} LUFS, all ${timeline.length} lines voiced where placed, heard ${Math.round(narration.listening.recall * 100)}% at ${narration.listening.at}s` : narration.problems.join("; "));
    if (!ok) removeStaleCourse("the assembled course failed its checks");
    else {
      state.course = { file: course.file, runId, verified: true, narrated: !narrator.test, lessons: verified.map((item) => item.lesson.id) };
      writeJson(statePath, state);
    }
  }

  const lessons = coverage.lessons;
  coverage.summary = {
    discoveredSections: discovery.pages.length,
    reachableSections: discovery.pages.filter((page) => page.reachable).length,
    plannedLessons: lessons.length,
    produced: lessons.filter((lesson) => ["produced", "cached"].includes(lesson.status)).length,
    workflowDemonstrated: lessons.filter((lesson) => lesson.coverage === "workflow-demonstrated").map((lesson) => lesson.id),
    workflowPartial: lessons.filter((lesson) => lesson.coverage === "workflow-partial").map((lesson) => lesson.id),
    overviewWithInteractions: lessons.filter((lesson) => lesson.coverage === "overview+interactions").map((lesson) => lesson.id),
    overviewOnly: lessons.filter((lesson) => lesson.coverage === "overview-only").map((lesson) => lesson.id),
    skippedOptionalSteps: lessons.flatMap((lesson) => (lesson.skippedOptional ?? []).map((step) => `${lesson.id}/${step.id}`)),
    skippedInformationalSteps: lessons.flatMap((lesson) => (lesson.skippedInformational ?? []).map((step) => `${lesson.id}/${step.id}`)),
    failedRequiredSteps: lessons.flatMap((lesson) => (lesson.failedSteps ?? []).map((step) => ({ lesson: lesson.id, ...step }))),
    failedLessons: lessons.filter((lesson) => lesson.status.startsWith("failed")).map((lesson) => ({ id: lesson.id, status: lesson.status, error: lesson.error })),
    notInPlan: plan.unreachable,
    routesOutsideNavigation: discovery.routesOutsideNavigation,
  };
  runReport.lessons = lessons.map((lesson) => ({ id: lesson.id, status: lesson.status, coverage: lesson.coverage, duration: lesson.duration ?? null, attempts: lesson.attempts }));
  if (!only) cleanOwnedLeftovers(results.map((item) => lessonFiles(item.lesson).base), results.map((item) => item.lesson.id));
  const problems = lessons.some((lesson) => !["produced", "cached"].includes(lesson.status)) || runReport.checks.some((item) => !item.ok) || (!only && !runReport.course?.produced);
  if (silentTest) runReport.result = problems ? "silent-test-incomplete" : "silent-test-passed (no narration — not a course)";
  else runReport.result = problems ? "incomplete" : only ? "partial-run-complete" : runReport.limitations.length ? "complete-with-notes" : "complete";
}

let exitCode = 0;
try {
  await main();
  exitCode = silentTest ? 3 : runReport.result === "incomplete" ? 2 : 0;
} catch (error) {
  runReport.result = "stopped";
  runReport.error = error.message;
  if (error instanceof NarrationError) {
    // An instruction, not a crash: say what to do.
    log.error("narration.unavailable", { message: error.message });
    runReport.blockers.push({ area: "narration", detail: error.message });
  } else log.error("run.failed", { message: error.stack?.split("\n").slice(0, 6).join(" | ") ?? error.message });
  exitCode = 1;
} finally {
  if (context?.app) {
    runReport.environment && (runReport.environment.reroutedRequests = context.app.rerouted.count);
    await resetUi(context.app.page).catch(() => undefined);
    await closeApp(context.app, context.environment, log);
  }
  runReport.finishedAt = new Date().toISOString();
  runReport.exitCode = exitCode;
  writeJson(path.join(OUT, "run-report.json"), runReport);
  writeJson(path.join(OUT, "coverage-report.json"), coverage);
  writeJson(path.join(OUT, "quality-report.json"), quality);
  log.info("run.end", { message: `${runReport.result} — reports in ${path.relative(ROOT, OUT)}: run-report.json, coverage-report.json, quality-report.json` });
  await log.close();
  process.exit(exitCode);
}
