# DDS Keyword Inventory Audit — DDS Reference vs. iSDA

**Date:** 2026-09-16
**Method:** Two independent inventories, cross-referenced, with every discrepancy re-verified against the actual source (`src/dspfWriter.js`, `src/webviewClientHelpers.js`, `src/buildWebviewTemplate.js`) rather than trusting either inventory blindly.

1. **DDS reference inventory** — built by parsing `docs/sda-reference/source/DDS_Keyword_V7r6.txt` section-by-section, extracting each keyword's documented level(s) from its own "You use this `<level>` keyword..." / "This `<level>` keyword..." sentence. 177 individual keyword codes identified (compound entries like `ERRMSG and ERRMSGID`, `ROLLUP/ROLLDOWN`, `CAnn`/`CFnn` split into individual codes).
2. **iSDA inventory** — started from `docs/sda-reference/keyword-index/KEYWORD-INDEX.json` (156 keywords), then every discrepancy was individually re-checked against current source, because that index's own `meta.generated: 2026-09-15` notes stop at Task I-30 and the project has since completed I-31–I-35, I-38, and claimed I-39.

**Note on overlap with I-38/I-39:** this audit was done independently and only cross-checked against `keywordFixes.md` afterward. I-38 (done, v0.10.116) already closed the file-level `HLPDOC` gap this audit also found. I-39 (claimed, not yet implemented as of this writing) already found and claimed `BLKFOLD`, `CSRINPONLY`, `FLTFIXDEC`, `FLTPCN`, `MAPVAL`, `SFLCHCCTL`, `SFLCSRPRG`, `SFLRTNSEL` as genuinely-missing field/record-level keywords, and separately confirmed `CMP`/`AUTO`/`LOWER`/`SETOFF`/`ROLLUP`/`ROLLDOWN` are **deliberately** not given their own UI controls (legacy aliases of `COMP`/`CHECK`/`SETOF`/`PAGEDOWN`/`PAGEUP`, per the DDS Reference's own "the X keyword is preferred" wording). This report has been edited to remove all of that overlap — everything below is either confirmation of I-38/I-39's own findings from an independent angle, or genuinely new findings I-38/I-39 did not cover. **Do not re-claim I-39's 8 keywords or the legacy-alias keywords under any new task number below.**

Separately, I-30's own audit already investigated and explicitly signed off on `KEYBRD` (iSDA's Keying-Options-screen prompt for the field's position-35 data type) as **not** a bug — it's deliberately not a real keyword, matches the code's own doc comment, and needs no fix. This report does not re-flag it.

This audit only covers **keyword existence and level (file/record/field)**. It does **not** check per-record-type or per-field-datatype applicability, conditioning eligibility, or mutual-exclusion rules — that is explicitly the next task, as noted.

---

## Finding A — `KEYWORD-INDEX.json`/`.md` has level-label inaccuracies (documentation only, code is correct)

Re-tracing each keyword's actual call site in `webviewClientHelpers.js`/`buildWebviewTemplate.js` shows the **code** already matches the DDS Reference in every one of these cases — only the **index's level labels** are wrong:

| Keyword | Index currently says | Actual (code + DDS Reference agree) | Evidence |
|---|---|---|---|
| `CHECK` | file, record, field | **field only** | `checkInstancesHtml` is only ever invoked from `validityCheckSectionHtml`/`keyingOptionsHtml`, both field-level panels |
| `HLPPNLGRP` | file, **record** | file **+ help-spec** (never record) | The second surface (`applicationHelpFieldsHtml`) is invoked only from the help-specification (`*PNLGRP` H-spec) editor in `buildWebviewTemplate.js`'s `renderRecordProps` (`help.keywords`) — a distinct DDS artifact type from display-file records, not an actual record-level display-file surface |
| `SFLMSGKEY` | **record** | **field** | Written/read only via `subfileFieldKeywordsHtml`, a field-level panel |
| `SFLPGMQ` | **record** | **field** | same |
| `SFLRCDNBR` | **record** | **field** | same |
| `SFLROLVAL` | **record** | **field** | same |
| `SFLSCROLL` | **record** | **field** | same |

Also missing from the index entirely despite being implemented in code (stale since the index wasn't regenerated after I-31–I-34/I-38 landed):

| Keyword | Level | Where implemented |
|---|---|---|
| `DATE`, `TIME`, `USER`, `SYSNAME` | field | `buildWebviewTemplate.js`, `SYSTEM_VALUE_KEYWORD_NAMES` (I-33) |
| `MSGCON` | field | `dspfWriter.js` `parseMsgConParams`/`formatMsgConParams` (I-33) |
| `SFL` | record | `webviewClientHelpers.js` `rebuildRecordSelect`/`buildTypedRecordPlan`/`isSflRecord` |
| `USRDFN` | record | same file, `buildTypedRecordPlan`/`isUsrDfnRecord` |
| `WDWTITLE` | record | `dspfWriter.js` `getWindowTitleText`/`setWindowTitleText` |
| `HLPDOC` | file | Added by I-38 (v0.10.116) — index just hasn't been regenerated since |

**Suggested action:** regenerate `KEYWORD-INDEX.json`/`.md`/`KEYWORD-LOOKUP.json` via `build_index.py`/`build_lookup_and_md.py` against current source, correcting the 7 level-label errors above and adding the missing entries. Pure documentation task, no `src/` changes.

---

## Finding B — Genuinely missing keywords not already covered by I-39

Confirmed **zero occurrences** anywhere in `dspfWriter.js`, `webviewClientHelpers.js`, or `buildWebviewTemplate.js`, and **not** among I-39's already-claimed 8:

| Keyword | DDS level | What it does |
|---|---|---|
| `HTML` | field | Hypertext Markup Language keyword — no legacy-alias exemption applies (unlike CMP/AUTO/LOWER/SETOFF/ROLLUP/ROLLDOWN, this isn't a deprecated synonym of something iSDA already has) |
| `PSHBTNFLD` | field | Push Button Field — likely needs a new field *kind*, not just a flag keyword, since push-button fields aren't modeled as a field type in iSDA at all currently |
| `PSHBTNCHC` | field | Push Button Field Choice — depends on `PSHBTNFLD` existing first |

---

## Finding C — Confirmed level-scope gaps (keyword implemented, but narrower than DDS allows)

Traced via call-site counting — each of these has exactly one call site, always `'fk-'`-prefixed (file-level panel only):

| Keyword | DDS allows | iSDA currently offers | Gap |
|---|---|---|---|
| `MOUBTN` | file, record | file only | Missing record-level |
| `VALNUM` | file, record, field | file only | Missing record + field |
| `WRDWRAP` | file, record, field | file only | Missing record + field |
| `USRDSPMGT` | file, record | file only | Missing record-level |
| `ENTFLDATR` | file, record, field | file + record (`entFldAtrHtml` called from both `fileKeywordsPanelsHtml` and `recordKeywordsPanelsHtml`) | Missing field-level |

`keywordFixes.md`'s own I-5 entry ("added file-level HLPRCD/MOUBTN/VALNUM/WRDWRAP") confirms these were deliberately scoped to file-level only at the time — the record/field variants look like legitimate untracked follow-up rather than something overlooked and forgotten.

---

## Summary for tracking

Three new tasks queued below as I-40 through I-42, none overlapping I-39's claim:

- **I-40**: `KEYWORD-INDEX.json`/`.md`/`KEYWORD-LOOKUP.json` regeneration — fix the 7 level-label inaccuracies (Finding A) and add the 9 stale-missing entries. Documentation only.
- **I-41**: Add missing field-level keywords `HTML`, `PSHBTNFLD`, `PSHBTNCHC` (Finding B).
- **I-42**: Extend `MOUBTN`/`VALNUM`/`WRDWRAP`/`USRDSPMGT` to record level, and `VALNUM`/`WRDWRAP`/`ENTFLDATR` to field level, per DDS Reference scope (Finding C).

**Explicitly out of scope for this pass:** none of the above checks per-record-type or per-field-datatype eligibility (e.g. whether `DATFMT` is valid on a non-date field). That's the next task.
