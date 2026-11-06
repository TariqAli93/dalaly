// Speech providers, REST or a local executable only (no SDKs):
//   text-to-speech (narration)
//     gemini  Google Gemini TTS — preferred. The voice is looked up in the
//             Extended Voice Library (Iraqi Arabic, male) and otherwise a
//             configured prebuilt voice reads the Iraqi-dialect script.
//     azure   Azure Speech, ar-IQ-BasselNeural (an Iraqi Arabic voice).
//     piper   local Piper with ar_JO-kareem — offline and free, but
//             Jordanian Arabic, not Iraqi. Used only when configured.
//   speech-to-text (the listening check of finished videos)
//     gemini  gemini-3.5-transcribe · azure  ar-IQ recognition · whisper  local whisper.cpp
// Keys come from the environment or, read-only, the root .env and never
// appear in a message. Local tools download into tools/ with pinned SHA-256.
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { ROOT, run, secret, sleep } from "./util.mjs";

/** An error the person running the studio can act on; its message says what to do. */
export class NarrationError extends Error {}

/** fetch with retries for throttling and transient errors, honouring Retry-After. */
async function request(url, init, { attempts = 6, retryDelay } = {}) {
  for (let attempt = 1; ; attempt += 1) {
    const response = await fetch(url, { ...init, signal: AbortSignal.timeout(120_000) }).catch((error) => ({ ok: false, status: 0, headers: new Headers(), text: async () => error.cause?.code ?? error.message, json: async () => ({}) }));
    if (response.ok || attempt >= attempts || ![0, 429, 500, 502, 503, 504].includes(response.status)) return response;
    const wait = (await retryDelay?.(response.clone?.() ?? response)) ?? Number(response.headers.get("retry-after")) * 1000;
    // A wait longer than two minutes means a daily quota: stop and say so.
    if (wait > 120_000) return response;
    await sleep(Number.isFinite(wait) && wait > 0 ? wait : 2000 * attempt);
  }
}

const words = (text) => text.split(/\s+/).filter(Boolean).length;

// ---------- local tools ----------
const TOOLS = path.join(ROOT, "tools");
// Hashes: GitHub release digest / Hugging Face LFS sha256 where published;
// the Piper archive (2023 release, no published digest) was hashed on its
// first verified download (2026-11-04).
const LOCAL_TOOLS = {
  piper: {
    dir: path.join(TOOLS, "piper"),
    files: [
      { url: "https://github.com/rhasspy/piper/releases/download/2023.11.14-2/piper_windows_amd64.zip", name: "piper_windows_amd64.zip", sha256: "f3c58906402b24f3a96d92145f58acba6d86c9b5db896d207f78dc80811efcea", unzip: true },
      { url: "https://huggingface.co/rhasspy/piper-voices/resolve/main/ar/ar_JO/kareem/medium/ar_JO-kareem-medium.onnx", name: "ar_JO-kareem-medium.onnx", sha256: "9e95cab07b679da603bba17c4dec7ab3111320571964ee95c0379603c086491e" },
      { url: "https://huggingface.co/rhasspy/piper-voices/resolve/main/ar/ar_JO/kareem/medium/ar_JO-kareem-medium.onnx.json", name: "ar_JO-kareem-medium.onnx.json", sha256: "ea6d9b9d9076dbdb6bf5c98c6a141ef154959d2359709b37855727964e7d6c4d" },
    ],
    executable: "piper.exe",
  },
  whisper: {
    dir: path.join(TOOLS, "whisper"),
    files: [
      { url: "https://github.com/ggml-org/whisper.cpp/releases/download/b5454/whisper-bin-x64.zip", name: "whisper-bin-x64.zip", sha256: "6ba69e3482d7826214f90a6a9c84ca07782aec1e1d0c6a7c30c994fd5d816ccb", unzip: true },
      { url: "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3-turbo-q5_0.bin", name: "ggml-large-v3-turbo-q5_0.bin", sha256: "394221709cd5ad1f40c46e6031ca61bce88931e6e088c188294c6d5a55ffa7e2" },
    ],
    executable: "whisper-cli.exe",
  },
};

function findFile(directory, name) {
  if (!fs.existsSync(directory)) return null;
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    if (entry.isFile() && entry.name.toLowerCase() === name.toLowerCase()) return full;
    if (entry.isDirectory()) {
      const found = findFile(full, name);
      if (found) return found;
    }
  }
  return null;
}

/** Installs a local tool into tools/<name> (verified downloads), returns { dir, executable }. */
async function localTool(name, log) {
  const tool = LOCAL_TOOLS[name];
  const ready = path.join(tool.dir, ".verified");
  if (fs.existsSync(ready)) return { dir: tool.dir, executable: findFile(tool.dir, tool.executable) };
  if (process.platform !== "win32") throw new NarrationError(`The local ${name} build here is for Windows; install ${name} yourself and put it in ${path.relative(ROOT, tool.dir)}.`);
  fs.mkdirSync(tool.dir, { recursive: true });
  for (const file of tool.files) {
    const target = path.join(tool.dir, file.name);
    if (!fs.existsSync(target)) {
      log?.info("tool.download", { message: `${name}: ${file.url}` });
      const response = await fetch(file.url, { redirect: "follow" });
      if (!response.ok) throw new NarrationError(`Downloading ${file.name} for ${name} failed: HTTP ${response.status}`);
      fs.writeFileSync(`${target}.part`, Buffer.from(await response.arrayBuffer()));
      fs.renameSync(`${target}.part`, target);
    }
    const actual = createHash("sha256").update(fs.readFileSync(target)).digest("hex");
    if (actual !== file.sha256) {
      fs.rmSync(target, { force: true });
      throw new NarrationError(`${file.name} for ${name} has SHA-256 ${actual}, expected ${file.sha256}; the file was deleted and nothing was installed.`);
    }
    if (file.unzip) await run("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", `Expand-Archive -LiteralPath '${target}' -DestinationPath '${tool.dir}' -Force`], { timeoutMs: 5 * 60_000 });
  }
  const executable = findFile(tool.dir, tool.executable);
  if (!executable) throw new NarrationError(`${name}: ${tool.executable} not found in the downloaded archive`);
  fs.writeFileSync(ready, new Date().toISOString());
  log?.info("tool.installed", { message: `${name} in ${path.relative(ROOT, tool.dir)}` });
  return { dir: tool.dir, executable };
}

// ---------- Gemini ----------
// `narration.gemini.baseUrl` overrides it (a proxy, or a local stand-in for testing the adapter).
const GEMINI_API = "https://generativelanguage.googleapis.com/v1beta";
const geminiKey = () => secret("GEMINI_API_KEY") || secret("GOOGLE_API_KEY");
const GEMINI_SETUP = "Create an API key in Google AI Studio (https://aistudio.google.com/apikey) and put GEMINI_API_KEY=<key> in the root .env or the environment, then run pnpm tutorial:generate again. The free tier is rate-limited per minute and per day (limits: https://aistudio.google.com/rate-limit); with billing enabled the estimate printed before synthesis applies.";

async function geminiFailure(response, what) {
  const body = await response.json().catch(() => ({}));
  const message = String(body?.error?.message ?? (await response.text?.().catch(() => "")) ?? "").replace(/\s+/g, " ").slice(0, 240);
  const status = body?.error?.status ?? "";
  if (response.status === 0) return `${what}: cannot reach generativelanguage.googleapis.com (${message}). Check the network.`;
  if (response.status === 400 && /API key/i.test(message)) return `${what}: Google rejected GEMINI_API_KEY (${message}). ${GEMINI_SETUP}`;
  if (response.status === 403) return `${what}: refused (HTTP 403 ${status}: ${message}). The key's project may lack access to this model, or the Gemini API is not available in this location.`;
  if (response.status === 404) return `${what}: not found (HTTP 404: ${message}). Check narration.gemini.model against https://aistudio.google.com/docs/models.`;
  if (response.status === 429) return `${what}: quota exhausted (HTTP 429 ${status}: ${message}). The free tier allows only a limited number of speech requests per minute and per day; clips already made are cached, so running again later continues where this stopped. Enabling billing on the key's project raises the limits.`;
  return `${what}: HTTP ${response.status}${message ? ` — ${message}` : ""}`;
}

/** Google's RetryInfo ("37s") as milliseconds, when the 429 carries one. */
async function geminiRetryDelay(response) {
  const body = await response.json().catch(() => ({}));
  const delay = (body?.error?.details ?? []).find((detail) => detail.retryDelay)?.retryDelay;
  const seconds = delay ? Number.parseFloat(delay) : NaN;
  return Number.isFinite(seconds) ? seconds * 1000 + 500 : undefined;
}

/** A 44-byte RIFF header for 16-bit mono PCM. */
export function wavHeader(bytes, rate) {
  const header = Buffer.alloc(44);
  header.write("RIFF", 0, "ascii");
  header.writeUInt32LE(36 + bytes, 4);
  header.write("WAVEfmt ", 8, "ascii");
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(rate, 24);
  header.writeUInt32LE(rate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36, "ascii");
  header.writeUInt32LE(bytes, 40);
  return header;
}

function geminiTts(settings, { log }) {
  const g = settings.gemini;
  const GEMINI = g.baseUrl || GEMINI_API;
  const key = geminiKey();
  let voice = null;
  let legacy = false;
  const headers = { "x-goog-api-key": key, "content-type": "application/json" };
  return {
    id: "gemini",
    missing: key ? null : "GEMINI_API_KEY is not set",
    setup: GEMINI_SETUP,
    async prepare() {
      const model = await request(`${GEMINI}/models/${g.model}`, { headers });
      if (!model.ok) throw new NarrationError(await geminiFailure(model, `Gemini model ${g.model}`));
      if (g.voice && g.voice !== "auto") {
        voice = { id: g.voice, label: g.voice, regional: false };
      } else {
        // The Extended Voice Library, filtered like a person would in AI Studio.
        for (const query of g.voiceQueries) {
          const response = await request(`${GEMINI}/voices?${new URLSearchParams({ ...query, page_size: "50" })}`, { headers });
          if (!response.ok) {
            log?.warn("narration.voice-library", { message: await geminiFailure(response, "Gemini voice library") });
            break;
          }
          const found = ((await response.json()).voices ?? [])[0];
          if (found) {
            voice = { id: found.id, label: `${found.display_name ?? found.id} (${[found.language_code, found.accent, found.gender].filter(Boolean).join(", ")})`, regional: /IQ|Iraq/i.test(`${found.language_code} ${found.accent}`) };
            break;
          }
        }
        voice ??= { id: g.fallbackVoice, label: `${g.fallbackVoice} (prebuilt, no Iraqi library voice found)`, regional: false };
      }
      return {
        voice: voice.label,
        cacheKey: ["gemini", g.model, voice.id, g.style].join("|"),
        dialect: voice.regional ? "Iraqi Arabic voice reading Iraqi-dialect script" : "Iraqi-dialect script read by a general Arabic voice (accent not guaranteed Iraqi)",
        iraqiVoice: voice.regional,
      };
    },
    async synthesize(text, file) {
      if (!legacy) {
        const body = {
          model: g.model,
          input: [{ type: "user_input", content: [{ type: "text", text, annotations: [{ type: "speech_metadata", style: g.style }] }] }],
          response_format: { type: "audio", mime_type: "audio/wav", sample_rate: 24000 },
          generation_config: { speech_config: [{ voice: voice.id }] },
        };
        const response = await request(`${GEMINI}/interactions`, { method: "POST", headers, body: JSON.stringify(body) }, { retryDelay: geminiRetryDelay });
        // A project or model without the Interactions API: use generateContent (prebuilt voices only).
        if ((response.status === 404 || response.status === 400) && !voice.regional && /interaction|unknown name|not found|not supported|invalid json/i.test(await response.clone().text().catch(() => ""))) {
          legacy = true;
          log?.warn("narration.gemini-endpoint", { message: "the Interactions API refused the request; using generateContent for speech" });
        } else {
          if (!response.ok) throw new NarrationError(await geminiFailure(response, "Gemini text-to-speech"));
          const result = await response.json();
          const audio = (result.steps ?? []).filter((step) => step.type === "model_output").flatMap((step) => step.content ?? []).filter((part) => part.type === "audio" && part.data).at(-1);
          if (!audio) return { retry: `no audio in the response (${JSON.stringify(result).slice(0, 160)})` };
          fs.writeFileSync(file, Buffer.from(audio.data, "base64"));
          return {};
        }
      }
      const body = {
        contents: [{ parts: [{ text: `Read aloud as ${g.style}: ${text}` }] }],
        generationConfig: { responseModalities: ["AUDIO"], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice.id } } } },
      };
      const response = await request(`${GEMINI}/models/${g.model}:generateContent`, { method: "POST", headers, body: JSON.stringify(body) }, { retryDelay: geminiRetryDelay });
      if (!response.ok) throw new NarrationError(await geminiFailure(response, "Gemini text-to-speech"));
      const result = await response.json();
      const part = (result.candidates?.[0]?.content?.parts ?? []).find((item) => item.inlineData?.data);
      if (!part) return { retry: `no audio in the response (finish ${result.candidates?.[0]?.finishReason ?? "unknown"})` };
      const pcm = Buffer.from(part.inlineData.data, "base64");
      const rate = Number(/rate=(\d+)/.exec(part.inlineData.mimeType ?? "")?.[1] ?? 24000);
      // Raw 16-bit mono PCM: give it a WAV header so FFmpeg can read it.
      fs.writeFileSync(file, /^RIFF/.test(pcm.subarray(0, 4).toString("latin1")) ? pcm : Buffer.concat([wavHeader(pcm.length, rate), pcm]));
      return {};
    },
    estimate(texts) {
      const seconds = texts.reduce((sum, text) => sum + Math.max(1.5, words(text) * 0.45), 0);
      const characters = texts.reduce((sum, text) => sum + text.length + g.style.length, 0);
      const p = g.pricing;
      const usd = (seconds * p.audioTokensPerSecond * p.audioUsdPerMTok + (characters / 3) * p.inputUsdPerMTok) / 1e6;
      return { seconds, usd, basis: `${g.model}: $${p.audioUsdPerMTok}/1M audio tokens (${p.audioTokensPerSecond}/s) + $${p.inputUsdPerMTok}/1M input tokens, paid tier, prices as of ${p.asOf}; the free tier costs nothing but is rate-limited` };
    },
  };
}

function geminiStt(settings) {
  const GEMINI = settings.gemini.baseUrl || GEMINI_API;
  const key = geminiKey();
  return {
    id: "gemini",
    missing: key ? null : "GEMINI_API_KEY is not set",
    setup: GEMINI_SETUP,
    label: settings.listening.geminiModel,
    async transcribe(wavFile) {
      const body = {
        model: `models/${settings.listening.geminiModel}`,
        input: [{ type: "audio", mime_type: "audio/wav", data: fs.readFileSync(wavFile).toString("base64") }],
        // Arabic is detected automatically (the model lists ar-EG only as a code).
        generation_config: { transcription_config: { language_codes: [] } },
      };
      const headers = { "x-goog-api-key": key, "content-type": "application/json" };
      const response = await request(`${GEMINI}/interactions`, { method: "POST", headers, body: JSON.stringify(body) }, { retryDelay: geminiRetryDelay });
      if (response.ok) {
        const result = await response.json();
        const text = result.output_text ?? (result.steps ?? []).filter((step) => step.type === "model_output").flatMap((step) => step.content ?? []).filter((part) => part.type === "text").map((part) => part.text).join(" ");
        return { status: text ? "Success" : "NoMatch", text: text ?? "" };
      }
      if (![400, 404].includes(response.status)) throw new NarrationError(await geminiFailure(response, "Gemini transcription (listening check)"));
      // Without the Interactions API: a multimodal model transcribes through generateContent.
      const fallback = await request(`${GEMINI}/models/${settings.listening.geminiFallbackModel}:generateContent`, {
        method: "POST",
        headers,
        body: JSON.stringify({ contents: [{ parts: [{ text: "Transcribe this Arabic speech exactly as spoken, in Arabic script. Reply with the transcript only." }, { inlineData: { mimeType: "audio/wav", data: body.input[0].data } }] }] }),
      }, { retryDelay: geminiRetryDelay });
      if (!fallback.ok) throw new NarrationError(await geminiFailure(fallback, `Gemini transcription (listening check, ${settings.listening.geminiFallbackModel})`));
      const text = ((await fallback.json()).candidates?.[0]?.content?.parts ?? []).map((part) => part.text ?? "").join(" ").trim();
      return { status: text ? "Success" : "NoMatch", text };
    },
  };
}

// ---------- Azure ----------
const AZURE_SETUP = "Set AZURE_SPEECH_KEY and AZURE_SPEECH_REGION (the region of your Azure Speech resource, e.g. westeurope) in the environment or in the root .env, then run pnpm tutorial:generate again.";
const escapeXml = (text) => text.replace(/[<>&'"]/g, (char) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" })[char]);

function azureCredentials() {
  const key = secret("AZURE_SPEECH_KEY");
  const region = secret("AZURE_SPEECH_REGION").toLowerCase().replace(/\s+/g, "");
  const missing = [!key && "AZURE_SPEECH_KEY", !region && "AZURE_SPEECH_REGION"].filter(Boolean);
  if (!missing.length && !/^[a-z0-9]+$/.test(region)) return { key, region, missing: `AZURE_SPEECH_REGION "${region}" is not an Azure region name (letters and digits, e.g. westeurope)` };
  return { key, region, missing: missing.length ? `${missing.join(" and ")} ${missing.length > 1 ? "are" : "is"} not set` : null };
}

/** Turns an Azure HTTP failure into an instruction. Azure's error bodies never contain the key. */
async function azureFailure(response, what, region) {
  const detail = String(await response.text().catch(() => "")).replace(/\s+/g, " ").slice(0, 200);
  switch (response.status) {
    case 0: return `${what}: cannot reach Azure Speech in region "${region}" (${detail}). Check AZURE_SPEECH_REGION and the network.`;
    case 401: return `${what}: Azure rejected AZURE_SPEECH_KEY (HTTP 401). Use a key of a Speech or Azure AI services resource in region "${region}".`;
    case 403: return `${what}: Azure refused the request (HTTP 403${detail ? `: ${detail}` : ""}). The resource may be disabled, out of quota, or not allowed this voice.`;
    case 429: return `${what}: Azure kept throttling (HTTP 429) after several retries. Wait a minute and run again, or use a paid (S0) tier.`;
    default: return `${what}: HTTP ${response.status}${detail ? ` — ${detail}` : ""}`;
  }
}

function azureTts(settings) {
  const a = settings.azure;
  const { key, region, missing } = azureCredentials();
  const tts = `https://${region}.tts.speech.microsoft.com/cognitiveservices`;
  return {
    id: "azure",
    missing,
    setup: AZURE_SETUP,
    async prepare() {
      const response = await request(`${tts}/voices/list`, { headers: { "Ocp-Apim-Subscription-Key": key } });
      if (!response.ok) throw new NarrationError(await azureFailure(response, "Azure voice list", region));
      const voices = await response.json();
      const found = voices.find((voice) => voice.ShortName === a.voice);
      if (!found) {
        const local = voices.filter((voice) => voice.Locale === a.locale).map((voice) => voice.ShortName);
        throw new NarrationError(`Voice ${a.voice} is not offered in region "${region}"${local.length ? ` (available ${a.locale} voices: ${local.join(", ")})` : ""}. Use a region that has it or change narration.azure.voice.`);
      }
      return { voice: `${found.ShortName} (${found.LocaleName ?? found.Locale}, ${region})`, cacheKey: ["azure", a.voice, a.rate, a.locale].join("|"), dialect: "Iraqi Arabic (ar-IQ neural voice)", iraqiVoice: a.locale === "ar-IQ" };
    },
    async synthesize(text, file) {
      const ssml = `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="${a.locale}"><voice name="${a.voice}"><prosody rate="${a.rate}">${escapeXml(text)}</prosody></voice></speak>`;
      const response = await request(`${tts}/v1`, {
        method: "POST",
        headers: { "Ocp-Apim-Subscription-Key": key, "Content-Type": "application/ssml+xml", "X-Microsoft-OutputFormat": "riff-48khz-16bit-mono-pcm", "User-Agent": "dalaly-tutorial-studio" },
        body: ssml,
      });
      if (!response.ok) throw new NarrationError(await azureFailure(response, "Azure text-to-speech", region));
      fs.writeFileSync(file, Buffer.from(await response.arrayBuffer()));
      return {};
    },
    estimate(texts) {
      const characters = texts.reduce((sum, text) => sum + text.length, 0);
      return { seconds: texts.reduce((sum, text) => sum + Math.max(1.5, words(text) * 0.45), 0), usd: (characters * a.usdPerMillionCharacters) / 1e6, basis: `Azure neural TTS list price $${a.usdPerMillionCharacters}/1M characters (check your tier; F0 includes a monthly free allowance)` };
    },
  };
}

function azureStt(settings) {
  const { key, region, missing } = azureCredentials();
  return {
    id: "azure",
    missing,
    setup: AZURE_SETUP,
    label: `Azure speech-to-text ${settings.azure.locale}`,
    async transcribe(wavFile) {
      const url = `https://${region}.stt.speech.microsoft.com/speech/recognition/conversation/cognitiveservices/v1?language=${encodeURIComponent(settings.azure.locale)}&format=simple`;
      const response = await request(url, { method: "POST", headers: { "Ocp-Apim-Subscription-Key": key, "Content-Type": "audio/wav; codecs=audio/pcm; samplerate=16000", Accept: "application/json" }, body: fs.readFileSync(wavFile) });
      if (!response.ok) throw new NarrationError(await azureFailure(response, "Azure speech-to-text (listening check)", region));
      const body = await response.json();
      return { status: body.RecognitionStatus, text: body.DisplayText ?? "" };
    },
  };
}

// ---------- local Piper and whisper.cpp ----------
const LOCAL_SETUP = (name) => `The local ${name} is downloaded into tools/${name} (pinned SHA-256) the first time it is configured; it needs about ${name === "piper" ? "90 MB" : "590 MB"} and no key.`;

function piperTts(settings, { log }) {
  let tool = null;
  const rate = Number.parseFloat(settings.piper.rate ?? "0") || 0;
  return {
    id: "piper",
    missing: null,
    setup: LOCAL_SETUP("piper"),
    async prepare() {
      tool = await localTool("piper", log);
      return { voice: "ar_JO-kareem-medium (Piper, local)", cacheKey: ["piper", "ar_JO-kareem-medium", rate].join("|"), dialect: "Jordanian Arabic voice (local) reading Iraqi-dialect script — not an Iraqi accent", iraqiVoice: false };
    },
    async synthesize(text, file) {
      // length_scale > 1 speaks slower: "-6%" → 1.06.
      await run(tool.executable, ["--model", path.join(tool.dir, "ar_JO-kareem-medium.onnx"), "--length_scale", String(1 - rate / 100), "--output_file", file], { cwd: path.dirname(tool.executable), input: text, timeoutMs: 120_000 });
      return {};
    },
    estimate(texts) {
      return { seconds: texts.reduce((sum, text) => sum + Math.max(1.5, words(text) * 0.45), 0), usd: 0, basis: "local, free" };
    },
  };
}

function whisperStt(settings, { log }) {
  let tool = null;
  return {
    id: "whisper",
    missing: null,
    setup: LOCAL_SETUP("whisper"),
    label: "whisper.cpp large-v3-turbo (local)",
    async transcribe(wavFile) {
      tool ??= await localTool("whisper", log);
      const { stdout } = await run(tool.executable, ["-m", path.join(tool.dir, "ggml-large-v3-turbo-q5_0.bin"), "-f", wavFile, "-l", "ar", "-nt", "-np", "-t", "8"], { cwd: path.dirname(tool.executable), timeoutMs: 5 * 60_000 });
      const text = stdout.replace(/\s+/g, " ").trim();
      return { status: text ? "Success" : "NoMatch", text };
    },
  };
}

const TTS = { gemini: geminiTts, azure: azureTts, piper: piperTts };
const STT = { gemini: geminiStt, azure: azureStt, whisper: whisperStt };
// The listening check prefers the narration provider's own recogniser.
const OWN_STT = { gemini: "gemini", azure: "azure", piper: "whisper" };

/**
 * Chooses the narration provider: `narration.provider` names one, or "auto"
 * takes the first of `narration.preference` that has its credentials. The
 * choice is made once per run, so every lesson has the same voice.
 */
export function chooseSpeech(settings, context) {
  const wanted = settings.provider === "auto" ? settings.preference : [settings.provider];
  const unknown = wanted.filter((id) => !TTS[id]);
  if (unknown.length) throw new NarrationError(`narration.provider "${unknown.join(", ")}" is not one of ${Object.keys(TTS).join(", ")}. A course without a voice is never produced.`);
  const candidates = wanted.map((id) => TTS[id](settings, context));
  const tts = candidates.find((candidate) => !candidate.missing);
  if (!tts) {
    const lines = candidates.map((candidate) => `  • ${candidate.id}: ${candidate.missing}. ${candidate.setup}`);
    throw new NarrationError(`No narration voice is available, so nothing was recorded.\n${lines.join("\n")}\n  • A local, keyless voice (Piper, Jordanian Arabic — not Iraqi) can be chosen with "narration.provider": "piper" in scripts/tutorial/tutorial.config.json.`);
  }
  const listenId = settings.listening.provider === "auto" ? OWN_STT[tts.id] : settings.listening.provider;
  if (!STT[listenId]) throw new NarrationError(`narration.listening.provider "${listenId}" is not one of ${Object.keys(STT).join(", ")}`);
  const stt = STT[listenId](settings, context);
  if (stt.missing) throw new NarrationError(`The listening check (${listenId}) is not available: ${stt.missing}. ${stt.setup}`);
  return { tts, stt, skipped: candidates.filter((candidate) => candidate !== tts && candidates.indexOf(candidate) < candidates.indexOf(tts)).map((candidate) => ({ id: candidate.id, reason: candidate.missing })) };
}
