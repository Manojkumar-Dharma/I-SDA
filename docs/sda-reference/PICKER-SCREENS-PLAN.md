# SDA-style picker screens — task breakdown

Source: `docs/sda-reference/` (screenshots of real `STRSDA` sessions +
issues list, see [screens README](./README.md)). This replaces the flat
Level/Variant table that used to live in the main README — that table
didn't capture how much the record-level and field-level screens repeat
across DDS record/field types, which is the whole reason this can be
parallelized.

## How the work is split

Not by record type — by **screen**. Real SDA shows the same "Select/Define
\_\_\_ Keywords" screen for many record types (e.g. General Keywords looks
identical whether you're on a `RECORD`, `SFLCTL`, or `WINDOW`), so each
screen is built **once** as a shared component, then a small "wiring" task
plugs it into every record/field type that uses it. Build the component
before the tasks that wire it in — dependencies are listed per task.

Each task still follows the existing dedicated-picker pattern: `getX`/`setX`
pair in `src/dspfWriter.js` (skip if one already exists — check first, see
below) + panel markup/logic in `src/webviewClientHelpers.js` + wiring into
the right tab (Basic/Position/Attributes/Keywords for fields; Basic/
Keywords/Cmd keys/Structure for records) in `src/buildWebviewTemplate.js`.
Update the Status column (`not started` / `in progress` / `done`) when you
pick up or finish a task so parallel sessions don't collide, and check
`git fetch` / `git log --oneline main..FETCH_HEAD` before every push —
upstream drift between parallel sessions is the main risk here.

**Already built, reuse rather than rebuild:** Color & attributes, Validity
check (`RANGE`/`COMP`/`VALUES`), Edit code/word (`EDTCDE`/`EDTWRD`),
Command keys, Window title, Error message — each already has a `getX`/
`setX` pair and a panel. Several rows below are "new SDA-style layout over
existing logic" (e.g. SDA splits Color & attributes into two screens,
Display Attributes and Colors) rather than genuinely new keyword handling.

---

## Wave 1 — foundation components (no dependencies, start these first)

| Task | Component | Screens | Notes | Status |
| --- | --- | --- | --- | --- |
| **F1** | File-level keyword picker | `screens/file-level/*` (all 9 categories in one "Select File Keywords" menu) | Single record type, no variants — the whole file-level enhancement is one task. General/Indicator/Print/Help/Display Sizes/DBCS Conversion/Alternate/Window Border (reuses the same border sub-screens as record-level Window, see R7)/Menu-bar. | done |
| **R1** | Base Record Keywords (General, Indicator, Application Help, Help, Output, Input, Overlay, Print) | `screens/record-level/base-record-keywords/*` | **Highest-leverage task.** Reused as-is (all 8) by `RECORD`, and wired into `SFLCTL`, `SFLMSGCTL`, `WINDOW`, `WNDSFCTL`, `PULLDOWN`, `PDNSFLCTL`, `MNUBAR` by later tasks. `USRDFN` uses a 4-of-8 subset (see R2). Build this as one component with 8 sub-panels, not 8 separate tasks. | not started |
| **D1** | Field base keywords (Display Attributes, Colors, Keying Options, Validity Check, Input Keywords, General, Database Reference, Error Messages, Message ID) | `screens/field-level/character/*` (this is the full set; numeric/constant reuse subsets) | Colors/Display Attributes ≈ existing Color & attributes panel, split into SDA's two screens. Validity Check ≈ existing panel. Error Messages ≈ existing panel. Database Reference overlaps with the already-shipped "Resolve Referenced Field via Code for i" feature (v0.9.34, `resolveReferenceTarget()` / `fetchReferencedFieldAttributes()`) — this screen should be the UI front-end for that, not a new resolver. Message ID and Keying Options are the genuinely new pieces. | not started |
| **R5** | SFLMSG-specific (Message Record, General, Indicator) | `screens/record-level/subfile-message-sflmsg/*` | Standalone — `SFLMSG` doesn't use the base Record Keywords set at all. Safe to build independently of R1. | not started |
| **D5** | Menu-bar choice fields (`MNB*`/`MNUACT`): Choice Selection Type, Choice Keywords, Choice Colors & Attributes, Separator | `screens/field-level/menu-bar-choice/*` | Standalone, low overlap with D1. The same screen repeats per choice number in the screenshots — that's SDA showing the flow multiple times, not multiple designs; build one "choice" picker that the user can invoke per choice/action. | not started |

## Wave 2 — first-level wiring (depends on one Wave 1 task each)

| Task | Component | Screens | Depends on |
| --- | --- | --- | --- |
| **R2** | USRDFN wiring | *(reuses R1 General/Application Help/Help/Print only — no screens of its own)* | R1 |
| **R3** | SFL-specific (Subfile keywords + its own General + Indicator) | `screens/record-level/subfile-sfl/*` | — (independent, but grouped here since it feeds R4/R8/R11) |
| **R7** | WINDOW-specific (Window Parameters: size/roll + Border Parameters/Color/Attributes/Characters) + wire WINDOW to R1 | `screens/record-level/window/*` | R1. Window Title is already covered by the existing dedicated panel — don't rebuild. |
| **D2** | Character field wiring (Usage B/I/O) | `screens/field-level/character/*` | D1 (uses the full set, no additions) |
| **D3** | Numeric field additions (Editing Keywords, Subfile Keywords) + wire Numeric to D1 | `screens/field-level/numeric/*` | D1. Editing Keywords ≈ existing Edit code/word panel — reuse. |
| **D4** | Constant field wiring (Display Attributes, Colors, General) + new Menu-Bar Keywords screen | `screens/field-level/constant/*` | D1 |

## Wave 3 — second-level wiring (depends on two Wave 1/2 components)

| Task | Component | Screens | Depends on |
| --- | --- | --- | --- |
| **R4** | SFLCTL-specific (Subfile Control menu: General/Display Layout/Subfile Messages) + wire SFLCTL to R1 (all 8) + R3's Subfile Keywords screen | `screens/record-level/subfile-control-sflctl/*` | R1, R3 |
| **R10** | PULLDOWN-specific (General ×2 + Border set, no window-parameters) + wire to R1 | `screens/record-level/pulldown-puldwn/*` | R1, R7 (reuses the border sub-panels built for Window) |
| **R13** | MNUBAR-specific (General + Menu-Bar Display Keywords) + wire to R1 | `screens/record-level/menu-bar-record-mnubar/*` | R1 |

## Wave 4 — combination types (Window+Subfile / Pulldown+Subfile)

| Task | Component | Screens | Depends on |
| --- | --- | --- | --- |
| **R6** | SFLMSGCTL-specific (same shape as R4: General/Display Layout/Subfile Messages) + wire to R1 | `screens/record-level/subfile-message-sflmsg/*` (control variant) | R4 (reuse the Subfile Control Keywords pattern built there) |
| **R8** | WNDSFL-specific | `screens/record-level/window-subfile-wndsfl/*` | R3 (subfile General/Indicator), R7 (window/border set) |
| **R9** | WNDSFCTL-specific | `screens/record-level/window-subfile-control-wndsfctl/*` | R4 (subfile control pattern), R7 (window/border set) |
| **R11** | PULDWNSFL-specific | `screens/record-level/pulldown-subfile-puldwnsfl/*` | R3, R10 |
| **R12** | PDNSFLCTL-specific | `screens/record-level/pulldown-subfile-control-pdnsflctl/*` | R4, R10 |

---

## Suggested parallelization

- **3 developers, minimal collision:** one takes F1 + D1 → D2/D3/D4 (file +
  field track), one takes R1 → R2/R3 → R4 → R6 (record base + subfile
  track), one takes R7 → R10/R13 → R8/R9/R11/R12 (window + pulldown
  track), plus R5 and D5 picked up by whoever finishes a wave first since
  they're standalone.
- **Solo/sequential:** do Wave 1 in the order F1, R1, D1 (each is a clean,
  shippable unit), then work down the waves — later tasks get
  progressively smaller since they're mostly wiring against components
  that already exist.
- Once every row above is `done`, the two follow-on items already noted in
  the main README apply: surfacing the per-keyword Conditioning toggle on
  each dedicated picker, and giving Menu designer options the same
  treatment.

## Out of scope here

The **Issues** list at the top of the source document (default view mode,
panel hide/minimize, record-type-dependent auto-creation of paired
`SFLCTL`/etc. records) are bug-fix / small-feature items, not picker
screens — track them separately in Known limitations, not in this table.
