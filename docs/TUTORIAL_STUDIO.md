# Tutorial Studio

`pnpm tutorial:generate` records narrated video lessons of the real Electron
app and assembles them into one course. It is a developer tool: nothing in it
ships with the app, and it never touches the development database, the web
demo or an office's data.

```bash
pnpm tutorial:generate                               # whole course
pnpm tutorial:generate -- --only intro,sale-listings # some lessons (ids from output/plan.json)
pnpm tutorial:generate -- --fresh                    # re-record even unchanged lessons
pnpm tutorial:generate -- --silent-test              # test recording and editing without a voice
```

Output (git-ignored) in `scripts/tutorial/output/`:

| Path | What |
| --- | --- |
| `complete-course.mp4` | All lessons, 1920×1080 landscape, 30 fps, H.264 + AAC narration, Arabic subtitle track — written only when every lesson verified |
| `lessons/NN-<id>.mp4` | One file per lesson |
| `subtitles/*.srt` | Per lesson and for the course |
| `run-report.json` | The run: mode, every check, providers (voice, dialect, listening check), the narration cost estimate, environment isolation, result, limitations, blockers, cleanup |
| `coverage-report.json` | What was discovered and planned; per lesson the workflows demonstrated, overview-only lessons, skipped optional and informational steps, failed required steps with screenshots |
| `quality-report.json` | Per lesson and for the course: capture method and the measured frame rate during movement, clock drift, final frame rate and frame count, decode errors, still and black stretches, subtitles, sync, and narration (loudness, voiced share of every line where it was placed, speech-to-text listening check) |
| `discovery.json`, `plan.json` | What the app showed and the validated lesson plan |
| `diagnostics/` | A still per lesson, a screenshot of every failed or skipped step, lessons whose narration failed (`*.failed-narration.mp4`) and any course moved aside as `*.unverified.*` |
| `logs/run-*.jsonl` | Structured log of each run |
| `state.json`, `cache/`, `work/recordings/` | Resume data: verified lessons, measured narration clips and the raw recordings they can be re-edited from |
| `test-run/` | Everything a `--silent-test` run produced (same layout); never a course |

Exit codes: 0 when every planned lesson and the course verified (the result
says `complete`, or `complete-with-notes` when, for example, the voice is not
Iraqi); 2 when the run finished incomplete; 1 when it stopped early — for
example when no narration voice is usable, with the message saying what to
do; 3 for a silent test.

## Requirements

- Windows desktop session (the app is a real Electron window), PostgreSQL as
  in `README.md`, Node 20+, `pnpm install`.
- FFmpeg 8.1+ with libx264, libass and `gfxcapture` (`winget install
  Gyan.FFmpeg`). If none is on `PATH` and `tools/ffmpeg/bin` is empty, the run
  downloads the gyan.dev release build into `tools/ffmpeg` after checking its
  published SHA-256 (set `ffmpegSha256` in the config to accept only one exact
  build). An NVIDIA GPU is used for the raw capture encode when present.
- A display that can hold a 1920×1088 physical-pixel window (e.g. 2560×1440
  at 100 %, or 2880×1620 at 150 %). Otherwise the DevTools screencast is used
  and the reports say movement is captured at a low rate.
- A narration voice (required), chosen once per run so every lesson sounds the
  same. `narration.provider: "auto"` takes the first available of:
  - **Gemini** (preferred): `GEMINI_API_KEY` (or `GOOGLE_API_KEY`) from Google
    AI Studio. Model `gemini-3.8-flash-tts`; the voice is looked up in the
    Extended Voice Library (Iraqi Arabic, male) and otherwise the prebuilt
    `Charon` reads the Iraqi-dialect script — the run then reports that the
    accent is not guaranteed Iraqi. The free tier costs nothing but is
    rate-limited per minute and per day; with billing, list prices on
    2026-11-04 were $9 per 1M audio tokens (25 per second of speech), about
    $0.25 for a 20-minute course. Before synthesising, the run prints the
    estimate for the clips not yet cached and stops if it exceeds
    `narration.maxEstimatedCostUsd`. The listening check uses
    `gemini-3.5-transcribe`.
  - **Azure Speech**: `AZURE_SPEECH_KEY` and `AZURE_SPEECH_REGION`, voice
    `ar-IQ-BasselNeural` (an Iraqi Arabic voice); Azure speech-to-text does the
    listening check.
  - **Piper** (local, offline, free — only when `narration.provider` is
    `"piper"`): `ar_JO-kareem`, a Jordanian Arabic voice, so the course is
    reported as not Iraqi-accented. Piper and the whisper.cpp listening check
    download into `tools/piper` and `tools/whisper` (about 680 MB, pinned
    SHA-256).

  There is no silent fallback: with no usable voice the run stops before the
  database or the app is touched and says how to enable each provider.
- AI narration (optional): `ANTHROPIC_API_KEY`. Claude (`claude-opus-5-5`)
  then rewrites each lesson's narration from its verified steps and the page's
  accessibility tree. Without it the authored narration in `lessons.json` is
  used.

Keys are read from the environment or, read-only, from the root `.env`. They
are never written anywhere or printed.

## Isolation

- Database `dalaly_tutorial` (config `database.name`, must match
  `dalaly_tutorial[_x]` and differ from the `.env`, demo and system databases).
  The run creates it with the database comment `dalaly-tutorial-studio:<time>`
  and drops it again only when that comment is present; any other database
  with the name stops the run.
- Electron profile `output/work/profile` (`--user-data-dir`), which holds the
  `config.json` naming that database and the API's images, documents and
  backups. It is deleted only when it carries the studio's marker file.
- API port 45711. The built renderer always calls `127.0.0.1:34567`; those
  requests are rerouted to the tutorial API (as `test:startup:electron` does).
  The run refuses to start while anything listens on 34567, so no request can
  reach a running Dalaly.
- Data comes from the project's own seed (`server/.../seed.ts`) plus business
  records created through the HTTP API as the tutorial account
  (`engine/fixtures.mjs`: deals, a draft sale contract, a commission and a
  receipt, a lease, a follow-up). Every `07XXXXXXXXX` in the tutorial database
  becomes a placeholder `07X0000XXXX`. Lessons then create their own records
  (listings, requests, a customer, a follow-up, a deal, a contract draft, two
  receipts, a document, a user) — all fictional, all in this database. The
  tutorial account logs in through the login screen; nothing bypasses
  authentication or permissions.
- Native file dialogs cannot be automated. In the tutorial app only, a save
  dialog answers with the suggested file name in `output/work/exports` (so an
  export really runs and the file is checked) and open dialogs are cancelled;
  uploads use a generated specimen image.

## How a run works

1. Preflight: Node, output orientation, FFmpeg, window capture support and
   encoder, renderer build (`vite build` when sources are newer than
   `apps/renderer/dist`), then the voice: provider, credentials and model or
   voice availability, and one test sentence synthesised, measured, and
   transcribed back.
2. Environment and Electron launch (`engine/env.mjs`, `engine/app.mjs`). The
   window's client area is sized to 1920×1088 physical pixels and the page
   zoomed (150 % at 100 % display scaling), so the app lays out 1280 CSS
   pixels wide while Chromium paints text at full resolution. A short capture
   self-test proves the recorder before any lesson.
3. Capture (`engine/recorder.mjs`): FFmpeg's `gfxcapture` grabs the window's
   own surface through Windows.Graphics.Capture in real time (up to 60 frames a
   second while anything moves) and the `fps` filter makes constant 30 fps —
   real frames during movement, the same image only while nothing changes. The
   raw file keeps 8 extra rows below the picture (they hide Windows 11's
   rounded corners); the overlay draws a 16-bit frame counter there, advanced
   every animation frame, and the editor crops the rows off. A pure-black frame
   painted at the start and the end is found again with `blackdetect`; it ties
   video time to the step clock and measures drift between them. A minimized
   window is restored at once, and a locked Windows session pauses the run
   until it is unlocked (both would stop the window from painting).
4. The opening lesson records the real login.
5. Discovery (`engine/discovery.mjs`): sections from `NAV_SECTIONS` (parsed
   with the TypeScript compiler, never copied), routes and permissions from
   the running Vue router, and each page's heading, buttons, fields, selects,
   tabs and record links from its accessibility tree.
6. Planning (`engine/planner.mjs`): a section with an authored lesson in
   `lessons.json` keeps its workflow; every other navigation page gets a
   generic read-only tour from its observed controls. Every step is checked
   against the primitive schema, narration is checked for unsupported claims,
   and authored targets are compared with what the page showed.
7. Narration (`engine/narrator.mjs`, `engine/speech.mjs`): the estimate is
   printed, then every line is synthesised once (cached by text and voice),
   converted to 48 kHz mono, trimmed of leading and trailing silence and
   measured with FFmpeg: a peak above −12 dB, a mean level above −40 dB, at
   least 55 % voiced and a plausible length for its words. A clip that fails is
   requested again (three attempts), then the run stops. A cached clip is used
   only with its stored measurement for exactly those bytes.
8. Each lesson: the executor (`engine/executor.mjs`) runs the steps while the
   window is recorded. Steps are `required` (the default), `optional` (UI that
   may legitimately be absent, such as a matches dialog) or `informational`
   (emphasis only). Targets must be visible; the executor waits for the app's
   API requests to finish and its loaders to go before acting; a transient
   failure (element re-rendered, moved under the pointer) is retried once. A
   failed required step stops the lesson with a screenshot, the attempt is
   discarded and retried once more; a lesson whose required step keeps failing
   is reported as failed and not produced. A skipped optional or informational
   step says nothing, because its narration would describe what did not
   happen. A step's narration starts with its action, or once its result is
   visible for navigation, search and opening records, and the next step waits
   for it to finish.
9. Editing (`engine/editor.mjs`): the narration track is assembled
   sample-exactly from those start times (converted to video time with the
   measured drift), loudness-normalised (EBU R128, −16 LUFS), subtitles are
   written from the same timeline and burned in with libass (Segoe UI) with
   right-to-left marks, zoom steps become an eased push-in (`zoompan`, at most
   1.3×), lessons fade in and out. The course is joined with FFmpeg's concat
   filter in one encode, each lesson's audio padded or trimmed to its own video
   length, so sync cannot drift.
10. Validation (`engine/validator.mjs`) of every lesson and the course:
    ffprobe checks codec, size, pixel format, audio and subtitle tracks, the
    nominal frame rate (exactly 30/1), the average frame rate (within 0.05 %;
    a container's rational rounding such as 29.99998 is not a defect) and the
    frame count against duration × 30; a full decode reports errors, black
    stretches and long still stretches; SRT files are parsed; narration must
    start at or after its step and never overlap the next line. The frame
    counter is read back from every raw capture: the share of frames that
    show a new page frame is the real capture rate (content-independent), and
    every run of repeated frames of 100 ms or more is reported as a stall. Narration is proved in the finished file: integrated
    loudness −20…−12 LUFS, true peak ≤ 0 dBFS, each line's window at least
    50 % voiced (catches silence and misplacement), 60 % of all narrated time
    voiced, and a listening check — the longest line is decoded back out of
    the MP4 and transcribed; at least 35 % of its words must be heard. A
    lesson whose narration fails moves to `diagnostics/`.
    `complete-course.mp4` is assembled only when every lesson passed, carries
    one chapter per lesson, and gets the same checks plus the chapters (one
    per lesson, back to back, each exactly as long as its lesson).
11. Coverage per lesson, from the step results: `workflow-demonstrated` (every
    required step ran, with a real interaction and a verified result —
    expectations on the URL, visible text, an API record, or an exported
    file), `workflow-partial`, `overview+interactions`, `overview-only`,
    `failed`. Highlights and navigation alone are an overview.
12. Resume, in three tiers: (a) a lesson whose plan, narration, app build (git
    HEAD, local changes under `apps/` and `server/`, renderer build) and
    engine are unchanged is reused after it verifies again; (b) when only the
    narration changed, the kept raw recording is edited again with the new
    lines if each still ends before the next step began; (c) otherwise the
    lesson is recorded again. `--fresh` forces (c).
13. After a full run, generated files of lessons no longer in the plan and the
    run's intermediate edit files are deleted; each deletion is listed in
    `run-report.json`. The app and every process the run started are closed.

`--silent-test` runs the same pipeline with silent placeholder narration
(about 0.5 s a word) into `output/test-run/`: it exercises recording, steps,
editing and media checks, skips every narration check, labels everything a
test, and exits with 3. It never writes `output/complete-course.mp4`.

## Adding or changing lessons

- A new page in `NAV_SECTIONS` gets a tour automatically. Give it narration by
  adding its path under `sections` in `lessons.json` (`intro`, `what`, `who`,
  `create`, `search`, `searchTerm`, `tabs`, `open`, `value`, `tagline`).
- For a real workflow, add a lesson under `lessons` with that `section`. Use
  the primitives `title navigate click open fill select search upload highlight
  label scroll press back close wait verify capture pause`, accessible targets
  (`role`+`name`, `label`, `placeholder`, `text`, optionally `within` and
  `nth`; a `/regex/` string matches a pattern), `expect` for assertions
  (`url`, `visible`, `hidden`, `text`, `count`, `api` for a persisted record,
  `exported` for a file the app wrote), `workflow` to name what a step
  demonstrates, `level` (`optional`, `informational`), `when` for a step that
  undoes another, and `zoom` for a field worth a closer look. Dates use
  `{{today}}`, `{{in2days}}`, `{{in7days}}`, `{{in30days}}`, `{{in1year}}`.
  `css` targets exist as an escape hatch only.
- Issuing contracts, editing templates, posting manual journal entries,
  changing permissions, restoring backups and deleting records are shown, not
  executed. Receipts (rent and commission collection) are issued, because they
  are the workflow and the database is the tutorial's own.

## Current limits

The latest `run-report.json`, `coverage-report.json` and
`quality-report.json` are the source of truth.

- This PC has no narration credentials (no `GEMINI_API_KEY`, no Azure key).
  Until one is set, `pnpm tutorial:generate` stops in preflight with the
  instructions; `--silent-test` verifies everything except the voice.
- Gemini's voice library contents, the Gemini request formats and the local
  Piper/whisper.cpp tools were implemented from their documentation and have
  not run against the real services on this PC yet (the Gemini adapter was
  exercised against a local stand-in of the documented API, both endpoints).
  The first narrated run is their test; the preflight stops with the
  provider's own error if a request is rejected.
- Coverage of the latest silent test: 14 lessons demonstrate a workflow end to
  end; cash and roles are overviews with verified interactions; the dashboard,
  contract templates, journal, chart of accounts and locations are
  overview-only.
- Lessons build on each other's records in a full run (the rental listing is
  then a full match for the rental request). A lesson re-recorded on its own
  runs against fresh data, so its optional match dialog may list other offers.
- Found in the app (not changed by the studio): the purchase- and
  rental-request lists' search box says it searches by customer name or
  phone, but the server matches only the code, requirements and notes; and
  some seeded rentals show their type untranslated ("apartment - المنصور").
- Routes outside `NAV_SECTIONS` (`/help`, and the `new` pages reached from
  buttons) get no lesson of their own.
- The app window is visible while recording; leave it alone during a run (a
  real mouse moving over it can trigger hover effects).
