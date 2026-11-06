/* global document, requestAnimationFrame, window -- page.evaluate callbacks run in the renderer */
// Records the real Electron window.
//
// "window" (Windows 10 1903+, FFmpeg 8.1+): FFmpeg's gfxcapture grabs the
// app window's own surface through Windows.Graphics.Capture in real time —
// up to 60 frames a second while anything moves — and the fps filter turns
// that into constant 30 fps (measured on this project's probe window: every
// one of 180 frames unique during motion). A frame counter drawn below the
// picture proves the rate for every recording. A pure-black frame painted at the
// start and at the end (overlay `sync`) is found again with blackdetect; it
// ties video time to the step clock and measures any drift between the two.
//
// "screencast" (fallback only): the DevTools screencast, change-driven JPEG
// frames held until the next one. At 1080p it delivered about 8 frames a
// second while the page moved, so it is used only when window capture is not
// available, and the quality report says so.
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { installOverlay } from "./overlay.mjs";
import { run, sleep } from "./util.mjs";

const clock = () => Number(process.hrtime.bigint()) / 1e9;
const MARK_SECONDS = 0.5;

const colour = ["-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709", "-color_range", "tv"];

/** The raw-capture encoder: NVENC when the GPU has it (keeps the CPU for the app), else x264 ultrafast. */
export async function pickCaptureEncoder(ffmpeg) {
  try {
    await run(ffmpeg, ["-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", "color=c=white:s=1920x1080:r=30:d=0.2", "-c:v", "h264_nvenc", "-f", "null", "-"], { timeoutMs: 20_000 });
    return "h264_nvenc";
  } catch {
    return "libx264";
  }
}

const encoderArgs = (encoder) =>
  encoder === "h264_nvenc" ? ["-c:v", "h264_nvenc", "-preset", "p5", "-tune", "hq", "-rc", "vbr", "-cq", "16", "-b:v", "0"] : ["-c:v", "libx264", "-preset", "ultrafast", "-crf", "12"];

/** Black segments [{ start, end }] of a recording between `from` and `from + length` seconds. */
async function blackSegments(ffmpeg, file, from, length) {
  const { stderr } = await run(ffmpeg, ["-hide_banner", "-nostats", "-ss", from.toFixed(3), "-t", length.toFixed(3), "-copyts", "-i", file, "-vf", "blackdetect=d=0.15:pix_th=0.04:pic_th=0.98", "-an", "-f", "null", "-"], { timeoutMs: 5 * 60_000 });
  return [...stderr.matchAll(/black_start:([\d.]+) black_end:([\d.]+)/g)].map((match) => ({ start: Number(match[1]), end: Number(match[2]) }));
}

async function windowRecording(page, file, { ffmpeg, ffprobe, video, capture, log }) {
  // The captured surface is the window: title bar on top, borders (if any)
  // equal on the sides and bottom. The raw file keeps the whole client area:
  // video.height rows of picture plus `pad` rows below, which hide Windows
  // 11's rounded corners and carry the frame counter; the editor crops them.
  const pad = capture.pad;
  const crop = `crop=${capture.contentWidth}:${capture.contentHeight}:(iw-${capture.contentWidth})/2:ih-${capture.contentHeight}-(iw-${capture.contentWidth})/2`;
  const fit = capture.contentWidth === video.width && capture.contentHeight === video.height + pad ? "" : `,scale=${video.width}:${video.height + pad}:flags=lanczos`;
  const args = [
    "-hide_banner", "-loglevel", "error", "-nostats", "-progress", "pipe:1", "-stats_period", "0.25", "-y",
    "-f", "lavfi", "-i", `gfxcapture=hwnd=${capture.hwnd}:capture_cursor=0:max_framerate=60`,
    "-vf", `hwdownload,format=bgra,${crop}${fit},fps=${video.fps},scale=out_color_matrix=bt709:out_range=tv,format=yuv420p`,
    ...encoderArgs(capture.encoder), "-g", String(video.fps), "-r", String(video.fps), ...colour,
    "-f", "matroska", file,
  ];
  const ffmpegProcess = spawn(ffmpeg, args, { windowsHide: true, stdio: ["pipe", "pipe", "pipe"] });
  let errors = "";
  let frames = 0;
  ffmpegProcess.stderr.on("data", (chunk) => (errors = (errors + chunk).slice(-4000)));
  ffmpegProcess.stdout.on("data", (chunk) => {
    const reported = [...String(chunk).matchAll(/^frame=(\d+)/gm)].at(-1);
    if (reported) frames = Number(reported[1]);
  });
  const done = new Promise((resolve) => ffmpegProcess.on("close", resolve));
  // The counter's size in CSS px: `pad` physical rows at this page zoom and display scale.
  const unit = 1 / ((page.__tutorialZoom ?? 1) * (capture.scale ?? 1));
  const counter = (on) => page.evaluate(({ value, height, cell }) => window.__tutorial.clock(value, height, cell), { value: on, height: pad * unit, cell: 12 * unit });
  const marker = async (on) => {
    // A reload (e.g. logging out) removes the overlay; put it back before marking.
    await page.evaluate(installOverlay);
    await counter(true);
    await page.evaluate((value) => window.__tutorial.sync(value), on);
  };

  // The marker is a change on screen, so frames flow from the start.
  await marker(true);
  const deadline = Date.now() + 15_000;
  while (frames < 3) {
    if (ffmpegProcess.exitCode !== null || Date.now() > deadline) {
      ffmpegProcess.kill();
      await marker(false).catch(() => undefined);
      throw new Error(`window capture produced no frames: ${errors.trim().slice(-600) || "no FFmpeg output"}`);
    }
    await sleep(100);
  }
  await sleep(MARK_SECONDS * 1000);
  await marker(false);
  const start = clock();

  const finish = async () => {
    if (ffmpegProcess.exitCode === null) {
      ffmpegProcess.stdin.write("q");
      ffmpegProcess.stdin.end();
    }
    const code = await Promise.race([done, sleep(20_000).then(() => "timeout")]);
    if (code === "timeout") ffmpegProcess.kill();
    return code;
  };

  return {
    file,
    method: "window",
    now: () => clock() - start,
    async stop() {
      await marker(true);
      const end = clock() - start;
      await sleep(MARK_SECONDS * 1000);
      const code = await finish();
      await marker(false).catch(() => undefined);
      await counter(false).catch(() => undefined);
      if (code !== 0) throw new Error(`window capture failed (exit ${code}): ${errors.trim().slice(-800)}`);
      const total = Number((await run(ffprobe, ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file])).stdout.trim());
      const head = await blackSegments(ffmpeg, file, 0, Math.min(total, 8));
      const tail = await blackSegments(ffmpeg, file, Math.max(0, total - 6), 6);
      const opening = head[0];
      const closing = tail.filter((segment) => segment.start > (opening?.end ?? 0)).at(-1);
      if (!opening || !closing) throw new Error(`sync markers not found in the capture (start ${opening ? "found" : "missing"}, end ${closing ? "found" : "missing"})`);
      const duration = closing.start - opening.end;
      const result = {
        file,
        method: "window",
        encoder: capture.encoder,
        offset: Number(opening.end.toFixed(3)),
        duration: Number(duration.toFixed(3)),
        frames: Math.round(duration * video.fps),
        clockSeconds: Number(end.toFixed(3)),
        // How far video time and the step clock ran apart over the recording.
        driftSeconds: Number((duration - end).toFixed(3)),
        // Where the frame counter is: below the picture, in the cropped rows.
        counter: { y: video.height, rows: pad, x: video.width / 2 - 96, width: 192 },
      };
      log?.info("recording.saved", { message: `${path.basename(file)} ${duration.toFixed(1)}s window capture (${capture.encoder}), clock drift ${(result.driftSeconds * 1000).toFixed(0)} ms` });
      return result;
    },
    async abort() {
      await finish().catch(() => undefined);
      await marker(false).catch(() => undefined);
      await counter(false).catch(() => undefined);
      // Windows may hold the file a moment after FFmpeg exits; cleanup never hides the real failure.
      fs.rmSync(file, { force: true, maxRetries: 20, retryDelay: 250 });
    },
  };
}

async function screencastRecording(page, file, { ffmpeg, video, log }) {
  const cdp = page.__tutorialCdp;
  if (!cdp) throw new Error("No DevTools session on the page (fitWindow not called in screencast mode)");
  const encoder = spawn(ffmpeg, [
    "-hide_banner", "-loglevel", "error", "-y",
    "-f", "image2pipe", "-framerate", String(video.fps), "-c:v", "mjpeg", "-i", "-",
    // Screencast JPEGs are full-range BT.601; video players expect limited-range BT.709.
    "-vf", `scale=${video.width}:${video.height}:force_original_aspect_ratio=decrease:flags=lanczos:in_range=pc:out_range=tv:in_color_matrix=bt601:out_color_matrix=bt709,pad=${video.width}:${video.height}:(ow-iw)/2:(oh-ih)/2:color=white,format=yuv420p`,
    "-c:v", "libx264", "-preset", "veryfast", "-crf", "12", "-r", String(video.fps), ...colour,
    "-f", "matroska", file,
  ], { windowsHide: true, stdio: ["pipe", "ignore", "pipe"] });
  let encoderError = "";
  encoder.stderr.on("data", (chunk) => (encoderError += chunk));
  const encoderDone = new Promise((resolve) => encoder.on("close", resolve));

  const start = Date.now() / 1000;
  let previous = null;
  let written = 0;
  let received = 0;
  let writing = Promise.resolve();
  let stopped = false;
  const write = (buffer) => new Promise((resolve) => (encoder.stdin.write(buffer) ? resolve() : encoder.stdin.once("drain", resolve)));
  // Writes the held frame until the output reaches `seconds` on the timeline.
  const fillTo = async (seconds) => {
    const target = Math.floor(seconds * video.fps);
    while (previous && written < target) {
      await write(previous);
      written += 1;
    }
  };
  const onFrame = (event) => {
    cdp.send("Page.screencastFrameAck", { sessionId: event.sessionId }).catch(() => undefined);
    if (stopped) return;
    received += 1;
    const frame = Buffer.from(event.data, "base64");
    const at = Math.max(0, event.metadata.timestamp - start);
    writing = writing.then(async () => {
      if (!previous) previous = frame;
      await fillTo(at);
      previous = frame;
    });
  };
  cdp.on("Page.screencastFrame", onFrame);
  await cdp.send("Page.startScreencast", { format: "jpeg", quality: video.jpegQuality, maxWidth: video.width, maxHeight: video.height, everyNthFrame: 1 });
  // A first frame even when the page is idle.
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => {
    document.documentElement.style.setProperty("--tutorial-tick", String(Math.random()));
    resolve();
  })));

  return {
    file,
    method: "screencast",
    now: () => Date.now() / 1000 - start,
    async stop() {
      const end = Date.now() / 1000 - start;
      await cdp.send("Page.stopScreencast").catch(() => undefined);
      stopped = true;
      cdp.off("Page.screencastFrame", onFrame);
      await writing;
      await fillTo(end);
      encoder.stdin.end();
      const code = await encoderDone;
      if (code !== 0) throw new Error(`FFmpeg recording failed: ${encoderError.slice(-1500)}`);
      if (!received) throw new Error("The screencast delivered no frames");
      log?.info("recording.saved", { message: `${path.basename(file)} ${end.toFixed(1)}s screencast, ${received} frames received → ${written} written` });
      return { file, method: "screencast", encoder: "libx264", offset: 0, duration: written / video.fps, frames: written, clockSeconds: end, driftSeconds: 0, received };
    },
    async abort() {
      stopped = true;
      cdp.off("Page.screencastFrame", onFrame);
      await cdp.send("Page.stopScreencast").catch(() => undefined);
      encoder.stdin.destroy();
      encoder.kill();
      await encoderDone;
      fs.rmSync(file, { force: true, maxRetries: 20, retryDelay: 250 });
    },
  };
}

/**
 * Starts recording the app window into `file` (Matroska, so an interrupted
 * capture stays readable). Returns { now, stop, abort }: `now()` is the step
 * clock in seconds, and `stop()` resolves to { file, offset, duration, frames,
 * driftSeconds, method } where `offset` is where that clock's zero lies in the file.
 */
export async function startRecording(page, file, { ffmpeg, ffprobe, video, capture, log }) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  return capture?.method === "window" ? windowRecording(page, file, { ffmpeg, ffprobe, video, capture, log }) : screencastRecording(page, file, { ffmpeg, video, log });
}
