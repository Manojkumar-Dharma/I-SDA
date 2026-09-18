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

Scope started as **file-level keywords only** (I-1 through I-6, the 39
iSDA exposed across the 10 categories in
`docs/sda-reference/keyword-index/KEYWORD-INDEX.json`'s `file` level,
plus 5 confirmed-missing ones), extended to a **record-level series, one
task per record type** (I-7 through I-29 — see that section's own intro
for why record-level needed a different shape than one flat list), and
now extends further to a **field-level series, one task per field
kind/usage combination** (I-30 onward — see that section's own intro for
why field-level needed yet another shape).

**Document structure, and how to navigate it:** each of the three audit
phases (file-level, record-level, field-level) opens with one short
summary table — Task, Topic, Depends on, Status only, so it stays
readable and properly aligned — followed by a `### I-N — Title` section
per task, **in strict numeric order**, holding the full scope/finding/
fix/test-coverage detail for that task. Tasks are numbered in the order
they were *opened*, not necessarily the order they *landed* (parallel
sessions pick up tasks out of order) — the version each task landed at
is recorded in its own Status cell and its own `### I-N` section, not
implied by its position in the document.

---

## Open work — recommended pickup order (as of v0.10.124)

I-1 through I-38 (the full file/record/field-level base series) are all
done, and so are I-43, I-44, I-50, and I-51. Eight tasks remain open.
They're listed below in dependency/pickup order rather than by numeric
ID - IDs reflect the order each task was *opened*, not a recommended
sequence (see "Document structure" above) - so this list is a
navigational aid layered on top of the summary tables and `### I-N`
sections below, which stay in their existing strict-numeric-ID order
(task IDs are referenced from tests, `CHANGELOG.md`, and
`LIMITATIONS-PLAN.md`, so they're never renumbered).

1. **I-49** - the single biggest gap I-44's own implementation
   surfaced: the Advanced/raw keyword accordion bypasses every one of
   I-44's USRDFN guards entirely, since it isn't wired through
   `simple()`/`wirePulldownGuardedFlag()`/`wireTwoField()` at all.
   Materially bigger than I-44 itself - budget accordingly. Depends on
   I-44 (done).
2. **I-45**, **I-46**, **I-47**, **I-48** - the four independent
   blanket-restriction investigations split off from I-44's original
   finding (`DSPMOD`/`DSPSIZ`, `SFL`/`SFLCTL`, `WINDOW`, `MNUBAR`
   respectively). Each reads its own keyword's DDS Reference section
   fresh; none of the four depends on any other, so any order among
   them is fine, including running them in parallel across sessions.
3. **I-41** - add the 3 confirmed-missing field-level keywords
   (`HTML`, `PSHBTNFLD`, `PSHBTNCHC`). A content addition, independent
   of the USRDFN-lineage tasks above.
4. **I-42** - extend level-scope for the 5 keywords whose current
   scope is too narrow (`MOUBTN`/`VALNUM`/`WRDWRAP`/`USRDSPMGT`/
   `ENTFLDATR`). Same bucket as I-41 - both change the keyword set
   `I-40` below indexes.
5. **I-40** - keyword-index regeneration, **last, on purpose**. Same
   rule I-16 already established for this exact situation: regenerate
   once, after every task that changes the keyword set has landed, or
   the index goes stale again the moment the next one does. I-41 and
   I-42 both change the keyword set, so I-40 has to follow them.

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

## File-level audit (I-1 through I-6)

| Task | Topic | Depends on | Status |
|------|-------|------------|--------|
| **I-1** | Build canonical file-level keyword reference + compare against iSDA | none | done |
| **I-2** | `PRTFILE` is not a real DDS keyword (usage/constraint bug) | I-1 | done (0.10.83) |
| **I-3** | Conditioning (option indicator) audit across all 39 file-level keywords | I-1 | done (0.10.82) |
| **I-4** | Parameter/sub-parameter completeness audit across all 39 | I-1 | done (0.10.87) |
| **I-5** | Add confirmed-missing file-level keywords | I-1 | done (0.10.79) |
| **I-6** | Resolve the `TEXT` file-level question | I-1 | done - removed (0.10.85) |
| **I-38** | `HLPDOC` was missing from iSDA at the file level entirely | I-1 | done (0.10.116) |
| **I-40** | `KEYWORD-INDEX.json`/`.md`/`KEYWORD-LOOKUP.json` regeneration: 7 level-label inaccuracies + 9 stale-missing entries | I-1 | not started |
| **I-41** | Add missing field-level keyword `HTML` - see own detailed section below. PSHBTNFLD/PSHBTNCHC split off as I-57 after scoping (a genuinely separate, larger new-field-kind undertaking). | I-1 | done (v0.10.133) |
| **I-42** | Extend `MOUBTN`/`VALNUM`/`WRDWRAP`/`USRDSPMGT`/`ENTFLDATR` level-scope to match DDS Reference | I-1, I-5 | not started |
| **I-43** | Bug: `HLPRCD`/`HLPDOC` checkboxes cannot be turned on at all - a catch-22 in `commitHlprcd`/`commitHlpdoc` (`webviewClientHelpers.js`). Their sub-field inputs (Record name / Label+Document+Folder) commit on their own `change` event even while the checkbox is unchecked, and since `present=false` is passed, `setFileFlagKeyword` discards the typed value entirely; the next re-render then shows the field blank again. Checking the box afterward re-reads that now-blank field and fails the required-field validation added in the `HLPRCD`/`HLPDOC` cross-verify follow-up above, alerting and reverting the checkbox back off - no ordering of "type first" vs. "check first" survives. Reported by user with a reproduction; confirmed directly against `setFileFlagKeyword` (typed value discarded when `present:false`). Fix direction: don't commit sub-field edits while the checkbox is off (or otherwise preserve the typed text across the off→on transition) so the required-field check has something to see. | I-38, HLPRCD/HLPDOC cross-verify | done (v0.10.121) |
| **I-44** | Bug: most record-level keywords don't enforce `USRDFN`'s own whitelist restriction - reported by user via `ASSUME` showing as selectable on a `USRDFN` record. Root cause confirmed: `DspfWriter.usrdfnConflictReason(keywordName, keywords)` is a fully generic function (works correctly for ANY keyword name, verified directly) because `USRDFN`'s own DDS Reference section is a strict WHITELIST - "No file- or record-level keywords apply to this record except INVITE, KEEP, PASSRCD, HLPRTN, HELP, HLPCLR, PRINT, OPENPRT, and TEXT" - not a short per-keyword exclusion list like most keywords. But it's only wired to 4 call sites (`ASSUME`, `ALWROL`, `HLPSEQ`, `HLPCMDKEY` - added piecemeal by I-8/I-12/I-13, each time because that keyword's OWN section happened to name USRDFN, never because USRDFN's own section was read as a blanket rule). Confirmed at least 33 other record-level keywords wired via plain `simple()`/`wirePulldownGuardedFlag()` with zero USRDFN check: `RETKEY`, `RETCMDKEY`, `CSRINPONLY`, `BLINK`, `MSGALARM`, `LOCK`, `LOGOUT`, `DSPMOD`, `CSRLOC`, `LOGINP`, `GETRETAIN`, `RETLCKSTS`, `PROTECT`, `INZINP`, `HLPPNLGRP`, `HLPEXCLD`, `HLPBDY`, `HLPARA`, `SFLNXTCHG`, `INZRCD`, `ALARM`, `ALWGPH`, `FRCDTA`, `SLNO`, `CLRL`, `RTNDTA`, `OVERLAY`, `PUTRETAIN`, `PUTOVR`, `OVRDTA`, `OVRATR`, `MDTOFF`, `ERASEINP`, `ERASE`. On implementation, re-auditing this list against the DDS Reference (not just re-testing each in isolation) found 4 false positives: `HLPPNLGRP`/`HLPEXCLD`/`HLPBDY`/`HLPARA` are each individually documented as help-SPECIFICATION-level keywords, not file- or record-level - they're wired in `wireApplicationHelpFields` against a help entry's own local keyword array, not the record's - and USRDFN's own text explicitly carves this out: "Help specifications are valid for this record." `SFLNXTCHG` is confirmed-not-applicable for a different reason: every one of its own wiring call sites (`wireSflKeywordsPanels`'s SFLCTL panel, and the message-subfile panel beside it) is a record type structurally mutually exclusive with USRDFN, so there's no live call site where the guard could ever fire either way. Fixed the remaining 29: added the check directly inside `wirePulldownGuardedFlag` (covers `INZRCD`/`ALARM`/`ALWGPH`/`FRCDTA`/`SLNO`/`CLRL`/`RTNDTA`/`OVERLAY`/`PUTRETAIN`/`PUTOVR`/`OVRDTA`/`OVRATR`/`MDTOFF`/`ERASEINP`/`ERASE` in one place), and extended `wireUsrdfnGuardedFlag`/`wireUsrdfnGuardedTwoField` with new optional `hasParams`/conditioning-toggle params (backward compatible - existing `ASSUME`/`ALWROL`/`HLPCMDKEY`/`HLPSEQ` callers unaffected) so the remaining 13 could be converted off plain `simple()`/`wireTwoField()` without dropping their existing params box or live Conditioning toggle (each verified individually against its own DDS Reference text first). Separate audit finding, also confirmed via a live DOM check: `isUsrDfnRecord`'s own Task R2 (already in place before I-44) already hides 25 of these 29 keywords' entire tab category (Indicator/Output/Input/Overlay) for a USRDFN record, so only 4 - `RETKEY`, `RETCMDKEY`, `CSRINPONLY`, `INZRCD` - are actually reachable through today's UI on a real USRDFN record; the other 25's guard is correct, harmless defense-in-depth per each keyword's own DDS Reference text, not a currently observable behavior change (R2 had already closed that gap at the category level). New test `i44UsrdfnRecordLevelAudit.test.js` covers both groups (full block/revert/no-post for the 4 reachable keywords; DOM-absence + no-regression-on-a-plain-record for the other 25 and CSRLOC), and updated `i8UsrdfnConflictAudit.test.js`'s own "unrelated, still-valid" example off `RETKEY` (now correctly guarded) onto `KEEP` (genuinely on USRDFN's whitelist). Split off from a single larger finding so it can be picked up independently of I-45 through I-48 below (each covers a different, unrelated investigation), and I-49/I-50/I-51 below (new findings from this task's own implementation). | I-8, I-12, I-13 | done (v0.10.122) |
| **I-45** | Bug (split off from I-44's original finding): `DSPMOD` has its own SEPARATE unchecked prerequisite, unrelated to USRDFN - its own DDS Reference text states it's "valid only when both the 24 x 80 and 27 x 132 display sizes are specified on the DSPSIZ keyword" (a file-level `DSPSIZ` condition). Confirmed: `DSPMOD`'s row (via `wireUsrdfnGuardedFlag` after I-44, plain `simple()` before it) had no check of any kind for this. Fixed with new `DspfWriter.dspmodDspsizPrerequisiteReason(fileKeywords)`, which reuses `getDisplaySizesList` (already normalizes both of DSPSIZ's valid forms - named `*DS3`/`*DS4` and bare numeric `24 80`/`27 132` - to the same `{lines, columns}` shape) to check both required sizes are present, in either order (the first one listed is only the *default* mode per DSPMOD's own text, not a requirement on order). Wired into `wireUsrdfnGuardedFlag` via a new optional trailing `alsoCheckDspsiz` param (same "layer one more check on top" shape as `alsoCheckWindow`/`alsoCheckKeep`/`alsoCheckPassrcd`), passed only at DSPMOD's own call site - every other caller (`ASSUME`/`ALWROL`/`HLPCMDKEY`/`BLINK`/`MSGALARM`/`LOCK`/`LOGOUT`) is unaffected. Same alert+revert idiom as every other guard here. New `i45DspmodDspsizPrerequisite.test.js` (single size either way, no `DSPSIZ` at all, both sizes in either order). Fixing this exposed that `i44UsrdfnRecordLevelAudit.test.js`'s own fixture only declared one display size, which meant its (unrelated) DSPMOD-on-a-plain-record regression check was itself relying on the bug this task just fixed - updated that fixture's `DSPSIZ` to declare both sizes so that check continues to test what it always meant to (no USRDFN-guard interference), independent of this task's own fix. Separate finding, NOT fixed here (logged as I-52): `DSPMOD`'s own DDS Reference text also states "The DSPMOD keyword cannot be specified on a subfile record (SFL keyword)" - a second, independent prerequisite this task's own scope never covered. Full suite: 4802/4802 assertions, zero failures. | I-44 (same original finding, split out) | done (v0.10.126) |
| **I-46** | **Fixed.** Investigation (split off from I-44's original finding): re-read `SFL`'s and `SFLCTL`'s own DDS Reference sections the same way I-44 re-read `USRDFN`'s - as a possible blanket whitelist/exclusion rule, not just individual keyword-to-keyword cross-references. Findings: `SFL`'s own section states outright "Besides SFL, the following keywords are also valid on the subfile record format:" followed by a closed, enumerated list - for message subfiles, `SFLMSGRCD` (record-level; `SFLMSGKEY`/`SFLPGMQ` are field-level); for all other subfiles (at the record level), `CHANGE`, `LOGINP`, `CHECK(AB)`, `CHECK(RL)`, `LOGOUT`, `SETOF`/`SETOFF`, `CHGINPDFT`, `INDTXT`, `SFLNXTCHG`, `KEEP`, `TEXT` - the exact same closed-whitelist shape as `USRDFN`'s own "except" text, just phrased additively. `SFLCTL`'s own section, by contrast, introduces its Required/Optional keyword tables as "a summary of **subfile** keywords used with the SFLCTL keyword" - explicitly scoped to SFL-family keywords, not a claim that ordinary DDS keywords are disallowed; its one individual restriction ("`USRDFN` is not valid for the subfile-control record format") is already structurally unreachable, since `USRDFN`/`SFL`/`SFLCTL` are each their own record TYPE the "+ Add record" wizard picks exactly once (`RECORD_TYPES`) - no code change needed for `SFLCTL`. Fix: new `DspfWriter.sflWhitelistConflictReason` (mirrors I-49's `usrdfnWhitelistConflictReason` exactly, including the message-subfile/plain-subfile split), wired into the SAME record-level raw-keyword-editor catch-all I-49 built (`wireKeywordEditor`'s `addGuardFn`, at `renderRecordProps`'s own call site in `buildWebviewTemplate.js`) alongside the existing `usrdfnWhitelistConflictReason` check. An exhaustive sweep of the structured per-keyword checkboxes across the General/Indicator/Output/Input/Overlay/Print tabs (the same way I-44 individually rewired 29 USRDFN call sites through `wireUsrdfnGuardedFlag`) is a separate, much larger undertaking - logged as **I-53**, not attempted here, mirroring the exact I-44/I-49 split this task was itself split off from. Regression coverage: `src/test/i46SflRawKeywordEditorWhitelist.test.js` (plain-SFL whitelist enforcement, message-subfile's own narrower whitelist, and no-regression checks for both a non-SFL record and file-level keywords), same live-DOM harness shape as I-49's own test. | I-44 (same original finding, split out) | fixed (v0.10.126) |
| **I-53** | **Fixed.** Follow-up from I-46: exhaustive per-keyword-checkbox sweep of the General/Indicator/Help/Output/Input/Overlay/Print record-property tabs for a plain SFL record, rewiring every row whose keyword is NOT on `SFL`'s own whitelist (`CHANGE`/`LOGINP`/`CHECK`/`LOGOUT`/`SETOF`/`SETOFF`/`CHGINPDFT`/`INDTXT`/`SFLNXTCHG`/`KEEP`/`TEXT`) through a guard, so the structured checkboxes - not just the raw keyword editor I-46 already closed - are blocked too. Confirmed via a full audit of every keyword row in `wireRecordKeywordsPanels` (`webviewClientHelpers.js`) that EVERY plain flag/two-field keyword on these tabs already routes through one of three shared functions - `wireUsrdfnGuardedFlag`, `wireUsrdfnGuardedTwoField`, `wirePulldownGuardedFlag` - the exact same three I-44 individually rewired 29 USRDFN call sites through. `DspfWriter.sflWhitelistConflictReason` (already safe to call unconditionally - returns null for anything already whitelisted, or when the record isn't SFL at all) was added to all three functions' existing check chains in one place each, closing the gap for every keyword that flows through them (including `LOGINP`/`LOGOUT`, both already whitelisted and correctly unaffected). Two keywords with bespoke, non-generic commit functions that bypass all three needed their own individual fix: `PRINT`'s own record-level commit (`wireRecordPrint`, hand-rolled for its S36E response-indicator check and print-file/library fields) gained a second check alongside its existing S36E one; `ENTFLDATR`'s own Apply-button color/attribute editor (`wireEntFldAtrEditor`, shared with the file-level tab) gained a new optional trailing `addGuardFn(name)` param (same shape as `wireKeywordEditor`'s own I-49 addition), wired only at the record-level call site so the file-level one is unaffected. Keywords using the generic repeatable-instance editor (`MNUBARDSP`, and any other keyword sharing that much more widely-used primitive) are explicitly NOT covered here - logged as **I-55**, since retrofitting a guard into that shared machinery is a bigger, separate undertaking than this task's own flag-row-focused scope. Regression coverage: `src/test/i53SflRecordCheckboxSweep.test.js` (plain flags, both two-field keywords, both bespoke commits, whitelisted-keyword no-regression, message-subfile's own narrower whitelist, and a non-SFL record's complete non-regression), full suite: zero failures. | I-46 (same finding, split out) | fixed (v0.10.129) |
| **I-47** | Investigation (split off from I-44's original finding): same re-read, for `WINDOW`'s own DDS Reference section. Findings: WINDOW's own text names SIX keywords a record format can't also carry - `ALWROL`, `ASSUME` (already individually known via `windowConflictReason`, wired through the checkbox path), plus `MNUBAR`, `PULLDOWN`, and `SFL` (not previously cross-checked against WINDOW anywhere) and `USRDFN` (already indirectly covered one direction only - WINDOW isn't on USRDFN's own whitelist, I-49). A closed six-keyword exclusion list, not a broader whitelist shape like USRDFN/SFL's own sections. Also confirmed, no code change needed: "WINDOW is allowed on a record with the SFLCTL keyword" is an explicit exception (SFLCTL deliberately excluded from the list); WINDOW's own PASSRCD restriction was already fixed by I-24; the ERRSFL/MSGLOC-"ignored" and WDWBORDER-parameter-shape notes in the same section are informational precedence/formatting guidance, not "cannot specify together" rules. Reachability: WINDOW/MNUBAR/PULLDOWN/SFL/USRDFN are each their own record TYPE the "+ Add record" wizard picks exactly once (`RECORD_TYPES`), so the wizard itself can never combine two - only the raw/Advanced keyword editor can, the same bypass I-49/I-46 each closed for USRDFN's/SFL's own whitelists; nothing existing caught MNUBAR/PULLDOWN in either direction, or the REVERSE direction (raw-adding WINDOW itself to a record already carrying one of the six) for any of them. Fixed with new `DspfWriter.windowMutexConflictReason(keywordName, recordKeywords)` - bidirectional, checks both "record has WINDOW, adding one of the six" and "record has one of the six, adding WINDOW" - wired into the SAME record-level raw-editor `addGuardFn` chain I-49/I-46 already built, alongside `usrdfnWhitelistConflictReason`/`sflWhitelistConflictReason`. `windowConflictReason`'s own two existing checkbox call sites (ASSUME/ALWROL) are untouched. New `i47WindowMutexRawEditor.test.js`: all six keywords blocked in both directions, the SFLCTL exception commits normally, a plain record is unaffected, and the pre-existing ASSUME checkbox guard still fires. Full suite: 4871/4871 assertions, zero failures. | I-44 (same original finding, split out) | done (v0.10.129) |
| **I-48** | Investigation (split off from I-44's original finding): re-read `MNUBAR`'s own DDS Reference section fresh, same shape as I-44/I-46/I-47's own re-reads. Finding: MNUBAR's own section states outright, in the exact same closed-whitelist shape as `USRDFN`'s/`SFL`'s own text: "The following keywords are allowed on a record containing the MNUBAR keyword:" followed by a closed, 27-entry list - `CAnn`/`CFnn`, `CLEAR`, `CLRL`, `CSRLOC`, `DSPMOD`, `HELP`, `HLPCLR`, `HLPCMDKEY`, `HLPRTN`, `HLPTITLE`, `HOME`, `INDTXT`, `INVITE`, `KEEP`, `LOCK`, `MNUBARDSP`, `MNUBARSEP`, `MNUBARSW`, `MNUCNL`, `OVERLAY`, `PAGEDOWN`/`PAGEUP`, `PRINT`, `PROTECT`, `ROLLUP`/`ROLLDOWN`, `TEXT`, `UNLOCK`, `VLDCMDKEY` - with no matching "anything else is fine too" language. `MNUBAR`'s own record-composition rule (exactly one menu-bar field, no other displayable fields) was already fixed by I-19 and is out of this task's own scope. Confirmed a live, previously-unguarded gap: `isMnuBarRecord` only drives whether the MNUBAR tab itself is shown (unlike `isUsrDfnRecord`'s own Task R2 category-narrowing), so a MNUBAR record's Indicator/Output/Input/Overlay tabs render the full, unfiltered checkbox set, and the record-level raw keyword editor had no guard for it either. Fix: new `DspfWriter.mnubarWhitelistConflictReason(keywordName, recordKeywords)` (mirrors I-49's `usrdfnWhitelistConflictReason`/I-46's `sflWhitelistConflictReason` exactly), with `CAnn`/`CFnn` matched by pattern (`/^CA\d{2}$/`/`/^CF\d{2}$/`) since this codebase stores them as literal `CA01`..`CA24`/`CF01`..`CF24` keyword names, not a single parametrized name - wired into the SAME record-level raw-keyword-editor `addGuardFn` chain I-49/I-46/I-47 already built, alongside `usrdfnWhitelistConflictReason`/`sflWhitelistConflictReason`/`windowMutexConflictReason`. An exhaustive sweep of the structured per-keyword checkboxes across the General/Indicator/Output/Input/Overlay/Print tabs (the same "much larger undertaking" I-46 split off as I-53 for SFL's own whitelist) is logged separately as **I-54**, not attempted here, mirroring that exact split. New `i48MnubarRawKeywordEditorWhitelist.test.js` (non-whitelisted keywords blocked with an alert naming MNUBAR; whitelisted keywords and CAnn/CFnn pattern names commit normally; a non-MNUBAR record's raw editor unaffected), confirmed via `git stash` to genuinely fail (10 checks) against pre-fix code. Full suite: zero failures. | I-44 (same original finding, split out) | done (v0.10.130) |
| **I-54** | Follow-up from I-48: exhaustive per-keyword-checkbox sweep of the General/Indicator/Output/Input/Overlay/Print record-property tabs for a MNUBAR record, rewiring every row whose keyword is NOT on MNUBAR's own whitelist through a guard (mirroring I-44's `wireUsrdfnGuardedFlag`/`wireUsrdfnGuardedTwoField` sweep for USRDFN's own 29 call sites, and the identical follow-up I-53 already did for SFL's own whitelist). Confirmed: every one of the ~25 non-whitelisted record-level checkbox keywords I-44 originally audited (`INZRCD`, `ASSUME`, `ALWROL`, `RETKEY`, `RETCMDKEY`, `CSRINPONLY`, `HLPSEQ`, `BLINK`, `ALARM`, `MSGALARM`, `LOGOUT`, `ALWGPH`, `FRCDTA`, `SLNO`, `LOGINP`, `GETRETAIN`, `RETLCKSTS`, `RTNDTA`, `PUTRETAIN`, `PUTOVR`, `OVRDTA`, `OVRATR`, `INZINP`, `MDTOFF`, `ERASEINP`, `ERASE`) is wired through one of the SAME three shared functions I-53 already patched for SFL (`wireUsrdfnGuardedFlag`, `wireUsrdfnGuardedTwoField`, `wirePulldownGuardedFlag`) - so adding `DspfWriter.mnubarWhitelistConflictReason` unconditionally to all three functions' own check chains (same safe-no-op-when-not-applicable shape `sflWhitelistConflictReason` already established) closes the entire sweep in one pass, no per-keyword rewiring needed. Two bespoke (non-generic) commit functions bypass all three shared functions entirely, exactly as I-53 found for SFL: `ENTFLDATR`'s own Apply-button color/attribute editor (NOT on MNUBAR's whitelist either - guarded, ORed onto the same `addGuardFn` I-53 already added there for SFL) and `PRINT`'s own file/library form (unlike SFL, PRINT IS on MNUBAR's own whitelist - confirmed correctly needing NO change here). `RTNCSRLOC`'s own two hand-rolled IIFEs were checked and found to have NO guard of any kind (not even USRDFN/SFL) - a genuinely separate, pre-existing gap outside both this task's and I-53's own scope, not fixed here. New `i54MnubarRecordCheckboxSweep.test.js` (mirrors `i53SflRecordCheckboxSweep.test.js`'s own shape): 6 non-whitelisted plain-flag keywords + HLPSEQ (two-field) + ENTFLDATR all blocked with an alert naming "menu-bar (MNUBAR)"; whitelisted `LOCK`/`OVERLAY`/`PROTECT` (flags), `CSRLOC` (two-field), and `PRINT` (bespoke) all still commit normally and round-trip through the reparsed DDS; a non-MNUBAR record's checkboxes/`ENTFLDATR` are completely unaffected. Full suite: 5006/5006 assertions, zero failures. | I-48 (same finding, split out) | done (v0.10.132) |
| **I-55** | Follow-up from I-53: extend the SFL whitelist guard to keywords wired through the generic repeatable-instance editor (`repeatableConditionedInstancesHtml`/`wireRepeatableConditionedInstances`), starting with `MNUBARDSP` (confirmed reachable on a plain SFL record via the shared General tab, per `MNUBAR` tab's own comment: "Menu-Bar display keywords (MNUBARDSP) already live on R1's base General tab, shown for every record including this one"). That primitive is shared far more widely than `wireUsrdfnGuardedFlag`/`wirePulldownGuardedFlag`/`wireUsrdfnGuardedTwoField` (used for `RANGE`/`COMP`/`VALUES`, `SFLPGMQ`-style repeatable keywords, etc.), so adding a guard hook needs care not to affect unrelated callers - likely an optional trailing `addGuardFn` param on `wireRepeatableConditionedInstances` itself (mirroring `wireKeywordEditor`'s/`wireEntFldAtrEditor`'s own I-49/I-53 shape), checked once per commit rather than per-instance-field. `CLEAR`'s own repeatable Indicator-instance model (Task L5d, flagged but not wired by I-13 either) may have the same gap and is worth checking in the same pass. | I-53 (same finding, split out) | claimed, in progress |
| **I-56** | Gap found while implementing I-54: `RTNCSRLOC`'s own two hand-rolled record-level commit IIFEs (`wireRtncsrlocRecName`/`wireRtncsrlocWindowMouse` in `webviewClientHelpers.js`, Task L77) have NO guard of any kind - not `usrdfnConflictReason`, not `sflWhitelistConflictReason`, not `mnubarWhitelistConflictReason`, nothing. Unlike `ENTFLDATR`/`PRINT` (each individually confirmed and wired by I-53/I-54), `RTNCSRLOC` was never touched by either task since it isn't named in either one's own scope, and it bypasses all three shared guarded-wiring functions the same way `ENTFLDATR`/`PRINT` do. `RTNCSRLOC` is not on `SFL`'s own whitelist (I-46) or `MNUBAR`'s own whitelist (I-48) - both would need it added, `RTNCSRLOC` is reachable on both record types via this same shared record-level panel, and the SAME "optional trailing `addGuardFn`" shape I-53 gave `wireEntFldAtrEditor` would apply directly. Whether `RTNCSRLOC` also needs checking against `USRDFN`'s own whitelist (I-49) is unconfirmed - not verified in this pass. | I-54 (found during its implementation) | claimed, in progress |
| **I-49** | Gap found while implementing I-44: the one remaining way a `USRDFN` record could still end up carrying one of I-44's 29 record-level keywords is the Advanced/raw keywords accordion (`keywordEditorHtml`) - a generic add-any-keyword-by-name editor that's rendered unconditionally regardless of record type and isn't wired through `simple()`/`wirePulldownGuardedFlag()`/`wireTwoField()` at all, so none of I-44's guards apply to it. Confirmed via live DOM check that this accordion IS still rendered for a USRDFN record (unlike the Indicator/Output/Input/Overlay tabs, which Task R2 already hides entirely for USRDFN). Scope was indeed materially bigger than I-44, as flagged: rather than guarding one individually-confirmed keyword name per call site (every prior USRDFN guard's own shape), this needed the whitelist text itself consulted directly, since the raw editor accepts literally any string. New `DspfWriter.usrdfnWhitelistConflictReason(keywordName, recordKeywords)` does that: returns a reason unless `keywordName` is on USRDFN's own 9-keyword whitelist (`INVITE`, `KEEP`, `PASSRCD`, `HLPRTN`, `HELP`, `HLPCLR`, `PRINT`, `OPENPRT`, `TEXT` - plus `USRDFN` itself, always allowed) or the record isn't USRDFN. `wireKeywordEditor` gained a new optional trailing `addGuardFn(name, params)` param, checked only in the "+ Add keyword" click handler (alert + no-op, same idiom as every other USRDFN guard - remove is never guarded); every pre-existing call site (file, field, help-entry, and the two menu-designer keyword editors) omits it and is unaffected. Wired only at the record-level call site (`renderRecordProps`) to `DspfWriter.usrdfnWhitelistConflictReason`. New `i49UsrdfnRawKeywordEditorWhitelist.test.js`: confirms non-whitelisted keywords (`RETKEY`, `DSPATR`, `BLINK`, `CHANGE`) are blocked with a USRDFN-naming alert and no `applyEdit` on a USRDFN record; whitelisted keywords (`KEEP`, `HLPCLR`, `OPENPRT`) still commit and round-trip through the reparsed DDS; a non-USRDFN record's raw editor is completely unaffected (no alert, normal commit); and the file-level raw editor (no guard wired) still adds normally. Full suite: 4790/4790 assertions, zero failures. | I-44 (found during its implementation) | done (v0.10.125) |
| **I-50** | Bug found while implementing I-44: `RETLCKSTS`'s own row had always been wired with `hasParams=true` (renders a parameter text box) on both the render side (`flagRowHtml(..., retlcksts.parameters, 'indicators (optional)', ...)`) and the wire side (`wireUsrdfnGuardedFlag(..., hasParams=true, withConditioning=true)`), but `RETLCKSTS`'s own DDS Reference text states "This keyword has no parameters." Pre-existing, unrelated to USRDFN - not introduced by I-44, which preserved the existing (buggy) behavior unchanged to avoid stacking an unrelated fix into that task's diff. Fixed exactly as planned: dropped the params box entirely on both sides (`paramsValue`/`paramsPlaceholder` now `undefined` on the render call, `hasParams` flipped to `false` on the wire call), leaving the live Conditioning toggle untouched. New `i50RetlckstsParamsBug.test.js`, confirmed via `git stash` to genuinely fail against pre-fix code; updated `i44UsrdfnRecordLevelAudit.test.js`'s own `RETLCKSTS` groupB entry to drop the `hasParams`/`paramValue` expectations it used to assert against. Full suite: 4612/4612 assertions, zero failures. | I-44 (found during its implementation) | done (v0.10.123) |
| **I-51** | Bug found while implementing I-44: `wirePulldownGuardedFlag` (added by I-13) never wires a live Conditioning toggle at all, for any of its callers - yet several of the keywords routed through it since I-13 (`ALARM`, `ALWGPH`, `FRCDTA`, `MDTOFF`, `ERASEINP`, `ERASE`, `OVERLAY`, `PUTRETAIN`, `PUTOVR`, `OVRDTA`, `OVRATR`, `RTNDTA`) are each individually documented "Option indicators are valid for this keyword," and several of their own HTML rows that pass a real `conditions` value into `flagRowHtml` (e.g. `MDTOFF`, `ERASEINP`) still render a Conditioning toggle button in the UI - so for those, the toggle is visible but silently does nothing when clicked (no click handler ever gets wired to it). Pre-existing since I-13, unrelated to USRDFN - not introduced or fixed by I-44. On implementation, independently re-verified every `wirePulldownGuardedFlag` caller against the DDS Reference rather than trusting this task's own original list as exhaustive or exact, and corrected it two ways: `RTNDTA` was named above but its own DDS Reference text actually says "Option indicators are **not** valid for this keyword," and its own row already passes `undefined` for `conditions` (no toggle ever rendered, so no bug there) - excluded. `HLPCLR` and `INVITE` were NOT named above despite being individually documented "valid"/"allowed" and having the identical dead-toggle symptom on their own rows - added. Final in-scope set (13): `ALARM`, `ALWGPH`, `FRCDTA`, `HLPCLR`, `INVITE`, `OVERLAY`, `PUTRETAIN`, `PUTOVR`, `OVRDTA`, `OVRATR`, `MDTOFF`, `ERASEINP`, `ERASE`. `INZRCD`/`SLNO`/`CLRL`/`RTNDTA` confirmed correctly excluded already (each "not valid," no toggle rendered). Fixed by extending `wirePulldownGuardedFlag` with a new optional `withConditioning` trailing param (backward compatible - the two unaffected callers, `INZRCD` and the already-excluded four, are untouched) that wires the same `wireFlagRowConditioning` call `wireUsrdfnGuardedFlag` gained in I-44. New `i51PulldownConditioningFix.test.js`: for all 13, clicks the toggle, adds a pending OR-condition, commits an indicator, and confirms the reparsed DDS actually carries it (same click-through method as `dspfWebview.test.js`'s own BLINK/SFLDSP scenarios) - confirmed via `git stash` to genuinely fail (13 checks) against pre-fix code. Also found and fixed, while here: I-50's own commit had bumped `package.json`'s version but never ran `npm install` to sync `package-lock.json`'s two version fields, and never added its own new test (`i50RetlckstsParamsBug.test.js`) to `package.json`'s `test` script, so `npm test` was silently skipping it - both corrected as part of this commit. | I-44 (found during its implementation), I-13 | done (v0.10.124) |
| **I-52** | Gap found while implementing I-45: `DSPMOD`'s own DDS Reference text has a SECOND, independent prerequisite beyond the `DSPSIZ` one I-45 fixed - "The DSPMOD keyword cannot be specified on a subfile record (SFL keyword). The subfile is [dis]played according to the DSPMOD of the corresponding subfile control record." Confirmed live gap: `recordKeywordsPanelsHtml`'s Output tab (which renders DSPMOD's row) has no `isSflRecord`/`isSflCtlRecord` category-gating anywhere in `renderRecordProps` - unlike USRDFN's own Task R2 narrowing, every record type gets the full 8-tab set, so DSPMOD was fully reachable and editable on a plain SFL record with no guard. The second sentence of the DDS Reference text is the key scoping detail: it deliberately names only the plain SFL (detail) record, and explains why - the SFLCTL record's own DSPMOD already governs the whole subfile - so `SFLCTL` is NOT included in this fix's conflict list, unlike every other SFL-mutex rule in this file (e.g. `alwrolClrlSlnoConflictReason`'s own `['ASSUME','SFL','SFLCTL','USRDFN']` list, which covers a different keyword's own wording that names both). Fixed with new `DspfWriter.dspmodSflConflictReason(keywordName, recordKeywords)`, checking the literal `SFL` keyword's presence on the record directly (NOT `WebviewClientHelpers.isSflRecord`, which deliberately excludes SFLMSG records for an unrelated UI-tab reason that has nothing to do with this keyword's own restriction). Wired unconditionally into `wireUsrdfnGuardedFlag`'s existing check chain - no new trailing param needed, since the function itself is scoped to `keywordName === 'DSPMOD'` (same "safe no-op for every other caller" shape as `alwrolClrlSlnoConflictReason`/`usrdfnConflictReason`). Same alert+revert idiom as every other guard here. New `i52DspmodSflConflict.test.js` (plain SFL record blocked; SFLCTL record NOT blocked - commits normally; plain non-SFL record unaffected), all 3 scenarios using a DSPSIZ declaring both sizes so I-45's own prerequisite never interferes. Distinct from I-46 (still in progress elsewhere): I-46 is re-reading SFL/SFLCTL's OWN DDS Reference sections for a USRDFN-style blanket rule on what else can coexist on an SFL/SFLCTL record; this finding is the mirror case, a restriction stated in DSPMOD's OWN section. Full suite: zero failures. | I-45 (found during its implementation) | done (v0.10.127) |
| **I-57** | Split off from I-41's own scoping investigation: implement `PSHBTNFLD`/`PSHBTNCHC` (push-button field), the second half of I-41's original scope. Structurally near-identical to the already-implemented `SNGCHCFLD`/`CHOICE` pair - `PSHBTNFLD` maps to `SNGCHCFLD`'s own selection-field flag (own distinct param list: `*NORSTCSR`/`*RSTCSR`, `*NUMCOL nbr`/`*NUMROW nbr`, `*GUTTER width`), `PSHBTNCHC(choice-number choice-text [command-key] [*SPACEB])` maps to `CHOICE`'s own per-choice repeatable keyword (with one addition: an optional command-key parameter valid values `CA01`-`CA24`/`CF01`-`CF24`/`PRINT`/`HELP`/`CLEAR`/`ENTER`/`HOME`/`ROLLUP`/`ROLLDOWN`, defaulting to `ENTER` when omitted). The field containing `PSHBTNFLD` must be input-capable, type Y, length 2, decimals 0 (same shape DDS enforces on other selection-field types already modeled). `PSHBTNFLD`'s own DDS Reference text also lists its own small allowed-keyword whitelist for the field carrying it (`ALIAS`/`CHANGE`/`CHCAVAIL`/`CHCUNAVAIL`/`CHCCTL`/`INDTXT`/`NOCCSID`/`PSHBTNCHC`/`DSPATR(PC)`/`TEXT`) - worth a guard analogous to `htmlConflictReason` (I-41) once the field kind itself exists. Not yet started, logged for later pickup - a genuinely separate, larger UI undertaking (new field-kind selector option, new choice-list editor panel, new param-parsing functions) than I-41's own HTML fix, which is why it was split out rather than attempted in the same task. | I-41 (same original finding, split out) | not started |

### I-1 — Build canonical file-level keyword reference + compare against iSDA

**Done.** Extracted all ~155 keyword sections from
`DDS_Keyword_V7r6.txt`, classified each by documented level(s),
conditioning-indicator status, and no-parameter flag, then diffed the
confirmed file-level subset against iSDA's current 39 (from
`KEYWORD-INDEX.json`'s `file` level + `src/webviewClientHelpers.js`'s
`fileKeywordsPanelsHtml`). Findings feed directly into I-2 through I-6
below. No code changed in this task — audit only.

### I-2 — `PRTFILE` is not a real DDS keyword (usage/constraint bug)

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

### I-3 — Conditioning (option indicator) audit across all 39 file-level keywords

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

### I-4 — Parameter/sub-parameter completeness audit across all 39

Full audit completed across all 39 file-level keywords, comparing IBM's
documented parameter syntax (`DDS_Keyword_V7r6.txt`) against iSDA's
`dspfWriter.js`/`webviewClientHelpers.js` implementation.

**Confirmed correct, no changes needed:** `INVITE`, `ALWGPH`,
`MSGALARM`, `INDARA`, `USRDSPMGT`, `DSPRL` (no-parameter flags); `CHECK`
(file-level `AB`/`RLTB`/`RL` — matches documented file-level scope);
`CHGINPDFT` (all 9 documented codes `HI`/`RI`/`CS`/`BL`/`UL`/`LC`/`ME`/
`MF`/`FE` present); `TEXT`, `INDTXT`, `PASSRCD`, `DSPSIZ` (including its
user-defined display-size condition names — any `*`-prefixed token is
accepted, not just `*DS3`/`*DS4`), `MSGLOC`, `IGCCNV` (I-1's own finding,
reconfirmed), `WDWBORDER` (`*COLOR` 7 values, `*DSPATR` all 6 documented
codes `BL`/`CS`/`HI`/`ND`/`RI`/`UL`, `*CHAR` 8-char string — all present),
`ALTHELP`, `ALTPAGEUP`/`ALTPAGEDWN` (single optional `CAnn`/`CFnn`,
reachable), `CAnn`/`CFnn` (response-indicator + optional `'text'` both
present, separate from the — correctly separate — option-indicator
conditioning mechanism), `HLPFULL`, `HLPTITLE` (single quoted-text
parameter).

**Confirmed gaps, fixed as part of this task:**

1. **`MNUBARSW`/`MNUCNL` — invalid DDS being generated (not just an
   incompleteness gap).** IBM's documented formats are `MNUBARSW[(CAnn)]`
   (ONE optional parameter) and `MNUCNL[(CAnn [response-indicator])]`
   (CA key, then an OPTIONAL response indicator) — neither has a leading
   "indicator" parameter. The old `menuBarKeysPanelHtml`/
   `wireMenuBarKeysPanel` wrote a bogus extra token as the FIRST
   parameter (`MNUBARSW(50 CA03)`, `MNUCNL(51 CA04 90)`), confusing the
   option/conditioning indicator (a completely separate mechanism, already
   correctly modeled via `conditions`/`wireFlagRowConditioning`) with the
   keyword's own real parameter list. This would have failed to compile.
   Fixed: removed the stray indicator field from both keywords; `MNUBARSW`
   now writes just the CA key, `MNUCNL` writes CA key + optional response
   indicator. No legacy-format read-compat needed — a file carrying the
   old form was already invalid DDS that would never have compiled.
2. **`REF`** — documented format is `[library-name/]database-file-name
   [record-format-name]` (three logical parts), but the picker only
   exposed two fields ("Library" + "Record/File name"), leaving the
   optional record-format-name reachable only by accident (typing an
   extra space-separated token into the "record" box happened to
   serialize correctly, but had no label or field of its own). Fixed:
   added `getFileRefKeyword`/`setFileRefKeyword`'s own `recordFormat`
   sub-field and a third labeled input (`fk-ref-format`).
3. **`HLPPNLGRP`/`HLPSCHIDX`** — both used a single free-text box whose
   placeholder hint gave the parameter order BACKWARDS relative to the
   documented `help-module-name [library-name/]panel-group-name` and
   `[library-name/]search-index-object` shapes (`"panel-group-name
   library module-name"` and `"search-index-object library"`), which
   risked producing invalid DDS if someone typed it in the hinted order.
   Fixed: added `getFileHlpPnlGrpKeyword`/`setFileHlpPnlGrpKeyword` and
   `getFileHlpSchIdxKeyword`/`setFileHlpSchIdxKeyword`, and split each
   into its own labeled Module-name/Library/Panel-group-name and
   Library/Search-index-object fields (mirroring `REF`'s split above).
4. **`CLEAR`/`HOME`/`PAGEDOWN`/`PAGEUP`/`HELP`/`HLPRTN`/`VLDCMDKEY`** —
   all documented as `KEYWORD[(response-indicator ['text'])]`, the exact
   same optional-descriptive-text shape `INDTXT` gets its own two-field
   split for right next to them in the same panel — but these seven only
   ever exposed a single "indicator" box, with no way to reach the
   `'text'` sub-parameter at all. Fixed: same indicator+text split as
   `INDTXT`, reusing its parsing regex; the S36-4 hard-block on `HELP`'s
   response indicator (`checkS36EResponseIndicatorViolation`) was
   preserved by validating against just the indicator sub-field.

**Resolved by a parallel task, not duplicated here:** `PRINT`'s `*PGM`
special value was technically reachable when this audit started (a user
could type the literal text into the free-text response-indicator box
and it would serialize correctly) but wasn't surfaced as its own explicit
option. This sat inside the same file-level PRINT panel I-2 was already
reworking (merging `PRTFILE` into `PRINT`'s own printer-file parameter
form) — I-2 landed upstream (v0.10.83) with `*PGM` as an explicit
"Print file (name or *PGM)" input while this task was still in progress,
so no separate fix was needed here.

### I-5 — Add confirmed-missing file-level keywords

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

### I-6 — Resolve the `TEXT` file-level question

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

---

## Record-level audit (I-7 through I-29) — same 4-dimension method, per record type

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
per record type, condensed into each task's own section below. That
tells you *where to look*, not that what's there is already correct —
the whole point of I-1's method (read each keyword's own opening
statement in the DDS Reference, don't infer from a category label or
another keyword's mention of it) applies here exactly as it did at file
level. Known already-stale example: `KEYWORD-INDEX.json`'s record-level
Print category still lists `PRTFILE` as its own keyword — that's the
exact I-2 bug, the index just hasn't been regenerated since the fix.
Regenerating it (`docs/sda-reference/keyword-index/build_index.py` /
`build_lookup_and_md.py`) is fair game for whichever task gets to Print,
but isn't itself the point of that task — I-16 below does this once, at
the end of the series.

**Record types NOT getting their own task** — `PICKER-SCREENS-PLAN.md`'s
own R6/R8/R9/R11/R12 already established, with dedicated tests, that
`SFLMSGCTL`, `WNDSFL`, `WNDSFCTL`, `PULDWNSFL`, and `PDNSFLCTL` are not
distinct DDS record types at all: each is just an ordinary `SFLCTL` or
`SFL` record that also happens to carry `WINDOW` or `PULLDOWN`, with the
two component panels working independently and zero cross-contamination.
That finding was about *keyword coverage* (does the right panel appear);
it hadn't (until I-15) been re-checked from *this* audit's angle (does
combining two record shapes change any keyword's usage/conditioning/
parameter rules IBM documents only for the single-shape case).

| Task | Record type / Topic | Depends on | Status |
|------|----------------------|------------|--------|
| **I-7** | `RECORD` (base) | I-1 (method) | done (0.10.88) |
| **I-8** | `USRDFN` | I-7 | done (0.10.89) |
| **I-9** | `SFL` (subfile detail record) | I-1 (method) | done (0.10.86) |
| **I-10** | `SFLCTL` (subfile control record) | I-7, I-9 | done (0.10.90) |
| **I-11** | `SFLMSG` (message subfile detail record) | I-1 (method) | done (0.10.84) |
| **I-12** | `WINDOW` | I-7 | done (0.10.93) |
| **I-13** | `PULLDOWN` | I-7, I-12 | done (0.10.92) |
| **I-14** | `MNUBAR` (menu bar record) | I-7 | done (0.10.91) |
| **I-15** | Combination record types (`SFLMSGCTL`, `WNDSFL`, `WNDSFCTL`, `PULDWNSFL`, `PDNSFLCTL`) | I-9, I-10, I-11, I-12, I-13 | done - confirmed independent (0.10.94) |
| **I-16** | `KEYWORD-INDEX.json`/`.md`/`KEYWORD-LOOKUP.json` regeneration | I-7 through I-15 | done (0.10.108) |
| **I-17** | `MNUBARDSP` repeatable-conditioned-instance support | I-14 | done (0.10.95) |
| **I-18** | `MNUBARSW`/`MNUCNL` mutual CA-key exclusion guard | I-14 | done (0.10.96) |
| **I-19** | `MNUBAR` field-shape structural constraint | I-14 | done (0.10.97) |
| **I-20** | Repeatable Indicator-instance model isn't kind-aware | I-7, I-13 | done (0.10.101) |
| **I-21** | `CSRLOC` / record-level `HLPTITLE` missing conditioning | I-7 | done (0.10.98) |
| **I-22** | `SFLSIZ`/`SFLPAG`/`SFLLIN` display-size (`*DSx`) conditioning | I-10 | done (0.10.102) |
| **I-23** | Verify the ~9 keywords only *implied* to conflict with `SFLMSGRCD` | I-11 | done (0.10.103) - no hard blocks warranted; advisory note added for LOGINP/LOGOUT |
| **I-24** | `WINDOW` cannot be specified for the record named by file-level `PASSRCD` | I-12 | fixed (v0.10.99) |
| **I-25** | `KEEP` duplicated across 4 record-type panels — consolidate to one tab | I-7, I-9 | done (v0.10.100) — base General tab kept as sole live control; SFL/SFLMSG/SFLCTL panels each de-duped to a hint; see I-28 for the base tab's own KEEP conditioning-toggle bug found in the process |
| **I-26** | Add missing subfile-control selection-list keywords: `SFLSNGCHC`/`SFLMLTCHC`/`SFLSCROLL` | I-10, I-15 | done (v0.10.107) — see full write-up below for the AUTOSLT/SFLMLTCHC correction found along the way |
| **I-27** | Record-level `HLPTITLE` repeatable-conditioned-instance model (up to 15/record) | I-21 | done (0.10.105) |
| **I-28** | Base Record Keywords panel's `KEEP` row still offers a Conditioning toggle despite "Option and response indicators are not valid for this keyword" - I-9 fixed this on the SFL/SFLCTL copies but never on the base copy (now the sole surviving copy after I-25's de-dup); also confirmed by the DDS Reference: `KEEP` cannot be specified with `ALWROL`, `CLRL`, or `SLNO` - a separate mutual-exclusion audit may be warranted too | I-9, I-25 | fixed (v0.10.106) |
| **I-29** | Research the "Roll" column on real SDA's own "Define Display Layout" screen for `SFLSIZ`/`SFLPAG`/`SFLLIN` | I-22 | done - confirmed independent (0.10.104) |
| **I-36** | `ALWROL`/`CLRL`/`SLNO` cannot be specified for the record named by file-level `PASSRCD` (same restriction I-24 fixed for `WINDOW`) | I-24 | fixed (v0.10.111) |
| **I-37** | `ALWROL`/`CLRL`/`SLNO` are each individually incompatible with `ASSUME`/`SFL`/`SFLCTL`/`USRDFN` (flagged by I-28, broader than its own `KEEP`-scoped mutex guard) | I-28 | fixed (v0.10.111) |

### I-7 — `RECORD` (base)

**Scope:** R1's full 8 categories, all in scope for this type: General
(`INZRCD`/`KEEP`/`ASSUME`/`ALWROL`/`RETKEY`/`RETCMDKEY`/`CHGINPDFT`/
`MNUBARDSP`/`ENTFLDATR`/`RTNCSRLOC`/`TEXT`/`ALTNAME`), Indicator
(`CLEAR`/`PAGEDOWN`/`PAGEUP`/`HOME`/`HELP`/`HLPRTN`/`VLDCMDKEY`/`SETOF`/
`CHANGE`/`INDTXT`), ~~Application help (`HLPPNLGRP`/`HLPEXCLD`/`HLPBDY`/
`HLPARA`)~~ *(confirmed during I-7: not actually record-level; Task
L5d-ii already moved these to help-specification level, off this tab
entirely — the category label above was stale)*, Help (`HLPCLR`/
`HLPSEQ`/`HLPCMDKEY`/`HLPTITLE`), Output (`BLINK`/`ALARM`/`MSGALARM`/
`LOCK`/`LOGOUT`/`INVITE`/`ALWGPH`/`FRCDTA`/`DSPMOD`/`CSRLOC`/`SLNO`/
`CLRL`), Input (`LOGINP`/`UNLOCK`/`GETRETAIN`/`RETLCKSTS`/`CHECK`/
`RTNDTA`), Overlay (`OVERLAY`/`PUTRETAIN`/`PROTECT`/`PUTOVR`/`OVRDTA`/
`OVRATR`/`INZINP`/`MDTOFF`/`ERASEINP`/`ERASE`), Print (`PRINT` —
`PRTFILE` is I-2's fix, not a separate keyword). ~63 keywords total.

**Fixed (0.10.88):** Conditioning toggle removed from `INZRCD`/`ASSUME`/
`ALWROL`/`HLPCMDKEY`/`SLNO`/`CLRL`/`LOGINP`/`UNLOCK`/`GETRETAIN`/
`RTNDTA`/`CHECK`(AB,RL) — IBM: not eligible. Confirmed already-correct:
`MNUBARDSP`/`PUTOVR`/`MSGALARM`/`HLPCLR`/`ALTNAME`/`ENTFLDATR`/
`CHGINPDFT`/`TEXT`/`RTNCSRLOC` + all Output/Overlay/Print rows.

**Flagged, not fixed this task:**
- `CSRLOC` and record-level `HLPTITLE` are missing conditioning IBM says
  should be there (would require extending the shared
  `getFileTwoFieldKeyword`/`getFileQuotedText` primitives — bigger
  change, deferred). **See I-21.**
- The repeatable Indicator-instance model (`CLEAR`/`HOME`/`VLDCMDKEY`/
  `SETOF`/`CHANGE`/etc.) uses one uniform conditioning mechanism for all
  kinds even though IBM says conditioning isn't valid for `VLDCMDKEY`/
  `SETOF`/`CHANGE` specifically (would need the shared component made
  kind-aware). **See I-20.**
- `RETKEY`/`RETCMDKEY`/`KEEP` have no explicit option-indicator statement
  anywhere in the reference doc — left as-is rather than guessing.

### I-8 — `USRDFN`

**Scope:** deliberately narrow — per `isUsrDfnRecord`'s own doc comment
in `webviewClientHelpers.js`, real SDA's own "Select Record Keywords"
menu for USRDFN (`docs/sda-reference/screens/record-level/usrdfn/`)
offers only General/Help/Print, 3 of R1's 8 (down from an original 4
before Task L5d-ii correctly moved Application help off the record-level
set entirely, for every record type). This task's job is to verify that
narrowed set against IBM's own DDS Reference specifically for USRDFN
records — does the DDS Reference actually restrict any of General/Help/
Print's own keywords further on a USRDFN record specifically (e.g. a
keyword valid on `RECORD` that IBM's own text excludes for `USRDFN`),
not just re-confirm the menu screenshot. This is the clearest
"applicable/not applicable" case in the whole record-level series.

Checked every keyword in USRDFN's own narrowed General/Help/Print subset
against its own DDS Reference section, the same per-keyword method I-1/
I-7 used (read the keyword's own opening statement and any "cannot be
specified with"/"not valid for" note, don't infer from a category label).

**Confirmed already correct, no code change** — `INZRCD`, `KEEP`,
`RETKEY`, `RETCMDKEY`, `CHGINPDFT`, `MNUBARDSP`, `ENTFLDATR`,
`RTNCSRLOC`, `TEXT`, `ALTNAME`, `HLPTITLE`, `PRINT` have no USRDFN-
specific statement anywhere in their own DDS Reference sections.
`HLPCLR` is confirmed correct rather than merely absent of a
prohibition: its own DDS Reference example literally shows
`R RECORD1 USRDFN` immediately followed by `HLPCLR` on the next line.

**Fixed (0.10.89) — four keywords the DDS Reference documents as
individually incompatible with a USRDFN record:**
- `ALWROL` — "The ALWROL keyword cannot be specified with any of the
  following keywords: ASSUME, KEEP, SFL, SFLCTL, USRDFN"
- `ASSUME` — "This keyword cannot be specified with any of the
  following keywords: ALWROL, CLRL, SFL, SLNO, USRDFN, USRDSPMGT"
- `HLPSEQ` — "You cannot specify HLPSEQ on subfile (SFL keyword) or
  user-defined (USRDFN keyword) record formats."
- `HLPCMDKEY` — "You cannot specify HLPCMDKEY on subfile (SFL keyword),
  subfile control (SFLCTL keyword), or user-defined (USRDFN keyword)
  record formats."

Unlike I-11's SFLNXTCHG/SFLMSGRCD pair (two keywords either one of which
can be independently toggled on the same record), USRDFN is the
record-type identifier itself (`isUsrDfnRecord`'s own doc comment) — the
"+ Add record" wizard writes it once at creation and nothing in this UI
ever removes it — so the fix is a one-directional hard block:
`DspfWriter.usrdfnConflictReason(keywordName, recordKeywords)` (new, same
shape as L81's `dftGroupConflictReason`/I-11's
`sflNxtchgSflMsgRcdConflictReason`) checks whether USRDFN is already on
the record and, if so, refuses the on-transition for any of the four.
Wired via the same alert+revert idiom as I-11: `wireUsrdfnGuardedFlag`
(ALWROL/ASSUME/HLPCMDKEY, replacing their plain `simple()` calls) and
`wireUsrdfnGuardedTwoField` (HLPSEQ, which has no on/off checkbox of its
own — presence is either of its two text boxes being non-blank, per
`getFileTwoFieldKeyword`'s own contract) in `webviewClientHelpers.js`.
Turning any of the four OFF is never blocked, only the on-transition
(covers hand-edited DDS that already has one of them set on a USRDFN
record before iSDA opened it). Real SDA's own screen doesn't block this
either (relies on `CRTDSPF`'s own compile error) — this is the same
"hard-block a documented compile error even where real SDA lets it
through" precedent as L81/S36-4/I-11.

**Not re-litigated this task** — `CHECK(RL)`/`CHECK(RLTB)` vs USRDFN,
and `WINDOW` vs USRDFN, are both real DDS Reference statements too, but
neither keyword is reachable from USRDFN's own General/Help/Print
subset (`CHECK` lives on the Input tab, which USRDFN's narrowed tab set
doesn't expose at all; `WINDOW` is driven by the Basic tab's own
`hasWindow` check, a different code path entirely) — out of this task's
scope, not an oversight.

**Test coverage:** `src/test/i8UsrdfnConflictAudit.test.js` — confirms
all four keywords are blocked with an alert naming USRDFN and revert
with no edit posted on a USRDFN record, an unrelated keyword (RETKEY)
still commits normally on the same record, and all four still work
exactly as before (no alert, edit posted) on an ordinary non-USRDFN
record - confirmed (via `git stash`) to fail (12 of its 36 assertions)
against the pre-fix code.

### I-9 — `SFL` (subfile detail record)

**Scope:** standalone — doesn't reuse I-7's set. Subfile - General
(`SFLNXTCHG`/`LOGOUT`/`LOGINP`/`KEEP`/`CHECK`/`CHGINPDFT`), Subfile -
Indicator (`INDTXT`/`SETOF`/`CHANGE`), Subfile keywords (`SFLRCDNBR`/
`SFLROLVAL` — field-level, conditioned on the record being `SFL`/
`SFLCTL`, per Task D3).

Audited all 9 keywords `sflKeywordsPanelsHtml`/`wireSflKeywordsPanels`
(the SFL-specific tab) exposes, same method as I-3: read each keyword's
own "Option indicators are/are not valid for this keyword" line in
`DDS_Keyword_V7r6.txt`, diff against what the panel currently offers.

**Confirmed violations (offered conditioning, IBM says not valid)** —
toggle removed from all of these:
- `LOGINP` — "Option indicators are not valid for this keyword."
- `KEEP` — "Option **and response** indicators are not valid for this
  keyword" (a slightly different phrasing than the usual "option
  indicators" line — worth grepping for both forms in future record-level
  tasks).
- `CHECK(AB)`/`CHECK(RL)` — same rule I-3 already established at file
  level ("Option indicators are valid only for CHECK(ER) and CHECK(ME)");
  iSDA's SFL panel implements the same `AB`/`RL` sub-codes as file-level,
  neither of which is `ER`/`ME`.

**Confirmed already-compliant:**
- `SFLNXTCHG` — "Option indicators are valid for this keyword" — correctly
  offers conditioning.
- `LOGOUT` — "Option indicators are valid for this keyword" — correctly
  offers conditioning.
- `INDTXT`/`SETOF`/`CHANGE` — all three documented "not valid", and
  `indicatorTextRowsHtml`'s repeatable-row shape (one required response
  indicator per row, no separate AND/OR conditions layer) never offered a
  conditioning toggle to begin with — compliant by construction.
- `SFLRCDNBR`/`SFLROLVAL` (field-level, `subfileFieldKeywordsHtml`) — both
  documented "not valid"; the panel is a plain select/checkbox with no
  conditioning toggle at all — compliant.
- `CHGINPDFT` is deliberately NOT shown on this panel at all (already
  covered on the base Record Keywords → General tab, per this panel's own
  existing comment) — out of scope for this task, not re-verified here.

**Observation (not fixed, out of scope):** `KEEP` is independently
rendered — each with its own live `flagRowHtml` row reading/writing the
SAME underlying keyword — on at least 4 different record-type panels
(base `recordKeywordsPanelsHtml`, this SFL panel, the SFLMSG panel, and
the WINDOW/PULLDOWN panel — corrected by I-25's own fix: the fourth was
actually `SFLCTL`'s own panel, not WINDOW/PULLDOWN, which never had its
own `KEEP` row), unlike `CHGINPDFT` which an earlier task (R3)
deliberately de-duplicated down to the base tab only. This isn't a
data-correctness bug (all panels operate on the same record's `keywords`
array, so they stay in sync), just a UI redundancy. **See I-25.**

**Test coverage:** `src/test/i9SflConditioningAudit.test.js` renders the
real generated webview in jsdom and asserts the toggle's presence/absence
for every keyword this task touched.

### I-10 — `SFLCTL` (subfile control record)

**Scope:** reuses I-7's full 8 (R1) plus its own: Subfile Control -
General (`SFLCTL`/`SFLCSRRRN`/`SFLMODE`/`SFLDSP`/`SFLDSPCTL`/`SFLINZ`/
`SFLDLT`/`SFLCLR`/`SFLEND`/`SFLRNA`/`SFLDROP`/`SFLFOLD`/`SFLENTER`),
Display Layout (`SFLSIZ`/`SFLPAG`/`SFLLIN`), Subfile Messages
(`SFLMSG`/`SFLMSGID`). Note `SFLMSGID` here is the **control**-record
keyword sharing a name with — but structurally distinct from —
field-level `MSGID`; don't conflate the two when checking parameters.

Audited every keyword `sflCtlPanelsHtml`/`wireSflCtlPanels` (the SFLCTL
tab) exposes, same method as I-7/I-9: read each keyword's own "Option
indicators are/are not valid for this keyword" line in
`DDS_Keyword_V7r6.txt`, diff against what the panel currently offers.

**Fixed (0.10.90) — confirmed violations (offered conditioning, IBM says
not valid), toggle removed from all of these:**
- `SFLCTL` — "Option indicators are not valid for this keyword."
- `SFLMODE` — "Option indicators are not valid for this keyword."
- `SFLENTER` — "Option indicators are not valid for this keyword."
- `SFLRNA` — "Option indicators are not valid for this keyword."

**Propagated from I-9 (same underlying keyword, different panel copy)** —
I-9 already established these are not eligible and fixed them on the
plain SFL panel, but this SFLCTL panel's own separate `flagRowHtml`/
`wireFlagRow` call sites for the exact same "Subfile Keywords (shared
with plain SFL records)" section never got the fix — genuinely two
different pieces of markup/wiring reading and writing the same
underlying keyword, so fixing one didn't fix the other:
- `LOGINP` — "Option indicators are not valid for this keyword."
- `KEEP` — "Option **and response** indicators are not valid for this
  keyword."
- `CHECK(AB)`/`CHECK(RL)` — same rule I-3/I-9 already established
  ("Option indicators are valid only for CHECK(ER) and CHECK(ME)").

**Confirmed already-compliant:**
- `SFLDSP`/`SFLDSPCTL`/`SFLINZ`/`SFLDLT`/`SFLCLR` — all individually
  documented "Option indicators are valid for this keyword" (`SFLCLR`/
  `SFLDLT` go further and say an option indicator is *required*) —
  correctly offer conditioning.
- `SFLEND` — "An option indicator must be specified for this keyword" —
  correctly offers (and requires) conditioning.
- `SFLDROP`/`SFLFOLD` — both "Option indicators are valid for this
  keyword" — correctly offer conditioning.
- `SFLNXTCHG`/`LOGOUT` — both already confirmed valid by I-9, reused
  verbatim here — correctly offer conditioning.
- `SFLMSG`/`SFLMSGID` (control-record level, via the repeatable-instance
  L1c component) — "Option indicators are valid for these keywords" —
  correctly offer per-instance conditioning.

**Left as-is (ambiguous, not fixed):** `SFLCSRRRN` has no explicit
option-indicator statement anywhere in the reference doc — same posture
I-7 already took for `RETKEY`/`RETCMDKEY`/`KEEP` (left alone rather than
guessing which way an unstated case should go).

**Flagged, not fixed this task:** `SFLSIZ`/`SFLPAG`/`SFLLIN` are each
individually documented as "Option indicators are not valid... Display
size condition names are valid" (`SFLPAG`/`SFLSIZ` add "and are required
if [the value] changes depending on the size of the display"). That's a
genuinely different conditioning mechanism (`*DSx` display-size names,
not option indicators) than every other row on this panel — and one this
codebase already deliberately defers for this exact trio, confirmed
pre-existing rather than newly discovered: task A1's own note already
lists "SFLSIZ/SFLPAG/SFLLIN multi-instance conditioning" among the
"pre-existing, deliberately-documented deferrals, not oversights" found
during the record-level screenshot audit. **See I-22.**

**Test coverage:** `src/test/i10SflctlConditioningAudit.test.js` renders
the real generated webview in jsdom and asserts the toggle's presence/
absence for every keyword this task touched, plus a commit-still-works
regression check for a newly-ineligible row (`SFLRNA`).

### I-11 — `SFLMSG` (message subfile detail record)

**Scope:** standalone — per Task R5's own finding, doesn't reuse I-7's
set at all. Message Record (`SFLMSGRCD`/`SFLMSGKEY`/`SFLPGMQ`), plus its
own General/Indicator categories.

**General/Indicator categories** — confirmed via the real SDA screenshots
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

**Message Record category** (`SFLMSGRCD`/`SFLMSGKEY`/`SFLPGMQ`) —
confirmed already correct from earlier tasks: field auto-generation and
ordering (L74), the `SFLMSGKEY`-then-`SFLPGMQ` field order the DDS
Reference requires, and `SFLMSGRCD`'s own line-number/DSPSIZ-conditioning
shape (L80, corrected by L84). No code change needed here either.

**Fixed (0.10.84) — new finding:** the DDS Reference documents
`SFLNXTCHG` and the rest of the "for all other subfiles" keyword group
(`CHANGE`, `CHECK(AB)`/`CHECK(RL)`, `CHGINPDFT`, `INDTXT`, `KEEP`,
`LOGINP`, `LOGOUT`, `SETOF`/`SETOFF`) as belonging to a keyword set
that's mutually exclusive with `SFLMSGRCD`'s own "for message subfiles"
set on the same subfile record format, and states outright under
`SFLNXTCHG`'s own notes: "You cannot specify SFLNXTCHG with the
SFLMSGRCD keyword." `sflMsgPanelsHtml`'s own General tab (which only
ever renders for a record that already carries `SFLMSGRCD`, by
`isSflMsgRecord`'s own definition) let a user check `SFLNXTCHG` on with
no guard, which would produce invalid DDS. Real SDA itself doesn't block
this either (relies on `CRTDSPF`'s own compile error), but per this
project's own established precedent (L81, S36-4) of hard-blocking
documented DDS compile errors even where real SDA lets them through,
added `DspfWriter.sflNxtchgSflMsgRcdConflictReason` (same shape as L81's
own `dftGroupConflictReason`) and wired it into `sm-sflnxtchg`'s
checkbox with the same alert+revert idiom. Turning `SFLNXTCHG` off is
never blocked, only the on-transition.

**Open question, NOT acted on this task** — the remaining ~9 keywords in
the "for all other subfiles" list are only *implied* to conflict with
`SFLMSGRCD` by IBM's "for X / for all other Y" category framing — none
of them individually restate the prohibition the way `SFLNXTCHG`'s own
page does. Rather than guess whether all 9 are equally hard compile
errors (vs. e.g. merely pointless/no-effect on a message subfile),
flagged for a future task to verify against `CRTDSPF` or a more
authoritative source, the same way I-4/I-6 were left open rather than
guessed at. **See I-23.**

**Test coverage:** `dspfWriter.test.js` (unit tests for
`sflNxtchgSflMsgRcdConflictReason`) and `dspfWebview.test.js`'s existing
SFLMSG picker test gained a new block confirming the guard fires with an
alert naming `SFLMSGRCD`, reverts the checkbox, and posts no edit -
confirmed (via `git stash`) to fail against the pre-fix code.

### I-12 — `WINDOW`

**Scope:** reuses I-7's full 8 plus its own: Window Parameters (`WINDOW`
itself — size/roll/position), Border Parameters/Color/Attributes/
Characters (`WDWBORDER`, shared verbatim with file-level's own
`WDWBORDER` per F1's note). Window Title has its own existing dedicated
panel, not part of this task's scope (already built, not part of the
audit unless a gap is found).

Audited the WINDOW record type's own keyword set against the DDS
Reference — I-7's reused 8 categories plus WINDOW's own Window
Parameters (`WINDOW` itself) and Border Parameters (`WDWBORDER`, shared
with file-level) — same per-keyword method as I-1/I-7/I-8/I-10 (read
each keyword's own opening statement, don't infer from a category label
or another keyword's mention of it).

- **`WDWBORDER` file-level/record-level sharing** — confirmed accurate,
  not just assumed: the DDS Reference's `WDWBORDER` section is written
  once and explicitly covers both levels ("You use this file-level or
  record-level keyword..."), identical parameter shape either way. No
  code change needed — `windowBorderPanelHtml`'s reuse of the file-level
  helpers is correct.
- **`WINDOW` itself** — confirmed "Option indicators are not valid for
  this keyword" (already correctly not offering a Conditioning toggle —
  there never was one on this panel, so nothing to remove). Parameter
  shapes checked against `getWindowParamsKeyword`/`setWindowParamsKeyword`
  (`*DFT`, start-line/position, lines/columns, the `*MSGLIN`/`*NOMSGLIN`
  and `*RSTCSR`/`*NORSTCSR` trailing tokens, and the record-name
  reference form) — all confirmed already correct.
- **`RMVWDW`/`USRRSTDSP`** — both individually documented "Option
  indicators are valid for this keyword" — both already correctly wired
  with conditioning via `flagRowHtml`'s `conditions` parameter. No change
  needed.

**Fixed (0.10.93) — new finding:** WINDOW's own DDS Reference section
states outright: "The WINDOW keyword is not allowed on a record format
that has any one of the following keywords specified: ALWROL, ASSUME,
MNUBAR, PULLDOWN, SFL, USRDFN." Of these six, `MNUBAR`/`PULLDOWN`/`SFL`/
`USRDFN` are each their own record TYPE the "+ Add record" wizard picks
once at creation time (`RECORD_TYPES` in `webviewClientHelpers.js`) —
WINDOW is never addable to an existing record of one of those types
afterward through this UI (the Window tab/Apply button only ever renders
for a record that already carries `WINDOW`, per `isWindowRecord`), so
there's no reachable on-transition to guard for that half. `ALWROL`/
`ASSUME`, however, are plain toggles on the base General tab (I-7's own
set, reused unchanged for WINDOW records) — turning either ON while
WINDOW is already present was a genuinely reachable, previously-unguarded
on-transition that would produce invalid DDS. Same "hard-block only the
documented, reachable on-transition" precedent as I-8
(`usrdfnConflictReason`) and I-11 (`sflNxtchgSflMsgRcdConflictReason`):
added `DspfWriter.windowConflictReason` (same shape as
`usrdfnConflictReason`) and extended the existing `wireUsrdfnGuardedFlag`
helper with an `alsoCheckWindow` flag so `ALWROL`/`ASSUME`'s call sites
layer the new check on top of the pre-existing USRDFN one, without
dragging WINDOW into `HLPCMDKEY`'s own guard (WINDOW's own text doesn't
name `HLPCMDKEY`). Turning `ALWROL`/`ASSUME` back off is never blocked,
and WINDOW itself is only ever written by the record-creation wizard,
never toggled through this function, so there's no reverse direction to
check either — this also covers hand-edited DDS that already combines
them with WINDOW before iSDA opened the file.

**Flagged, not fixed this task**: WINDOW's own section also states
"WINDOW cannot be specified for the record format specified by the
PASSRCD keyword" — a cross-reference-by-name check against a file-level
keyword's string parameter (does record X, which some file-level
`PASSRCD(X)` points at, ever get a `WINDOW` keyword), a different and
more involved shape of check than a same-record flag conflict. Deferred
rather than guessed at, same posture I-4/I-6/I-11's own open questions
took. **See I-24.**

**Test coverage:** `src/test/i12WindowConflictAudit.test.js` renders the
real generated webview in jsdom: confirms `ALWROL`/`ASSUME` are blocked
(alert naming WINDOW, checkbox reverts, no edit posted) on a WINDOW
record, that an unrelated keyword (`RETKEY`) still commits normally on
the same record (guard is scoped to just those two), and that
`ALWROL`/`ASSUME` are completely unaffected on an ordinary non-WINDOW
record (no regression). Confirmed (via `git stash`) to fail 6 of its 24
assertions against the pre-fix code.

### I-13 — `PULLDOWN`

**Scope:** reuses I-7's full 8 plus its own: Pull-Down - General
(`PULLDOWN`/`WDWBORDER` — no window-parameters screen, per R10's own
note that pull-downs don't have `WINDOW`'s size/roll options).

**Fixed (0.10.92):** `PULLDOWN`'s own DDS Reference section states
directly, in its own text, "The following keywords cannot be specified
on a record with the PULLDOWN keyword:" followed by a 27-keyword list:
`ALARM`, `ALTNAME`, `ALWGPH`, `ALWROL`, `ASSUME`, `CLEAR`, `CLRL`,
`ERASE`, `ERASEINP`, `FRCDTA`, `HLPCLR`, `HLPSEQ`, `INVITE`, `INZRCD`,
`MDTOFF`, `MNUBAR`, `OVERLAY`, `OVRATR`, `OVRDTA`, `PUTOVR`, `PUTRETAIN`,
`RTNDTA`, `SFL`, `SLNO`, `USRDFN`, `WDWTITLE`, `WINDOW` — none of which
were previously guarded. Added `DspfWriter.pulldownConflictReason`
(bidirectional, same alert+revert idiom as I-8/I-11 - turning PULLDOWN
on while a forbidden keyword is present is blocked, and turning a
forbidden keyword on while PULLDOWN is present is blocked) and
hard-wired it onto the 22 of the 27 that live on the shared RECORD panel
this task covers (`INZRCD`/`ALTNAME`/`ALWROL`/`ASSUME`/`HLPCLR`/
`HLPSEQ`/`ALARM`/`INVITE`/`ALWGPH`/`FRCDTA`/`SLNO`/`CLRL`/`RTNDTA`/
`OVERLAY`/`PUTRETAIN`/`PUTOVR`/`OVRDTA`/`OVRATR`/`MDTOFF`/`ERASEINP`/
`ERASE`, plus `ALWROL`/`ASSUME`/`HLPSEQ` also keep their existing I-8
USRDFN guard - both checks run, whichever fires first wins), plus
PULLDOWN's own "on" checkbox (`wirePulldownPanels`). `PROTECT`/`INZINP`
were individually checked against their own DDS Reference sections and
confirmed NOT on the forbidden list - left on plain wiring. PULLDOWN's
own parameters (`*SLTIND`/`*RSTCSR`) were already fully reachable and it
already correctly offered no Conditioning toggle ("Option indicators are
not valid for this keyword") - no change needed there.

**Flagged, not fixed this task:** `CLEAR` is on the forbidden list too
but lives in the repeatable Indicator-instance model (Task L5d), which
isn't kind-aware (same "shared component would need to be made
kind-aware" deferral I-7 already took for `VLDCMDKEY`/`SETOF`/`CHANGE`) -
not wired. **See I-20.** `MNUBAR`/`SFL`/`USRDFN` are themselves other
record-type identifiers and `WINDOW`/`WDWTITLE` belong to I-12's own
Window tab (out of this task's own scope per its own plan-doc row) - all
five are still covered from PULLDOWN's own on-checkbox side
(`pulldownConflictReason('PULLDOWN', ...)` checks against the full
27-keyword list), just not from their own individual keyword-side
toggle.

### I-14 — `MNUBAR` (menu bar record)

**Scope:** reuses I-7's full 8 plus its own: Menu-Bar record - General
(`MNUBAR`/`MNUBARDSP`/`MNUBARSW`/`MNUCNL`), Menu-Bar Display Keywords
(`MNUBARDSP` again — confirmed below not to be a duplicate listing
artifact vs. two genuinely distinct parameter forms). Field-level
`MNUBARCHC`/`MNUBARSEP`/choice keywords (Task D5) are a separate
field-level task, not in scope here.

Audited all 4 keywords `mnuBarPanelsHtml`/`wireMnuBarPanels` (the MNUBAR
tab) exposes, same method as I-7/I-9/I-10: read each keyword's own
"Option indicators are/are not valid for this keyword" line in
`DDS_Keyword_V7r6.txt`, diff against what the panel currently offers,
then separately check parameters/sub-parameters and the "duplicate
listing" question this task's own scope note raised.

**Fixed (0.10.91) — confirmed violation (offered conditioning, IBM says
not valid), toggle removed:**
- `MNUBAR` — "Option indicators are not valid for this keyword." The
  panel's own `flagRowHtml` call was passing `mnubar.conditions` straight
  through (rather than `undefined`, the "not eligible" idiom I-7/I-8/
  I-9/I-10 all use), so a Conditioning toggle appeared where none should.
  Fixed in both `mnuBarPanelsHtml` (build) and `wireMnuBarPanels` (wire),
  which had a matching bug in its own `setFileFlagKeyword` call already
  reading `getFileFlagKeyword(...).conditions` back off the keyword
  purely to round-trip it — removed there too so an existing (invalid)
  file that already carries conditioning on `MNUBAR` is left untouched
  rather than being silently stripped, matching this codebase's existing
  "omitted conditions preserves whatever already existed" convention.

**Confirmed already-compliant (both correctly offer conditioning):**
- `MNUBARSW` — "Option indicators are valid for this keyword." Already
  correctly wired at both file level (Task F1's Menu-bar category) and
  record level (`menuBarKeysPanelHtml`, reused verbatim on this tab),
  matching IBM's own "file- or record-level keyword" designation for
  it. Its `[(CAnn)]` parameter (default CA10) was already confirmed
  correct by Task I-4.
- `MNUCNL` — "Option indicators are valid for this keyword." Same
  file-and-record-level wiring as `MNUBARSW`, matching its own IBM
  "file- or record-level keyword" designation. Its
  `[(CAnn [response-indicator])]` parameter (default CA12) was already
  confirmed correct by Task I-4.
- `MNUBARDSP` — "Option indicators are valid for the MNUBARDSP keyword,
  and more than one MNUBARDSP keyword can be specified on the record if
  all are optioned." Conditioning toggle already present and correct
  (Task L76/I-4's own investigation confirmed the toggle itself was
  never the bug, only the flat parameters box was). The repeatability
  half of that sentence is a genuine, separate gap — see "flagged, not
  fixed" below, not silently folded into this fix.

**"Duplicate listing" question, resolved:** this task's own scope note
asked whether `MNUBARDSP` appearing under both "Menu-Bar record -
General" and "Menu-Bar record - Menu-Bar Display Keywords" in
`KEYWORD-INDEX.json` reflects two genuinely distinct parameter forms or
a stale artifact. Checked against the actual code (`mnuBarPanelsHtml`,
`recordKeywordsPanelsHtml`): only ONE `MNUBARDSP` row is ever rendered —
on R1's shared base General tab, present for every record type
including MNUBAR — with `mnuBarPanelsHtml`'s own comment already
pointing there via a hint line rather than duplicating it. The "Menu-Bar
Display Keywords" category name in the index describes real SDA's own
sub-screen (reached from `MNUBARDSP`'s "Select parameters" flag), which
iSDA folds into that same single row rather than a separate top-level
panel — the two-category listing is a documentation artifact from how
`KEYWORD-INDEX.json` was originally built, not a second, uncovered
keyword surface. Left for I-16's end-of-series regeneration rather than
hand-edited now, per I-16's own "do this last, not incrementally" scope.

**Flagged, not fixed this task** (bigger, separate-scope changes, same
posture as I-10's `SFLSIZ`/`SFLPAG`/`SFLLIN` deferral — each split out
into its own pickable task rather than left as bare prose):
- `MNUBARDSP`'s own documented repeatability ("more than one ... if all
  are optioned") isn't modeled — the panel is single-instance
  (`getFileFlagKeyword`/`setFileFlagKeyword`), not a repeatable-instance
  list the way `recordIndicatorInstancesHtml`/`errorMessageInstancesHtml`
  model other repeatable keywords elsewhere in this codebase. **See I-17.**
- `MNUBARSW`/`MNUCNL`'s own documented mutual CA-key exclusion ("the CAnn
  key specified by MNUBARSW cannot be specified again using another
  keyword such as MNUCNL", and the mirror statement under `MNUCNL`) isn't
  enforced — nothing stops a person from assigning the same CAnn to both
  in this UI today. **See I-18.**
- `MNUBAR`'s own structural constraint ("must contain one and only one
  menu bar field... and cannot contain any displayable fields other than
  the menu bar field") isn't validated anywhere — this is a field-level/
  record-composition rule, not a keyword-conditioning or parameter gap,
  so it sits outside this task's 4-dimension method entirely. **See I-19.**

**Test coverage:** `src/test/i14MnubarConditioningAudit.test.js` renders
the real generated webview in jsdom and asserts the Conditioning
toggle's absence on the now-ineligible `MNUBAR` row, its continued
presence on `MNUBARSW`/`MNUCNL` (no regression), the corrected parameter
placeholder text, and a commit-still-works check after removing the
toggle — confirmed (via `git stash`) to fail against the pre-fix code.

### I-15 — Combination record types: `SFLMSGCTL`, `WNDSFL`, `WNDSFCTL`, `PULDWNSFL`, `PDNSFLCTL`

**Scope:** not a full per-type audit (see "Record types NOT getting
their own task" above) — recheck R6/R8/R9/R11/R12's "no
cross-contamination" finding specifically from THIS audit's angle: does
IBM's DDS Reference document any usage/conditioning/parameter rule that
only applies when two keywords are combined on the same record (e.g. a
restriction on `SFL` that's stated differently when `WINDOW` is also
present)? If nothing turns up, close as "confirmed independent, no
combination-specific rules" the same way R6/R8/R9/R11/R12 closed with
"zero new code needed." If something does turn up, split it into its own
task rather than silently patching it here.

**Closed (0.10.94, no code change):** `WINDOW`'s own DDS Reference
section states outright that `WINDOW` is not allowed on a record with
`SFL`, but is explicitly allowed on a record with `SFLCTL` ("Note: The
WINDOW keyword is allowed on a record with the SFLCTL keyword. This
allows subfiles to be displayed within a window."), confirmed by the DDS
Reference's own worked example (a `SFLCTL(SFLDATA) WINDOW(...)` control
record). `buildTypedRecordPlan`'s `WDWSFL` type already matches this
exactly — it writes plain `SFL` on the main (detail) record and
`SFLCTL`+`WINDOW` together on the auto-generated dependent (control)
record, never the reverse; there is no reachable path through this UI to
land `WINDOW` directly on a plain `SFL` record. `PULLDOWN`'s own
forbidden-keyword list (I-13) names `SFL` but not `SFLCTL`, and no other
keyword's own DDS Reference section states a `PULLDOWN`+`SFLCTL`
restriction either way — `PDNSFL` builds the same shape (`SFL` on the
detail record, `SFLCTL`+`PULLDOWN` on the dependent) with nothing to
guard against. Both the Window and Pull-down record-properties tabs are
also only ever shown for a record that already carries `WINDOW`/
`PULLDOWN` (`isWindowRecord`/`isPulldownRecord` gate the tab itself, not
just a checkbox within it), so there is no in-UI on/off toggle that
could retrofit either keyword onto an existing `SFL`/`SFLCTL` record
after creation — confirming R6/R8/R9/R11/R12's "zero cross-contamination"
finding still holds from this audit's angle too, for every combination
the current code actually implements.

**One real combination-specific rule did turn up, split into I-26
rather than fixed here:** `SFLSNGCHC`'s and `SFLMLTCHC`'s own DDS
Reference sections each state that their `*RSTCSR`/`*NORSTCSR` and
`*AUTOSLT`/`*NOAUTOSLT` parameter defaults flip specifically "if the
SFL[SNGCHC|MLTCHC] subfile control record is defined in a pulldown."
This is a genuine `PDNSFLCTL`-specific rule, but `SFLSNGCHC`/
`SFLMLTCHC` (and their sibling `SFLSCROLL`) were never implemented in
iSDA at all — confirmed absent from I-10's own audited SFLCTL scope and
from the codebase — so there is no existing combination behavior to fix;
adding the keywords themselves is bigger than this task's own recheck
scope. **See I-26.**

### I-16 — `KEYWORD-INDEX.json`/`.md`/`KEYWORD-LOOKUP.json` regeneration

Housekeeping, not an audit task itself — once I-7 through I-15 land real
fixes, regenerate the keyword-index files (`build_index.py`/
`build_lookup_and_md.py`) so they stop reflecting stale pre-fix state
(the `PRTFILE` example noted above is one instance; there may be others
by the time this is picked up). Do this LAST, after the others are done,
not incrementally per task — regenerating after every single fix just
churns the index files repeatedly for no benefit.

**Done (0.10.108).** By the time this was picked up, I-17 through I-29
had also landed on top of I-7 through I-15, so the audit against current
code covered the full record-level series, not just I-7–I-15. Read
`build_index.py`'s hand-curated data against the actual current panel
code in `webviewClientHelpers.js`/`dspfWriter.js` (not from memory or
from the previous JSON snapshot) and corrected every discrepancy found:

- **Removed `PRTFILE`** (file-level and record-level Print categories) —
  the exact stale example this task's own scope note named; I-2 (v0.10.83)
  removed it from the codebase entirely, the index just hadn't been
  regenerated since.
- **Added I-5's five confirmed-missing file-level keywords** where they
  actually landed: `VALNUM`/`WRDWRAP` on General, `MOUBTN` (repeatable)
  on Indicator, `HLPRCD` on Help. `ROLLUP`/`ROLLDOWN` needed no index
  change — they're `PAGEDOWN`/`PAGEUP`'s own `altNames`, not separate
  keyword entries.
- **`MNUBARDSP` marked repeatable** (record-level General category) —
  I-17 rebuilt it as a genuine repeatable-conditioned-instance list.
- **`HLPTITLE` marked repeatable** (record-level Help category) — I-27
  rebuilt it the same way, up to 15 instances/record.
- **`KEEP` removed from the SFL/SFLCTL subfile panels' own keyword
  lists** (Subfile - General (SFL), Subfile Control - General (SFLCTL))
  — I-25's de-dup left it as a hint on those panels pointing at the base
  Record Keywords → General tab, its sole surviving live copy.
  `CHGINPDFT` was also removed from the SFL panel's own list for the
  same reason — confirmed via I-9's own write-up that it was never
  actually a live row there, just a stale index entry predating I-9.
- **Added I-26's three new keywords**: `SFLSNGCHC`/`SFLMLTCHC` (SFLCTL
  General, with their pull-down-conditional default-flip behavior noted
  in the parameter description) and `SFLSCROLL` (the subfile field-level
  category, renamed to name all three keywords it now covers).
- **`SFLSIZ`/`SFLPAG`/`SFLLIN` parameter descriptions corrected** to
  reflect I-22's per-`DSPSIZ`-size instance model (same shape as
  `SFLMSGRCD`/`MSGLOC`) rather than the old single-instance
  `number [, display-size]` shorthand; `SFLPAG`'s own description also
  had I-22's field-name-vs-number correction folded in.
- **Removed the separate "Menu-Bar record - Menu-Bar Display Keywords"
  category and `MNUBARDSP`'s duplicate row on the MNUBAR record's own
  General tab.** This is the exact "duplicate listing" question I-14
  raised and explicitly deferred here: confirmed against
  `mnuBarPanelsHtml`'s own code that only a hint (pointing at the base
  General tab) renders on the MNUBAR-specific tab, not a second live
  `MNUBARDSP` row or a distinct sub-panel — the two-category listing
  really was a documentation artifact, not a second UI surface.

**Not re-litigated this task** (per this task's own housekeeping scope —
regenerate from current keyword/category *structure*, not re-audit
conditioning/conflict behavior): I-3/I-7 through I-15/I-18 through
I-24/I-28's own conditioning-eligibility fixes, mutual-exclusion guards,
and advisory notes don't change what's *listed* in the index (this
schema has no conditioning/conflict field at all), so none of those
required an index change even though real code changed. Also left
untouched: whether SFLMSG's own General/Indicator categories (reusing
I-9's SFL set verbatim, per I-11's own finding) deserve their own
distinct index categories rather than being implicitly covered — a
genuine index-completeness question, but a new gap to research, not a
regeneration of already-covered ground; flagged here rather than guessed
at.

**Process note:** `keywordFixes.md`'s own I-25 section body still reads
"Not started" even though its row in the record-level summary table
(and the codebase itself) confirms I-25 landed at v0.10.100 — a
documentation drift bug in this very file, discovered while cross-
checking I-25's own KEEP fix against the code for this task. Left
uncorrected here since fixing `keywordFixes.md`'s own prose is outside
I-16's stated scope (JSON/MD regeneration only) and isn't this task's
call to make unilaterally — flagged for whoever picks it up next.

**Verification:** `python3 build_index.py` then
`python3 build_lookup_and_md.py` (both pure-stdlib, no dependencies),
followed by spot-checks of `KEYWORD-LOOKUP.json` for every keyword this
task touched (`MNUBARDSP`, `PRTFILE`, `KEEP`, `HLPTITLE`, `SFLSNGCHC`,
`SFLMLTCHC`, `SFLSCROLL`, `HLPRCD`, `MOUBTN`, `VALNUM`, `WRDWRAP`) to
confirm each landed at the right location with the right shape. No
runtime code touched — `npm run compile` and the full `npm test` suite
were re-run anyway as a sanity check and are unaffected (3949/3949,
unchanged from baseline), since this is documentation tooling, not part
of the extension's own build or test path.

### I-17 — `MNUBARDSP` repeatable-conditioned-instance support

**Scope:** IBM's own DDS Reference: "Option indicators are valid for the
MNUBARDSP keyword, and more than one MNUBARDSP keyword can be specified
on the record if all are optioned. If more than one MNUBARDSP keyword is
in effect when the record is written, the first one in effect is used."
Today's picker models MNUBARDSP as a single instance
(`getFileFlagKeyword`/`setFileFlagKeyword`/`getMnubardspFields`/
`setMnubardspFields`) on both the non-MNUBAR-record 3-name form and the
MNUBAR-record single-pull-down-input form, so a second, differently-
conditioned MNUBARDSP on the same record can only be added via the raw
Keywords editor, not this row. Needs a repeatable-instance UI, same
shape as `recordIndicatorInstancesHtml`/`errorMessageInstancesHtml`/
`messageIdInstancesHtml` elsewhere in this codebase, applied to whichever
of MNUBARDSP's two parameter shapes is active on the record carrying it.

**Done (0.10.95):** replaced the single-instance row with a repeatable,
independently-conditioned instance list built on the same generic
`DspfWriter.getRepeatableKeywordInstances`/`setRepeatableKeywordInstances`
primitive `moubtnPanelHtml`/`wireMoubtnPanel` already use for MOUBTN,
rather than a bespoke get/set pair. Both parameter shapes preserved
(parsed/composed per-instance locally in `webviewClientHelpers.js`,
since the old `getMnubardspFields`/`setMnubardspFields` pair operates on
a whole `keywords` array, not one instance's raw parameter string).

**Design choice - reuse, don't rebuild:** rather than a bespoke
MNUBARDSP-specific get/set pair, this reuses the exact same generic
`DspfWriter.getRepeatableKeywordInstances`/`setRepeatableKeywordInstances`
primitive `moubtnPanelHtml`/`wireMoubtnPanel` already use for MOUBTN (a
plain repeatable single-keyword-name list with no pairing to another
keyword) - MNUBARDSP fits that same shape, just with a keyword-specific
row renderer. New functions added to `webviewClientHelpers.js`:
`parseMnubardspInstanceParams`/`composeMnubardspInstanceParams` (parse/
compose one instance's raw parameter text for either of MNUBARDSP's two
shapes), `mnubardspInstanceRowHtml`, `mnubardspPanelHtml`,
`wireMnubardspPanel`. The old `getMnubardspFields`/`setMnubardspFields`
pair in `dspfWriter.js` is left in place, unused by the UI now but still
a valid, separately-tested public primitive (`recordKeywordsPicker.
test.js` exercises it directly) - not removed, since deleting a tested,
exported function outside this task's own scope isn't this task's call
to make.

**Both parameter shapes preserved:** the `isMnuBarRec` check
(`kw.some(k => k.name === 'MNUBAR')`) that picked between MNUBARDSP's
two formats in the old single-instance code is unchanged, just now
threaded through to decide which row shape (single pull-down-field
input, or 3-name rec/choice/pull-down row) each instance renders as -
confirmed via a MNUBAR-record and a non-MNUBAR-record side by side in
the same test file.

**Blank-instance handling differs from MOUBTN/record-indicator's own
precedent, deliberately:** those two components' own `makeDefaultInstance`
return a non-blank placeholder (`'*ULP CF01'`, `resp: '10'`) because a
genuinely blank instance would vanish on the very next re-render for
them. MNUBARDSP doesn't have that problem -
`setRepeatableKeywordInstances` always writes one entry per instance
with a `name`, regardless of whether `parameters` is empty - so a fresh
instance is left entirely blank rather than fabricating a placeholder
record/field name, since (unlike a response indicator number or a
generic command key) there's no generic valid value for a menu-bar
record or field name; it has to be a real name from the DSPF being
edited, which only the person filling in the row can supply.

**Pre-existing writer/re-parse characteristic, surfaced (not
introduced) by this task's own test:** once one of several same-named
repeatable instances becomes independently conditioned, round-tripping
through `applyRecordUpdate` + re-parse can change which physical DDS
source line - and therefore which array index - each instance re-parses
back into (a conditioned instance and an unconditioned one don't
serialize to the same kind of source line; see the test's own inline
comment for a worked example). This is true of the pre-existing
record-indicator-instance list this reuses the same primitive from too
- `dspfWebview.test.js`'s own Indicator-tab scenario already matches
instances by content (`k.name === X && k.parameters === Y`) rather than
position for exactly this reason - so this is confirmed to be an
established, already-worked-around characteristic of the shared
primitive, not a regression this task introduced. The test below was
initially written assuming positional stability, caught this itself via
a failing assertion, and was corrected to match by content instead.

**Test coverage:** `src/test/i17MnubardspRepeatableInstances.test.js`
renders the real generated webview in jsdom and covers: empty state on a
fresh record; adding a blank instance that survives re-render; the
3-name row rendering and committing correctly on a non-MNUBAR record
(trailing blank dropped); a second, independently-conditioned instance
coexisting with the first without disturbing it; conditioning one
instance leaving the other's conditioning untouched; removing one
instance (matched by content, per the ordering note above) leaving the
other intact with its conditioning preserved; and the MNUBAR-record's
own single-pull-down-field shape rendering correctly (no rec/choice
inputs) on a second record in the same file, with that record's own
`MNUBAR`/field-level `MNUBARCHC` keywords confirmed untouched throughout.

### I-18 — `MNUBARSW`/`MNUCNL` mutual CA-key exclusion guard

**Scope:** IBM's own DDS Reference states this both ways: under
`MNUBARSW`, "the CAnn key specified by the MNUBARSW keyword cannot be
specified again using another keyword (such as MNUCNL)"; under
`MNUCNL`, the mirror statement naming `MNUBARSW`. Nothing in
`menuBarKeysPanelHtml`/`wireMenuBarKeysPanel` (shared between the
file-level Menu-bar panel and this record-level MNUBAR panel) stops a
person from assigning the same CAnn to both today. Needs a hard-block
guard analogous in shape to L81's `dftGroupConflictReason` or I-11's
`sflNxtchgSflMsgRcdConflictReason` — likely wired into both keywords'
own CA-key input's `change` handler, checked against whichever CAnn is
currently set on the other.

**Scope question resolved:** re-reading both keywords' full sections
confirms the check DOES need to span both the file-level and
record-level copies at once, not just the same-record case — both
sections say the file-level form "extends to all records in the file,
this must be considered when assigning a CAnn key".

**Fixed (0.10.96):** added `DspfWriter.mnuBarKeyConflictReason(keywordName,
cakey, fileKeywords, recordScopes)` — `recordScopes` is an array of
keyword-arrays so one function covers every scope combination: a
record-level edit passes `[thatRecord'sOwnKeywords]` (record-level
values don't propagate to OTHER records — only the file-level form
does); a file-level edit passes every record's own keywords (a
file-level assignment reaches all of them). Blank CA-key boxes correctly
resolve to each keyword's own documented default (`CA10` for MNUBARSW,
`CA12` for MNUCNL) before comparing, since a blank box still means a
real, active CA key once the keyword itself is present — not "no CA
key". Wired into both the file-level ('fk') and record-level (MNUBAR
tab) copies of `wireMenuBarKeysPanel`, threading a new
`getFileKeywords`/`getRecordScopes` pair through (same optional-param
convention `wireRecordKeywordsPanels`/`wireSflCtlPanels` already use
elsewhere in this file) — the file-level caller supplies
`getModel().records.map(r => r.keywords)` for `getRecordScopes` (already
had a `getModel` accessor from Task S36E's own guard, reused here) and
its own `getKeywords` doubles as `getFileKeywords`; the record-level
(MNUBAR) caller now takes a new `getFileKeywords` parameter (threaded
from `buildWebviewTemplate.js`'s `model.fileKeywords`) and supplies
`[getKeywords()]` for `getRecordScopes`. Same alert+revert idiom as
I-8/I-11/I-12/I-13 — turning either keyword off, or choosing a
non-colliding CA key, is never blocked.

**Test coverage:** full DOM-level test (`i18MnubarKeyConflictAudit.test.js`)
exercising all four scope combinations: same-level (file-vs-file),
file-extends-to-record (both directions), and same-record.

### I-19 — `MNUBAR` field-shape structural constraint

**Scope:** IBM's own DDS Reference, under `MNUBAR` itself: "A record
with the MNUBAR keyword specified must contain one and only one menu
bar field (a field with one or more MNUBARCHC keywords), and cannot
contain any displayable fields other than the menu bar field." This is
a record-composition rule, not a keyword-conditioning or parameter gap,
so it falls outside I-7 through I-14's 4-dimension keyword-audit method
entirely — it's a new kind of check (validating a record's field list
against a keyword it carries) rather than a keyword-level fix.

**Fixed (0.10.97):** confirmed, before writing any new guard, that
iSDA's field-adding UI does NOT already structurally prevent adding a
second displayable field to a MNUBAR record - the "+ Field"/click-to-place
flow has no record-type awareness at all (unlike the record-creation
wizard, which never puts a second field on a fresh MNUBAR record in the
first place - `MNUBAR`'s own `buildTypedRecordPlan` entry has an empty
`extraFields`). So the gap was real: a person could freely add extra
displayable fields, or a second MNUBARCHC field, to an existing MNUBAR
record with nothing flagging it.

New `DspfWriter.mnubarFieldShapeNote(fields)` (pure, read-only) checks a
record's field list against MNUBAR's own two-part structural rule and
returns a single message naming whichever half is violated (or both at
once), or `null` when compliant. Two scope decisions worth calling out:

- Identifying "the menu-bar field" itself counts BOTH real fields and
  constants carrying `MNUBARCHC` - this codebase already lets
  `MNUBARCHC`/`MNUBARSEP` be added to a constant (see dspfWebview.test.js's
  D4 scenario, predating this task), so treating only named fields as
  eligible would have wrongly flagged that already-working, already-
  tested shape as non-compliant on every render.
- The "no other displayable fields" half, by contrast, is read at the
  Reference's own precise word - real fields only, not constants - since
  the Reference's own text says "fields". Hidden (H) and program-to-
  system (P) usage fields are excluded from the "displayable" count too,
  matching MNUBARCHC's own return-field/`&field-name` choice-text forms
  (both legitimately coexist with the one menu-bar field).

Per the plan-doc's own scope question and the L83 precedent it named,
this is an ADVISORY note (a `.hint-small.warn` line under the MNUBAR
tab's `MNUBARCHC` picker), not a hard block - the rule spans the whole
record's field list rather than one keyword on the object already open
in the panel, and there's no single reachable on-transition to
intercept the way a flag-keyword conflict has; the note is simply
recomputed from the record's current field list on every render (same
shape as L83's own `dftOutputRequirementNote`). `mnuBarPanelsHtml` gained
a `fields` parameter (threaded from `buildWebviewTemplate.js`'s call
site via `rec.fields`, which every other tab already reads) purely to
compute this note - no new keyword plumbing, no wiring, no guarded
commit().

**Test coverage:** `src/test/i19MnubarFieldShapeNote.test.js`. Unit-level:
`mnubarFieldShapeNote` called directly with hand-built field arrays -
a single clean menu-bar field (null); a hidden return-field alongside it
(still null); a program-to-system choice-text field alongside it (still
null); no MNUBARCHC field at all (note naming the gap); two MNUBARCHC-
bearing fields (note naming both); an extra displayable field alongside
a clean menu-bar field (note naming it); an extra CONSTANT alongside a
clean menu-bar field (null - constants aren't "fields"); a MNUBARCHC-
bearing CONSTANT alone satisfying the rule on its own (null); and both
problems firing at once, both named in one message. DOM-level: a MNUBAR
record with an extra displayable field shows the warning (with the
offending field named) styled via the shared `.warn` class, while an
unrelated non-MNUBAR record in the same file has no MNUBAR tab (and
therefore nothing to warn about) at all. Confirmed (via `git stash`) to
throw a `TypeError` (the function doesn't exist yet) against the pre-fix
code, rather than silently pass.

### I-20 — Repeatable Indicator-instance model isn't kind-aware

Two separate findings converge on the same root cause. **(a)** I-7's own
audit flagged that the repeatable Indicator-instance model (`CLEAR`/
`HOME`/`PAGEDOWN`/`PAGEUP`/`HELP`/`HLPRTN`/`VLDCMDKEY`/`SETOF`/`CHANGE`/
`INDTXT`, one shared component) offers the same uniform Conditioning
toggle for every keyword in the set, even though IBM's own DDS Reference
says option indicators are specifically NOT valid for `VLDCMDKEY`/
`SETOF`/`CHANGE` — a real conditioning-eligibility bug that's stayed
unfixed because the shared component has no per-keyword eligibility
hook. **(b)** I-13's own audit separately found that `CLEAR` is on
`PULLDOWN`'s own 27-keyword forbidden list ("The following keywords
cannot be specified on a record with the PULLDOWN keyword"), but
couldn't wire the same `pulldownConflictReason` guard onto it because
`CLEAR` lives in this same shared, not-kind-aware component rather than
a plain `flagRowHtml` row. Both fixes need the same underlying change:
give the repeatable Indicator-instance component a way to know which
specific keyword (and, for (b), which record type) it's rendering an
instance of, rather than treating all member keywords identically.
Worth doing once, covering both findings, rather than two overlapping
patches.

**Fixed (0.10.101).** Gave the shared component itself the missing
eligibility hook rather than forking a second copy: both
`repeatableConditionedInstancesHtml` and
`wireRepeatableConditionedInstances` (`webviewClientHelpers.js`) now take
an OPTIONAL trailing `isConditionable(inst)` predicate - omitted, it
defaults to "always true" so every OTHER caller (Color & attributes,
Validity check, MOUBTN, SFLMSG/SFLMSGID) is completely unaffected. An
instance the predicate rejects renders no Conditioning toggle at all (a
"Option indicators are not valid for this keyword" hint takes its place)
and a stale `expandedSet` entry for that row can never force its
accordion body open even if some other code path had marked it expanded.

**(a):** `recordIndicatorInstancesHtml`/`wireRecordIndicatorInstances`
now pass `recordIndicatorInstanceIsConditionable`, checking each
instance's `kind` against a new `RECORD_INDICATOR_NO_CONDITIONING_KINDS`
list (`VLDCMDKEY`/`SETOF`/`CHANGE`/`INDTXT` - confirmed, one at a time,
against each keyword's own "Option indicators are not valid for this
keyword" line in `DDS_Keyword_V7r6.txt`; `CLEAR`/`PAGEDOWN`/`PAGEUP`/
`HOME`/`HELP`/`HLPRTN` all instead say "are valid" and keep their
toggle). An instance's own PRE-EXISTING conditions (e.g. read from a
file that already carries invalid conditioning on one of the four, from
before this fix or from some other tool) are left completely untouched -
this only prevents ADDING new conditioning through this UI, the same
"omitted conditions preserves whatever already existed" convention
I-14's own MNUBAR fix established.

**(b):** `wireRecordIndicatorInstances`'s `wirePayload` closure already
has the record's own `keywords` array in scope (its own outer parameter),
which is exactly what `DspfWriter.pulldownConflictReason` needs - its
`guardedUpdate` now also calls `pulldownConflictReason('CLEAR', keywords)`
whenever a kind-switch or resp-edit would leave an instance's `kind` as
`CLEAR`, alerting and reverting the kind select on conflict, same
alert+revert idiom as the S36-4 check right above it in the same
function. The trickier half of (b): the repeatable list's own
`makeDefaultInstance` (used by "+ Add indicator keyword") defaults to
`CLEAR` - simply blocking that default on a PULLDOWN record would make
the Add button look broken (click it, nothing visibly happens beyond an
alert, no row appears), unlike a plain flag checkbox where "blocked"
just means the checkbox reverts and the person picks a different
keyword entirely. Instead, `makeDefaultInstance` now checks
`pulldownConflictReason('CLEAR', keywords)` and silently falls back to a
`HOME` default (not on PULLDOWN's forbidden list) when it fires, keeping
"+ Add always seeds something usable" true for every record type; the
`guardedUpdate` check above still blocks anyone who explicitly re-picks
CLEAR from the kind dropdown afterward. The REVERSE direction (turning
PULLDOWN on while a CLEAR instance already exists somewhere in the
record) needed no new code - `pulldownConflictReason('PULLDOWN', ...)`,
already wired onto PULLDOWN's own checkbox by I-13, scans the record's
WHOLE keyword array for any keyword named `CLEAR` regardless of which UI
wrote it, so it was already catching this case for free.

**Test coverage:** new `src/test/i20RecordIndicatorConditioningAudit.test.js`
- the shared `isConditionable` predicate exercised in isolation with a
synthetic payload shape (both rendering and wiring, including the stale-
`expandedSet` edge case); all ten record-indicator kinds' toggle presence/
absence against the real `recordIndicatorInstancesHtml`/
`wireRecordIndicatorInstances` pair; a mixed-kind list confirming only
the eligible rows show a toggle; a pre-existing (invalid) VLDCMDKEY
conditioning surviving an unrelated resp edit unchanged; a CLEAR→SETOF
kind-switch keeping its inherited conditions; the CLEAR-vs-PULLDOWN
kind-switch block (alert + revert); the "+ Add" HOME-fallback on a
PULLDOWN record; and a plain non-PULLDOWN record confirming CLEAR is
still the default there. Updated the pre-existing "Base Record Keywords
Indicator tab" scenario in `dspfWebview.test.js` (it happened to run on
`PSFCTL`, a record that carries PULLDOWN via the R12 PDNSFLCTL scenario
right above it, and had been exercising CLEAR twice - both now correctly
rejected) to use the HOME fallback and PAGEDOWN instead, plus added a new
check there confirming an explicit CLEAR pick is still blocked with an
alert on that same record. Full suite: 62 test files (58 `ALL CHECKS
PASSED` + 4 legacy `All checks passed.`), zero failures.

### I-21 — `CSRLOC` / record-level `HLPTITLE` missing conditioning

I-7's own audit found both keywords are individually documented by IBM
as eligible for option-indicator conditioning, but the shared
`getFileTwoFieldKeyword`/`getFileQuotedText` primitives these two ride
on don't expose a conditions/toggle parameter the way `flagRowHtml`'s
do — so no Conditioning UI is offered at all for either, a real gap
rather than a deliberate omission. Needs the two shared primitives (and
whichever HTML/wiring call sites use them) extended to carry an optional
conditions parameter, same shape `flagRowHtml`/`wireFlagRow` already
support.

Confirmed against IBM's own DDS Reference: `CSRLOC` is record-level
only, "Option indicators are valid for this keyword. Display size
condition names are not valid." `HLPTITLE` is file-level-or-record-level
with an explicit split: "Option indicators are not valid on a file-level
HLPTITLE keyword. Option indicators are allowed on record-level HLPTITLE
keywords" — so only the record-level HLPTITLE row needed the fix; the
existing file-level row's lack of conditioning was already correct.
`HLPSEQ` (the other keyword riding `getFileTwoFieldKeyword`) is
individually documented as "Option indicators are not valid for this
keyword," so its own call site deliberately doesn't pass the new
conditions parameter.

Fixed both shared primitives:
- `getFileTwoFieldKeyword` now always returns a `conditions` field
  (empty array when there's nothing), matching `getFileFlagKeyword`'s own
  convention. `setFileTwoFieldKeyword` gained an optional trailing
  `conditions` parameter following the same "omit to preserve, pass an
  explicit array (including `[]`) to actually change it" contract
  `setFileFlagKeyword` established — this also fixed a real bug: every
  call here previously rebuilt the keyword with `conditions: []`
  unconditionally, silently dropping any existing conditioning the
  moment either field was edited.
- `getFileQuotedText` itself was left returning a plain string (most of
  its callers — `ALTNAME`, `TEXT`, file-level `HLPTITLE` — only ever want
  the text and are individually documented as NOT eligible for
  conditioning). A new sibling `getFileQuotedTextConditions` reader
  covers the keywords that DO need it. `setFileQuotedText` gained the
  same optional trailing `conditions` parameter and preserve-when-omitted
  fix as `setFileTwoFieldKeyword` above.

Both `recordKeywordsPanelsHtml`'s CSRLOC row (Output tab) and its
record-level HLPTITLE row (Help tab) now render a Conditioning toggle
identical in shape to `flagRowHtml`'s own (reusing `entFldAtrHtml`'s
established hand-rolled-row convention), wired via
`wireFlagRowConditioning`/`wireTwoField`'s own new optional args.

Out-of-scope finding, not fixed here: IBM's own reference documents
record-level `HLPTITLE` as repeatable up to 15 times when every instance
carries option indicators (one indicator/complement pair per help-title
variant — the DDS Reference's own example uses exactly this pattern with
indicators 90/N90). This task's single-instance-plus-toggle fix doesn't
model that repeatable shape; logged as its own follow-on task since it's
the same bigger, separate-scope kind of change I-17 needed for
`MNUBARDSP` — see I-27.

**Done (0.10.98).**

### I-22 — `SFLSIZ`/`SFLPAG`/`SFLLIN` display-size (`*DSx`) conditioning

Confirmed by I-10's own audit as a pre-existing, deliberately-documented
deferral (task A1 already flagged it, not a new find) — these three are
individually documented "Option indicators are not valid... Display
size condition names are valid" (`*DSx`), a genuinely different
conditioning mechanism than every other keyword on the SFLCTL panel
uses. Fixing it properly means rebuilding the Display Layout panel's
current single-instance `getSflDisplayLayout`/`setSflDisplayLayout`
model into a per-`DSPSIZ` one — the same shape L80/L84 already built
for `SFLMSGRCD` — rather than a small conditioning-toggle tweak.
Bigger, separate-scope change, logged as its own task rather than left
as prose in I-10's own section.

**Done (0.10.102):** rebuilt `getSflDisplayLayout`/`setSflDisplayLayout`
in `dspfWriter.js` onto the same `{primary, bySizeName}` shape
`getFileMsgLocLines`/`getSflMsgRcdLines` already use for the identical
mechanism, via two new shared helpers,
`getDisplaySizeConditionedValue`/`setDisplaySizeConditionedValue`
(generic over a single keyword name, so `getSflDisplayLayout` just calls
it three times and assembles `{sflsiz, sflpag, sfllin}`). The old
single-instance version had the exact same silent-data-loss shape L79
found and fixed for `SFLMSGRCD` — `kw.find(...)` only ever picked the
FIRST matching instance, so a file that already had two independently-
conditioned `SFLSIZ`/`SFLPAG`/`SFLLIN` entries (hand-edited DDS) would
show only one and destroy the other on the next edit.

`sflCtlPanelsHtml` now takes a `fileKeywords` parameter (threaded from
`buildWebviewTemplate.js`'s `model.fileKeywords`, same as
`sflMsgPanelsHtml` already does for its own `SFLMSGRCD` rows) purely to
read the file's declared `DSPSIZ` sizes, and renders one extra input row
per keyword per size whenever the file has 2+ sizes declared — real
SDA's own "Define Display Layout" screen
(`docs/sda-reference/screens/record-level/subfile-control-sflctl/
display-layout/`) confirmed as ground truth for this shape (a "Number"
column plus a "Display Size" column per keyword row). `wireSflCtlPanels`
keeps Task L75's own established behavior — editing any ONE of the
Display Layout panel's inputs commits every value currently sitting in
the panel, not just the one that changed — extended rather than
replaced to also read whichever per-size inputs are present.

**Fixed alongside — SFLSIZ's own field-name/display-size mutual
exclusion, from the same DDS Reference paragraph as the conditioning
statement itself:** "You cannot use display size condition names for
this keyword when a program-to-system field is used as a parameter for
it." New `DspfWriter.sflsizConditionedFieldNameConflictReason(value)`
checks whether a size-conditioned SFLSIZ value looks like a field name
(non-numeric) rather than a plain number, and if so blocks it — same
alert+revert idiom as I-8/I-11/I-12/I-13 — while leaving the
unconditioned (primary) slot free to hold either form, since the
restriction is specifically about combining the two mechanisms on the
SAME instance, not a blanket ban on field names.

**Correction found while re-reading the DDS Reference for this task,
fixed in passing:** the old code's own doc comment claimed both
`SFLSIZ` and `SFLPAG` "each accept EITHER a literal number OR a field
name," but `SFLPAG`'s own DDS Reference section documents ONLY
`SFLPAG(number-of-records-to-be-displayed)` — no field-name form
anywhere in its own text — and the real screen confirms this too (a
"Program-to-system field" row appears only under `SFLSIZ`, not under
`SFLPAG`). Corrected `SFLPAG`'s own placeholder text (was "number, or a
field name," now "number") — this was a documentation/UI-hint
inaccuracy only; the field itself was always a plain text box that
never actually restricted what could be typed into it, so no DDS
already written through this UI could have been affected either way.

**Flagged, not fixed this task:** the real "Define Display Layout"
screen also has a "Roll" column alongside "Number"/"Display Size" for
all three keywords, with no corresponding statement found in `SFLSIZ`/
`SFLPAG`/`SFLLIN`'s own DDS Reference sections during this task's own
research pass (`SFLPAG`'s text does discuss `ROLLUP`/`ROLLDOWN`
behavior in prose, but not as a keyword parameter of `SFLSIZ`/`SFLPAG`/
`SFLLIN` themselves). Left alone rather than guessed at, same posture
I-4/I-6/I-10/I-11's own open questions took — logged as **I-29** for a
future task to research properly rather than silently dropped.

**Test coverage:** `src/test/i22SflDisplayLayoutConditioning.test.js` —
confirms the per-size rows render and pre-fill correctly on a two-size
file, that editing one field still commits everything currently in the
panel (Task L75's own behavior, unbroken), that `SFLSIZ`'s primary slot
accepts a field name while its size-conditioned slot is hard-blocked
(alert naming SFLSIZ, revert, DDS unchanged) for the same, that
`SFLPAG`/`SFLLIN` have no such guard on their own per-size inputs, and
that a single-display-size file renders no per-size rows at all and
still commits its primary values normally (no regression) — confirmed
(via `git stash`) to throw against the pre-fix code rather than
silently pass.

### I-23 — Verify the ~9 keywords only *implied* to conflict with `SFLMSGRCD`

I-11's own audit fixed the one keyword (`SFLNXTCHG`) that individually
restates "You cannot specify SFLNXTCHG with the SFLMSGRCD keyword," but
the DDS Reference's own "for all other subfiles" vs. "for message
subfiles" category framing implies roughly 9 more keywords (`CHANGE`,
`CHECK(AB)`/`CHECK(RL)`, `CHGINPDFT`, `INDTXT`, `KEEP`, `LOGINP`,
`LOGOUT`, `SETOF`/`SETOFF`) are equally incompatible with `SFLMSGRCD` on
the same record, without any of them individually restating the
prohibition the way `SFLNXTCHG`'s own page does. Rather than guess
whether all 9 are hard `CRTDSPF` compile errors (vs. merely pointless/
no-effect on a message subfile), this task should verify against
`CRTDSPF` directly or a more authoritative source before deciding
whether to extend `sflNxtchgSflMsgRcdConflictReason`-style guards to any
of them.

Verified each of the 9 keywords' OWN dedicated DDS Reference section
(not just the "for all other subfiles" categorization list they're all
named in) for an individually-restated rule, the same way `SFLNXTCHG`'s
own page restates its prohibition. Also found the categorization list
itself actually has 11 entries, not 9 - `SFLNXTCHG` (already handled)
and `TEXT` were both missed by the original estimate.

- **`LOGINP`/`LOGOUT`** — each has an explicit statement in its OWN
  section: "The IBM i operating system ignores LOGINP/LOGOUT for...
  The record format is a subfile record format for a message subfile."
  This is a documented NO-EFFECT condition, not a compile error, so it
  does not warrant a hard block - but it's real, useful, individually-
  confirmed information, so it gets a new advisory-only note
  (`DspfWriter.loginpLogoutSflMsgRcdIgnoredNote`, non-blocking, same
  precedent as `dftOutputRequirementNote`/`mnubarFieldShapeNote`),
  surfaced on the SFLMSG panel's General tab (the one place both
  `SFLMSGRCD` and `LOGINP`/`LOGOUT` are live-editable on the same
  record) when either keyword is turned on and the record already
  carries `SFLMSGRCD`.
- **`KEEP`** — its own section states "This keyword cannot be specified
  with the following keywords: ALWROL, CLRL, SLNO" - a complete,
  explicit exclusion list that pointedly does NOT include `SFLMSGRCD`.
  If IBM intended a real compile-time conflict here, this is exactly
  where they'd have said so, the same way they did for
  `ALWROL`/`CLRL`/`SLNO`. Ruled out - no guard, no note. (I-9's own
  audit separately found this same `ALWROL`/`CLRL`/`SLNO` exclusion list
  needs its own mutual-exclusion guard, unrelated to `SFLMSGRCD` - see
  I-28.)
- **`TEXT`** — its own section states outright "TEXT is valid for any
  record format or field, except a SFLMSGKEY or SFLPGMQ field" -
  explicitly confirming it's fine at the record level on a message
  subfile; only the two special hidden fields are restricted, and only
  at the field level. Ruled out - no guard, no note.
- **`CHANGE`, `CHECK(AB)`/`CHECK(RL)`, `CHGINPDFT`, `INDTXT`,
  `SETOF`/`SETOFF`** — none of these five has any individual statement
  about `SFLMSGRCD` or message subfiles anywhere in the DDS Reference.
  Each one's own documented mechanism (MDT/response-indicator changes
  from an input-capable field or an input operation for
  `CHANGE`/`CHECK(AB)`/`CHECK(RL)`/`CHGINPDFT`/`SETOF`; pure
  compile-time comment text with no functional effect for `INDTXT`)
  suggests they would be functionally inert on a message-subfile record
  (SFL's own text: "At least one displayable field must be specified...
  unless the subfile is a message subfile" - meaning such a record
  structurally has no input-capable fields to act on), consistent with
  the LOGINP/LOGOUT precedent - but since none of the five individually
  RESTATES that the way LOGINP/LOGOUT do, this task deliberately does
  NOT add a guessed-at guard or note for them, per the task's own
  instruction not to guess. Left exactly as-is.

Net result: no new hard-block guards (none of the 9 - now-confirmed-11 -
keywords carry an individual "cannot specify" statement), and one new
advisory-only note covering the two keywords (`LOGINP`/`LOGOUT`) that DO
have an individually-documented, decisive finding.

**Done (0.10.103).**

### I-24 — `WINDOW` cannot be specified for the record named by file-level `PASSRCD`

I-12's own audit found WINDOW's own DDS Reference section also states
"WINDOW cannot be specified for the record format specified by the
PASSRCD keyword" — a cross-reference-by-name check (does record X,
which some file-level `PASSRCD(X)` points at, ever get a WINDOW
keyword) rather than a same-record flag conflict, so it didn't fit
`windowConflictReason`'s existing same-record shape. Needs its own guard
that reads the file-level `PASSRCD` value and checks it against
whichever record is being given `WINDOW`.

**Fixed** (v0.10.99). Added `DspfWriter.passrcdWindowConflictReason(passrcdName, windowRecordName)` — a pure, blank-safe, case-insensitive name-vs-name comparison. Wired at the two reachable on-transitions:
- **`buildWebviewTemplate.js`'s `newRecordBtn` handler** — creating a new `WINDOW`-type record via "+ Add record" whose name matches the file's current `PASSRCD` value is blocked inline (`newRecordError`), same as the wizard's pre-existing duplicate-name check, before `commitSourceChange` ever runs.
- **`webviewClientHelpers.js`'s `wireFileKeywordsPanels`' `fk-passrcd` handler** — retyping file-level `PASSRCD` to name a record that already carries `WINDOW` is blocked with an alert + revert, the same idiom as I-12/I-18's own file-level guards. `getModel` (already threaded into this function) supplies `model.records` to find the target record.

Both directions needed covering because, unlike `WINDOW` itself (only ever written by the record-creation wizard — see `windowConflictReason`'s own doc comment), `PASSRCD` is a plain free-text file-level field a user can retype at any time, and a `WINDOW`-type record's own name is user-chosen at creation (unlike the floating toolbox's auto-named `WDWn` window tool) — so either side of the match can change first.

**Follow-up finding, not implemented here:** the DDS Reference states the identical "cannot be specified for the record format specified by the PASSRCD keyword" restriction for `ALWROL`, `CLRL`, and `SLNO` too — all four keywords' own sections use the same wording. I-24 is scoped to `WINDOW` only.

**Also out of scope:** renaming an *existing* record isn't a reachable third transition for this check — `PASSRCD` isn't one of `renameRecordReferences`' `RECORD_REFERENCE_EXTRACTORS` (`SFLCTL`/`WINDOW`/`MNUBARCHC` only), so renaming a record never rewrites a file-level `PASSRCD` that named its old name. That's a separate, pre-existing gap.

Test: `src/test/i24PassrcdWindowConflictAudit.test.js`.

### I-25 — `KEEP` duplicated across 4 record-type panels — consolidate to one tab

Housekeeping, not a correctness bug (confirmed by I-9's own audit: all 4
panels operate on the same record's underlying `keywords` array, so
they stay in sync regardless). `KEEP` is independently rendered — each
with its own live `flagRowHtml` row — on the base
`recordKeywordsPanelsHtml`, the SFL panel, the SFLMSG panel, and the
SFLCTL panel, unlike `CHGINPDFT`, which an earlier task (R3)
deliberately de-duplicated down to the base tab only. Low priority — a
UI-redundancy cleanup, not a functional fix.

**Fixed (0.10.100).** Removed the SFLMSG/SFL/SFLCTL panels' own
duplicate live `KEEP` rows entirely (`sflMsgPanelsHtml`/
`wireSflMsgPanels`, `sflKeywordsPanelsHtml`/`wireSflKeywordsPanels`,
`sflCtlPanelsHtml`/`wireSflCtlPanels`) — further than R3's own
`CHGINPDFT` precedent went (that one left the SFLMSG panel's own copy
live) — leaving exactly one live `KEEP` control, the base Record
Keywords → General tab, plus a hint on each of the other three panels
pointing back to it. This task's own scope note above named the fourth
duplicate panel as "WINDOW/PULLDOWN" — checked against the actual code
while fixing this and confirmed inaccurate: `windowPanelsHtml`/
`pulldownPanelsHtml` never had their own `KEEP` row at all (WINDOW/
PULLDOWN records reach the base General tab the same way every other
record type does, with nothing extra to de-dup there); the real fourth
copy was `SFLCTL`'s own panel. Corrected here rather than carried
forward.

**Found while consolidating, not this task's own fix — logged
separately:** the base panel's own `KEEP` row still offers a
Conditioning toggle despite the DDS Reference stating option and
response indicators are not valid for this keyword (I-9 already found
and fixed this on the SFL/SFLCTL copies, but the base copy — now the
sole survivor — never got it). Left as-is per this task's own de-dup-
only scope. **See I-28**, which also fixed a `KEEP`/`ALWROL`/`CLRL`/
`SLNO` mutual-exclusion gap found in the same pass.

**Test coverage:** `src/test/i25KeepConsolidationAudit.test.js` (24
checks) — confirms the base tab is the one surviving live control
across all 4 record shapes, the other 3 panels show the hint and no
checkbox, and editing still commits normally. Updated pre-existing
`KEEP`-dependent assertions in `dspfWebview.test.js`,
`i9SflConditioningAudit.test.js`, `i10SflctlConditioningAudit.test.js`
to match.

### I-26 — Add missing subfile-control selection-list keywords: `SFLSNGCHC`/`SFLMLTCHC`/`SFLSCROLL`

I-15's own audit found `SFLSNGCHC` and `SFLMLTCHC` are entirely absent
from iSDA (never in I-10's own audited SFLCTL scope, confirmed absent
from the codebase), yet each has a genuine `PDNSFLCTL`-specific rule
worth building in from day one rather than retrofitting later: both
keywords' own DDS Reference sections state their `*RSTCSR`/`*NORSTCSR`
default flips to `*RSTCSR` and (for `SFLMLTCHC`) `*NOAUTOSLT`/`*AUTOSLT`
default flips to `*AUTOSLT`, specifically "if the SFL[SNGCHC|MLTCHC]
subfile control record is defined in a pulldown" (i.e. when the same
record also carries `PULLDOWN` via `PDNSFL`) - otherwise the plain,
non-pulldown defaults (`*NORSTCSR`/`*NOAUTOSLT`) apply. Also mutually
exclusive with each other and with `SFLDROP`/`SFLFOLD` per their own
text - worth double-checking against `PUTOVR`'s own restrictions from
the Application Display Programming book while implementing, since the
DDS Reference here explicitly punts there. `SFLSCROLL` (used with
`SFLEND(*SCRBAR)` per that keyword's own section) is a related
field-level companion, not yet checked against IBM's text in detail -
confirm its own shape as part of this task rather than assuming.
`CHCAVAIL`/`CHCUNAVAIL`/`CHCSLT` (the color/attribute keywords these two
lists also use) are NOT in scope here - their generic field-level
choice-color-state widget already exists (`CHOICE_COLOR_STATE_KEYWORDS`
in `dspfWriter.js`, built for menu-bar/pull-down choice fields) and
should just be reused once `SFLSNGCHC`/`SFLMLTCHC` land, not rebuilt.

**Fixed (0.10.107).** Added `SFLSNGCHC`/`SFLMLTCHC` as a single
mutually-exclusive type selector on the SFLCTL "General" tab
(`sflChoiceListPanelHtml`/`wireSflChoiceListPanel`), each with its own
`*RSTCSR`/`*NORSTCSR` and `*SLTIND` sub-controls (`SFLSNGCHC` also gets
its own `*AUTOSLT`/`*NOAUTOSLT`/`*AUTOSLTENH` group; `SFLMLTCHC` gets its
own optional `&number-selected` field-name text input instead) -
`DspfWriter.getSflSngChcKeyword`/`setSflSngChcKeyword`/
`getSflMltChcKeyword`/`setSflMltChcKeyword`. Both the `RSTCSR` and
(`SFLSNGCHC`-only) `AUTOSLT` dropdowns show the context-dependent default
as live hint text in their own "(default)" option, computed from
`isPulldownRecord` - the explicit non-default value is still writable
either way, never silently guessed. `DspfWriter.
sflChoiceListConflictReason` hard-blocks (alert + revert) either keyword
from being turned on while `SFLDROP`/`SFLFOLD` is present (the type
selector's own switch between `SFLSNGCHC`/`SFLMLTCHC` is exempted from
its own mutual-exclusion check, since the selector already enforces that
by construction). `SFLSCROLL` was added to the existing field-level
Subfile Keywords panel alongside `SFLRCDNBR`/`SFLROLVAL`
(`subfileFieldKeywordsHtml`/`wireSubfileFieldKeywords`) - confirmed its
actual shape is a plain flag on a hidden numeric field (not tied to
`SFLEND(*SCRBAR)` the way this write-up originally guessed); `DspfWriter.
sflScrollFieldConflictReason` hard-blocks it from sharing a field with
`SFLROLVAL`/`SFLRCDNBR`, and separately enforces the DDS Reference's
"only one `SFLSCROLL` per record" rule across every other field in the
same record (`wireSubfileFieldKeywords` now takes the sibling fields'
own keywords for this). `CHCAVAIL`/`CHCUNAVAIL`/`CHCSLT` were left
untouched, as planned - the existing `CHOICE_COLOR_STATE_KEYWORDS`
primitive already works unmodified against any keywords array,
including an SFLCTL record's own. Correction found along the way: this
write-up's own parenthetical above had the `AUTOSLT` default-flip
attributed to `SFLMLTCHC` - the DDS Reference actually places that whole
group on `SFLSNGCHC` only; `SFLMLTCHC` has no `AUTOSLT` group at all.
`PUTOVR`'s own restrictions (flagged above as worth double-checking) were
not found to add anything beyond what's already covered by the
`SFLDROP`/`SFLFOLD`/other-choice-type mutual exclusion implemented here.
See `i26SflChoiceListAudit.test.js` (24 checks).

### I-27 — Record-level `HLPTITLE` repeatable-conditioned-instance model (up to 15/record)

I-21's own audit found IBM's DDS Reference documents record-level
`HLPTITLE` as repeatable up to 15 times on one record, but ONLY when
every instance carries option indicators (each one conditioned, an
indicator/complement pair being the reference's own worked example -
indicators 90/N90 selecting between two title variants). At run time the
first `HLPTITLE` in effect wins; an unconditioned record-level
`HLPTITLE` is still valid but then must be the record's only one.
I-21's own fix added a Conditioning toggle to the existing single-
instance row (`getFileQuotedText`/`setFileQuotedText` now carry a
`conditions` parameter), which correctly lets ONE record-level HLPTITLE
be conditioned, but doesn't model the repeatable multi-instance shape at
all - a second HLPTITLE on the same record still can't be added through
the UI. Rebuilding this into a genuine repeatable-instance list (the
same generic primitive `DspfWriter.getRepeatableKeywordInstances`/
`setRepeatableKeywordInstances` Task I-17 already built for `MNUBARDSP`,
which this task should reuse rather than one-off) is bigger, separate
scope from I-21's own shared-primitive fix - logged as its own task
rather than left unfinished inside I-21.

**Fixed (0.10.105).** Rebuilt record-level `HLPTITLE` as a genuine
repeatable, independently-conditioned instance list -
`hlptitleInstanceRowHtml`/`hlptitlePanelHtml`/`wireHlptitlePanel` in
`webviewClientHelpers.js`, reusing the same generic
`DspfWriter.getRepeatableKeywordInstances`/`setRepeatableKeywordInstances`
primitive Task I-17 built for `MNUBARDSP` (and the same
`repeatableConditionedInstancesHtml`/`wireRepeatableConditionedInstances`
UI primitive Task I-20 made kind-aware) - HLPTITLE needed no bespoke
get/set pair of its own since, unlike MNUBARDSP, it's a single plain
quoted-text parameter with no per-record-type shape variation to thread
through. Each instance's own text round-trips through
`quoteDdsLiteral`/`unquoteDdsLiteral` (the same quoting
`getFileQuotedText`/`setFileQuotedText` already used), so an embedded
single quote is doubled correctly. `makeDefaultInstance` seeds a
non-blank placeholder (`'Help title'`) rather than blank text - HLPTITLE's
own DDS format (`HLPTITLE('text')`) requires a quoted-string argument, so
a genuinely blank instance would serialize as bare `HLPTITLE` with no
parens at all (invalid), the same reasoning I-20's own
`recordIndicatorInstancesHtml` makeDefaultInstance already established
for `CLEAR`'s non-blank placeholder resp.

Like I-17's own MNUBARDSP panel, this only models the repeatable LIST
mechanically - it does NOT hard-enforce "all instances must carry option
indicators once there's more than one" or "an unconditioned instance
must be the record's only one"; both are surfaced instead as a
non-blocking hint below the list.

**A real ordering quirk surfaced while writing tests, NOT a bug in this
fix:** `serializeRecordEntry` (the general record-to-DDS-lines writer,
predating this task and shared by every repeatable-instance panel) always
groups a record's unconditioned keywords before its conditioned ones when
serializing. So adding a second, still-unconditioned, HLPTITLE instance
to a record that already has a conditioned one re-renders the fresh
instance at an EARLIER list index than the existing conditioned one after
the write-then-reparse round trip - not simply appended after it. This is
pre-existing, general behavior (equally true for MNUBARDSP and
record-indicator instances), not something to fix here; the test suite
below accounts for it rather than assuming stable positional indices once
any conditioning exists among a list's instances.

**Test coverage:** new `src/test/i27HlptitleRepeatableInstances.test.js` -
empty state, reading an existing instance, `+ Add`'s non-blank
placeholder, the quote-escaping round-trip (including an embedded single
quote), IBM's own 90/N90 worked example (two independently-conditioned
instances, editing one leaves the other's text and conditioning
untouched), and removing one instance leaving the other (plus an
unrelated keyword) alone. Updated the pre-existing "Base Record Keywords
Help tab" scenario in `dspfWebview.test.js` (previously exercising I-21's
single-instance row) to exercise the new repeatable list instead,
including the ordering quirk above. Full suite: 63 test files, zero
failures.

### I-28 — Base Record Keywords panel's `KEEP` row still offers a Conditioning toggle; `KEEP`/`ALWROL`/`CLRL`/`SLNO` mutual exclusion

Found auditing the base Record Keywords panel after I-25's consolidation
(see that task's own note pointing here): `KEEP`'s own DDS Reference
section states "Option and response indicators are not valid for this
keyword" - I-9 already fixed this on the SFL/SFLCTL copies, but never on
the base copy, which is now the sole surviving live copy after I-25's
de-dup. Fixed in `recordKeywordsPanelsHtml` (build side, `undefined,
undefined` in place of `fKeep.conditions, expandedSet`, matching
INZRCD/ASSUME/ALWROL's own shape) and the matching wire side (new
`wireKeepGuardedFlag`, replacing the old plain `simple(p + '-keep',
'KEEP')`).

Also confirmed by the DDS Reference - and cross-verified by each of
`ALWROL`/`CLRL`/`SLNO`'s own sections individually restating it, same
method I-23 used for `SFLMSGRCD` (see that task's own write-up above,
which separately ruled OUT a `KEEP`/`SFLMSGRCD` conflict for the exact
same reason this one IS real: `KEEP`'s own exclusion list explicitly
names `ALWROL`/`CLRL`/`SLNO` and pointedly does not name `SFLMSGRCD`):
`KEEP` cannot be specified with `ALWROL`, `CLRL`, or `SLNO` on the same
record format. New `DspfWriter.keepMutexConflictReason(keywordName,
recordKeywords)` - a pure, order-independent primitive (like
`usrdfnConflictReason`/`pulldownConflictReason`) that works no matter
which side of a conflicting pair is toggled on first. Wired at all four
toggle points: `wireKeepGuardedFlag` for `KEEP` itself, and a new
`alsoCheckKeep` param on both `wireUsrdfnGuardedFlag` (for `ALWROL`,
alongside its existing `alsoCheckWindow`) and `wirePulldownGuardedFlag`
(for `SLNO`/`CLRL`) - added narrowly to just those specific call sites
rather than blanket-applied, since none of `ASSUME`/`HLPCMDKEY`/the rest
of `wirePulldownGuardedFlag`'s other callers are on `KEEP`'s own
exclusion list.

**Out of scope, flagged as a follow-up finding:** `ALWROL`/`CLRL`/`SLNO`
are each ALSO individually incompatible with `ASSUME`/`SFL`/`SFLCTL`/
`USRDFN` (their own sections' restated lists go well beyond `KEEP`) - a
broader web of restrictions than this task's own `KEEP`-scoped title
covers, not implemented here.

**A process note, not a code finding:** while investigating this task I
spent a long stretch chasing what looked like a pre-existing 12-check
regression across `i25KeepConsolidationAudit.test.js` and
`dspfWebview.test.js` after rebasing onto a newer `origin/main`. It
turned out to be self-inflicted: `npm run build:webview-assets` alone
regenerates `src/webviewTemplate.ts` but NOT `dist/webviewTemplate.js`
(the compiled file the jsdom tests actually `require()`) - that needs the
full `npm run compile` (`build:webview-assets` + `tsc`). Running only the
former left every test run in this session working against a stale
`dist/webviewTemplate.js` from earlier in the day. Full `npm run compile`
resolved it immediately - zero pre-existing failures once compiled
properly. No code change resulted from this; noting it here so the next
session doesn't lose the same time to it.

**Test coverage:** new
`src/test/i28KeepConditioningAndMutexAudit.test.js` - `KEEP`'s row has no
Conditioning toggle on an ordinary record; `ALWROL`/`CLRL`/`SLNO` are
each individually blocked (alert + revert, no edit posted) from being
turned on when `KEEP` is already present; `KEEP` is blocked the other
direction when `ALWROL` is already present; and `KEEP` still commits
normally on a record with none of the other three present (no
regression). Full suite: 64 test files, zero failures.

### I-29 — Research the "Roll" column on real SDA's own "Define Display Layout" screen for `SFLSIZ`/`SFLPAG`/`SFLLIN`

I-22's own audit found real SDA's own "Define Display Layout" screen
(`docs/sda-reference/screens/record-level/subfile-control-sflctl/
display-layout/`) shows a "Roll" column alongside "Number"/"Display
Size" for all three of `SFLSIZ`/`SFLPAG`/`SFLLIN`, with no corresponding
statement found anywhere in any of the three's own DDS Reference
sections during that task's own research pass (`SFLPAG`'s own text does
discuss `ROLLUP`/`ROLLDOWN` runtime behavior in prose - see its own
"Subfile page equals subfile size" note - but never as a documented
keyword parameter of `SFLSIZ`/`SFLPAG`/`SFLLIN` themselves). Left alone
rather than guessed at, same posture I-4/I-6/I-10/I-11's own open
questions took - this needs either a `CRTDSPF`-against-real-i-series
test or a more authoritative source before deciding whether it's a real
missing keyword-parameter gap or something else the real screen surfaces
(e.g. a cross-reference into `SFLROLVAL`, which sits on a different
panel entirely).

Found the "more authoritative source" this task asked for: IBM's own
Screen Design Aid manual (SC09-2604-00, *ADTS/400: Screen Design Aid*),
not the DDS Reference - the DDS Reference documents DDS keyword syntax,
not SDA's own terminal UI mechanics, which is exactly why searching only
the DDS Reference (I-22's own pass) came up empty. That manual's
"Considerations for Using SDA Displays" section states outright: "When
duplicate keywords (such as `INDTXT`) are allowed, scroll through those
keywords by typing + or – in the More/Roll prompt for the keyword."

This is decisive. The "Roll" column isn't a hidden/undocumented DDS
keyword parameter of `SFLSIZ`/`SFLPAG`/`SFLLIN` at all - it's SDA's own
generic, product-wide navigation widget for any keyword the DDS
Reference allows to be specified more than once on the same record
(a "duplicate keyword," the manual's own term, `INDTXT` being its
example). `SFLSIZ`/`SFLPAG`/`SFLLIN` qualify as duplicate keywords for
exactly the reason I-22 already built for: each can legitimately appear
once per `DSPSIZ` display-size condition name (`*DS2`, `*DS3`, ...).
On a real 24x80 (or 27x132) terminal, only one occurrence's Number/
Display Size fits on the visible row at a time, so SDA lets the user
"roll" (+ / –) between which display-size's occurrence they're currently
viewing or editing - a physical-screen-real-estate affordance, not
DDS-level behavior.

I-22's own fix already solved the identical underlying problem (multiple
`SFLSIZ`/`SFLPAG`/`SFLLIN` instances, one per display size) with a
different UI: a separate, simultaneously-visible input row per declared
`DSPSIZ` size, rather than one row the user rolls through. That's not a
gap relative to real SDA - it's the natural modern-GUI equivalent of the
same feature, arguably an improvement (every instance visible at once
instead of paged one-at-a-time through a fixed-width terminal line). No
missing keyword parameter, no code change needed.

**Done - confirmed independent (0.10.104).**

---

## Field-level audit (I-30 through I-35) — same 4-dimension method, per field kind/usage

I-1 through I-29 covered file-level and record-level keywords. Field
level needs its own shape again, for a different reason than record
level did: IBM's own DDS Reference splits field-level rules along **two
independent axes**, not one.

**Axis 1 — field kind.** A field is either an unnamed **constant**
(literal text — IBM's own text is explicit: "Make no entry in this
position for a constant (unnamed) field", i.e. constants don't even
carry a Usage code), a **named field**, or a **menu-bar choice field**
(`SNGCHCFLD`/`MLTCHCFLD`) — the last is iSDA's own distinct field kind,
with its own screenshot category
(`docs/sda-reference/screens/field-level/menu-bar-choice`) and panel
code, sitting alongside `character`/`constant`/`numeric` as a sibling,
not a variant of either.

**Axis 2 — Usage (DDS position 38), named fields only.** IBM's Reference
(`docs/sda-reference/source/DDS_Keyword_V7r6.txt`, "Usage for display
files (position 38)" — search that exact heading) documents six values,
each with a materially different valid-keyword set: **O** (output only,
the blank default), **I** (input only), **B** (both), **H** (hidden —
no location, not input/output-capable despite carrying data), **M**
(message — output-only, and IBM restricts it to exactly `ALIAS`/
`INDTXT`/`OVRDTA`/`REFFLD`/`TEXT`, nothing else), and **P**
(program-to-system — output-only, invisible, restricted to `ALIAS`/
`TEXT` plus being named as a parameter on a fixed list of other
keywords: `CHCACCEL`/`CHCCTL`/`CHKMSGID`/`CHOICE`/`ERRMSGID`/`GRDATR`/
`GRDBOX`/`GRDCLR`/`GRDLIN`/`HTML`/`MNUBARCHC`/`MSGID`/`PSHBTNCHC`/
`SFLCHCCTL`/`SFLMSGID`/`SFLSIZ`/`WDWTITLE`/`WINDOW`). iSDA's own
`fieldKeywordCategoryVisibility()` (`src/webviewClientHelpers.js`)
already models an O/I/B/H split for its 8 keyword categories (Colors/
Display Attributes, Keying Options, Validity Check, Input Keywords,
General Keywords, Database Reference, Error Messages, Message ID,
Editing Keywords) matching real SDA's own "For Field Type" column — but
by its own comment, **fails open (shows every category) for M and P**,
since "SDA's own table never covers them." Whether that's actually
correct given IBM's tiny fixed keyword lists above, or a real gap, is
exactly what I-35 checks.

**Ground truth for scope, not for correctness** — same caveat as
record-level's own intro: `docs/sda-reference/screens/field-level/`'s
four subdirectories (`character`, `numeric`, `constant`, `menu-bar-
choice`) and `KEYWORD-INDEX.json`'s `field` level tell you *where to
look*, not that what's there is already correct. Read each keyword's own
opening statement in the DDS Reference; don't infer from a category
label.

**Data types NOT getting their own task** — Date (`L`)/Time (`T`)/
Timestamp (`Z`) are numeric-adjacent but have their own narrower Usage
rule (IBM's text above: "Valid field usage (DDS position 38) can be O,
B, or I" for these three specifically — no H/M/P at all) and their own
keywords (`DATFMT`/`DATSEP`/`TIMFMT`/`TIMSEP`). Rather than a 7th task,
this is folded into **I-31 (Numeric)** as a named sub-check, since
`isNumericField` in the current code already groups L/T/Z alongside
S/Y/B/P/F as one "numeric-ish" bucket for shift-value purposes — I-31
should confirm whether that's the right grouping for keyword purposes
too, or whether L/T/Z need splitting out once the audit is actually
underway.

**System-value constants NOT getting their own task** — `DATE`/`TIME`/
`USER`/`SYSNAME` (`src/buildWebviewTemplate.js`'s
`SYSTEM_VALUE_KEYWORD_NAMES`) are a UI convenience for populating a
constant field's literal text with one of DDS's own recognized special
values, not a distinct field kind with its own keyword set — folded into
**I-33 (Constant fields)**. (I-33 itself found a fifth member of this
list, `PAGNBR`, was never a real DDS keyword at all — see I-33's own
section below.)

| Task | Field kind / Usage | Depends on | Status |
|------|---------------------|------------|--------|
| **I-30** | Character fields (base set: Colors, Display Attributes, Keying Options, Validity Check, Input Keywords, General Keywords, Database Reference, Error Messages, Message ID — `fieldKeywordCategoryVisibility()`'s O/I/B/H gate itself) | I-1 (method) | done (0.10.109) |
| **I-31** | Numeric fields (adds Editing Keywords; narrows Validity Check for float per existing code; confirms/splits the Date/Time/Timestamp (L/T/Z) grouping) | I-30 | done (0.10.113) |
| **I-32** | Date/Time/Timestamp fields (L/T/Z) — narrower O/B/I-only Usage; `DATFMT`/`DATSEP`/`TIMFMT`/`TIMSEP` | I-31 | done (0.10.114) |
| **I-33** | Constant fields, including the system-value sub-form (`DATE`/`TIME`/`USER`/`SYSNAME`/`MSGCON`) | I-1 (method) | done (0.10.110) |
| **I-34** | Menu-bar choice fields (`SNGCHCFLD`/`MLTCHCFLD`) | I-1 (method) | done (0.10.112) |
| **I-35** | Usage `M` (Message) and `P` (Program-to-system) — verify iSDA's fail-open behavior against IBM's fixed keyword lists above | I-30 | fixed (v0.10.115) |

### I-30 — Character fields (base set)

Full 4-dimension audit of `fieldKeywordCategoryVisibility()`'s 8 base
character-field categories (Colors, Display Attributes, Keying Options,
Validity Check, Input Keywords, General Keywords, Database Reference,
Error Messages, Message ID - Editing Keywords is numeric-only, out of
this task's scope, see I-31) against each keyword's own opening
statement in `docs/sda-reference/source/DDS_Keyword_V7r6.txt`.

**Done (0.10.109).**

**Conditioning-eligibility bugs found and fixed** (the dominant finding
this task turned up - every one of these had a Conditioning toggle
offered somewhere IBM's own text says "Option indicators are not valid
for this keyword", or offered it more broadly than IBM's own partial
exception allows):

- **`CHECK`** (shared between Keying Options and Validity Check - both
  panels write the same underlying repeatable `CHECK(...)` instances):
  IBM states plainly *"Option indicators are valid only for CHECK(ER)
  and CHECK(ME)"* - the other eleven codes (`VNE`/`VN`/`AB`/`M10`/
  `M10F`/`M11`/`M11F`/`MF`/`FE`/`RB`/`RZ`/`RL`/`LC`) never allowed
  conditioning at all, and mixing an ER/ME code with any other code
  doesn't get a pass either - IBM names only the bare `CHECK(ER)`/
  `CHECK(ME)` forms, not combinations. Fixed via a new
  `checkInstanceIsConditionable(inst)` predicate (conditionable only
  when the instance's parsed code set is a non-empty subset of exactly
  `{ER, ME}`), wired into both `checkInstancesHtml`/
  `wireCheckInstancesEditor` - the one shared implementation both
  Keying Options and Validity Check call through.
- **`RANGE`/`COMP`/`VALUES`** (Validity Check): each has its own,
  separately-stated *"Option indicators are not valid for this
  keyword"* - all three were offering conditioning unconditionally.
  The cleanest fix of the bunch: no partial exception to model, so
  `validityCheckInstancesHtml`/`wireValidityCheckInstances` now always
  pass `isConditionable: function() { return false; }`.
- **`DSPATR`** (Colors & Attributes, sharing one combined COLOR+DSPATR
  card/condition-set per state with `colorAttrStatesHtml`): IBM - valid
  *"except when the attributes OID or SP are the only display
  attributes specified."* COLOR's own conditioning is unconditionally
  valid, always, which collides with DSPATR's partial exception since
  both keywords write from ONE shared `{color, attrs, conditions}`
  state in this UI (`DspfWriter.getColorAttrStates`/
  `setColorAttrStates`). Fixed a new `colorAttrStateIsConditionable`
  predicate that blocks the clean case only - attrs non-empty, every
  attr in `{OID, SP}`, AND no color set for that state - since blocking
  a state that ALSO carries a color would wrongly take away COLOR's own
  always-valid conditioning too. **Known, documented remaining edge
  case:** a state combining a color with OID/SP-only attributes still
  offers conditioning (needed for COLOR), which means the resulting
  DSPATR line, if actually conditioned, would technically violate IBM's
  rule in that one narrow combination - splitting COLOR's and DSPATR's
  own condition sets apart cleanly would need a bigger data-model
  change than this task's own scope; flagged rather than silently
  declared fixed. Covered by its own regression-test case
  (`i30CharacterFieldConditioningAudit.test.js`), which locks in this
  exact boundary rather than papering over it.
- **`BLANKS`/`CHANGE`** (Input Keywords): both "not valid"; `DUP` is
  the one row IBM marks conditionable of the three. Field-level
  `CHANGE` is a wholly separate bug from record-level `CHANGE`, which
  I-20 already correctly gated - this shared `inputKeywordsHtml` row
  list was simply never covered by any earlier conditioning audit
  (I-3 was file-level-only in scope).
- **General Keywords** (`GENERAL_FIELD_KEYWORD_ROWS`, 14 rows total):
  ten of them - `ALIAS`/`INDTXT`/`DFT`/`CNTFLD`/`TEXT`/`FLDCSRPRG`/
  `HLPID`/`CHRID`/`IGCALTTYP`/`NOCCSID` - are each individually "not
  valid" per their own DDS Reference entries; only `DFTVAL`/
  `PUTRETAIN`/`OVRDTA`/`OVRATR` are actually conditionable. All
  fourteen were passing `kw.conditions` straight through unconditionally
  before this fix. Added a 5th `conditionable` element to each row
  tuple and threaded it through both the render side
  (`generalFieldKeywordsHtml`) and both branches of the wire side
  (`wireGeneralFieldKeywordsEditor` - the shared `DFT`/`DFTVAL`
  "DFT_GROUP_KEYS" branch needed its own gate too, since `DFT` and
  `DFTVAL` sit on opposite sides of this fix despite sharing that one
  branch).
- **`DLTCHK`/`DLTEDT`** (Database Reference): both "not valid" -
  `referenceOverridesHtml`/`wireReferenceOverridesEditor` offered
  conditioning unconditionally before this fix.

**Confirmed clean, no fix needed** (checked as part of the same pass):
`COLOR` (always conditionable, matches exactly); `CHGINPDFT` (already
correctly fixed by I-3); `DUP` (correctly conditionable; has one small
unenforced constraint - "not valid on floating-point fields" - logged
below, not fixed); `ERRMSG`/`ERRMSGID` (already correctly conditionable
and repeatable); `REFFLD` (has no Conditioning control at all in its own
UI, correctly - it's a position-29 field-shape editor, not a
`flagRowHtml`/repeatable-instance keyword row, so there was never
anything to gate).

**`KEYBRD` turned out not to be a real DDS keyword at all.** It's
iSDA's own name for the field's data-type column (DDS position 35,
"Data type and keyboard shift") - the exact same underlying value the
Basic tab's own "Data type" dropdown edits. Deliberately implemented
that way (see the code's own hint text: *"Not a keyword - this is the
field's own data type (position 35), the same value the Basic tab's
Data type dropdown edits"*) - confirmed correct, no conditioning concept
even applies to it, since it's a physical field attribute rather than a
conditionable keyword.

**Index-only documentation bugs, not functional code bugs** (the actual
`webviewClientHelpers.js`/`dspfWriter.js` code was already correct in
all three cases - only `docs/sda-reference/keyword-index/build_index.py`
was wrong):
- `DSPATR`'s value list had two values that don't exist anywhere in
  IBM's own reference (`UH`/`RE`) instead of the real `PR`/`OID` - the
  code's own `DSPATR_ATTRS` constant was correct throughout.
- `CNTFLD`'s parameter was described as a field name; it's actually a
  numeric column-width (characters per line) - the code's own
  placeholder text already had this right.
- `DFTVAL` was marked `repeatable=True`, but the code deliberately
  implements it as a single conditionable occurrence (a field needs
  only one default value in practice, even though DDS syntax
  technically permits several) - the index overstated what's actually
  implemented.
- `TEXT` and `HLPID` exist in the code's own row list for every field
  kind but were missing from the index's Character category (`HLPID`
  already existed under the narrower "Constant field additions"
  category; `TEXT` was missing from the index entirely). Both added.

Regenerated `KEYWORD-INDEX.json`/`.md`/`KEYWORD-LOOKUP.json` with these
three corrections folded in alongside the rest of this task.

**Other findings, logged but NOT fixed in this pass** (scoped out to
keep this task bounded - real, well-sourced gaps for a follow-up):
- `CHKMSGID` has no guard ensuring it only appears on a field that also
  carries an actual validity-check keyword - IBM: *"CHKMSGID is allowed
  only on fields which also contain a CHECK(M10), CHECK(M11), CHECK(VN),
  CHECK(VNE), CMP, COMP, RANGE, or VALUES keyword."* Same shape as I-8's
  USRDFN conflict guard, just not implemented here yet.
- `CHRID` is mutually exclusive with `DUP` and invalid on constant/
  numeric/`M`/`H`/`P`-usage fields, per IBM's own text - unenforced.
- `IGCALTTYP` carries a long mutual-exclusion list (AUTO(RAZ)/BLKFOLD/
  several CHECK codes/CMP-COMP variants/DUP/RANGE/VALUES) - a niche
  DBCS feature, likely low priority, unenforced.
- `DUP` is "not valid on a floating-point field (F in position 35)" -
  `inputKeywordsHtml` doesn't currently receive `dataType` at all, so
  enforcing this would need threading it through; minor, deferred.
- `MSGID` has a genuinely unusual, position-dependent conditioning rule
  found while reading its own DDS Reference entry: *"When more than one
  MSGID keyword is specified, option indicators are required on all
  except the last MSGID keyword... Option indicators are not allowed on
  the last (or only) MSGID keyword."* Unlike every other finding above,
  this can't be modeled as a simple per-instance boolean gate - it's a
  MANDATORY requirement on all-but-the-last instance, not an optional
  toggle, and "last" changes as instances are added/removed/reordered.
  Left as a discovered-but-unaddressed gap rather than a rushed partial
  fix; a real UI treatment (likely a validation hint rather than a hard
  block, similar to L83's `dftOutputRequirementNote` pattern) is a
  follow-up task of its own.

**Test coverage:** `src/test/i30CharacterFieldConditioningAudit.test.js`
(55 checks, registered in `package.json`'s `test` script) - covers every
fix above across both the render (toggle presence/absence) and wire
(edits still commit correctly with the Conditioning control hidden)
layers, plus the DSPATR/COLOR documented edge case and three
confirmed-clean spot checks (COLOR, and implicitly CHGINPDFT/DUP via the
Input Keywords test). Verified to fail 34 of its 55 checks against
pre-fix code via `git stash` before this fix was considered valid. Full
suite: 4004/4004 (up from the 3949 baseline by exactly this file's own
55 new checks), `npm run compile` clean.

### I-31 — Numeric fields

**Status: done (0.10.113).**

**Scope recap** — I-30 already covered the 8 categories shared with
character fields (Colors & Attributes, Keying Options, Validity Check,
Input Keywords, General Keywords, Database Reference, Error Messages,
Message ID) via the same shared code paths, so this task's own scope is
what's actually numeric-specific: Editing Keywords, the L/T/Z grouping
question the intro above named, and the L/T/Z Usage sub-check the intro
also named.

**Confirmed clean (no fix needed):**
- `fieldKeywordCategoryVisibility`'s `editingKeywords` gate (`u === 'O'
  || u === 'B'`) and `validityAndErrorMessage`'s float exclusion
  (`isIOB && dataType !== 'F'`) were both already correct from an
  earlier task (D3) — spot-checked against real SDA's own numeric
  "Select Field Keywords" screen
  (`docs/sda-reference/screens/field-level/numeric/_menu/image173.png`,
  which shows "Editing keywords ... Numeric Output or Both" and
  "Validity check ... Input or Both, not float" verbatim) and against
  IBM's own RANGE/COMP/VALUES/CHECK(AB)/CHECK(M10)/CHECK(M11) sections,
  each of which individually states the keyword cannot be specified on
  a floating-point field.
- `EDTCDE`/`EDTWRD`/`EDTMSK` conditioning: each states "Option
  indicators are not valid for this keyword" in the DDS Reference, and
  `editKeywordSectionHtml` never offered a Conditioning toggle for any
  of the three, before or after this task's own fix below.
- L/T/Z grouped alongside S/Y/F under `isNumericField` for
  keyboard-shift-picker purposes (the intro's named question): confirmed
  correct as-is. Real SDA has no separate screen category for date/
  time/timestamp fields at all —
  `docs/sda-reference/screens/field-level` has exactly four
  subdirectories (`character`, `numeric`, `constant`, `menu-bar-
  choice`) — so L/T/Z fields fall under "numeric" for every field-level
  UI purpose in real SDA, including this picker. No split needed.

**Finding 1 (real bug, fixed) — `EDTMSK` could never actually be
written correctly.** `getEditKeyword`/`setEditKeyword`'s old
`EDIT_KEYWORDS` constant (`src/dspfWriter.js`) listed `EDTCDE`,
`EDTWRD`, *and* `EDTMSK` as one mutually-exclusive group, with a single
UI dropdown offering all three as alternatives. But IBM's own `EDTMSK`
section states it *"must also contain the EDTCDE or EDTWRD
keywords"* — it can never stand alone — and separately *"must be usage
I or usage B"*, narrower than `editingKeywords`' own O-or-B category
gate. Treating `EDTMSK` as a third alternative to `EDTCDE`/`EDTWRD`
meant selecting it always silently wiped out whichever of the other two
the field already carried (and vice versa), so this UI could never
actually produce the `EDTCDE`+`EDTMSK` or `EDTWRD`+`EDTMSK` combination
IBM's own text requires — every field that picked "Edit mask" from the
old dropdown would compile with `EDTMSK` alone, which isn't valid DDS
regardless of usage.

Fixed: `EDTMSK` now has its own independent `getEditMask`/`setEditMask`
pair in `dspfWriter.js`, entirely separate from `getEditKeyword`/
`setEditKeyword`'s `EDTCDE`/`EDTWRD` group, plus a new
`editMaskConflictReason(keywords, usage)` guard enforcing both of
`EDTMSK`'s own documented requirements (usage I/B, checked first per
IBM's own statement order; then an `EDTCDE`/`EDTWRD` keyword already
present). `editKeywordSectionHtml`/`wireValidityAndEdit`
(`src/webviewClientHelpers.js`) now render a separate "Edit mask"
input alongside the `EDTCDE`/`EDTWRD` kind selector (which now only
offers those two, not `EDTMSK`) and check `editMaskConflictReason`
against the *pending* post-`setEditKeyword` state at Apply time — so a
same-click "set `EDTCDE` and `EDTMSK` together" on a previously-blank
field is allowed, not incorrectly blocked against stale saved state.
Blocked attempts alert with the specific reason and revert both inputs,
matching this project's established alert+revert guard convention
(e.g. L82's `DFT`/`DFTVAL` vs. `EDTCDE`/`EDTWRD` guard, which this fix
sits right alongside and doesn't disturb).

**Finding 2 (real bug, fixed) — L/T/Z's own narrower Usage restriction
(the intro's other named sub-check) was entirely unenforced.** IBM's
DDS Reference, right after Date/Time/Timestamp's own field-length
rules: *"Valid field usage (DDS position 38) can be O, B, or I"* — no
H (Hidden), M (Message text), or P (Program-to-system) at all, unlike
every numeric/character data type, all of which allow the full
H/I/O/B/M/P set. The Basic tab's Usage dropdown offered all six values
unconditionally regardless of data type, so a field could be set to
`L`/`T`/`Z` with usage `H`/`M`/`P` and iSDA would happily write it out —
invalid DDS a real `CRTDSPF` compile would reject.

Fixed: new `DspfWriter.dateTimeUsageConflictReason(dataType, usage)`
(returns null for every non-L/T/Z data type, so it's a no-op for
numeric/character fields), checked in the Basic tab's `p-apply` click
handler before `commitEdit` — blocks the commit with an alert naming
the restriction, rather than reverting the selects, matching this
panel's own existing "click Apply again after fixing" posture (e.g.
the incomplete-`SFLMSGID` case a few tasks back also just skips the
commit rather than reverting).

**Finding 3 (dead code, removed) — `isNumericField`'s `dataType ===
'B'`/`'P'` arms could never match anything.** IBM's own "Data type and
keyboard shift for display files (position 35)" table has no `B` or
`P` row at all, and the Basic tab's own Data type dropdown (the only
place `field.dataType` is ever written) only ever offers `''`, `A`,
`X`, `N`, `S`, `Y`, `I`, `D`, `M`, `F`, `L`, `T`, `Z` — so `dataType`
can never equal `'B'` or `'P'` in practice. Both dead arms removed from
`isNumericField`'s condition in `webviewClientHelpers.js`; behavior is
unchanged for every value that can actually occur.

**Not fixed here (out of scope, logged per this project's own
convention):** `EDTCDE`'s optional second parameter (`*` or a floating
currency symbol, appended after the edit-code letter — real SDA's own
"Select Editing Keywords" screen,
`docs/sda-reference/screens/field-level/numeric/editing-keywords/image182.png`,
shows it as a distinct "Replace leading zeros with" prompt) is reachable
in the current UI only as free text typed into the same parameters box
as the edit-code letter itself, not as a dedicated widget. Since the
field is a plain text input, nothing is actually blocked — a user can
still type e.g. `J*` — so this is a discoverability/UX gap, not a
correctness bug, and was left as-is rather than building a second
sub-control for it.

**Tests:** `src/test/i31NumericFieldConditioningAudit.test.js` (new,
33+11 checks) covers `fieldKeywordCategoryVisibility`'s
`editingKeywords`/`validityAndErrorMessage` gates, the `EDTCDE`/
`EDTWRD`/`EDTMSK` conditioning confirmation, the `EDTMSK` split
(`getEditMask`/`setEditMask`/`editMaskConflictReason`, both via the
rendered HTML and directly against `DspfWriter`), the keyboard-shift
picker's numeric vs. character value lists (including the now-dead
`B`/`P` letters falling back to the character list, same as any other
unrecognized value), and `dateTimeUsageConflictReason`'s full O/B/I-
accepted vs. H/M/P-rejected matrix for `L`/`T`/`Z`, confirming it's a
no-op for every other data type. `dspfWebview.test.js`'s "Numeric field
picker (Task D3)" scenario was extended end-to-end: the `AMT` sub-
scenario now demonstrates `EDTMSK` blocked on a usage-O field and then
committing correctly (`EDTCDE`+`EDTMSK` together, same click) once
usage is changed to B via the Basic tab's own Apply button; a new
`DATEFLD` (dataType `L`, usage O) field demonstrates the Usage guard
blocking H and accepting B. Full suite: all 69 test files pass
(registered in `package.json`'s `test` script), `npm run compile` and
`tsc --noEmit` both clean.

---

### I-32 — Date/Time/Timestamp fields (`DATFMT`/`DATSEP`/`TIMFMT`/`TIMSEP`)

**Status: done (0.10.114).** (The O/B/I-only Usage sub-check named in
this task's own scope line was already absorbed into I-31's
`DspfWriter.dateTimeUsageConflictReason` — done there. This task's own
scope was `DATFMT`/`DATSEP`/`TIMFMT`/`TIMSEP` themselves.)

**Finding 1 — all four keywords were entirely unexposed anywhere in
the UI.** `DspfEngine.dateFieldLength` already *read* `DATFMT` (for
display-width purposes), but nothing ever let the user *set* it, or
`DATSEP`/`TIMFMT`/`TIMSEP` at all — confirmed by grepping the whole
codebase before starting. Added a "Date format (DATFMT / DATSEP)"
accordion (data type `L` only) and a "Time format (TIMFMT / TIMSEP)"
accordion (data type `T` only) to the field properties panel, gated
purely by `dataType` rather than any `fieldKeywordCategoryVisibility()`
category, since that's the only thing IBM's own text gates either pair
by. New `DspfWriter.getDateFormat`/`setDateFormat`,
`getDateSeparator`/`setDateSeparator`, and the `TIMFMT`/`TIMSEP`
equivalents, sharing a `parseSeparatorParam`/`formatSeparatorParam`
pair for the identical `*JOB | 'separator-char'` grammar both `DATSEP`
and `TIMSEP` use. Confirmed `TIMFMT` has **no `*JOB` value** at all
(unlike `DATFMT`) — its own format table in the DDS Reference lists
only `*HMS`/`*ISO`/`*USA`/`*EUR`/`*JIS`.

**Finding 2 — the fixed-separator conflict rule, enforced at Apply
time.** Both `DATFMT`'s and `TIMFMT`'s own text state a hard
restriction: *"If you specify the \*ISO, \*USA, \*EUR, or \*JIS value,
you cannot specify the DATSEP \[or TIMSEP\] keyword. These \[...\]
formats have fixed separators."* (`DATSEP`'s and `TIMSEP`'s own
mirroring text softens this to "should not," but the primary
`DATFMT`/`TIMFMT` sections state it as "cannot" — treated as enforced
here, matching this project's general posture of blocking DDS a real
`CRTDSPF` compile would reject.) New
`dateSeparatorConflictReason`/`timeSeparatorConflictReason` functions
block the Apply click with an alert and revert the separator dropdown,
same UX pattern I-31's own `dateTimeUsageConflictReason` established
for the L/T/Z Usage guard.

**Finding 3 — a genuine, previously-tested-but-fabricated
record-level/file-level `DATFMT` cascade in
`DspfEngine.dateFieldLength`.** The pre-existing code (and its own
test, `src/test/dspfEngine.test.js`) implemented and asserted a
"field-level keyword, then record-level, then file-level" `DATFMT`
precedence — but `DATFMT` is documented as field-level-only (its own
text opens *"You use this field-level keyword..."*), has exactly one
entry in the whole 15,601-line DDS Reference, and never appears in any
record-level or file-level keyword list — confirmed against the
canonical `KEYWORD-INDEX.json` too, which lists it nowhere at either
level. There is no DDS mechanism that produces a record- or file-level
`DATFMT`, so this fallback could never fire from valid DDS — same "read
the reference before trusting an inherited assumption" lesson as I-2's
`PRTFILE` and I-31's dead `isNumericField` B/P arms, except this one
had a passing (but wrong-premise) test backing it. Simplified
`dateFieldLength` to a field-level-only lookup; rewrote the
now-misleading test scenario to assert the *correct* behavior (a
record-/file-level `DATFMT` keyword, if present via hand-edited source,
is silently ignored — the field falls back to its own `DATFMT` or the
`*ISO` default, never inherits one from its record or file).

**Finding 4 (indexing gap, fixed) — none of the four keywords existed
anywhere in `KEYWORD-INDEX.json`.** Added a new "Date/Time Fields"
field-level category via `build_index.py`, regenerated all three output
files (`KEYWORD-INDEX.json`/`.md`, `KEYWORD-LOOKUP.json`). No
`screenshotDir` set — no dedicated real-SDA screen for either keyword
pair exists anywhere under `docs/sda-reference/screens/`.

**Finding 5 (confirmed real, NOT fixed here — logged for a future
task).** The DDS Reference's own "Reference for display files
(position 29)" section lists `DATFMT`/`DATSEP`/`TIMFMT`/`TIMSEP` (along
with `TEXT`/`ALIAS`/`CCSID`/`FLTPCN`/editing keywords) as attributes a
field is supposed to inherit from its referenced database field via
`REF`/`REFFLD`. iSDA's own `REF`-resolution flow
(`extension.ts`'s `handleResolveReferencedField`) currently only pulls
`length`/`dataType`/`decimalPositions` from the referenced field — none
of these. Not fixed here: it's a much broader gap than I-32's own
field-level-UI scope (spans several keywords well beyond just
date/time), and would also require extending the underlying Code for i
DSPFFD fetch itself, not just the writer/UI layer this task touches.

**Tests:** new `DspfWriter` unit-test block in `dspfWriter.test.js`
covering `getDateFormat`/`setDateFormat`, `getDateSeparator`/
`setDateSeparator` (including quote-stripping/quoting and the
`dateSeparatorConflictReason` fixed-separator matrix), and the
`TIMFMT`/`TIMSEP` equivalents (including confirming no `*JOB` value
exists for `TIMFMT`). New `dspfWebview.test.js` scenario covering both
accordions rendering/pre-filling correctly, a no-op Apply not
corrupting the line, the fixed-separator conflict being blocked with
the dropdown reverted, a legitimate change committing cleanly once the
conflict is cleared, and confirming neither accordion renders for a
plain numeric field. `dspfEngine.test.js`'s own `DATFMT` scenario
rewritten to assert the corrected (field-level-only) behavior. All new/
changed tests confirmed failing against pre-fix code via `git stash`.
Full suite green (`npm test`, 73/73 sections).

---

### I-33 — Constant fields (incl. system-value sub-form)

**Status: done (0.10.110).**

**Finding 1 — `PAGNBR` is not a real DDS keyword (same bug class as
I-2's `PRTFILE`).** It appears nowhere in
`docs/sda-reference/source/DDS_Keyword_V7r6.txt`. IBM's own "Constant
fields" rules (positions 17-38 must be blank; ~line 671) document only
**six** ways to supply a constant field's value: explicit/implicit `DFT`,
`DATE`, `TIME`, `SYSNAME`, `USER`, or `MSGCON`. `PAGNBR` was almost
certainly carried over from RPG's unrelated `*PAGNBR` special word
(printer output specs) during Task L16. iSDA wrote a bare `PAGNBR`
keyword into generated DDS source for this option — invalid syntax that
would fail a real `CRTDSPF` compile. There is no DDS mechanism for a
display-file "page number" constant (page numbering is a print/report-
writer concern), so this was removed with no replacement.

**Finding 2 — `MSGCON` (Message Constant), a genuinely documented
constant-value keyword, was entirely missing.**
`MSGCON(length message-ID [library-name/]message-file-name)` lets a
constant's displayed text come from a message description instead of a
literal — one of the six forms Finding 1 lists above. Added as a full
peer of the `DATE`/`TIME`/`USER`/`SYSNAME` system-value sub-form: its own
structured Length/Message ID/Message file/Library UI (parsed/formatted
via `DspfWriter.parseMsgConParams`/`formatMsgConParams`, modeled on
L79's `parseMsgIdParams`/`formatMsgIdParams` for MSGID), its own entry in
the "+ Add constant" placement flow's "Value source" selector, and its
own preview in `DspfEngine.fieldDisplayText` (`[MSG-ID]` placeholder,
matching the `*DATE`/`*USER`-style placeholders the system-value forms
already used). Confirmed against MSGCON's own restriction text: single
instance (not repeatable), mutually exclusive with
`DATE`/`DFT`/`EDTCDE`/`EDTWRD`/`TIME`, option indicators valid only for
conditioning the message's presence (not for changing its content) — so
it deliberately does *not* get the EDTCDE/EDTWRD panel the
`DATE`/`TIME` system-value forms do.

**Finding 3 — the shared `GENERAL_FIELD_KEYWORD_ROWS` list
(`src/webviewClientHelpers.js`) gates keywords wrong in *both*
directions, for every field kind, not just constants.** Confirmed
individually against each keyword's own restriction text:
- `DFTVAL`: *"You can only use this keyword to initialize named fields.
  It is not allowed on constant fields."* — was offered on constants.
- `CNTFLD`: *"must be defined as an input-capable field with the data
  type A"* — was offered on constants.
- `FLDCSRPRG`: *"is defined as an input-capable field"* — was offered on
  constants.
- `CHRID`: *"is not valid on constant fields..."* (verbatim) — was
  offered on constants.
- `IGCALTTYP`: *"Specify this keyword only for input- and output-capable
  fields"* — was offered on constants.
- `HLPID`: its own text opens *"You use this constant field-level
  keyword..."* — the inverse gap: was offered on **named** fields too,
  even though it's constant-only by definition.

Real SDA's own "Select General Keywords" screens for a constant
(`docs/sda-reference/screens/field-level/constant/general/`) vs. a named
character field
(`docs/sda-reference/screens/field-level/character/general/`) independently
confirm this exact same split, though the fix here is driven by IBM's own
restriction text per this project's own audit convention (SDA screenshots
are scope-only, not correctness, per this task's own ground-truth
caveat). `TEXT` is explicitly documented as valid on any field including
constants (*"valid for any record format or field, except a SFLMSGKEY or
SFLPGMQ field"*) and was left as `'all'`. Each row in
`GENERAL_FIELD_KEYWORD_ROWS` now carries a 5th `'all'`/`'named'`/
`'constant'` scope tag; `generalFieldKeywordsHtml`/
`wireGeneralFieldKeywordsEditor` take an `isConstant` parameter and
filter accordingly. There's a pre-existing code comment in
`webviewClientHelpers.js` (predating this task) that had already flagged
`CNTFLD`/`FLDCSRPRG` as a known gap left for I-33 to close.

**Not fixed here (separate, pre-existing, broader scope):** several of
these same keywords' own text also says option indicators are invalid
for them (e.g. `INDTXT`, `TEXT`) — that's a conditioning-eligibility
question that applies across every field kind, not just constants, and
is more likely I-30/I-31's territory (or a dedicated field-level
conditioning audit, mirroring I-3's file-level one) than something to
fold into I-33's constant-specific scope. Logged here rather than fixed
silently, per this project's own "out-of-scope items are explicitly
logged" convention.

**Tests:** `src/test/dspfWriter.test.js` — new `parseMsgConParams`/
`formatMsgConParams` unit-test block (structured/unstructured parsing,
round-trip formatting, all-three-parts-required validation). New
scenarios in `src/test/dspfWebview.test.js`: `PAGNBR` removal from the
system-value dropdown; a full MSGCON constant lifecycle (render existing,
edit-and-apply without corruption, create new via the placement flow);
and a dedicated constant-vs-named General Keywords gating scenario
confirming `DFTVAL`/`CNTFLD`/`FLDCSRPRG`/`CHRID`/`IGCALTTYP` are absent
and `HLPID` present on a constant, with the exact inverse on a named
field. All new tests confirmed failing against pre-fix code before the
fix landed (`p-place-const-kind`/`parseMsgConParams`/gating didn't exist
yet). Full suite green (`npm test`).

---

### I-34 — Menu-bar choice fields (`SNGCHCFLD`/`MLTCHCFLD`)

Full 4-dimension audit of the menu-bar/pulldown choice-field keyword set
(`SNGCHCFLD`, `MLTCHCFLD`, `CHOICE`, `CHCCTL`, `CHCACCEL`, `CHCAVAIL`,
`CHCUNAVAIL`, `CHCSLT`, `MNUBARCHC`, `MNUBARSEP`) against
`DDS_Keyword_V7r6.txt`.

**Usage/constraint bug found and fixed:** IBM's own `MLTCHCFLD` format
string carries `*RSTCSR`/`*NORSTCSR`, `*SLTIND`/`*NOSLTIND`, and
`*NUMCOL`/`*NUMROW`/`*GUTTER` only — the whole
`*AUTOSLT`/`*NOAUTOSLT`/`*AUTOSLTENH`/`*AUTOENT`/`*NOAUTOENT`/
`*AUTOENTNN` family exists solely on `SNGCHCFLD`'s own format string.
`choiceSelectionTypeHtml` was offering both radio groups unconditionally
regardless of which kind was selected — a real `MLTCHCFLD` with
`*AUTOSLT` would fail to compile. Fixed at both layers: the UI hides the
two groups entirely once `MLTCHCFLD` is selected (and
`wireChoiceSelectionTypeEditor` re-checks the kind at apply-time rather
than trusting whatever happens to be in the DOM, so a stale selector left
over from switching the Type dropdown without a full rerender can't leak
a stray flag through), and `setChoiceSelectionType` itself filters the
SNGCHCFLD-only flags whenever `state.kind === 'MLTCHCFLD'` as a
belt-and-braces guarantee at the actual DDS-writing layer.

**Conditioning eligibility — the dominant finding, a reverse gap on five
keywords:** `CHOICE`, `MNUBARCHC`, `CHCAVAIL`, `CHCUNAVAIL`, `CHCSLT`, and
`MNUBARSEP` are each individually documented "Option indicators are valid
for this keyword" in the DDS Reference, but none had any Conditioning UI
before this task:
- `CHOICE` and `MNUBARCHC` are per-choice-number repeatable instances.
  New `DspfWriter.setChoiceConditions`/`setMenubarChoiceConditions` key by
  choice-number rather than ordinal position (unlike `setCommandKeyAt`'s
  index-based approach) — IBM's own text for both keywords states
  duplicate choice-number values within a field are not allowed, the same
  uniqueness assumption the existing id-keyed merge logic in
  `choiceKeywordsListHtml`/`menuBarChoicesHtml` already made. Each row now
  renders its own `kw-cond-toggle`/`kw-cond-body`, committing immediately
  on toggle (independent of the row list's own batch "Apply" button) —
  the same split `wireEntFldAtrEditor` already established.
- `CHCAVAIL`/`CHCUNAVAIL`/`CHCSLT` are whole-field. `getChoiceColorState`/
  `setChoiceColorState` already carried a `conditions` parameter (added
  incidentally during I-3's `ENTFLDATR` fix, since both reuse the same
  generic function), but `choiceColorStatesHtml` never rendered a toggle
  for any of the three callers — the plumbing existed but nothing exposed
  it. Fixed by adding one toggle per state, each committing independently
  of the shared Apply button.
- `MNUBARSEP` is whole-field too, and previously had no `conditions`
  concept modeled at all — `getMenubarSeparator`/`setMenubarSeparator`
  now round-trip a `conditions` array (preserved when a caller's `state`
  omits it, same convention as `setFileFlagKeyword`), with the panel
  offering one toggle, again committing independently of its own Apply
  button.

**Silent-data-loss bug found and fixed (same class as I-2/I-3's own
fixes for `setFileFlagKeyword`/`setChoiceColorState`):** `setChoices` and
`setMenubarChoices` both hard-coded `conditions: []` on every batch
rewrite. Once the per-choice Conditioning toggles above exist, that would
have silently wiped any conditioning the very next time "Apply choice
keywords" or "Apply menu-bar choices" was clicked. Both now preserve a
choice's existing conditions by id across the rewrite unless the caller's
entry explicitly supplies its own.

**Parameter completeness:** `CHOICE`'s optional trailing `*SPACEB` flag
("insert a blank space/line before this choice", for logical grouping of
consecutively-numbered choices) was entirely unmodeled. Added to
`getChoices`/`setChoices` and a new checkbox on each choice row.

**Confirmed CLEAN (no fix needed):** `SNGCHCFLD`/`MLTCHCFLD` themselves
("Option indicators are not valid for this keyword" — correctly offer no
toggle) and `CHCCTL`/`CHCACCEL` (same "not valid" statement, also
correctly clean already).

**Scope note, not fixed here:** `CHCACCEL` is documented as valid only on
`SNGCHCFLD` fields in pull-down records, but the UI currently offers it
regardless of choice-field kind. Left as a follow-up rather than folded
into this pass — logged here per this project's own "out-of-scope items
are explicitly logged" convention.

**Tests:** New `src/test/i34MenuBarChoiceFieldsAudit.test.js` (45
checks) covering: the `MLTCHCFLD` auto-select/auto-enter UI-and-writer
gating fix; the confirmed-clean absence of a toggle on `SNGCHCFLD`/
`MLTCHCFLD` themselves; the new per-choice `CHOICE`/`MNUBARCHC`
Conditioning toggles and their id-keyed setters, including a check that
updating one choice's conditions leaves every other keyword (including
sibling `CHOICE`/`CHCCTL` instances) untouched; the `setChoices`/
`setMenubarChoices` silent-data-loss fix (conditions preserved across a
batch rewrite that doesn't mention them); `*SPACEB` round-tripping and
its new UI checkbox; the three new `CHCAVAIL`/`CHCUNAVAIL`/`CHCSLT`
toggles, including a click-wiring check that a toggle click reruns via
`rerender` independently of the shared Apply button; the confirmed-clean
absence of a toggle on the `CHCCTL`/`CHCACCEL` portions of a choice row;
and the new `MNUBARSEP` toggle plus its conditions round-trip through
`getMenubarSeparator`/`setMenubarSeparator`. Full suite green (4,163
checks, `npm test` exit 0); `npx tsc -p . --noEmit` clean.

---

### I-35 — Usage `M` (Message) and `P` (Program-to-system) fail-open audit

`fieldKeywordCategoryVisibility()` used to fail OPEN for Usage `M`/`P`
(show every category), on the reasoning that real SDA's own "For Field
Type" screenshot table never covers them. That reasoning doesn't hold
up against IBM's own DDS Reference, read directly rather than relying
on this doc's own earlier summary (which turned out to be incomplete
for `P` - see below): IBM is far MORE restrictive for `M`/`P` than any
other usage, not less.
- `M`'s own section: *"Only the following keywords are valid for a
  message field: ALIAS, INDTXT, OVRDTA, REFFLD, TEXT."*
- `P`'s own section: *"The only keywords allowed on a program-to-system
  field are: ALIAS, TEXT, INDTXT, REFFLD."* (no `OVRDTA`) - this doc's
  own earlier intro summary said `P` was "restricted to `ALIAS`/`TEXT`
  plus being named as a parameter elsewhere," omitting `INDTXT`/`REFFLD`
  as directly-valid-on-the-field-itself keywords; corrected here.

Fixed at three levels, since `M`/`P`'s combined 4-5 valid keywords are
scattered across categories that otherwise bundle many more:
1. **`fieldKeywordCategoryVisibility`** - every category is now hidden
   outright for `M`/`P` except General Keywords and Database Reference
   (the only two containing any valid `M`/`P` keyword at all). Genuinely
   blank/unset usage (not one of IBM's six defined codes yet) is
   unaffected - it keeps the old fail-open posture, a different case
   from `M`/`P` which each have both a code AND a documented fixed list.
2. **`GENERAL_FIELD_KEYWORD_ROWS`'s new `mpScope` column** - General
   Keywords bundles 14 rows together; only `ALIAS`/`INDTXT`/`TEXT`
   (valid for both `M` and `P`) and `OVRDTA` (valid for `M` only, per
   `M`'s own list including it and `P`'s own list not) survive for
   `M`/`P` - the other 10 rows (`DFT`/`DFTVAL`/`CNTFLD`/`FLDCSRPRG`/
   `HLPID`/`PUTRETAIN`/`OVRATR`/`CHRID`/`IGCALTTYP`/`NOCCSID`) are
   filtered out specifically for `M`/`P`, even though the category
   itself stays visible. Wired into both `generalFieldKeywordsHtml` and
   `wireGeneralFieldKeywordsEditor` (which needed a new `usage` param
   threaded through from `buildWebviewTemplate.js`, since it previously
   had no way to know the field's own usage at all).
3. **`databaseReferenceHtml`/`wireDatabaseReferenceEditor`** - `REFFLD`
   stays available for `M`/`P` (it's on both lists), but `DLTCHK`/
   `DLTEDT` (bundled in the same panel via `referenceOverridesHtml`) are
   skipped for `M`/`P` specifically, since neither is on either usage's
   fixed list.

**Related finding, not fixed by this task:** Usage `P` fields appear to
have no reachable selection path in the UI at all. `dspfEngine.js`
explicitly excludes `usage === 'P'` from canvas drawing (same treatment
as Hidden), but the Hidden-fields tab (`hiddenFieldsSectionHtml`) only
lists `usage === 'H'` - so a `P`-usage field can exist in the DDS source
(hand-edited or otherwise imported) with no click-to-select path
anywhere in iSDA's own UI to ever reach its properties panel and apply
this task's own fix in practice. `M`-usage fields don't have this
problem (not excluded from canvas drawing). Fixing this would mean a
dedicated "Program-to-system fields" tab analogous to the Hidden one -
a bigger, separate task, not attempted here. This task's own fix is
still correct and tested directly against the row/panel-building
functions themselves (see the test file below), independent of this
separate reachability gap.

Test: `src/test/i35UsageMpFailOpenAudit.test.js`, plus updated
`src/test/fieldKeywordVisibility.test.js` (which had hard-coded the old,
incorrect M/P fail-open behavior as the expected/correct one).

**Fixed (v0.10.115).**

---

### I-36 — `ALWROL`/`CLRL`/`SLNO` cannot be specified for the record named by file-level `PASSRCD`

Follow-up finding I-24 flagged in its own doc comment: `WINDOW`,
`ALWROL`, `CLRL`, and `SLNO` all four use the identical "cannot be
specified for the record format specified by the PASSRCD keyword"
wording in their own DDS Reference sections; I-24 fixed only `WINDOW`,
scoped that way deliberately.

`DspfWriter.passrcdWindowConflictReason` generalized into
`passrcdRecordConflictReason(keywordName, passrcdName, recordName)` - a
pure name-vs-name check parametrized by keyword, with the old function
kept as a one-line wrapper for its own existing callers/tests.

Wired at the same two reachable on-transitions I-24 established, adapted
for the fact that unlike `WINDOW` (a record-creation-time "type"),
`ALWROL`/`CLRL`/`SLNO` are ordinary toggles on ANY existing record:
1. Turning `ALWROL`/`CLRL`/`SLNO` on on a record whose OWN name already
   matches the file's current `PASSRCD` value - new `alsoCheckPassrcd`
   param on `wireUsrdfnGuardedFlag` (`ALWROL`) and
   `wirePulldownGuardedFlag` (`CLRL`/`SLNO`), using `idPrefix.slice(3)`
   for the record's own name (`idPrefix` is always `'rk-' + rec.name`).
2. Editing file-level `PASSRCD` to name a record that already carries
   one of the three - `wireFileKeywordsPanels`' `fk-passrcd` handler now
   checks all four of `WINDOW`/`ALWROL`/`CLRL`/`SLNO` against the named
   record, not just `WINDOW`.

Test: `src/test/i36AlwrolClrlSlnoPassrcdAudit.test.js`.

**Fixed (v0.10.111).**

---

### I-37 — `ALWROL`/`CLRL`/`SLNO` are each individually incompatible with `ASSUME`/`SFL`/`SFLCTL`/`USRDFN`

Follow-up finding I-28 flagged in its own doc comment: `ALWROL`/`CLRL`/
`SLNO`'s own DDS Reference sections each ALSO list `ASSUME`/`SFL`/
`SFLCTL`/`USRDFN` as mutually exclusive with themselves (identical
four-way list beyond `KEEP`, which I-28 already covered). Cross-verified
from `ASSUME`'s own section too (same method I-23 used for
`SFLMSGRCD`), which confirms the reverse for `ALWROL`/`CLRL`/`SLNO`
specifically - `ASSUME`'s own list also separately names `SFL` and
`USRDSPMGT`, which are pre-existing/out-of-scope concerns not part of
this task.

New `DspfWriter.alwrolClrlSlnoConflictReason(keywordName,
recordKeywords)`:
- For `keywordName` in `{ALWROL, CLRL, SLNO}`: blocks if `ASSUME`, `SFL`,
  `SFLCTL`, or `USRDFN` is already present.
- For `keywordName === 'ASSUME'`: blocks if any of `ALWROL`/`CLRL`/`SLNO`
  is already present (the confirmed-bidirectional half of the pair).

`SFL`/`SFLCTL`/`USRDFN` are checked one-directionally only - same
reasoning `usrdfnConflictReason`'s own doc comment gives: all three are
record-TYPE identifiers written once by the "+ Add record" wizard and
never toggled off again by this UI, so there's no reachable reverse
transition to guard. `USRDFN` specifically was already guarded for
`ALWROL` alone (I-8's own `usrdfnConflictReason`) - `CLRL`/`SLNO` go
through `wirePulldownGuardedFlag` instead, which never called it, so
`USRDFN`-vs-`CLRL`/`SLNO` was a genuine gap alongside the `SFL`/`SFLCTL`
one this task closes too.

Wired unconditionally into both `wireUsrdfnGuardedFlag` and
`wirePulldownGuardedFlag`'s commit chains (no new opt-in param needed -
the function returns `null` for every other keyword name those two wire
functions handle, so it's a safe no-op elsewhere).

Test: `src/test/i37AlwrolClrlSlnoAssumeSflUsrdfnAudit.test.js` - also
fixed a latent test-fixture assumption in `i8UsrdfnConflictAudit.test.js`,
`i12WindowConflictAudit.test.js`, and `i13PulldownConflictAudit.test.js`,
each of which sequentially toggled `ALWROL` then `ASSUME` on the SAME
plain record - now genuinely conflicting per this task's own new guard,
so each was split onto separate records; none of those three tasks' own
findings changed.

**Fixed (v0.10.111).**

### I-38 — `HLPDOC` was missing from iSDA at the file level entirely

**Finding:** IBM's DDS Reference documents `HLPDOC` (Help Document) as a
file- or help-specification-level keyword:

```
HLPDOC(online-help-information-text-label-name document-name folder-name)
```

all three parts required (unlike `HLPRCD`'s own optional
`[[library/]file-name]`). Option indicators ARE valid. "You cannot
specify `HLPDOC` with `HLPBDY`, `HLPPNLGRP`, or `HLPRTN`." iSDA had no
`HLPDOC` support anywhere — not the checkbox, not the getter/setter, not
even a line in this file. Traced back to I-1's own original 39-keyword
file-level baseline: `HLPDOC` simply wasn't in it, and I-5's later
5-keyword addition (`HLPRCD`, `MOUBTN`, `ROLLUP`/`ROLLDOWN`, `VALNUM`,
`WRDWRAP`) didn't include it either — a genuine scope gap in I-1's audit,
not something previously found and deferred.

**Fixed (v0.10.116).** Added the file-level form only — reusing
`getFileFlagKeyword`/`setFileFlagKeyword` with the 3 parts hand-composed
client-side, the same "generic primitive + client-side parse/compose"
choice I-5's own `HLPRCD` addition made, and the same "-on checkbox
drives presence regardless of whether the sub-fields have anything typed
yet" contract. Added a new `hlpdocConflictReason(keywordName, keywords)`
in `dspfWriter.js`, checked bidirectionally: turning `HLPDOC` on while
file-level `HLPPNLGRP` or `HLPRTN` is already present is blocked
(`window.alert` + revert, the same `alertAndRevert` idiom I-8/I-11/I-13's
own conflict checkers use), and vice versa. `HLPBDY` is
help-specification-level only in this codebase (`applicationHelpFieldsHtml`'s
own per-H-spec panel) — there is no file-level `HLPBDY` instance a
file-level `HLPDOC` could ever conflict with, so that half of IBM's rule
has nothing to check at this level.

**Deliberately out of scope, left for a follow-up:** the
help-specification-level form of `HLPDOC` (record-level, inside an H
specification alongside `HLPARA`) — same "file-level only, H-spec-level
deferred" precedent I-5's own `HLPRCD` entry already set for that
keyword. The reverse conflict direction (blocking `HLPPNLGRP` from
turning on while `HLPDOC` is already present) has since been wired too
— see the follow-up section immediately below. `HLPRTN`'s own reverse
direction is still not wired at its checkbox commit site: `HLPRTN`'s
file-level row goes through the shared `commitIndicatorTextRow` helper
(also used for `CLEAR`/`HOME`/`PAGEDOWN`/`PAGEUP`/`VLDCMDKEY`), which
has no per-keyword conflict hook to attach one to — same "one direction
built first" convention `sflChoiceListConflictReason`'s own doc comment
documents elsewhere in this codebase.

Regression coverage: `src/test/i38HlpdocFileLevel.test.js` (jsdom,
exercises the real generated File Properties > Help panel — verified via
`git stash` that it genuinely fails against pre-fix code, not just after
the fix).

---

### Follow-up — `HLPRCD` vs `HLPDOC` cross-verify (user-requested, extends I-38)

**Question asked:** whether `HLPRCD` and `HLPDOC` conflict (iSDA
currently allows both), plus a request to validate `HLPDOC`'s required
sub-fields and cross-check `HLPRCD`'s own sub-fields while at it.

**Answer: `HLPRCD` and `HLPDOC` together is valid DDS - not a bug.**
IBM's DDS Reference states the mutual exclusions that exist explicitly,
each one by name: "You cannot specify `HLPDOC` with `HLPBDY`,
`HLPPNLGRP`, or `HLPRTN`" (already correct, from I-38), and separately,
in `HLPPNLGRP`'s own section, "a display file cannot contain both
`HLPPNLGRP` and `HLPRCD` keywords, nor `HLPPNLGRP` and `HLPDOC`
keywords." `HLPRCD` and `HLPDOC` are never named against each other
anywhere in the Reference. Both keywords' file-level trigger condition
reads identically ("displayed when no help area for the active records
contains the current cursor location"), which looks redundant, but
redundant isn't the same as invalid - this codebase only blocks
combinations IBM's text actually forbids, and confirmed here that this
isn't one of them.

**Real gap found and fixed: `HLPPNLGRP` vs `HLPRCD` had no conflict
check at all.** The IBM sentence above states TWO exclusions -
`HLPPNLGRP`+`HLPRCD` and `HLPPNLGRP`+`HLPDOC` - but I-5 (which added
`HLPRCD`) never checked either, and I-38 (which added `HLPDOC`) only
ever checked its own half. `HLPRCD`'s side of that same sentence was
never wired anywhere. Fixed: new `hlprcdConflictReason(keywordName,
keywords)` in `dspfWriter.js`, checked bidirectionally in
`commitHlprcd`/`commitHlppnlgrp` (`webviewClientHelpers.js`) with the
same `window.alert` + revert idiom `hlpdocConflictReason`'s own callers
use. While there, also wired `hlpdocConflictReason`'s previously-
unwired reverse direction into `commitHlppnlgrp` (see I-38's own updated
note above) - `HLPPNLGRP` turning on is now blocked by either `HLPRCD`
or `HLPDOC` already being present, closing both documented gaps in one
pass since they share the same commit function. `HLPRCD` and `HLPRTN`
are deliberately NOT checked against each other: IBM states `HLPRTN`
"takes priority over" `HLPRCD`/`HLPPNLGRP`/`HLPDOC` when more than one
is present - a precedence rule, not a prohibition (unlike `HLPDOC`'s own
separate, explicitly-worded exclusion) - so that combination stays
valid and unblocked.

**Real gap found and fixed: `HLPDOC`'s three required sub-fields were
never validated.** IBM's format, `HLPDOC(label document-name
folder-name)`, has no brackets around any of its three parts - all are
mandatory whenever the keyword is present. The original I-38
implementation deliberately wrote whatever was typed so far the moment
the checkbox went on (documented at the time as "caller's
responsibility to fill it in properly"), including nothing at all -
`setFileFlagKeyword` omits the parens entirely when parameters is
blank, so an all-blank commit wrote a bare `HLPDOC` with no parameter
list, and a 1- or 2-part fragment is equally invalid DDS. Fixed:
`commitHlpdoc` now blocks (alert + revert the checkbox) whenever the
checkbox is - or would remain - checked with any of the three parts
blank, checked on every commit, not just the moment the box is first
ticked (so blanking a previously-filled part back out while still
checked is caught too, not just the initial turn-on).

**Real gap found and fixed: `HLPRCD`'s own sub-fields had two
unchecked requirements.** IBM's format,
`HLPRCD(record-format-name [[library-name/]file-name])`: (1)
`record-format-name` is NOT bracketed - it's mandatory whenever the
checkbox is on, but nothing enforced that; a checked `HLPRCD` with a
blank record field wrote malformed DDS (a leading-space fragment like
`HLPRCD( HELPFILE)` with no record name if a file was typed, or a bare
`HLPRCD` with no parens at all if nothing was typed). (2) library-name
is only meaningful nested inside `[library-name/]file-name` - it has no
standalone form - but the original expression (`file ? (library ?
library + '/' + file : file) : ''`) silently DROPPED a typed library
value with zero feedback whenever the file field was left blank, which
reads like data loss to whoever typed it, not a deliberate no-op.
Fixed: `commitHlprcd` now blocks turning `HLPRCD` on with a blank
record name (alert + revert), and blocks (alert, no revert - the
checkbox itself isn't the problem) any commit that would leave a
library name entered without an accompanying file name.

Regression coverage: extended `src/test/i38HlpdocFileLevel.test.js`
with `hlprcdConflictReason` unit tests (mirroring the existing
`hlpdocConflictReason` ones) and UI-level scenarios for all of the
above - both conflict directions, both `HLPRCD` sub-field requirements,
the updated `HLPDOC` all-three-parts requirement (including the
blank-it-back-out-while-checked case), and a scenario that explicitly
confirms `HLPRCD`+`HLPDOC` committing together successfully, answering
the original question with a passing test rather than just a doc
paragraph.

---

### I-39 — Full-text audit against DDS_Keyword_V7r6.txt found 8 keywords entirely missing from iSDA

**Fixed (v0.10.118).** Cross-checked every keyword name in the DDS Reference's own table
of contents (`docs/sda-reference/source/DDS_Keyword_V7r6.txt`) against actual
occurrences in `src/*.js`/`src/*.ts` (not just `KEYWORD-INDEX.md`, which is a
point-in-time snapshot that can drift - confirmed several apparent gaps were
already handled and just missing from the index: `DATE`/`TIME`/`USER`/
`SYSNAME` system-value constants, `MSGCON` (I-33), `HLPDOC` (I-38), and the
legacy-alias keywords `CMP`/`AUTO`/`LOWER`/`SETOFF`/`ROLLUP`/`ROLLDOWN`
(equivalent to `COMP`/`CHECK`/`SETOF`/`PAGEDOWN`/`PAGEUP` per the Reference's
own "the X keyword is preferred" wording - deliberately not given their own
UI controls, same convention already established for `CMP` vs `COMP`).

Eight keywords found genuinely absent - no UI control, no getter/setter, no
mention anywhere in the codebase:

- `BLKFOLD` - field-level flag, named output-only character fields (not
  floating-point).
- `CSRINPONLY` - file- or record-level flag, no parameters.
- `FLTFIXDEC` - field-level flag, floating-point (data type F) output-capable
  fields only.
- `FLTPCN` - field-level, `*SINGLE`/`*DOUBLE`, floating-point fields only.
- `MAPVAL` - field-level, list of program-value/system-value pairs, valid
  only for date (L)/time (T)/timestamp (Z) fields.
- `SFLCHCCTL` - field-level flag, subfile choice-control field (selection
  lists).
- `SFLCSRPRG` - field-level flag, subfile record cursor progression.
- `SFLRTNSEL` - record-level flag, SFLCTL record (requires `SFLMLTCHC` or
  `SFLSNGCHC`).

Plan: add all 8 as straightforward present/absent (or single-select, for
`FLTPCN`) rows reusing the existing generic `DspfWriter.getFileFlagKeyword`/
`setFileFlagKeyword` primitives (works over any keywords array - file,
record, or field - same reuse I-38 made for `HLPDOC`), landing `BLKFOLD`/
`FLTFIXDEC`/`FLTPCN`/`MAPVAL` in the field-level General panel,
`SFLCHCCTL`/`SFLCSRPRG` alongside `SFLRCDNBR`/`SFLROLVAL`/`SFLSCROLL` in
`subfileFieldKeywordsHtml`, `SFLRTNSEL` alongside `SFLMLTCHC`/`SFLSNGCHC` in
the SFLCTL panel, and `CSRINPONLY` in both the file-level General panel and
the record-level General panel. Hard mutual-exclusion/eligibility guards
(e.g. `BLKFOLD` vs floating-point, `FLTFIXDEC`/`FLTPCN` vs non-float,
`SFLRTNSEL` requiring `SFLMLTCHC`/`SFLSNGCHC`) are noted via hint text rather
than hard-blocked in this first pass - same "one direction/one pass first"
precedent `hlpdocConflictReason`'s own doc comment set in I-38 - since the
priority here is closing the "keyword doesn't exist in iSDA at all" gap
first.

first.

Landed exactly as planned. `BLKFOLD`/`FLTFIXDEC`/`FLTPCN`/`MAPVAL` were
added to `GENERAL_FIELD_KEYWORD_ROWS` with a new 8th `dtScope` element
(`'float-only'`/`'non-float'`/`'datetime-only'`, resolved by the new
`generalFieldKeywordRowMatchesDataType` helper shared between
`generalFieldKeywordsHtml`/`wireGeneralFieldKeywordsEditor`, same "shared
resolver so the two can never disagree" reasoning `mpScope` already used).
`CSRINPONLY` got one row each in `fileKeywordsPanelsHtml`/
`wireFileKeywordsPanels` and `recordKeywordsPanelsHtml`/
`wireRecordKeywordsPanels`, both with Conditioning enabled (IBM: "Option
indicators are valid for this keyword" at both levels). `SFLCHCCTL`/
`SFLCSRPRG` landed in `subfileFieldKeywordsHtml`/`wireSubfileFieldKeywords`
as two more plain checkboxes alongside `SFLRCDNBR`/`SFLROLVAL`/`SFLSCROLL`,
with hint text on `SFLCHCCTL`'s own field-shape requirement (first field,
length 1, type Y, 0 decimals, usage H) and `SFLCSRPRG`'s `SFLLIN`
incompatibility - neither hard-blocked yet. `SFLRTNSEL` landed in
`sflChoiceListPanelHtml`/`wireSflChoiceListPanel` next to the `SFLSNGCHC`/
`SFLMLTCHC` selector it depends on, with a hint shown when neither is
selected.

Regression coverage: `src/test/i39MissingKeywordsAudit.test.js` - row
presence, `dtScope` data-type gating, and commit behavior for all 8
keywords, run against the real `webviewClientHelpers.js` functions (same
harness pattern `i35UsageMpFailOpenAudit.test.js` uses).

**Deliberately out of scope, left for follow-up:** every hard guard noted
above as "not hard-blocked yet" - `BLKFOLD` vs floating-point (data-type
gating already prevents the row from ever showing on a float field, so
this is a lower-priority belt-and-suspenders case), `SFLCHCCTL`'s own
field-shape/first-field/one-per-record rules, `SFLCSRPRG` vs `SFLLIN`,
and `SFLRTNSEL` vs missing `SFLMLTCHC`/`SFLSNGCHC`.

---

### I-40 — `KEYWORD-INDEX.json`/`.md`/`KEYWORD-LOOKUP.json` regeneration: 7 level-label inaccuracies + 9 stale-missing entries

**Claimed.** Independent full-text audit of `DDS_Keyword_V7r6.txt` against
current `src/*.js` (see
`docs/sda-reference/source/dds-keyword-audit-report.md` for the full
write-up and methodology), cross-checked against I-38/I-39 before filing to
avoid duplicating either's claim.

Traced each keyword's actual call site and confirmed the **code** already
matches the DDS Reference in every case below — only the index's level
labels are wrong:

- `CHECK` — index says file/record/field; code (`checkInstancesHtml`,
  called only from `validityCheckSectionHtml`/`keyingOptionsHtml`, both
  field-level) and DDS Reference agree it's field-only.
- `HLPPNLGRP` — index says file/record; its second surface
  (`applicationHelpFieldsHtml`) is invoked only from the
  help-specification (`*PNLGRP` H-spec) editor, not an actual
  display-file record surface. DDS Reference: file-level or
  help-specification-level, never record.
- `SFLMSGKEY`/`SFLPGMQ`/`SFLRCDNBR`/`SFLROLVAL`/`SFLSCROLL` — index says
  record; all five are written/read only via `subfileFieldKeywordsHtml`,
  a field-level panel, matching the DDS Reference's own field-level
  classification.

Missing from the index despite being implemented in code (stale since the
index wasn't regenerated after I-31–I-34/I-38 landed): `DATE`/`TIME`/
`USER`/`SYSNAME` (I-33, `SYSTEM_VALUE_KEYWORD_NAMES`), `MSGCON` (I-33),
`SFL`/`USRDFN` (record-type selector), `WDWTITLE`
(`getWindowTitleText`/`setWindowTitleText`), `HLPDOC` (I-38).

Plan: regenerate via `build_index.py`/`build_lookup_and_md.py`, fold in
the 7 label corrections and 9 missing entries above. Documentation only —
no `src/` changes expected.

**Note for whoever picks this up:** I-39's own manual edits to
`KEYWORD-INDEX.md`/`.json` (`BLKFOLD`/`CSRINPONLY`/`FLTFIXDEC`/`FLTPCN`/
`MAPVAL`/`SFLCHCCTL`/`SFLCSRPRG`/`SFLRTNSEL`, plus the corrected
215/47/177 header counts) already landed before this task starts —
`SFLCHCCTL`/`SFLCSRPRG` were filed under the same (mislabeled, per I-40's
own finding above) "record → Subfile keywords" category as `SFLRCDNBR`/
`SFLROLVAL`/`SFLSCROLL` for consistency with their existing neighbors, so
I-40's regeneration should keep that grouping (correcting the label to
field-level) rather than reverting it.

### I-41 — Fixed: added missing field-level keyword `HTML` (v0.10.133); `PSHBTNFLD`/`PSHBTNCHC` split off as I-57

**Done** (`HTML` only - see I-57 for `PSHBTNFLD`/`PSHBTNCHC`). Same audit
as I-40 (see `docs/sda-reference/source/dds-keyword-audit-report.md`,
Finding B). Confirmed zero occurrences anywhere in `dspfWriter.js`/
`webviewClientHelpers.js`/`buildWebviewTemplate.js`, and not among I-39's
already-claimed 8 keywords or the legacy-alias set I-39 deliberately
excluded.

- `HTML` — field-level flag, specifically on an UNNAMED CONSTANT field
  (see the DDS Reference's own `HTML(...)` grammar: `HTML('value')` or
  `HTML(&program-to-system-field)`). NOT among the six documented
  constant-value sources IBM's own "Constant fields" rules list
  (explicit/implicit DFT, DATE, TIME, SYSNAME, USER, MSGCON) - HTML is a
  seventh, structurally identical way to give a constant a
  keyword-driven (non-literal) value, added after that list was written.
  Implemented mirroring I-33's own `MSGCON` precedent exactly: a new
  "Value source" dropdown option at both constant-creation
  (`renderPlacementProps`) and constant-editing (`renderFieldProps`)
  time, reusing the EXISTING generic `DspfWriter.getFileQuotedText`/
  `setFileQuotedText`/`quoteDdsLiteral` helpers directly (HTML's grammar
  is a single quoted-literal parameter, the exact shape those already
  handle - no new parse/format functions needed). A design-time preview
  placeholder was added to `DspfEngine.fieldDisplayText` (shows the tag
  text itself, since HTML's own text says row/column only affect tag
  *order*, and nothing is actually rendered on a real 5250 screen at
  all - only a 5250 Workstation Gateway device processes it).
  Mutually exclusive with `COLOR`/`DATE`/`DFT`/`DSPATR`/`EDTCDE`/
  `EDTWRD`/`HLPID`/`MSGCON`/`NOCCSID`/`OVRATR`/`PUTRETAIN`/`SYSNAME`/`TIME`/
  `USER`, and not allowed in a field of a subfile (SFL) record - both
  enforced via new `DspfWriter.htmlConflictReason(keywordName,
  fieldKeywords, recordKeywords)` (bidirectional, same shape as I-47's
  own `windowMutexConflictReason`), wired into the field-level raw
  keyword editor's `addGuardFn` (previously unguarded entirely - the
  record-level one already has four chained checks by
  I-49/I-46/I-47/I-48, the field-level one had none before this task).
  The `HTML(&program-to-system-field)` field-reference form is NOT
  covered by the dedicated dropdown (only the quoted-literal form is,
  matching every one of its own DDS Reference examples) - still
  reachable via the raw keyword editor's free-text parameter box,
  unaffected by this task's own guard (which only checks the keyword
  NAME, not its parameter form). The Attributes tab's `DSPATR`/`COLOR`
  checkboxes (`wireColorAttrStatesEditor`) are rendered unconditionally
  for every constant type (MSGCON included, since MSGCON's own mutual
  exclusion list doesn't touch them) and were NOT gated against HTML's
  own, wider exclusion list - a disclosed, narrow gap (only reachable by
  creating an HTML constant, then separately visiting the Attributes tab
  to check `DSPATR`/`COLOR`), left for a future pass rather than
  expanding this task's own scope; the raw editor's guard already covers
  the far more likely path (typing the conflicting keyword by name).
  Two real bugs were found and fixed while wiring the new "Value source"
  branch, both `TypeError`s from code that enumerated
  `isSystemValueConstant`/`isMsgConConstant` without knowing about the
  new `isHtmlConstant` case: (1) the `p-fill` "Fill" button's wiring
  condition (`isConstant && !isSystemValueConstant && !isMsgConConstant`)
  didn't exclude `isHtmlConstant`, so selecting an HTML constant crashed
  `renderFieldProps` outright (`p-fill` is never rendered for a
  dedicated-form constant, same as MSGCON) - fixed by adding
  `&& !isHtmlConstant`; (2) the "Center" button's width-computation
  ternary fell through to `document.getElementById('p-const-text')`
  (which doesn't exist for an HTML constant) - fixed by adding an
  `isHtmlConstant` branch ahead of the plain-`isConstant` one, using the
  HTML tag text's own length. Both were caught by the new test's
  `window.addEventListener('error', ...)` hook (added specifically
  because the first bug's `TypeError` was initially masked - jsdom logs
  uncaught exceptions to stderr but doesn't fail the run, so the original
  test pass was a false green until this hook made every scenario assert
  `errors.length === 0`). New `i41HtmlConstantKeyword.test.js`: an
  existing HTML constant's dedicated form (pre-filled, no Text input,
  Apply doesn't corrupt the line, editing rewrites the parameter);
  "+ Add constant" creates a new HTML constant via the dropdown; the raw
  editor blocks HTML in both directions against a field carrying DSPATR
  (with an unrelated keyword unaffected); the raw editor blocks HTML on
  a field of an SFL record. Confirmed via `git stash` to genuinely fail
  (4 checks, one a real `TypeError` crash) against pre-fix code. Full
  suite: zero failures across 85 test files.
- `PSHBTNFLD`/`PSHBTNCHC` — push-button field. Scoping investigation
  (before implementation): structurally near-identical to the
  ALREADY-IMPLEMENTED `SNGCHCFLD`/`CHOICE` pair (Task on `mnuActFieldState`/
  `CHOICE(id 'text' [*SPACEB])` in `dspfWriter.js`) - `PSHBTNFLD` maps to
  `SNGCHCFLD`'s own selection-field flag (with its own distinct param list:
  `*NORSTCSR`/`*RSTCSR`, `*NUMCOL nbr`/`*NUMROW nbr`, `*GUTTER width`), and
  `PSHBTNCHC(choice-number choice-text [command-key] [*SPACEB])` maps to
  `CHOICE`'s own per-choice repeatable keyword, with one addition
  (`PSHBTNCHC`'s own optional command-key parameter, `CHOICE` has none).
  NOT the "brand new field kind requiring a redesign" this row originally
  flagged as a risk - `SNGCHCFLD`'s own existing UI/model is a genuine,
  reusable architectural template. Still a substantial, separate
  undertaking (new field-kind selector option, new choice-list editor
  panel, new param-parsing functions for `PSHBTNFLD`'s own 3-parameter
  format, command-key validation against `PSHBTNCHC`'s documented list of
  CA01-24/CF01-24/PRINT/HELP/CLEAR/ENTER/HOME/ROLLUP/ROLLDOWN) - split off
  as its own follow-up, **I-57** (next free ID as of this task), rather
  than attempted alongside HTML in this same task.

### I-42 — Extend `MOUBTN`/`VALNUM`/`WRDWRAP`/`USRDSPMGT`/`ENTFLDATR` level-scope to match DDS Reference

**Claimed.** Same audit as I-40 (see
`docs/sda-reference/source/dds-keyword-audit-report.md`, Finding C).
Each keyword below has exactly one call site in `webviewClientHelpers.js`,
always `'fk-'`-prefixed (file-level panel only), narrower than what the
DDS Reference allows:

- `MOUBTN` — DDS allows file, record; iSDA offers file only.
- `VALNUM` — DDS allows file, record, field; iSDA offers file only.
- `WRDWRAP` — DDS allows file, record, field; iSDA offers file only.
- `USRDSPMGT` — DDS allows file, record; iSDA offers file only.
- `ENTFLDATR` — DDS allows file, record, field; iSDA offers file + record
  (`entFldAtrHtml` called from both `fileKeywordsPanelsHtml` and
  `recordKeywordsPanelsHtml`), missing field-level.

I-5's own entry ("added file-level HLPRCD/MOUBTN/VALNUM/WRDWRAP")
confirms these were deliberately scoped to file-level only at the time —
this looks like legitimate untracked follow-up rather than something
overlooked and forgotten.

---

### I-43 — Fixed: `HLPRCD`/`HLPDOC` checkbox catch-22 (v0.10.121)

**Done.** Root cause confirmed exactly as filed: `commitHlprcd`'s three
sub-field listeners (`hlprcdRecord`/`hlprcdLibraryEl`/`hlprcdFileEl`) and
`commitHlpdoc`'s three (`hlpdocLabel`/`hlpdocDocument`/`hlpdocFolder`) each
called their commit function unconditionally on their own `change` event,
even while the checkbox was off. With the checkbox unchecked, that call
skips the required-field guard entirely (it's gated by
`if (hlprcdOn.checked && ...)`/`if (hlpdocOn.checked && ...)`) and falls
straight through to the unconditional
`onChange(...setFileFlagKeyword(..., false, ...))` at the bottom.
`present:false` makes `setFileFlagKeyword` discard the typed value, and
`commitFileEdit` → `commitSourceChange` calls `render()` **synchronously**
right after, regenerating the whole Help panel's HTML from the
still-keyword-less model — wiping the input back to blank. Checking the box
afterward reads that now-blank field, fails the required-field check added
in the `HLPRCD`/`HLPDOC` cross-verify follow-up above, alerts, and reverts
the checkbox — exactly the catch-22 reported.

Fix: guard each sub-field's `change` listener with
`if (!hlprcdOn.checked) return;` / `if (!hlpdocOn.checked) return;` before
calling `commitHlprcd()`/`commitHlpdoc()`. Only the checkbox's own listener
still commits unconditionally (both directions - turning on AND off must
still go through, since that's what actually adds/removes the keyword).
While the checkbox is off, editing a sub-field is now a pure no-op - no
`onChange`, no `render()`, nothing wiped - so whatever the user types sits
untouched in the DOM until they check the box, at which point
`commitHlprcd`/`commitHlpdoc` reads it fresh and has real values to
validate against, in either typing order ("type first" or "check first").

**Test-harness pitfall worth flagging:** `i38HlpdocFileLevel.test.js`
already exercises this exact "type all three parts, then check the box"
flow and passed even against the pre-fix, genuinely-broken code. It does
so because it captures `label`/`document2`/`folder`/`on` element
references once, up front, and keeps reusing those same references after
every render. `commitSourceChange`'s `render()` call regenerates
`propsBody.innerHTML` (and calls `wireFileKeywordsPanels` again, rebinding
fresh listeners to fresh elements each time) - so those original,
now-detached elements silently stop reflecting what's actually on screen,
and the test ends up validating a self-consistent but invisible orphaned
copy of the form rather than what a real user would type into. The new
regression test (`i43HlprcdHlpdocCheckboxCatch22.test.js`) re-queries every
element via `doc.getElementById` immediately after each step for exactly
this reason, and does reproduce the bug against pre-fix code (11 failing
checks) before going green against the fix. Left `i38`'s own test
untouched since it still passes and still covers real ground (conflict
guards, required-field validation, HLPRCD/HLPDOC coexistence) - just noting
the gap here so a future stale-reference regression doesn't slip through
the same way again.

---

## On the horizon

**Process note:** this section previously described I-31 through I-35 as
upcoming work. All of I-1 through I-37, plus the file-level `HLPDOC` gap
found and fixed as I-38, are now done — see each phase's own summary
table above (File-level, Record-level, Field-level) for per-task status
and landing version. The text below was left stale after I-35 closed
out; corrected here to log only what is genuinely still open, same kind
of drift I-25's own section once had (caught and fixed in I-16).

I-39 through I-48 are currently claimed (not yet implemented, except
I-43 which is now done - see the dedicated section below) - see their
own sections above (I-43 was a real bug, not an audit gap: `HLPRCD`/
`HLPDOC`'s checkboxes couldn't be turned on at all due to a catch-22 in
their sub-field commit wiring, fixed in v0.10.121. I-44 through I-48
split off a single larger finding - most record-level keywords don't
enforce `USRDFN`'s own whitelist restriction, despite the generic guard
function already existing and working correctly - into 5
independently-pickable pieces: I-44 is the core USRDFN-whitelist wiring
fix, I-45 is DSPMOD's own unrelated DSPSIZ prerequisite gap, and
I-46/I-47/I-48 are re-audits of whether `SFL`/`SFLCTL`, `WINDOW`, and
`MNUBAR` respectively have the same class of under-enforced blanket
restriction USRDFN turned out to have). What remains below is a set of
real, sourced gaps individual tasks logged but deliberately did not fix
(all still open as of v0.10.117):

- **From I-38 (file-level `HLPDOC`):** the help-specification-level form
  of `HLPDOC` (inside an H specification, alongside `HLPARA`) isn't
  modeled at all — file-level only was added. The reverse conflict
  direction against `HLPPNLGRP` has since been wired (see the
  `HLPRCD`/`HLPDOC` follow-up section above); `HLPRTN`'s own reverse
  direction is still not wired — its file-level row goes through the
  shared `commitIndicatorTextRow` helper, which has no per-keyword
  conflict hook.

- **From I-30 (Character fields):** `CHKMSGID`'s missing validity-check
  dependency guard; `CHRID`/`IGCALTTYP`'s mutual-exclusion lists; `DUP`'s
  floating-point restriction; `MSGID`'s position-dependent
  mandatory/forbidden conditioning rule.
- **From I-32 (Date/Time/Timestamp fields):** `REF`/`REFFLD` should copy
  `DATFMT`/`DATSEP`/`TIMFMT`/`TIMSEP`/`TEXT`/`ALIAS`/`CCSID`/`FLTPCN`/
  editing keywords from a referenced database field per the DDS
  Reference, but iSDA's own REF-resolution flow only pulls
  length/dataType/decimalPositions today.
- **From I-35 (Usage M/P):** Usage `P` fields have no reachable selection
  path anywhere in the current UI, so the fixed-keyword-list scoping
  I-35 added for Usage `P` can't actually be exercised yet.
- **From I-11/I-15/I-23:** whether SFLMSG's own General/Indicator
  categories (reusing I-9's SFL set verbatim) deserve distinct
  `KEYWORD-INDEX.json` categories of their own, rather than being
  implicitly covered, is a genuine index-completeness question raised
  during I-16 but not itself researched or resolved.
- `flagRowHtml`'s conditioning-eligibility mechanism (I-3) proved
  reusable for the field-level tasks (I-30 onward built on it directly)
  — noting this held, in case a future series needs the same pattern
  again.

Any of the above is a reasonable next task to open (its own claim
commit, its own `I-N`), but none is started.
