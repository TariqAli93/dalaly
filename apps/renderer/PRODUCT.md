# Product

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

Dalaly replaces the notebook, the WhatsApp group, and the shared Excel file that brokerage offices currently use to track property offers. It holds the office's entire inventory — plot identity, ownership, pricing, status, photos, followups — locally, with per-user permissions and an audit trail.

It is sold to offices as a commercial product, so it must look worth paying for. Success is an office that stops keeping a parallel paper list because the app is faster than the paper was.

## Brand Personality

**Trustworthy · calm · fast.**

The app handles ownership records and prices in the hundreds of millions of dinars. Its voice is that of a careful clerk: precise, plain, never chatty, never playful. No exclamation marks, no mascots, no encouragement copy.

Calm means quiet surfaces and low visual noise — someone looks at this screen for six hours. Fast means it should feel like a tool that respects the user's speed (keyboard paths, immediate feedback), not a website that makes them fill out forms.

It is warm and local: Arabic is the native language of the product, not a translation. It should read as software made for Iraq, in Iraqi brokerage vocabulary (نزال، مقاطعة، محلة، طابو), not a Western SaaS with the strings swapped.

## Anti-references

- **The default Vuetify/Material demo.** Stock components, framework-default teal, elevation on everything, icon-avatar-in-a-card as the answer to every block. Currently the closest failure mode — the app is built on Vuetify and must not look built on Vuetify.
- **Generic Western SaaS dashboard.** Gradient hero metrics, indigo/purple palette, endless identical icon+heading+text card grids, "Welcome back 👋" copy.
- **Arabic as an afterthought.** A Latin-first layout mirrored badly: Tahoma at default weights, mixed Arabic-Indic and Latin numerals on the same screen, prices that flip direction mid-sentence, cramped line-height that makes Arabic diacritics collide.

## Design Principles

1. **The record is the product.** Plot identity, price, owner, status. Everything on screen either serves finding a record, reading it correctly, or changing it safely. Decoration that doesn't do one of those three is deleted.
2. **Arabic-native, not mirrored.** RTL is the default direction, Arabic is the default language, and numerals/currency follow one consistent convention across every screen. Latin-origin data (phone numbers, prices, codes) gets explicit bidi isolation, never left to the browser.
3. **Earned familiarity over invention.** Standard affordances for standard tasks — a table is a table, a form is a form. Novelty is spent on the two or three moments that are actually specific to brokerage work (plot identity, duplicate detection, followups), nowhere else.
4. **Forgiving by default.** Users who have never used business software will do the wrong thing. Destructive actions confirm, errors say what to do next in plain Arabic, and nothing is lost silently. Duplicate-plot detection is a feature, not an error.
5. **Legible before dense.** Density serves the agent, but contrast and type size serve the owner. When the two conflict, legibility wins — no light-gray body text, no 12px labels carrying meaning.

## Accessibility & Inclusion

- **Target: WCAG 2.2 AA**, with body text held above the 4.5:1 floor in *both* themes. Assume a cheap, uncalibrated monitor and a user over 50 — treat AA as the minimum, not the goal.
- **Full keyboard operation.** Every task completable without a mouse: visible focus rings, sane tab order through the property form, and shortcuts for the high-frequency data-entry paths.
- **Dark mode is a real mode.** Both `dalalyLight` and `dalalyDark` are contrast-verified and tested on every surface — not a toggle that ships untested.
- **Reduced motion respected.** Every transition has a `prefers-reduced-motion: reduce` alternative (crossfade or instant).
- **Arabic legibility** counts as accessibility here: adequate line-height for diacritics, a font with real Arabic weights, and no all-caps/letter-spacing tricks borrowed from Latin typography.
