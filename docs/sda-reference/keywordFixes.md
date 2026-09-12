# Keyword compliance audit and fix plan — I series

This tracks a dedicated audit of iSDA's DDS keyword implementation against
IBM's own DDS reference (`docs/sda-reference/source/DDS_Keyword_V7r6.txt`,
DDS_Keyword_V7r6.pdf converted to text), one level at a time. It is
**separate from `LIMITATIONS-PLAN.md`** (which tracks the DSPF36/S36E
work under the `S36-` prefix, plus general DSPF/Menu designer gaps under
`L`/`M`) because this is a different kind of work: not "is a feature
missing" but "does an already-implemented keyword match IBM's own
documented usage rules, conditioning rules, and parameters."

Four things are checked per keyword:

1. **Usage and constraints** — is the keyword itself real DDS syntax, at
   the level (file/record/field) iSDA puts it at, with the exclusions/
   mutual-restrictions IBM documents actually enforced or at least noted?
2. **Conditioning** — does IBM say "Option indicators are valid" / "are
   valid only ..." / "are not valid" for this keyword, and does iSDA's UI
   match that (no conditioning input offered where IBM disallows it)?
3. **Parameters and sub-parameters** — are all of a keyword's documented
   parameters/sub-parameters actually reachable in the UI, not just a
   subset?
4. **Missing keywords** — is there a real, documented keyword at this
   level that iSDA doesn't expose at all yet?

Task IDs are prefixed `I` (this series is about **i**nventory/compliance
against the IBM reference) so they can never collide with `L`/`M`/`S36-`
IDs in `LIMITATIONS-PLAN.md`. Same collision-avoidance rules apply: claim
a task (mark `in progress`, push immediately), `git fetch`/drift-check
before every push, `node -c buildWebviewTemplate.js` before compiling if
that file is touched, full `npm test` must stay at zero failures.

Scope for the `I-` series so far is **file-level keywords only** (the 39
iSDA currently exposes across the 10 categories in
`docs/sda-reference/keyword-index/KEYWORD-INDEX.json`'s `file` level,
plus 5 confirmed-missing ones below). Record-level and field-level get
their own follow-up series once file-level is closed out — noted under
"On the horizon" so scope doesn't silently creep mid-series.

---

## Reference method (so re-audits are reproducible)

IBM's DDS reference document is one alphabetical run of ~155 keyword
sections (`KEYWORD (Full Name) keyword for display files`), each stating
in its own opening lines which level(s) it's valid at (`file-level`,
`record-level`, `field-level`, or a `file- or record-level`/etc. combo),
whether it has parameters at all (`This keyword has no parameters`), its
exact parameter syntax, and a line reading either `Option indicators are
valid for this keyword`, `Option indicators are valid only ...`, or
`Option indicators are not valid for this keyword`. That per-keyword
prose is the ground truth used below — not a summary table, since IBM's
doc doesn't have one master table covering all four dimensions at once.

A caution found while building this: the level statement in a keyword's
own *first* line is authoritative; broader keyword-body text can
reference other, unrelated file-level keywords in passing (e.g. in a
"cannot be specified with" list) and a naive text search picks those up
as false positives. Several keywords initially flagged as "missing
file-level keywords" (`ALTNAME`, `COLOR`, `COMP`, `DSPATR`, `USRDFN`,
`HLPARA`, `HLPEXCLD`) turned out on closer reading to be genuinely
record-, field-, or help-specification-level only — not real gaps. Only
read a keyword's own opening statement to decide its level, not just
keyword-name mentions anywhere in its section.

---

## I-1 — Build canonical file-level keyword reference + compare against iSDA

**Done.** Extracted all ~155 keyword sections from
`DDS_Keyword_V7r6.txt`, classified each by documented level(s),
conditioning-indicator status, and no-parameter flag, then diffed the
confirmed file-level subset against iSDA's current 39 (from
`KEYWORD-INDEX.json`'s `file` level + `src/webviewClientHelpers.js`'s
`fileKeywordsPanelsHtml`). Findings feed directly into I-2 through I-6
below. No code changed in this task — audit only.

| Task | Description | Depends on | Status |
|------|-------------|------------|--------|
| **I-1** | Canonical file-level keyword dataset built and diffed against iSDA's current implementation (see findings in I-2 through I-6). No production code touched. | none | done |

---

## I-2 — `PRTFILE` is not a real DDS keyword (usage/constraint bug)

**Finding:** IBM's DDS reference has no `PRTFILE` keyword section at all.
The printer-file name is a **parameter of `PRINT`** itself:

```
PRINT[(response-indicator ['text']) | (*PGM) |
  ([library-name/]printer-file-name)]
```

`PRTFILE` only exists as a parameter on the `CRTDEVDSP`/`CHGDEVDSP`
*commands* (an unrelated, device-description-level setting IBM's own
`PRINT` text references only as "if the print function cannot be
performed successfully, the IBM i operating system attempts to complete
the print function using the printer file specified on the `PRTFILE`
parameter on the `CRTDEVDSP`..." — i.e. a fallback outside DDS entirely,
not something you write into a DSPF source member).

iSDA currently implements `PRTFILE` as its own standalone keyword:
`getFilePrtFileKeyword`/`setFilePrtFileKeyword` in `src/dspfWriter.js`
write a literal `PRTFILE(name library)` (space-separated, name before
library) into the generated DDS source, exposed in the UI as "System
handles print (PRTFILE)" alongside `PRINT` and `OPENPRT` as if it were a
third sibling keyword (`src/webviewClientHelpers.js`, `fk-prtfile-*`
IDs). This is invalid DDS syntax — a real `CRTDSPF` compile against
source containing a `PRTFILE(...)` keyword entry would fail, since the
compiler has no such keyword.

**Fixed (v0.10.83).** Removed `getFilePrtFileKeyword`/
`setFilePrtFileKeyword` entirely (no valid replacement needed — the
"specific printer file" and `*PGM` cases are just `PRINT`'s own
parameter). Added a read-only `getFilePrintFileForm(keywords)` that
parses the `*PGM`/`[library/]printer-file-name` sub-form back out of
`PRINT`'s own parameter string, used only to populate the UI's "System
handles print" inputs on render — no separate setter needed, since both
the file-level and record-level Print panels now assemble `PRINT`'s one
final parameter themselves (response indicator, `*PGM`, or
`library/file` — mutually exclusive, matching real SDA's own "Define
Print Keywords" screen layout, confirmed via
`docs/sda-reference/screens/file-level/03-print-keywords/image6.png`)
and commit it through the existing generic `setFileFlagKeyword('PRINT',
...)` call. Confirmed the record-level `PRTFILE` usage (shared R1 panel)
had the identical bug and was fixed by the same change, not a separate
mechanism. This also means S36-4's existing hard-block guard
(`checkS36EResponseIndicatorViolation`) now correctly evaluates the
`*PGM`/print-file forms too, not just the response-indicator one, with
no duplicate check logic needed. Updated `fileKeywordsPicker.test.js` and
`recordKeywordsPicker.test.js`'s `PRTFILE` test blocks to exercise
`getFilePrintFileForm` against `PRINT`'s real parameter forms instead.
Landed after a rebase onto a parallel I-3/I-5 push (v0.10.82) —
I-3 had already fixed `OPENPRT`'s own conditioning right next to this
change (combined cleanly, no logic conflict), and a parallel S36-3
correction had added a `PRINT(*PGM)` scenario to `s36eUiHardBlocks.test.js`
against the *old* single-field UI; updated it to use the new split
fields (`fk-print-file` for `*PGM`, `fk-print-params` for a numeric
response indicator). Full suite: 47/47 files, zero failures.

| Task | Description | Depends on | Status |
|------|-------------|------------|--------|
| **I-2** | Fold the mislabeled `PRTFILE` keyword into `PRINT`'s own third parameter form (`PRINT([library/]printer-file-name)`), fixing both the invalid generated DDS syntax and the wrong parameter order/separator. Covers file-level; check record-level's shared `PRTFILE` usage for the same bug before deciding if it's in scope here or a separate task. | I-1 | done (0.10.83) |

---

## I-3 — Conditioning (option indicator) audit across all 39 file-level keywords — DONE (v0.10.82)

**Full audit results.** Built a canonical eligibility table from each
keyword's own "Option indicators are/are not valid for this keyword" line
in `docs/sda-reference/source/DDS_Keyword_V7r6.txt`, then diffed it against
every `flagRowHtml`/`wireFlagRow`/hand-wired call site in
`fileKeywordsPanelsHtml`/`wireFileKeywordsPanels`.

**Confirmed violations (offered conditioning, IBM says not valid)** — the
Conditioning toggle was removed from all of these (each row now passes
`undefined` for `conditions`/`expandedSet` instead of the keyword's own
`.conditions`, or — for `simple()`-based rows — a new `noConditioning`
5th argument added for this purpose):
- Already known from I-1's spot-check: `INDARA`, `DSPRL`, `ERRSFL`, `HLPFULL`
- Newly confirmed by this task: `USRDSPMGT`, `CHGINPDFT`, `VLDCMDKEY`,
  `INDTXT`, `OPENPRT`, `HLPSCHIDX`, `IGCCNV`, `ALTHELP`, `ALTPAGEUP`,
  `ALTPAGEDWN`
- `CHECK`: IBM's own line reads "Option indicators are valid only for
  CHECK(ER) and CHECK(ME)" (confirmed by each individual code's own
  restated line — `AB`/`MF` explicitly say "not valid", `ME` explicitly
  says "valid"). iSDA only implements `AB`/`RLTB`/`RL` (not `ER`/`ME` at
  all), so all three currently-implemented sub-flag rows (`fk-check-ab`,
  `fk-check-rltb`, `fk-check-rl`) had conditioning removed.

**Reverse gaps (IBM says valid, iSDA offered no conditioning UI at all)**
— these needed a toggle *added*, not removed, since their panels
(`entFldAtrHtml`/`windowBorderPanelHtml`) predate `flagRowHtml` and use a
custom "Apply" button shape instead:
- `ENTFLDATR` — added a `flagRowHtml`-shaped Conditioning toggle to
  `entFldAtrHtml`/`wireEntFldAtrEditor`, reusing the shared
  `wireFlagRowConditioning` wiring. Also fixed `getChoiceColorState`/
  `setChoiceColorState` in `dspfWriter.js`, which previously hard-coded
  `conditions: []` on every write (the same class of silent-data-loss bug
  `setFileFlagKeyword`'s own doc comment describes) — `conditions` is now
  an optional parameter that preserves existing conditioning when omitted.
- `WDWBORDER` — same treatment for `windowBorderPanelHtml`/
  `wireWindowBorderPanel` and `getWdwBorder`/`setWdwBorder`. This panel is
  shared across 4 call sites (file-level, record-level `WINDOW`, `PULLDOWN`)
  so `expandedSet`/`rerender` had to be threaded through
  `pulldownPanelsHtml`/`wirePulldownPanels`'s own signatures (previously
  didn't take them at all) and both `buildWebviewTemplate.js` call sites.

**Confirmed already-compliant (no changes needed):** `INVITE`, `ALWGPH`,
`MSGALARM`, `CLEAR`, `HOME`, `PAGEDOWN`, `PAGEUP`, `HELP`, `HLPRTN`,
`PRINT`, `HLPPNLGRP`, `MNUBARSW`, `MNUCNL`, `CA01-CA24`/`CF01-CF24` (all
correctly offer conditioning) — plus `REF`, `PASSRCD`, `TEXT`, `HLPTITLE`,
`DSPSIZ`, `MSGLOC` (all correctly offer *no* conditioning UI, matching
IBM's "not valid").

**Test coverage:** `src/test/i3ConditioningAudit.test.js` renders the real
generated webview in jsdom and asserts, for every keyword this task
touched, that `.kw-cond-toggle[data-flag-id="..."]` either does or doesn't
exist — a toggle removed/added only in a code comment isn't a fix.

| Task | Description | Depends on | Status |
|------|-------------|------------|--------|
| **I-3** | Full conditioning-eligibility audit across all 39 file-level keywords. 13 keywords (15 rows counting CHECK's 3 sub-flags) had conditioning removed; `ENTFLDATR`/`WDWBORDER` had it added (reverse gap). | I-1 | done |

---

## I-4 — Parameter/sub-parameter completeness audit across all 39

Only `IGCCNV` was spot-checked in I-1 (confirmed correct: both
required parameters — `CFnn` key and prompt-line-number — are reachable
via `fk-igccnv-key`/`fk-igccnv-line`). The remaining 38 keywords need the
same check: does the UI expose every documented parameter/sub-parameter,
or only a subset? `WDWBORDER`'s `*COLOR`/`*DSPATR`/`*CHAR` sub-groups are
a likely candidate for a closer look given their structural complexity
(already flagged once in `dspfWriter.js`'s own comments as "the one
keyword in this set with real internal structure").

| Task | Description | Depends on | Status |
|------|-------------|------------|--------|
| **I-4** | Parameter/sub-parameter completeness audit across all 39 file-level keywords (only `IGCCNV` confirmed so far — correct). | I-1 | not started |

---

## I-5 — Add confirmed-missing file-level keywords

Five keywords are documented by IBM as file-level (some as
file-**or**-record-level, meaning a file-level instance is legitimate
whether or not iSDA also supports it at record level already) and are
absent from iSDA's file-level panels entirely:

- **`HLPRCD`** — file-level or help-specification-level; specifies the
  record format containing the help text. No parameters beyond the
  record name.
- **`MOUBTN`** — file-level or record-level; associates a Command key or
  EVENT-ID with a mouse button.
- **`ROLLUP`/`ROLLDOWN`** — file-level or record-level; same
  response-indicator shape as `PAGEDOWN`/`PAGEUP` (which iSDA already
  has) — IBM's own reference notes `PAGEDOWN` *is* `ROLLUP` and `PAGEUP`
  *is* `ROLLDOWN` functionally, and that `ROLLUP` cannot be specified
  together with `PAGEDOWN` (same restriction for `ROLLDOWN`/`PAGEUP`) —
  that mutual exclusion needs enforcing when this is added, not just the
  keyword itself.
- **`VALNUM`** — file-level, record-level, or field-level; enhances
  numeric error checking.
- **`WRDWRAP`** — file-level, record-level, or field-level; word-wrap
  for continued-entry fields.

Each needs its own parameter research pass (I-1 only confirmed the level
and no-parameter/has-parameter split, not full parameter syntax for
these 5) before implementing — treat this as 5 sub-tasks under one
banner rather than one mechanical batch, since `ROLLUP`/`ROLLDOWN`'s
mutual-exclusion rule alone is enough special-casing to warrant separate
attention from the other four.

| Task | Description | Depends on | Status |
|------|-------------|------------|--------|
| **I-5** | Add 5 confirmed-missing file-level keywords: `HLPRCD`, `MOUBTN`, `ROLLUP`/`ROLLDOWN` (with its `PAGEDOWN`/`PAGEUP` mutual-exclusion rule), `VALNUM`, `WRDWRAP`. | I-1 | done |

**Findings (research pass against `docs/sda-reference/source/DDS_Keyword_V7r6.txt`):**

- **`ROLLUP`/`ROLLDOWN`** — already correctly implemented, no code change
  needed. `getFileFlagKeyword`/`setFileFlagKeyword`'s `altNames` parameter
  (added for Task L22) already treats a `ROLLUP` instance as `PAGEDOWN`'s
  own state and `ROLLDOWN` as `PAGEUP`'s own state (see
  `webviewClientHelpers.js`'s `fk-pagedown`/`fk-pageup` rows). Since both
  spellings share one underlying flag, the mutual-exclusion rule is
  satisfied structurally — there is no code path that can ever produce
  both a `ROLLUP` and a `PAGEDOWN` instance on the same file at once.
  Confirmed by `fileKeywordsPicker.test.js`'s existing altNames tests
  (unchanged by this task).
- **`VALNUM`**, **`WRDWRAP`** — plain no-parameter flags. IBM's reference
  states option indicators are **not valid** for either, so both are
  rendered via `flagRowHtml` with `conditions` passed as `undefined`
  (rather than the keyword's own `.conditions`), which is what actually
  suppresses the Conditioning toggle — not a new eligibility list, just
  not asking for one. Added to the General panel next to the other plain
  flags (`fk-valnum`, `fk-wrdwrap`), wired through the existing generic
  `simple()` helper.
- **`HLPRCD`** — `HLPRCD(record-format-name [[library-name/]file-name])`,
  option indicators ARE valid. No dedicated dspfWriter.js getter/setter —
  reuses `getFileFlagKeyword`/`setFileFlagKeyword` with the parameters
  string hand-composed client-side (`record`, then `library/file` joined
  with `/`, the whole second token space-joined after the record), the
  same "generic primitive + client-side parse/compose" choice
  `MNUBARSW`/`MNUCNL` already made. Added to the Help panel
  (`fk-hlprcd-on` checkbox + `fk-hlprcd-record`/`-library`/`-file` text
  inputs).
- **`MOUBTN`** — `MOUBTN(EVENT [TRAILING-EVENT] {Command key|EVENT-ID}
  [*QUEUE|*NOQUEUE])`, option indicators ARE valid, and the keyword is
  genuinely repeatable (multiple independently-conditioned instances per
  file, one per pointer event). Reuses the generic
  `getRepeatableKeywordInstances`/`setRepeatableKeywordInstances`
  primitive (same one RANGE/COMP/VALUES uses) plus
  `repeatableConditionedInstancesHtml`/`wireRepeatableConditionedInstances`
  for the add/edit/remove UI, with EVENT and TRAILING-EVENT as `<select>`
  dropdowns (18 valid `*xx` values), a free-text Command-key/EVENT-ID
  input, and a QUEUE `<select>`. Added to the Indicator tab, below
  `INDTXT`.

Regression coverage: `fileKeywordsPicker.test.js` (dspfWriter.js-level
parameter shapes) and the new `i5FileLevelKeywords.test.js` (jsdom,
exercises the actual rendered File Properties rows — this is the file
that actually fails against the pre-fix code, since the dspfWriter.js
primitives reused here were already generic enough to pass even without
the UI rows existing).

---

## I-6 — Resolve the `TEXT` file-level question

IBM's reference describes `TEXT` as "this **record- or field-level**
keyword" ("valid for any record format or field, except a `SFLMSGKEY` or
`SFLPGMQ` field") — it does not mention file-level at all in this V7R6
text. iSDA currently exposes file-level `TEXT` in the General category
(`docs/sda-reference/keyword-index/KEYWORD-INDEX.json`'s file/General
category). This is a genuine open question, not a confirmed bug in
either direction: file-level `TEXT` (a one-line file description/
comment) is common real-world DDS practice and may simply be
under-documented in this particular reference version/edition, the same
kind of gap S36-3 hit with `ALTNAME`/`MSGID`/`RETKEY`/`RETCMDKEY` (marked
`verified: false` rather than guessed either way).

**Before touching iSDA's implementation:** check whether a real
`CRTDSPF` accepts a file-level `TEXT` keyword (same verification
approach S36-5 used for `CRTS36DSPF` vs `CRTDSPF`) — if it compiles
cleanly, this is a documentation gap in the reference doc and iSDA's
existing file-level `TEXT` is correct as-is (close this task as
"confirmed correct, no change" the way S36-2 did for `USRDSPMGT`). If it
does not compile, file-level `TEXT` needs removing from iSDA's General
panel.

| Task | Description | Depends on | Status |
|------|-------------|------------|--------|
| **I-6** | Verify whether file-level `TEXT` is valid DDS (real `CRTDSPF` test, or an authoritative alternate source) — reference doc only documents record-/field-level. Close as "confirmed correct" or remove from iSDA depending on the outcome. | I-1 | not started |

---

## On the horizon

- Record-level and field-level keyword audits, same 4-dimension method,
  as their own follow-up series once I-2 through I-6 are closed.
- `flagRowHtml`'s conditioning-eligibility mechanism (I-3) may be
  generally useful beyond file-level once record-/field-level audits
  start — worth designing with that reuse in mind rather than a
  file-level-only lookup table.
