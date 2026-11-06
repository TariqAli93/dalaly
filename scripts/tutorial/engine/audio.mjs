// Audio measurements with FFmpeg, so "there is narration" is a measured fact:
// silencedetect + volumedetect for level and how much of a span is voiced,
// ebur128 for integrated loudness and peak. Used on every synthesised clip,
// on every lesson's final audio track and on the assembled course.
import { run } from "./util.mjs";

const number = (pattern, text) => {
  const match = pattern.exec(text);
  return match ? Number(match[1]) : null;
};

/**
 * Level and silence of a file's first audio stream (the whole track; spans
 * are measured from the silence intervals with voicedWithin).
 * Returns { duration, meanDb, maxDb, silences: [[start, end]], silentSeconds, voicedRatio }.
 */
export async function analyzeAudio(ffmpeg, file, { noiseDb = -40, minSilence = 0.3 } = {}) {
  const { stderr } = await run(ffmpeg, ["-hide_banner", "-nostats", "-loglevel", "info", "-i", file, "-map", "0:a:0", "-af", `silencedetect=noise=${noiseDb}dB:d=${minSilence},volumedetect`, "-f", "null", "-"], { timeoutMs: 10 * 60_000 });
  const clock = /Duration: (\d+):(\d+):([\d.]+)/.exec(stderr);
  const total = clock ? Number(clock[1]) * 3600 + Number(clock[2]) * 60 + Number(clock[3]) : 0;
  const silences = [];
  let open = null;
  for (const line of stderr.split(/\r?\n/)) {
    const begin = /silence_start: (-?[\d.]+)/.exec(line);
    const end = /silence_end: ([\d.]+)/.exec(line);
    if (begin) open = Math.max(0, Number(begin[1]));
    if (end) {
      silences.push([open ?? 0, Number(end[1])]);
      open = null;
    }
  }
  if (open !== null) silences.push([open, total]);
  const silentSeconds = silences.reduce((sum, [from, to]) => sum + Math.max(0, Math.min(to, total) - from), 0);
  return {
    duration: Number(total.toFixed(3)),
    meanDb: number(/mean_volume: (-?[\d.]+) dB/, stderr) ?? -Infinity,
    maxDb: number(/max_volume: (-?[\d.]+) dB/, stderr) ?? -Infinity,
    silences,
    silentSeconds: Number(silentSeconds.toFixed(3)),
    voicedRatio: total > 0 ? Number(Math.max(0, 1 - silentSeconds / total).toFixed(3)) : 0,
  };
}

/** EBU R128: integrated loudness (LUFS), loudness range (LU) and true peak (dBFS). */
export async function loudness(ffmpeg, file) {
  const { stderr } = await run(ffmpeg, ["-hide_banner", "-nostats", "-loglevel", "info", "-i", file, "-map", "0:a:0", "-af", "ebur128=peak=true", "-f", "null", "-"], { timeoutMs: 20 * 60_000 });
  const summary = stderr.slice(stderr.lastIndexOf("Summary:"));
  return {
    integratedLufs: number(/I:\s+(-?[\d.]+) LUFS/, summary),
    rangeLu: number(/LRA:\s+(-?[\d.]+) LU/, summary),
    truePeakDbfs: number(/Peak:\s+(-?[\d.]+) dBFS/, summary),
  };
}

/** Seconds of [from, to] not covered by the silence intervals. */
export function voicedWithin(silences, from, to) {
  let silent = 0;
  for (const [start, end] of silences) silent += Math.max(0, Math.min(end, to) - Math.max(start, from));
  return Math.max(0, to - from - silent);
}

/** Problems with one synthesised clip (empty when it is real, audible speech). */
export function judgeClip(analysis, text, limits) {
  const problems = [];
  const words = text.split(/\s+/).filter(Boolean).length;
  if (analysis.duration < Math.max(0.5, words * limits.minSecondsPerWord)) problems.push(`too short for ${words} words (${analysis.duration}s)`);
  // A generative voice that rambles on, repeats or invents text runs long.
  if (limits.maxSecondsPerWord && analysis.duration > 2 + words * limits.maxSecondsPerWord) problems.push(`too long for ${words} words (${analysis.duration}s)`);
  if (!(analysis.maxDb >= limits.clipMinPeakDb)) problems.push(`peak ${analysis.maxDb} dB below ${limits.clipMinPeakDb} dB`);
  if (!(analysis.meanDb >= limits.clipMinMeanDb)) problems.push(`mean level ${analysis.meanDb} dB below ${limits.clipMinMeanDb} dB`);
  if (analysis.voicedRatio < limits.clipMinVoicedRatio) problems.push(`only ${Math.round(analysis.voicedRatio * 100)}% voiced`);
  return problems;
}

const DIACRITICS = /[\u064B-\u0652\u0670\u0640]/g;
/** Arabic text reduced to comparable words (no diacritics, unified letter forms). */
export function normalizeArabic(text) {
  return text
    .replace(DIACRITICS, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((word) => word.length > 1);
}

/** Share of the expected words found in the recognised text. */
export function wordRecall(expected, recognized) {
  const want = normalizeArabic(expected);
  const heard = new Set(normalizeArabic(recognized));
  if (!want.length) return 0;
  return Number((want.filter((word) => heard.has(word)).length / want.length).toFixed(3));
}
