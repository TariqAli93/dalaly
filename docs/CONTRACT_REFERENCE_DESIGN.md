# Sale and rental contract reference design

New sale/rental documents and legal-editor previews use renderer version 2 in
`contract-reference.design.ts`, through the existing `renderVisual()` entry point.
Both domains share the navy/gold letterhead, title ribbon, metadata strip, six
numbered sections, party cards, asset tables, financial cards, attachment table,
signature panels and decorative footer. Party roles determine their position
and colour; the source document is not mutated.

All clauses, clause titles and ordering, additional conditions, agreement details,
procedure notes and disclaimers come from the existing document/wording engine.
The plain-text output remains identical. Long clauses use full-width paragraphs
with automatic pagination; short headings stay with their following content.
There is no verification URL in the current model, so no QR code is rendered.

The existing layout and branding schemas remain unchanged. Configured fonts,
font sizes, line heights, spacing, A4 margins, header variants, custom accents,
signature arrangement, logos and watermarks still apply. Historical built-in
accent palettes adopt the reference navy; other custom accent values are kept.
Formal headings use Amiri when installed, with local serif/body fallbacks.
External fonts, images and scripts are not loaded.

New document models optionally embed a real primary asset photo, falling back to
the next valid existing photo. Rental photos come only from `rental_images`; sale
photos come only from `property_images`. Only PNG/JPEG/WebP files inside the
configured image directory, with valid byte signatures and a maximum of 2 MiB,
are accepted. An unavailable optional photo does not prevent issuance. Text is
escaped, visual options are validated and the existing restrictive CSP is kept.

Issued HTML and photo bytes remain immutable in the existing snapshots. Renderer
version 1 remains available for old visual snapshots; the legacy Purchase backend
continues to use version 1. Existing issued contracts are not regenerated.
This redesign introduces no database migration or API/payload breaking change.

## Verification

```powershell
pnpm lint
pnpm build
pnpm --filter @dalaly/server test:contracts
pnpm --filter @dalaly/server test:contracts:reference
python server/scripts/inspect-contract-reference.py test-results/contracts-reference
git diff --check
```

The reference suite does not require the application database. It renders
explicitly labelled demonstration fixtures for sale, rental, long clauses,
witnesses, procedure details, multiple assets and the maximum font/margin
settings. It checks exact clause text in the DOM, horizontal bounds, A4 PDF sizes,
and the production Electron export/print IPC, including cancellation paths.
PDF export uses the real Chromium/Electron renderer; the physical-printer callback
and native dialogs are intercepted in the hidden isolated test harness.

Artifacts are written to `test-results/contracts-reference`: HTML, screenshots,
six Chromium PDFs and six Electron PDFs. The optional inspection script uses
`pypdf`, `pypdfium2` and Pillow to check all sentinel text, every A4 page and the
absence of empty pages, then rasterizes the first/last pages and a grayscale copy.
Those Python libraries are development inspection tools, not production
dependencies. Integration tests create disposable databases and remove them;
their migration/seed fixtures must match the migration history they exercise.
