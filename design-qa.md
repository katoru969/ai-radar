# AI Radar 1.8.0 — selected reader design QA

Date: 2026-10-16 (Asia/Tokyo).
Source visual truth: `../../outputs/design/ai-radar-selected-reader.png` (the third displayed ImageGen concept).
Implementation: `http://localhost:3005/ai-radar/#today`.
Implementation screenshot: `../../outputs/screenshots/ai-radar-reader-final.png`.

## Comparison setup

- State: Today, single A article, “なぜ重要か” collapsed, no modal, navigation and reading actions visible. Source mock uses illustrative meeting-note copy; implementation uses the actual collected NotebookLM article. The date is October 16 in the running app and October 15 in the mock. These dynamic-content differences are intentional.
- CSS viewport: 390 × 844, devicePixelRatio 1. The in-app capture is 375 × 812 px; its uniform capture scale is normalized to 390 × 844 for comparison. Source 853 × 1844 px is normalized to the same CSS frame. Desktop scrollbars are browser infrastructure, not part of the app design.
- Full-view comparison: `../../outputs/screenshots/ai-radar-reader-compare-final.png`.
- Focused comparison of brand, grade, heading and bottom actions: `../../outputs/screenshots/ai-radar-reader-compare-focus.png`.
- First-pass comparison retained: `../../outputs/screenshots/ai-radar-reader-compare-first.png`.

## Findings and iteration history

1. Initial result: blocked. [P2] Raw note author/subtitle suffixes produced an oversized four-line headline and pushed the useful content down. Fix: show the main headline, retaining the full source title in the disclosure. The final capture has a compact two-line headline with the source separately labeled.
2. Initial result: blocked. [P2] Masthead and fixed footer occupied too much of the first viewport. Fix: tighter masthead, 16 px section rhythm, 14 px / 1.85 body text, a 64 px action strip and 56 px navigation. Final capture shows the start of the detailed summary and keeps the actions distinct from the content.
3. Accessibility pass: blocked until fixed. [P1] The initial lighter primary blue and navigation gray did not provide 4.5:1 contrast for small text. Fix: primary `#506fca` gives white text 4.70:1; navigation gray `#687285` gives 4.85:1; selected navigation `#4669bb` gives 5.25:1. Final browser styles and capture confirm these colors.

No actionable P0/P1/P2 findings remain after the final full-view and focused comparisons.

## Required fidelity surfaces

| Surface | Result |
| --- | --- |
| Fonts / typography | System Japanese sans, 26 px primary heading, 14 px body with 1.85 line height, distinct purple/teal section headings. Main titles are not clipped. Longer source text scrolls naturally. Full original titles remain available. |
| Spacing / layout | One reading surface, no nested explanatory cards. Quiet dividers, full-width tinted article, compact date/position line. Fixed actions stay above the four tabs; bottom padding keeps the final content reachable. Larger controls than the raster mock are intentional for touch access (at least 49 px). |
| Colors / tokens | White base, restrained blue/purple/mint, red A / yellow B / green C with letter and meaning labels. Primary and navigation contrast checked numerically. No decorative gradients or elevated dashboard panels introduced. |
| Image quality / assets | Reuses the supplied high-resolution app brand asset. All 18 new UI icons are unmodified Phosphor regular SVG files with the MIT license, bundled locally. No generated-source screenshot is used as the app itself and no handmade icon substitutes. Two actual source figures loaded, with their original captions and attribution links. |
| Copy / content | App labels match the selected reader direction: 一覧へ, 要点, 自分にどう関係するか, なぜ重要か, 詳しいまとめ, 理解した！ 次へ, ブックマーク. Production content is not replaced with the mock copy. The redundant introductory paraphrase in the mock is omitted so the app does not repeat its summary. Extraction/caption limitations remain explicit. |

## Browser behavior checks

- Page identity and nonblank content confirmed; no framework error overlay.
- Reading → bookmark → understand/advance → undo returns to the same article. Skipping or using the overview does not mark an article understood.
- The batch stays at its selected ten items while reading; after ten are understood, the completion screen appears instead of endlessly backfilling. Saving/bookmarks and reading completion are independent.
- Completion → saved articles opens Explore with the bookmark filter selected. Reload retains understood IDs and bookmarks; understood articles are absent from the next reading batch.
- Learn opens three levels of explanation; its understood state persists after reload.
- Settings source, interest and notification preference switches persist after reload.
- Overview, next/previous, disclosure, source links, source figures and related terms are functional. Source figures were checked as loaded images, not just empty image nodes.
- Today / Explore / Learn / Settings verified at actual `innerWidth` values 320, 390, 430 and 1365. No horizontal overflow or missing icons. Persistent action targets measure at least 49 px. The earlier resize attempt was discarded because it did not affect the tab being measured; only the subsequent actual-width results are accepted.
- Final app console errors/warnings: none. Interaction checks used a separate local origin from the user-facing preview so test reading/preferences do not affect the preview.
- Evidence: `../../outputs/design/reader-ui-checks.json`, `../../outputs/screenshots/ai-radar-reader-320.png`, `../../outputs/screenshots/ai-radar-reader-desktop.png`, `../../outputs/screenshots/ai-radar-reader-finished.png`.
- Automated tests: 126 passed; Pages build: 36 static assets. JavaScript syntax and diff-whitespace checks passed. New modules, stylesheet and icons are included in the dev/preview allowlists and service-worker cache.

## Accepted constraints and follow-up polish

- A working production PWA was extended in place; no fresh mobile template or replacement runtime was initialized. Existing collection, importance scoring, localStorage keys and source/caption logic remain in use.
- The original supplied logo is retained instead of drawing a replacement for the concept's wave. Differences in the dynamic title, article length, date, position and small icon geometry are expected.
- The screenshot is an in-app-browser capture, not a physical iPhone Safari test. Actual iOS installation, text scaling with accessibility settings and safe-area rendering still need real-device confirmation.
- No claim is made that the free extractive summaries have become AI-written Abstracts or that missing YouTube captions are solved by this design.
- Local design QA was completed before release. Deployment uses the existing GitHub Pages workflow; the comparison artifacts remain in the local workspace and are not bundled into the PWA.

## Implementation checklist

- [x] Resolve the exact third image.
- [x] Implement the single-article reader and its stable batch.
- [x] Preserve understanding, bookmarks, learning, settings and sources.
- [x] Bundle real icons and wire offline/build paths.
- [x] Fix initial layout, title and contrast findings.
- [x] Compare final full frame and focused regions; verify primary interactions and responsive widths.
- [x] Update README and keep the local preview running.

final result: passed
