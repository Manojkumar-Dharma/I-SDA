# Maintainability and test-structure audit (2026-09-21, v0.10.195)

Static review of the repo at commit `23afb4d` (v0.10.195). Nothing was changed by the audit itself. The follow-up work is tracked as I-118 – I-123 in [`keywordFixes.md`](keywordFixes.md), to be picked **after I-40**.

**Method (all heuristic, so every finding is a candidate to verify, not a verdict):** AST parse of `src/*.js` (acorn), identifier-reference counts across production code and tests (comments stripped), token-level clone detection (renamed identifiers, 50-token windows), and a keyword-to-test coverage matrix built from `keyword-index/KEYWORD-LOOKUP.json` (169 keywords). Baseline: `npm run compile`, then all 145 test files pass.

## 1. Shape of the code

| File | Lines | Comment lines | Lines citing "Task I-nn" |
|------|-------|---------------|--------------------------|
| `dspfWriter.js` | 8,805 | 48% | 297 |
| `webviewClientHelpers.js` | 8,684 | 41% | 534 |
| `buildWebviewTemplate.js` | 7,092 | 37% | 245 |
| `dspfEngine.js` | 2,281 | 35% | 18 |

- 673 named functions in the four JS files; 8 are over 150 lines: `wireRecordKeywordsPanels` (775), `wireFileKeywordsPanels` (569), `recordKeywordsPanelsHtml` (343), `fileKeywordsPanelsHtml` (300), `wireSflCtlPanels` (214), `renderScreenHtml` (165), `sflCtlPanelsHtml` (154), `resolveScreen` (153).
- 67 `*ConflictReason` functions in `dspfWriter.js`, plus about 15 rule tables (`USRDFN_WHITELIST_KEYWORDS`, `SFL_RECORD_WHITELIST_KEYWORDS`, `PULLDOWN_CONFLICT_KEYWORDS`, `WINDOW_MUTEX_KEYWORDS`, `MNUBAR_WHITELIST_KEYWORDS`, `WRDWRAP_KEYWORD_CONFLICTS`, `IGCALTTYP_KEYWORD_CONFLICTS`, `NO_OPTION_INDICATOR_KEYWORDS`, `S36E_KEYWORD_RESTRICTIONS`, ...). Partly data-driven, but the rules live in three places (writer functions, UI row/guard wiring, docs).
- Roughly 35-45% of tokens in the two big files sit in repeated 50-token windows (includes the 275-line export map at the end of `dspfWriter.js`, which is a false positive; the hand-wired "alert + revert" guard idiom is the real driver).

## 2. Dead and stale candidates

**No callers anywhere:**
- `commandKeyNumbersInUse` (`dspfWriter.js:597`)
- `guardedSimple` (nested in `wireFileKeywordsPanels`, `webviewClientHelpers.js:4766`)

**Referenced only by tests (exported, no production caller); check for dynamic use, then delete or move to test helpers:** `setCommandKey`, `removeCommandKey`, `getValidityCheck`, `setValidityCheck`, `getEditCodeParts`, `getInputKeywords`, `setInputKeywords`, `noOptionIndicatorKeywordNames`, `getGeneralFieldKeywords`, `setGeneralFieldKeywords`, `getReferenceOverrides`, `setReferenceOverrides`, `getMessageId`, `setMessageId`, `getFileQuotedTextConditions`, `setFileHlpPnlGrpKeyword`, `setFileHlpSchIdxKeyword`, `getMnubardspFields`, `setMnubardspFields`, `colorAttrEditorHtml`, `wireColorAttrEditor`, `wireTwoField`.

**Unreferenced files:** `src/fixtures/generateMenubarFixture.js`, `generateWidgetFixture.js`, `generateWindowRefsFixture.js`, `smoketest.js` (`.gitignore` already says the first three's outputs were committed by mistake).

**Stale docs:** `KEYWORD-INDEX.json`/`.md`/`KEYWORD-LOOKUP.json` are hand-generated and "NOT auto-synced" (I-40 regenerates them). The `keywordFixes.md` header count had drifted ("113 of 117", v0.10.193) before this audit.

## 3. Duplicated helpers

- `escapeHtml`: two versions (`webviewClientHelpers.js:8549`, `dspfEngine.js:1829`) that escape different character sets (the engine one also escapes `'`).
- `isPulldownRecord`: `webviewClientHelpers.js:7826` and `dspfEngine.js:643`.
- `assembleParams` (`:4990`, `:6962`) and `makeDefaultInstance` (`:1127`, `:5431`): byte-for-byte identical pairs.
- `wireRemoveButtons` (`:3236`, `:3675`) and `commitHlpdoc` (`:5201`, `:7134`): same job, different class prefix or slightly different body.
- Structural clones: `getFileMsgLocLines`/`getSflMsgRcdLines` and their setters, `dupFloatNewConflictReason`/`blkfoldFloatNewConflictReason`, `nextAvailableFieldName`/`nextAvailableRecordName`, `setMenubarChoiceConditions`/`setChoiceConditions`.
- `parseScreenSizes` (`dspfEngine.js:92`) and `parseDisplaySizeTriples` (`dspfWriter.js:6567`): kept in sync by hand (see `learnings.md`; `dspfWriter.js` is injected as a plain `<script>`, so a `require()` is not an option, but a generated or shared-source step is).
- `buildMenuWebviewTemplate.js` shares about 28% of its long lines verbatim with `buildWebviewTemplate.js`.

## 4. Tests

- 145 test files, 6,799 `check()` calls, all passing at this commit.
- Every file defines its own `check()` (145 copies); 132 use jsdom and build the 1.65 MB generated page **223 times** in total. There is no shared runner. Other copy-pasted helpers: `makeDom`, `reparsedField`, `withAlertCapture`, `mount`, `setup`, `lastEdit`, `kwd`.
- Full suite wall time was about 17 minutes on a shared single core (`dspfWebview.test.js` about 170 s, `i70`, `i69`, `i104`, `i57` next). Absolute timings are inflated; the relative cost is what matters.
- Tests are organised by **task**, not by **keyword**. Keywords named in the header of many test files: `MNUBAR` 21, `SFLCTL` 20, `HLPRTN` 13, `HELP`/`KEEP`/`PRINT` 12 each, `PASSRCD` 11, `INVITE`/`PULLDOWN`/`WINDOW` 10 each. The record-type x keyword cross-product is swept repeatedly (`i44`, `i49`, `i53`, `i54`, `i102`, `i104`, `i109`).
- Gaps: `RMVWDW`, `SFLCSRRRN`, `SFLDLT`, `USRRSTDSP` appear in no test; `IGCCNV`, `RMVWDW`, `SFLCLR`, `SFLCSRRRN`, `SFLDLT`, `SFLDSPCTL`, `SFLEND`, `SFLINZ`, `SFLMSGKEY`, `USRRSTDSP` are never the subject of any test header.
- 203 check labels are reused across files (mostly generic: "no uncaught errors", "function is exported"); 192 labels repeat inside one file. A weak duplicate signal on its own.

## 5. Proposed structure for the keyword-based tests

Dimensions per keyword: **constraints** (mutex, whitelist, option indicators, data-type/usage eligibility), **parameters and sub-parameters** (grammar, ranges, required/optional), **usage** (levels, record types), **dependency** (requires / requires-not), **display** (which panel and row, and gating) and **selection and behaviour** (every commit path: checkbox, raw keyword editor, Basic tab).

1. One declarative spec per keyword, verified against `DDS_Keyword_V7r6.txt` (not against existing code, given the fabricated-keyword history).
2. Generated layers: L1 pure rule checks (spec vs `*ConflictReason`), L2 parse/write round-trip of parameters, L3 UI display and selection (one jsdom per record type iterating rows), L4 behaviour through each commit path.
3. A shared harness with a real runner and one jsdom per suite.
4. Migration: map each existing `check()` to a keyword x dimension cell; delete only when a generated cell covers it and a stash-based mutation run shows that cell fails when the rule is broken. Keep genuinely unique regressions.
