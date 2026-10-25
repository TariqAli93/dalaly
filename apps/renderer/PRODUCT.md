# Product

<!-- impeccable:product-schema 1 -->

## Register

product

## Platform

web

## Users

Three people share one installation inside an Iraqi real-estate brokerage office, on a Windows desktop or laptop, offline, in Arabic (RTL).

- **The agent/broker** — in the app all day. Enters new listings, searches by plot number or owner name when a client is on the phone, logs followups. Speed and low error rate are the whole job. Types faster than they point.
- **The office owner** — opens it briefly. Wants the dashboard to answer "what moved this week, what needs chasing" without reading. Often 50+, on a cheap monitor.
- **Low-tech staff** — this may be the first business software they've used. Conventions cannot be assumed; affordances must be obvious and mistakes must be recoverable, not punished.

Ambient conditions vary — desk PCs in lit offices, laptops in poor light — so both themes are real working modes, not a preference toggle.

## Product Purpose

Dalaly replaces the notebook, the WhatsApp group, and the shared Excel file that brokerage offices currently use to track property offers. It holds the office's working records locally, with per-user permissions and an audit trail:

- **Sale listings (عروض البيع)** — plot identity, ownership and legal type, pricing, status, photos, map location, followups.
- **Rental listings (عروض الإيجار)** — the same kind of record, priced per rent period (شهري، نصف سنوي، سنوي).
- **Customers (الزبائن)** — the people the office deals with, and their documents.
- **Purchase and rental requests (طلبات الشراء، طلبات الإيجار)** — what a customer is looking for, matched against available listings.
- **General documents, settings, and backup.**

It is sold to offices as a commercial product, so it must look worth paying for. Success is an office that stops keeping a parallel paper list because the app is faster than the paper was.

## Positioning

Four claims, together, that the notebook, Excel, WhatsApp, or a generic CRM cannot truthfully make:

- **Local, and the office owns its data.** Installed on the office's own Windows PC with its own PostgreSQL database. It works without internet, there is no subscription cloud, and the records never leave the office unless the office turns on an optional, permission-gated channel (encrypted email backup, remote access).
- **Iraqi plot identity.** Plots are recorded the way Iraqi brokers identify them (مقاطعة، قطعة، طابو، legal type), and a duplicate plot is caught at entry instead of becoming two records.
- **Requests matched to listings.** Buyer and renter requests are matched against available listings by explicit rules — required criteria (type, location, budget, rent period) and ranking preferences — with the reasons shown, and the dashboard turns the matches into a list of who to contact.
- **Arabic-native workflow.** Built in Arabic and in Iraqi brokerage vocabulary from the start, not a Western product with the strings translated.

## Operating Context

- **One installation per office.** Electron desktop app on Windows; a local API owns the only database connection. Several users sign in with their own accounts; roles and permissions are managed in the app (users, roles, Super Admin). There is no default administrator: the first one is created on the setup screen.
- **The day starts at the dashboard**, which is the office's work queue: customers to contact, which listing fits which request, appointments today and in the next 7 days, viewings without an outcome, listings with no interest, deals in progress. Every figure comes from stored records (`docs/OPERATIONS_DASHBOARD.md`).
- **Phone-driven lookups.** A client calls; the agent searches by plot number, code, or owner name while still on the line.
- **Followups** are logged on listings as اتصال هاتفي، اجتماع، معاينة، تفاوض، أخرى, optionally scheduled.
- **Data in and out:** Excel import of listings (all rows or none), PDF export of a property through Electron's own engine, documents filed against customers.
- **Backups:** manual backups and exports stay in a local folder and are never deleted by the app. The scheduled backup writes a full copy locally and emails only an encrypted, database-only archive; a lost password makes the emailed copies unrecoverable. A restore first saves the current data.
- **Maps** use online OpenStreetMap tiles; without tiles, coordinates and manual entry still work and still save.
- **Remote access** is optional: a Cloudflare tunnel exposes the office's local API (not this UI) to a separate client outside the office. That client is not part of this repository. Only `remote_access.manage` (Super Admin by default) starts or stops it, and the app works fully without the tunnel binary.
- **Web demo mode** serves the same UI in a browser from an isolated demo database, only to capture screenshots and videos for the Codel website. It is never wired into the desktop app or real data.

## Capabilities and Constraints

- **Operational scope:** customers, sale and rental listings, purchase and rental requests, matching, followups, general documents, locations (governorates, districts, neighborhoods), users and roles, settings, and backup.
- **Retired:** the former contract/studio system is not part of the product. Its old tables and documents on existing installs stay untouched; cleaning them up needs separate owner approval after a backup and a real restore test.
- **What the data cannot answer, the UI says so** instead of showing a substitute: there is no per-customer interaction log, rentals are offers rather than contracts (no renewals or payments), commissions and revenue are not recorded, a followup has no "done" state, and requests have no pipeline stages. Screens must not imply any of these.
- **Offline-first:** builds, startup, and daily use need no network; PDF export needs no standalone browser or Office.
- **Language and numerals:** every user-facing string, including API error messages, is Arabic. Numbers and dates use Latin digits everywhere. Latin-origin data (phones, prices, codes, coordinates) is bidi-isolated.
- **Terminology** (keep these words): عروض البيع، عروض الإيجار، الزبائن، طلبات الشراء، طلبات الإيجار، المطابقات، المتابعات، المستندات؛ نزال، مقاطعة، محلة، طابو. Listing statuses: متاح، محجوز، قيد التفاوض، مباع، مؤجر، مؤرشف، مغلق، تمت المطابقة. Request statuses: مفتوح، تمت المطابقة، مغلق. An unnamed listing is labelled `عقار P-0001` / `إيجار R-0001`. `legal_type` and "عقد زراعي 117/35" are ownership data, not the retired contract system.

## Brand Commitments

- **Name:** Dalaly — `دلالي`. Vendor identity: Codel (app id `codel.dalaly.desktop`).
- **Assets:** the Dalaly logo icon (`apps/desktop/src/splash/assets/dalaly-logo.ico`, `apps/desktop/build/icon.ico`).
- **Personality: Trustworthy · calm · fast.**

The app handles ownership records and prices in the hundreds of millions of dinars. Its voice is that of a careful clerk: precise, plain, never chatty, never playful. No exclamation marks, no mascots, no encouragement copy.

Calm means quiet surfaces and low visual noise — someone looks at this screen for six hours. Fast means it should feel like a tool that respects the user's speed (keyboard paths, immediate feedback), not a website that makes them fill out forms.

It is warm and local: Arabic is the native language of the product, not a translation. It should read as software made for Iraq, in Iraqi brokerage vocabulary (نزال، مقاطعة، محلة، طابو), not a Western SaaS with the strings swapped.

## Anti-references

- **The default Vuetify/Material demo.** Stock components, framework-default teal, elevation on everything, icon-avatar-in-a-card as the answer to every block. Currently the closest failure mode — the app is built on Vuetify and must not look built on Vuetify.
- **Generic Western SaaS dashboard.** Gradient hero metrics, indigo/purple palette, endless identical icon+heading+text card grids, "Welcome back 👋" copy.
- **Arabic as an afterthought.** A Latin-first layout mirrored badly: Tahoma at default weights, mixed Arabic-Indic and Latin numerals on the same screen, prices that flip direction mid-sentence, cramped line-height that makes Arabic diacritics collide.

## Evidence on Hand

- **In use:** Dalaly runs day to day at real brokerage offices (confirmed 2026-10-25).
- **Not supplied:** no testimonials, quotes, case studies, office names, logos of customer offices, or usage figures. Future work must not invent any of them; ask first.
- **Demo material:** `pnpm db:seed` (development) and `pnpm demo:reset` (isolated `dalaly_demo` for the web demo) create sample records. The seed photos are placeholders, not real listing photos. The owner has confirmed the repository's sample dumps and documents contain no real customer data. The last screenshot run is described in `docs/CAPTURE-REPORT.md`.

## Product Principles

1. **The record is the product.** Plot identity, price, owner, status. Everything on screen either serves finding a record, reading it correctly, or changing it safely. Decoration that doesn't do one of those three is deleted.
2. **Arabic-native, not mirrored.** RTL is the default direction, Arabic is the default language, and numerals/currency follow one consistent convention across every screen. Latin-origin data (phone numbers, prices, codes) gets explicit bidi isolation, never left to the browser.
3. **Earned familiarity over invention.** Standard affordances for standard tasks — a table is a table, a form is a form. Novelty is spent on the two or three moments that are actually specific to brokerage work (plot identity, duplicate detection, followups), nowhere else.
4. **Forgiving by default.** Users who have never used business software will do the wrong thing. Destructive actions confirm, errors say what to do next in plain Arabic, and nothing is lost silently. Duplicate-plot detection is a feature, not an error.
5. **Legible before dense.** Density serves the agent, but contrast and type size serve the owner. When the two conflict, legibility wins — no light-gray body text, no 12px labels carrying meaning.

## Accessibility & Inclusion

- **Target: WCAG 2.2 AA**, with body text held above the 4.5:1 floor in _both_ themes. Assume a cheap, uncalibrated monitor and a user over 50 — treat AA as the minimum, not the goal.
- **Full keyboard operation.** Every task completable without a mouse: visible focus rings, sane tab order through the property form, and shortcuts for the high-frequency data-entry paths.
- **Dark mode is a real mode.** Both `dalalyLight` and `dalalyDark` are contrast-verified and tested on every surface — not a toggle that ships untested.
- **Reduced motion respected.** Every transition has a `prefers-reduced-motion: reduce` alternative (crossfade or instant).
- **Arabic legibility** counts as accessibility here: adequate line-height for diacritics, a font with real Arabic weights, and no all-caps/letter-spacing tricks borrowed from Latin typography.
