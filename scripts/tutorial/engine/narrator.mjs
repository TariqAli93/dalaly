// Narration. One speech provider per run (engine/speech.mjs: Gemini by
// default, Azure, or a local voice), so every lesson has the same voice.
// Each clip is cached by text and voice, converted to the mix format (48 kHz
// mono PCM), trimmed of leading and trailing silence, and measured with
// FFmpeg before it is used: a silent, broken or implausibly long or short clip
// is requested once more, then the run stops. There is no silent fallback.
// The "silent test" narrator exists only to exercise recording and editing;
// its output is labelled as a test and never counts as a narrated course.
import fs from "node:fs";
import path from "node:path";
import { NarrationError, chooseSpeech, wavHeader } from "./speech.mjs";
import { run, sha256 } from "./util.mjs";

export { NarrationError };

// ---------- WAV (PCM 16-bit mono) ----------
export function readWav(file) {
  const buffer = fs.readFileSync(file);
  if (buffer.toString("ascii", 0, 4) !== "RIFF" || buffer.toString("ascii", 8, 12) !== "WAVE") throw new Error(`${file} is not a WAV file`);
  let offset = 12;
  let format = null;
  while (offset + 8 <= buffer.length) {
    const id = buffer.toString("ascii", offset, offset + 4);
    const size = buffer.readUInt32LE(offset + 4);
    const body = offset + 8;
    if (id === "fmt ") format = { channels: buffer.readUInt16LE(body + 2), sampleRate: buffer.readUInt32LE(body + 4), bits: buffer.readUInt16LE(body + 14) };
    if (id === "data") {
      if (!format || format.bits !== 16 || format.channels !== 1) throw new Error(`${file}: expected 16-bit mono PCM`);
      const samples = buffer.subarray(body, Math.min(buffer.length, body + size));
      return { ...format, samples, duration: samples.length / 2 / format.sampleRate };
    }
    offset = body + size + (size % 2);
  }
  throw new Error(`${file}: no data chunk`);
}

export function writeWav(file, samples, sampleRate) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, Buffer.concat([wavHeader(samples.length, sampleRate), samples]));
}

const PREFLIGHT_TEXT = "هلا بيكم، هذا اختبار صوت دلالي قبل تسجيل الدروس.";
const clean = (text) => text.replace(/\s+/g, " ").trim();
const wordCount = (text) => text.split(/\s+/).filter(Boolean).length;

/** Any provider's audio → 48 kHz mono 16-bit PCM, ends trimmed to 80 ms of silence. */
async function toMixFormat(ffmpeg, input, output, sampleRate) {
  const trim = "silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.08";
  await run(ffmpeg, ["-hide_banner", "-loglevel", "error", "-y", "-i", input, "-af", `${trim},areverse,${trim},areverse`, "-ac", "1", "-ar", String(sampleRate), "-c:a", "pcm_s16le", output]);
}

/**
 * The narrator. `analyze(file)` measures a clip with FFmpeg and
 * `judge(analysis, text)` lists its problems (engine/audio.mjs).
 */
export async function createNarrator(settings, cacheDir, { ffmpeg, analyze, judge, log, silentTest = false }) {
  if (silentTest) return silentNarrator(settings, path.join(cacheDir, "silent-test"), log);
  const { tts, stt, skipped } = chooseSpeech(settings, { log });
  for (const item of skipped) log.info("narration.provider-skipped", { message: `${item.id}: ${item.reason}` });
  const voice = await tts.prepare();
  const dir = path.join(cacheDir, tts.id);
  // Clips of the old timed-silence placeholder can never be used again.
  fs.rmSync(path.join(cacheDir, "silent"), { recursive: true, force: true });
  const idOf = (text) => sha256([voice.cacheKey, settings.sampleRate, text].join("|")).slice(0, 24);
  const cachedMeta = (text) => {
    const id = idOf(text);
    const file = path.join(dir, `${id}.wav`);
    const sidecar = path.join(dir, `${id}.json`);
    if (!fs.existsSync(file) || !fs.existsSync(sidecar)) return null;
    const meta = JSON.parse(fs.readFileSync(sidecar, "utf8"));
    // A cached clip counts only with its measurement, for exactly these bytes.
    return meta.bytes === fs.statSync(file).size && meta.problems?.length === 0 && meta.cacheKey === voice.cacheKey ? meta : null;
  };

  /** Synthesises (or reuses) one clip and proves it is audible speech of a plausible length. */
  async function clip(text) {
    const line = clean(text);
    const id = idOf(line);
    const file = path.join(dir, `${id}.wav`);
    const sidecar = path.join(dir, `${id}.json`);
    fs.mkdirSync(dir, { recursive: true });
    let lastProblem = "";
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      const meta = cachedMeta(line);
      if (!meta) {
        const raw = path.join(dir, `${id}.raw`);
        const outcome = await tts.synthesize(line, raw);
        if (outcome.retry) {
          lastProblem = outcome.retry;
          log?.warn("narration.retry", { message: `${tts.id}: ${outcome.retry} — "${line.slice(0, 32)}…"` });
          continue;
        }
        try {
          await toMixFormat(ffmpeg, raw, file, settings.sampleRate);
        } catch (error) {
          lastProblem = `unreadable audio: ${error.message.split("\n")[0]}`;
          fs.rmSync(file, { force: true });
          continue;
        } finally {
          fs.rmSync(raw, { force: true });
        }
      }
      const wav = readWav(file);
      const analysis = meta ? meta.analysis : await analyze(file);
      const problems = judge(analysis, line);
      if (wav.sampleRate !== settings.sampleRate) problems.push(`${wav.sampleRate} Hz, expected ${settings.sampleRate}`);
      if (!problems.length) {
        if (!meta) fs.writeFileSync(sidecar, JSON.stringify({ text: line, provider: tts.id, cacheKey: voice.cacheKey, bytes: fs.statSync(file).size, analysis, problems }, null, 1));
        log?.info("narration.clip", { message: `${meta ? "cached" : "new"} ${wav.duration.toFixed(1)}s peak ${analysis.maxDb} dB ${line.slice(0, 32)}…` });
        return { file, duration: wav.duration, text: line, cached: Boolean(meta), analysis: { meanDb: analysis.meanDb, maxDb: analysis.maxDb, voicedRatio: analysis.voicedRatio } };
      }
      // A silent or broken clip is never kept: drop it and ask again.
      fs.rmSync(file, { force: true });
      fs.rmSync(sidecar, { force: true });
      lastProblem = problems.join("; ");
      log?.warn("narration.invalid-clip", { message: `${lastProblem} — synthesising again "${line.slice(0, 32)}…"` });
    }
    throw new NarrationError(`${tts.id} narration for "${line.slice(0, 60)}" is not usable speech after 3 attempts: ${lastProblem}`);
  }

  return {
    provider: tts.id,
    voice: voice.voice,
    dialect: voice.dialect,
    iraqiVoice: voice.iraqiVoice,
    listener: stt.label ?? stt.id,
    test: false,
    clip,
    transcribe: (wavFile) => stt.transcribe(wavFile),
    /** What synthesising these lines will take and cost (cached clips excluded). */
    estimate(texts) {
      const pending = [...new Set(texts.map(clean))].filter((text) => !cachedMeta(text));
      return { clips: pending.length, cached: new Set(texts.map(clean)).size - pending.length, ...tts.estimate(pending) };
    },
    /** Before anything is recorded: one real clip, measured and heard back by speech-to-text. */
    async preflight({ toListenable, recallOf, minRecall }) {
      const test = await clip(PREFLIGHT_TEXT);
      const heard = await stt.transcribe(await toListenable(test.file));
      const recall = recallOf(PREFLIGHT_TEXT, heard.text);
      if (heard.status !== "Success" || recall < minRecall) throw new NarrationError(`${tts.id} synthesised the test sentence but the listening check (${stt.label ?? stt.id}) heard "${heard.text}" (${heard.status}, ${Math.round(recall * 100)}% of the words). The voice output is not usable narration.`);
      return { provider: tts.id, voice: voice.voice, dialect: voice.dialect, listener: stt.label ?? stt.id, test: { text: PREFLIGHT_TEXT, duration: Number(test.duration.toFixed(2)), ...test.analysis, heard: heard.text, recall } };
    },
  };
}

/** Test mode only: silence as long as the line would take to say. Never narration. */
function silentNarrator(settings, dir, log) {
  return {
    provider: "silent-test",
    voice: "none (silent test mode)",
    dialect: "none",
    iraqiVoice: false,
    listener: "none",
    test: true,
    async clip(text) {
      const line = clean(text);
      const file = path.join(dir, `${sha256(line).slice(0, 24)}.wav`);
      // About 0.5 s a word: generous, so real narration of the same line usually fits the recorded gap.
      const duration = Math.max(1.5, wordCount(line) * 0.5) + 0.3;
      if (!fs.existsSync(file)) writeWav(file, Buffer.alloc(Math.round(duration * settings.sampleRate) * 2), settings.sampleRate);
      log?.info("narration.clip", { message: `silent test ${duration.toFixed(1)}s ${line.slice(0, 32)}…` });
      return { file, duration, text: line, cached: false, analysis: null };
    },
    transcribe: async () => ({ status: "NotRun", text: "" }),
    estimate: (texts) => ({ clips: texts.length, cached: 0, seconds: 0, usd: 0, basis: "silent test mode" }),
    preflight: async () => ({ provider: "silent-test", voice: "none", dialect: "none", listener: "none", test: null }),
  };
}
