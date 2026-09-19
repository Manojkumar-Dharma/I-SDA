# Changelog

All notable changes to iSDA, latest first. One line per version: what changed and why.
Detail lives in `git log` (each version has a matching commit); features in
[`README.md`](README.md); tracked work in
[`docs/sda-reference/keywordFixes.md`](docs/sda-reference/keywordFixes.md) (`I-` keyword
audit) and [`docs/sda-reference/LIMITATIONS-PLAN.md`](docs/sda-reference/LIMITATIONS-PLAN.md)
(`L`/`M`/`P`/`S36-` tasks).

Task prefixes: **I** keyword-compliance audit · **L**/**M** designer fixes and features ·
**P** New UI · **R**/**D** picker foundation · **S36** DSPF36 / S/36E.

## 0.10.79 and later — Keyword-compliance audit (I-series) and follow-ups

- **0.10.153** — I-85 (raised by I-81): removing `PSHBTNFLD` while a `PSHBTNCHC` stays, or the last `PSHBTNCHC` while `PSHBTNFLD` stays, is now hard-blocked (the DDS Reference requires both together) — the removal direction I-57/I-64 left open. New diff-based `pshbtnfldRemovalConflictReason` at the `commitEdit` choke point covers the raw editor and the panel's choice rows; the panel's toggle-off and already-invalid hand-written fields still edit.
- **0.10.152** — I-84 (raised by I-77): `RTNCSRLOC`'s `SFL`/`MNUBAR`/`USRDFN` guards now fire only on a real turn-on (box ticked and that variant not already present). Un-ticking, or editing the parameters of, a hand-edited `RTNCSRLOC` on such a record no longer gets a misleading "cannot be added" alert.
- **0.10.151** — I-77 (raised by I-56, I-60): `RTNCSRLOC` is now blocked on a `USRDFN` record — it is not on `USRDFN`'s closed whitelist (I-49) and its own parameters must be hidden fields, which "no fields are valid" on a user-defined record; I-56's reasoning for leaving `USRDFN` out did not survive that. Both hand-rolled commits (`*RECNAME` and `*WINDOW`/`*MOUSE`) check it, on the on-transition only, so a hand-edited `USRDFN` record can still have `RTNCSRLOC` removed. I-83 (raised by I-41): the Attributes tab's structured editors are now gated against `HTML`'s exclusion list — Color & attributes (`COLOR`/`DSPATR`) and, found by probing the real panel, the General keywords rows `DFT`/`HLPID`/`PUTRETAIN`/`OVRATR`/`NOCCSID`, all of which could be added to an `HTML` constant. A shared `withAddGuard` checks only newly added keyword names, so removals and edits to keywords already present are never blocked.
- **0.10.150** — I-80 (raised by I-39): `SFLCSRPRG` vs `SFLLIN` is now hard-blocked in both directions — introducing `SFLCSRPRG` on a field of a subfile record whose control record carries `SFLLIN`, or introducing `SFLLIN` on a control record (or retargeting its `SFLCTL`) whose subfile record has a `SFLCSRPRG` field. IBM's sentence ("SFLLIN is not allowed in a record that contains the SFLCSRPRG") is unsatisfiable read literally, so the guard enforces the reading through `SFLCTL(sfl-record)`; the interpretation is documented in `keywordFixes.md` for review. Diff-based at the `commitEdit`/`commitRecordEdit` choke points; already-invalid hand-written pairs stay editable. Also wired I-79's `i79SflchcctlStructuralRules.test.js` into the `npm test` script, where it had been left out.
- **0.10.149** — I-79 (raised by I-39): `SFLCHCCTL`'s three DDS-Reference rules are now enforced — turning the field on auto-rewrites its length/type/decimals/usage to the required 1/Y/0/H shape (mirroring I-57's `PSHBTNFLD` rewrite-on-enable), blocked via the Basic tab's Apply if a later edit would break that shape, and hard-blocked outright when the field isn't the record's first field or another field already carries the keyword. Reorder-induced first-field violations and the `SFLNXTCHG` cross-keyword exclusion logged as deferred findings.
- Docs (no version): `keywordFixes.md` restructured — one status table for I-1 – I-83, one `### I-N` section per task, versions reconciled with this file; `README.md` rewritten; this changelog condensed and 0.10.121 restored.
- **0.10.148** — I-69 (raised by I-30): `CHKMSGID` is now enforced against its own DDS rules — allowed only on a field that also has `CHECK(M10/M11/VN/VNE)`, `CMP`, `COMP`, `RANGE` or `VALUES`, and only on an input-capable field. Diff-based at the `commitEdit` choke point in both directions (introducing it with no qualifier; removing the last qualifier while it stays, with a "remove CHKMSGID first" message), plus the raw editor's add and the Basic tab's usage Apply; already-invalid hand-written fields stay editable. `&message-data-field` validation logged as a deferred finding.
- **0.10.147** — I-81 (raised by I-39): `SFLRTNSEL` now requires `SFLMLTCHC` or `SFLSNGCHC`, hard-blocked in both directions — adding it without one, and removing the last one while it stays — for the panel and the raw editor alike, via a diff-based check in `commitRecordEdit`. Already-invalid hand-written records still edit.
- **0.10.146** — I-62: the Basic tab's Apply now blocks changing a `PSHBTNFLD` field's data type, length, decimals or usage away from the required `Y` / 2 / 0 / input-capable definition (driven by I-57's `pshbtnfldDefinitionUpdates`). Diff-based, so unrelated edits on an already-invalid field still work.
- **0.10.145** — I-68: `HLPRTN`'s file-level checkbox now gets the reverse of I-38's `HLPDOC`/`HLPRTN` exclusion — ticking it while `HLPDOC` is present is blocked (off→on only, so hand-edited files stay editable). `HLPRCD`/`HLPPNLGRP` alongside `HLPRTN` stay allowed. Cross-level scope logged as a deferred finding.
- **0.10.144** — I-66: `PSHBTNCHC` choice-text validation per the DDS Reference — `>` mnemonic / `>>` literal rules (errors: more than one mnemonic, `>` with no mnemonic, blank or double-byte mnemonic; only new text is checked), plus panel warnings for shared mnemonics and estimated fit.
- **0.10.143** — I-64: `PSHBTNFLD`'s ten-keyword whitelist was enforced only in the raw editor, the toggle and Choice selection type; new diff-based `pshbtnfldNewConflictReason` in `commitEdit` closes the gap for every other field panel at once.
- **0.10.142** — I-65: push-button fields get editors for `CHCCTL` and `CHCAVAIL`/`CHCUNAVAIL` (allowed by the whitelist, previously reachable only via the raw editor); the colours editor is reused restricted to Available/Unavailable, since `CHCSLT` isn't allowed.
- **0.10.141** — I-63: `SNGCHCFLD`/`MLTCHCFLD` `*NUMCOL`/`*NUMROW`/`*GUTTER` were written as invalid `*NUMCOL(3)` and dropped on read-back; now IBM's `(*NUMCOL 3)` shape (old shape still read and corrected), with the three invalid combinations blocked on Apply.
- **0.10.140** — I-61: the Basic tab's Apply now blocks changing a `WRDWRAP` field to a data type (`S`/`Y`/`D`/`M`/`F`/`J`/`O`/`E`/`G`) or usage (not `I`/`B`) the DDS Reference forbids for it. Diff-based, so unrelated edits on an already-invalid field still work.
- **0.10.139** — I-57: implemented `PSHBTNFLD`/`PSHBTNCHC` (push-button field) — field-level accordion, new add-field kind, ten-keyword whitelist via `pshbtnfldConflictReason`; preview now draws each choice as its own button. Follow-ups opened as I-62 – I-66.
- **0.10.138** — I-59: the shared `ENTFLDATR` editor now round-trips a bare `ENTFLDATR` and `*NOCURSOR` (both were silently dropped on every Apply); non-blocking hint for `*NOCURSOR` on a non-`I` field. `CHCAVAIL`/`CHCUNAVAIL`/`CHCSLT` callers unaffected.
- **0.10.137** — I-58: reverse direction of `WRDWRAP`'s mutual exclusion — its conflicting keywords (`AUTO(RAZ/RAB)`, `CHECK`, `CHGINPDFT(MF)`, `DSPATR(OID/SP)`, `DUP`, `FLTFIXDEC`, `IGCALTTYP`) can no longer be added to a `WRDWRAP` field.
- **0.10.136** — I-60: the record-level `ENTFLDATR` Apply guard now also checks `USRDFN`'s whitelist (it only checked SFL and MNUBAR). Removing a hand-edited `ENTFLDATR` from a `USRDFN` record is still allowed.
- **0.10.135** — I-42: widened level scope to match the DDS Reference — `MOUBTN`/`VALNUM`/`WRDWRAP` now also record-level; `VALNUM`/`WRDWRAP`/`ENTFLDATR` now also field-level. `USRDSPMGT` stays file-level only (audit false positive).
- **0.10.134** — I-55/I-56: SFL/MNUBAR whitelist guards now also cover the repeatable-instance editor (`MNUBARDSP`, `CLEAR`/`HOME`) and `RTNCSRLOC`'s two commits, which had no guard at all. `USRDFN` deliberately unchecked for both.
- **0.10.133** — I-41: added field-level `HTML` (a constant-field value source, like `MSGCON`), enforcing its two DDS Reference restrictions in the raw keyword editor. `PSHBTNFLD`/`PSHBTNCHC` split off as I-57.
- **0.10.132** — I-54: swept a MNUBAR record's structured checkboxes against `MNUBAR`'s whitelist — the three shared guarded-wiring functions and `ENTFLDATR`'s Apply now check it; `PRINT` needs no change (it is whitelisted). Found I-56.
- **0.10.131** — I-53: swept an SFL record's structured checkboxes against `SFL`'s whitelist — the three shared guarded-wiring functions, `PRINT`'s commit and `ENTFLDATR`'s Apply now check it. Repeatable-instance editor logged as I-55.
- **0.10.130** — I-48: `MNUBAR`'s DDS Reference is a closed 27-keyword whitelist; new `mnubarWhitelistConflictReason` guards the record-level raw keyword editor (`CAnn`/`CFnn` matched by pattern). Checkbox sweep logged as I-54.
- **0.10.129** — I-47: `WINDOW` excludes six keywords (`ALWROL`, `ASSUME`, `MNUBAR`, `PULLDOWN`, `SFL`, `USRDFN`); new bidirectional `windowMutexConflictReason` guards the raw keyword editor. `SFLCTL` is explicitly allowed with `WINDOW`.
- **0.10.128** — I-46: `SFL`'s DDS Reference is a closed whitelist (message subfiles have a narrower one); new `sflWhitelistConflictReason` guards the raw keyword editor. `SFLCTL` needs no change. Checkbox sweep logged as I-53.
- **0.10.127** — I-52: `DSPMOD` cannot be specified on a plain `SFL` record (`SFLCTL` is exempt); new `dspmodSflConflictReason` blocks it. Found while implementing I-45.
- **0.10.126** — I-45: `DSPMOD` is only valid when `DSPSIZ` declares both 24x80 and 27x132 (either order); now enforced. Found a second `DSPMOD` restriction, logged as I-52.
- **0.10.125** — I-49: the Advanced/raw keyword accordion bypassed every `USRDFN` guard; it now checks `USRDFN`'s whitelist (`INVITE`/`KEEP`/`PASSRCD`/`HLPRTN`/`HELP`/`HLPCLR`/`PRINT`/`OPENPRT`/`TEXT`) directly.
- **0.10.124** — I-51: `wirePulldownGuardedFlag` never wired its Conditioning toggle, so 13 keywords (`ALARM`, `FRCDTA`, `OVERLAY`, `INVITE`, ...) showed a dead toggle; now live. Also synced `package-lock.json` and registered I-50's test in `npm test`.
- **0.10.123** — I-50: `RETLCKSTS` rendered a parameters box although IBM documents no parameters; removed (its Conditioning toggle is kept).
- **0.10.122** — I-44: 29 more record-level keywords now enforce `USRDFN`'s closed whitelist (only 4 did; 4 candidates were help-level false positives). Just `RETKEY`/`RETCMDKEY`/`CSRINPONLY`/`INZRCD` were UI-reachable. Found I-49/I-50/I-51.
- **0.10.121** — I-43: `HLPRCD`/`HLPDOC` checkboxes could not be turned on — sub-field edits committed while the box was off and wiped the typed value. Sub-field listeners now do nothing until the box is checked.
- **0.10.120** — L86: `serializeFieldEntry` reordered untouched keywords when another keyword on the same field was edited (L85's bug, at field level); fixed with the shared `keywordsExcept` helper.
- **0.10.119** — L85: editing one file- or record-level keyword reordered other, untouched keyword lines; `keywordsExcept` now preserves document order.
- **0.10.118** — I-39: full-text audit found 8 keywords missing entirely (`BLKFOLD`, `CSRINPONLY`, `FLTFIXDEC`, `FLTPCN`, `MAPVAL`, `SFLCHCCTL`, `SFLCSRPRG`, `SFLRTNSEL`); added as flag/parameter rows, restrictions shown as hints.
- Docs (no version): `keywordFixes.md`'s open-work notes corrected after I-37; no code changed.
- **0.10.117** — Follow-up to I-38: `HLPRCD` + `HLPDOC` together is valid DDS. Fixed the real gaps found — `HLPPNLGRP` vs `HLPRCD` exclusion, `HLPDOC`'s reverse `HLPPNLGRP` direction, and required-field validation for both keywords.
- **0.10.116** — I-38: `HLPDOC` was missing at file level; added (label, document, folder — all required; Conditioning) with a bidirectional guard against `HLPPNLGRP`/`HLPRTN`. Help-specification-level `HLPDOC` deferred.
- **0.10.115** — I-35: Usage `M`/`P` no longer fail open — each shows only IBM's fixed keyword list (General Keywords and Database Reference rows). Usage `P` has no reachable selection path in the UI (logged).
- **0.10.114** — I-32: added Date format (`DATFMT`/`DATSEP`, type `L`) and Time format (`TIMFMT`/`TIMSEP`, type `T`) accordions; `*ISO`/`*USA`/`*EUR`/`*JIS` can't combine with a separator. Removed a bogus record/file-level `DATFMT` fallback.
- **0.10.113** — I-31: `EDTMSK` split from the `EDTCDE`/`EDTWRD` selector so it can coexist with either as IBM requires; L/T/Z Usage restriction (O/B/I) enforced; removed dead shift-value checks for `B`/`P`.
- **0.10.112** — I-34: `MLTCHCFLD` no longer offers SNGCHCFLD-only `*AUTOSLT`/`*AUTOENT`; added missing Conditioning toggles on choice keywords; batch rewrites no longer wipe conditioning; added `CHOICE`'s `*SPACEB`.
- **0.10.111** — I-36/I-37: `ALWROL`/`CLRL`/`SLNO` are hard-blocked for the `PASSRCD` record and alongside `ASSUME`/`SFL`/`SFLCTL`/`USRDFN`.
- **0.10.110** — I-33: added missing `MSGCON` (Message Constant) as a full peer of the system-value sub-form; removed `PAGNBR` (never real DDS syntax); fixed `GENERAL_FIELD_KEYWORD_ROWS` gating wrong keywords onto constants vs. named fields in both directions.
- **0.10.109** — I-30: character-field audit — fixed wrongly conditionable rows (`CHECK`, `RANGE`, `COMP`, `VALUES`, `DSPATR`, `BLANKS`, `CHANGE`, 10 of 14 General rows) and 3 index-builder bugs; added `TEXT`/`HLPID`. Remaining gaps logged.
- **0.10.108** — I-16: regenerated `KEYWORD-INDEX`/`KEYWORD-LOOKUP` against the codebase after I-7 through I-29 (docs only — dropped bogus `PRTFILE`, added missing keywords, marked `MNUBARDSP`/`HLPTITLE` repeatable, added `SFLSNGCHC`/`SFLMLTCHC`/`SFLSCROLL`).
- **0.10.107** — I-26: added missing `SFLSNGCHC`/`SFLMLTCHC` (record-level selection-list) and `SFLSCROLL` (field-level) keywords, each with their own mutual-exclusion rules and pulldown-conditional defaults.
- **0.10.106** — I-28: fixed `KEEP`'s invalid Conditioning toggle on the base Record Keywords panel; hard-blocked `KEEP` from combining with `ALWROL`/`CLRL`/`SLNO` on the same record.
- **0.10.105** — I-27: record-level `HLPTITLE` rebuilt as a repeatable, independently-conditioned instance list (up to 15/record), matching IBM's documented shape.
- **0.10.104** — I-29: confirmed the "Roll" column on SDA's Define Display Layout screen is a generic duplicate-keyword scroller, not a hidden parameter — no code change needed.
- **0.10.103** — I-23: audited keywords implied to conflict with `SFLMSGRCD`; added an advisory note for `LOGINP`/`LOGOUT` (ignored, not blocked); `KEEP`/`TEXT` individually ruled out; the rest left unguarded pending clearer DDS wording.
- **0.10.102** — I-22: fixed `SFLSIZ`/`SFLPAG`/`SFLLIN` silently losing all but their first display-size instance; added per-size input rows and hard-blocked `SFLSIZ`'s field-name/display-size conflict.
- **0.10.101** — I-20: hid the Conditioning toggle for `VLDCMDKEY`/`SETOF`/`CHANGE`/`INDTXT` (not indicator-eligible); blocked `CLEAR` on `PULLDOWN` records, defaulting to `HOME` there instead.
- **0.10.100** — I-25: consolidated `KEEP`'s 4 duplicate panels (base/SFL/SFLMSG/SFLCTL) to one live control on the base tab, with hints pointing back to it from the rest.
- **0.10.99** — I-24: hard-blocked `WINDOW` from being specified for the record named by file-level `PASSRCD`, in either direction.
- **0.10.98** — I-21: fixed `CSRLOC`/record-level `HLPTITLE` losing their conditioning indicators on every edit; both gained a Conditioning toggle.
- **0.10.97** — I-19: added an advisory note flagging a `MNUBAR` record missing, or duplicating, its MNUBARCHC-bearing field.
- **0.10.96** — I-18: hard-blocked `MNUBARSW`/`MNUCNL` from sharing a CA key, across all file/record scope combinations.
- **0.10.95** — I-17: `MNUBARDSP` rebuilt as a repeatable, independently-conditioned instance list, matching IBM's documented shape.
- **0.10.94** — I-15: confirmed `WINDOW`+`SFLCTL`/`PULLDOWN`+`SFLCTL` combination records build correctly; found `SFLSNGCHC`/`SFLMLTCHC` entirely missing (split to I-26).
- **0.10.93** — I-12: hard-blocked `ALWROL`/`ASSUME` from combining with `WINDOW` on the same record; confirmed `WDWBORDER` sharing and other `WINDOW` parameters already correct.
- **0.10.92** — I-13: hard-blocked 22 of the 27 keywords IBM documents as incompatible with `PULLDOWN` records, bidirectionally.
- **0.10.91** — I-14: removed `MNUBAR`'s invalid Conditioning toggle; confirmed `MNUBARSW`/`MNUCNL`/`MNUBARDSP` already correct.
- **0.10.90** — I-10: removed the Conditioning toggle from `SFLCTL`/`SFLMODE`/`SFLENTER`/`SFLRNA`; propagated I-9's `LOGINP`/`KEEP`/`CHECK` fix to this panel's own copy.
- **0.10.89** — I-8: hard-blocked `ALWROL`/`ASSUME`/`HLPSEQ`/`HLPCMDKEY` from turning on on a `USRDFN` record.
- **0.10.88** — I-7: removed the Conditioning toggle from 11 base `RECORD` keywords not eligible for it.
- **0.10.87** — I-4: fixed invalid DDS in `MNUBARSW`/`MNUCNL`, added `REF`'s missing parameter, corrected reversed field hints, added missing `'text'` sub-parameters to 7 keywords.
- **0.10.86** — I-9: SFL panel's `LOGINP`/`KEEP`/`CHECK`(AB,RL) lost their Conditioning toggle (IBM: not eligible); `SFLNXTCHG`/`LOGOUT` confirmed correctly keep it.
- **0.10.85** — I-6: file-level `TEXT` removed — IBM documents it as record-/field-level only; record-level `TEXT` unaffected.
- **0.10.84** — I-11: `SFLNXTCHG` now hard-blocked from turning on while `SFLMSGRCD` is present — IBM documents the two as mutually exclusive.
- **0.10.83** — I-2: `PRTFILE` removed — not a real DDS keyword; the printer file name is `PRINT`'s own third parameter form.
- **0.10.82** — I-3: full conditioning-eligibility audit, all 39 file-level keywords — Conditioning toggle removed from 13 wrongly offering it, added to `ENTFLDATR`/`WDWBORDER` which wrongly lacked it.
- **0.10.81** — S36-3 correction: verified `ALTNAME`/`MSGID`/`RETKEY`/`RETCMDKEY` against the official IBM PDF (not `USRDSPMGT`-gated after all); fixed a `PRINT(*PGM)` false positive.
- **0.10.80** — L84: fixed `SFLMSGRCD` losing its first display size's conditioned value when both sizes were explicitly conditioned.
- **0.10.79** — I-5: added 4 missing file-level keywords (`VALNUM`/`WRDWRAP`/`HLPRCD`/`MOUBTN`); confirmed `ROLLUP`/`ROLLDOWN` already correct.

## 0.10.0 – 0.10.78 — Designer polish, New UI (P-series), DSPF36 / S36E, L-series fixes

- **0.10.78** — L75: SFLCTL Display Layout row now commits immediately on change, like every other row, instead of needing a separate Apply button.
- **0.10.77** — L82/L83: extended the DFT/DFTVAL conflict guard to `EDTCDE`/`EDTWRD`; surfaced DFT's `PUTOVR`/`OVRDTA` requirement as an advisory note.
- **0.10.76** — L81: `DFT`/`DFTVAL` now hard-blocked from the DDS-invalid combinations IBM documents (each other, `EDTCDE`/`EDTWRD`, floating-point fields).
- **0.10.75** — L80: `SFLMSGRCD` gained `DSPSIZ` conditioning, mirroring `MSGLOC`'s existing shape.
- **0.10.74** — L79: fixed 3 field-level picker gaps vs real SDA — Database Reference (`REFFLD` direct entry), Message ID (4 structured prompts), Keying Options (`KEYBRD` wasn't a real keyword; now writes `dataType` directly).
- **0.10.73** — S36-6: docs only — `.dspf36` README mention + S36E-conditional notes on the keyword-index files.
- **0.10.72** — S36-5: `.dspf36`/DSPF36 members now compile via `CRTS36DSPF`, not `CRTDSPF`.
- **0.10.71** — S36-4: S36E keyword restrictions are now hard-blocked in the UI, not just a warning.
- **0.10.70** — S36-3: built the S36E restriction rule table — `CHANGE`/`HELP`/`HLPRTN`/`PRINT(*PGM)` verified against IBM's reference; `ALTNAME`/`MSGID`/`RETKEY`/`RETCMDKEY` left open rather than guessed.
- **0.10.69** — L78: fixed `DSPSIZ`'s bare `*DS3`/`*DS4` form (no lines/cols given) being silently mishandled by the parser.
- **0.10.68** — S36-2: confirmed `USRDSPMGT`'s file-level flag already worked correctly — no code change needed.
- **0.10.67** — S36-1: `.dspf36` now opens in the DSPF designer.
- **0.10.66** — L77: `RTNCSRLOC` now exposes both its `*RECNAME` and `*WINDOW`/`*MOUSE` parameter shapes, previously collapsed into one wrong 2-field row.
- **0.10.65** — L74: SFLCTL's General panel gained a Program message queue (`SFLPGMQ`) field control, sharing L73's fix.
- **0.10.64** — L76: `MNUBARDSP` given structured inputs (up to 3 named fields) instead of one free-text parameters box.
- **0.10.63** — L73: `SFLMSGKEY`/`SFLPGMQ` fields were read-only in the Message Record panel — now directly editable.
- **0.10.62** — SFLCTL subfile preview now reserves space for `SFLEND`'s `*SCRBAR` scroll bar and `*MORE` line, matching real SDA's layout.
- **0.10.61** — L69-L71: fixed toolbar Save button/badge misalignment; removed more redundant filename labels; MNUCMD source name is now clickable.
- **0.10.60** — L68: fixed the New UI's placement hint and Add Record wizard being invisible (hidden under the collapsed aside panel).
- **0.10.59** — L67: extended L66's accordion-collapse-on-edit fix to the Menu Designer.
- **0.10.58** — L66: accordions no longer collapse on every edit — open/closed state is now tracked and restored across re-renders.
- **0.10.57** — L61-L65: 5 bug fixes — Find-field dropdown width, redundant filename label, Save/Compile errors now shown in-canvas, missing accordions on 4 panels, M10/M11 Immed checkbox visibility.
- **0.10.56** — L60: "Find keyword" now finds keywords you could ADD, not just ones already set on the field/record.
- **Docs-only, no version bump** — Added a structured keyword inventory (`KEYWORD-INDEX.json`/`.md`, `KEYWORD-LOOKUP.json`) built directly from the panel-building code.
- **0.10.55** — A-series audit (L57-L59): added missing `ALTNAME`/`RMVWDW`/`USRRSTDSP`; fixed `KEYBRD`'s value list for numeric fields.
- **0.10.54** — Docs: README refreshed for the completed P-series/L56 UI work.
- **0.10.53** — L56: accent color option for classic UI (Green/Amber/Cyan/Violet/White), also now drives the preview's default color in both UI styles.
- **0.10.52** — P5i: aside panel now hidden (not removed) under modern UI via CSS; two-column collapsed layout — closes the P series.
- **0.10.51** — P5g: new "View" accordion added to the persistent accordion zone (compare-mode/ruler/crosshair toggles, duplicated from the aside).
- **0.10.50** — P5e: Find-field search duplicated into its own row under the pinned toolbar.
- **0.10.49** — P5h: UI Settings accordion (style/theme) duplicated into the persistent accordion zone, synced both ways.
- **0.10.48** — P5f: aside branding replaced with a live "Screen Design · N records" toolbar title.
- **0.10.47** — P5d: Record select + Screen-size select duplicated into the pinned toolbar.
- **0.10.46** — P5c: file status label + Code for i badge migrated into the pinned toolbar.
- **0.10.45** — P5b: Save + Compile buttons migrated into the pinned toolbar.
- **0.10.44** — P5a: foundation shell (pinned toolbar + accordion zone) for migrating the aside panel's content.
- **0.10.43** — L54/L55: fixed comments vanishing when inserted at a chosen mid-continuation line; removed the Line # box's spinner arrows.
- **0.10.42** — L53: "+ Fields from database file" now goes through click-to-place instead of always dropping below the last field.
- **0.10.41** — P4: "Menu" toolbox tool — one click drops a ready-made PULLDOWN record.
- **0.10.40** — L52: fixed modification tracking corrupting multi-line/multi-fragment edits (interleaved comment/new-line pairs broke DDS continuation).
- **0.10.39** — P3: "Window" toolbox tool — one click drops a ready-made window record.
- **0.10.38** — P2: new shared "click-to-place a whole template" primitive, the foundation P3/P4 build on.
- **0.10.37** — L51: fixed the Line # box's real width bug (a CSS specificity issue L50 didn't catch); Usage O is now written explicitly instead of relying on a blank column.
- **0.10.36** — P1: floating "add to screen" toolbox for the DSPF designer's screen preview (New UI only).
- **0.10.35** — L50: comment add-row's line-number box narrowed to match the read-only line badge above it.
- **0.10.34** — L49: field usage (I/O/B) and data type now visually distinct in the design canvas (underline for input-capable fields).
- **0.10.33** — M8: Menu designer gets its own "Track modifications" feature, porting L38's mechanism.
- **0.10.32** — Fixed `COLOR`/`DSPATR` keywords on menu option constants being invisible in the canvas preview.
- **0.10.31** — L48: fixed constant keywords collapsing onto the literal's own line instead of getting a dedicated line.
- **0.10.30** — Fixed "Add fields from database file" querying a nonexistent column (`WHFLDO`); corrected to `WHFOBO`.
- **0.10.29** — Fixed a race where Code for i's command wasn't yet registered when needed; Compile/Add-fields-from-database now hidden while not connected.
- **0.10.28** — M7: fixed multi-fragment menu option labels (split across 3+ DDS constants) losing fragments past the first.
- **0.10.27** — L47: comment add-row visually unified with existing rows, no more forced horizontal scrollbar.
- **0.10.26** — L39/L40 follow-up: arrow-key nudge now respects window/subfile boundaries too, matching the mouse-drag fix.
- **0.10.25** — L46: add-comment row can now enter the comment's text directly, not just choose where it lands.
- **0.10.24** — L45: record-level comments get the same "insert at line #" option file-level comments already had.
- **0.10.23** — L44: Ctrl+D/Ctrl+V now go through the same click-to-place flow as the Copy button.
- **0.10.22** — L39/L40: field drag can no longer be dropped outside a window's border or onto the other half of a paired subfile.
- **0.10.21** — L43: file-level conditioning indicators now shown in the left panel; copy placement supports renaming before it lands.
- **0.10.20** — L42: comments now show their own source line number and support choosing where a new one is added.
- **0.10.19** — L41: fixed `WDWBORDER`'s single-quoted `*CHAR` form (one combined string vs. 8 separate literals) rendering no border at all.
- **0.10.18** — L38: source modification tracking — a changed line is commented out above the new one instead of silently overwritten, with an optional tag in columns 81-90.
- **0.10.17** — L37: file-panel cleanup (File label moved up, redundant button removed) + a new "Find keyword" quick-nav search box.
- **0.10.16** — L36: Copy field/constant now asks where to place the copy via click-to-place, instead of always dropping it directly below the original.
- **0.10.15** — L33: fixed field-dragging jumping instead of preserving the click offset (same bug L30 fixed for windows).
- **0.10.14** — L32: `WDWBORDER` with only some sub-parameters set now gets IBM's documented default for the rest, matching L29's "entirely absent" default.
- **0.10.13** — L31: command keys (`CAnn`/`CFnn`) now support multiple independently-conditioned instances of the same key number.
- **0.10.12** — L34: `CMP` (legacy `COMP` spelling) now recognized on read and normalized to `COMP` on write.
- **0.10.11** — L27-L30: command keys can carry indicator conditioning; open file's name moved up in the left panel; windows with no `WDWBORDER` get the real DDS default border; fixed window-move-handle snapping to the cursor instead of the grab offset.
- **0.10.10** — L22: `ROLLUP`/`ROLLDOWN` (legacy `PAGEDOWN`/`PAGEUP` spellings) now recognized as the same keyword.
- **0.10.9** — L24: `MSGLOC` (message line per display size) was entirely missing; added.
- **0.10.8** — L12 follow-up: multi-select "Align" section was missing a Center option.
- **0.10.7** — L23: `KEYBRD` dropdown offered the wrong value list; corrected to SDA's actual set.
- **0.10.6** — L21: `CHGINPDFT` gained its own HI/RI/CS/BL/UL/LC/ME/MF/FE sub-flag checkboxes.
- **0.10.5** — Overlap warning banner: real DDS silently drops a field overlapping another; the preview now flags this instead.
- **0.10.4** — `CHKMSGID` (Check Message Identifier): overrides a validity check's default error message.
- **0.10.3** — L20: `CNTFLD` wasn't selectable anywhere in the properties panel; added to the General keywords accordion.
- **0.10.2** — L18: "IBM i: Connected/Not connected/Not installed" badge in both designer panels.
- **0.10.1** — `CNTFLD` ignored its own conditioning indicator; now correctly checks `kw.conditions` like every other keyword.
- **0.10.0** — L17: `DSPATR` on a hidden program-to-system field (`USAGE(P)`) wasn't shown in Color & attributes and got silently dropped on the next edit.

## 2026-08-29 – 30 — Editor-wide features, Create New Display File, comments panel

- **0.9.99** — A "Save" button in both designers' left panel.
- **0.9.98** — Task L14 follow-up: "Add fields from database file" mis-ordered/mixed fields from a multi-format file.
- **0.9.97** — Task L16: system-value constants (`*DATE`/`*TIME`/`*USER`/`*SYSTEM`/`*PAGNBR`) were corrupted by editing and couldn't be created.
- **0.9.96** — Task L14: bulk "+ Fields from database file" — real SDA's own F10 (Database) key, via `DSPFFD`.
- **0.9.95** — "Create New Display File"/"Create New Menu" could silently skip offering a connected IBM i destination.
- **0.9.94** — Task L15: `MNUBARCHC` picker's text input was effectively unusable at narrow panel widths.
- **0.9.93** — Task L10: multi-field select + block move/copy/delete/style, matching SDA's own "Design Image" block convention.
- **0.9.92** — Task L13: Comments panel (file-level and record-level DDS comment lines).
- **0.9.91** — Crosshair (Task L11 follow-up): a position-readout toggle next to "Show ruler".
- **0.9.90** — Task L11: ruler overlay (row/column numbers along the design canvas), matching SDA's own F14.
- **0.9.89** — Task L9 follow-up: "Create New Display File" record-type templates are now genuinely working worked examples, not bare keyword skeletons.
- **0.9.88** — Task M6: Menu designer's left/right panels can now be hidden or minimized.
- **0.9.87** — Command key (`CAxx`/`CFxx`) picker now follows real DDS/SDA scoping rules (a record may override a file-level key; different records may reuse the same number).
- **0.9.86** — Task L9: "Create New Display File" record-type picker (9 real SDA starting types).
- **0.9.85** — Task M3: deleting a menu option now scans for another record format defining the same option number.
- **0.9.84** — DSPF designer: arrow-key nudge and Ctrl+X/C/V cut/copy/paste for the selected field/constant.
- **0.9.82** — Copy option (menu designer) could silently drop the new option from the preview and select the wrong one.
- **0.9.81** — Task M1: menu designer options get the same dedicated-picker treatment DSPF keywords already have.
- **0.9.80** — Task M4: companion `QQ` commands-member concurrency fix (last-write-wins across three edit paths).
- **0.9.79** — Task L5d-ii: record-level "Application Help" picker was reading/writing the wrong keywords array.
- **0.9.78** — Left-panel indicator preview no longer mixes a subfile pairing's two record formats together.
- **0.9.77** — Task L8: `Compile Display File (CRTDSPF)` command, DSPF designer's own counterpart to Compile Menu.
- **0.9.76** — Task L5d-i: record-level Indicator/screen-control panel now uses Task L1's repeatable conditioned instances.
- **0.9.75** — Task L7: `WINDOW` picker's "Restrict cursor to window" checkbox now models the real DDS keyword (it previously wrote a bogus standalone `RSTCSR` line).
- **0.9.74** — Task L6: `WINDOW` picker's "Message line" row — `WINDOW`'s own trailing `*MSGLIN`/`*NOMSGLIN` parameter, not a separate keyword.
- **0.9.73** — Task L5: Input keywords, General keywords, and Database reference now surface per-keyword conditioning.
- **0.9.72** — Choice pulldown/menu: radio/checkbox choices inside a `PULLDOWN` record rendered as an empty box (CSS bug).

## 2026-08-26 – 27 — Task L1 series: multi-instance conditioned keywords

Real DDS allows multiple independently-conditioned instances of the same
keyword (e.g. `COLOR(RED)` under indicator 10 and `COLOR(GRN)` under
indicator 20 on the same field) — every dedicated picker had previously
only ever managed one instance at a time.

- **0.9.71** — Per-keyword Conditioning toggle surfaced across the ~85 remaining `flagRowHtml`/`wireFlagRow` call sites.
- **0.9.70** — Task L5 (piece 3): Message ID (`MSGID`) wired onto the L1 repeatable-instance component.
- **0.9.69** — Task L1d: Keying options picker (`CHECK`'s ME/ER/MF/FE/RB/RZ/RL/LC codes) wired onto L1; shared correctly with Validity check's own use of `CHECK`.
- **0.9.68** — `SNGCHCFLD`/`MLTCHCFLD` (radio/checkbox choice groups) rendered with clipped or wrapped text.
- **0.9.67** — `WDWBORDER`'s `*CHAR` group now renders visually as an actual character overlay.
- **0.9.66** — Constants/fields defaulted to a hardcoded gray instead of green.
- **0.9.65** — "+ OR condition" no longer silently defaults a new condition to indicator `01`.
- **0.9.64** — Task L1c: Subfile Messages panel (`SFLMSG`/`SFLMSGID`) wired onto L1, as two independently-repeatable groups.
- **0.9.63** — Keywords added to a record/field with existing keywords were being appended onto a shared `+`-continued line instead of getting their own line.
- **0.9.62** — Task L1b: Error message picker (`ERRMSG`/`ERRMSGID`) wired onto L1, replacing the old single-instance text box.
- **0.9.55** — File-level Command keys (`CAxx`/`CFxx`) moved into File attributes; foundational Task L1 component (`getRepeatableKeywordInstances`/`setRepeatableKeywordInstances`) built.

## 2026-08-26 – 28 — Record/field picker foundation (R/D-series, SDA parity plan)

Building out the dedicated SDA-style "Select/Define ___ Keywords" pickers
per `PICKER-SCREENS-PLAN.md`, replacing free-typed keyword entry.

- **0.9.54** — Task D4: Constant field wiring (Display Attributes, Colors, General + `HLPID`).
- **0.9.53** — Task R6: `SFLMSGCTL` wiring.
- **0.9.52** — Task R10: `PULLDOWN`-specific record picker.
- **0.9.51** — Task D5: Menu-bar choice fields (`MNB*`/`MNUACT`) — five new panels for `MNUBARCHC`/`MNUBARSEP`/`SNGCHCFLD`/`MLTCHCFLD`/`CHOICE`/`CHCCTL`/`CHCACCEL`/`CHCAVAIL`/`CHCUNAVAIL`/`CHCSLT`.
- **0.9.49** — Task R7: `WINDOW`-specific record picker (geometry, border parameters/color/attributes/characters).
- **0.9.48** — Task R1: Base Record Keywords picker (General/Indicator/App help/Help/Output/Input/Overlay/Print) — reused across `RECORD`/`SFLCTL`/`SFLMSGCTL`/`WINDOW`/`WNDSFCTL`/`PULLDOWN`/`PDNSFLCTL`/`MNUBAR`.
- **0.9.47** — Task R5: `SFLMSG` (message subfile) record-level picker.
- **0.9.46** — `isda.designerOpenColumn` now defaults to `"active"` (full-width, same tab).
- **0.9.44** — `EDTCDE`/`EDTWRD` numeric display width was a flat approximation; now exact.
- **0.9.43** — Full SDA record-type list for "+ Add record".
- **0.9.42** — Clicking a constant only ever selected the FIRST constant on its source line.
- **0.9.41** — Record type + dependent record format name options when creating a record.
- **0.9.40** — Resolve Referenced Field (and "Resolve All") via Code for i.
- **0.9.39** — SFLCTL-side subfile preview and PULLDOWN overlay are now editable.
- **0.9.38** — `isda.designerOpenColumn` setting added.
- **0.9.37** — "iSDA: Create New Menu" command.
- **0.9.36** — DSPF designer: properties panel reorganized into a breadcrumb + tabs/accordions.
- **0.9.35** — Window preview: fields rendered visually behind the window and were hard to select/edit.
- **0.9.34** — `CNTFLD(n)` wrapping in the preview (first implementation).
- **0.9.33** — True dimmed-overlay compare, replacing the old read-only side-by-side multi-select.
- **0.9.32** — Menu designer: options from one record could shadow/hide another record's same-numbered option.
- **0.9.31** — Change Window Title by clicking it directly on the preview.
- **0.9.30** — Window move/resize handles on the DSPF preview.
- **0.9.29** — DSPF designer: "+ Field" / "+ Constant" click-to-place buttons.
- **0.9.28** — Menu designer: whole-record create/copy/delete UI.
- **0.9.26** — Per-keyword indicator conditioning (foundation for the picker screens' Conditioning toggle).
- **0.9.24** — README's "Known limitations" section pruned to pending items only.
- **0.9.23** — `DspfWriter.addDisplaySize()` — add a second `DSPSIZ` size to a single-size (or no-`DSPSIZ`) file.

## 2026-08-25 and earlier — Foundation

The original parser/engine/writer, the menu designer, and the first round
of interactive editing (drag, resize, rename, DATFMT, remote connections).

- **0.9.19** — "+ Add option" now lets you choose where a new option lands.
- **0.9.18** — "+ Add option" now picks a smarter starting row for the first option in a record.
- **0.9.17** — Date (`L`) field width now also honors record- and file-level `DATFMT`, not just field-level.
- **0.9.16** — Multiple runtime-positioned `WINDOW`s no longer render exactly on top of each other in compare mode.
- **0.9.15** — Local `.mnudds` files now support the options panel, not just remote IBM i members.
- **0.9.14** — "Compile Menu" no longer destructively rebuilds the message file on every compile.
- **0.9.13** — Date (`L`) field display width now honors the field's own `DATFMT` keyword.
- **0.9.12** — Remote member creation for "Create New Display File".
- **0.9.11** — Deleting a named field now warns if something elsewhere looks like it references it.
- **0.9.10** — Record rename now auto-rewrites the cross-references it can safely identify.
- **0.9.9** — Display-size condition names (`*DS3`/`*DS4`/user-defined) were silently misparsed into garbage indicators.
- **0.9.8** — Record format rename in the DSPF/screen designer (previously menu-designer only).
- **0.9.7** — Redesigned the menu designer's options panel: card layout, number badges, persistent field labels.
- **0.9.6** — Screen-size picker for display files declaring two `DSPSIZ` sizes.
- **0.9.5** — Split-constant option text wasn't recognized; editing it overwrote the number marker.
- **0.9.4** — Editable option label text in the menu designer's options panel.
- **0.9.3** — "Compile Menu (CRTMNU)" for the menu designer.
- **0.9.2** — Companion MNUCMD member kept in sync when it's already open elsewhere.
- **0.9.1** — "+ Add option" in the menu designer.
- **0.9.0** — Subfile editing redesigned to match real SDA behavior.
- **0.8.1** — Migrated from a plain `WebviewPanel` to `CustomTextEditorProvider`.
- **0.7.0** — "Create New Display File" command.
- **0.6.0** — Fixed a silent data-loss bug when editing a field with independently-conditioned keywords.
- **0.5.0** — `WINDOW(record-format-name)` resolution: a record can inherit another record's window geometry, including transitively.
- **0.4.0** — Record-level property editing: the properties panel now shows the current record's own keywords.
- **0.3.0** — Menu-bar (`MNUBAR`) rendering: a field with `MNUBARCHC` keywords renders as a horizontal row of clickable choices.
- **0.2.0** — Subfile (`SFL`/`SFLCTL`) rendering: the paired record's row template repeats `SFLPAG` times, resolved from either side of the pairing.
- **0.1.0** — DDS display-file parser (`dspfParser.ts`): fixed-column format, multi-line continuation, the foundation everything else builds on.
