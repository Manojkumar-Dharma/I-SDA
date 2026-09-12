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

**Finding: file-level TEXT is NOT valid DDS - removed from iSDA.** No live
IBM i connection was available to directly test `CRTDSPF` (the task's own
preferred method), so this used the task's alternate bar instead:
authoritative-source cross-checking. IBM's DDS Reference consistently
across every edition checked (v5r4, v6r1, v7r2, v7r3, and the local
v7r6 PDF) documents `TEXT` as "this **record- or field-level** keyword"
("valid for any record format or field, except a `SFLMSGKEY` or
`SFLPGMQ` field") - file-level is never mentioned. Every real-world DDS
example found (IBM's own physical-file example, community references,
production coding-standards documents listing typical file-level
keywords) shows `TEXT` only at record or field level; none demonstrates
or documents a file-level form. Given this consistency across multiple
independent editions and sources (not just one under-documented edition,
which was the working hypothesis going in), this reads as a genuine
usage/constraint bug rather than a documentation gap in a single
reference version - the opposite conclusion from S36-2's `USRDSPMGT`
case and the `ALTNAME`/`MSGID`/`RETKEY`/`RETCMDKEY` case S36-3 hit,
where the keyword was real but under-documented in the specific mirror
being read.

Removed file-level `TEXT` from `fileKeywordsPanelsHtml`/
`wireFileKeywordsPanels` (`src/webviewClientHelpers.js`) - Task L22 had
added it based on an incomplete reading. `getFileQuotedText`/
`setFileQuotedText` themselves are untouched (still used by other
legitimate file-level quoted-text keywords). Record-level `TEXT`
(`recordKeywordsPanelsHtml`) is correct and unaffected - it was never in
question. `docs/sda-reference/keyword-index/`'s file-level General
category entry for `TEXT` removed and regenerated (200→199 keyword
entries; the 159 unique-keyword count is unchanged since `TEXT` still
exists at record level). `dspfWebview.test.js` updated: the file-level
TEXT assertions replaced with a check that `fk-text` no longer exists;
the record-level TEXT check is unchanged. While in this same file for a
directly related reason, also refreshed S36-3's now-stale keyword-index
notes for `ALTNAME`/`MSGID`/`RETKEY`/`RETCMDKEY` (previously "open
item", now "verified, general rule" per S36-3's own recent update) and
corrected `PRINT`'s note to match S36-3's `PRINT(*PGM)` correction.

| Task | Description | Depends on | Status |
|------|-------------|------------|--------|
| **I-6** | Verify whether file-level `TEXT` is valid DDS (real `CRTDSPF` test, or an authoritative alternate source) — reference doc only documents record-/field-level. Close as "confirmed correct" or remove from iSDA depending on the outcome. | I-1 | done - removed (0.10.85) |

---

## Record-level audit (I-7 through I-16) — same 4-dimension method, per record type

I-1 through I-6 covered file-level keywords as one flat set of 39. Record
level doesn't work that way: which keywords are even *applicable* depends
on which record type you're on, and iSDA already models that via its own
`isXRecord`/panel-gating functions (`isUsrDfnRecord`, `isSflRecord`,
`isSflCtlRecord`, `isSflMsgRecord`, `isWindowRecord`, `isPulldownRecord`,
plus `MNUBAR`'s own gate) rather than one undifferentiated keyword list.
So this extension of the audit is split **one task per record type**,
each asking the same four questions I-1 asked (usage/constraints,
conditioning, parameters/sub-parameters, missing keywords) but scoped to
what real SDA's own screens — and IBM's own DDS Reference — say is
actually valid for *that* record type specifically, which is exactly the
"applicable/not applicable" question raised alongside this request.

**Ground truth for scope, not for correctness** — `PICKER-SCREENS-PLAN.md`
(R1–R13) and `docs/sda-reference/keyword-index/KEYWORD-INDEX.json`'s
`record` level already document which keyword *categories* iSDA exposes
per record type, condensed into each task row below. That tells you
*where to look*, not that what's there is already correct — the whole
point of I-1's method (read each keyword's own opening statement in the
DDS Reference, don't infer from a category label or another keyword's
mention of it) applies here exactly as it did at file level. Known
already-stale example: `KEYWORD-INDEX.json`'s record-level Print category
still lists `PRTFILE` as its own keyword — that's the exact I-2 bug,
the index just hasn't been regenerated since the fix. Regenerating it
(`docs/sda-reference/keyword-index/build_index.py` /
`build_lookup_and_md.py`) is fair game for whichever task gets to Print,
but isn't itself the point of that task.

**Record types NOT getting their own task** — `PICKER-SCREENS-PLAN.md`'s
own R6/R8/R9/R11/R12 already established, with dedicated tests, that
`SFLMSGCTL`, `WNDSFL`, `WNDSFCTL`, `PULDWNSFL`, and `PDNSFLCTL` are not
distinct DDS record types at all: each is just an ordinary `SFLCTL` or
`SFL` record that also happens to carry `WINDOW` or `PULLDOWN`, with the
two component panels working independently and zero cross-contamination.
That finding was about *keyword coverage* (does the right panel appear);
it hasn't been re-checked from *this* audit's angle (does combining two
record shapes change any keyword's usage/conditioning/parameter rules
IBM documents only for the single-shape case). I-15 below covers that
recheck as one task rather than five, since it's a narrower question than
a full per-type audit — if it turns up a real combination-specific rule,
split it out into its own task at that point rather than guessing now.

| Task | Record type(s) | Scope (current panels/keywords, from KEYWORD-INDEX.json + PICKER-SCREENS-PLAN.md) | Depends on | Status |
|------|------|-------|------------|--------|
| **I-7** | `RECORD` (base) | R1's full 8 categories, all in scope for this type: General (`INZRCD`/`KEEP`/`ASSUME`/`ALWROL`/`RETKEY`/`RETCMDKEY`/`CHGINPDFT`/`MNUBARDSP`/`ENTFLDATR`/`RTNCSRLOC`/`TEXT`/`ALTNAME`), Indicator (`CLEAR`/`PAGEDOWN`/`PAGEUP`/`HOME`/`HELP`/`HLPRTN`/`VLDCMDKEY`/`SETOF`/`CHANGE`/`INDTXT`), Application help (`HLPPNLGRP`/`HLPEXCLD`/`HLPBDY`/`HLPARA`), Help (`HLPCLR`/`HLPSEQ`/`HLPCMDKEY`/`HLPTITLE`), Output (`BLINK`/`ALARM`/`MSGALARM`/`LOCK`/`LOGOUT`/`INVITE`/`ALWGPH`/`FRCDTA`/`DSPMOD`/`CSRLOC`/`SLNO`/`CLRL`), Input (`LOGINP`/`UNLOCK`/`GETRETAIN`/`RETLCKSTS`/`CHECK`/`RTNDTA`), Overlay (`OVERLAY`/`PUTRETAIN`/`PROTECT`/`PUTOVR`/`OVRDTA`/`OVRATR`/`INZINP`/`MDTOFF`/`ERASEINP`/`ERASE`), Print (`PRINT` — `PRTFILE` is I-2's fix, not a separate keyword). ~63 keywords total — by far the largest task here since every other record type either reuses this set (in full or narrowed) or is standalone. | I-1 (method) | in progress |
| **I-8** | `USRDFN` | Deliberately narrow — per `isUsrDfnRecord`'s own doc comment in `webviewClientHelpers.js`, real SDA's own "Select Record Keywords" menu for USRDFN (`docs/sda-reference/screens/record-level/usrdfn/`) offers only General/Help/Print, 3 of R1's 8 (down from an original 4 before Task L5d-ii correctly moved Application help off the record-level set entirely, for every record type). This task's job is to verify that narrowed set against IBM's own DDS Reference specifically for USRDFN records — does the DDS Reference actually restrict any of General/Help/Print's own keywords further on a USRDFN record specifically (e.g. a keyword valid on `RECORD` that IBM's own text excludes for `USRDFN`), not just re-confirm the menu screenshot. This is the clearest "applicable/not applicable" case in the whole record-level series. | I-7 | not started |
| **I-9** | `SFL` (subfile detail record) | Standalone — doesn't reuse I-7's set. Subfile - General (`SFLNXTCHG`/`LOGOUT`/`LOGINP`/`KEEP`/`CHECK`/`CHGINPDFT`), Subfile - Indicator (`INDTXT`/`SETOF`/`CHANGE`), Subfile keywords (`SFLRCDNBR`/`SFLROLVAL` — field-level, conditioned on the record being `SFL`/`SFLCTL`, per Task D3). | I-1 (method) | in progress |
| **I-10** | `SFLCTL` (subfile control record) | Reuses I-7's full 8 (R1) plus its own: Subfile Control - General (`SFLCTL`/`SFLCSRRRN`/`SFLMODE`/`SFLDSP`/`SFLDSPCTL`/`SFLINZ`/`SFLDLT`/`SFLCLR`/`SFLEND`/`SFLRNA`/`SFLDROP`/`SFLFOLD`/`SFLENTER`), Display Layout (`SFLSIZ`/`SFLPAG`/`SFLLIN`), Subfile Messages (`SFLMSG`/`SFLMSGID`). Note `SFLMSGID` here is the **control**-record keyword sharing a name with — but structurally distinct from — field-level `MSGID`; don't conflate the two when checking parameters. | I-7, I-9 | not started |
| **I-11** | `SFLMSG` (message subfile detail record) | Standalone — per Task R5's own finding, doesn't reuse I-7's set at all. Message Record (`SFLMSGRCD`/`SFLMSGKEY`/`SFLPGMQ`), plus its own General/Indicator categories (need to confirm from `docs/sda-reference/screens/record-level/subfile-message-sflmsg/` whether these are truly independent of I-7's General/Indicator or a subset — R5's own note calls it standalone but the exact keyword list for SFLMSG's own General/Indicator screens isn't broken out separately in `KEYWORD-INDEX.json` from `I-7`'s, worth confirming which keywords actually apply here as part of this task rather than assuming reuse). | I-1 (method) | done |

**Findings:**

- **General/Indicator categories** — confirmed via the real SDA screenshots
  (`docs/sda-reference/screens/record-level/subfile-message-sflmsg/general/`
  and `.../indicator/`): SFLMSG's own "Select General Keywords" screen
  offers `SFLNXTCHG`/`LOGOUT`/`LOGINP`/`KEEP`/`CHECK(AB)`/`CHECK(RL)`/
  `CHGINPDFT`, and "Define Indicator Keywords" offers `INDTXT`/`SETOF`/
  `CHANGE` — this is I-9's own SFL keyword set, verbatim, not a subset and
  not I-7's set. `sflMsgPanelsHtml`/`wireSflMsgPanels` (Task R5) already
  duplicate this set correctly (they're a separate code path from I-9's
  `sflKeywordsPanelsHtml`, gated by `isSflMsgRecord`/`isSflRecord` being
  mutually exclusive) — no code change needed for the screen offering
  itself.
- **Message Record category** (`SFLMSGRCD`/`SFLMSGKEY`/`SFLPGMQ`) —
  confirmed already correct from earlier tasks: field auto-generation and
  ordering (L74), the `SFLMSGKEY`-then-`SFLPGMQ` field order the DDS
  Reference requires, and `SFLMSGRCD`'s own line-number/DSPSIZ-conditioning
  shape (L80, corrected by L84). No code change needed here either.
- **New finding, fixed this task**: the DDS Reference documents `SFLNXTCHG`
  and the rest of the "for all other subfiles" keyword group (`CHANGE`,
  `CHECK(AB)`/`CHECK(RL)`, `CHGINPDFT`, `INDTXT`, `KEEP`, `LOGINP`,
  `LOGOUT`, `SETOF`/`SETOFF`) as belonging to a keyword set that's
  mutually exclusive with `SFLMSGRCD`'s own "for message subfiles" set on
  the same subfile record format, and states outright under `SFLNXTCHG`'s
  own notes: "You cannot specify SFLNXTCHG with the SFLMSGRCD keyword."
  `sflMsgPanelsHtml`'s own General tab (which only ever renders for a
  record that already carries `SFLMSGRCD`, by `isSflMsgRecord`'s own
  definition) let a user check `SFLNXTCHG` on with no guard, which would
  produce invalid DDS. Real SDA itself doesn't block this either (relies
  on `CRTDSPF`'s own compile error), but per this project's own
  established precedent (L81, S36-4) of hard-blocking documented DDS
  compile errors even where real SDA lets them through, added
  `DspfWriter.sflNxtchgSflMsgRcdConflictReason` (same shape as L81's own
  `dftGroupConflictReason`) and wired it into `sm-sflnxtchg`'s checkbox
  with the same alert+revert idiom. Turning `SFLNXTCHG` off is never
  blocked, only the on-transition.
- **Open question, NOT acted on this task**: the remaining ~9 keywords in
  the "for all other subfiles" list are only *implied* to conflict with
  `SFLMSGRCD` by IBM's "for X / for all other Y" category framing — none
  of them individually restate the prohibition the way `SFLNXTCHG`'s own
  page does. Rather than guess whether all 9 are equally hard compile
  errors (vs. e.g. merely pointless/no-effect on a message subfile),
  flagged here for a future task to verify against `CRTDSPF` or a more
  authoritative source, the same way I-4/I-6 were left open rather than
  guessed at.

Regression coverage: `dspfWriter.test.js` (unit tests for
`sflNxtchgSflMsgRcdConflictReason`) and `dspfWebview.test.js`'s existing
SFLMSG picker test gained a new block confirming the guard fires with an
alert naming `SFLMSGRCD`, reverts the checkbox, and posts no edit -
confirmed (via `git stash`) to fail against the pre-fix code.
| **I-12** | `WINDOW` | Reuses I-7's full 8 plus its own: Window Parameters (`WINDOW` itself — size/roll/position), Border Parameters/Color/Attributes/Characters (`WDWBORDER`, shared verbatim with file-level's own `WDWBORDER` per F1's note — confirm that sharing is still accurate rather than assuming). Window Title has its own existing dedicated panel, not part of this task's scope (already built, not part of the audit unless a gap is found). | I-7 | not started |
| **I-13** | `PULLDOWN` | Reuses I-7's full 8 plus its own: Pull-Down - General (`PULLDOWN`/`WDWBORDER` — no window-parameters screen, per R10's own note that pull-downs don't have `WINDOW`'s size/roll options). | I-7, I-12 (shares the border set) | not started |
| **I-14** | `MNUBAR` (menu bar record) | Reuses I-7's full 8 plus its own: Menu-Bar record - General (`MNUBAR`/`MNUBARDSP`/`MNUBARSW`/`MNUCNL`), Menu-Bar Display Keywords (`MNUBARDSP` again — confirm this isn't a duplicate listing artifact in `KEYWORD-INDEX.json` vs. two genuinely distinct parameter forms before assuming it's fine). Field-level `MNUBARCHC`/`MNUBARSEP`/choice keywords (Task D5) are a separate field-level task, not in scope here. | I-7 | not started |
| **I-15** | Combination record types: `SFLMSGCTL`, `WNDSFL`, `WNDSFCTL`, `PULDWNSFL`, `PDNSFLCTL` | Not a full per-type audit (see "Record types NOT getting their own task" above) — recheck R6/R8/R9/R11/R12's "no cross-contamination" finding specifically from THIS audit's angle: does IBM's DDS Reference document any usage/conditioning/parameter rule that only applies when two keywords are combined on the same record (e.g. a restriction on `SFL` that's stated differently when `WINDOW` is also present)? If nothing turns up, close as "confirmed independent, no combination-specific rules" the same way R6/R8/R9/R11/R12 closed with "zero new code needed." If something does turn up, split it into its own task rather than silently patching it here. | I-9, I-10, I-11, I-12, I-13 | not started |
| **I-16** | `KEYWORD-INDEX.json`/`.md`/`KEYWORD-LOOKUP.json` regeneration | Housekeeping, not an audit task itself — once I-7 through I-15 land real fixes, regenerate the keyword-index files (`build_index.py`/`build_lookup_and_md.py`) so they stop reflecting stale pre-fix state (the `PRTFILE` example above is one instance; there may be others by the time this is picked up). Do this LAST, after the others are done, not incrementally per task — regenerating after every single fix just churns the index files repeatedly for no benefit. | I-7 through I-15 | not started |

---

## On the horizon

- Field-level keyword audit, same 4-dimension method, as its own
  follow-up series once the record-level tasks above are closed.
- `flagRowHtml`'s conditioning-eligibility mechanism (I-3) may be
  generally useful for the record-level tasks above too — reuse it
  rather than inventing a second mechanism, if it fits the record-level
  panel code's shape as-is.
