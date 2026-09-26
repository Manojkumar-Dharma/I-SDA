# Keyword compliance audit and fix plan — I series

An audit of iSDA's DDS keyword implementation against IBM's own DDS reference
(`docs/sda-reference/source/DDS_Keyword_V7r6.txt`), one level at a time. It is
separate from [`LIMITATIONS-PLAN.md`](LIMITATIONS-PLAN.md) (DSPF36/S36E work under
`S36-`, plus general designer gaps under `L`/`M`/`P`): the question here is not "is a
feature missing" but "does an already-implemented keyword match IBM's documented
usage rules, conditioning rules and parameters".

**Four things are checked per keyword:**

1. **Usage and constraints** — is it real DDS syntax, at the level iSDA puts it, with
   IBM's exclusions and mutual restrictions enforced (or at least noted)?
2. **Conditioning** — does IBM say option indicators are valid / valid only in some
   cases / not valid, and does the UI match?
3. **Parameters and sub-parameters** — is every documented parameter reachable in the UI?
4. **Missing keywords** — is there a real, documented keyword at this level that iSDA
   does not expose yet?

**Task IDs** are prefixed `I` so they never collide with `L`/`M`/`P`/`S36-` IDs. IDs are
numbered in the order tasks were *opened*, not the order they *landed* (parallel
sessions pick tasks up out of order), so the **Version** column below is the
authoritative landing point, not the ID.

**Working rules** (same as `LIMITATIONS-PLAN.md`): claim a task with a `Claim I-N` commit
and push it immediately; `git fetch` and drift-check before every push; run
`node -c` on any file you edit before compiling; `npm test` must stay at zero failures.
A new `src/test/*.test.js` file is picked up by `npm test` automatically (I-120); use the shared `check` from `src/test/helpers/harness.js`.

**How this document is laid out**

1. [Status at a glance](#status-at-a-glance) — one table, all tasks, in ID order.
2. [Open work](#open-work) and [Deferred findings](#deferred-findings-not-yet-tasks).
3. [Background](#background) — reference method and how each phase was scoped.
4. [Task details](#task-details) — one `### I-N` section per task, in strict ID order.
   Each section opens with its Area, Status and Depends-on line.

---

## Status at a glance

121 of 124 tasks done; 3 open (see [Open work](#open-work)). Current version: **v0.10.204**.

| ID | Area | Topic | Depends on | Status | Version |
|----|------|-------|------------|--------|---------|
| [I-1](#i-1) | File | Canonical file-level keyword reference; compare against iSDA (method) | — | Done | — |
| [I-2](#i-2) | File | `PRTFILE` is not a real DDS keyword | I-1 | Done | v0.10.83 |
| [I-3](#i-3) | File | Conditioning audit across the 39 file-level keywords | I-1 | Done | v0.10.82 |
| [I-4](#i-4) | File | Parameter / sub-parameter completeness audit (39 keywords) | I-1 | Done | v0.10.87 |
| [I-5](#i-5) | File | Add confirmed-missing file-level keywords | I-1 | Done | v0.10.79 |
| [I-6](#i-6) | File | File-level `TEXT` is not valid; removed | I-1 | Done | v0.10.85 |
| [I-7](#i-7) | Record | `RECORD` (base) conditioning audit | I-1 | Done | v0.10.88 |
| [I-8](#i-8) | Record | `USRDFN` record audit | I-7 | Done | v0.10.89 |
| [I-9](#i-9) | Record | `SFL` (subfile detail) record audit | I-1 | Done | v0.10.86 |
| [I-10](#i-10) | Record | `SFLCTL` (subfile control) record audit | I-7, I-9 | Done | v0.10.90 |
| [I-11](#i-11) | Record | `SFLMSG` (message subfile) record audit | I-1 | Done | v0.10.84 |
| [I-12](#i-12) | Record | `WINDOW` record audit | I-7 | Done | v0.10.93 |
| [I-13](#i-13) | Record | `PULLDOWN` record audit | I-7, I-12 | Done | v0.10.92 |
| [I-14](#i-14) | Record | `MNUBAR` record audit | I-7 | Done | v0.10.91 |
| [I-15](#i-15) | Record | Combination record types (`SFLMSGCTL`, `WNDSFL`, ...) recheck | I-9 – I-13 | Done (no code change) | v0.10.94 |
| [I-16](#i-16) | Tooling | Keyword index regeneration (after I-7 – I-15) | I-7 – I-15 | Done | v0.10.108 |
| [I-17](#i-17) | Record | `MNUBARDSP` repeatable-conditioned instances | I-14 | Done | v0.10.95 |
| [I-18](#i-18) | Record | `MNUBARSW` / `MNUCNL` mutual CA-key exclusion | I-14 | Done | v0.10.96 |
| [I-19](#i-19) | Record | `MNUBAR` field-shape structural constraint | I-14 | Done | v0.10.97 |
| [I-20](#i-20) | Record | Repeatable Indicator-instance model made kind-aware | I-7, I-13 | Done | v0.10.101 |
| [I-21](#i-21) | Record | `CSRLOC` / record-level `HLPTITLE` missing conditioning | I-7 | Done | v0.10.98 |
| [I-22](#i-22) | Record | `SFLSIZ` / `SFLPAG` / `SFLLIN` display-size conditioning | I-10 | Done | v0.10.102 |
| [I-23](#i-23) | Record | Keywords implied to conflict with `SFLMSGRCD` | I-11 | Done (advisory only) | v0.10.103 |
| [I-24](#i-24) | Record | `WINDOW` vs file-level `PASSRCD` | I-12 | Done | v0.10.99 |
| [I-25](#i-25) | Record | `KEEP` duplicated across 4 panels; consolidated | I-7, I-9 | Done | v0.10.100 |
| [I-26](#i-26) | Record | Add `SFLSNGCHC` / `SFLMLTCHC` / `SFLSCROLL` | I-10, I-15 | Done | v0.10.107 |
| [I-27](#i-27) | Record | Record-level `HLPTITLE` as repeatable instances (up to 15) | I-21 | Done | v0.10.105 |
| [I-28](#i-28) | Record | `KEEP` conditioning toggle; `KEEP`/`ALWROL`/`CLRL`/`SLNO` mutex | I-9, I-25 | Done | v0.10.106 |
| [I-29](#i-29) | Record | The "Roll" column on real SDA's display-layout screen | I-22 | Done (research) | v0.10.104 |
| [I-30](#i-30) | Field | Character fields (base keyword set) | I-1 | Done | v0.10.109 |
| [I-31](#i-31) | Field | Numeric fields (editing keywords) | I-30 | Done | v0.10.113 |
| [I-32](#i-32) | Field | Date / Time / Timestamp fields | I-31 | Done | v0.10.114 |
| [I-33](#i-33) | Field | Constant fields, incl. system-value sub-form | I-1 | Done | v0.10.110 |
| [I-34](#i-34) | Field | Menu-bar choice fields (`SNGCHCFLD` / `MLTCHCFLD`) | I-1 | Done | v0.10.112 |
| [I-35](#i-35) | Field | Usage `M` and `P` fail-open audit | I-30 | Done | v0.10.115 |
| [I-36](#i-36) | Record | `ALWROL` / `CLRL` / `SLNO` vs file-level `PASSRCD` | I-24 | Done | v0.10.111 |
| [I-37](#i-37) | Record | `ALWROL` / `CLRL` / `SLNO` vs `ASSUME` / `SFL` / `SFLCTL` / `USRDFN` | I-28 | Done | v0.10.111 |
| [I-38](#i-38) | File | `HLPDOC` missing at file level | I-1 | Done | v0.10.116 |
| [I-39](#i-39) | Cross-level | 8 keywords missing from iSDA (full-text audit) | — | Done | v0.10.118 |
| [I-40](#i-40) | Tooling | Keyword index regeneration #2 (level labels, stale entries) | I-16; run last (after I-41, I-42, I-57, I-67, I-76) | Done | v0.10.199 |
| [I-41](#i-41) | Field | Add missing field-level keyword `HTML` | I-1 | Done | v0.10.133 |
| [I-42](#i-42) | Cross-level | Extend level scope: `MOUBTN` / `VALNUM` / `WRDWRAP` / `ENTFLDATR` | I-1, I-5 | Done | v0.10.135 |
| [I-43](#i-43) | File | `HLPRCD` / `HLPDOC` checkbox catch-22 | I-38 | Done | v0.10.121 |
| [I-44](#i-44) | Record | Enforce `USRDFN` whitelist on record-level keywords | I-8, I-12, I-13 | Done | v0.10.122 |
| [I-45](#i-45) | Record | `DSPMOD` requires both display sizes in `DSPSIZ` | I-44 | Done | v0.10.126 |
| [I-46](#i-46) | Record | `SFL` / `SFLCTL` whitelist; raw keyword editor guard | I-44 | Done | v0.10.128 |
| [I-47](#i-47) | Record | `WINDOW` six-keyword mutual exclusion | I-44 | Done | v0.10.129 |
| [I-48](#i-48) | Record | `MNUBAR` whitelist; raw keyword editor guard | I-44 | Done | v0.10.130 |
| [I-49](#i-49) | Record | Raw keyword editor bypassed the `USRDFN` guards | I-44 | Done | v0.10.125 |
| [I-50](#i-50) | Record | `RETLCKSTS` shown with a params box it does not have | I-44 | Done | v0.10.123 |
| [I-51](#i-51) | Record | `wirePulldownGuardedFlag` dead Conditioning toggles | I-13, I-44 | Done | v0.10.124 |
| [I-52](#i-52) | Record | `DSPMOD` cannot be specified on a subfile record | I-45 | Done | v0.10.127 |
| [I-53](#i-53) | Record | `SFL` whitelist: structured-checkbox sweep | I-46 | Done | v0.10.131 |
| [I-54](#i-54) | Record | `MNUBAR` whitelist: structured-checkbox sweep | I-48 | Done | v0.10.132 |
| [I-55](#i-55) | Record | Whitelist guards on the repeatable-instance editor | I-53 | Done | v0.10.134 |
| [I-56](#i-56) | Record | `RTNCSRLOC` record-level guard | I-54 | Done | v0.10.134 |
| [I-57](#i-57) | Field | `PSHBTNFLD` / `PSHBTNCHC` (push-button field) | I-41 | Done | v0.10.139 |
| [I-58](#i-58) | Field | Reverse `WRDWRAP` mutual-exclusion guards | I-42 | Done | v0.10.137 |
| [I-59](#i-59) | Cross-level | Bare `ENTFLDATR` and `*CURSOR`/`*NOCURSOR` in the shared editor | I-42 | Done | v0.10.138 |
| [I-60](#i-60) | Record | Record-level `ENTFLDATR` guard vs `USRDFN` whitelist | I-42, I-44 | Done | v0.10.136 |
| [I-61](#i-61) | Field | `WRDWRAP`: guard a data type / usage change on a field that already carries it | I-58 | Done | v0.10.140 |
| [I-62](#i-62) | Field | `PSHBTNFLD`: guard the Basic tab against breaking its required definition | I-57 | Done | v0.10.146 |
| [I-63](#i-63) | Field | `SNGCHCFLD`/`MLTCHCFLD`: `*NUMCOL`/`*NUMROW`/`*GUTTER` written and read in the wrong shape | I-34, I-57 | Done | v0.10.141 |
| [I-64](#i-64) | Field | `PSHBTNFLD` whitelist: structured field panels | I-57 | Done | v0.10.143 |
| [I-65](#i-65) | Field | `CHCAVAIL`/`CHCUNAVAIL`/`CHCCTL` editors for push-button fields | I-57 | Done | v0.10.142 |
| [I-66](#i-66) | Field | `PSHBTNCHC` choice-text validation (mnemonics, fit) | I-57 | Done | v0.10.144 |
| [I-67](#i-67) | File | `HLPDOC`: help-specification-level form | I-38 | Done | v0.10.178 |
| [I-68](#i-68) | File | `HLPRTN`: reverse conflict guard | I-38 | Done | v0.10.145 |
| [I-69](#i-69) | Field | `CHKMSGID`: validity-check dependency guard | I-30 | Done | v0.10.148 |
| [I-70](#i-70) | Field | `CHRID`: mutual-exclusion and eligibility rules | I-30 | Done | v0.10.155 |
| [I-71](#i-71) | Field | `IGCALTTYP`: mutual-exclusion list | I-30 | Done | v0.10.154 |
| [I-72](#i-72) | Field | `DUP`: floating-point restriction | I-30 | Done | v0.10.157 |
| [I-73](#i-73) | Field | `MSGID`: position-dependent mandatory/forbidden conditioning rule | I-30 | Done | v0.10.156 |
| [I-74](#i-74) | Field | `REF`/`REFFLD`: copy the other keywords from the referenced database field | I-32 | Done | v0.10.179 |
| [I-75](#i-75) | Field | Usage `P` fields: reachable selection path | I-35 | Done | v0.10.171 |
| [I-76](#i-76) | Tooling | Research: do SFLMSG's General/Indicator categories need their own index categories? | I-16 | Done (no code change) | v0.10.173 |
| [I-77](#i-77) | Record | `RTNCSRLOC`: re-check the `USRDFN` exclusion | I-56, I-60 | Done | v0.10.151 |
| [I-78](#i-78) | Field | `EDTCDE`: dedicated widget for the optional second parameter | I-31 | Done | v0.10.163 |
| [I-79](#i-79) | Field | `SFLCHCCTL`: field-shape, first-field and one-per-record rules | I-39 | Done | v0.10.149 |
| [I-80](#i-80) | Field | `SFLCSRPRG` vs `SFLLIN` | I-39 | Done | v0.10.150 |
| [I-81](#i-81) | Record | `SFLRTNSEL` requires `SFLMLTCHC` or `SFLSNGCHC` | I-39 | Done | v0.10.147 |
| [I-82](#i-82) | Field | `BLKFOLD` vs floating-point (belt and suspenders) | I-39 | Done | v0.10.159 |
| [I-83](#i-83) | Field | `HTML` constants: gate the Attributes tab `DSPATR`/`COLOR` checkboxes | I-41 | Done | v0.10.151 |
| [I-84](#i-84) | Record | `RTNCSRLOC`: SFL/MNUBAR checks should fire only when turning on (misleading un-tick alert) | I-56, I-77 | Done | v0.10.152 |
| [I-85](#i-85) | Field | `PSHBTNFLD` / `PSHBTNCHC`: guard removing one while the other stays | I-57, I-64, I-81 | Done | v0.10.153 |
| [I-86](#i-86) | Cross-level | `SFLNXTCHC` vs a record that contains an `SFLCHCCTL` field | I-79 | Done | v0.10.158 |
| [I-87](#i-87) | Field | `SFLCHCCTL`: guard field reordering (Up/Down) against breaking the first-field rule | I-79 | Done | v0.10.166 |
| [I-88](#i-88) | Field | Resolve Referenced Field: `WRDWRAP` / `PSHBTNFLD` / `CHRID` / `DUP` definition check | I-61, I-62, I-70, I-72 | Done | v0.10.161 |
| [I-89](#i-89) | Field | `CHKMSGID`: validate its `&message-data-field` parameter | I-69 | Done | v0.10.167 |
| [I-90](#i-90) | Cross-level | Research: `HLPDOC` / `HLPRTN` cross-level scope (file, record, help specification) | I-38, I-68 | Done | v0.10.168 |
| [I-91](#i-91) | Field | `MSGID`: exclusion of `DFT`, `DFTVAL`, `FLTFIXDEC` and `FLTPCN` on the same field | I-73 | Done | v0.10.160 |
| [I-92](#i-92) | Field | `MSGID`: not valid on a field of a subfile (`SFL`) record | I-73 | Done | v0.10.164 |
| [I-93](#i-93) | Record | `ENTFLDATR`: gate the add-guard on the real transition (refuses a legitimate edit on an `SFL`/`MNUBAR`/`USRDFN` record) | I-84 | Done | v0.10.162 |
| [I-94](#i-94) | Field | `IGCALTTYP`: eligibility (usage `B` only, keyboard shift type, not DBCS) | I-71 | Done | v0.10.172 |
| [I-95](#i-95) | Field | `IGCALTTYP`: option indicators are not allowed (raw editor's Conditioning toggle) | I-71 | Done | v0.10.170 |
| [I-96](#i-96) | Field | Input keywords panel: `DUP` checkbox still offered on a floating-point field (cosmetic) | I-72 | Done | v0.10.165 |
| [I-97](#i-97) | Field / Record | `ERRMSGID` / `SFLMSGID`: validate the `&msg-data` parameter (same rule as `CHKMSGID`'s) | I-89 | Done | v0.10.169 |
| [I-98](#i-98) | Record | SFLMSG record's General panel: drop the option-indicator Conditioning on `LOGINP` and `CHECK(AB)`/`CHECK(RL)` (I-9's fix never reached it) | I-9, I-76 | Done | v0.10.174 |
| [I-99](#i-99) | Record | `SFLMSGID` panel reads and writes the wrong grammar (`library` as a 3rd token; response indicator / `&msg-data` dropped) | I-97 | Done | v0.10.175 |
| [I-100](#i-100) | Record | `SFLMSG` panel drops a hand-written response indicator when its text is edited | I-99 | Done | v0.10.176 |
| [I-101](#i-101) | Tooling / all levels | Raw keyword editor: option-indicator guard for the other ~92 keywords the DDS Reference says take none | I-95 | Done | v0.10.197 |
| [I-102](#i-102) | Record | `HLPCLR` / `INVITE`: whitelisted on `USRDFN` but refused by the shared guard | I-44, I-51 | Done | v0.10.177 |
| [I-103](#i-103) | Record | `CHGINPDFT`: record-level row has no `USRDFN` / `MNUBAR` guard | I-44, I-54 | Done | v0.10.182 |
| [I-104](#i-104) | Record | Table-driven sweep test over every record keyword row (`USRDFN`, `SFL`, `MNUBAR`) | I-102, I-103 | Done (test only) | v0.10.181 |
| [I-105](#i-105) | Record | `USRDFN` record: consistent presentation of applicable / non-applicable keyword rows (decision first) | I-44, I-102 | Done | v0.10.191 |
| [I-106](#i-106) | Record | `UNLOCK`: not guarded on `SFL` / `USRDFN` records | I-104 | Done | v0.10.183 |
| [I-107](#i-107) | Record | `CHECK(AB)` / `CHECK(RL)`: not guarded on `MNUBAR` / `USRDFN` records | I-104 | Done | v0.10.184 |
| [I-108](#i-108) | Record | `ALTNAME` text row: accepted on `USRDFN`, `SFL` and `MNUBAR` records | I-104 | Done | v0.10.189 |
| [I-109](#i-109) | Record | Record Indicator row: no `USRDFN` whitelist ("+ Add" and the kind switch) | I-104 | Done | v0.10.186 |
| [I-110](#i-110) | Record | "+ Add" `HLPTITLE` (`USRDFN`, `SFL`) and `MNUBARDSP` (`USRDFN`): accepted although not whitelisted | I-104 | Done | v0.10.185 |
| [I-111](#i-111) | Record | `USRDFN` / `SFL` / `MNUBAR` guards run on every edit while the box is ticked, not on a real turn-on | I-84, I-102 | Done | v0.10.187 |
| [I-112](#i-112) | Field | `REFFLD`-inherited validity keywords (`CHECK`, `COMP`, `RANGE`, `VALUES`, `CHKMSGID`) and `FLTPCN` cannot be shown (research first) | I-74 | Done (research; documented limit) | v0.10.188 |
| [I-113](#i-113) | Field | "+ Fields from database file" (L14) writes an explicit length, data type and decimals next to `REFFLD` (decision first) | I-74 | Done | v0.10.190 |
| [I-114](#i-114) | Record | `HELP` / `HLPRTN` on a `USRDFN` record: reachable only through the raw keyword editor (decision first) | I-105 | Done | v0.10.193 |
| [I-115](#i-115) | Record | `SFLMSG` records' Keywords tab is still the full row set although every row is refused (decision first) | I-105 | Done | v0.10.192 |
| [I-116](#i-116) | Field | Read a referenced field's validity checks (and `FLTPCN`) from the `QDBRTVFD` API | I-112 | Done | v0.10.198 |
| [I-117](#i-117) | Record | The SFLMSG tab's own General / Indicator panels accept keywords the message-subfile whitelist refuses (decision first) | I-115 | Done | v0.10.194 |
| [I-118](#i-118) | Tooling | Remove dead code, test-only exports and unreferenced fixtures | I-40 | Done | v0.10.200 |
| [I-119](#i-119) | Tooling | De-duplicate copied helpers (`escapeHtml`, `isPulldownRecord`, `assembleParams`, ...) | I-118 | Done (v0.10.204) | — |
| [I-120](#i-120) | Tooling | Shared test harness: one `check`, one jsdom builder, a real runner | I-40 | Done | v0.10.201 |
| [I-121](#i-121) | Cross-level | One declarative rule spec per keyword (constraints, parameters, dependencies, display) | I-40, I-119 | In progress (USRDFN, WINDOW, PULLDOWN, MNUBAR, SFL, KEEP/ALWROL/CLRL/SLNO/ASSUME, SFLNXTCHG/SFLMSGRCD/DSPMOD, HLPDOC/HLPBDY/HLPPNLGRP/HLPRCD slices done) | v0.10.212 |
| [I-122](#i-122) | Tooling | Generated keyword x dimension test matrix; retire duplicate and stale tests | I-120, I-121 | Not started | — |
| [I-123](#i-123) | Tooling | Move "Task I-nn" history out of source comments | I-121 | Not started | — |
| [I-124](#i-124) | Tooling | Test-only exports that still carry a "kept for backward compatibility / API completeness" note (decision first) | I-118 | Done | v0.10.202 |

**Areas:** File = file-level keywords · Record = record-level keywords and record types ·
Field = field-level keywords · Cross-level = spans more than one level · Tooling = the
keyword index under `docs/sda-reference/keyword-index/`.

---

## Open work

Suggested pickup order - roughly smallest and safest first (a real bug with a proven fix shape ahead of cosmetic or decision-dependent work); **not binding** (any task can be picked independently, and the sizes are estimates, not measurements). I-40 stays last, on purpose.

| Order | Task | Status | Notes |
|-------|------|--------|-------|
| 1 | [I-121](#i-121) | In progress | Keyword rule spec (single source of truth). USRDFN slice done (v0.10.205); WINDOW slice done (v0.10.206); PULLDOWN slice done (v0.10.207); MNUBAR slice done (v0.10.208); SFL slice done (v0.10.209 - re-reading SFLCTL's own DDS Reference section confirmed it needs no separate guard, so this slice covered both the "SFL/SFLCTL" and "message subfile" remaining line items together); KEEP/ALWROL/CLRL/SLNO/ASSUME mutex-web slice done (v0.10.210 - a well-scoped piece of the "plain/base record" remainder, the existing keepMutexConflictReason (I-28) / alwrolClrlSlnoConflictReason (I-37) functions, not the full undertaking); SFLNXTCHG/SFLMSGRCD + DSPMOD/SFL slice done (v0.10.211 - two more small, closed-form record-level pairs, sflNxtchgSflMsgRcdConflictReason (I-23) and dspmodSflConflictReason). Size (estimate): Large - best done one record type at a time. |
| 2 | [I-122](#i-122) | Not started | Generated test matrix and migration of overlapping tests. Size (estimate): Large. |
| 3 | [I-123](#i-123) | Not started | Task-history comments out of source. Size (estimate): Medium (mechanical). |

## Deferred findings (not yet tasks)

Every finding so far has been opened as a task (I-61 – I-124, see the tables above). A new finding goes in this table until someone opens it as a task (own `Claim I-N` commit, own ID).

| Raised by | Finding |
|-----------|---------|
| - | None at the moment. |

*Method note:* `flagRowHtml`'s conditioning-eligibility mechanism (I-3) proved reusable for
the field-level tasks (I-30 onward built on it directly) — worth reusing in any future series.

---

## Background

### Reference method (so re-audits are reproducible)

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

### How the record-level phase (I-7 – I-29) was scoped

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

### How the field-level phase (I-30 – I-35) was scoped

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

---

## Task details

Strict ID order. Every task has a section here, whether or not it has landed; the
[status table](#status-at-a-glance) is the summary.

<a id="i-1"></a>

### I-1 — Build canonical file-level keyword reference + compare against iSDA

> **Area:** File · **Status:** Done · **Depends on:** —

**Done.** Extracted all ~155 keyword sections from
`DDS_Keyword_V7r6.txt`, classified each by documented level(s),
conditioning-indicator status, and no-parameter flag, then diffed the
confirmed file-level subset against iSDA's current 39 (from
`KEYWORD-INDEX.json`'s `file` level + `src/webviewClientHelpers.js`'s
`fileKeywordsPanelsHtml`). Findings feed directly into I-2 through I-6
below. No code changed in this task — audit only.

---

<a id="i-2"></a>

### I-2 — `PRTFILE` is not a real DDS keyword (usage/constraint bug)

> **Area:** File · **Status:** Done (v0.10.83) · **Depends on:** I-1

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

---

<a id="i-3"></a>

### I-3 — Conditioning (option indicator) audit across all 39 file-level keywords

> **Area:** File · **Status:** Done (v0.10.82) · **Depends on:** I-1

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

---

<a id="i-4"></a>

### I-4 — Parameter/sub-parameter completeness audit across all 39

> **Area:** File · **Status:** Done (v0.10.87) · **Depends on:** I-1

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

---

<a id="i-5"></a>

### I-5 — Add confirmed-missing file-level keywords

> **Area:** File · **Status:** Done (v0.10.79) · **Depends on:** I-1

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

---

<a id="i-6"></a>

### I-6 — Resolve the `TEXT` file-level question

> **Area:** File · **Status:** Done (v0.10.85) · **Depends on:** I-1

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

<a id="i-7"></a>

### I-7 — `RECORD` (base)

> **Area:** Record · **Status:** Done (v0.10.88) · **Depends on:** I-1

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

---

<a id="i-8"></a>

### I-8 — `USRDFN`

> **Area:** Record · **Status:** Done (v0.10.89) · **Depends on:** I-7

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

---

<a id="i-9"></a>

### I-9 — `SFL` (subfile detail record)

> **Area:** Record · **Status:** Done (v0.10.86) · **Depends on:** I-1

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

---

<a id="i-10"></a>

### I-10 — `SFLCTL` (subfile control record)

> **Area:** Record · **Status:** Done (v0.10.90) · **Depends on:** I-7, I-9

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

---

<a id="i-11"></a>

### I-11 — `SFLMSG` (message subfile detail record)

> **Area:** Record · **Status:** Done (v0.10.84) · **Depends on:** I-1

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

---

<a id="i-12"></a>

### I-12 — `WINDOW`

> **Area:** Record · **Status:** Done (v0.10.93) · **Depends on:** I-7

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

---

<a id="i-13"></a>

### I-13 — `PULLDOWN`

> **Area:** Record · **Status:** Done (v0.10.92) · **Depends on:** I-7, I-12

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

---

<a id="i-14"></a>

### I-14 — `MNUBAR` (menu bar record)

> **Area:** Record · **Status:** Done (v0.10.91) · **Depends on:** I-7

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

---

<a id="i-15"></a>

### I-15 — Combination record types: `SFLMSGCTL`, `WNDSFL`, `WNDSFCTL`, `PULDWNSFL`, `PDNSFLCTL`

> **Area:** Record · **Status:** Done (no code change) (v0.10.94) · **Depends on:** I-9 – I-13

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

---

<a id="i-16"></a>

### I-16 — `KEYWORD-INDEX.json`/`.md`/`KEYWORD-LOOKUP.json` regeneration

> **Area:** Tooling · **Status:** Done (v0.10.108) · **Depends on:** I-7 – I-15

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

---

<a id="i-17"></a>

### I-17 — `MNUBARDSP` repeatable-conditioned-instance support

> **Area:** Record · **Status:** Done (v0.10.95) · **Depends on:** I-14

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

---

<a id="i-18"></a>

### I-18 — `MNUBARSW`/`MNUCNL` mutual CA-key exclusion guard

> **Area:** Record · **Status:** Done (v0.10.96) · **Depends on:** I-14

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

---

<a id="i-19"></a>

### I-19 — `MNUBAR` field-shape structural constraint

> **Area:** Record · **Status:** Done (v0.10.97) · **Depends on:** I-14

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

---

<a id="i-20"></a>

### I-20 — Repeatable Indicator-instance model isn't kind-aware

> **Area:** Record · **Status:** Done (v0.10.101) · **Depends on:** I-7, I-13

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

---

<a id="i-21"></a>

### I-21 — `CSRLOC` / record-level `HLPTITLE` missing conditioning

> **Area:** Record · **Status:** Done (v0.10.98) · **Depends on:** I-7

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

---

<a id="i-22"></a>

### I-22 — `SFLSIZ`/`SFLPAG`/`SFLLIN` display-size (`*DSx`) conditioning

> **Area:** Record · **Status:** Done (v0.10.102) · **Depends on:** I-10

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

---

<a id="i-23"></a>

### I-23 — Verify the ~9 keywords only *implied* to conflict with `SFLMSGRCD`

> **Area:** Record · **Status:** Done (advisory only) (v0.10.103) · **Depends on:** I-11

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

---

<a id="i-24"></a>

### I-24 — `WINDOW` cannot be specified for the record named by file-level `PASSRCD`

> **Area:** Record · **Status:** Done (v0.10.99) · **Depends on:** I-12

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

---

<a id="i-25"></a>

### I-25 — `KEEP` duplicated across 4 record-type panels — consolidate to one tab

> **Area:** Record · **Status:** Done (v0.10.100) · **Depends on:** I-7, I-9

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

---

<a id="i-26"></a>

### I-26 — Add missing subfile-control selection-list keywords: `SFLSNGCHC`/`SFLMLTCHC`/`SFLSCROLL`

> **Area:** Record · **Status:** Done (v0.10.107) · **Depends on:** I-10, I-15

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

---

<a id="i-27"></a>

### I-27 — Record-level `HLPTITLE` repeatable-conditioned-instance model (up to 15/record)

> **Area:** Record · **Status:** Done (v0.10.105) · **Depends on:** I-21

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

---

<a id="i-28"></a>

### I-28 — Base Record Keywords panel's `KEEP` row still offers a Conditioning toggle; `KEEP`/`ALWROL`/`CLRL`/`SLNO` mutual exclusion

> **Area:** Record · **Status:** Done (v0.10.106) · **Depends on:** I-9, I-25

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

---

<a id="i-29"></a>

### I-29 — Research the "Roll" column on real SDA's own "Define Display Layout" screen for `SFLSIZ`/`SFLPAG`/`SFLLIN`

> **Area:** Record · **Status:** Done (research) (v0.10.104) · **Depends on:** I-22

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

<a id="i-30"></a>

### I-30 — Character fields (base set)

> **Area:** Field · **Status:** Done (v0.10.109) · **Depends on:** I-1

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

---

<a id="i-31"></a>

### I-31 — Numeric fields

> **Area:** Field · **Status:** Done (v0.10.113) · **Depends on:** I-30

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

<a id="i-32"></a>

### I-32 — Date/Time/Timestamp fields (`DATFMT`/`DATSEP`/`TIMFMT`/`TIMSEP`)

> **Area:** Field · **Status:** Done (v0.10.114) · **Depends on:** I-31

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

<a id="i-33"></a>

### I-33 — Constant fields (incl. system-value sub-form)

> **Area:** Field · **Status:** Done (v0.10.110) · **Depends on:** I-1

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

<a id="i-34"></a>

### I-34 — Menu-bar choice fields (`SNGCHCFLD`/`MLTCHCFLD`)

> **Area:** Field · **Status:** Done (v0.10.112) · **Depends on:** I-1

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

<a id="i-35"></a>

### I-35 — Usage `M` (Message) and `P` (Program-to-system) fail-open audit

> **Area:** Field · **Status:** Done (v0.10.115) · **Depends on:** I-30

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

<a id="i-36"></a>

### I-36 — `ALWROL`/`CLRL`/`SLNO` cannot be specified for the record named by file-level `PASSRCD`

> **Area:** Record · **Status:** Done (v0.10.111) · **Depends on:** I-24

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

<a id="i-37"></a>

### I-37 — `ALWROL`/`CLRL`/`SLNO` are each individually incompatible with `ASSUME`/`SFL`/`SFLCTL`/`USRDFN`

> **Area:** Record · **Status:** Done (v0.10.111) · **Depends on:** I-28

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

---

<a id="i-38"></a>

### I-38 — `HLPDOC` was missing from iSDA at the file level entirely

> **Area:** File · **Status:** Done (v0.10.116) · **Depends on:** I-1

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
direction was still not wired at its checkbox commit site when I-38 landed (**since wired by I-68**): `HLPRTN`'s
file-level row goes through the shared `commitIndicatorTextRow` helper
(also used for `CLEAR`/`HOME`/`PAGEDOWN`/`PAGEUP`/`VLDCMDKEY`), which
has no per-keyword conflict hook to attach one to — same "one direction
built first" convention `sflChoiceListConflictReason`'s own doc comment
documents elsewhere in this codebase.

Regression coverage: `src/test/i38HlpdocFileLevel.test.js` (jsdom,
exercises the real generated File Properties > Help panel — verified via
`git stash` that it genuinely fails against pre-fix code, not just after
the fix).

#### Follow-up (v0.10.117) — `HLPRCD` vs `HLPDOC` cross-verify (user-requested, extends I-38)

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

<a id="i-39"></a>

### I-39 — Full-text audit against DDS_Keyword_V7r6.txt found 8 keywords entirely missing from iSDA

> **Area:** Cross-level · **Status:** Done (v0.10.118) · **Depends on:** —

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

<a id="i-40"></a>

### I-40 — `KEYWORD-INDEX.json`/`.md`/`KEYWORD-LOOKUP.json` regeneration: 7 level-label inaccuracies + 9 stale-missing entries

> **Area:** Tooling · **Status:** Done (v0.10.199) · **Depends on:** I-16; run last (after I-41, I-42, I-57, I-67, I-76)

**Done.** Independent full-text audit of `DDS_Keyword_V7r6.txt` against
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

**Note from I-76 (research, done):** no new SFLMSG index categories are
needed - its General/Indicator screens are the same as SFL's, which the
index already has. Just add `"SFLMSG"` to `sharedWith` on both "Subfile -
General (SFL)" and "Subfile - Indicator (SFL)" in `build_index.py`
(currently `WNDSFL`, `PULDWNSFL`), and name the two SFLMSG screenshot
folders (`screens/record-level/subfile-message-sflmsg/general` and
`.../indicator`) in those categories' descriptions. See I-76.

**Execution (v0.10.199): re-verified every claimed finding above against the
codebase as it now stands, rather than applying the claim text verbatim —
several tasks landed between the original claim and this regeneration.**

- **6 of the 7 claimed level-label corrections confirmed and applied:**
  `HLPPNLGRP` (file/help-specification, never record - `applicationHelpFieldsHtml`
  is genuinely H-spec-scoped) and `SFLMSGKEY`/`SFLPGMQ`/`SFLRCDNBR`/`SFLROLVAL`/
  `SFLSCROLL` (all field-level, confirmed via `subfileFieldKeywordsHtml`'s own
  `field.keywords` call sites in `buildWebviewTemplate.js`).
- **The 7th claimed correction (`CHECK` → "field-only") was NOT applied -
  it's wrong.** A fresh trace found genuine, pre-existing hand-wired
  `CHECK(AB)`/`CHECK(RLTB)`/`CHECK(RL)` rows at **both** file level
  (`fk-check-ab`/`fk-check-rltb`/`fk-check-rl` in the file General panel) and
  record level (`recordCheckGuard`-guarded rows in the record Input panel,
  I-107's own guard target) - neither goes through `checkInstancesHtml`, the
  function the original audit traced. IBM's own DDS Reference text is
  explicit: *"Use this code at the file level, record level, or field level
  to allow all-blank input..."* (the `AB` sub-code's own description). The
  index's existing file/record/field labeling for `CHECK` was already
  correct; left unchanged. Lesson for future audits of this shape: tracing
  one call site to conclude a keyword's *only* surface is a false negative
  whenever a second surface is hand-wired outside the traced helper -
  confirm absence by keyword name across the whole codebase, not just by
  tracing one function's callers.
- **Recovered 8 keywords I-39 had hand-edited directly into
  `KEYWORD-INDEX.json`/`.md` without updating `build_index.py`:** `BLKFOLD`,
  `CSRINPONLY` (file + record), `FLTFIXDEC`, `FLTPCN`, `MAPVAL`, `SFLCHCCTL`,
  `SFLCSRPRG`, `SFLRTNSEL`. A blind re-run of `build_index.py` (the sole
  generator) would have silently deleted all 8, since the generator has no
  record of them. Folded into the source at I-39's own category placement
  (per this task's own note to preserve that grouping), so `SFLCHCCTL`/
  `SFLCSRPRG` moved to field level along with the rest of the
  `SFLRCDNBR`/`SFLROLVAL`/`SFLSCROLL` category they were filed under.
- **Added the 9 missing entries:** `DATE`/`TIME`/`USER`/`SYSNAME`/`MSGCON`
  (field-level constant value sources, Task I-33's "Value source" selector -
  filed under field-level "Constant field additions"), `SFL`/`USRDFN`
  (record-type marker keywords, previously only named in `sharedWith` notes,
  never given their own entry - `SFL` filed under "Subfile - General (SFL)",
  `USRDFN` given its own new "User-Defined Record (USRDFN)" category),
  `WDWTITLE` (record-level window title text, filed under "Window
  Parameters" alongside `WINDOW`), `HLPDOC` (file-level, Task I-38 - filed
  under file-level "Help" alongside `HLPPNLGRP`/`HLPRCD`).
- **New "help-specification" level introduced** (previously HLPPNLGRP's
  H-spec form was folded into "record", the exact mislabeling this task set
  out to fix) - holds the "Application Help" category (`HLPPNLGRP`/
  `HLPEXCLD`/`HLPBDY`/`HLPARA`/`HLPDOC`), with `HLPPNLGRP` and `HLPDOC` each
  also keeping their separate file-level entry, since both keywords are
  genuinely valid at both levels (I-67's own note: "this adds a level for an
  existing index entry").
- **Totals:** 47 → 49 categories, 206 → 225 keyword entries (`build_index.py`'s
  own printed count), 186 unique keyword names. `npm run compile` clean,
  `npm test` - all 145 test files, zero failures (docs-only change, no
  `src/` edits).

---

<a id="i-41"></a>

### I-41 — Added missing field-level keyword `HTML`; `PSHBTNFLD`/`PSHBTNCHC` split off as I-57

> **Area:** Field · **Status:** Done (v0.10.133) · **Depends on:** I-1

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

---

<a id="i-42"></a>

### I-42 — Extended `MOUBTN`/`VALNUM`/`WRDWRAP`/`ENTFLDATR` level-scope to match DDS Reference (`USRDSPMGT` found to be a false positive)

> **Area:** Cross-level · **Status:** Done (v0.10.135) · **Depends on:** I-1, I-5

**Done.** Same audit as I-40 (see
`docs/sda-reference/source/dds-keyword-audit-report.md`, Finding C).
Each keyword below had exactly one call site in `webviewClientHelpers.js`,
narrower than what the DDS Reference allows. Re-read each keyword's own
DDS Reference section fresh before implementing (same method as
I-44/I-46/I-47/I-48) rather than trusting the audit table as exact - and
one of the five was wrong:

- **`USRDSPMGT` - NOT changed; the audit's claim was a false positive.**
  The audit listed it as "file, record". Both of its own DDS Reference
  sections say otherwise: the display-file section opens "You use this
  **file-level** keyword to specify that all data written to the display
  is held...", and the System/36 section opens "You use this file-level
  keyword to indicate that this display file should be processed with
  System/36 environment functions." Nothing in either section mentions
  record level. It stays file-level only. `i42LevelScopeExtension.test.js`
  asserts that no record-level `USRDSPMGT` row exists, so a future
  re-audit doesn't "fix" it by mistake. **I-40 (keyword-index
  regeneration) should keep `USRDSPMGT` as file-level.**
- **`MOUBTN` (file, record) - added record-level.** Reuses the file-level
  `moubtnPanelHtml`/`wireMoubtnPanel` verbatim (same repeatable,
  independently conditioned instances), placed on the record Indicator
  tab to match its file-level placement. `wireMoubtnPanel` gained a new
  optional trailing `addGuardFn` (same shape as I-55's guard on
  `wireMnubardspPanel`; the file-level call site omits it and is
  unaffected). The record-level call site checks `usrdfnWhitelistConflictReason`,
  `sflWhitelistConflictReason` and `mnubarWhitelistConflictReason` - `MOUBTN` is on none
  of those three closed whitelists (unlike `MNUBARDSP`, where I-8's audit found no
  USRDFN incompatibility and left it alone, so I-55 only guarded SFL).
- **`VALNUM` and `WRDWRAP` (file, record, field) - added record- and
  field-level.** Both are flag-only ("no parameters"; "Option indicators
  are not valid"), so neither gets a params box nor a Conditioning
  toggle. Record-level: a plain row on the General tab, wired through
  the existing `wireUsrdfnGuardedFlag`, which already carries the
  USRDFN/PULLDOWN/SFL/MNUBAR checks - so the closed whitelists (and
  `WRDWRAP`'s own "Subfiles do not support WRDWRAP" note, via SFL's
  whitelist) are enforced with no new per-keyword logic. Field-level:
  two new rows in `GENERAL_FIELD_KEYWORD_ROWS`, using two new `dtScope`
  values (`numeric-only`: data type `Y`; `wrdwrap-shifts`: not one of
  `S`/`Y`/`D`/`M`/`F`/`J`/`O`/`E`/`G`) and a new 9th `usageScope`
  element (`input-capable`: usage `I`/`B`, blank fails open) - same
  hide-the-row idiom as I-39's `dtScope` rows. `VALNUM`'s own text
  requires "an input-capable field with the data type Y"; `WRDWRAP`'s
  requires usage `I`/`B` and excludes those nine shifts.
- **`WRDWRAP`'s own mutual-exclusion rules** ("cannot be specified with
  `AUTO(RAZ, RAB)`, `CHECK(MF, M10F, M11F, RB, RZ, RL, RLTB)`,
  `CHGINPDFT(MF)`, `DSPATR(OID, SP)`, `DUP`, `FLTFIXDEC`, `IGCALTTYP`",
  plus "Subfiles do not support WRDWRAP") are enforced on the
  on-transition by new `DspfWriter.wrdwrapFieldConflictReason`, wired
  into a dedicated `wrdwrap` branch of `wireGeneralFieldKeywordsEditor`
  (alert + revert, same idiom as L81's DFT/DFTVAL branch). Sub-parameters
  are matched by token, so `CHECK(ME MF)` is caught while `CHECK(ME)`,
  `CHECK(AB)`, `CHGINPDFT(FE)` and `DSPATR(HI UL)` are not. That function
  also re-checks usage/data type/subfile so it is correct on its own for
  any future caller. `wireGeneralFieldKeywordsEditor` gained a trailing
  `recordKeywords` param for the subfile test (a subfile *control* record's
  fields are not blocked - only the `SFL` detail record's, per the note).
- **`ENTFLDATR` (file, record, field) - added field-level.** New "Entry
  field attribute" accordion in `renderFieldProps`, reusing
  `entFldAtrHtml`/`wireEntFldAtrEditor` (now exported), gated by
  `catVis.inputKeywords` (IBM: "The field containing the ENTFLDATR
  keyword must be an input-capable field") and never shown for constants.
  No new conflict rule: "when defined at both the field- and record-level,
  the field-level specification is used", and its EDTMSK/DSPATR(PR)
  notes are informational.

Regression coverage: `src/test/i42LevelScopeExtension.test.js` (134
checks): record-level `VALNUM`/`WRDWRAP` on plain/USRDFN/SFL/MNUBAR
records, record-level `MOUBTN` "+ Add" (plain adds and stays repeatable;
blocked on USRDFN/SFL/MNUBAR; file-level unchanged), field-level row
visibility for every excluded shift/usage, every documented
`WRDWRAP` conflict (and the near-misses that must NOT block), and the
real generated webview (accordion present on an `A`/`B` field,
`ENTFLDATR` applied to the selected field only, `VALNUM` only on a `Y`
field, nothing on an output-only field). Confirmed to fail against
pre-fix code.

**Follow-ups logged (not fixed here):**

- **I-58** - the reverse direction of `WRDWRAP`'s mutual-exclusion rule:
  adding `AUTO(RAZ|RAB)`, `CHECK(MF|M10F|M11F|RB|RZ|RL|RLTB)`,
  `CHGINPDFT(MF)`, `DSPATR(OID|SP)`, `DUP`, `FLTFIXDEC` or `IGCALTTYP` to a
  field that already carries `WRDWRAP` isn't blocked. Needs a sweep of each
  keyword's own field-level panel plus the field-level raw keyword editor
  (which has no `addGuardFn` yet).
  **Fixed in v0.10.137 - see I-58's own table row above.**
- **I-59** - pre-existing limitation of the shared `ENTFLDATR` editor
  (`entFldAtrHtml`, built on `getChoiceColorState`), now reachable at
  field level where IBM's own examples use both affected forms: a bare
  `ENTFLDATR` (IBM's `F1` example) renders as unchecked and clicking Apply
  drops it, and the cursor-visible parameter `*CURSOR`/`*NOCURSOR` (IBM's
  `F3` example; `*NOCURSOR` also requires data type `I`) is silently
  discarded on Apply. Affects file, record and field level alike.
  **Fixed in v0.10.138 - see [I-59](#i-59).**
- **I-60** - pre-existing gap found while checking I-42: the record-level
  `ENTFLDATR` Apply guard only checks SFL's and MNUBAR's whitelists
  (I-53/I-54), not USRDFN's, so `ENTFLDATR` can still be applied to a
  `USRDFN` record through the General tab.
  **Fixed in v0.10.136 - see [I-60](#i-60).**

---

<a id="i-43"></a>

### I-43 — `HLPRCD`/`HLPDOC` checkbox catch-22

> **Area:** File · **Status:** Done (v0.10.121) · **Depends on:** I-38

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

**Originally filed as:** Bug: `HLPRCD`/`HLPDOC` checkboxes cannot be turned on at all - a catch-22 in `commitHlprcd`/`commitHlpdoc` (`webviewClientHelpers.js`). Their sub-field inputs (Record name / Label+Document+Folder) commit on their own `change` event even while the checkbox is unchecked, and since `present=false` is passed, `setFileFlagKeyword` discards the typed value entirely; the next re-render then shows the field blank again. Checking the box afterward re-reads that now-blank field and fails the required-field validation added in the `HLPRCD`/`HLPDOC` cross-verify follow-up above, alerting and reverting the checkbox back off - no ordering of "type first" vs. "check first" survives. Reported by user with a reproduction; confirmed directly against `setFileFlagKeyword` (typed value discarded when `present:false`). Fix direction: don't commit sub-field edits while the checkbox is off (or otherwise preserve the typed text across the off→on transition) so the required-field check has something to see.

---

<a id="i-44"></a>

### I-44 — Enforce `USRDFN` whitelist on record-level keywords

> **Area:** Record · **Status:** Done (v0.10.122) · **Depends on:** I-8, I-12, I-13

Bug: most record-level keywords don't enforce `USRDFN`'s own whitelist restriction - reported by user via `ASSUME` showing as selectable on a `USRDFN` record.

Root cause confirmed: `DspfWriter.usrdfnConflictReason(keywordName, keywords)` is a fully generic function (works correctly for ANY keyword name, verified directly) because `USRDFN`'s own DDS Reference section is a strict WHITELIST - "No file- or record-level keywords apply to this record except INVITE, KEEP, PASSRCD, HLPRTN, HELP, HLPCLR, PRINT, OPENPRT, and TEXT" - not a short per-keyword exclusion list like most keywords. But it's only wired to 4 call sites (`ASSUME`, `ALWROL`, `HLPSEQ`, `HLPCMDKEY` - added piecemeal by I-8/I-12/I-13, each time because that keyword's OWN section happened to name USRDFN, never because USRDFN's own section was read as a blanket rule). Confirmed at least 33 other record-level keywords wired via plain `simple()`/`wirePulldownGuardedFlag()` with zero USRDFN check: `RETKEY`, `RETCMDKEY`, `CSRINPONLY`, `BLINK`, `MSGALARM`, `LOCK`, `LOGOUT`, `DSPMOD`, `CSRLOC`, `LOGINP`, `GETRETAIN`, `RETLCKSTS`, `PROTECT`, `INZINP`, `HLPPNLGRP`, `HLPEXCLD`, `HLPBDY`, `HLPARA`, `SFLNXTCHG`, `INZRCD`, `ALARM`, `ALWGPH`, `FRCDTA`, `SLNO`, `CLRL`, `RTNDTA`, `OVERLAY`, `PUTRETAIN`, `PUTOVR`, `OVRDTA`, `OVRATR`, `MDTOFF`, `ERASEINP`, `ERASE`.

On implementation, re-auditing this list against the DDS Reference (not just re-testing each in isolation) found 4 false positives: `HLPPNLGRP`/`HLPEXCLD`/`HLPBDY`/`HLPARA` are each individually documented as help-SPECIFICATION-level keywords, not file- or record-level - they're wired in `wireApplicationHelpFields` against a help entry's own local keyword array, not the record's - and USRDFN's own text explicitly carves this out: "Help specifications are valid for this record." `SFLNXTCHG` is confirmed-not-applicable for a different reason: every one of its own wiring call sites (`wireSflKeywordsPanels`'s SFLCTL panel, and the message-subfile panel beside it) is a record type structurally mutually exclusive with USRDFN, so there's no live call site where the guard could ever fire either way.

Fixed the remaining 29: added the check directly inside `wirePulldownGuardedFlag` (covers `INZRCD`/`ALARM`/`ALWGPH`/`FRCDTA`/`SLNO`/`CLRL`/`RTNDTA`/`OVERLAY`/`PUTRETAIN`/`PUTOVR`/`OVRDTA`/`OVRATR`/`MDTOFF`/`ERASEINP`/`ERASE` in one place), and extended `wireUsrdfnGuardedFlag`/`wireUsrdfnGuardedTwoField` with new optional `hasParams`/conditioning-toggle params (backward compatible - existing `ASSUME`/`ALWROL`/`HLPCMDKEY`/`HLPSEQ` callers unaffected) so the remaining 13 could be converted off plain `simple()`/`wireTwoField()` without dropping their existing params box or live Conditioning toggle (each verified individually against its own DDS Reference text first).

Separate audit finding, also confirmed via a live DOM check: `isUsrDfnRecord`'s own Task R2 (already in place before I-44) already hides 25 of these 29 keywords' entire tab category (Indicator/Output/Input/Overlay) for a USRDFN record, so only 4 - `RETKEY`, `RETCMDKEY`, `CSRINPONLY`, `INZRCD` - are actually reachable through today's UI on a real USRDFN record; the other 25's guard is correct, harmless defense-in-depth per each keyword's own DDS Reference text, not a currently observable behavior change (R2 had already closed that gap at the category level).

New test `i44UsrdfnRecordLevelAudit.test.js` covers both groups (full block/revert/no-post for the 4 reachable keywords; DOM-absence + no-regression-on-a-plain-record for the other 25 and CSRLOC), and updated `i8UsrdfnConflictAudit.test.js`'s own "unrelated, still-valid" example off `RETKEY` (now correctly guarded) onto `KEEP` (genuinely on USRDFN's whitelist).

Split off from a single larger finding so it can be picked up independently of I-45 through I-48 below (each covers a different, unrelated investigation), and I-49/I-50/I-51 below (new findings from this task's own implementation).

---

<a id="i-45"></a>

### I-45 — `DSPMOD` requires both display sizes in `DSPSIZ`

> **Area:** Record · **Status:** Done (v0.10.126) · **Depends on:** I-44

Bug (split off from I-44's original finding): `DSPMOD` has its own SEPARATE unchecked prerequisite, unrelated to USRDFN - its own DDS Reference text states it's "valid only when both the 24 x 80 and 27 x 132 display sizes are specified on the DSPSIZ keyword" (a file-level `DSPSIZ` condition). Confirmed: `DSPMOD`'s row (via `wireUsrdfnGuardedFlag` after I-44, plain `simple()` before it) had no check of any kind for this.

Fixed with new `DspfWriter.dspmodDspsizPrerequisiteReason(fileKeywords)`, which reuses `getDisplaySizesList` (already normalizes both of DSPSIZ's valid forms - named `*DS3`/`*DS4` and bare numeric `24 80`/`27 132` - to the same `{lines, columns}` shape) to check both required sizes are present, in either order (the first one listed is only the *default* mode per DSPMOD's own text, not a requirement on order). Wired into `wireUsrdfnGuardedFlag` via a new optional trailing `alsoCheckDspsiz` param (same "layer one more check on top" shape as `alsoCheckWindow`/`alsoCheckKeep`/`alsoCheckPassrcd`), passed only at DSPMOD's own call site - every other caller (`ASSUME`/`ALWROL`/`HLPCMDKEY`/`BLINK`/`MSGALARM`/`LOCK`/`LOGOUT`) is unaffected. Same alert+revert idiom as every other guard here.

New `i45DspmodDspsizPrerequisite.test.js` (single size either way, no `DSPSIZ` at all, both sizes in either order).

Fixing this exposed that `i44UsrdfnRecordLevelAudit.test.js`'s own fixture only declared one display size, which meant its (unrelated) DSPMOD-on-a-plain-record regression check was itself relying on the bug this task just fixed - updated that fixture's `DSPSIZ` to declare both sizes so that check continues to test what it always meant to (no USRDFN-guard interference), independent of this task's own fix.

Separate finding, NOT fixed here (logged as I-52): `DSPMOD`'s own DDS Reference text also states "The DSPMOD keyword cannot be specified on a subfile record (SFL keyword)" - a second, independent prerequisite this task's own scope never covered.

Full suite: 4802/4802 assertions, zero failures.

---

<a id="i-46"></a>

### I-46 — `SFL` / `SFLCTL` whitelist; raw keyword editor guard

> **Area:** Record · **Status:** Done (v0.10.128) · **Depends on:** I-44

**Fixed.** Investigation (split off from I-44's original finding): re-read `SFL`'s and `SFLCTL`'s own DDS Reference sections the same way I-44 re-read `USRDFN`'s - as a possible blanket whitelist/exclusion rule, not just individual keyword-to-keyword cross-references.

Findings: `SFL`'s own section states outright "Besides SFL, the following keywords are also valid on the subfile record format:" followed by a closed, enumerated list - for message subfiles, `SFLMSGRCD` (record-level; `SFLMSGKEY`/`SFLPGMQ` are field-level); for all other subfiles (at the record level), `CHANGE`, `LOGINP`, `CHECK(AB)`, `CHECK(RL)`, `LOGOUT`, `SETOF`/`SETOFF`, `CHGINPDFT`, `INDTXT`, `SFLNXTCHG`, `KEEP`, `TEXT` - the exact same closed-whitelist shape as `USRDFN`'s own "except" text, just phrased additively. `SFLCTL`'s own section, by contrast, introduces its Required/Optional keyword tables as "a summary of **subfile** keywords used with the SFLCTL keyword" - explicitly scoped to SFL-family keywords, not a claim that ordinary DDS keywords are disallowed; its one individual restriction ("`USRDFN` is not valid for the subfile-control record format") is already structurally unreachable, since `USRDFN`/`SFL`/`SFLCTL` are each their own record TYPE the "+ Add record" wizard picks exactly once (`RECORD_TYPES`) - no code change needed for `SFLCTL`.

Fix: new `DspfWriter.sflWhitelistConflictReason` (mirrors I-49's `usrdfnWhitelistConflictReason` exactly, including the message-subfile/plain-subfile split), wired into the SAME record-level raw-keyword-editor catch-all I-49 built (`wireKeywordEditor`'s `addGuardFn`, at `renderRecordProps`'s own call site in `buildWebviewTemplate.js`) alongside the existing `usrdfnWhitelistConflictReason` check.

An exhaustive sweep of the structured per-keyword checkboxes across the General/Indicator/Output/Input/Overlay/Print tabs (the same way I-44 individually rewired 29 USRDFN call sites through `wireUsrdfnGuardedFlag`) is a separate, much larger undertaking - logged as **I-53**, not attempted here, mirroring the exact I-44/I-49 split this task was itself split off from.

Regression coverage: `src/test/i46SflRawKeywordEditorWhitelist.test.js` (plain-SFL whitelist enforcement, message-subfile's own narrower whitelist, and no-regression checks for both a non-SFL record and file-level keywords), same live-DOM harness shape as I-49's own test.

---

<a id="i-47"></a>

### I-47 — `WINDOW` six-keyword mutual exclusion

> **Area:** Record · **Status:** Done (v0.10.129) · **Depends on:** I-44

Investigation (split off from I-44's original finding): same re-read, for `WINDOW`'s own DDS Reference section.

Findings: WINDOW's own text names SIX keywords a record format can't also carry - `ALWROL`, `ASSUME` (already individually known via `windowConflictReason`, wired through the checkbox path), plus `MNUBAR`, `PULLDOWN`, and `SFL` (not previously cross-checked against WINDOW anywhere) and `USRDFN` (already indirectly covered one direction only - WINDOW isn't on USRDFN's own whitelist, I-49). A closed six-keyword exclusion list, not a broader whitelist shape like USRDFN/SFL's own sections.

Also confirmed, no code change needed: "WINDOW is allowed on a record with the SFLCTL keyword" is an explicit exception (SFLCTL deliberately excluded from the list); WINDOW's own PASSRCD restriction was already fixed by I-24; the ERRSFL/MSGLOC-"ignored" and WDWBORDER-parameter-shape notes in the same section are informational precedence/formatting guidance, not "cannot specify together" rules.

Reachability: WINDOW/MNUBAR/PULLDOWN/SFL/USRDFN are each their own record TYPE the "+ Add record" wizard picks exactly once (`RECORD_TYPES`), so the wizard itself can never combine two - only the raw/Advanced keyword editor can, the same bypass I-49/I-46 each closed for USRDFN's/SFL's own whitelists; nothing existing caught MNUBAR/PULLDOWN in either direction, or the REVERSE direction (raw-adding WINDOW itself to a record already carrying one of the six) for any of them.

Fixed with new `DspfWriter.windowMutexConflictReason(keywordName, recordKeywords)` - bidirectional, checks both "record has WINDOW, adding one of the six" and "record has one of the six, adding WINDOW" - wired into the SAME record-level raw-editor `addGuardFn` chain I-49/I-46 already built, alongside `usrdfnWhitelistConflictReason`/`sflWhitelistConflictReason`. `windowConflictReason`'s own two existing checkbox call sites (ASSUME/ALWROL) are untouched.

New `i47WindowMutexRawEditor.test.js`: all six keywords blocked in both directions, the SFLCTL exception commits normally, a plain record is unaffected, and the pre-existing ASSUME checkbox guard still fires.

Full suite: 4871/4871 assertions, zero failures.

---

<a id="i-48"></a>

### I-48 — `MNUBAR` whitelist; raw keyword editor guard

> **Area:** Record · **Status:** Done (v0.10.130) · **Depends on:** I-44

Investigation (split off from I-44's original finding): re-read `MNUBAR`'s own DDS Reference section fresh, same shape as I-44/I-46/I-47's own re-reads.

Finding: MNUBAR's own section states outright, in the exact same closed-whitelist shape as `USRDFN`'s/`SFL`'s own text: "The following keywords are allowed on a record containing the MNUBAR keyword:" followed by a closed, 27-entry list - `CAnn`/`CFnn`, `CLEAR`, `CLRL`, `CSRLOC`, `DSPMOD`, `HELP`, `HLPCLR`, `HLPCMDKEY`, `HLPRTN`, `HLPTITLE`, `HOME`, `INDTXT`, `INVITE`, `KEEP`, `LOCK`, `MNUBARDSP`, `MNUBARSEP`, `MNUBARSW`, `MNUCNL`, `OVERLAY`, `PAGEDOWN`/`PAGEUP`, `PRINT`, `PROTECT`, `ROLLUP`/`ROLLDOWN`, `TEXT`, `UNLOCK`, `VLDCMDKEY` - with no matching "anything else is fine too" language. `MNUBAR`'s own record-composition rule (exactly one menu-bar field, no other displayable fields) was already fixed by I-19 and is out of this task's own scope.

Confirmed a live, previously-unguarded gap: `isMnuBarRecord` only drives whether the MNUBAR tab itself is shown (unlike `isUsrDfnRecord`'s own Task R2 category-narrowing), so a MNUBAR record's Indicator/Output/Input/Overlay tabs render the full, unfiltered checkbox set, and the record-level raw keyword editor had no guard for it either.

Fix: new `DspfWriter.mnubarWhitelistConflictReason(keywordName, recordKeywords)` (mirrors I-49's `usrdfnWhitelistConflictReason`/I-46's `sflWhitelistConflictReason` exactly), with `CAnn`/`CFnn` matched by pattern (`/^CA\d{2}$/`/`/^CF\d{2}$/`) since this codebase stores them as literal `CA01`..`CA24`/`CF01`..`CF24` keyword names, not a single parametrized name - wired into the SAME record-level raw-keyword-editor `addGuardFn` chain I-49/I-46/I-47 already built, alongside `usrdfnWhitelistConflictReason`/`sflWhitelistConflictReason`/`windowMutexConflictReason`.

An exhaustive sweep of the structured per-keyword checkboxes across the General/Indicator/Output/Input/Overlay/Print tabs (the same "much larger undertaking" I-46 split off as I-53 for SFL's own whitelist) is logged separately as **I-54**, not attempted here, mirroring that exact split.

New `i48MnubarRawKeywordEditorWhitelist.test.js` (non-whitelisted keywords blocked with an alert naming MNUBAR; whitelisted keywords and CAnn/CFnn pattern names commit normally; a non-MNUBAR record's raw editor unaffected), confirmed via `git stash` to genuinely fail (10 checks) against pre-fix code.

Full suite: zero failures.

---

<a id="i-49"></a>

### I-49 — Raw keyword editor bypassed the `USRDFN` guards

> **Area:** Record · **Status:** Done (v0.10.125) · **Depends on:** I-44

Gap found while implementing I-44: the one remaining way a `USRDFN` record could still end up carrying one of I-44's 29 record-level keywords is the Advanced/raw keywords accordion (`keywordEditorHtml`) - a generic add-any-keyword-by-name editor that's rendered unconditionally regardless of record type and isn't wired through `simple()`/`wirePulldownGuardedFlag()`/`wireTwoField()` at all, so none of I-44's guards apply to it. Confirmed via live DOM check that this accordion IS still rendered for a USRDFN record (unlike the Indicator/Output/Input/Overlay tabs, which Task R2 already hides entirely for USRDFN).

Scope was indeed materially bigger than I-44, as flagged: rather than guarding one individually-confirmed keyword name per call site (every prior USRDFN guard's own shape), this needed the whitelist text itself consulted directly, since the raw editor accepts literally any string. New `DspfWriter.usrdfnWhitelistConflictReason(keywordName, recordKeywords)` does that: returns a reason unless `keywordName` is on USRDFN's own 9-keyword whitelist (`INVITE`, `KEEP`, `PASSRCD`, `HLPRTN`, `HELP`, `HLPCLR`, `PRINT`, `OPENPRT`, `TEXT` - plus `USRDFN` itself, always allowed) or the record isn't USRDFN. `wireKeywordEditor` gained a new optional trailing `addGuardFn(name, params)` param, checked only in the "+ Add keyword" click handler (alert + no-op, same idiom as every other USRDFN guard - remove is never guarded); every pre-existing call site (file, field, help-entry, and the two menu-designer keyword editors) omits it and is unaffected. Wired only at the record-level call site (`renderRecordProps`) to `DspfWriter.usrdfnWhitelistConflictReason`.

New `i49UsrdfnRawKeywordEditorWhitelist.test.js`: confirms non-whitelisted keywords (`RETKEY`, `DSPATR`, `BLINK`, `CHANGE`) are blocked with a USRDFN-naming alert and no `applyEdit` on a USRDFN record; whitelisted keywords (`KEEP`, `HLPCLR`, `OPENPRT`) still commit and round-trip through the reparsed DDS; a non-USRDFN record's raw editor is completely unaffected (no alert, normal commit); and the file-level raw editor (no guard wired) still adds normally.

Full suite: 4790/4790 assertions, zero failures.

---

<a id="i-50"></a>

### I-50 — `RETLCKSTS` shown with a params box it does not have

> **Area:** Record · **Status:** Done (v0.10.123) · **Depends on:** I-44

Bug found while implementing I-44: `RETLCKSTS`'s own row had always been wired with `hasParams=true` (renders a parameter text box) on both the render side (`flagRowHtml(..., retlcksts.parameters, 'indicators (optional)', ...)`) and the wire side (`wireUsrdfnGuardedFlag(..., hasParams=true, withConditioning=true)`), but `RETLCKSTS`'s own DDS Reference text states "This keyword has no parameters." Pre-existing, unrelated to USRDFN - not introduced by I-44, which preserved the existing (buggy) behavior unchanged to avoid stacking an unrelated fix into that task's diff.

Fixed exactly as planned: dropped the params box entirely on both sides (`paramsValue`/`paramsPlaceholder` now `undefined` on the render call, `hasParams` flipped to `false` on the wire call), leaving the live Conditioning toggle untouched.

New `i50RetlckstsParamsBug.test.js`, confirmed via `git stash` to genuinely fail against pre-fix code; updated `i44UsrdfnRecordLevelAudit.test.js`'s own `RETLCKSTS` groupB entry to drop the `hasParams`/`paramValue` expectations it used to assert against.

Full suite: 4612/4612 assertions, zero failures.

---

<a id="i-51"></a>

### I-51 — `wirePulldownGuardedFlag` dead Conditioning toggles

> **Area:** Record · **Status:** Done (v0.10.124) · **Depends on:** I-13, I-44

Bug found while implementing I-44: `wirePulldownGuardedFlag` (added by I-13) never wires a live Conditioning toggle at all, for any of its callers - yet several of the keywords routed through it since I-13 (`ALARM`, `ALWGPH`, `FRCDTA`, `MDTOFF`, `ERASEINP`, `ERASE`, `OVERLAY`, `PUTRETAIN`, `PUTOVR`, `OVRDTA`, `OVRATR`, `RTNDTA`) are each individually documented "Option indicators are valid for this keyword," and several of their own HTML rows that pass a real `conditions` value into `flagRowHtml` (e.g. `MDTOFF`, `ERASEINP`) still render a Conditioning toggle button in the UI - so for those, the toggle is visible but silently does nothing when clicked (no click handler ever gets wired to it). Pre-existing since I-13, unrelated to USRDFN - not introduced or fixed by I-44.

On implementation, independently re-verified every `wirePulldownGuardedFlag` caller against the DDS Reference rather than trusting this task's own original list as exhaustive or exact, and corrected it two ways: `RTNDTA` was named above but its own DDS Reference text actually says "Option indicators are **not** valid for this keyword," and its own row already passes `undefined` for `conditions` (no toggle ever rendered, so no bug there) - excluded. `HLPCLR` and `INVITE` were NOT named above despite being individually documented "valid"/"allowed" and having the identical dead-toggle symptom on their own rows - added. Final in-scope set (13): `ALARM`, `ALWGPH`, `FRCDTA`, `HLPCLR`, `INVITE`, `OVERLAY`, `PUTRETAIN`, `PUTOVR`, `OVRDTA`, `OVRATR`, `MDTOFF`, `ERASEINP`, `ERASE`. `INZRCD`/`SLNO`/`CLRL`/`RTNDTA` confirmed correctly excluded already (each "not valid," no toggle rendered).

Fixed by extending `wirePulldownGuardedFlag` with a new optional `withConditioning` trailing param (backward compatible - the two unaffected callers, `INZRCD` and the already-excluded four, are untouched) that wires the same `wireFlagRowConditioning` call `wireUsrdfnGuardedFlag` gained in I-44.

New `i51PulldownConditioningFix.test.js`: for all 13, clicks the toggle, adds a pending OR-condition, commits an indicator, and confirms the reparsed DDS actually carries it (same click-through method as `dspfWebview.test.js`'s own BLINK/SFLDSP scenarios) - confirmed via `git stash` to genuinely fail (13 checks) against pre-fix code.

Also found and fixed, while here: I-50's own commit had bumped `package.json`'s version but never ran `npm install` to sync `package-lock.json`'s two version fields, and never added its own new test (`i50RetlckstsParamsBug.test.js`) to `package.json`'s `test` script, so `npm test` was silently skipping it - both corrected as part of this commit.

---

<a id="i-52"></a>

### I-52 — `DSPMOD` cannot be specified on a subfile record

> **Area:** Record · **Status:** Done (v0.10.127) · **Depends on:** I-45

Gap found while implementing I-45: `DSPMOD`'s own DDS Reference text has a SECOND, independent prerequisite beyond the `DSPSIZ` one I-45 fixed - "The DSPMOD keyword cannot be specified on a subfile record (SFL keyword). The subfile is [dis]played according to the DSPMOD of the corresponding subfile control record."

Confirmed live gap: `recordKeywordsPanelsHtml`'s Output tab (which renders DSPMOD's row) has no `isSflRecord`/`isSflCtlRecord` category-gating anywhere in `renderRecordProps` - unlike USRDFN's own Task R2 narrowing, every record type gets the full 8-tab set, so DSPMOD was fully reachable and editable on a plain SFL record with no guard. The second sentence of the DDS Reference text is the key scoping detail: it deliberately names only the plain SFL (detail) record, and explains why - the SFLCTL record's own DSPMOD already governs the whole subfile - so `SFLCTL` is NOT included in this fix's conflict list, unlike every other SFL-mutex rule in this file (e.g. `alwrolClrlSlnoConflictReason`'s own `['ASSUME','SFL','SFLCTL','USRDFN']` list, which covers a different keyword's own wording that names both).

Fixed with new `DspfWriter.dspmodSflConflictReason(keywordName, recordKeywords)`, checking the literal `SFL` keyword's presence on the record directly (NOT `WebviewClientHelpers.isSflRecord`, which deliberately excludes SFLMSG records for an unrelated UI-tab reason that has nothing to do with this keyword's own restriction). Wired unconditionally into `wireUsrdfnGuardedFlag`'s existing check chain - no new trailing param needed, since the function itself is scoped to `keywordName === 'DSPMOD'` (same "safe no-op for every other caller" shape as `alwrolClrlSlnoConflictReason`/`usrdfnConflictReason`). Same alert+revert idiom as every other guard here.

New `i52DspmodSflConflict.test.js` (plain SFL record blocked; SFLCTL record NOT blocked - commits normally; plain non-SFL record unaffected), all 3 scenarios using a DSPSIZ declaring both sizes so I-45's own prerequisite never interferes.

Distinct from I-46 (still in progress elsewhere): I-46 is re-reading SFL/SFLCTL's OWN DDS Reference sections for a USRDFN-style blanket rule on what else can coexist on an SFL/SFLCTL record; this finding is the mirror case, a restriction stated in DSPMOD's OWN section.

Full suite: zero failures.

---

<a id="i-53"></a>

### I-53 — `SFL` whitelist: structured-checkbox sweep

> **Area:** Record · **Status:** Done (v0.10.131) · **Depends on:** I-46

**Fixed.** Follow-up from I-46: exhaustive per-keyword-checkbox sweep of the General/Indicator/Help/Output/Input/Overlay/Print record-property tabs for a plain SFL record, rewiring every row whose keyword is NOT on `SFL`'s own whitelist (`CHANGE`/`LOGINP`/`CHECK`/`LOGOUT`/`SETOF`/`SETOFF`/`CHGINPDFT`/`INDTXT`/`SFLNXTCHG`/`KEEP`/`TEXT`) through a guard, so the structured checkboxes - not just the raw keyword editor I-46 already closed - are blocked too. Confirmed via a full audit of every keyword row in `wireRecordKeywordsPanels` (`webviewClientHelpers.js`) that EVERY plain flag/two-field keyword on these tabs already routes through one of three shared functions - `wireUsrdfnGuardedFlag`, `wireUsrdfnGuardedTwoField`, `wirePulldownGuardedFlag` - the exact same three I-44 individually rewired 29 USRDFN call sites through. `DspfWriter.sflWhitelistConflictReason` (already safe to call unconditionally - returns null for anything already whitelisted, or when the record isn't SFL at all) was added to all three functions' existing check chains in one place each, closing the gap for every keyword that flows through them (including `LOGINP`/`LOGOUT`, both already whitelisted and correctly unaffected).

Two keywords with bespoke, non-generic commit functions that bypass all three needed their own individual fix: `PRINT`'s own record-level commit (`wireRecordPrint`, hand-rolled for its S36E response-indicator check and print-file/library fields) gained a second check alongside its existing S36E one; `ENTFLDATR`'s own Apply-button color/attribute editor (`wireEntFldAtrEditor`, shared with the file-level tab) gained a new optional trailing `addGuardFn(name)` param (same shape as `wireKeywordEditor`'s own I-49 addition), wired only at the record-level call site so the file-level one is unaffected.

Keywords using the generic repeatable-instance editor (`MNUBARDSP`, and any other keyword sharing that much more widely-used primitive) are explicitly NOT covered here - logged as **I-55**, since retrofitting a guard into that shared machinery is a bigger, separate undertaking than this task's own flag-row-focused scope.

Regression coverage: `src/test/i53SflRecordCheckboxSweep.test.js` (plain flags, both two-field keywords, both bespoke commits, whitelisted-keyword no-regression, message-subfile's own narrower whitelist, and a non-SFL record's complete non-regression), full suite: zero failures.

---

<a id="i-54"></a>

### I-54 — `MNUBAR` whitelist: structured-checkbox sweep

> **Area:** Record · **Status:** Done (v0.10.132) · **Depends on:** I-48

Follow-up from I-48: exhaustive per-keyword-checkbox sweep of the General/Indicator/Output/Input/Overlay/Print record-property tabs for a MNUBAR record, rewiring every row whose keyword is NOT on MNUBAR's own whitelist through a guard (mirroring I-44's `wireUsrdfnGuardedFlag`/`wireUsrdfnGuardedTwoField` sweep for USRDFN's own 29 call sites, and the identical follow-up I-53 already did for SFL's own whitelist). Confirmed: every one of the ~25 non-whitelisted record-level checkbox keywords I-44 originally audited (`INZRCD`, `ASSUME`, `ALWROL`, `RETKEY`, `RETCMDKEY`, `CSRINPONLY`, `HLPSEQ`, `BLINK`, `ALARM`, `MSGALARM`, `LOGOUT`, `ALWGPH`, `FRCDTA`, `SLNO`, `LOGINP`, `GETRETAIN`, `RETLCKSTS`, `RTNDTA`, `PUTRETAIN`, `PUTOVR`, `OVRDTA`, `OVRATR`, `INZINP`, `MDTOFF`, `ERASEINP`, `ERASE`) is wired through one of the SAME three shared functions I-53 already patched for SFL (`wireUsrdfnGuardedFlag`, `wireUsrdfnGuardedTwoField`, `wirePulldownGuardedFlag`) - so adding `DspfWriter.mnubarWhitelistConflictReason` unconditionally to all three functions' own check chains (same safe-no-op-when-not-applicable shape `sflWhitelistConflictReason` already established) closes the entire sweep in one pass, no per-keyword rewiring needed. Two bespoke (non-generic) commit functions bypass all three shared functions entirely, exactly as I-53 found for SFL: `ENTFLDATR`'s own Apply-button color/attribute editor (NOT on MNUBAR's whitelist either - guarded, ORed onto the same `addGuardFn` I-53 already added there for SFL) and `PRINT`'s own file/library form (unlike SFL, PRINT IS on MNUBAR's own whitelist - confirmed correctly needing NO change here). `RTNCSRLOC`'s own two hand-rolled IIFEs were checked and found to have NO guard of any kind (not even USRDFN/SFL) - a genuinely separate, pre-existing gap outside both this task's and I-53's own scope, not fixed here.

New `i54MnubarRecordCheckboxSweep.test.js` (mirrors `i53SflRecordCheckboxSweep.test.js`'s own shape): 6 non-whitelisted plain-flag keywords + HLPSEQ (two-field) + ENTFLDATR all blocked with an alert naming "menu-bar (MNUBAR)"; whitelisted `LOCK`/`OVERLAY`/`PROTECT` (flags), `CSRLOC` (two-field), and `PRINT` (bespoke) all still commit normally and round-trip through the reparsed DDS; a non-MNUBAR record's checkboxes/`ENTFLDATR` are completely unaffected.

Full suite: 5006/5006 assertions, zero failures.

---

<a id="i-55"></a>

### I-55 — Whitelist guards on the repeatable-instance editor

> **Area:** Record · **Status:** Done (v0.10.134) · **Depends on:** I-53

**Fixed.** Follow-up from I-53: extend the SFL whitelist guard to keywords wired through the generic repeatable-instance editor (`repeatableConditionedInstancesHtml`/`wireRepeatableConditionedInstances`). Two parts. (1) `wireRepeatableConditionedInstances` gained a new optional trailing `addGuardFn(freshInstance) -> reason|null`, checked once on every "+ Add" click (the only "on transition" this generic component itself performs) - every OTHER existing caller (MOUBTN, Color & attributes, Error messages, Message ID, SFLMSG/SFLMSGID, CHECK, HLPTITLE) omits the new param and is completely unaffected. Wired at `MNUBARDSP`'s own call site (`wireMnubardspPanel`) against `sflWhitelistConflictReason` only (`MNUBARDSP` is not on `SFL`'s own whitelist - I-46); confirmed reachable on a plain SFL record via the shared General tab. USRDFN was investigated and deliberately NOT added here - I-8's own original record-level audit explicitly named `MNUBARDSP` among the keywords individually checked against USRDFN's DDS Reference text and found no incompatibility statement ("left alone rather than guessed at"), so blocking it there would reverse an already-deliberate design decision, not close a gap; `mnubarWhitelistConflictReason` is also correctly omitted since `MNUBARDSP` IS on `MNUBAR`'s own whitelist. (2) `CLEAR`'s own repeatable Indicator-instance model (Task L5d) had the same gap, but its per-row "kind" dropdown can change AFTER an instance already exists (unlike MNUBARDSP's fixed identity), so the `addGuardFn` hook alone wouldn't catch a post-creation switch - generalized I-20's own CLEAR-vs-PULLDOWN-only `guardedUpdate` check into a new `recordIndicatorKindConflictReason(kind, keywords)` helper that also runs `sflWhitelistConflictReason`/`mnubarWhitelistConflictReason` for whichever kind is being set, and generalized the CLEAR/HOME `makeDefaultInstance` fallback into an ordered list (`CLEAR`, `HOME`, `HELP`, `HLPRTN`, `VLDCMDKEY`, `PAGEDOWN`, `PAGEUP`, `CHANGE`, `SETOF`, `INDTXT`) so "+ Add indicator keyword" always seeds a whitelist-safe kind on every record type (`INDTXT` confirmed safe on both SFL's and MNUBAR's own whitelists as a guaranteed last resort) instead of silently no-op'ing or seeding something that gets immediately blocked.

New `src/test/i55RepeatableInstanceWhitelistGuard.test.js`: MNUBARDSP's "+ Add" blocked with an alert naming "subfile (SFL)" on an SFL record, still commits normally on USRDFN/MNUBAR/plain records; the indicator-keywords "+ Add" auto-falls-back to CHANGE (not CLEAR) on SFL with no alert, still defaults to CLEAR on MNUBAR/plain records; explicitly switching kind to HOME on SFL and to SETOF on MNUBAR are each blocked with a same-record-type-named alert and the underlying keyword stays unchanged.

Full suite: zero failures.

---

<a id="i-56"></a>

### I-56 — `RTNCSRLOC` record-level guard

> **Area:** Record · **Status:** Done (v0.10.134) · **Depends on:** I-54

**Fixed.** Gap found while implementing I-54: `RTNCSRLOC`'s own two hand-rolled record-level commit IIFEs (`wireRtncsrlocRecName`/`wireRtncsrlocWindowMouse` in `webviewClientHelpers.js`, Task L77) had NO guard of any kind.

Fix: a small shared `rtncsrlocConflictReason()` helper (`sflWhitelistConflictReason('RTNCSRLOC', ...) || mnubarWhitelistConflictReason('RTNCSRLOC', ...)`), checked at the top of BOTH IIFEs' own `commit()` before either `setRtncsrlocRecNameFields`/`setRtncsrlocWindowMouseFields` is called - same alert-and-revert idiom as every other guard in this file, reverting all of that variant's own fields (not just the checkbox) back to their last-committed values on block, since unlike a plain flag row this variant has several sibling text fields that could otherwise show a rejected, uncommitted value. USRDFN was left deliberately unchecked, resolving I-56's own "unconfirmed" note: I-8's original audit already individually checked `RTNCSRLOC` against USRDFN's DDS Reference text with no incompatibility found - same "left alone rather than guessed at" reasoning I-55 confirmed for MNUBARDSP, not re-litigated here.

New `src/test/i56RtncsrlocWhitelistGuard.test.js`: both the `*RECNAME` and `*WINDOW`/`*MOUSE` variants are independently blocked (with all their own fields reverted, not just the checkbox) on both a plain SFL record and a MNUBAR record, each with an alert naming the correct record type; both variants still commit normally on a plain record; a combined scenario confirms both variants block independently on the same SFL record without interfering with each other.

Full suite: zero failures.

---

<a id="i-57"></a>

### I-57 — `PSHBTNFLD` / `PSHBTNCHC` (push-button field)

> **Area:** Field · **Status:** Done (v0.10.139) · **Depends on:** I-41

Split off from I-41's own scoping investigation: implement `PSHBTNFLD`/`PSHBTNCHC` (push-button field), the second half of I-41's original scope. Structurally near-identical to the already-implemented `SNGCHCFLD`/`CHOICE` pair - `PSHBTNFLD` maps to `SNGCHCFLD`'s own selection-field flag (own distinct param list: `*NORSTCSR`/`*RSTCSR`, `*NUMCOL nbr`/`*NUMROW nbr`, `*GUTTER width`), `PSHBTNCHC(choice-number choice-text [command-key] [*SPACEB])` maps to `CHOICE`'s own per-choice repeatable keyword (with one addition: an optional command-key parameter valid values `CA01`-`CA24`/`CF01`-`CF24`/`PRINT`/`HELP`/`CLEAR`/`ENTER`/`HOME`/`ROLLUP`/`ROLLDOWN`, defaulting to `ENTER` when omitted). The field containing `PSHBTNFLD` must be input-capable, type Y, length 2, decimals 0 (same shape DDS enforces on other selection-field types already modeled). `PSHBTNFLD`'s own DDS Reference text also lists its own small allowed-keyword whitelist for the field carrying it (`ALIAS`/`CHANGE`/`CHCAVAIL`/`CHCUNAVAIL`/`CHCCTL`/`INDTXT`/`NOCCSID`/`PSHBTNCHC`/`DSPATR(PC)`/`TEXT`) - worth a guard analogous to `htmlConflictReason` (I-41) once the field kind itself exists. Not yet started, logged for later pickup - a genuinely separate, larger UI undertaking (new field-kind selector option, new choice-list editor panel, new param-parsing functions) than I-41's own HTML fix, which is why it was split out rather than attempted in the same task.

**Implemented.** Re-read `PSHBTNFLD`/`PSHBTNCHC`'s own DDS Reference sections fresh before implementing (same method as I-42/I-44). The scoping above held, with three corrections and additions found on the way:

1. **The design-time preview was already half-wired, and wrong.** `DspfEngine.widgetFromKeywords` treated `PSHBTNCHC` as "just the button text, with no leading choice-id", so `PSHBTNCHC(1 '>Help' HELP)` rendered as ONE button labelled with the raw parameter string, and only the first choice was ever drawn. Replaced with a real parser (`parsePshbtnchc`) and a new `pshbtn` widget that draws every choice as its own button: choice-number order; the mnemonic `>` stripped and `>>` collapsed per IBM's own table (`'X >>>= 1'` shows `X >= 1`); choices whose option indicators are off compressed out ("the list of choices is compressed"); `*NUMCOL`/`*NUMROW`/`*GUTTER`/`*SPACEB` laid out on a `ch`-sized CSS grid; the command key exposed as the button title. A `PSHBTNFLD` with no choices keeps the old single placeholder button. `fixtures/generateWidgetFixture.js` was emitting invalid DDS for this (a `1A` field and a number-less `PSHBTNCHC('Submit Order')`) and is fixed.
2. **Grammar.** IBM writes the three numeric parameters as `(*NUMCOL n)`/`(*NUMROW n)`/`(*GUTTER n)`, so the new `DspfWriter.getPshbtnfld`/`setPshbtnfld` use that shape (and read the `*NUMCOL(n)` shape leniently) instead of reusing `getChoiceSelectionType`/`setChoiceSelectionType` — which turned out to use the *wrong* shape for `SNGCHCFLD`/`MLTCHCFLD` (see Deferred findings). `*NUMCOL` and `*NUMROW` are alternatives (the UI refuses both; the writer backstop keeps `*NUMCOL`); `*GUTTER` must be greater than one; option indicators are not valid, so `PSHBTNFLD` never carries conditions.
3. **UI.** A "Push button field (PSHBTNFLD/PSHBTNCHC)" accordion in the field-level Attributes tab: a toggle, cursor restriction, columns/rows/gutter with an Apply, and the choices as `MOUBTN`-style repeatable, independently conditioned instances (not the batch table `CHOICE` uses, since `PSHBTNCHC` is documented "Option indicators are valid"): number 1–99 (unique — duplicates refused), text (literal or `&field`, quoted and doubled automatically), a command-key dropdown (`CA01`–`CA24`, `CF01`–`CF24`, `PRINT`/`HELP`/`CLEAR`/`ENTER`/`HOME`/`ROLLUP`/`ROLLDOWN`; blank = the default `ENTER`), and `*SPACEB`. Turning `PSHBTNFLD` on rewrites the field to the required input-capable / type `Y` / length 2 / decimals 0 definition **and** seeds a valid `PSHBTNCHC(1 'Enter')` in the *same* edit (`DspfWriter.pshbtnfldDefinitionUpdates`), so the DDS is never written half-converted; turning it off removes the now-orphaned `PSHBTNCHC` too. The add-field panel gained a "Field kind" selector (Standard / Push button) that creates a ready-made push-button field.

The ten-keyword whitelist (`ALIAS`/`CHANGE`/`CHCAVAIL`/`CHCUNAVAIL`/`CHCCTL`/`INDTXT`/`NOCCSID`/`PSHBTNCHC`/`DSPATR(PC)`/`TEXT`) is enforced in both directions by new `DspfWriter.pshbtnfldConflictReason` (also "`PSHBTNCHC` needs `PSHBTNFLD`"; `DSPATR` allowed only as `PC`). It is chained after I-41's `htmlConflictReason` and I-58's `wrdwrapReverseConflictReason` on the field-level raw keyword editor, checked when turning `PSHBTNFLD` on, and hooked into Choice selection type's Apply through a new optional `addGuardFn` on `wireChoiceSelectionTypeEditor` (so `SNGCHCFLD`/`MLTCHCFLD` can't be put on a push-button field).

New `src/test/i57PshbtnFieldKind.test.js` (123 checks): the model and IBM's own examples, the whitelist matrix, the engine preview and layouts, and the real generated webview end to end — including the duplicate-number, blank-text, gutter and `*NUMCOL`+`*NUMROW` refusals and the add-field flow. Confirmed to fail against pre-fix code.

Landed after I-58, I-59 and I-60; the rebase conflicted only on the field-level raw editor's `addGuardFn` line (now a three-way chain) and the `package.json` test script.

Not addressed here: opened as follow-up tasks I-62 – I-66 (each marked "Raised by I-57").

---

<a id="i-58"></a>

### I-58 — Reverse `WRDWRAP` mutual-exclusion guards

> **Area:** Field · **Status:** Done (v0.10.137) · **Depends on:** I-42

**Fixed.** Follow-up from I-42: I-42 blocked turning `WRDWRAP` on while a conflicting keyword was already on the field, but nothing blocked the reverse - adding one of `WRDWRAP`'s own conflicting keywords to a field that already carried it.

Re-verified against `DDS_Keyword_V7r6.txt` rather than trusting the follow-up's list: `WRDWRAP`'s own section names exactly `AUTO(RAZ, RAB)`, `CHECK(MF, M10F, M11F, RB, RZ, RL, RLTB)`, `CHGINPDFT(MF)`, `DSPATR(OID, SP)`, `DUP`, `FLTFIXDEC`, `IGCALTTYP` - no false positives, no omissions - and the `CHECK` and `CHGINPDFT` sections independently state the same restriction from their own side.

Reachability sweep: `AUTO` has no structured panel of its own (raw editor only); `DUP`, `CHGINPDFT`, `IGCALTTYP`, `DSPATR` (Color & attributes) and `CHECK` (Keying options, Validity check) each have one; `FLTFIXDEC` only renders for floating-point data, which `WRDWRAP` itself forbids, so it can never coexist through the UI but is covered anyway.

Fix, two layers: (1) `DspfWriter.wrdwrapReverseConflictReason(name, params, fieldKeywords)` wired into the field-level raw keyword editor's `addGuardFn` chain (alongside I-41's `htmlConflictReason`) - the only path to `AUTO`; (2) `DspfWriter.wrdwrapNewConflictReason(oldKeywords, newKeywords)`, a diff-based backstop at the top of `commitEdit`, so every field-level panel - present and future - is covered at one choke point instead of a hand-rolled guard per panel (alert, then `render()` reverts the panel to the model's real state). Both share one token-matching helper with I-42's forward check (`CHECK(AB)`/`CHECK(VN)` are not substring-matched against `M10F` etc.). The diff-based design means a hand-written file that already has both keywords is not re-reported, so unrelated edits to it are never blocked, and removing a conflicting keyword is always allowed.

New `i58WrdwrapReverseGuards.test.js` (79 checks): pure unit checks of both functions, the raw editor across all ten conflicting keyword/parameter shapes plus no-regression cases, each panel (DUP, IGCALTTYP, CHGINPDFT(MF), DSPATR(SP), CHECK(RB) via Keying options) driven through the real generated webview script in jsdom, and a pre-existing-conflict field. Confirmed via stash to fail (30 DOM checks) against pre-fix code.

Not addressed here: a DATA TYPE or USAGE change on a field that already carries `WRDWRAP` - see Deferred findings.

Full suite: zero failures.

---

<a id="i-59"></a>

### I-59 — Bare `ENTFLDATR` and `*CURSOR`/`*NOCURSOR` in the shared editor

> **Area:** Cross-level · **Status:** Done (v0.10.138) · **Depends on:** I-42

**Fixed.** Follow-up from I-42: shared `ENTFLDATR` editor (`entFldAtrHtml`/`getChoiceColorState`) couldn't represent a bare `ENTFLDATR` (renders unchecked; Apply dropped it) and discarded the `*CURSOR`/`*NOCURSOR` parameter on Apply. Pre-existing at file/record level, newly reachable at field level.

Fix, on the shared `getChoiceColorState`/`setChoiceColorState` primitive (also used by `CHCAVAIL`/`CHCUNAVAIL`/`CHCSLT` - both new params are harmless no-ops for those three, never passed): `getChoiceColorState` gained `present` (true whenever the keyword exists at all, independent of color/attrs) and `cursorVisible` ('' / `CURSOR` / `NOCURSOR`, read via a `*NOCURSOR`-checked-before-`*CURSOR` regex pair so the two token forms can't be confused); `setChoiceColorState` gained matching trailing `cursorVisible`/`forcePresent` params - `forcePresent` writes a bare keyword when nothing else is set, `cursorVisible === 'NOCURSOR'` appends the bare `*NOCURSOR` literal. `*CURSOR`, the documented default, is deliberately never re-serialized, matching this codebase's own "never write the default back out" convention elsewhere.

`entFldAtrHtml`'s own `enabled` flag now reads `current.present` instead of inferring from color/attrs; a new "Hide the cursor while in this field (*NOCURSOR)" checkbox was added. `wireEntFldAtrEditor`'s Apply handler now passes `on` as `forcePresent` and the checkbox's own state as `cursorVisible`; its conditioning-only commit path (`wireFlagRowConditioning`'s own callback) was also updated to carry `current.cursorVisible`/`current.present` forward - otherwise editing conditioning alone would have silently dropped both all over again, the same class of bug one level down.

New optional trailing `dataType` param on `entFldAtrHtml` (field-level call site only, `buildWebviewTemplate.js`'s own field-properties render - file/record-level call sites correctly omit it, since there's no single field to check) drives a non-blocking advisory hint when `*NOCURSOR` is checked on anything other than data type `I`, per IBM's own "the default is used" (not rejected, not an error) wording - same "ignored, not blocked" precedent as `loginpLogoutSflMsgRcdIgnoredNote` elsewhere in this file.

Landed after I-60's own record-level `wireEntFldAtrEditor` guard fix (v0.10.136) and I-58 (v0.10.137) - both merged cleanly, since I-60 only touches the record-level call site's `addGuardFn` argument and I-58 doesn't touch this editor at all.

New `src/test/i59EntfldatrBareAndCursorVisible.test.js` (26 checks): bare-`ENTFLDATR` round-trip in both directions (write, and re-Apply without touching anything); the pre-existing color/attrs path unaffected; `*NOCURSOR` write and read-back, including IBM's own `F3` example's token order (cursor token BEFORE the `*DSPATR` group - confirmed order-independent); `*CURSOR` never re-serialized; the field-level-only advisory hint (data type `I` vs. not, and correctly absent when `dataType` is omitted at file/record level); a conditioning-only edit preserving the bare/`*NOCURSOR` state; and direct unit coverage confirming all three `CHCAVAIL`/`CHCUNAVAIL`/`CHCSLT` call sites are completely unaffected.

Full suite: zero failures.

---

<a id="i-60"></a>

### I-60 — Record-level `ENTFLDATR` guard vs `USRDFN` whitelist

> **Area:** Record · **Status:** Done (v0.10.136) · **Depends on:** I-42, I-44

Follow-up from I-42: record-level `ENTFLDATR` Apply guard checked SFL's and MNUBAR's whitelists (I-53/I-54) but not USRDFN's, so `ENTFLDATR` could still be applied to a `USRDFN` record via the General tab (confirmed - Task R2's USRDFN tab-narrowing only hides the Indicator/Output/Input/Overlay categories, not General). Re-read against the DDS Reference first: USRDFN's own text is a strict whitelist - "No file- or record-level keywords apply to this record except INVITE, KEEP, PASSRCD, HLPRTN, HELP, HLPCLR, PRINT, OPENPRT, and TEXT" - and `ENTFLDATR` is not on it.

Fixed by ORing `DspfWriter.usrdfnWhitelistConflictReason` (I-49) into `wireEntFldAtrEditor`'s record-level `addGuardFn` in `wireRecordKeywordsPanels` - the same three-way USRDFN/SFL/MNUBAR OR I-42 already uses for `MOUBTN`'s record-level Add button; each check is a no-op unless the record is that type, and the file-level call site (which passes no guard) is untouched. The guard only fires on the on-transition (Apply with the checkbox checked), so a hand-edited USRDFN record that already carries `ENTFLDATR` can still have it removed.

New `i60EntfldatrUsrdfnGuard.test.js` (15 checks: blocked on USRDFN with no `applyEdit` posted, removal still allowed on a hand-edited USRDFN record, whitelisted `PRINT` still commits, plain-record `ENTFLDATR` unaffected), confirmed via pre-fix run to genuinely fail (3 checks) against unfixed code.

Not addressed here: `RTNCSRLOC`'s own record-level guard (I-56) deliberately omits USRDFN, citing I-8's audit finding no incompatibility statement - but `RTNCSRLOC` is also absent from USRDFN's whitelist, so that reasoning is worth re-checking as its own task.

---

<a id="i-61"></a>

### I-61 — `WRDWRAP`: guard a data type / usage change on a field that already carries it

> **Area:** Field · **Status:** Done (v0.10.140) · **Depends on:** I-58

**Fixed.** Follow-up from I-58: I-58 blocked adding `WRDWRAP`'s conflicting *keywords* to a `WRDWRAP` field, but not a **data type or usage change** on one. Applying data type `S`/`Y`/`D`/`M`/`F` (the Data type select offers no `J`/`O`/`E`/`G`), or usage `O`/`H`/`M`/`P`, through the Basic tab's Apply on a field that already carried `WRDWRAP` was not blocked, although `DspfWriter.wrdwrapFieldConflictReason`'s own forward check (turning `WRDWRAP` on) already treats both as invalid.

Re-read `WRDWRAP`'s own section in `DDS_Keyword_V7r6.txt` first: "This keyword can only be specified on fields that have a usage of input-only (I) or input/output (B)", and it cannot be specified on the keyboard shifts Signed Numeric (`S`), Numeric Only (`Y`), Digits Only (`D`), Numeric Only Character (`M`), Floating Point (`F`), DBCS Only (`J`), DBCS Open (`O`), DBCS Either (`E`) or Graphic (`G`). That matches the two branches `wrdwrapFieldConflictReason` already had; nothing to add or remove.

Reachability sweep: the Basic tab's Apply (`p-apply`, named-field branch) is the only place in the webview that commits a data type or usage change to an *existing* field through `commitEdit`; the other `usage:` sites create new fields.

Fix: the usage and data-type branches of `wrdwrapFieldConflictReason` were pulled out unchanged into `wrdwrapUsageReason`/`wrdwrapDataTypeReason` (the forward check now calls them, behaviour identical), and new `DspfWriter.wrdwrapBasicEditConflictReason(fieldKeywords, oldDataType, oldUsage, newDataType, newUsage)` uses the same two helpers, so both directions share one wording. It is called from the Basic tab's Apply handler right after I-31's `dateTimeUsageConflictReason`, as an early return before `commitEdit` (alert, no edit) - not from `commitEdit` itself - so the panel keeps the user's other pending edits and they can fix the select and click Apply again.

The check is **diff-based**, like I-58's `wrdwrapNewConflictReason`: only a change *to* an invalid value is blocked, so an unrelated Apply (rename, length) on a hand-written field that is already invalid is never blocked. One subtlety: the Usage select has no blank option and shows `O` for a blank stored usage (the DDS default is output), so a blank usage counts as `O` on both sides of the comparison; otherwise every Apply on a blank-usage `WRDWRAP` field would have been read as a change to `O` and blocked. Changing between two different invalid values (`S` to `Y`) is still blocked; changing to a valid value, or leaving a value alone, never is.

New `i61WrdwrapBasicTabTypeUsageGuard.test.js` (81 checks): pure unit checks of the new function and of the unchanged forward check, then the real generated webview in jsdom - every reachable bad data type and usage blocked with an alert and no `applyEdit`, a blocked Apply leaving the typed length in the form, allowed edits committing with `WRDWRAP` kept, a non-`WRDWRAP` field unaffected, and two hand-written already-invalid fields (blank usage; data type `S`) where unrelated edits go through, an explicit bad choice is blocked, and the fix is accepted. Confirmed via `git stash` to fail (44 checks) against pre-fix code. Full suite: 5532/5532 assertions, zero failures.

Not addressed here: Resolve Referenced Field (extension host) also rewrites a field's data type, from the database file's definition, with no `WRDWRAP` check - see Deferred findings. I-62 (`PSHBTNFLD`) needs the same Apply handler and can now add its own check next to this one.

---

<a id="i-62"></a>

### I-62 — `PSHBTNFLD`: guard the Basic tab against breaking its required definition

> **Area:** Field · **Status:** Done (v0.10.146) · **Depends on:** I-57

**Fixed.** Follow-up from I-57: I-57 enforces `PSHBTNFLD`'s definition rule when the toggle is turned *on* (it rewrites the field via `pshbtnfldDefinitionUpdates`), but the Basic tab's Apply on a field that already carried `PSHBTNFLD` was unguarded. Confirmed by probe (jsdom) on a `2Y 0B` push-button field: changing data type to `A`, length to `10`, or usage to `O` each applied with no alert, leaving a field that still carried `PSHBTNFLD` but was invalid DDS. Decimals, not probed at filing, behave the same and are now covered.

Re-read `PSHBTNFLD`'s own section in `DDS_Keyword_V7r6.txt` first: "The field containing the PSHBTNFLD keyword must be defined as an input-capable field with data type Y, length equal to 2, and decimal positions of 0." That is the whole rule. "Input-capable" is read as usage `I` or `B`, the same reading I-57's `pshbtnfldDefinitionUpdates` uses (`H`, `O`, `M` and `P` are not input-capable).

Reachability sweep: the Basic tab's Apply (`p-apply`, named-field branch) is the only place in the webview that commits a data type, length, decimals or usage change to an *existing* field through `commitEdit` (the same sweep I-61 did). Resolve Referenced Field, handled in the extension host, is a second route - see Deferred findings.

Fix: new `DspfWriter.pshbtnfldBasicEditConflictReason(fieldKeywords, oldField, updates)`, **driven by `pshbtnfldDefinitionUpdates`**: the field as it *would* be after the edit is handed to that function, and whatever it says still needs correcting is a violation. It is called from the Basic tab's Apply handler right after I-61's `WRDWRAP` check, as an early return before `commitEdit` (alert, no edit), so the panel keeps the user's other pending edits and they can fix the field and click Apply again. The message names every offending property with the value it needs (data type `Y`, length 2, decimal positions 0, usage `I` or `B`).

The check is **diff-based**, like I-61's and I-58's: only a change *to* a non-conforming value is blocked, so an unrelated Apply (rename, position) on a hand-written `PSHBTNFLD` field that is already invalid is never blocked. Changing between two different invalid values (length 5 to 8) is still blocked, since the edit fixes nothing; fixing one property at a time is allowed. A blank usage is the DDS default (output), the Usage select has no blank option and shows `O` for it, so a blank usage counts as `O` on both sides of the comparison, exactly as in I-61. Clearing decimals to blank is treated as a change away from `0`, consistent with `pshbtnfldDefinitionUpdates` requiring an explicit `0`.

New `i62PshbtnfldBasicTabDefinitionGuard.test.js` (92 checks): pure unit checks of the new function, including a grid cross-check that it agrees with `pshbtnfldDefinitionUpdates` on all 144 type/length/decimals/usage combinations from a valid field and that I-57's own function is unchanged; then the real generated webview in jsdom - every reachable bad data type, length, decimals value and usage blocked with an alert and no `applyEdit`, a blocked Apply leaving the typed name in the form, allowed edits committing with `PSHBTNFLD` and its `PSHBTNCHC` choices kept, an ordinary field unaffected, and two hand-written already-invalid fields (`5A` with blank decimals; blank usage) where unrelated edits go through, another bad value is blocked, and the fix is accepted. Confirmed via `git stash` to fail (59 checks) against pre-fix code. Full suite: 5847/5847 assertions, zero failures (on top of I-63 through I-68, which landed while this task was in progress).

Not addressed here: Resolve Referenced Field (extension host) also rewrites a field's length, data type and decimals from the database file with no `PSHBTNFLD` definition check - added to the existing Deferred findings row for I-61.

---

<a id="i-63"></a>

### I-63 — `SNGCHCFLD`/`MLTCHCFLD`: `*NUMCOL`/`*NUMROW`/`*GUTTER` written and read in the wrong shape

> **Area:** Field · **Status:** Done (v0.10.141) · **Depends on:** I-34, I-57

**Fixed.** Raised by I-57. IBM's format string is `[(*NUMCOL nbr-of-cols) | (*NUMROW nbr-of-rows)] [(*GUTTER gutter-width)]` — parenthesized groups with a space (checked again in `DDS_Keyword_V7r6.txt` for both `SNGCHCFLD` and `MLTCHCFLD`; the two format strings are identical for these three parameters). `DspfWriter.setChoiceSelectionType` wrote `*NUMCOL(3) *GUTTER(2)` (invalid DDS) and `getChoiceSelectionType` tokenized on whitespace, which split IBM's own `(*NUMCOL 3)` into `(*NUMCOL` / `3)` and read blanks — so the Columns/Rows/Gutter boxes showed empty for a hand-written field and Apply silently dropped the parameters.

Fix: two small shared helpers, `readChoiceLayoutNumber` (reads either shape, case-insensitive, whitespace-tolerant) and `stripChoiceLayoutParams`, now used by `getChoiceSelectionType` and by `getPshbtnfld` (I-57's own reader, refactored onto the shared helper with identical behaviour). `setChoiceSelectionType` writes IBM's shape, takes `*NUMCOL` **or** `*NUMROW` (never both — `*NUMCOL` wins as a backstop, the same semantics as `setPshbtnfld`), and writes `*GUTTER` only alongside one of them (IBM: it "can only be specified if either `*NUMCOL` or `*NUMROW` has been specified"). The old `*NUMCOL(3)` shape is still **read**, so sources written by earlier iSDA versions load with their values and are corrected to IBM's shape on the next Apply. I-34's behaviour (an `MLTCHCFLD` never gets the `SNGCHCFLD`-only `*AUTOSLT`/`*AUTOENT` family) is untouched.

The Choice selection type editor's Apply (`wireChoiceSelectionTypeEditor`) now also blocks the three invalid layout combinations before writing anything, with the same wording as the `PSHBTNFLD` editor: both Columns and Rows set; a gutter below 2; a gutter with neither Columns nor Rows. They are skipped when the type is being switched to "(not a choice field)". The engine's radio/checkbox preview still reads no layout parameters (only `PSHBTNFLD`'s does) — previewing the columns remains a separate, optional step.

New `i63ChoiceLayoutParamsShape.test.js` (42 checks): reader (IBM shape, legacy shape, case, whitespace, blanks), writer (shape, NUMCOL-or-NUMROW, gutter rule, `MLTCHCFLD` flag stripping), `getPshbtnfld` unchanged, a parse → get → set → `applyFieldUpdate` → reparse round trip, and the editor driven through the real webview script in jsdom (pre-fill of a hand-written IBM-shaped field, a legacy-shaped field rewritten on Apply, a new layout, and the three blocked combinations). Confirmed via a stash run to fail (25 checks) against the unfixed code. The assertions read the *reparsed* parameters rather than raw text, because the writer wraps a long keyword across lines with a `-` continuation (valid DDS, even mid-token).

Full suite: zero failures.

---

<a id="i-64"></a>

### I-64 — `PSHBTNFLD` whitelist: structured field panels

> **Area:** Field · **Status:** Done (v0.10.143) · **Depends on:** I-57

**Fixed.** `PSHBTNFLD`'s ten-keyword whitelist (`ALIAS`/`CHANGE`/`CHCAVAIL`/`CHCUNAVAIL`/`CHCCTL`/`INDTXT`/`NOCCSID`/`PSHBTNCHC`/`DSPATR(PC)`/`TEXT`) was only enforced on the raw keyword editor, on turning `PSHBTNFLD` on, and on Choice selection type (via `DspfWriter.pshbtnfldConflictReason`). Every other structured field panel - Color & attributes, Keying options, Edit code/word, validity checks, Reference, the General keyword rows, etc. - could still add a non-whitelisted keyword to a push-button field.

Took the "alternatively" approach this task's own note suggested, rather than a per-panel reachability sweep: new `DspfWriter.pshbtnfldNewConflictReason`, a diff-based backstop with the exact same shape as I-58's own `wrdwrapNewConflictReason` (given `oldKeywords`/`newKeywords`, returns a reason only when the edit introduces a newly-disallowed keyword onto a field that carries `PSHBTNFLD` both before and after), wired into `commitEdit` right alongside `wrdwrapNewConflictReason` - the single choke point every field-level panel already commits keyword changes through (I-58 already established this same choke point covers CHECK Keying/Validity codes, CHGINPDFT, DUP, DSPATR, FLTFIXDEC, IGCALTTYP; this reuses it rather than re-deriving it). One diff function at one call site closes the gap for every panel at once, rather than one hand-wired `addGuardFn` per panel. Conflicts already present before the edit (a hand-written field that was already invalid) are not re-reported, so unrelated edits to such a field are never blocked; turning `PSHBTNFLD` itself on is left entirely to the pre-existing forward-direction `pshbtnfldConflictReason`.

New `src/test/i64PshbtnfldPanelWhitelist.test.js`: 17 direct unit checks on `pshbtnfldNewConflictReason` (additions blocked/allowed per the whitelist, `DSPATR(PC)` allowed vs. any other `DSPATR` attribute blocked, pre-existing conflicts not re-reported, removal always fine, `PSHBTNFLD` itself being turned on left to the forward guard, null-safety), plus real end-to-end DOM scenarios against a genuine push-button field (usage `B`, data type `Y`, length 2, decimal positions 0): the Editing keywords panel (`EDTCDE`) blocked, the Color & attributes panel blocked for `DSPATR(HI)` but still allows `DSPATR(PC)` (round-tripping correctly with `PSHBTNFLD` intact), the Keying options panel (`CHECK`) blocked, the General keywords panel (`ALIAS`) unaffected, the same panels working normally on a non-`PSHBTNFLD` field, and a hand-written already-invalid field (`PSHBTNFLD` + `COLOR`) where an unrelated edit is not blocked by the pre-existing conflict. Full suite: zero failures.

Landed after I-65's own new CHCCTL/CHCAVAIL/CHCUNAVAIL editors (v0.10.142); no interaction between the two - I-65's editors only ever write keywords already on PSHBTNFLD's own whitelist, so `pshbtnfldNewConflictReason` is a correct no-op against them.

---

<a id="i-65"></a>

### I-65 — `CHCAVAIL`/`CHCUNAVAIL`/`CHCCTL` editors for push-button fields

> **Area:** Field · **Status:** Done (v0.10.142) · **Depends on:** I-57

**Fixed.** Raised by I-57. All three keywords are on `PSHBTNFLD`'s own list of allowed keywords (`DDS_Keyword_V7r6.txt`), but the editors that write them (Choice keywords, Choice colors & attributes) only rendered for `SNGCHCFLD`/`MLTCHCFLD` fields, so on a push-button field they were reachable only through the raw keyword editor.

The suggested "just show the existing editors" needed two adjustments, both taken from the reference rather than guessed: the choice-keywords editor also edits `CHOICE` and `CHCACCEL`, which the `PSHBTNFLD` whitelist forbids, and the colours editor also offers `CHCSLT` (selected), which is not on `PSHBTNFLD`'s list either. So a push-button field now gets (Attributes tab, right after the "Push button field" accordion, only once the field IS a `PSHBTNFLD`):

- **Push-button choice control (CHCCTL)** — a new CHCCTL-only editor, one row per `PSHBTNCHC` choice number (control field, message ID, message file, library). It reuses `getChoiceControls`/`setChoiceControls` (so `CHCCTL`'s message-library handling is identical to the choice-field editor's). A blank row means no `CHCCTL` for that button. A `CHCCTL` whose number matches no `PSHBTNCHC` (hand-written) still gets a row, flagged with IBM's own rule — "a `CHOICE` or `PSHBTNCHC` keyword with the same choice number must also be specified" — so it can be fixed or cleared rather than silently kept or dropped; duplicates stay separate rows. Apply validates per the reference (control field required; message file required with a message ID; message ID required with a file/library), and prefixes `&` on the control field when it is omitted, since the control field is always a field reference. Options indicators are not offered: IBM says they are not valid for `CHCCTL`.
- **Push-button colors & attributes (CHCAVAIL/CHCUNAVAIL)** — the existing colours editor, restricted to its Available/Unavailable states through a new optional `stateKeys` argument on `choiceColorStatesHtml`/`wireChoiceColorStatesEditor` (default unchanged: all three). Its shared Apply never touches `CHCSLT`, so a hand-written `CHCSLT` on a push-button field is left exactly as it was (flagging it is the whitelist guard's job, not this editor's).

Both use a distinct `-pbx` owner key so element ids can never collide with the choice-field editors'. Choice fields and plain fields are unchanged (regression-checked). Not done: checking that the named control field exists in the record as type `Y`/length 1/decimals 0/usage `H` (the reference says it must) — the same is true of the choice-field editor and would be a separate cross-field check.

New `i65PshbtnChoiceControlColors.test.js` (41 checks) drives the real webview script in jsdom: which editors appear (and that the choice-field ones do not), the CHCCTL rows, adding/clearing/validating, the colour states, an orphan `CHCCTL`, a hand-written `CHCSLT`, a push-button field with no choices, and the choice-field / plain-field regressions. Confirmed via stash to fail against the unfixed code.

Full suite: zero failures.

---

<a id="i-66"></a>

### I-66 — `PSHBTNCHC` choice-text validation (mnemonics, fit)

> **Area:** Field · **Status:** Done (v0.10.144) · **Depends on:** I-57

**Fixed.** Raised by I-57. The row editor only checked the choice number and that the text was non-blank. Every rule below is from the `PSHBTNCHC` section of `DDS_Keyword_V7r6.txt`.

**Hard errors** (block the edit, alert with the rule): within a literal choice text a `>` marks the mnemonic and `>>` is a literal `>` (scanned left to right, the same pairing the designer's preview already uses, so IBM's own examples `'F2=>File'`, `'X >>= 1'`, `'X >>>= 1'` all come out as documented). Only **one** mnemonic is allowed; the mnemonic character must exist (a trailing `>` has none), must not be a blank, and must be a single-byte character. "You cannot specify the `>` as the mnemonic" holds by construction — `>>` is always the literal — so it needs no separate check. A `&FIELD` text is resolved at run time and is never checked. Enforced in both places a choice can be written: the PSHBTNCHC row editor and the raw keyword editor's `addGuardFn` (`DspfWriter.pshbtnchcParamsProblem`). Only *new* text is checked in the row editor, so an unrelated edit (say, the command key) to a hand-written row that already breaks a rule is not blocked.

**Warnings** (shown in the Push button field panel, never blocking):
- *Duplicate mnemonic.* IBM says the same mnemonic "should not" be used by more than one choice and defines the fallback (the first wins), so it is a warning listing the choice numbers. Compared as the exact character — the reference does not say the match is case-blind.
- *Fit.* IBM says the text "must fit on one line of the display for the smallest display size" but gives no formula (it lists field position, text length, gutter, number of columns, smallest display size and window width as the inputs). `DspfWriter.pshbtnchcFitProblem` therefore reports an **estimate** using the designer's own push-button layout: each button is the widest visible text + 2 for its `< >`, `*NUMCOL n` puts n buttons across, `*NUMROW n` gives ceil(slots / n) columns, `*GUTTER` (default 3) separates them, `*SPACEB` adds a blank slot, and with neither parameter the buttons wrap so only one has to fit. The limit is the smallest declared `DSPSIZ` width (80 when none is declared) or, for a sized/positioned `WINDOW` record, the window width. It stays silent when it cannot tell (relative column, `&FIELD`-only choices, a window that references another record). Because it is an estimate it is only ever a warning.

New `i66PshbtnchcTextValidation.test.js` (74 checks): IBM's own examples and each rule, both guards, the panel-level review, every fit case above, and the row and raw editors through the real webview script in jsdom (including that a hand-written invalid row can still have its command key changed). Confirmed via stash to fail against the unfixed code.

Full suite: zero failures.

---

<a id="i-67"></a>

### I-67 — `HLPDOC`: help-specification-level form

> **Area:** File · **Status:** Done (v0.10.178) · **Depends on:** I-38

I-38 added `HLPDOC` at **file level** only. IBM also allows it at help-specification level (inside an H specification, alongside `HLPARA`) — the same "file-level only, H-spec level deferred" precedent I-5's `HLPRCD` set. Not modelled.

**Note from I-90 (research):** add no `HLPRTN` check at the help-specification level - the DDS Reference does not establish that `HLPDOC` conflicts with `HLPRTN` across levels, and an optioned record-level `HLPRTN` alongside H-spec help is the documented usage. Only the exclusions that exist at this level apply: `HLPBDY` (same H spec) and `HLPPNLGRP` (whose own statement is file-wide - decide whether an H-spec `HLPDOC` also conflicts with a file-level `HLPPNLGRP` and with an H-spec `HLPPNLGRP` elsewhere in the file). See I-90.

**Note for I-40:** this adds a level for an existing index entry, so the keyword-index regeneration (I-40) should run after this task.

**Done.** Added `HLPDOC` to the existing per-help-specification "Application Help" panel (`applicationHelpFieldsHtml`/`wireApplicationHelpFields`, alongside `HLPPNLGRP`/`HLPEXCLD`/`HLPBDY`/`HLPARA`) — same checkbox-plus-3-required-parts shape, same all-parts-required validation, as the file-level `HLPDOC` row I-38 added.

- **I-90's deferred decision, made:** re-read `HLPPNLGRP`'s own DDS Reference section rather than assuming `HLPDOC`'s "cannot specify HLPDOC with HLPBDY, HLPPNLGRP, or HLPRTN" sentence scopes the same way for each of the three. `HLPBDY` only exists at H-spec level in this codebase, so that half is necessarily a same-specification check. `HLPPNLGRP`'s own section instead states its half explicitly as file-wide: "a display file **cannot contain both** HLPPNLGRP and HLPDOC keywords" — not "the same specification." So an H-spec's `HLPDOC` now conflicts with `HLPPNLGRP` **anywhere** in the file (another H-spec, or file level), and vice versa — not just within the same specification. New `DspfWriter.anyHelpKeywordPresentInFile(model, keywordName, ownSourceLine)` (searches file-level keywords plus every record's every help entry, excluding the instance being edited) backs this; new `DspfWriter.hlpdocHspecConflictReason(keywordName, ownKeywords, model, ownSourceLine)` wraps it with the `HLPBDY` same-spec half. `HLPRTN` is deliberately NOT checked at this level, per I-90's own recommendation above.
- **The file-level side had the same gap, now closed too:** I-38's `hlpdocConflictReason` only ever checked the file's OWN keywords, so a file-level `HLPDOC`/`HLPPNLGRP` checkbox couldn't see an H-spec-level instance of the other — genuinely incorrect per `HLPPNLGRP`'s own file-wide wording, not a new rule invented for this task. `fileKeywordsPanelsHtml`'s `commitHlppnlgrp`/`commitHlpdoc` now also call `anyHelpKeywordPresentInFile` (via the `getModel` already threaded through `wireFileKeywordsPanels` for I-18's own MNUBARSW/MNUCNL cross-record check) alongside the existing same-array check.
- **Threading `model` to the H-spec panel:** `wireApplicationHelpFields` gained two new optional trailing parameters, `getModel` and `ownSourceLine`, wired from `buildWebviewTemplate.js`'s `renderHelpProps` (`() => model`, `help.sourceLine`) - optional so it degrades gracefully (same-spec `HLPBDY` check only) if a future caller can't supply a model.
- **Hand-rolled, not `wireFlagRow`:** `HLPBDY` and `HLPPNLGRP`'s checkboxes in the H-spec panel needed a conflict-check hook `wireFlagRow` doesn't have (the established "hard-block paths must be hand-rolled outside `wireFlagRow`" principle), same `alertAndRevert` idiom as every other conflict guard in this codebase; `HLPPNLGRP`'s hand-rolled version also has to read its own parameter box, since it (unlike `HLPBDY`) carries `module library/panel-group-name`.
- **Turning a keyword OFF is never blocked** in either direction, at either level - same "only the on-transition is guarded" contract every other mutual-exclusion checker in this codebase uses.

New `src/test/i67HlpdocHspecLevel.test.js` (34 checks): dspfWriter-level unit coverage for `anyHelpKeywordPresentInFile` and `hlpdocHspecConflictReason` (file-wide search across records, `ownSourceLine` exclusion, same-spec `HLPBDY`, file-wide `HLPPNLGRP`, no `HLPRTN` check), plus a real-generated-webview scenario: the row exists pre-filled from an H-spec's own already-present `HLPDOC`, edits commit to the help entry's own keywords (not the record's or file's), all three parts are required, turning `HLPDOC` off is never blocked, and both conflict directions are exercised file-wide across two separate records (SCREEN1's `HLPDOC` blocks SCREEN2's `HLPPNLGRP`; SCREEN2's own `HLPBDY` blocks its own `HLPDOC`).

*Raised by I-38. Size (estimate): Medium.*

---

<a id="i-68"></a>

### I-68 — `HLPRTN`: reverse conflict guard

> **Area:** File · **Status:** Done (v0.10.145) · **Depends on:** I-38

I-38 wired the reverse direction of the `HLPPNLGRP`/`HLPRCD`/`HLPDOC` conflict (blocking `HLPPNLGRP` while the other is present) but not for `HLPRTN`'s own checkbox: its file-level row goes through the shared `commitIndicatorTextRow` helper (also used for `CLEAR`/`HOME`/`PAGEDOWN`/`PAGEUP`/`VLDCMDKEY`), which has no per-keyword conflict hook.

**Caution:** IBM says `HLPRTN` "takes priority over" `HLPRCD`/`HLPPNLGRP`/`HLPDOC` when more than one is present — a precedence rule, not a prohibition — so re-read the `HLPRTN` section first and only guard what is genuinely prohibited. The likely shape is an optional per-keyword guard argument on `commitIndicatorTextRow`.

**Implemented.** Re-read `HLPRTN`'s and `HLPDOC`'s own DDS Reference sections first, as the caution above asked. The prohibition is one sentence, in `HLPDOC`'s section only: "You cannot specify HLPDOC with HLPBDY, HLPPNLGRP, or HLPRTN." `HLPRTN`'s own section says instead that it "at either the file or record level takes priority over any HLPRCD, HLPPNLGRP, or HLPDOC keywords" — a precedence rule, and its own Example 1 shows a file-level `HLPRCD` coexisting with a record-level `HLPRTN`. So the guard covers exactly the one pair IBM prohibits and nothing else.

`DspfWriter.hlpdocConflictReason('HLPRTN', keywords)` already returned the right answer for this direction (I-38 wrote it bidirectionally); the only missing piece was wiring. `commitIndicatorTextRow` gained an optional trailing `conflictFn`, checked only on the **off → on transition** of the keyword (alert, revert the checkbox, no edit) — deliberately not on every commit, so a hand-edited file that already carries both keywords can still have `HLPRTN`'s response indicator or text edited, and turning `HLPRTN` off is never blocked. Only `HLPRTN`'s row passes one; `CLEAR`/`HOME`/`PAGEDOWN`/`PAGEUP`/`VLDCMDKEY` and the S36E-guarded `HELP` are unchanged. The stale comment at `HLPDOC`'s wiring that described this direction as "left as-is" is updated.

New `src/test/i68HlprtnReverseGuard.test.js` (29 checks, real generated webview): blocked with an alert naming both keywords, checkbox reverted and nothing posted; the five neighbouring rows unaffected with `HLPDOC` present; an already-present pair stays editable and can be turned off; no-`HLPDOC` behaviour unchanged; `HLPRCD` and `HLPPNLGRP` coexisting with `HLPRTN` still allowed; I-38's forward direction still works. Confirmed to fail against pre-fix code (5 checks).

Not addressed here: this covers the **file-level** `HLPRTN` row only. `HLPRTN` is also a record-level keyword (the repeatable indicator instances), and IBM's "cannot specify HLPDOC with HLPRTN" doesn't say which levels it means — see the Deferred findings row.

*Raised by I-38. Size (estimate): Small.*

---

<a id="i-69"></a>

### I-69 — `CHKMSGID`: validity-check dependency guard

> **Area:** Field · **Status:** Done (v0.10.148) · **Depends on:** I-30

IBM: "CHKMSGID is allowed only on fields which also contain a CHECK(M10), CHECK(M11), CHECK(VN), CHECK(VNE), CMP, COMP, RANGE, or VALUES keyword." iSDA has no guard ensuring that. Same shape as I-8's `USRDFN` guard. Consider both directions: adding `CHKMSGID` without one of those, and removing the last of those while `CHKMSGID` is present. Re-verify the exact wording against `DDS_Keyword_V7r6.txt` first.

**Implemented.** Re-read `CHKMSGID`'s own section first, as asked. It states two rules in one place, not one: the dependency ("allowed only on fields which also contain a `CHECK(M10)`, `CHECK(M11)`, `CHECK(VN)`, `CHECK(VNE)`, `CMP`, `COMP`, `RANGE`, or `VALUES` keyword") **and** "the field must be input-capable (usage `B` or `I`)". Both are enforced; the wording of the note above was accurate.

- **Dependency, both directions, at the existing `commitEdit` choke point** (the one I-58 and I-64 already use for every field-level panel that writes keywords): new diff-based `DspfWriter.chkmsgidNewConflictReason(oldKeywords, newKeywords)`. *Forward:* an edit that introduces `CHKMSGID` while no qualifier is present. *Reverse:* an edit that removes the **last** qualifier while `CHKMSGID` stays — blocked with "Remove CHKMSGID first" rather than silently cascading, so the user's message id/file are never deleted behind their back (the opposite choice to I-57's turn-off cascade, because there the orphaned choices were meaningless and here they are user-entered data). Because it sits at the choke point it covers the `CHKMSGID` Apply, Keying options' `CHECK` codes, the `RANGE`/`COMP`/`VALUES` editors and the raw editor's remove button with no per-panel wiring.
- **What qualifies:** `CMP`/`COMP`/`RANGE`/`VALUES`, and `CHECK` only when one of `M10`/`M11`/`VN`/`VNE` is among its codes (matched by token, so `CHECK(ME VN)` qualifies but `CHECK(ME)`, `CHECK(AB)` etc. do not — those aren't message-producing checks).
- **Never blocks what it shouldn't:** diff-based, so a hand-written field that is *already* invalid (`CHKMSGID` with no qualifier) can still have its message id edited or unrelated keywords changed; removing `CHKMSGID` itself, removing one of several qualifiers, and swapping one qualifier for another in a single edit are all allowed.
- **The `CHKMSGID` Apply also pre-checks locally** so a refusal keeps what the user typed instead of re-rendering the panel blank.
- **Usage rule:** the raw editor's add guard (`chkmsgidFieldAddReason`, chained after the existing three) refuses `CHKMSGID` on a field whose usage is explicitly `O`/`H`/`M`/`P` (blank usage — still being drafted — is never blocked), and the Basic tab's Apply (I-61's idiom, `chkmsgidBasicEditConflictReason`) refuses changing a `CHKMSGID` field's usage to one of those.

New `src/test/i69ChkmsgidDependencyGuard.test.js` (83 checks): the qualifier matrix, both directions of the diff check, the raw-editor and Basic-tab guards, and the real generated webview (Apply blocked/allowed, input kept on refusal, removal via the validity editor and the raw editor, an already-invalid field left editable, output-only field refused, Basic-tab `B`→`O` refused / `B`→`I` and an unrelated edit allowed). Confirmed to fail against pre-fix code: 10 webview-level checks fail with the wiring removed.

Not addressed here: `CHKMSGID`'s third rule — the optional `&message-data-field` must name a field that exists in the record and is character (`A`) with usage `P` — see the Deferred findings row.

*Raised by I-30. Size (estimate): Small.*

---

<a id="i-70"></a>

### I-70 — `CHRID`: mutual-exclusion and eligibility rules

> **Area:** Field · **Status:** Done (v0.10.155) · **Depends on:** I-30

Per I-30's finding, `CHRID` is mutually exclusive with `DUP` and invalid on constant, numeric, and `M`/`H`/`P`-usage fields — unenforced. Re-verify against `DDS_Keyword_V7r6.txt` before implementing.

**Implemented.** Re-verified against `CHRID`'s own section: "not valid on constant fields, numeric fields (fields with decimal positions specified in positions 36 through 37), message fields (M …), hidden fields (H …), or program-to-system fields (P …)" and "cannot be specified with the DUP keyword". I-30's note was accurate. (`DUP`'s own section does not restate the exclusion; it lives in `CHRID`'s section only.) Before this task only constants and `M`/`P` were handled, and only by hiding the General keywords row; `H`, numeric fields and `DUP` were not covered, and nothing blocked the raw editor.

- **"Numeric" is taken literally** as decimal positions specified (0 counts), not inferred from the data type - a `Y`/`S` field with positions 36-37 blank is not numeric for `CHRID` by IBM's own definition. `DspfWriter.chridEligibilityReason(usage, decimalPositions, isConstant)` returns the reason (constant, `H`, `M`, `P`, numeric) or null; blank usage is the DDS default (output) and never blocked.
- **Forward, both entry points:** `chridFieldAddReason` is chained onto the raw keyword editor's add guard and is also the General keywords row's on-transition (alert + revert, WRDWRAP's idiom). It blocks `CHRID` on an ineligible field or one already carrying `DUP`, and - the reverse direction - `DUP` on a field already carrying `CHRID`.
- **Every other panel, at the `commitEdit` choke point:** diff-based `chridNewConflictReason(oldKeywords, newKeywords, ctx)` blocks an edit that introduces `CHRID` on an ineligible field or with `DUP`, or adds `DUP` to a `CHRID` field. This is what covers the Input keywords panel's `DUP` checkbox, which has no guard of its own. The field's kind is taken as it will be after the edit.
- **Basic tab Apply:** `chridBasicEditConflictReason` blocks a usage change to `H`/`M`/`P`, or decimal positions going from blank to specified, on a field that already carries `CHRID` (message says "Remove CHRID first").
- **General keywords row visibility:** the `CHRID` row is now also hidden for usage `H` and for numeric fields (`generalFieldKeywordsHtml`/`wireGeneralFieldKeywordsEditor` take an optional trailing `decimalPositions`; omitted = fail-open). Unlike the other scoped rows it is hidden only while `CHRID` is not already on the field, so a hand-written invalid field keeps a ticked checkbox the user can untick.
- **Never blocks what it shouldn't:** all checks are diff-based, so a hand-written field that already has `CHRID` on an `H` field, or `CHRID` plus `DUP`, stays editable; removing `CHRID`/`DUP`, unrelated Basic-tab edits and unrelated keyword edits are all allowed.

New `src/test/i70ChridEligibilityGuard.test.js` (118 checks): the eligibility matrix, both directions of the add guard and the diff check, the Basic-tab guard, the row visibility rules, and the real generated webview (General checkbox, `DUP` checkbox, raw editor, Basic tab, hidden fields reached through the Hidden tab). Confirmed to fail against pre-fix wiring: with the choke-point and Basic-tab checks removed, 5 webview-level checks fail.

Not addressed here: Resolve Referenced Field can still give a `CHRID` field decimal positions - see the Deferred findings row (I-88).

*Raised by I-30. Size (estimate): Small–medium.*

---

<a id="i-71"></a>

### I-71 — `IGCALTTYP`: mutual-exclusion list

> **Area:** Field · **Status:** Done (v0.10.154) · **Depends on:** I-30

`IGCALTTYP` carries a long exclusion list (`AUTO(RAZ)`, `BLKFOLD`, several `CHECK` codes, the `CMP`/`COMP` variants, `DUP`, `RANGE`, `VALUES`) — a niche DBCS feature, unenforced. Note I-58's `wrdwrapReverseConflictReason` already covers the `IGCALTTYP`-vs-`WRDWRAP` pair. Re-verify the full list against `DDS_Keyword_V7r6.txt`; expect a bidirectional check in the style of `htmlConflictReason`.

**Fixed.** Re-verified the list against `DDS_Keyword_V7r6.txt` (`IGCALTTYP` section): "The following keywords are not allowed with the IGCALTTYP keyword: AUTO(RAZ), BLKFOLD, CHECK(M10 M11 M10F M11F RL RZ VN VNE), CMP(EQ GE GT LE LT NE NG NL), COMP(EQ GE GT LE LT NE NG NL), DUP, RANGE, VALUES." `CMP`/`COMP` list every operator they can take, so any use of them is excluded; `AUTO` is excluded only with `RAZ` (`AUTO(RAB)` is fine) and `CHECK` only with the eight listed codes (`CHECK(ME)`, `AB`, `FE`, `MF`, `LC` ... are fine). Matching is by parameter token, never substring, like I-58. The `IGCALTTYP`-vs-`WRDWRAP` pair stays with I-58's `wrdwrapReverseConflictReason` and is not repeated.

Two functions in `dspfWriter.js`, in the shape of `htmlConflictReason` and I-58's WRDWRAP pair:
- `igcalttypConflictReason(name, params, fieldKeywords)` - the add-time check for **both** directions (adding `IGCALTTYP` to a field that carries an excluded keyword; adding an excluded keyword to a field that carries `IGCALTTYP`), with a different message for each. Wired to the raw keyword editor's "+ Add keyword" and to the General rows' catch-all add guard (I-83's `withAddGuard`; the guard is called with the keyword name and no parameters there, which is enough for every excluded keyword a General row can add).
- `igcalttypNewConflictReason(oldKeywords, newKeywords)` - a **diff-based backstop** at `commitEdit`, straight after I-85's check, covering every other panel that writes keywords without wiring each one: Keying options' `DUP` checkbox and `CHECK` codes, the validity-check editors, and so on. If `IGCALTTYP` is introduced by the edit, any excluded keyword now on the field counts; if it was already there, only an excluded keyword the edit *added* counts. A hand-written field that was already invalid is not re-reported on unrelated edits, and removing either keyword is always allowed.

The colour/attribute-state editor also uses the HTML add guard, but none of its keywords are on `IGCALTTYP`'s list, so it is left alone. A `CHECK` panel note: on an alphanumeric field the Keying options panel only offers `ME ER MF FE RB RZ RL LC`, so `RL` and `RZ` are the excluded codes reachable there (`M10`/`M11`/`VN`/... are numeric-only, and `IGCALTTYP` does not apply to numeric fields).

New `i71IgcalttypMutualExclusion.test.js` (124 checks: unit checks on both functions, then the real generated script in jsdom through the raw editor, the General rows, the `DUP` checkbox, the `CHECK` codes and a pre-existing invalid field). Confirmed via `git stash` to fail (81 checks) against pre-fix code. Full suite: 109 test files run in parallel, zero failures.

The other two rules in the same section - eligibility, and option indicators - are recorded in [Deferred findings](#deferred-findings-not-yet-tasks).

*Raised by I-30. Size (estimate): Medium (low priority).*

---

<a id="i-72"></a>

### I-72 — `DUP`: floating-point restriction

> **Area:** Field · **Status:** Done (v0.10.157) · **Depends on:** I-30

**Fixed.** Follow-up from I-30, which logged "`DUP` floating-point restriction" as deferred without spelling the rule out. Re-read `DUP`'s own section in `DDS_Keyword_V7r6.txt` first, as the filing said: "You cannot specify the DUP keyword on a floating-point field (F in position 35)." That is the whole exclusion. The "Restrictions on validity checking" paragraph says `CHECK`, `COMP`, `RANGE` and `VALUES` "can be specified with the DUP keyword" but have no effect once the Dup key is pressed, so that is *not* an exclusion and nothing is blocked for it. (`DUP`'s other exclusions - `WRDWRAP` and `CHRID` - are I-58 and I-70.)

Nothing enforced it, in either direction: **A.** adding `DUP` to a field whose data type is `F`, and **B.** changing the data type of a field that already carries `DUP` to `F`. Confirmed by probe: the Input keywords panel renders the `DUP` checkbox on a float field, the raw keyword editor accepts it, and the Basic tab changes a `DUP` field to `F` without a word.

Why not the "data-type gate like the `dtScope` rows I-39 added" the filing guessed: `DUP` is not a General row. It lives in the Input keywords panel, whose builder (`inputKeywordsHtml`/`wireInputKeywordsEditor`) takes no data type, and a `dtScope` gate hides a mismatching row even when the keyword is *present*, so an existing `DUP` on a hand-written float field could no longer be un-ticked in the panel. A hidden row would also not stop the raw editor or a data-type change. A hard block is the one mechanism that covers every route, so that is what was built; hiding the row is left as a deferred finding.

Fix: new `DspfWriter.dupFloatNewConflictReason(oldField, updates)`, a **diff-based** check with one message per direction (*change the data type first* / *remove `DUP` first*). It is called from `commitEdit`, the one choke point every field-level write goes through, and it sits **outside** the `updates.keywords` block there because direction B is a data-type change that carries no keywords. It is called a second time from the Basic tab's Apply as an early return, so a blocked data-type change does not re-render the panel and wipe the user's other pending edits (the same split as I-61 and I-62). It blames an edit only if it *introduces* the violation: a hand-written field that is already floating-point with `DUP` is not re-reported, so unrelated edits on it are never blocked, and fixing it (removing `DUP`, or changing the data type) is always allowed. Removing `DUP` and changing to `F` in one edit is allowed.

This was rebased across I-70 (`CHRID` vs `DUP`, which uses the same `DUP` field and the same `commitEdit` choke point), I-71 and I-73 while in progress; the rules are different and coexist, and I-70's 118 checks and I-58's 79 pass alongside.

New `i72DupFloatingPointGuard.test.js` (62 checks): pure unit checks of both directions, of every non-float data type being allowed, of both-at-once and of the diff-based behaviour; then the real generated webview in jsdom on five fields (float; character with `DUP`; two hand-written float + `DUP`; plain) - the Input keywords checkbox (put back by the re-render), the raw keyword editor and the Basic tab (the typed length kept) all blocked with the right alert and no `applyEdit`; allowed edits committing with `DUP` kept; one field walked through both states; and the hand-written fields where unrelated edits go through and both fixes are accepted. Confirmed via `git stash` to fail (33 checks) against pre-fix code. Full suite: 6591/6591 assertions, zero failures.

Not addressed here: Resolve Referenced Field can still give a `DUP` field data type `F`, and the panel still offers the checkbox on a float field (it is refused with an alert) - both are logged in the Deferred findings table. I-82 (`BLKFOLD` vs floating-point) has the same shape and can reuse this function's structure.

---

<a id="i-73"></a>

### I-73 — `MSGID`: position-dependent mandatory/forbidden conditioning rule

> **Area:** Field · **Status:** Done (v0.10.156) · **Depends on:** I-30

Logged from I-30: `MSGID` has a rule about whether option-indicator conditioning is mandatory or forbidden depending on the keyword's position among its siblings on the field. Not enforced. The details are not written up in the I-30 section, so re-read the `MSGID` section of `DDS_Keyword_V7r6.txt` first and record the exact rule here before implementing.

**Implemented.** Re-read `MSGID`'s entry: "When more than one MSGID keyword is specified, option indicators are required on all except the last MSGID keyword on a field. Option indicators are not allowed on the last (or only) MSGID keyword specified on a field. If more than one MSGID keyword is in effect for a field, the first MSGID specified is used." (The last sentence is why: an unconditioned earlier `MSGID` would always win, so no later one could ever be reached.)

The rule depends on an instance's position, and a field with several `MSGID`s is necessarily built one at a time (every intermediate state, e.g. two unconditioned instances just after the second is added, breaks the "required" half), so it is split by direction rather than hard-blocked:

- **Forbidden half, prevented in the UI.** New `DspfWriter.msgidInstanceAllowsConditioning(instances, inst)` feeds the existing `isConditionable` hook (Task I-20) of `repeatableConditionedInstancesHtml`, so the Conditioning toggle is not rendered on the last (or only) `MSGID` — with the explanation "Option indicators are not allowed on the last (or only) MSGID." A last instance that *already* carries indicators (hand-edited) keeps its toggle so they can be cleared. `repeatableConditionedInstancesHtml` gained an optional 8th parameter for that hint text; its other callers are unchanged.
- **Required half, advisory.** New `DspfWriter.msgidConditioningNotes(keywords)` returns reminder lines that `messageIdInstancesHtml` shows as `hint-small warn` lines above the instances, recomputed on every render (same shape as L83's `dftOutputRequirementNote`): which non-last `MSGID`s (`#1`, `#2`, …, in field order) need an option indicator, and a second line if the last/only one has any.
- `setMessageIdInstances` preserves the instances' relative order, so "last" is stable across edits (asserted by the test).

New `src/test/i73MsgidConditioningRule.test.js` (pure functions, plus the real generated webview in jsdom: lone / two-unconditioned / the DDS Reference's own conditioned-first example / hand-edited conditioned-last / add-second-MSGID-is-not-blocked / remove). Confirmed against the pre-fix code by stashing the UI change alone (7 checks fail) and both files (`msgidConditioningNotes is not a function`). Wired into `npm test`.

Out of scope, logged as new tasks after probing the rest of `MSGID`'s entry: I-91 (`DFT`/`DFTVAL`/`FLTFIXDEC`/`FLTPCN` are not excluded on a `MSGID` field, in either direction) and I-92 (the Message ID panel is offered on fields of an `SFL` record). Usage is already right: the panel is not rendered for input-only fields.

*Raised by I-30. Size (estimate): Medium.*

---

<a id="i-74"></a>

### I-74 — `REF`/`REFFLD`: copy the other keywords from the referenced database field

> **Area:** Field · **Status:** Done (v0.10.179) · **Depends on:** I-32

Per the DDS Reference, a field defined by reference should also inherit `DATFMT`/`DATSEP`/`TIMFMT`/`TIMSEP`/`TEXT`/`ALIAS`/`CCSID`/`FLTPCN` and the editing keywords from the referenced database field. iSDA's reference resolution only pulls **length, data type and decimal positions**. Touches the reference-resolution path, so it needs the most care; decide first whether the inherited keywords are shown read-only in the field's keyword lists or copied into the source.

**Done.** Design decided first, as the task asked, with the user: the inherited keywords are **shown read-only and never copied into the source**, so the `+n` / `-n` length adjustment IBM allows on a referenced field keeps working. Re-read the DDS Reference (position 29 and the length section) before coding:
- **What is inherited:** length, data type, decimal positions, plus `ALIAS`, `CCSID`, `FLTPCN`, `TEXT`, `DATFMT`, `DATSEP`, `TIMFMT`, `TIMSEP`, `REFSHIFT`, and the editing and validity-checking keywords.
- **Overrides:** an own `EDTCDE`/`EDTWRD` replaces the inherited editing (`DLTEDT` removes it); any own validity keyword replaces *all* inherited validity checking (`DLTCHK` removes it); if the field specifies keyboard shift, length or decimal positions, **neither editing nor validity checking is copied**; a type override to character (`M`, `A`, `X`, `W`) means the decimals are not copied; packed and binary become zoned in a display file.
- **Interpretation to confirm:** a `+n` / `-n` length is treated as "specifying length" for the editing/validity rule (IBM's text says "length" without excluding it). The panel says so when it drops them.

**Found while tracing it - three real defects in the old Resolve path, all fixed by the same change:**
- **`+n` / `-n` was not supported.** The parser turned `+2` into the number 2 (so the field drew 2 wide) and `-1` into -1, and Resolve overwrote the length with the database's absolute value, erasing the adjustment. Confirmed with a probe before any change.
- **Resolve defeated inheritance itself.** Writing the absolute length/type/decimals into columns 30-37 is exactly what stops IBM copying the editing and validity keywords.
- **The Basic tab's Apply rewrote `+2` as `2`** (a `type="number"` box cannot hold `+2`).

**Implemented.**
- **Parser/model:** new `lengthAdjust` (signed number, or null); `length` is null for a `+n`/`-n` field, `lengthRaw` keeps the typed text. Writer: `applyFieldUpdate` takes `lengthAdjust` (written back as `+n`/`-n`) and an absolute `length` clears it; unrelated edits leave `+2` alone.
- **Engine (`dspfEngine.js`):** `referenceKey`, `lookupResolvedReference`, `effectiveReferenceField` (referenced length +/- adjustment, resolved type/decimals, inherited keywords appended - so an inherited `EDTCDE` now widens the drawn field correctly), `inheritedReferenceKeywords` (the override rules above, with a note for each drop) and `inheritableKeywordsFromDspffdRow`. The screen preview draws a reference field from the effective definition; the source model is never modified.
- **Resolve Referenced Field / Resolve All (`extension.ts`):** no longer edits the document. It fetches the DSPFFD row (`SELECT *`, so a release without one of the keyword columns just yields no keyword) and posts a `referencesResolved` message; the webview holds the definitions in memory, keyed by library/file/field, for the session. I-88's conflict check is kept: a definition that would break `WRDWRAP` / `PSHBTNFLD` / `CHRID` / `DUP` / `BLKFOLD` / `SFLCHCCTL` on the field is still refused, reported and not posted.
- **Panel:** a new read-only **Inherited from referenced field** section (referenced length/type/decimals, the effective length when a `+n`/`-n` is present, the inherited keywords as non-editable chips, and the drop notes; "Not resolved yet" before Resolve). The Basic tab's Length box on a reference field is now text (blank, `n`, `+n`, `-n`).
- **DSPFFD columns used** (from the published `QWHDRFFD` layout; **not verified on a live IBM i**): `WHFTXT` -> `TEXT`, `WHALI2`/`WHALIS` -> `ALIAS`, `WHCSID` -> `CCSID` (character fields; 0 and 65535 skipped), `WHECDE` -> `EDTCDE`, `WHEWRD` -> `EDTWRD`, `WHFMT`/`WHSEP` -> `DATFMT`/`DATSEP` (date) or `TIMFMT`/`TIMSEP` (time).
- **Tests:** new `i74ReferenceInheritedKeywords.test.js` (92 checks: parser, writer round trip, effective lengths, every override rule, the DSPFFD mapping, the panel HTML, and the real webview script in jsdom - panel, drawn width 1 -> 32, Apply keeps `+2`). `extension.test.js` and `i88ResolveReferencedFieldDefinitionCheck.test.js` were updated from "the document is edited" to "nothing is written; the definition is posted".

**Not done, raised as findings** (see Deferred findings): the validity-checking keywords and `FLTPCN` have no column in the DSPFFD outfile, so they cannot be shown as inherited; and **+ Fields from database file** still writes explicit length/type/decimals, which by the same IBM rule stops those fields inheriting editing/validity.

*Raised by I-32. Size (estimate): Large.*

---

<a id="i-75"></a>

### I-75 — Usage `P` fields: reachable selection path

> **Area:** Field · **Status:** Done (v0.10.171) · **Depends on:** I-35

Usage `P` (program-to-system) fields are not drawn on the design surface, so there is no reachable way to select one in the current UI; the fixed-keyword-list scoping I-35 added for usage `P` therefore cannot be exercised interactively. Needs a way to list/select hidden and `P` fields (e.g. a field list in the record panel).

**Done.** Re-read `P`'s own section in `DDS_Keyword_V7r6.txt`: program-to-system fields are "always named", "[l]ocations are not valid" for them, and "[s]pecify length, data-type, and decimal positions as you do for other named fields" — the same shape as Hidden (`H`) fields, which already have exactly this kind of surface (`hiddenFieldsSectionHtml`/`wireHiddenFieldsSection`).

- **Shared implementation, not a duplicate:** `hiddenFieldsSectionHtml`/`wireHiddenFieldsSection` are now thin wrappers around new `noOnScreenFieldsSectionHtml`/`wireNoOnScreenFieldsSection` functions, parameterized by usage code, element-id/class prefix, and copy. A new **Program** tab (`programFieldsSectionHtml`/`wireProgramFieldsSection`) reuses the same two functions with `usage: 'P'`, `idPrefix: 'p-add-program'`, `deleteClass: 'program-field-delete'`. The Hidden tab's existing element ids/classes (`p-add-hidden`, `hidden-field-delete`, etc.) are unchanged.
- **Same capabilities as Hidden:** list existing `P`-usage fields (name, length/type, keyword summary), click a row to select it into the normal field props panel (Basic/Position/Attributes/Keywords all apply, Position is inert since the field has no location, same as Hidden), a Delete button per row, and an inline "+ Add program-to-system field" form (Name/Length/Decimals/Data type) that skips canvas-click placement, mirroring the Hidden tab's own add form.
- **Scoping bug found and fixed along the way:** `tabsHtml()` renders every tab's panel into the DOM at once (only an `active` class is toggled, not the content), so once Hidden and Program share the same `.field-order-row[data-source-line]` row markup, wiring both from `propsBody` directly would double-bind across tabs (e.g. clicking Program's own delete button would also fire Hidden's row-click handler). `wireNoOnScreenFieldsSection` now scopes every query to its own `[data-tab-panel="hidden"]` / `[data-tab-panel="program"]` container.
- **Not touched:** `dspfEngine.js`'s canvas-drawing exclusion (`usage === 'H' || usage === 'P'`) and I-35's `fieldKeywordCategoryVisibility`/`mpScope` scoping are unchanged — this task only makes an existing `P`-usage field, and newly-added ones, reachable so I-35's fix can actually be exercised.

New scenario in `src/test/dspfWebview.test.js` (`runProgramFieldsScenario`, 12 checks, chained after `runHiddenFieldsScenario`): Program tab exists, lists an existing `P`-usage field without it also appearing under the Hidden tab's own panel, selecting it opens the normal field panel with usage confirmed as `P` on the Basic tab, add/name-collision-refusal/delete all mirror the Hidden tab's own coverage.

*Raised by I-35. Size (estimate): Medium.*

---

<a id="i-76"></a>

### I-76 — Research: do SFLMSG's General/Indicator categories need their own index categories?

> **Area:** Tooling · **Status:** Done (no code change) (v0.10.173) · **Depends on:** I-16

SFLMSG's General and Indicator categories reuse I-9's `SFL` set verbatim. Whether they deserve distinct `KEYWORD-INDEX.json` categories of their own is an index-completeness question raised during I-16 and never researched. Research first, then either fold the answer into I-40 or record why not. **I-40 should run after this.**

**Closed (0.10.173, research only, no code change).** **No - SFLMSG does not need index categories of its own.**

- The real SDA screens are the same screens. `screens/record-level/subfile-message-sflmsg/general/image50.png` and `.../indicator/image51.png` were compared against `subfile-sfl/general/image32.png` and `.../indicator/image33.png`: the same rows in the same order (`SFLNXTCHG`, `LOGOUT`, `LOGINP`, `KEEP`, `CHECK(AB)`, `CHECK(RL)`, `CHGINPDFT`; `INDTXT`, `SETOF`, `CHANGE`), differing only in the record name (and a "Bottom" marker).
- The index already has the matching categories - "Subfile - General (SFL)" and "Subfile - Indicator (SFL)" - and every keyword on the SFLMSG screens is indexed: the four/three listed there, with `KEEP` and `CHGINPDFT` under the base "General" category (I-25 / R3). A second pair of categories would list the same keywords twice, which the lookup file would then report as duplicate locations.
- Precedent: `WNDSFL` and `PULDWNSFL` also reuse the SFL categories and are represented only through `sharedWith`, with no categories of their own.
- **The one real gap is metadata:** `SFLMSG` is missing from `sharedWith` on both SFL categories (currently `WNDSFL`, `PULDWNSFL`), and the SFLMSG screenshot folders are not mentioned anywhere (the schema holds one `screenshotDir` per category). No keyword is missing, so `KEYWORD-LOOKUP.json` is unaffected.

**Handed to I-40** (see its note): add `"SFLMSG"` to `sharedWith` on both SFL categories in `build_index.py`, and name the two SFLMSG screenshot folders in each category's description. Nothing else to regenerate for this question.

**Side finding, logged under Deferred findings rather than fixed here:** I-11's "this is I-9's own SFL keyword set, verbatim" is true of the screens and the keyword set, but `sflMsgPanelsHtml` did not receive I-9's conditioning corrections - see the deferred finding.

*Raised by I-11, I-15, I-23. Size (estimate): Small (research).*

---

<a id="i-77"></a>

### I-77 — `RTNCSRLOC`: re-check the `USRDFN` exclusion

> **Area:** Record · **Status:** Done (v0.10.151) · **Depends on:** I-56, I-60

I-56 deliberately left `USRDFN` out of `RTNCSRLOC`'s record-level guard, citing I-8's audit (no incompatibility statement found). But `RTNCSRLOC` is **not on `USRDFN`'s closed whitelist** either (see I-44/I-49), so that reasoning is worth re-checking: if the whitelist is authoritative, `RTNCSRLOC` should be blocked on a `USRDFN` record the same way I-60 now blocks `ENTFLDATR`.

**Implemented.** Re-read `RTNCSRLOC`'s and `USRDFN`'s sections in `DDS_Keyword_V7r6.txt` first. `USRDFN`: "No fields are valid for this record because the data stream formats the display. No file- or record-level keywords apply to this record except INVITE, KEEP, PASSRCD, HLPRTN, HELP, HLPCLR, PRINT, OPENPRT, and TEXT." `RTNCSRLOC` is not on that list — and, independently, every `RTNCSRLOC` parameter must be a hidden (usage `H`) field of the same record, which a `USRDFN` record cannot have. So I-56's reasoning ("I-8 found no incompatibility statement") did not hold once the whitelist is treated as authoritative (I-44/I-49), the same conclusion I-60 reached for `ENTFLDATR`.

`rtncsrlocConflictReason` (the shared closure behind both hand-rolled commits in `wireRecordKeywordsPanels` — `*RECNAME` and `*WINDOW`/`*MOUSE`) now also ORs in `DspfWriter.usrdfnWhitelistConflictReason('RTNCSRLOC', …)` (I-49, no new writer function). It is checked **only on the on-transition** (`turningOn` = the variant's "present" box is checked), so a hand-edited `USRDFN` record that already carries `RTNCSRLOC` can still have it removed. The record-level raw editor was already covered by I-49's whitelist guard.

New `src/test/i77RtncsrlocUsrdfnGuard.test.js` (31 checks): the pure whitelist function, both variants blocked on `USRDFN` (including the `*MOUSE` type select) with the box reverting, removal still allowed for both variants on a hand-edited `USRDFN` record, I-56's SFL/MNUBAR blocks unchanged, and plain records unaffected. Confirmed to fail against pre-fix code (9 checks). Wired into `npm test`.

Not changed here: see the deferred finding about I-56's SFL/MNUBAR checks also blocking *removal*.

*Raised by I-56, I-60. Size (estimate): Small.*

---

<a id="i-78"></a>

### I-78 — `EDTCDE`: dedicated widget for the optional second parameter

> **Area:** Field · **Status:** Done (v0.10.163) · **Depends on:** I-31

`EDTCDE`'s optional second parameter (`*` or a floating currency symbol appended after the edit-code letter) is reachable only as free text in the same parameters box as the letter. Real SDA's own "Select Editing Keywords" screen (`docs/sda-reference/screens/field-level/numeric/editing-keywords/image182.png`) shows a distinct "Replace leading zeros with" prompt. Nothing is blocked (a user can type `J*`), so this is a discoverability/UX gap, not a correctness bug.

**Done.** Re-read `EDTCDE` in `DDS_Keyword_V7r6.txt`: the format is `EDTCDE(edit-code [* |floating-currency-symbol])`; "When you specify asterisk fill, an asterisk (*) is printed for each zero that is suppressed", a floating currency symbol "must match the system value for the currency symbol (QCURSYM)", and "You can optionally specify asterisk fill or floating currency symbol with edit codes 1 through 4, A through D, and J through Q." Real SDA's screen labels it "Replace leading zeros with" (`*, $`).

- **Widget:** the Edit code / word / mask panel gains a single-character "Replace leading zeros with" input under the kind/code row (`editKeywordSectionHtml`, hint text explaining `*` vs the currency symbol). The main box now holds only the edit-code letter for `EDTCDE`; `EDTWRD`'s string is untouched.
- **Data model unchanged:** the keyword's parameters stay one string. New `DspfWriter.splitEditCode` / `joinEditCode` / `getEditCodeParts` split and rejoin it; the canonical written form has a space, as in the reference's own format line (`EDTCDE(J *)`). A hand-written `J*` (no space) reads back the same and is normalised to `J *` only if the user Applies. A parameter string that does not look like `<code> [<char>]` (e.g. hand-written `J * extra`) is shown whole in the main box and written back unchanged - nothing is ever dropped.
- **One rule enforced, only because IBM states it outright:** `editCodeFillConflictReason` refuses a fill with edit codes W, X, Y, Z (the IBM codes not in the "1-4, A-D, J-Q" sentence), with `EDTWRD` or no keyword selected, with no edit code, or when the fill is not a single character (or is a quote/bracket). User-defined codes 5-9 are not mentioned by IBM either way and are left alone, as is any currency symbol (it only has to match QCURSYM at create time). A refusal alerts and puts both inputs back to the saved state, same idiom as the DFT and `EDTMSK` checks in the same Apply.
- **Habit-typing "J*" into the code box** is understood (the symbol moves to the widget on re-render); the same symbol in both places is fine, two different ones are refused rather than guessed at.
- **Small correction found on the way:** the panel's hint listed the IBM edit codes as "J-O", but IBM says "J through Q" (the reference's own code list and the engine's `[1-4A-DJ-QWXYZ]` regex already agree). The hint now says J-Q. Nothing else read the hint.

New `i78EdtcdeFillWidget.test.js` (73 checks): split/join/round-trip, the fill rule for every code, and the panel itself (rendering and pre-population from `J`, `J *`, `J*`, `1 $`, `EDTWRD` and an unrecognisable string; Apply writing, changing and clearing the fill; habit-typing; refusals leaving the field unchanged with inputs restored; a hand-written second parameter surviving an unrelated edit).

*Raised by I-31. Size (estimate): Small.*

---

<a id="i-79"></a>

### I-79 — `SFLCHCCTL`: field-shape, first-field and one-per-record rules

> **Area:** Field · **Status:** Done (v0.10.149) · **Depends on:** I-39

**Fixed.** I-39 added `SFLCHCCTL` with hint text only. Its own DDS Reference
section (`DDS_Keyword_V7r6.txt`) states three rules, none hard-blocked: the
control field "must be the first field defined in the subfile record", must
have "a length of 1, data type of Y, decimal positions of zero, and have a
usage of H", and "Only one SFLCHCCTL keyword can be used in one subfile
record."

Same split I-57/I-62 used for `PSHBTNFLD`'s own definition rule:

- **Field-shape** (length/type/decimals/usage) is the field's OWN
  definition, so it is silently rewritten to the required `1`/`Y`/`0`/`H`
  shape in the SAME edit when the checkbox is turned on
  (`DspfWriter.sflchcctlDefinitionUpdates`) - there's nothing else that
  shape could sensibly mean once a field becomes a bare control flag. A
  later Basic-tab Apply that would break the shape on a field that already
  carries `SFLCHCCTL` is blocked (`DspfWriter.sflchcctlBasicEditConflictReason`,
  diff-based - an already-invalid hand-written field is never re-reported
  for an unrelated edit).
- **First-field** and **one-per-record** are structural facts ABOUT THE
  RECORD this one edit cannot silently fix (moving the field to be first,
  or freeing up the record's only slot), so turning the checkbox ON is
  hard-BLOCKED instead when either is violated
  (`DspfWriter.sflchcctlFieldConflictReason`, called from
  `wireSubfileFieldKeywords`'s checkbox handler before anything commits,
  checkbox reverted on block - same pattern I-26's `SFLSCROLL` one-per-
  record guard already used). "First field" is read as the first NAMED
  field in the record (`nameType !== 'CONSTANT'`) - constants are called
  out separately from fields throughout this Reference, and IBM's own
  `SFLCHCCTL` example places the control field before any other field with
  no constant in between.

`wireSubfileFieldKeywords`'s and `buildWebviewTemplate.js`'s call site
signatures both grew two params to support this: `isFirstField` (computed
from the owning record's field list) and `getField` (so the checkbox
handler can hand back a `fieldUpdates` object alongside `newKeywords`, the
same `commit(newKeywords, fieldUpdates)` shape `wirePshbtnfldPanel` already
uses) - `i39MissingKeywordsAudit.test.js`'s own `wireSubfileFieldKeywords`
call was updated to pass an already-correctly-shaped field so its original
"commits SFLCHCCTL" assertion still holds unchanged.

**Deliberately out of scope:** reordering fields (the Structure tab's
Up/Down buttons, `DspfWriter.reorderFields`) can move a field that already
carries `SFLCHCCTL` out of first place, or move another field ahead of it,
with no guard - logged below in Deferred findings rather than folded into
this task, since it's a different commit choke point (`moveField`, not
`commitEdit`) with no existing precedent in this codebase to follow. The
DDS Reference's separate note "SFLNXTCHC keyword cannot be specified in a
record that contains a field with the SFLCHCCTL keyword" is a fourth,
distinct rule (cross-keyword, not field-shape/first-field/one-per-record)
and is also logged there rather than folded in here.

Regression coverage: new
`src/test/i79SflchcctlStructuralRules.test.js` - pure unit checks for all
three new `DspfWriter` functions, plus DOM scenarios covering the
auto-rewrite (wrong-shape first field), the first-field block (second
field), and the one-per-record block (hand-written second field already
carrying the keyword).

*Raised by I-39. Size (estimate): Medium.*

---

<a id="i-80"></a>

### I-80 — `SFLCSRPRG` vs `SFLLIN`

> **Area:** Field · **Status:** Done (v0.10.150) · **Depends on:** I-39

I-39 added `SFLCSRPRG` with hint text only; its incompatibility with `SFLLIN` is not hard-blocked. Decide the direction(s) (`SFLCSRPRG` is field-level, `SFLLIN` record-level) from the DDS Reference, then guard.

**Implemented.** Re-read both keywords' sections first, as asked. `SFLCSRPRG` (field-level) ends: "The SFLLIN keyword is not allowed in a record that contains the SFLCSRPRG." `SFLLIN` (record-level, "on the subfile-control record format") says nothing back about `SFLCSRPRG`.

**Interpretation decision — please review.** Read literally the sentence is unsatisfiable: `SFLCSRPRG` lives on a *field of the subfile record*, `SFLLIN` on the *control record*, so no valid file has both in one record. The only reading with any effect goes through the association the two records already have, the control record's `SFLCTL(sfl-record)` parameter: **a subfile record with a `SFLCSRPRG` field cannot be shown by a control record that carries `SFLLIN`** (a horizontal, multi-column subfile, where "the same field in the *next* subfile record" has no single next). That is what is enforced. It is an interpretation, not a quotation; IBM's `SFLCSRPRG` example uses `SFL01`/`CTL01` with no `SFLLIN`, which fits it but doesn't prove it. If real `CRTDSPF` turns out not to enforce this across records, the guard would refuse valid DDS and should be relaxed to the hint I-39 shipped. I-39's hint text ("not allowed in a record that also carries SFLLIN") is reworded to say what is actually enforced.

Both directions, at the two existing choke points, diff-based like I-58/I-64/I-81 (an edit is only blamed for a violation it *introduces*, so an already-invalid hand-written pair never blocks an unrelated edit, and fixing it is always allowed):
- **Field side** (`commitEdit`, new `DspfWriter.sflcsrprgFieldEditConflictReason`): introducing `SFLCSRPRG` on a field of a subfile record whose control record (`SFLCTL(that-record)`) carries `SFLLIN` — any instance, including display-size-conditioned ones. Alert names both records; "Remove SFLLIN first"; the re-render puts the checkbox back.
- **Record side** (`commitRecordEdit`, new `DspfWriter.sfllinRecordEditConflictReason`): introducing `SFLLIN` on a control record — or pointing a control record that already has it at a different subfile record through `SFLCTL` — when the target subfile record has a `SFLCSRPRG` field. Alert names the subfile record and the offending field; "Remove SFLCSRPRG first". Covers the Display Layout row and the raw keyword editor without wiring either.
- Not blocked: `SFLLIN` on a record with no `SFLCTL`, a `SFLCTL` naming a record that doesn't exist, a control record for a *different* subfile record, unticking `SFLCSRPRG`, changing `SFLLIN`'s spacing, and unrelated edits on an already-invalid pair.
- Deliberately not covered: renaming a subfile record, or deleting a `SFLCSRPRG` field, cannot introduce the violation, so they need no check; a pair that becomes invalid because a *new* `SFLCTL(x)` record is added by hand-editing the source is outside the designer's edit paths.

New `src/test/i80SflcsrprgSfllinGuard.test.js` (31 checks): both pure functions (including retargeting via `SFLCTL`, display-size-conditioned `SFLLIN`, null-safety) and the real generated webview — field side blocked/allowed, record side blocked/allowed via the raw editor, and an already-invalid `DTLD`/`CTLD` pair that stays editable (unrelated add allowed, unticking allowed, ticking a second field still blocked). Confirmed to fail against pre-fix code: 4 webview-level checks fail with the wiring removed. Also wires `i79SflchcctlStructuralRules.test.js` (I-79) into the `npm test` script — that commit had added the test file but not the script entry, so it was not being run (it passes, 42 checks, on the merged tree).

*Raised by I-39. Size (estimate): Small.*

---

<a id="i-81"></a>

### I-81 — `SFLRTNSEL` requires `SFLMLTCHC` or `SFLSNGCHC`

> **Area:** Record · **Status:** Done (v0.10.147) · **Depends on:** I-39

**Fixed.** Follow-up from I-39: I-39 added `SFLRTNSEL` on the `SFLCTL` record with only a hint when neither `SFLMLTCHC` nor `SFLSNGCHC` is selected; nothing hard-blocked it, in either direction: **A.** adding `SFLRTNSEL` to a record that has neither, and **B.** removing the last of `SFLSNGCHC`/`SFLMLTCHC` while `SFLRTNSEL` is present.

Re-read `SFLRTNSEL`'s own section in `DDS_Keyword_V7r6.txt` first: "If this keyword is specified then SFLMLTCHC or SFLSNGCHC must be specified." (record-level, no parameters, option indicators not valid - the last two were already handled by I-39). IBM's own example is a `SFLCTL` record carrying `SFLMLTCHC` and `SFLRTNSEL`.

Reachability sweep, since a guard has to cover every route: the `SFLCTL` panel's `SFLRTNSEL` checkbox (adds it), the panel's type selector set to "(none)" (removes the type), and the record-level raw keyword editor (both "+ Add keyword" and the chip's remove button). `setSflSngChcKeyword`/`setSflMltChcKeyword` are called only from that one panel's wiring, and no record template or wizard writes `SFLRTNSEL`, so those are all the routes.

Design: a single diff-based backstop, `DspfWriter.sflrtnselNewConflictReason(oldKeywords, newKeywords)`, called from `commitRecordEdit` - the one choke point every record-level keyword write goes through - rather than a guard per route. It is the record-level counterpart of I-58's and I-64's field-level backstops in `commitEdit`, and it is the only way to cover direction B in the raw editor, whose remove button deliberately has no guard hook (`wireKeywordEditor`'s `addGuardFn` only fires on add). It returns one of two messages, so the user is told which direction they hit: *choose a selection-list type first* when adding, or *turn `SFLRTNSEL` off first* when removing. On a block the panel is re-rendered from the model, which puts the checkbox or selector back.

The check is **diff-based**: it blames an edit only if it *introduces* the violation. A hand-written record that already has `SFLRTNSEL` and no choice keyword is not re-reported, so unrelated edits on it are never blocked, and fixing it (adding a choice keyword, or removing `SFLRTNSEL`) is always allowed. Switching `SFLSNGCHC` and `SFLMLTCHC` for each other with `SFLRTNSEL` kept is allowed (one always remains), as is removing `SFLRTNSEL` and the choice keyword together.

The panel's I-39 hint was reworded to match: it now says to choose a type first, and for the already-invalid hand-written case says the record is invalid DDS and what to do about it.

New `i81SflrtnselRequiresChoiceList.test.js` (51 checks): pure unit checks of both directions, of the allowed cases and of the diff-based behaviour; then the real generated webview in jsdom on four records (valid, no keywords, `SFLMLTCHC` only, hand-written invalid) - checkbox, selector and raw editor add/remove all blocked with the right alert and no `applyEdit`, the checkbox and selector put back by the re-render, allowed edits committing with the right keywords written, the right-order path (type first, then `SFLRTNSEL`), and the hand-written case where an unrelated edit goes through and the fix is accepted. Confirmed via `git stash` to fail (19 checks) against pre-fix code. Full suite: 5898/5898 assertions, zero failures.

Not addressed here: the same removal-direction gap exists for the `PSHBTNFLD`/`PSHBTNCHC` "must also contain" pair - see Deferred findings.

---

<a id="i-82"></a>

### I-82 — `BLKFOLD` vs floating-point (belt and suspenders)

> **Area:** Field · **Status:** Done (v0.10.159) · **Depends on:** I-39

**Fixed.** `BLKFOLD` is not valid on floating-point fields (DDS Reference: "You cannot specify the BLKFOLD keyword on a floating-point field (F in position 35)"). I-39's `dtScope` gating ('non-float') already kept the row from showing on a float field, so this only mattered for a field whose data type is changed to `F` *after* `BLKFOLD` is set (the Basic tab), or the keyword typed directly into the raw editor on an existing float field.

Exact same shape as I-72's `DUP` guard: new `DspfWriter.blkfoldFloatNewConflictReason(oldField, updates)`, diff-based, called from `commitEdit` (the one choke point every field-level write goes through — covers the raw keyword editor and the General keywords checkbox) and again from the Basic tab's Apply handler as an early return so the panel keeps the user's other pending edits. A field that was already floating-point with `BLKFOLD` (hand-written) is not re-reported — unrelated edits still go through, and fixing it (removing `BLKFOLD`, or changing the data type) is always allowed.

Regression coverage: new `src/test/i82BlkfoldFloatingPointGuard.test.js` — unit checks for the new `DspfWriter` function, plus DOM scenarios covering the raw editor, the Basic tab, both directions on one field walked through both states, and an already-invalid hand-written field.

*Raised by I-39. Size (estimate): Small (low priority).*

---

<a id="i-83"></a>

### I-83 — `HTML` constants: gate the Attributes tab `DSPATR`/`COLOR` checkboxes

> **Area:** Field · **Status:** Done (v0.10.151) · **Depends on:** I-41

The Attributes tab's `DSPATR`/`COLOR` checkboxes (`wireColorAttrStatesEditor`) are rendered for every constant type and are not gated against `HTML`'s wider exclusion list (`COLOR`/`DATE`/`DFT`/`DSPATR`/`EDTCDE`/`EDTWRD`/`HLPID`/`MSGCON`/`NOCCSID`/`OVRATR`/`PUTRETAIN`/`SYSNAME`/`TIME`/`USER`). Only reachable by creating an `HTML` constant and then visiting the Attributes tab; the raw editor's guard already covers the likelier path. A disclosed, narrow gap from I-41.

**Implemented — scope widened from the row's wording.** Re-read `HTML`'s section: its exclusion list is COLOR, DATE, DFT, DSPATR, EDTCDE, EDTWRD, HLPID, MSGCON, NOCCSID, OVRATR, PUTRETAIN, SYSNAME, TIME and USER. The row named only the Color & attributes checkboxes; probing the real webview on an `HTML` constant (before touching code) showed the Attributes tab exposes **six** excluded keywords through structured editors, all writing invalid DDS without any alert: `COLOR` and `DSPATR` (Color & attributes), and `DFT`, `HLPID`, `PUTRETAIN`, `OVRATR`, `NOCCSID` (General keywords, all offered for constants). The other eight are not reachable from an `HTML` constant's panel (`DATE`/`TIME`/`SYSNAME`/`USER`/`MSGCON` are value sources chosen at creation; `EDTCDE`/`EDTWRD` are only rendered for system-value constants). Same gate, same tab, same guard, so it is fixed here rather than split into a near-identical task.

New shared helper `withAddGuard(keywords, onChange, rerender, addGuardFn)` in `webviewClientHelpers.js`: wraps an editor's `onChange` so every keyword **name newly present** in the array it is about to commit is run through `addGuardFn`; the first reason is alerted, the panel re-rendered from the unchanged keywords (which puts the checkbox back) and the commit dropped. It is an optional trailing parameter on `wireColorAttrStatesEditor` and `wireGeneralFieldKeywordsEditor`; callers that don't pass one (menu designer, the multi-select editor) are unchanged. The field-panel call sites pass `DspfWriter.htmlConflictReason` (I-41), which is a no-op unless the field carries `HTML`. Diff-based by construction: removals and edits to keywords already present are never blocked, so a hand-edited `HTML` constant that already carries `COLOR`/`PUTRETAIN` can still be cleaned up. Covers every row of both editors at once instead of wiring each checkbox.

New `src/test/i83HtmlConstantAttributesGate.test.js` (43 checks, real generated webview in jsdom): all six keywords blocked (alert names the keyword and `HTML`, no `applyEdit` posted), `TEXT` (allowed) still commits beside `HTML`, removal of pre-existing `PUTRETAIN` and `COLOR` allowed, and a plain literal constant and a named field unaffected. Confirmed to fail against pre-fix code (14 checks). Wired into `npm test`.

*Raised by I-41. Size (estimate): Small.*

---

<a id="i-84"></a>

### I-84 — `RTNCSRLOC`: SFL/MNUBAR checks should fire only when turning on (misleading un-tick alert)

> **Area:** Record · **Status:** Done (v0.10.152) · **Depends on:** I-56, I-77

**Fixed.** Follow-up from I-77: `rtncsrlocConflictReason` was `(turningOn && USRDFN check) || SFL check || MNUBAR check`, so only USRDFN's check (added by I-77) was on-transition-only; I-56's `SFL` and `MNUBAR` checks ran on **every** commit. On an `SFL` or `MNUBAR` record that already carried a hand-edited `RTNCSRLOC`, un-ticking the box was refused with a misleading "cannot be *added*" alert, and the only way out was the raw keyword editor's chip. Reproduced in jsdom for both `RTNCSRLOC` variants (`*RECNAME` and `*WINDOW`/`*MOUSE`) on both record types. Writing the test also showed the same alert on merely *editing the parameters* of an existing `RTNCSRLOC`, which the filing had not mentioned.

Fix: all three checks are now gated on `turningOn`, and `turningOn` is defined as the real **transition** for the variant being edited - its box is now ticked **and** that variant was not already present - computed per commit from `getRtncsrlocRecNameFields`/`getRtncsrlocWindowMouseFields`. The filing suggested just passing `turningOn` to all three checks, but with `turningOn` meaning the checkbox state, editing an existing keyword's parameters (box still ticked) would still have been refused with the same wrong "added" message. The transition definition is the same diff-based posture as I-58, I-61, I-62 and I-81: only an edit that *introduces* the conflict is blocked; a record that was already invalid is never re-reported, and removing the keyword is always allowed. The two variants are independent, so turning the *other* variant on is still an addition and is still blocked (tested).

Effect on I-77's `USRDFN` check, which shares the function: it now also fires only on a real turn-on, so editing the parameters of an existing hand-edited `RTNCSRLOC` on a `USRDFN` record is no longer refused either (it is not an addition). Turning it on and removing it behave exactly as before; I-77's 31 checks and I-56's 17 pass unchanged.

New `i84RtncsrlocOnTransitionOnly.test.js` (59 checks, same lightweight jsdom harness as I-77's test): un-ticking a hand-edited `RTNCSRLOC` on `SFL` and on `MNUBAR`, for both variants (no alert, keyword removed, record type kept); editing an existing keyword's parameters on `SFL`, `MNUBAR` and `USRDFN` (no alert, keyword updated, still exactly one); turning either variant on is still blocked on `SFL`, `MNUBAR` and `USRDFN` with the right record-type wording, no keyword added and the checkbox reverted; the other-variant case; and a plain record committing both variants and removing one while keeping the other. Confirmed via `git stash` to fail (14 checks) against pre-fix code. Full suite: 6187/6187 assertions, zero failures.

Not addressed here: `ENTFLDATR`'s guard has the same flaw - see Deferred findings.

---

<a id="i-85"></a>

### I-85 — `PSHBTNFLD` / `PSHBTNCHC`: guard removing one while the other stays

> **Area:** Field · **Status:** Done (v0.10.153) · **Depends on:** I-57, I-64, I-81

`PSHBTNFLD`/`PSHBTNCHC` have the same removal-direction gap I-81 closed for `SFLRTNSEL`. The DDS Reference says "A field containing the PSHBTNFLD keyword must also contain one or more PSHBTNCHC keywords" and that `PSHBTNCHC` needs `PSHBTNFLD`, but `pshbtnfldConflictReason`/`pshbtnfldNewConflictReason` (I-57/I-64) only check what is being *added*: removing `PSHBTNFLD` while a `PSHBTNCHC` stays, or removing the last `PSHBTNCHC` while `PSHBTNFLD` stays, is not checked (verified by calling `pshbtnfldNewConflictReason` on both edits - it returns null). Reachable at least through the raw keyword editor. Same fix shape as I-81 (a diff-based check in the `commitEdit` backstop).

**Fixed.** Re-read `PSHBTNFLD`/`PSHBTNCHC` in `DDS_Keyword_V7r6.txt`: "A field containing the PSHBTNFLD keyword must also contain one or more PSHBTNCHC keywords", and `PSHBTNCHC` needs `PSHBTNFLD`. I-57's `pshbtnfldConflictReason` and I-64's `pshbtnfldNewConflictReason` only check what an edit *adds*, so two removal edits left the field invalid: **A.** removing `PSHBTNFLD` while a `PSHBTNCHC` stays, and **B.** removing the last `PSHBTNCHC` while `PSHBTNFLD` stays.

Reachability sweep: the raw keyword editor's chip remove button (no guard hook of its own), and the `PSHBTNFLD` panel's choice-row remove button. The panel's own toggle-off already removes `PSHBTNFLD` together with every `PSHBTNCHC` in one edit, and turning it on seeds a choice, so neither is affected.

Design: a new diff-based backstop, `DspfWriter.pshbtnfldRemovalConflictReason(oldKeywords, newKeywords)`, called from `commitEdit` straight after I-64's check - the same one choke point, and the same shape as I-81's `sflrtnselNewConflictReason` at record level. It returns one of two messages (*remove the push-button choices too / turn the push-button field off* for A; *the last PSHBTNCHC cannot be removed, turn the push-button field off instead* for B). It is a separate function rather than an extension of `pshbtnfldNewConflictReason`, whose early returns and I-64 tests are about the add direction.

The check is **diff-based**: it blames an edit only if it *introduces* the violation. B requires the field to have carried both keywords before the edit, so a hand-written `PSHBTNFLD` with no `PSHBTNCHC` (or an orphan `PSHBTNCHC`) is never re-reported, and fixing it - adding a choice, removing `PSHBTNFLD`, removing the orphan - is always allowed. Removing one of several `PSHBTNCHC`, replacing the only one, and removing `PSHBTNFLD` together with every `PSHBTNCHC` are all allowed. The add direction stays with I-57/I-64.

New `i85PshbtnfldRemovalGuard.test.js` (53 checks: unit checks on the function, then the real generated script in jsdom through the raw editor and the panel). Confirmed via `git stash` to fail (14 checks) against pre-fix code. The webview applies an edit to its local model at once, so each committing scenario uses its own field. Full suite: 107 test files run in parallel plus this one, zero failures.

*Raised by I-81. Size (estimate): Small.*

---

<a id="i-86"></a>

### I-86 — `SFLNXTCHC` vs a record that contains an `SFLCHCCTL` field

> **Area:** Cross-level · **Status:** Done (v0.10.158) · **Depends on:** I-79

**Fixed.** `SFLCHCCTL`'s own DDS Reference section separately states "SFLNXTCHC keyword cannot be specified in a record that contains a field with the SFLCHCCTL keyword" - a fourth, cross-keyword rule distinct from the field-shape/first-field/one-per-record trio I-79 closed. Confirmed the Reference's own "SFLNXTCHC" spelling here is a single dropped letter, not a second keyword: the same document spells it `SFLNXTCHG` 15 other times, including its own section header ("SFLNXTCHG (Subfile Next Changed) keyword for display files") a few hundred lines later, and `SFLNXTCHG` is the only keyword of that name anywhere in the Reference.

`SFLNXTCHG` is itself record-level, "on the subfile record format" (its own section) - the same physical record `SFLCHCCTL`'s control field lives in. Guarded in both directions, at three call sites:

- **`SFLCHCCTL` ON, record already has `SFLNXTCHG`:** `DspfWriter.sflchcctlFieldConflictReason` grew a third `recordKeywords` parameter (backward-compatible - a 2-arg call, like `i39MissingKeywordsAudit.test.js`'s own, simply skips this check) alongside its existing first-field/one-per-record checks.
- **`SFLNXTCHG` ON, a field already has `SFLCHCCTL` - plain SFL record's own panel:** new `DspfWriter.sflNxtchgSflchcctlConflictReason(fieldsKeywords)`, wired into `wireSflKeywordsPanels` (which grew a `getFields` param) with the same alert+revert idiom I-11's own `SFLMSGRCD` guard already established for this exact row.
- **`SFLNXTCHG` ON - the SFLCTL record's own panel:** this row operates on the SFLCTL record's OWN keywords, but `SFLCHCCTL` never lives on the control record's own fields - it's on the record `SFLCTL(subfile-record-name)` points at, which can be a different record entirely. New `DspfWriter.sflctlNxtchgSflchcctlConflictReason(keywords, records)` resolves that target first (same `sflctlTargetName` resolution I-80's own `sfllinAssociatedViolation` already established for the analogous SFLLIN/SFLCSRPRG cross-record check), then delegates to `sflNxtchgSflchcctlConflictReason`. `wireSflCtlPanels` grew a `getRecords` param (the full record list, not just this record's own fields) to support it. This resolution degrades correctly to a combined SFL+SFLCTL record too (`SFLCTL` naming its own record resolves right back to itself).

Regression coverage: new `src/test/i86SflnxtchgSflchcctlGuard.test.js` - unit checks for all three (new/extended) `DspfWriter` functions, plus DOM scenarios covering both directions across all three call sites, including the SFLCTL-panel-to-linked-SFL-record resolution.

*Raised by I-79. Size (estimate): Small–medium.*

---

<a id="i-87"></a>

### I-87 — `SFLCHCCTL`: guard field reordering (Up/Down) against breaking the first-field rule

> **Area:** Field · **Status:** Done (v0.10.166) · **Depends on:** I-79

Reordering fields (Structure tab's Up/Down buttons, `DspfWriter.reorderFields`, called from `moveField`) can move a field that carries `SFLCHCCTL` out of first place, or move another field ahead of it, with no guard - `sflchcctlFieldConflictReason`'s first-field check only runs when the checkbox itself is toggled. Needs its own diff-based backstop at the `moveField`/`reorderFields` choke point, which has no existing guard precedent to follow (unlike `commitEdit`, which several tasks already hook).

**Fixed.** New `DspfWriter.sflchcctlReorderConflictReason(record, orderedSourceLines)` in `dspfWriter.js`, called from `moveField` (`buildWebviewTemplate.js`) before it commits, so a reorder that would break the rule shows an alert ("SFLCHCCTL must be on the first field defined in the subfile record (per the DDS Reference) - this move would put F2 ahead of CHG.") and writes nothing. `moveField` is the only caller of `reorderFields`, so the guard lives there rather than making the writer function throw: `reorderFields` stays a pure transformation and the alert matches every other guard in the series.

**Diff-based**, like every other backstop here: a reorder is blocked only if it *introduces* the violation - a field carrying `SFLCHCCTL` is the first named field before the move and is not afterwards. "First field" is the first **named** field (constants do not count - the same reading as I-79's `isFirstField`), so moving `CHG` up past a leading constant, or a constant past `CHG`, is allowed. A hand-written record where `SFLCHCCTL` is already not first is never re-reported (unrelated moves stay possible), moving the `SFLCHCCTL` field towards the front is always allowed, and records with no `SFLCHCCTL` are untouched. If two fields illegally both carry `SFLCHCCTL`, only a move that leaves a plain field first is blocked.

Other paths that could disturb the order were checked: `insertField` ("+ Field", copy, paste) appends at the bottom of the record and deleting a field only ever promotes the next one, so neither can move `SFLCHCCTL` out of first place; the Up/Down buttons are the only reorder path.

New `i87SflchcctlReorderGuard.test.js` (41 checks: unit checks on the pure function, then the real generated script in jsdom pressing the real Field order Up/Down buttons - blocked moves, allowed moves, a leading constant, an already-invalid record, and a record with no `SFLCHCCTL`). Confirmed via `git stash` to fail (14 checks) against pre-fix code. Full suite: 121 test files run in parallel, zero failures.

*Raised by I-79. Size (estimate): Medium.*

---

<a id="i-88"></a>

### I-88 — Resolve Referenced Field: `WRDWRAP` / `PSHBTNFLD` / `CHRID` / `DUP` definition check

> **Area:** Field · **Status:** Done (v0.10.161) · **Depends on:** I-61, I-62, I-70, I-72

Resolve Referenced Field (`extension.ts`) rewrites a field's length, data type and decimals from the database file's definition through `applyFieldUpdate` with no `WRDWRAP` (I-61) or `PSHBTNFLD` (I-62) check, so a `WRDWRAP` field can still end up with a data type `WRDWRAP` forbids, and a `PSHBTNFLD` field with a data type, length or decimals other than `Y` / 2 / 0, that way. Needs a decision (block, warn, or leave) because the type comes from a real database file, not from the user's own edit.

**Scope added (from I-70 and I-72's own findings, verbatim):**

- *`CHRID` (I-70):* Resolve Referenced Field (`extension.ts`) rewrites a field's length, data type and decimals from the database definition through `applyFieldUpdate`, so it can give a `CHRID` field decimal positions (making it numeric, which `CHRID` forbids) with no check - the same gap I-61/I-62 logged for `WRDWRAP`/`PSHBTNFLD`, now tracked as I-88. I-88 should cover `CHRID` too, using `DspfWriter.chridBasicEditConflictReason`'s decimals rule.
- *`DUP` (I-72):* Resolve Referenced Field (`extension.ts`) rewrites a field's data type from the database definition through `applyFieldUpdate`, so it can turn a `DUP` field into a floating-point (`F`) field, which `DUP` forbids, with no check - the same gap I-61, I-62 and I-70 logged, tracked as I-88. I-88 should cover `DUP` too, using `DspfWriter.dupFloatNewConflictReason`.

**Fixed.** The decision the task called for was **block**: a resolve that would leave a field in a state the panels themselves refuse now leaves that field exactly as it is and reports why; every other field in a "resolve all" still resolves. (Warn-and-apply would have written DDS the panels reject and IBM i would reject at compile time; every other guard in the series hard-blocks.)

New `DspfWriter.referencedFieldResolveConflictReason(field, updates)` in `dspfWriter.js` runs, for the properties a resolve writes (length, data type, decimals - never usage), the very same diff-based Basic-tab checks, in the same order the Basic tab's Apply handler runs them, so the two cannot drift apart: `wrdwrapBasicEditConflictReason` (I-61), `pshbtnfldBasicEditConflictReason` (I-62), `dupFloatNewConflictReason` (I-72), `blkfoldFloatNewConflictReason` (I-82), `chridBasicEditConflictReason` (I-70) and `sflchcctlBasicEditConflictReason` (I-79). `BLKFOLD` and `SFLCHCCTL` were not in the task's list but are the same gap (a data-type / length / decimals write against a keyword's definition rule, already checked by the Basic tab), so they are included rather than left to reopen it. `CHKMSGID`'s check is usage-only and a resolve never changes usage, and the date/time-versus-usage check is not keyword-based, so neither is included.

`handleResolveReferencedField` (`extension.ts`) calls it before `applyFieldUpdate`. A blocked field is skipped and added to the existing failures message: "CUSTNO: left unresolved - the database definition (data type S, length 7, decimals 2) conflicts with a keyword on this field. CHRID …".

Two details: (1) the database's own character type comes back as a **blank** data type (DDS's default, the same as an explicit `A`), so a blank over an existing `A` is not treated as a change - otherwise every diff-based check would re-report an already-invalid hand-written field it is meant to leave alone; (2) a real database file never defines type `Y` (it is the push-button type), so a `PSHBTNFLD` reference field is in practice always refused on resolve - the shape is still tested.

New `i88ResolveReferencedFieldDefinitionCheck.test.js` (76 checks: unit checks on the function for all six keywords, then the real extension host handler against the vscode mock with a stubbed Code for IBM i - single-field refusals, the allowed definitions, an already-invalid hand-written field, and a "resolve all" that leaves the blocked fields byte-for-byte unchanged while resolving the rest). Confirmed via `git stash` to fail (50 checks) against pre-fix code. Full suite: 116 test files run in parallel, zero failures.

*Raised by I-61, I-62, I-70, I-72. Size (estimate): Small–medium (needs a decision first; four keywords now share it).*

---

<a id="i-89"></a>

### I-89 — `CHKMSGID`: validate its `&message-data-field` parameter

> **Area:** Field · **Status:** Done (v0.10.167) · **Depends on:** I-69

`CHKMSGID`'s optional `&message-data-field` parameter must name a field that **exists in the same record format** and is defined as a **character field (data type `A`) with usage `P`** (per its DDS Reference section). The CHKMSGID panel takes any text there and nothing checks it; also not checked when the named field is later renamed, deleted or has its type/usage changed. Needs a record-aware check like the `SFLMSGID`/`SFLPGMQ` field-name validations.

**Done - the entry checks; the "later changes" checks turned out to be unreachable.** Re-read `CHKMSGID`: "The field name must exist in the record format, and the field must be defined as a character field (data type A) with usage P." (The note above that `SFLMSGID`/`SFLPGMQ` already have such a validation was wrong - nothing record-aware existed to copy, so this is new code.)

- **The rule:** `DspfWriter.chkmsgidMsgDataFieldProblem(name, recordFields)` finds the named, non-constant field (case-insensitive, leading `&` ignored) and reports: not in the record; not data type A (a blank data type with no decimal positions is A by default, a blank one *with* decimals is numeric, decimals 0 count); usage not P (blank usage reported as blank/output). Both problems are reported together. A field defined by reference (`R` in position 29) takes its type from the referenced database field, which the designer cannot see, so its data type is not judged (fail open) - its usage still is. An absent field list fails open.
- **Three entry points, all diff-based:** the CHKMSGID panel's Apply (checked in the panel so a refusal keeps what was typed, like I-69's check beside it); the raw keyword editor's add guard (`chkmsgidMsgDataAddReason`); and the `commitEdit` choke point (`chkmsgidMsgDataNewConflictReason`) for every other panel, including the raw editor's parameter edit. A name is checked only when it is new or different, so a hand-written CHKMSGID that already names a bad field stays editable - changing only its message id, or clearing the data field, is allowed - and changing it to another bad name is refused. `wireValidityAndEdit` takes the record's fields as an optional trailing parameter (absent = not checked); the panel hint now states the rule.
- **Not done, on purpose: guarding the named field being renamed, retyped, re-usaged or deleted.** The filing asked for it, and a first version of it was written and then removed: a *valid* message data field has usage `P`, and the designer cannot select a usage-`P` field at all - `P` fields are not drawn on the canvas, the Hidden tab lists only usage `H` fields, and nothing else lists them (probed in jsdom). So none of those edits can be made from the designer to a valid target; a guard would fire only on already-invalid hand-written targets, where blocking would contradict the diff-based posture. Deleting a *visible* field that looks referenced already gets the existing "likely reference" confirmation. Worth revisiting only if `P` fields ever become selectable (see Deferred findings).

New `i89ChkmsgidDataFieldValidation.test.js` (63 checks): the field check across every case above, the diff (including unchanged/bad and bad-to-valid), the raw add check, and the real webview (panel Apply valid / missing / usage O / numeric P / itself / case-insensitive / no data field, typed text kept after a refusal; hand-written bad name: message id change allowed, change to another bad name refused, change to valid allowed, cleared; raw editor add valid / missing / non-P / no data field). Confirmed to fail (8 checks) with the webview wiring reverted.

*Raised by I-69. Size (estimate): Medium.*

---

<a id="i-90"></a>

### I-90 — Research: `HLPDOC` / `HLPRTN` cross-level scope (file, record, help specification)

> **Area:** Cross-level · **Status:** Done (v0.10.168) · **Depends on:** I-38, I-68

The scope of "You cannot specify `HLPDOC` with … `HLPRTN`" across levels is unstated. `HLPRTN` is file- **or record**-level and `HLPDOC` is file- **or help-specification**-level, but I-38's forward check and I-68's reverse check compare only the two *file-level* keywords. Whether a file-level `HLPDOC` plus a record-level (or H-spec-level) `HLPRTN`/`HLPDOC` is also invalid is not answerable from the DDS Reference text alone (`HLPRTN`'s own "takes priority over" wording and its Example 1 point towards cross-level coexistence being normal). Research against `CRTDSPF` behaviour or a more authoritative source before guarding; guessing would block valid DDS.

**Researched (v0.10.168) - result: the DDS Reference alone cannot settle it, and no cross-level guard should be added.** Sources: the local `DDS_Keyword_V7r6.txt` (`HLPDOC`, `HLPRTN`, `HLPPNLGRP`, `HELP`, `HLPARA`, `HLPBDY` sections) and IBM's public IBM i 7.1 - 7.4 pages for the same text (the wording is identical on every release; no `CRTDSPF` message documentation naming the pair was found, and no IBM i was available to compile against).

**What points towards blocking**
- `HLPDOC`'s section: "You cannot specify HLPDOC with HLPBDY, HLPPNLGRP, or HLPRTN." No level is stated.
- `HLPPNLGRP`'s section is explicitly file-wide for its own pairs: "a display file cannot contain both HLPPNLGRP and HLPRCD keywords, nor HLPPNLGRP and HLPDOC keywords."

**What points towards coexistence being normal**
- `HLPRTN`'s section: it "at either the file or record level takes priority over any HLPRCD, HLPPNLGRP, or HLPDOC keywords. Any HLPRTN keyword found in the file is processed before any other applicable help keyword." A priority rule between keywords only makes sense if they can be in the same file.
- With an option indicator, "control returns to your program if the option indicator is on at the time the record is displayed. The H specifications are used if the option indicator is off." Every help specification must contain `HLPARA` and one of `HLPRCD`, `HLPDOC` or `HLPPNLGRP`, so an optioned record-level `HLPRTN` alongside H-spec help is the documented usage.
- Without an option indicator, `HLPRTN` on a file or record containing H specifications is only a **warning** at creation time - not an error.
- `HELP`'s section: "The HLPRTN keyword allows you to use option indicators to select when online help information is displayed, and when control is returned to the program."
- `HLPRTN` Example 2 shows a **file-level** `HLPRTN(01)` together with a file-level `HLPRCD`. `HLPRCD` and `HLPDOC` fill the same slot in `HLPRTN`'s own priority sentence, so the same coexistence would be expected for `HLPDOC`. Nothing in the Reference contains a worked `HLPDOC` + `HLPRTN` example either way.

**Which levels each keyword really has.** `HLPDOC`: file and help specification. `HLPRTN`: file and record. `HLPBDY`: help specification only. So an H-spec-level `HLPDOC` can never share a *level* with `HLPRTN` at all; the only same-level pair is file + file (which I-38 / I-68 already block). Every other combination is cross-level.

**Recommendation (a guard that blocks valid DDS is worse than one that misses an invalid combination, and `CRTDSPF` reports a real conflict at compile time anyway)**
1. **No cross-level guard.** File-level `HLPDOC` + record-level `HLPRTN`, and H-spec `HLPDOC` + record-level `HLPRTN`, stay unguarded.
2. **Keep I-38 / I-68's file-level guard** - it is the literal reading of the one explicit sentence. The residual doubt is Example 2 (file-level `HLPRTN` + file-level `HLPRCD` valid); only a real compile settles it (below).
3. **I-67** (the help-specification form of `HLPDOC`) should add no `HLPRTN` check. It only needs the exclusions that exist at that level: `HLPBDY` (same H spec) and `HLPPNLGRP`. `HLPPNLGRP`'s statement is file-wide, so decide there whether an H-spec `HLPDOC` also conflicts with a *file-level* `HLPPNLGRP` and with an H-spec `HLPPNLGRP` elsewhere in the file.
4. A soft warning for an **unoptioned** `HLPRTN` on a file or record that has H specifications would be a separate, optional feature (IBM only warns on it). Not opened as a task.

**To settle it for good - a compile experiment** for anyone with IBM i access: create each member below as a `QDDSSRC` source member and run `CRTDSPF FILE(QTEMP/HLPTn) SRCFILE(...) SRCMBR(HLPTn)`; the job log says whether each is accepted, warned, or rejected. If HLPT1 compiles cleanly, I-38 / I-68's file-level guard should be relaxed; if HLPT2 - HLPT3 are rejected, the cross-level guard becomes worth building, with the exact message text to match. (Column alignment was checked against iSDA's own parser: each keyword lands at the intended level.)

- **HLPT1** - file-level `HLPDOC` + file-level `HLPRTN(01)`: the pair I-38 / I-68 block. If `CRTDSPF` accepts it, those two guards are false positives.

```
     A                                      HELP
     A                                      HLPDOC(START GENERAL.HLP HELP.F1)
     A                                      HLPRTN(01 'Return')
     A          R REC1
     A                                  1  2'Test'
```

- **HLPT2** - file-level `HLPDOC` + record-level `HLPRTN` with option indicator 01: the cross-level case iSDA currently lets through. Expected valid (the `HLPRTN` "takes priority" wording; Example 1's file-level `HLPRCD` + record-level `HLPRTN`).

```
     A                                      HELP
     A                                      HLPDOC(START GENERAL.HLP HELP.F1)
     A          R REC1
     A 01                                   HLPRTN
     A                                  1  2'Test'
```

- **HLPT3** - help-specification-level `HLPDOC` + record-level `HLPRTN` with option indicator 01: the documented use of an optioned `HLPRTN` ("the H specifications are used if the option indicator is off"). Expected valid.

```
     A                                      HELP
     A          R REC1
     A 01                                   HLPRTN
     A          H                           HLPARA(1 2 1 10)
     A                                      HLPDOC(LBL1 HELP#1 HELP.F1)
     A                                  1  2'Test'
```

- **HLPT4** - the same as HLPT3 but with an **unoptioned** `HLPRTN`: IBM documents a *warning* at creation time for an unoptioned `HLPRTN` on a record containing H specifications. Expected: created, with a warning.

```
     A                                      HELP
     A          R REC1
     A                                      HLPRTN
     A          H                           HLPARA(1 2 1 10)
     A                                      HLPDOC(LBL1 HELP#1 HELP.F1)
     A                                  1  2'Test'
```

No code was changed for this task.

*Raised by I-68. Size (estimate): Small (research; may be inconclusive).*

---

<a id="i-91"></a>

### I-91 — `MSGID`: exclusion of `DFT`, `DFTVAL`, `FLTFIXDEC` and `FLTPCN` on the same field

> **Area:** Field · **Status:** Done (v0.10.160) · **Depends on:** I-73

Found while probing for I-73. `MSGID`'s DDS Reference entry lists five keywords that "cannot be specified on a field with the MSGID keyword": `DFT`, `DFTVAL`, `FLTFIXDEC`, `FLTPCN` and `MSGCON`. `MSGCON` is only reachable on constants, which cannot carry `MSGID` (usage `B`/`O` fields only), so it is out of practical reach. The other four are not enforced in either direction: probing the real panel, ticking `DFT` on a field that already has `MSGID` writes both with no alert. Guard both directions (adding `DFT`/`DFTVAL`/`FLTFIXDEC`/`FLTPCN` to a field with `MSGID`, and adding `MSGID` to a field carrying any of them), following I-41's `HTML` pattern (`htmlConflictReason` plus I-83's `withAddGuard`). Re-read the `MSGID` section first and check whether `DFTVAL` and `FLTPCN` are offered by any structured editor at all before wiring them.

**Fixed.** Re-read the `MSGID` section of `DDS_Keyword_V7r6.txt`: "The following keywords cannot be specified on a field with the MSGID keyword: DFT, DFTVAL, FLTFIXDEC, FLTPCN, MSGCON." None of the five takes a parameter qualifier, so any use is excluded (a plain name set, not I-71's token list). `MSGCON` is only reachable on constants, which cannot carry `MSGID`, but it is on IBM's list and costs nothing to include. `MSGID` may be specified several times on a field; one of them is enough to exclude.

*Whether `DFTVAL`/`FLTPCN` are offered by a structured editor* (the task's own check): yes - `DFT` and `DFTVAL` both have General rows, and `FLTFIXDEC` and `FLTPCN` have float-only General rows (I-39), so all four are wired, not just `DFT`.

Two functions in `dspfWriter.js`, in the shape of I-71's `IGCALTTYP` pair and `htmlConflictReason`:
- `msgidExclusionConflictReason(name, fieldKeywords)` - the add-time check for **both** directions (adding `MSGID` to a field that carries an excluded keyword; adding an excluded keyword to a field that carries `MSGID`), with a different message for each. Wired to the raw keyword editor's "+ Add keyword" and to the General rows' catch-all add guard (I-83's `withAddGuard`).
- `msgidExclusionNewConflictReason(oldKeywords, newKeywords)` - a **diff-based backstop** at `commitEdit`, straight after I-71's check, covering every other panel that writes keywords, the Message ID panel itself included. If `MSGID` is introduced by the edit, any excluded keyword now on the field counts; if it was already there, only an excluded keyword the edit *added* counts. A hand-written field that was already invalid is not re-reported on unrelated edits (including editing its `MSGID` in place), and removing either keyword is always allowed. `ERRMSGID`, `SFLMSGID` and `CHKMSGID` are different keywords and are matched by exact name, so they are unaffected.

New `i91MsgidExclusionGuard.test.js` (81 checks: unit checks on both functions, then the real generated script in jsdom through the raw editor, the General rows' `DFT`/`DFTVAL` checkboxes, the Message ID panel's "+ Add message ID", and a pre-existing invalid field). Confirmed via `git stash` to fail (45 checks) against pre-fix code. The float-only rows (`FLTFIXDEC`, `FLTPCN`) are covered by the unit and raw-editor checks rather than a General-row click-through. Full suite: 115 test files run in parallel, zero failures.

*Raised by I-73. Size (estimate): Small.*

---

<a id="i-92"></a>

### I-92 — `MSGID`: not valid on a field of a subfile (`SFL`) record

> **Area:** Field · **Status:** Done (v0.10.164) · **Depends on:** I-73

Found while probing for I-73. `MSGID`'s entry says "You cannot specify MSGID in a subfile record format (SFL keyword)." The Message ID accordion is offered for output-capable fields of an `SFL` record (confirmed by probe: a usage `O` field under an `SFL` record renders the instances list and its "+ Add message ID" button), and nothing blocks adding one. Either hide the accordion for fields of an `SFL` record, or guard the add, the same way I-56/I-46 treat other record-shape rules; a hand-edited field that already carries `MSGID` must remain removable. Check `SFLCTL` (its own fields are not subfile detail fields) before deciding what "an SFL record" means here.

**Fixed.** Re-read the `MSGID` section: "You cannot specify MSGID in a subfile record format (SFL keyword)." Record-level, so the checks take the *record's* keywords (same shape as `htmlConflictReason`'s `SFL` branch, I-41). It names the `SFL` record only: `SFLCTL` is the subfile *control* record, an ordinary display record whose fields are not subfile detail fields, so it is deliberately not covered (asserted by the test).

Three layers, in `dspfWriter.js` and the webview:
- **The panel.** The Message ID accordion is no longer rendered for a field of an `SFL` record. If the field already carries `MSGID` (hand-edited), it is rendered anyway with a note ("... Remove it.") so the keyword can be seen and removed, which is always allowed. `messageIdInstancesHtml` gained an optional 4th parameter for the note.
- **Add-time checks.** `msgidExclusionConflictReason` (I-91) gained an optional third argument, the record's keywords: adding `MSGID` on an `SFL` record returns the new reason, and it takes precedence over I-91's own `DFT`/... reason. Wired into the raw keyword editor's "+ Add keyword" and the General rows' catch-all guard (which pass `found.record.keywords`). With the argument omitted the function behaves exactly as under I-91.
- **The `commitEdit` choke point.** New `msgidSflNewConflictReason(oldKeywords, newKeywords, recordKeywords)` blocks an edit that leaves the field with *more* `MSGID` keywords than before, on an `SFL` record. That is what catches the panel's own "+ Add message ID" (which the add-time check never sees). A count comparison rather than "introduced" so that adding a *second* `MSGID` to an already-invalid hand-edited field is also blocked; editing one in place, removing one, and unrelated edits to that field are not.

New `i92MsgidSflRecordGuard.test.js` (45 checks: the pure functions incl. `SFLCTL`/plain/undefined records, `CHKMSGID`/`ERRMSGID`/`SFLMSGID` not mistaken for `MSGID`, and I-91's behaviour unchanged; then the real generated script in jsdom: `SFL` field has no panel, hand-edited `SFL` field shows the note and can be removed but not extended, the raw editor is blocked, and `SFLCTL` and plain records are unaffected). Confirmed against pre-fix code by `git stash`: with only the wiring stashed 8 checks fail; with everything stashed it fails outright. Wired into `npm test`.

*Raised by I-73. Size (estimate): Small.*

---

<a id="i-93"></a>

### I-93 — `ENTFLDATR`: gate the add-guard on the real transition (refuses a legitimate edit on an `SFL`/`MNUBAR`/`USRDFN` record)

> **Area:** Record · **Status:** Done (v0.10.162) · **Depends on:** I-84

Found while fixing I-84. The same "box is ticked, so it must be an addition" flaw I-84 fixed for `RTNCSRLOC` exists in `ENTFLDATR`'s guard (I-53/I-54/I-60: the `addGuardFn` in `wireEntFldAtrEditor`, which fires whenever the checkbox is ticked at Apply). Confirmed by probe on the record-level panel: on an `SFL`, `MNUBAR` or `USRDFN` record that already carries a hand-edited `ENTFLDATR`, changing its colour and pressing Apply is refused with "ENTFLDATR cannot be *added* to …" and the keyword is left unchanged, while un-ticking it works and a plain record edits normally. Same fix shape as I-84: gate on the real transition (the keyword was not already present) rather than on the checkbox state.

**Fixed.** Reproduced first in jsdom on all three record types (`SFL`, `MNUBAR`, `USRDFN`): with a hand-edited `ENTFLDATR((*COLOR RED))` on the record, changing the colour to BLU and pressing Apply raised "ENTFLDATR cannot be added to …" and left RED in place. Cause: `wireEntFldAtrEditor`'s Apply handler ran `addGuardFn('ENTFLDATR')` whenever the box was ticked (`on && addGuardFn`), and the three whitelist checks it is wired to (I-53/I-54/I-60) are pure record-type checks with no notion of "already present".

Fix, in the shared `wireEntFldAtrEditor` only: the guard now runs on the real transition - the box is ticked **and** `getChoiceColorState(getKeywords(), 'ENTFLDATR').present` is false. Same diff-based posture as I-84/I-58: only an Apply that *introduces* `ENTFLDATR` is checked; editing an existing one is not an addition, and a record that was already invalid is never re-reported. Removing it (box unticked) was never guarded and is unchanged, and adding it to an `SFL`/`MNUBAR`/`USRDFN` record without one is still blocked with the same alert. No call-site changes: the file-level panel passes no guard and the field-level call passes none, so neither is affected.

New `i93EntfldatrOnTransitionOnly.test.js` (42 checks, same lightweight jsdom harness as I-84's test): for each of `SFL`/`MNUBAR`/`USRDFN`, changing the colour of a hand-edited `ENTFLDATR` (no alert, keyword updated, exactly one), un-ticking it (removed, record type kept), and adding it to a record without one (still blocked, alert names `ENTFLDATR` and the record type, nothing added); plus a plain record adding, editing and removing it. Confirmed to fail (6 checks) against the pre-fix `webviewClientHelpers.js`.

*Raised by I-84. Size (estimate): Small.*

---

<a id="i-94"></a>

### I-94 — `IGCALTTYP`: eligibility (usage `B` only, keyboard shift type, not DBCS)

> **Area:** Field · **Status:** Done (v0.10.172) · **Depends on:** I-71

Found while fixing I-71. `IGCALTTYP` eligibility (same DDS section, first rule): "Specify this keyword only for input- and output-capable fields whose keyboard shift type is A, N, X, W, or I. Do not specify this keyword for DBCS fields." (and the DBCS chapter: not on DBCS-graphic fields, `G` in position 35). The General row's `IGCALTTYP` entry has no usage or data-type gating today, so it is offered on output-only / input-only fields and on `J`/`E`/`O`/`G` fields. Expect the WRDWRAP-style usage + shift-type gating (I-42 / I-61), with usage `B` only.

**Implemented.** Re-read `IGCALTTYP`'s section first: "Specify this keyword only for input- and output-capable fields whose keyboard shift type is A, N, X, W, or I. Do not specify this keyword for DBCS fields", plus the DBCS chapter's "Do not use the IGCALTTYP, IGCANKCNV, CHECK(LC), and LOWER keywords on DBCS-graphic fields (G specified in position 35)". The keyword's opening sentence says what it does (it changes "alphanumeric character fields that are capable of input and output to DBCS fields with data type O"), which is why the allowed set is the five character shifts rather than "anything but DBCS". I-71 covered its keyword-vs-keyword exclusions and I-95 its no-option-indicators rule; nothing covered *where* it may be used. The filing's premise was right: the General row was offered on output-only / input-only / hidden fields and on `J`/`E`/`O`/`G` and numeric ones, and the raw editor accepted it anywhere.

Two rules, built like I-70's `CHRID` eligibility (the four routes, all diff-based):
- **Usage `B` only** (not `I`, `O`, `H`, `M`, `P`), and **not a constant** (it has no usage at all).
- **Data type / keyboard shift `A`, `N`, `X`, `W` or `I`.** Everything else is refused: the DBCS types `J`/`E`/`O`/`G` the text names, and also the numeric/date/time ones (`S`, `Y`, `D`, `M`, `P`, `B`, `F`, `L`, `T`, `Z`), since it converts *alphanumeric character* fields. A blank usage or data type is "not yet set" and fails open, as for `WRDWRAP` (I-61), where a blank data type is the DDS default `A`.

In `dspfWriter.js`: `igcalttypEligibilityReason(usage, dataType, isConstant)` (with `igcalttypUsageReason`/`igcalttypDataTypeReason`), `igcalttypBasicEditConflictReason(fieldKeywords, field, updates)`, and two existing I-71 functions gained an optional trailing field-kind argument (`igcalttypConflictReason`, `igcalttypNewConflictReason`; omitted, they behave exactly as under I-71). Routes:
- **General row:** hidden on an ineligible field **unless `IGCALTTYP` is already there** (same choice as I-70, so a hand-written invalid field keeps a ticked checkbox that can be un-ticked); `igcalttypRowHidden` is shared by `generalFieldKeywordsHtml` and `wireGeneralFieldKeywordsEditor`.
- **Add guards:** the raw keyword editor's "+ Add keyword" and the General rows' catch-all guard (I-83) pass the field's usage, data type and constant-ness.
- **`commitEdit` choke point:** an edit that *introduces* `IGCALTTYP` is judged on the field's kind as it will be after the edit; one already present is not re-reported.
- **Basic tab Apply:** a usage change to anything but `B` (blank counts as `O` on both sides, like `WRDWRAP`), or a data type change outside A/N/X/W/I, on a field that already carries it is refused with "Remove IGCALTTYP first", as an early return so the panel keeps the user's other pending edits. Changing to a valid value, and unrelated edits on an already-invalid field, are never blocked.
- **Resolve Referenced Field (I-88):** `referencedFieldResolveConflictReason` composes the new check, in the same relative position as the Basic tab, so a resolve cannot give an `IGCALTTYP` field a type the Basic tab would refuse. A resolved character field (blank over `A`) is not a change.

Three existing tests asserted the old ungated behaviour and were updated to the new rule, keeping each one's intent: `dspfWebview.test.js` (the constant-vs-named scenario's `NAMEFLD` was usage `I`; now `B`), `i35UsageMpFailOpenAudit.test.js` (the "usage O still shows every row" list no longer includes `IGCALTTYP`, with explicit absent-for-`O` / present-for-`B` checks), and `i70ChridEligibilityGuard.test.js` (its "siblings unaffected on a hidden field" check no longer expects `IGCALTTYP`, which is now hidden there by its own rule).

New `i94IgcalttypEligibility.test.js` (91 checks): the eligibility matrix (every usage and data type), both add guards with and without the field kind, the choke-point diff, the Basic-tab diff (every direction, incl. fixing a field and changing between two invalid values) and the I-88 composition; then the real generated webview in jsdom on ten fields (eligible; usage `O` / `I`; numeric; already valid; two hand-written invalid ones; plain; a literal constant): row visibility, the raw editor, the Basic tab, and un-ticking on an ineligible field. Confirmed against pre-fix code by `git stash`: with only the wiring stashed 9 checks fail; with everything stashed it fails outright. Wired into `npm test`.

Not covered: hidden (`H`) fields are only reachable through the Hidden tab, so the usage-`H` case is asserted in the pure functions and through the row-visibility helper, not through the webview. The Basic tab's data type dropdown does not offer `W`/`J`/`E`/`O`/`G`, so those can only arrive by hand-written DDS (covered by the pure functions).

*Raised by I-71. Size (estimate): Small–medium.*

---

<a id="i-95"></a>

### I-95 — `IGCALTTYP`: option indicators are not allowed (raw editor's Conditioning toggle)

> **Area:** Field · **Status:** Done (v0.10.170) · **Depends on:** I-71

**Fixed.** Found while fixing I-71. `IGCALTTYP`'s section in `DDS_Keyword_V7r6.txt` says it twice: "Option indicators are not allowed with IGCALTTYP." and, in the rules list, "Option indicators are not allowed with this keyword." I-30 made the General row non-conditionable, but the raw keyword editor's per-keyword *Conditioning* toggle was not gated by keyword, so an indicator could still be put on a raw-added `IGCALTTYP`, and a hand-written one carrying an indicator was never flagged.

The filing asked to check first whether a generic "no option indicators" keyword list already existed. None did: the panels' per-row `conditionable` flags only cover the structured rows (I-70's own comment says the option-indicator side of `CHRID` "was already handled by I-30", i.e. by the General row alone). `keywordEditorHtml` draws the toggle on **every** chip whatever its name, and that one component is shared by the file, field, record and help-entry levels, so fixing it there covers all four.

Fix: a generic `NO_OPTION_INDICATOR_KEYWORDS` table in `dspfWriter.js` (name to message), and three functions over it - `noOptionIndicatorsReason(name)`, `optionIndicatorCount(conditions)` and the diff-based `noOptionIndicatorsNewConflictReason(name, oldConditions, newConditions)`. The raw editor uses them three ways: a listed keyword with no indicators gets **no Conditioning toggle** at all (a small "No option indicators" note instead); a listed keyword that already carries indicators (hand-written) **keeps its toggle so they can be removed and shows a warning**; and adding an indicator to one is **refused with an alert** and the panel re-rendered. Diff-based, like I-58, I-61, I-62, I-72 and I-81: only an edit that *adds* indicators is blocked, removing them is always allowed, and a display-size condition (`*DS3`/`*DS4`) is not an option indicator and does not count. Unlisted keywords are untouched. Adding or removing the `IGCALTTYP` keyword itself works as before.

Why the table is seeded with `IGCALTTYP` alone: scanning the reference finds **93** keyword sections carrying an "Option indicators are not valid/allowed" sentence, so the same hole exists for the rest, but that sentence is sometimes conditional (`MSGID` allows indicators except on the last one, I-73; `CHECK` only for some codes, I-30), so the table cannot be filled mechanically. Each keyword has to be read first; see Deferred findings. The table's own comment says so.

New `i95IgcalttypNoOptionIndicators.test.js` (62 checks): pure unit checks of the table and the diff-based function (adding a first / a second / an OR-group indicator, NOT, removal, no change, unlisted keywords, display-size conditions, null-safety); the exported raw-editor helpers in a plain jsdom document (no toggle and a note on a listed keyword, the toggle kept and a warning on a hand-written one, adding blocked with an alert and nothing committed, removing allowed and the toggle disappearing again, `DUP` unaffected, adding and removing the keyword itself); and the real generated designer in jsdom (a field `IGCALTTYP`, a `DUP` field, and a hand-written `IGCALTTYP` conditioned by indicator 01). Confirmed via `git stash` to fail (23 checks) against pre-fix code. Full suite: 7272/7272 assertions, zero failures, rebased across I-87, I-89, I-90, I-96 and I-97 while in progress.

Not addressed here: the other ~92 keywords - see Deferred findings.

---

<a id="i-96"></a>

### I-96 — Input keywords panel: `DUP` checkbox still offered on a floating-point field (cosmetic)

> **Area:** Field · **Status:** Done (v0.10.165) · **Depends on:** I-72

Found while fixing I-72. The Input keywords panel still offers the `DUP` checkbox on a floating-point field (ticking it is refused with an alert). Hiding it needs a data-type argument on `inputKeywordsHtml`/`wireInputKeywordsEditor` (neither takes one) and a decision about a hand-written float field that already has `DUP`: `generalFieldKeywordsHtml`'s `dtScope` gating hides a mismatching row even when the keyword is present, which would make it impossible to un-tick in the panel. Cosmetic - the block is already enforced.

**Fixed.** The Input keywords panel now takes the field's data type and does not offer the `DUP` row on a floating-point field (`DUP`: "You cannot specify the DUP keyword on a floating-point field (F in position 35)"). `BLANKS`, `CHANGE` and `CHGINPDFT` are unaffected. It is presentation only: I-72's hard block (`dupFloatNewConflictReason`) is unchanged and still covers the raw editor and the Basic tab.

The open question in the filing was a hand-written float field that already has `DUP`, where a `dtScope`-style hidden row would make it impossible to un-tick in the panel. Resolved by hiding the row **only when the field does not already carry `DUP`**: on such a field the ticked row stays, with a `hint-small warn` note ("DUP cannot be specified on a floating-point field (per the DDS Reference). Untick it, or change the data type."), so it can still be cleared; once cleared, the row is not offered again (asserted). Blank or unknown data type keeps the row, as for a field still being drafted.

- `dspfWriter.js`: `dupCheckboxOffered(dataType, keywords)` and `dupFloatFieldNote(dataType, keywords)` (pure, normalising the data type the same way I-72's check does), exported.
- `webviewClientHelpers.js`: `inputKeywordsHtml` and `wireInputKeywordsEditor` gained an optional trailing `dataType` parameter (the filing's "neither takes one"); with it omitted they behave as before. The `DUP` row is skipped in both when not offered, so a stale open-Conditioning key for it never tries to wire a row that is not there.
- `buildWebviewTemplate.js`: both call sites pass `field.dataType`. Changing the data type on the Basic tab re-renders the panel, so the row disappears on `F` and comes back on the way back to `A` (asserted).

I-72's own test asserted the checkbox *exists* on its float field and ticked it; those two spots were adapted (the checkbox is now asserted absent, and the "blocked again once floating-point" step goes through the raw editor instead). Its check count is unchanged (62). New `i96DupCheckboxFloatField.test.js` (41 checks: the pure functions, then the real generated webview in jsdom on float / character / hand-written float + `DUP` fields, the Basic tab round trip and I-72's raw-editor block). Confirmed against pre-fix code by `git stash`: with only the wiring stashed 4 checks fail; with everything stashed it fails outright. Wired into `npm test`.

*Raised by I-72. Size (estimate): Small (cosmetic).*

---

<a id="i-97"></a>

### I-97 — `ERRMSGID` / `SFLMSGID`: validate the `&msg-data` parameter (same rule as `CHKMSGID`'s)

> **Area:** Field / Record · **Status:** Done (v0.10.169) · **Depends on:** I-89

Opened from I-89's deferred finding. `ERRMSGID`'s and `SFLMSGID`'s DDS Reference sections carry the same sentence as `CHKMSGID`'s: "The field must exist in the record format, and the field must be defined as a character field (data type A) with usage P." Their panels took any text there and nothing checked it.

**Done.** Same posture and scope as I-89 - checked on the way in, diff-based, fail-open when the record's field list is absent - with the helper generalised rather than copied:

- `DspfWriter.messageDataFieldProblem(keywordName, name, recordFields)` is I-89's field check with the keyword name in the message; `chkmsgidMsgDataFieldProblem` is now a one-line wrapper, so I-89's messages and 63 checks are unchanged.
- Both keywords share `msgid [library-name/]msg-file [response-indicator] [&msg-data]`, and a msg-data token always starts with `&` (the other optional token is a bare number), so `messageIdMsgDataNames(keywords, keywordName)` reads the names straight off the raw parameters of every instance. `messageIdMsgDataNewConflictReason` blocks an edit that adds a name that was not already one of that keyword's names; `messageIdMsgDataAddReason` is the raw editor's add guard.
- **ERRMSGID (field level):** the panel's `&field` box (`wireErrorMessageInstances` takes the record's fields as an optional trailing parameter; a refusal alerts and puts the box back to its saved value), the field raw editor's add guard, and the `commitEdit` choke point. "The record format" is the field's own record.
- **SFLMSGID (record level, on the subfile-control record):** the record raw editor's add guard (its guard now receives `(name, params)`) and the `commitRecordEdit` choke point, both against the control record's own fields - a field that exists only in the subfile record or another record is refused (tested). The SFLMSGID panel has no `&msg-data` input, so the raw editor is the only way to enter one (see Deferred findings for that panel's grammar problem).
- **Not enforced on the way the named field changes underneath it**, for the reason recorded in I-89: usage-`P` fields cannot be selected in the designer.

New `i97ErrmsgidSflmsgidDataFieldValidation.test.js` (70 checks): the shared check for all three keywords, the name reader (response-indicator token skipped, several instances, the first two tokens never taken for names), the diff (unchanged/bad, bad-to-bad, bad-to-valid, cleared, second instance), the raw add check, and the real webview (ERRMSGID box valid / case-insensitive / missing / usage O / the field itself / hand-written bad name unchanged, changed and cleared; field raw editor; record raw editor on `SFLCTL` including "exists only in another record" and an unrelated add on a record whose hand-written `SFLMSGID` is bad). Confirmed to fail (11 checks) with the webview wiring reverted, and to *still* pass with the panel and raw-editor guards removed, i.e. the two choke points enforce the rule on their own.

*Raised by I-89. Size (estimate): Small–medium.*

---

<a id="i-98"></a>

### I-98 — SFLMSG record's General panel: no option-indicator Conditioning on `LOGINP` and `CHECK(AB)`/`CHECK(RL)`

> **Area:** Record · **Status:** Done (v0.10.174) · **Depends on:** I-9, I-76

Opened from I-76's deferred finding. `sflMsgPanelsHtml` / `wireSflMsgPanels` (the SFLMSG record's General tab) still offers a Conditioning toggle on `LOGINP` and `CHECK(AB)`/`CHECK(RL)` (`sm-loginp`, `sm-check-ab`, `sm-check-rl` pass `.conditions` into `flagRowHtml` and wire it through `wireFlagRow`). The SFL panel (`sflKeywordsPanelsHtml`) has not offered them since I-9: `LOGINP`'s DDS Reference section says "Option indicators are not valid for this keyword", and option indicators on `CHECK` are valid only for `CHECK(ER)` and `CHECK(ME)` (I-3, I-9). I-11 checked SFLMSG's keyword *set* against I-9's but not its conditioning. Fix shape: drop the conditioning arguments on those three rows the same way I-9 did, plus a diff-based guard for a hand-edited record that already carries one, as I-95 did. (The panel's own live `CHGINPDFT` row is R3's deliberate leftover, not part of this task.)

**Done.** `sflMsgPanelsHtml` renders `sm-loginp`, `sm-check-ab` and `sm-check-rl` with no `conditions`/`expandedSet`, and `wireSflMsgPanels` wires them without a Conditioning toggle - `simple()` gained the same optional `noConditioning` argument the SFL panel's copy has, used for `LOGINP`; the two `CHECK` rows drop their trailing arguments. `SFLNXTCHG` and `LOGOUT` keep theirs (I-9 kept them on the SFL panel too), and `CHGINPDFT` already had none (I-3).

**Not done, on purpose:** no diff-based guard for a hand-edited record. I-9 did not add one to the SFL panel either, and it would only matter through the raw keyword editor, which is I-95's scope (its scan already lists `LOGINP` and `CHECK`). Because the rows are wired with no conditions, `setFileFlagKeyword`'s preserve-existing-conditioning behaviour leaves an indicator on a hand-edited `LOGINP`/`CHECK(AB)` alone when another row is edited, and ticking either box off still removes the keyword - both asserted.

New `src/test/i98SflmsgGeneralConditioning.test.js` (19 checks, run in jsdom against the real generated webview): no toggle on `sm-loginp`/`sm-check-ab`/`sm-check-rl`, `sm-sflnxtchg`/`sm-logout` still have theirs, the three rows still commit as plain checkboxes with no indicators written, and a hand-edited record carrying `LOGINP`/`CHECK(AB)` with indicators keeps them across an unrelated edit. Confirmed to fail against the pre-fix code (4 checks). Wired into `npm test`.

*Raised by I-76. Size (estimate): Small.*

---

<a id="i-99"></a>

### I-99 — `SFLMSGID` panel reads and writes the wrong grammar

> **Area:** Record · **Status:** Done (v0.10.175) · **Depends on:** I-97

Opened from I-97's deferred finding, verbatim:

The record-level **SFLMSGID panel reads and writes the wrong grammar** (found while checking how `&msg-data` could reach it). IBM's format is `SFLMSGID(msgid [library-name/]msg-file [response-indicator] [&msg-data])`, but `parseSflMsgIdParams`/`formatSflMsgIdParams` treat the *third space-separated token* as the library and write it that way (`A F QGPL`), where a bare third token is a response indicator - so a library entered in the panel produces invalid DDS. Reading goes wrong the other way: hand-written `SFLMSGID(USR1234 QGPL/USRMSGS 30 &FLD)` shows message file `QGPL/USRMSGS` and library `30`, and changing the message id in the panel rewrites it as `NEW0001 QGPL/USRMSGS 30`, silently **dropping `&FLD`**. Probed with the two functions directly. The panel also has no response-indicator or `&msg-data` input. ERRMSGID's own parser (`getErrorMessageInstances`) already does this correctly and is the model to copy.

**Done.** IBM's grammar (DDS Reference, SFLMSGID keyword) is `SFLMSGID(msgid [library-name/]msg-file [response-indicator] [&msg-data])`: the library is the slash-qualifier of the *second* token, a bare numeric token after it is the response indicator, a `&`-prefixed one the message data field.

- `DspfWriter.parseSflMsgIdParams` now reads that (ERRMSGID's `getErrorMessageInstances` was the model) and returns `{ msgId, msgFile, library, responseIndicator, msgDataField }`. `formatSflMsgIdParams` writes it: `msgid [library/]file [indicator] [&data]`, adds a missing `&`, and never stacks a typed `LIB/FILE` on top of a separate library.
- **Files written by earlier versions are repaired, not lost:** a bare non-numeric, non-`&` third token (`MSGID MSGF QGPL`, what the old panel wrote) still appears in the library box when the message file has no qualifier of its own, so the next edit through the panel rewrites it as `MSGID QGPL/MSGF`.
- The panel gained the two missing inputs, **response indicator** and **&message data field**. A response indicator must be two digits 01-99 (`DspfWriter.sflMsgIdResponseIndicatorProblem`); anything else alerts, puts the box back and posts no edit. The `&msg-data` box needs no check of its own: it goes through I-97's `commitRecordEdit` choke point, which refuses a name that is not a character (A) usage-P field of the control record (asserted). The panel's old "Ind/Name columns not modeled" hint and the matching comment in `dspfWriter.js` are gone.
- The reported symptom is fixed at both ends: hand-written `SFLMSGID(USR1234 QGPL/USRMSGS 30 &FLD)` now fills message file `USRMSGS`, library `QGPL`, indicator `30`, data field `&FLD`, and changing only the message id rewrites it as `NEW0001 QGPL/USRMSGS 30 &FLD` with nothing dropped.

Existing `dspfWebview.test.js` had one check asserting the old wrong output (`MSG0001 MYMSGF MYLIB`); it now asserts `MSG0001 MYLIB/MYMSGF`. New `src/test/i99SflmsgidGrammar.test.js` (74 checks): the pure functions (IBM's shapes, the finding's exact string, legacy repair, round trip for eight shapes, the indicator check, agreement with I-97's `&msg-data` reader), then the real generated webview in jsdom (all five boxes read from a hand-written keyword; message id change keeps the rest; a library is written as `LIB/FILE`; indicator written, refused and reverted; `&msg-data` accepted, refused for a missing and for a non-P field; all five together read back the same; a legacy file repaired on the next edit; "+ Add" still seeds a valid placeholder). Confirmed to fail against the pre-fix code (20 checks, then a crash on the missing function). Wired into `npm test`.

*Raised by I-97. Size (estimate): Small–medium.*

---

<a id="i-100"></a>

### I-100 — `SFLMSG` panel drops a hand-written response indicator when its text is edited

> **Area:** Record · **Status:** Done (v0.10.176) · **Depends on:** I-99

Opened from I-99's deferred finding (the one call-site correction: the text box is wired only in `wireSflCtlPanels`, on the subfile-control record's Subfile Messages panel):

The **SFLMSG panel drops a hand-written response indicator on edit**, same failure shape as I-99's SFLMSGID one. `SFLMSG('message-text' [response-indicator])` is the documented form, but the panel's text box is wired as `updatePayload({ parameters: quoteDdsLiteral(input.value) })` (`wireSflCtlPanels`' SFLMSG instances - the Subfile Messages panel of the subfile-control record; `SFLMSG` is not on the message-subfile record type's own tab), so editing the text of `SFLMSG('No records' 30)` rewrites it as `SFLMSG('new text')`. Reading is fine (`unquoteDdsLiteral` takes the quoted part) and probed directly; the panel has no response-indicator input at all. ERRMSG's row in `getErrorMessageInstances`/`setErrorMessageInstances` already carries `responseIndicator` and is the model. Fix shape: same as I-99 - a `parseSflMsgParams`/`formatSflMsgParams` pair plus a response-indicator box using `sflMsgIdResponseIndicatorProblem`, and a test that editing the text keeps a hand-written indicator. Size (estimate): Small.

**Done.** IBM's format is `SFLMSG('message-text' [response-indicator])`, the same shape as `ERRMSG`'s.

- New `DspfWriter.parseSflMsgParams` (read the way `getErrorMessageInstances` reads `ERRMSG`: quoted text with `''` undone, then an optional bare number; a number inside the text stays text) and `formatSflMsgParams` (`'text' [indicator]`). With no indicator the output is byte-for-byte what `quoteDdsLiteral` alone produced before, so existing files do not change. Blank text still gives an empty payload, exactly as before (a bare `SFLMSG` from a blanked box is a pre-existing wart, left alone).
- The Subfile Messages panel's `SFLMSG` row gained a **response indicator** box (`-resp`), and the text and indicator commit together, so editing either keeps the other: `SFLMSG('No records' 30)` with the text changed is now `'New text' 30`. An indicator that is not two digits 01-99 alerts (naming `SFLMSG`), puts the box back and posts no edit.
- I-99's check is generalised to `messageResponseIndicatorProblem(keywordName, value)`; `sflMsgIdResponseIndicatorProblem` is now a one-line wrapper over it, so `SFLMSGID`'s behaviour and message are unchanged. The panel hint now says a response indicator applies to both keywords.
- One correction to the finding as filed: the text box is wired only in `wireSflCtlPanels`. `wireSflMsgPanels` (the message-subfile record type's own tab) has no `SFLMSG` box.

New `src/test/i100SflmsgResponseIndicator.test.js` (47 checks): the pure functions (the finding's string, a doubled quote, a number inside the text, ERRMSG agreement, byte-for-byte parity with `quoteDdsLiteral` when there is no indicator, round trip, the generalised check), then the real generated webview in jsdom (both boxes read from a hand-written keyword, a text edit keeps the indicator, the indicator changed / cleared / refused and reverted, an apostrophe, two independent instances, an indicator-free file unchanged, "+ Add" then an indicator). Confirmed to fail against the pre-fix code (a crash on the missing functions; run alone, the webview half fails on the reported data loss). Wired into `npm test`.

*Raised by I-99. Size (estimate): Small.*

---

<a id="i-101"></a>

### I-101 — Raw keyword editor: option-indicator guard for the other ~92 keywords the DDS Reference says take none

> **Area:** Tooling / all levels (file, record, field, help entry) · **Status:** Done (v0.10.197; batches at v0.10.180, .195, .196, .197) · **Depends on:** I-95

Opened from I-95's deferred finding, verbatim:

The raw keyword editor's Conditioning toggle is guarded for `IGCALTTYP` only (`NO_OPTION_INDICATOR_KEYWORDS`, seeded with that one keyword). Scanning `DDS_Keyword_V7r6.txt` finds **93** keyword sections with an "Option indicators are not valid/allowed" sentence, so the same hole exists for the other ~92: **81** worded plainly (ALIAS, ALTHELP, ALTNAME, ALWROL, ASSUME, BLANKS, BLKFOLD, CHANGE, CHCACCEL, CHCCTL, CHECK, CHGINPDFT, CHKMSGID, CLRL, CNTFLD, COMP, DLTCHK, DLTEDT, DSPRL, DSPSIZ, EDTCDE, EDTWRD, ERRSFL, FLDCSRPRG, FLTFIXDEC, GETRETAIN, GRDCLR, HLPARA, HLPCMDKEY, HLPFULL, HLPID, HLPSCHIDX, HLPTITLE, HOME, INDARA, INDTXT, INZRCD, LOGINP, MLTCHCFLD, MSGCON, MSGID, MSGLOC, OPENPRT, PASSRCD, PSHBTNFLD, PULLDOWN, RANGE, REF, REFFLD, RTNCSRLOC, RTNDTA, SETOF, SFL, SFLCHCCTL, SFLCSRPRG, SFLCTL, SFLENTER, SFLLIN, SFLMLTCHC, SFLMODE, SFLMSGKEY, SFLMSGRCD, SFLPAG, SFLRCDNBR, SFLRNA, SFLROLVAL, SFLRTNSEL, SFLSCROLL, SFLSIZ, SFLSNGCHC, SLNO, SNGCHCFLD, TEXT, USRDFN, USRDSPMGT, VALNUM, VALUES, VLDCMDKEY, WDWTITLE, WRDWRAP) and **12** worded "...although option indicators can be used to condition the field" (CHOICE, DATE, DATFMT, DATSEP, DFT, EDTMSK, MAPVAL, SYSNAME, TIME, TIMFMT, TIMSEP, USER). These lists are a *starting point extracted by a scan, not verified per keyword*: the sentence is sometimes conditional (`MSGID` allows indicators except on the last one, I-73; `CHECK` only for some codes, I-30), and several of these keywords are legitimately conditioned by iSDA's own structured editors, so each one has to be read, and checked against the panel that conditions it, before it goes into the table. Size (estimate): Large - an audit, best done in batches by level.

**Where the code stands.** `DspfWriter.NO_OPTION_INDICATOR_KEYWORDS` (name -> the message to show) is the guard I-95 added; `noOptionIndicatorsReason` / `noOptionIndicatorsNewConflictReason` are its lookup and its diff-based check (an edit that *adds* option indicators is refused, removing or leaving them alone never is, and keywords not in the table are never affected). Its own comment sets the rule for this task: **only keywords whose exclusion has been read in the reference belong in the table - it is deliberately not populated from a guess**, and the reference words the rule two ways ("cannot be conditioned itself" on a field that can be, vs. an outright "not allowed with"), so each keyword must be read to see which it is.

**Working notes (proposed, not decided).**

- Read each keyword's own section before it goes into the table; the scan list above is only a starting point.
- Keywords whose rule is conditional do not fit a plain name -> message table and need their own check, as `MSGID` (I-73, indicators allowed except on the last one) and `CHECK` (I-30, only `CHECK(ER)`/`CHECK(ME)`) already have.
- Several keywords are legitimately conditioned by iSDA's own structured editors, so each must also be checked against the *panel* that conditions it, not only the raw editor. I-98 was exactly that hole in a structured panel (`LOGINP` and `CHECK(AB)`/`CHECK(RL)` on the SFLMSG General tab), so other panels may have it too.
- Do it in batches by level (file, record, field, help entry), one version per batch, each batch with its own test, following I-3 / I-9 / I-10.

**Batch 1 - the file-level-only keywords (v0.10.180).** Done: `ALTHELP`, `ALTPAGEDWN`, `ALTPAGEUP`, `DSPRL`, `DSPSIZ`, `ERRSFL`, `HLPFULL`, `HLPSCHIDX`, `INDARA`, `MSGLOC`, `OPENPRT`, `PASSRCD`, `REF`, `USRDSPMGT` (14 names; `NO_OPTION_INDICATOR_KEYWORDS` now has 15 entries with `IGCALTTYP`). Each was read in `DDS_Keyword_V7r6.txt`: it exists at the file level only (so a name-keyed entry cannot wrongly hit another level) and its own section says "Option indicators are not valid for this keyword" (`ALTPAGEDWN`/`ALTPAGEUP` share a section and say "these keywords") with no sentence anywhere in the section saying they are valid.

- **Why file-level first:** I-3 already audited the *structured* File Properties rows for all 39 file-level keywords, so for this level the only hole left was the raw keyword editor's Conditioning toggle. For the record, field and help-entry levels the structured panels have to be checked too (I-98 was that hole).
- **`MSGLOC` needed a small change to I-95's mechanism.** `MSGLOC` legitimately takes display-size conditions (the reference: "Display size condition names must be specified if the message line for the secondary display size is different"). I-95 hid the Conditioning toggle whenever a listed keyword carried no option indicator, which would also have hidden an existing `*DS4` condition from the raw editor. It is now hidden only when the keyword carries **no condition at all**; a listed keyword with only a display-size condition keeps its toggle (so the condition stays visible and removable), gets no warning (it carries no option indicator), and adding an option indicator on top of it is still refused. The raw editor cannot *add* a display-size condition (its "+ indicator" only adds indicators); the structured panels do that.
- New `DspfWriter.noOptionIndicatorKeywordNames()` (a copy of the table's names, for tests and audits).
- New `src/test/i101FileLevelNoOptionIndicators.test.js` (209 checks): the table (15 entries, reasons name their keyword, the diff check, unlisted keywords such as `TEXT`/`CHGINPDFT`/`HLPTITLE`/`CA01`/`MSGID`/`CHECK` still `null`); **every entry checked against the reference text itself** - each listed keyword's section says "not valid" and no section says "valid" (a wrong entry fails here, not in someone's file); all 14 in the raw editor with no condition (no toggle, a note), with a hand-written indicator (toggle kept, a warning naming the keyword, adding refused with an alert naming it, removing allowed), and through "+ Add keyword"; the `MSGLOC` display-size edge; and the real generated designer's file-level raw editor (opened from the File breadcrumb). Confirmed to fail against the pre-fix code (90 checks). Wired into `npm test`.

**Batch 2 - the record-level-only keywords (v0.10.195).** Done: 29 names added to `NO_OPTION_INDICATOR_KEYWORDS` (44 entries with batch 1 and `IGCALTTYP`; 30 record-level names once `SFLMODE` joined in v0.10.196, see below). Each was read in `DDS_Keyword_V7r6.txt`: every section of it that describes a level says "record-level keyword" (the other hits are table-of-contents and index fragments), and says plainly "Option indicators are not valid for this keyword", with no "valid" sentence.

- **Plain (24):** `ALWROL`, `ASSUME`, `CLRL`, `GETRETAIN`, `GRDRCD`, `HLPCMDKEY`, `HLPSEQ`, `INZRCD`, `LOGINP`, `MNUBAR`, `PULLDOWN`, `RTNCSRLOC`, `RTNDTA`, `SETOF`, `SFL`, `SFLCTL`, `SFLENTER`, `SFLMLTCHC`, `SFLRNA`, `SFLRTNSEL`, `SFLSNGCHC`, `SLNO`, `UNLOCK`, `USRDFN` - none mentions display size conditions.
- **Display-size (5):** `SFLLIN`, `SFLMSGRCD`, `SFLPAG`, `SFLSIZ`, `WINDOW` - the same sentence, but the section also says display size condition names are valid (`SFLMSGRCD`: "Option indicators are not valid for this keyword; display size condition names are valid."). They use batch 1's `MSGLOC` treatment: an option indicator is refused, a `*DS` condition is not one and is left alone, and the raw editor keeps the toggle while a condition is present. Their reason text says so.
- **Held back, on purpose:** `CSRLOC` (its section says option indicators **are** valid - I-21 already gives it a Conditioning toggle). Not in the table.
- **`SFLMODE` - added afterwards (v0.10.196).** It was first held back because its extracted text shows both a "not valid" and a "valid" sentence. Reading it in context settled it: the "valid" sentence ("Option indicators are valid for these keywords") is followed by the `SFLMSG` / `SFLMSGID` example, i.e. it is the *next* keyword's text spilling past the section boundary; `SFLMODE`'s own sentence, right before its own `SFLMODE`/`SFLCSRRRN` example, is "not valid". It is now in the table (record-level entries: 30). The test proves the spill-over rather than assuming it.
- **Structured panels - checked, nothing to fix.** Rendering every record-level panel builder (the seven Keywords subtabs, and the SFL, SFLCTL, SFLMSG, MNUBAR, Pull-down and Window tabs) puts no Conditioning toggle on any of the 29; the only record-level toggle in that set that belongs to this list's neighbours is `CSRLOC`'s, which is correct. A `SETOF` row in the record-indicator list already has no toggle (I-20). So the raw editor was the only hole, as for the file level. The test pins this.
- **Test.** New `src/test/i101RecordLevelNoOptionIndicators.test.js` (448 checks, wired into `npm test`): the table (80 entries, the diff check, `CSRLOC`/`TEXT`/`CHECK`/`KEEP`/`HELP` still `null`); **every entry checked against the reference text itself** (record-level section, the plain sentence, no "valid" sentence, display size mentioned exactly for the five); all 30 in the raw editor with no condition (no toggle, a note), hand-written with an indicator (toggle kept, a warning naming the keyword, adding refused, removing allowed), the five with a `*DS4` condition (toggle kept, an option indicator on top refused), `CSRLOC` still takes one; the structured-panel pin; and the real generated designer's record raw editor (an `SFLCTL` record with `SFLSIZ`, `SFLPAG` with an indicator and under `*DS4`, `CSRLOC`, and an `INZRCD` record). 186 checks fail against the pre-fix code. `i101FileLevelNoOptionIndicators.test.js`'s count check was relaxed from "15 entries" to "at least those 15".

**Batch 3 - the field-level-only keywords (v0.10.196).** Done: 35 names added to `NO_OPTION_INDICATOR_KEYWORDS` (now 80 entries: 14 file-level, 30 record-level, 35 field-level, `IGCALTTYP`). Each was read in `DDS_Keyword_V7r6.txt`: every section of it that describes a level says "field-level keyword", none mentions display size conditions, and it says "Option indicators are not valid for this keyword" in one of two wordings.

- **Plain (23):** `ALIAS`, `BLANKS`, `BLKFOLD`, `CHCACCEL`, `CHCCTL`, `CHKMSGID`, `CNTFLD`, `COMP`, `DLTCHK`, `DLTEDT`, `EDTCDE`, `EDTMSK`, `EDTWRD`, `FLDCSRPRG`, `FLTFIXDEC`, `HLPID`, `MLTCHCFLD`, `PSHBTNFLD`, `RANGE`, `SFLCHCCTL`, `SFLCSRPRG`, `SNGCHCFLD`, `VALUES`.
- **"...although option indicators can be used to condition the field" (12):** `CHRID`, `DATE`, `DATFMT`, `DATSEP`, `DFT`, `HTML` (its section says "option indicators are allowed on the constant field"), `MAPVAL`, `SYSNAME`, `TIME`, `TIMFMT`, `TIMSEP`, `USER`. This is the subtlety that made the field level need its own read: the **field** may be conditioned, only the keyword may not. The parser keeps a field's own indicators (on the field's line) on the field, not on its first-line keyword, so a conditioned field is never flagged - only a keyword on a continuation line of its own that carries an indicator is. The reason text for these twelve says so ("they can condition the field it is on").
- **`CNTFLD` - same spill-over as `SFLMODE`.** Its extracted text also has a later "Option indicators are valid for this keyword"; that sentence is followed by the `GRDATR` example, so it is the next keyword's text. `CNTFLD`'s own sentence, right after its "at least 2 spaces" rule, is "not valid". Added.
- **Held back, on purpose:** `MSGCON` (option indicators are valid for the presence of the message; not valid only for changing its value) and `MSGID` (conditional - I-73 already refuses them on the last or only `MSGID`). Neither is in the table.
- **Structured field panels - checked, nothing to fix.** Selecting every field of a test source (numeric, character, date, time, single-choice, push-button, constant and subfile fields) and listing the Conditioning controls its panels draw finds only `DUP`, `ENTFLDATR`, `DFTVAL`, `PUTRETAIN`, `OVRDTA`, `OVRATR` and the choice-field `CHCAVAIL`/`CHCUNAVAIL`/`CHCSLT` toggles; the `RANGE`/`COMP`/`VALUES`/`CHECK` rows carry none. None belongs to the 35, so the raw editor was again the only hole. The test pins this.
- **Test.** New `src/test/i101FieldLevelNoOptionIndicators.test.js` (490 checks, wired into `npm test`): the table (80 entries, the diff check, `MSGCON`/`MSGID`/`DSPATR`/`COLOR`/`CHECK`/`DFTVAL` still `null`); **every entry checked against the reference text itself** (field-level section, its wording, no "valid" sentence for the keyword, no display size mention); all 35 in the raw editor with no condition (no toggle, a note), hand-written with an indicator (toggle kept, warning naming the keyword, adding refused, removing allowed), `MSGCON` still takes one; and the real generated designer: a numeric field that is itself conditioned (`N10`) with `EDTCDE`, a hand-written `DFT` under indicator 30, `RANGE` and `DUP` (no false warning on the field's own indicator; `DFT` warned; `DUP` unchanged), plus date, time, character, single-choice and push-button fields, and the structured-panel scan. The new checks fail against the pre-change code. Two earlier tests that assumed the old table were updated: `i95` (it listed `CHRID` and `BLKFOLD` as unlisted) and `i101FileLevel` (`DFT`); `i101RecordLevel`'s count check was relaxed.

**Batch 4 - the multi-level keywords and the three that word the rule differently (v0.10.197).** Done, and the audit is complete: 15 more names (95 entries in `NO_OPTION_INDICATOR_KEYWORDS`, plus one file-level-only entry). The decisions the earlier hand-off asked for were settled "as per the IBM i source reference", so each follows its own section to the letter:

- **Same rule at every level - a name-keyed entry (12).** `CHANGE` (record, field), `CHGINPDFT`, `INDTXT`, `VALNUM`, `WRDWRAP` (file, record, field), `TEXT` (record, field), `VLDCMDKEY` (file, record): every section says a plain "Option indicators are not valid for this keyword". Also `REFFLD`, `SFLRCDNBR`, `SFLROLVAL`, `SFLSCROLL` (field level only - the earlier scan had put them among the multi-level ones) and `ALTNAME` (record level; the sentence is in the System/36 chapter).
- **`HLPARA` (1) - the help-specification level, the one level no earlier batch touched.** Its section says "not valid"; its four siblings (`HLPPNLGRP`, `HLPEXCLD`, `HLPBDY`, `HLPDOC`, and `HLPRCD`) say valid. **This one was a structured-panel bug**: the help entry's Application Help panel drew a Conditioning toggle on the `HLPARA` row. It now takes no conditions argument (an existing hand-written condition is preserved on commit and shows, with a warning, in the help entry's raw keyword editor).
- **`HLPTITLE` - level-aware, as the reference is.** "Option indicators are not valid on a file-level HLPTITLE keyword ... allowed on record-level HLPTITLE keywords". `noOptionIndicatorsReason` / `noOptionIndicatorsNewConflictReason` take an optional `level`; the raw editor passes `'file'` when its owner key is `file`. Only the file-level list refuses; record, field and help-entry lists are untouched, and the record-level HLPTITLE panel keeps its Conditioning toggle (a pin in the test). No structured file-level HLPTITLE panel exists, so nothing to fix there.
- **`SFLMSGKEY` - "not valid for this keyword or with the associated field".** The keyword has its entry; the **field half** is `sflmsgkeyFieldNewConflictReason`, wired into `commitEdit` (the one choke point for every field edit): indicators added to a field that carries `SFLMSGKEY` are refused, and `SFLMSGKEY` added to an already-conditioned field is refused; removing either is always allowed and a hand-written field that has both is not re-reported. Proved through the real designer (the field's own Conditioning editor, and the raw editor's add), with an ordinary field as the control.
- **`SFLPGMQ` - "Option indicators and display size condition names are not valid".** Entry plus a display-size half: `displaySizeConditionCount`, `noOptionIndicatorsPresentReason`, and the diff check now also refuses a display-size condition being added to it; a hand-written one is warned about, kept on the toggle and removable. Every other listed keyword is unaffected (`MSGLOC`, `SFLSIZ` etc. still take `*DS` conditions).
- **Nothing to add (their sections say valid, or the rule is conditional and already covered):** `CSRLOC`, `CHOICE`, `GRDCLR`, `HOME`, `WDWTITLE`, `MSGCON`; `MSGID` (I-73) and `CHECK` (I-30) keep their own checks.
- **Structured panels - checked.** Every panel builder (file, record, SFL, SFLCTL, SFLMSG, MNUBAR, Pull-down, Window, the record-indicator list and the help entry's Application Help) and the real field panels: the only Conditioning control on a batch keyword was `HLPARA`'s, fixed above. `CHANGE` / `INDTXT` / `VLDCMDKEY` / `SETOF` rows in the record-indicator list carry none (I-20).
- **Test.** New `src/test/i101MultiLevelNoOptionIndicators.test.js` (wired into `npm test`): the table (95 entries, level-aware `HLPTITLE`, the diff check, the display-size rule, the `SFLMSGKEY` field guard in isolation); every entry read against its own reference section (the levels it exists at, the sentence, no "valid" sentence); the raw editor for all 15 (no condition: note, no toggle; hand-written: warning, kept, refuse-add, allow-remove); `HLPTITLE` at `file` versus `record-`, `field-` and `help-` owners; the structured-panel pin; and the real designer (file-level `HLPTITLE`, a `TEXT` field, the `SFLMSGKEY` guard both directions and its control). Earlier i101 tests and `i95` that assumed `TEXT`, `CHGINPDFT`, `INDTXT` or an exact entry count were updated.

**I-101 is complete.** Across the four batches the table holds 95 keywords (14 file-level, 30 record-level, 35 field-level, 15 in this batch, `IGCALTTYP`) plus the file-level-only `HLPTITLE`; every keyword the DDS Reference says takes no option indicators has a closed Conditioning toggle in the raw keyword editor, and the one structured-panel hole this audit found (`HLPARA`) is fixed.

*Raised by I-95. Size (estimate): Large - an audit, best done in batches by level.*

---

<a id="i-102"></a>

### I-102 — `HLPCLR` / `INVITE`: whitelisted on `USRDFN` but refused by the shared guard

> **Area:** Record · **Status:** Done (v0.10.177) · **Depends on:** I-44, I-51

**Fixed.** Ticking `HLPCLR` on a `USRDFN` record was refused with "HLPCLR cannot be specified on a user-defined (USRDFN) record format", although `USRDFN`'s own DDS Reference text lists it among the few keywords that *do* apply: "No file- or record-level keywords apply to this record except INVITE, KEEP, PASSRCD, HLPRTN, HELP, HLPCLR, PRINT, OPENPRT, and TEXT." `INVITE` behaved the same. Re-verified on v0.10.176 before starting: in the real designer (`HLPCLR`'s row is in the Help subtab, which a `USRDFN` record keeps) and by driving every record panel directly with R2's tab narrowing bypassed (both refused; both accepted on a plain record).

Cause, as the filing diagnosed and re-read in the code: I-44 added its `USRDFN` check inside `wirePulldownGuardedFlag` by calling `DspfWriter.usrdfnConflictReason`, which refused **every** keyword name on a `USRDFN` record. I-44's own comment justified calling it unconditionally because "none is on that whitelist" for "this function's 15 I-44 call sites". That premise stopped being true when `HLPCLR` and `INVITE` were routed through the same function afterwards (I-51 wired their Conditioning toggles there): it has 17 callers today, and those two are on the whitelist. The neighbouring `SFL` and `MNUBAR` checks in the same function were already whitelist-aware; only the `USRDFN` one was not. `PRINT`, also whitelisted, had been kept away from this function by hand (its comment says so), which is why it was never hit.

Design, and one departure from the filing. The filing suggested swapping the call for `usrdfnWhitelistConflictReason`. That function words its refusal differently ("cannot be *added* to ... only INVITE, KEEP, ..."), which would have changed the alert for every caller and any test pinning it. Instead `usrdfnConflictReason` itself now consults `USRDFN_WHITELIST_KEYWORDS`: a whitelisted keyword returns null. That fixes all three functions that call it (`wireUsrdfnGuardedFlag`, `wireUsrdfnGuardedTwoField`, `wirePulldownGuardedFlag`) by construction, so it is also right for any whitelisted keyword wired through them later, and it keeps the existing refusal wording, so no other test or caller changed. It now agrees with `usrdfnWhitelistConflictReason` on *which* keywords are refused; the two differ only in wording. I-44's stale comment in `webviewClientHelpers.js` was updated to say so. No test called `usrdfnConflictReason` directly, and the tests that pin the wording (`i44`, `i8`) pass unchanged.

New `i102UsrdfnWhitelistAwareGuard.test.js` (73 checks): the writer function for all ten whitelisted names (null) and for 36 non-whitelisted ones (refused with exactly the old wording), never refusing on a non-`USRDFN` record, and agreeing with the whitelist function; the record panels driven directly - `HLPCLR` and `INVITE` accepted, added, staying checked, removable, and a hand-written pair removable, every one of the 33 non-whitelisted rows wired through the guards still refused with the alert, no edit and the box put back, and a plain-record control; and the real designer (`HLPCLR` on and off through the Help subtab, `ASSUME` still refused). Confirmed via `git stash` to fail (19 checks) against pre-fix code. The I-13, I-37, I-44, I-49, I-51, I-53, I-54, I-60, I-77, I-8 and I-98 suites and `dspfWriter.test.js` pass unchanged. Full suite: 7589/7589 assertions, zero failures.

Not addressed here: `INVITE`'s row is still hidden on a `USRDFN` record because it sits in a panel R2 hides, so it is reachable only through the raw editor (I-105); `CHGINPDFT` is the opposite gap, accepted although not allowed (I-103); the sweep that would have caught both is I-104. The same guard functions also refuse *editing* an already-present keyword's parameters with a misleading "cannot be added" message - see Deferred findings.

*Found by a direct check of a `USRDFN` record's keyword rows (v0.10.176), after I-95. Size (estimate): Small–medium.*

---

<a id="i-103"></a>

### I-103 — `CHGINPDFT`: record-level row has no `USRDFN` / `MNUBAR` guard

> **Area:** Record · **Status:** Done (v0.10.182) · **Depends on:** I-44, I-54

**Bug.** Ticking the record-level `CHGINPDFT` checkbox on a `USRDFN` record is **accepted**: the keyword is added with no alert, although it is not on `USRDFN`'s whitelist (`INVITE`, `KEEP`, `PASSRCD`, `HLPRTN`, `HELP`, `HLPCLR`, `PRINT`, `OPENPRT`, `TEXT`). Verified on v0.10.176 in the real designer and with the record panels driven directly. The row is in the General subtab, which a `USRDFN` record keeps, so it is reachable. Every other non-whitelisted row I ticked on that record was refused (`INZRCD`, `ASSUME`, `ALWROL`, `RETKEY`, `RETCMDKEY`, `CSRINPONLY`, `VALNUM`, `WRDWRAP`, `HLPCMDKEY`), and `ENTFLDATR` and `RTNCSRLOC` are refused by I-60 and I-77.

The same holds on an **`MNUBAR`** record: `DspfWriter.mnubarWhitelistConflictReason('CHGINPDFT', ...)` says it is not valid there, yet the row accepts it. `SFL` is fine (its list allows `CHGINPDFT`), which is why a sweep of `SFL` alone would not have shown it.

**Cause.** The record-level row is wired with `wireChgInpDftFlag`, which takes no guard parameter at all, unlike its siblings that go through the `USRDFN`-, `SFL`- and `MNUBAR`-aware wiring functions. It is not among the 29 keywords I-44 wired, and I-44's "false positives" list does not name it. I-53 and I-54 swept the `SFL` and `MNUBAR` records by hand but, by their own descriptions, covered the three shared guarded-wiring functions, `PRINT`'s commit and `ENTFLDATR`'s Apply, not this row.

**Suggested fix.** Give `wireChgInpDftFlag` an optional guard for its record-level call only, the same opt-in shape as I-53 and I-54 used, because the row builder is shared with the field, file and `SFLMSG` levels and those must not change. The guard should fire only on a real turn-on (the I-84 lesson: gate on the transition, not on the checkbox state), so a hand-edited record that already carries `CHGINPDFT` can still have it removed and its parameters edited. Test on `USRDFN` and `MNUBAR` (blocked, box reverted, nothing added), `SFL` and a plain record (still accepted), removal and a parameter edit on an already-invalid record (allowed).

*Found by a direct check of a `USRDFN` record's keyword rows (v0.10.176), after I-95. Size (estimate): Small.*

**Done (v0.10.182).** `wireChgInpDftFlag` and `wireFlagRow` take an optional trailing guard; only the record-level call in `wireRecordKeywordsPanels` passes one, so the field, file and `SFLMSG` call sites are unchanged.

- **Guard.** `usrdfnConflictReason || pulldownConflictReason || sflWhitelistConflictReason || mnubarWhitelistConflictReason` for `CHGINPDFT`. In practice it refuses on `USRDFN` and `MNUBAR` records; `SFL` and plain records still accept it.
- **Turn-on only.** It fires only when `CHGINPDFT` is not already present (the I-84 lesson), so a hand-edited invalid record can still have the keyword removed or its codes edited.
- **Sub-codes.** Ticking one of the nine sub-code boxes (`HI`, `RI`, ...) force-checks the main box and dispatches through the same commit, so it is refused too; on refusal the main box, every sub-code box and the hidden params input are all reverted.
- **Tests.** New `src/test/i103ChginpdftRecordGuard.test.js` (21 checks, wired into `npm test`): `USRDFN` / `MNUBAR` refused (main box and sub-code), already-invalid record editable and removable, `SFL` / plain accepted. Confirmed failing (8 failures) against the pre-fix `webviewClientHelpers.js`. The two `CHGINPDFT` entries were removed from I-104's `KNOWN_GAPS`; the sweep passes with them gone.

---

<a id="i-104"></a>

### I-104 — Table-driven sweep test over every record keyword row (`USRDFN`, `SFL`, `MNUBAR`)

> **Area:** Record · **Status:** Done (v0.10.181) · **Depends on:** I-102, I-103

I-44 assumed which rows a `USRDFN` record shows and wired the guards by name. I-53 and I-54 then swept the `SFL` and `MNUBAR` records row by row, by hand. Nobody did that for `USRDFN`, which is how `CHGINPDFT` (accepted although not allowed, I-103) and `HLPCLR` (refused although allowed, I-102) went unnoticed for so long. A test that walks the rows instead of naming them would have caught both, and would catch the next row someone adds without a guard.

Add one test that renders **every** panel that `recordKeywordsPanelsHtml` (in `webviewClientHelpers.js`) returns (`general`, `indicatorKeywords`, `help`, `output`, `input`, `overlay`, `print`) with R2's tab narrowing bypassed, enumerates the keyword checkboxes it actually finds (`rk-<name>-on`, so a new row is picked up automatically and fails the test until it is classified), ticks each one on a `USRDFN` record, and asserts it is refused **if and only if** the keyword is not in `USRDFN_WHITELIST_KEYWORDS`. Do the same for an `SFL` record against `sflWhitelistConflictReason` and an `MNUBAR` record against `mnubarWhitelistConflictReason`, and a plain record as the control (nothing refused for whitelist reasons). Rows that commit through an Apply button or extra inputs (`ENTFLDATR`, `RTNCSRLOC`) need their own small driver; list them explicitly and assert the driver ran, so a skipped row is a failure and not a silent pass. Land it after I-102 and I-103 so it starts green, or land it first with those two rows marked as known failures and remove the marks as they are fixed.

**Done (test only - no production code changed).** New `src/test/i104RecordKeywordRowSweep.test.js` (386 checks, wired into `npm test`).

- **How it works.** The exported `recordKeywordsPanelsHtml` / `wireRecordKeywordsPanels` are mounted in a plain jsdom document with **all seven panels at once**, which bypasses R2's USRDFN tab narrowing by construction (that narrowing lives in `buildWebviewTemplate.js`, not in these helpers). Each row is driven the way a user drives it on a **fresh** `USRDFN`, `SFL`, `MNUBAR` and plain record, and the outcome (refused with an alert / accepted / nothing happened) is compared with an oracle: refused **if and only if** the keyword is not on that record type's whitelist. The whitelists are typed into the test from the DDS Reference and cross-checked two ways - against the reference text itself, and against `usrdfnWhitelistConflictReason` / `sflWhitelistConflictReason` / `mnubarWhitelistConflictReason` - so the oracle is not read from the code under test.
- **Rows driven (62 per record type, asserted):** the 44 `rec-<name>-on` checkboxes, `ENTFLDATR` (tick + its Apply button), the four rows that have no checkbox (`TEXT`, `ALTNAME`, `HLPSEQ`, `CSRLOC`, committed by their inputs), the four "+ Add" buttons (`MNUBARDSP`, `HLPTITLE`, `MOUBTN`, the Indicator row's own), and the Indicator row's kind dropdown (each of the other nine kinds switched to on an existing instance). SFL-message (`SFL` + `SFLMSGRCD`), `SFLCTL`, `PULLDOWN` and `WINDOW` records are not swept.
- **Nothing is silently skipped.** Every id-bearing control the panels render must be classified (a checkbox row, an input row, or a parameter of one) or the test fails with the control's id - "a new row fails the test until it is classified" - and so must every button and every kind the Indicator dropdown offers. Every classified row must still exist. A driver that ran but changed nothing is a failure, and the number of rows driven per record type is asserted.
- **Mutation-checked:** dropping `HLPCLR` from the USRDFN whitelist (I-102's bug class, allowed but refused) and adding `INZRCD` to it (I-103's, not allowed but accepted) both fail, in the sweep and in the oracle cross-check; so does a stray `ALWROL` in the MNUBAR whitelist. A rendered control that is not classified, and a `KNOWN_GAPS` entry that stops being a gap, both fail with a message saying what to do.
- **`KNOWN_GAPS`.** The sweep started green only after I-103's row and **five more it found** were recorded as known gaps. Each is asserted to *still* be a gap, so the day one is fixed the test fails with "GAP CLOSED - remove it from KNOWN_GAPS", exactly as this task's own text asked for I-103. That includes I-103: when it lands, the two `CHGINPDFT` entries have to come out of the table.

What the sweep found ("reachable" = the row is on a tab the record type actually shows; USRDFN shows only General, Help and Print, so its Input and Indicator rows are latent):

| Finding | Row | Record types | Reachable |
|---|---|---|---|
| I-103 | `CHGINPDFT` tick | USRDFN, MNUBAR | yes |
| A | `UNLOCK` tick | SFL (yes), USRDFN (latent) | SFL |
| B | `CHECK(AB)` / `CHECK(RL)` ticks | MNUBAR (yes), USRDFN (latent) | MNUBAR |
| C | `ALTNAME` text row | USRDFN, SFL, MNUBAR | all three |
| D | Indicator row: "+ Add" (creates `CLEAR`) and the kind switch to `CLEAR`, `PAGEDOWN`, `PAGEUP`, `HOME`, `VLDCMDKEY`, `SETOF`, `CHANGE`, `INDTXT` | USRDFN | latent |
| E | "+ Add" `HLPTITLE` (USRDFN, SFL) and `MNUBARDSP` (USRDFN) | see left | yes |

A-E are logged under Deferred findings. Everything else on the four records behaves as the oracle says (the plain record refuses nothing).

*Suggested by the investigation behind I-102 and I-103. Size (estimate): Small–medium.*

---

<a id="i-105"></a>

### I-105 — `USRDFN` record: consistent presentation of applicable / non-applicable keyword rows (decision first)

> **Area:** Record · **Status:** Done (v0.10.191) · **Depends on:** I-44, I-102

A `USRDFN` record presents "this keyword does not apply" in two different ways, depending only on which panel the row lives in. Observed on v0.10.176:

- A plain record shows 44 keyword rows and a `USRDFN` record shows 16. The other 28 are **hidden outright**: R2's `isUsrDfnRecord` narrowing keeps only the General, Help and Print subtabs (`renderRecordProps` in `buildWebviewTemplate.js`), so the `indicatorKeywords`, `output`, `input` and `overlay` panels never render.
- Of the 16 that remain, **13 are not on `USRDFN`'s whitelist** (`INZRCD`, `ASSUME`, `ALWROL`, `RETKEY`, `RETCMDKEY`, `CSRINPONLY`, `CHGINPDFT`, `VALNUM`, `WRDWRAP`, `ENTFLDATR`, both `RTNCSRLOC` variants, `HLPCMDKEY`). They are **shown and enabled** (no checkbox is disabled); ticking one is refused with an alert and the box reverts. (Except `CHGINPDFT`, which is accepted: I-103.)
- `INVITE` is on the whitelist but its row is in the `output` panel, so it is hidden with it. It is reachable only through the raw keyword editor, which the whitelist allows (I-49).

So the user sees a mix: some inapplicable keywords vanish, others are offered and refused, and one applicable keyword (`INVITE`) is missing.

**Decide first**, then build: (a) hide every non-applicable row on a `USRDFN` record, consistent with R2, but then a hand-written invalid keyword can no longer be un-ticked in the panel (the same hazard I-72 recorded for `dtScope`-style gating); (b) show them **disabled** with the reason, which needs the row builders to accept a disabled state and a reason; (c) keep refuse-on-tick and stop hiding the whitelisted ones (`INVITE`). R2's own comment above `isUsrDfnRecord` says the narrowing follows what real SDA's `USRDFN` menu shows, so check the options against the screenshots under `docs/sda-reference/screens` before choosing. Also decide whether `SFL` and `MNUBAR` records, which have their own whitelists, follow the same rule.

**Done.** Decision made first, with the user: **Option (a)** - hide every non-applicable row. Applied to `SFL` and `MNUBAR` records too, at the user's direction (the task left that open).

- **The rule.** `recordKeywordsPanelsHtml(keywords, idPrefix, expandedSet, restrictTo)` takes a new optional `restrictTo` (`'USRDFN'`, `'SFL'` or `'MNUBAR'`). With it, a row is built only when the record type's own whitelist allows its keyword - `recordRestrictionAllows` calls `DspfWriter.usrdfnWhitelistConflictReason` / `sflWhitelistConflictReason` / `mnubarWhitelistConflictReason`, the same functions the guards use, so the rows shown and the rows accepted cannot disagree. `recordKeywordsRestriction(rec)` picks the type (`USRDFN`, then plain `SFL`, then `MNUBAR`); `renderRecordProps` passes it and drops any subtab with no applicable row. Without `restrictTo` the output is unchanged, so every existing guard test that mounts the full row set still does.
- **`USRDFN`.** General: `KEEP`, `TEXT` and `INVITE` (its row is in the Output panel, which R2 hides, so it is folded into General - it used to be unreachable). Help: `HLPCLR`. Print: `PRINT`. Still no Indicator subtab (R2). The 13 shown-and-refused rows and the 28 hidden ones are all gone.
- **`SFL`** (plain, not `SFLMSG`). General: `KEEP`, `CHGINPDFT`, `TEXT`. Indicator: the kind selector offers `CHANGE`, `SETOF`, `INDTXT`. Output: `LOGOUT`. Input: `LOGINP`, `CHECK(AB)`, `CHECK(RL)`. Help, Overlay and Print are dropped.
- **`MNUBAR`.** All seven subtabs remain, each with only its whitelisted rows (for example `KEEP`, `TEXT`, `MNUBARDSP`, `HLPCLR`, `HLPCMDKEY`, `HLPTITLE`, `LOCK`, `INVITE`, `DSPMOD`, `CSRLOC`, `CLRL`, `UNLOCK`, `OVERLAY`, `PROTECT`, `PRINT`). The Indicator kind selector offers `CLEAR`, `HOME`, `PAGEDOWN`, `PAGEUP`, `HELP`, `HLPRTN`, `VLDCMDKEY`, `INDTXT`.
- **Indicator kind selector.** On all three it lists only the allowed kinds, plus the kind of an instance that already exists, so a hand-written row still renders truthfully. The "+ Add" default was already whitelist-aware (I-55, I-109).
- **Accepted hazard of (a).** A hand-written keyword that is not on the whitelist can no longer be un-ticked in the panel. It stays listed, and removable, in the Advanced / raw keywords list (I-49, I-46, I-48). Existing record-indicator instances of a disallowed kind also stay visible in their list.
- **Not changed.** The guards themselves (refuse-on-tick, the raw-editor whitelists) are untouched and remain the backstop. `SFLMSG` records (whitelist: `SFLMSGRCD` only) and `SFLCTL` (no whitelist) keep their existing Keywords tab.
- **Tests.** New `src/test/i105UsrdfnRecordRows.test.js` (45 checks, wired into `npm test`): for each of the three types, the applicable rows are present, none of the non-applicable ones is, the kind selector lists exactly the allowed kinds, applicable rows commit (including `INVITE` on `USRDFN`), a hand-written invalid keyword is hidden in the panel but kept and listed in the raw editor, and the other record types are untouched. Five checks fail against the pre-change `webviewClientHelpers.js`. The real-template tests that used to tick a non-applicable row and expect the alert (`i8`, `i37`, `i44`, `i52`, `i53`, `i54`, `i60`, `i102`) now assert the row is absent; the refusal itself stays covered on the full row set by `i102`, `i104` and `i111`. `dspfWebview.test.js`'s R2 scenario gained checks for the new `USRDFN` rows.

*Found by a direct check of a `USRDFN` record's keyword rows (v0.10.176), after I-95. Size (estimate): Medium.*

---

<a id="i-106"></a>

### I-106 — `UNLOCK`: not guarded on `SFL` / `USRDFN` records

> **Area:** Record · **Status:** Done (v0.10.183) · **Depends on:** I-104

Opened from a deferred finding raised by I-104 (finding A), verbatim:

**`UNLOCK` is not guarded on an `SFL` record** (and, latent, a `USRDFN` one). `UNLOCK` is not in SFL's "also valid" list (`SFL_RECORD_WHITELIST_KEYWORDS`) nor USRDFN's whitelist, but ticking `rec-unlock-on` (Input tab) is accepted; the row is not wired through the SFL/USRDFN whitelist guards. Reachable on SFL (all seven tabs shown), latent on USRDFN (R2 hides the Input tab). Fix shape: wire it through `sflWhitelistConflictReason` / `usrdfnWhitelistConflictReason` like its neighbours; then remove `SFL|cb:unlock` and `USRDFN|cb:unlock` from `KNOWN_GAPS` in `i104RecordKeywordRowSweep.test.js`. Size: Small.

*Raised by I-104 (finding A). Size (estimate): Small.*

**Done (v0.10.183).** The hand-wired record-level `UNLOCK` row's `commitUnlock` (Input subtab) now consults `usrdfnConflictReason`, `pulldownConflictReason`, `sflWhitelistConflictReason` and `mnubarWhitelistConflictReason`. In practice it refuses on `SFL` and `USRDFN` records; `MNUBAR`'s list includes `UNLOCK`, so `MNUBAR` and plain records still accept it.

- **Turn-on only.** The guard runs only when `UNLOCK` is not already present (the I-84 lesson), so a hand-edited invalid record can still remove it or edit its `*ERASE` / `*MDTOFF` values.
- **Revert.** On refusal the main box and both value boxes are reset.
- **Tests.** New `src/test/i106UnlockRecordGuard.test.js` (16 checks, wired into `npm test`); 4 of them fail against the pre-fix `webviewClientHelpers.js`. `SFL|cb:unlock` and `USRDFN|cb:unlock` were removed from I-104's `KNOWN_GAPS`; the sweep passes without them.

---

<a id="i-107"></a>

### I-107 — `CHECK(AB)` / `CHECK(RL)`: not guarded on `MNUBAR` / `USRDFN` records

> **Area:** Record · **Status:** Done (v0.10.184) · **Depends on:** I-104

Opened from a deferred finding raised by I-104 (finding B), verbatim:

**`CHECK(AB)` / `CHECK(RL)` are not guarded on a `MNUBAR` record** (and, latent, a `USRDFN` one). `CHECK` is on SFL's whitelist but not on MNUBAR's or USRDFN's; the two Input-tab rows (`rec-check-ab-on`, `rec-check-rl-on`) accept it on both. Same fix shape and `KNOWN_GAPS` entries (`MNUBAR|cb:check-ab`, `MNUBAR|cb:check-rl`, `USRDFN|cb:check-ab`, `USRDFN|cb:check-rl`). Size: Small.

*Raised by I-104 (finding B). Size (estimate): Small.*

**Done (v0.10.184).** The two hand-wired record-level rows (`rec-check-ab-on`, `rec-check-rl-on`, Input subtab) now pass `wireFlagRow` an optional guard (the parameter I-103 added), built by a local `recordCheckGuard` in `wireRecordKeywordsPanels`. It consults `usrdfnConflictReason`, `pulldownConflictReason`, `sflWhitelistConflictReason` and `mnubarWhitelistConflictReason` for `CHECK`. In practice it refuses on `MNUBAR` and `USRDFN` records; `SFL` (whose list includes `CHECK`) and plain records still accept it.

- **Turn-on only, per variant.** The guard runs only when that variant (`AB` or `RL`) is not already on the record (the I-84 lesson), so a hand-edited invalid record can still remove it; turning the *other* variant on is still an addition and is still refused.
- **Scope.** The SFLCTL, `SFLMSG` and file/field-level copies of these rows are unchanged (`SFLCTL` is a different record type that keeps `CHECK` on its own list).
- **Tests.** New `src/test/i107CheckRecordGuard.test.js` (24 checks, wired into `npm test`); 12 of them fail against the pre-fix `webviewClientHelpers.js`. The four `CHECK` entries were removed from I-104's `KNOWN_GAPS`; the sweep passes without them.

---

<a id="i-108"></a>

### I-108 — `ALTNAME` text row: accepted on `USRDFN`, `SFL` and `MNUBAR` records

> **Area:** Record · **Status:** Done (v0.10.189) · **Depends on:** I-104

Opened from a deferred finding raised by I-104 (finding C), verbatim:

**The `ALTNAME` text row is accepted on `USRDFN`, `SFL` and `MNUBAR` records.** It is on none of the three whitelists (and the DDS Reference says "ALTNAME is not allowed on subfile records (SFL keyword)"), but `rec-altname` (General tab) commits without any whitelist check. Reachable on all three. Fix shape: an add guard on the input row; `KNOWN_GAPS` entries `USRDFN|input:altname`, `SFL|input:altname`, `MNUBAR|input:altname`. Size: Small.

**Done.** The `rec-altname` commit handler only ever checked `pulldownConflictReason` (I-13); it now also chains `usrdfnConflictReason`/`sflWhitelistConflictReason`/`mnubarWhitelistConflictReason` - the exact same four-function chain `wireUsrdfnGuardedTwoField` already uses for HLPSEQ/CSRLOC just above it in the same panel, applied here for the first time to a plain single-text-field keyword.

- **I-111 applied here too:** by the time this task was picked up, I-111 had landed the "guards only fire on a real turn-on, not on every edit of an already-present keyword" fix for the three shared wirers. ALTNAME's guard is hand-rolled inline (not through one of those three shared functions), so it needed the same fix applied by hand: the whitelist chain now only runs when the box just became non-blank **and** ALTNAME was not already on the record - editing or removing an already-present (e.g. hand-written, already-invalid) ALTNAME is never blocked.
- **`KNOWN_GAPS` closed:** the three `USRDFN|input:altname` / `SFL|input:altname` / `MNUBAR|input:altname` entries are removed from `i104RecordKeywordRowSweep.test.js`'s `KNOWN_GAPS` table (now empty - this was the last remaining gap that sweep found).

New `src/test/i108AltnameWhitelistGuard.test.js` (24 checks): refused with an alert naming `ALTNAME` on `USRDFN`/`SFL`/`MNUBAR` (box reverted, record untouched), accepted on a plain record and still refused on `PULLDOWN` (I-13's pre-existing guard, unregressed), and the I-111 turn-on-only behavior - editing/removing an already-present `ALTNAME` on an otherwise-invalid `USRDFN`/`SFL` record is accepted, while turning it on fresh on that same record is still refused.

*Raised by I-104 (finding C). Size (estimate): Small.*

---

<a id="i-109"></a>

### I-109 — Record Indicator row: no `USRDFN` whitelist ("+ Add" and the kind switch)

> **Area:** Record · **Status:** Done (v0.10.186) · **Depends on:** I-104

Opened from a deferred finding raised by I-104 (finding D), verbatim:

**The record-level Indicator row has no `USRDFN` whitelist.** `recordIndicatorKindConflictReason` runs the SFL and MNUBAR whitelists and PULLDOWN's `CLEAR` check, but never `usrdfnWhitelistConflictReason`; so on a USRDFN record both "+ Add indicator keyword" (which creates `CLEAR`) and switching an instance's kind to `CLEAR`, `PAGEDOWN`, `PAGEUP`, `HOME`, `VLDCMDKEY`, `SETOF`, `CHANGE` or `INDTXT` are accepted; only `HELP` and `HLPRTN` are on USRDFN's list. Latent (R2 hides the Indicator tab), but the guards exist for hand-edited files and for R2 changing. Fix shape: add the USRDFN check to `recordIndicatorKindConflictReason` and the Add path (which must also stop defaulting to `CLEAR` on a USRDFN record); nine `USRDFN|kind:*` / `USRDFN|add:rec-recind-rep` entries come out of `KNOWN_GAPS`. Size: Small.

**Done.** `recordIndicatorKindConflictReason` now runs `usrdfnWhitelistConflictReason` alongside the PULLDOWN `CLEAR`, SFL and MNUBAR checks. Both paths go through that one function - the kind switch directly, and "+ Add indicator keyword" because its default-kind walk (`fallbackOrder`) asks it about each kind in turn - so a single check closes both:
- **Switch:** on a `USRDFN` record, `CLEAR`, `PAGEDOWN`, `PAGEUP`, `HOME`, `VLDCMDKEY`, `SETOF`, `CHANGE` and `INDTXT` are refused with the whitelist message (naming the keyword), the dropdown reverts and nothing is written; `HELP` <-> `HLPRTN` stay allowed.
- **Add:** the walk skips everything USRDFN refuses and stops at `HELP`, so the Add on a `USRDFN` record creates `HELP(10)` instead of `CLEAR`. Every other record type's default is unchanged (plain `CLEAR`, SFL `CHANGE`, MNUBAR `CLEAR`, PULLDOWN `HOME`).
- **A second flaw found on the way, fixed here because the new check would otherwise have spread it:** `guardedUpdate` ran the kind check on *every* change, including editing the response indicator of a row that already exists, so on a hand-written record that already carried an out-of-list row (a `USRDFN` record with `CLEAR(55)`, or an `SFL` record with `HOME(55)` - the latter already broken before this task) editing the response indicator was refused with "... cannot be added ...", which is wrong for an edit and blocks tidying. Only a real change of kind is checked now. This is the same mistake I-111 describes for the three other whitelist-guard functions (`wirePulldownGuardedFlag`, `wireUsrdfnGuardedFlag`, `wireUsrdfnGuardedTwoField`); I-111 is unchanged and still open for those.
- **Tests:** the nine `USRDFN|kind:*` / `USRDFN|add:rec-recind-rep` entries were removed from the I-104 sweep's `KNOWN_GAPS` (only the three `ALTNAME` entries, I-108, remain); new `i109RecordIndicatorUsrdfnWhitelist.test.js` (33 checks: the Add default per record type, all eight refused switches with the message and the revert, `HELP` -> `HLPRTN`, editing/removing an existing out-of-list row, and the SFL/MNUBAR/PULLDOWN switch guards still firing). Against the old code 19 of its checks fail.
- R2 still hides the Indicator tab on a `USRDFN` record, so this is a guard for hand-edited files and for R2 changing, as the finding said.

*Raised by I-104 (finding D). Size (estimate): Small.*

---

<a id="i-110"></a>

### I-110 — "+ Add" `HLPTITLE` (`USRDFN`, `SFL`) and `MNUBARDSP` (`USRDFN`): accepted although not whitelisted

> **Area:** Record · **Status:** Done (v0.10.185) · **Depends on:** I-104

Opened from a deferred finding raised by I-104 (finding E), verbatim:

**"+ Add" for `HLPTITLE` is accepted on `USRDFN` and `SFL` records and for `MNUBARDSP` on a `USRDFN` record** - none is on that record type's whitelist. `MOUBTN`'s Add is guarded correctly and is the model. Reachable (Help and General tabs). `KNOWN_GAPS` entries `USRDFN|add:rec-hlptitle-rep`, `SFL|add:rec-hlptitle-rep`, `USRDFN|add:rec-mnubardsp-rep`. Size: Small.

**Done.** Both record-level "+ Add" buttons now refuse with the whitelist reason and add nothing, the way `MOUBTN`'s (I-42) does:
- **`HLPTITLE`** - `wireHlptitlePanel` takes the same optional `addGuardFn` as `wireMoubtnPanel`; the record-level call site passes `usrdfnWhitelistConflictReason || sflWhitelistConflictReason || mnubarWhitelistConflictReason` (each is a no-op unless the record is that type, and `HLPTITLE` is on MNUBAR's list, so MNUBAR and plain records still add).
- **`MNUBARDSP`** - its existing guard (I-55) only checked the SFL whitelist; `usrdfnWhitelistConflictReason` is added. I-55 had left `USRDFN` out because I-8's per-keyword audit found no incompatibility statement for it. That reasoning predates I-49, which showed a `USRDFN` record's section is a closed "except" list, so the missing statement is exactly why the keyword is not allowed. The comment in `webviewClientHelpers.js` now says so.
- **Only the Add click is guarded.** A hand-written `USRDFN`/`SFL` record that already carries `HLPTITLE`/`MNUBARDSP` can still have the row edited or removed (tidying an invalid record is not blocked) - covered by a test, since I-111 is about exactly that mistake for other keywords.
- **Tests:** the three `KNOWN_GAPS` entries were removed from the I-104 sweep (it fails with "gap closed" otherwise), which now asserts the refusal for all four record types; new `i110HlptitleMnubardspAddGuard.test.js` (21 checks: the messages, nothing added and no change fired, neighbouring `MNUBARDSP`-on-SFL and `MOUBTN` guards unchanged, MNUBAR/plain still add, existing rows still editable/removable). Confirmed against the old code: 8 of its checks fail there. `i55RepeatableInstanceWhitelistGuard.test.js` asserted the opposite for `MNUBARDSP` on `USRDFN` ("intentionally unguarded"); that case and its header comment now assert the refusal.

*Raised by I-104 (finding E). Size (estimate): Small.*

---

<a id="i-111"></a>

### I-111 — `USRDFN` / `SFL` / `MNUBAR` guards run on every edit while the box is ticked, not on a real turn-on

> **Area:** Record · **Status:** Done (v0.10.187) · **Depends on:** I-84, I-102

Opened from a deferred finding raised by I-102, verbatim:

The "the box is ticked, so it must be an addition" flaw I-84 fixed for `RTNCSRLOC` also exists in `wirePulldownGuardedFlag` (and, by the same `present`-gated pattern read from the code but **not probed**, in `wireUsrdfnGuardedFlag` and `wireUsrdfnGuardedTwoField`): its `USRDFN`/`SFL`/`MNUBAR` checks run whenever the keyword's box is ticked, not on a real turn-on. Confirmed by probe on the record panels: on a hand-written `USRDFN` record that already carries `MDTOFF(1)` or `SLNO(3)`, editing the keyword's parameter is refused with "... cannot be specified on a user-defined (USRDFN) record format", and on an `SFL` record with `MDTOFF(1)` with "... cannot be added to a subfile (SFL) record format"; un-ticking works and a plain record edits normally. The message is wrong for an edit and it blocks tidying an already-invalid record. Same fix shape as I-84: gate on the real transition (the keyword was not already present), in each of the three functions, with a test per function. Size (estimate): Small–medium.

**Done.** All three wirers now check on a **real turn-on only**, I-84's "transition" definition (the keyword is being switched on **and** was not already on the record): `wireUsrdfnGuardedFlag` and `wirePulldownGuardedFlag` gate on `present && !getFileFlagKeyword(...).present`, `wireUsrdfnGuardedTwoField` on "either box non-blank and the keyword is not already on the record" (that keyword type has no `present` flag, so it looks the name up in the record's keywords). The whole chain of add-checks sits behind the gate (USRDFN, PULLDOWN, window, KEEP, PASSRCD, DSPMOD's DSPSIZ prerequisite, SFL, MNUBAR, ALWROL/CLRL/SLNO), so an edit is never re-reported and removing the keyword is always allowed.
- **All three probed, not just read.** Before the change, on hand-written records: `DSPMOD(*DS4)` on `USRDFN` (`wireUsrdfnGuardedFlag`), `SLNO(3)` on `USRDFN` and `MDTOFF(1)` on `SFL` (`wirePulldownGuardedFlag`), `HLPSEQ` and `CSRLOC` on `USRDFN` and `HLPSEQ` on `MNUBAR` (`wireUsrdfnGuardedTwoField`) were each refused when the parameter / a box was edited, with "... cannot be added / specified ..." - including the two functions the filing only read from the code.
- **Conditioning too, not just parameters.** Adding an indicator condition to an existing out-of-list keyword (`RETKEY` and `ALARM` on `USRDFN`, `CSRLOC` on `USRDFN`) went through the same refused `commit(conditions)`; also fixed, and tested through the row's real Conditioning UI.
- **Turning on is unchanged.** Ticking the box (or typing into the boxes) on a record type that forbids it is still refused with the right record-type wording, the control reverts and nothing is written; a plain record is unaffected.
- **Checked and left alone:** `wireKeepGuardedFlag` has the same `if (present)` shape, but `KEEP` has no parameter box and no Conditioning, so its commit only ever runs on the checkbox itself and there is no edit to misreport. A pre-existing quirk seen while testing (blanking only the *group* box of `HLPSEQ` leaves `" 1"` in the source and shifts the number into the group box) is unrelated to guarding, is the same on a plain record, and is not addressed here.
- **Tests:** new `i111GuardsOnRealTurnOnOnly.test.js` (38 checks, one block per function: edit / Conditioning / removal accepted on `USRDFN`, `SFL`, `MNUBAR` and `PULLDOWN` records, turn-on still refused with the right wording, plain-record controls); 17 of them fail against the pre-fix code.

*Raised by I-102. Size (estimate): Small–medium.*

---

<a id="i-112"></a>

### I-112 — `REFFLD`-inherited validity keywords (`CHECK`, `COMP`, `RANGE`, `VALUES`, `CHKMSGID`) and `FLTPCN` cannot be shown (research first)

> **Area:** Field · **Status:** Done (v0.10.188) · **Depends on:** I-74

Opened from a deferred finding raised by I-74, verbatim:

Validity-checking keywords (`CHECK`, `COMP`, `RANGE`, `VALUES`, `CHKMSGID`) and `FLTPCN` are inherited from a referenced field per the DDS Reference, but the DSPFFD outfile (`QWHDRFFD`) carries only a count of validity checks (`WHVCNE`) and no `FLTPCN` column, so the read-only inherited list cannot show them. Needs a research step first: another source for them (a catalog view, or DSPFFD `OUTPUT(*PRINT)`), or document it as a limit.

*Raised by I-74. Size (estimate): Small (research).*

**Done (v0.10.188) - research finished; outcome: a documented limit, plus one deferred finding.** Nothing here could be tested against a real IBM i (no system access from this environment), so what follows says what was and was not confirmed.

- **DSPFFD `OUTFILE` (`QADSPFFD` / `QWHDRFFD`) - no.** A published listing of the format (96 fields, from a 2004 release, so newer releases may have added columns) has `WHVCNE` ("Number of validity ...", a count) and no per-entry columns for `CHECK` / `COMP` / `RANGE` / `VALUES`, no message-id / message-file / library columns for `CHKMSGID`, and no `FLTPCN` column. IBM's own `DSPFFD` page does say the command reports a validity-check message identifier, message file and library, but that 2004 listing shows no matching columns, so that could not be reconciled without a real system. `WHVCNE`'s exact meaning (entries vs fields) is also unconfirmed, which is why it is not surfaced as a count.
- **`DSPFFD OUTPUT(*PRINT)` - not pursued.** Its spool layout is not documented anywhere found, so parsing it would be guesswork and fragile.
- **Catalog views (`QSYS2.SYSCOLUMNS` etc.) - nothing found.** They describe SQL objects; nothing turned up for DDS validity checking. Not verified on a system.
- **`QDBRTVFD` API - the one real candidate.** IBM documents a per-field validity-checking section (`Qdb_Qddfvchk`, reached through `Qddfvckd` in the field header, entries starting at `Qddfvcen`) in the `FILD0200` format. The exact layout could not be fetched (IBM Documentation blocks automated requests), and whether it covers `FLTPCN` is unknown. Reading it means calling the API and parsing a binary receiver, which needs a real IBM i to verify. Logged as a deferred finding below.
- **What changed (v0.10.188).** Documented as a limit in the product: the read-only "Inherited from referenced field" panel now always says the validity-checking keywords and `FLTPCN` are not listed and may still be passed on, and the empty-panel wording changed from "No keywords are inherited" to "No keywords are listed as inherited" (which was misleading for exactly this reason). `i74ReferenceInheritedKeywords.test.js` gained 3 checks (all 3 fail against the pre-change panel) and its old wording check was updated. The comment on `inheritableKeywordsFromDspffdRow` records the research.

---

<a id="i-113"></a>

### I-113 — "+ Fields from database file" (L14) writes an explicit length, data type and decimals next to `REFFLD` (decision first)

> **Area:** Field · **Status:** Done (v0.10.190) · **Depends on:** I-74

Opened from a deferred finding raised by I-74, verbatim:

**+ Fields from database file** (L14) still writes an explicit length, data type and decimals next to `REFFLD`. By the same IBM rule (position 29) a field that specifies them does not inherit the referenced field's editing or validity checking. Decide whether it should write a bare `R` field with `REFFLD` only (then resolve for the preview), which would also stop it writing packed/binary types into position 35 of a display file.

**Done.** Decision made first, as the task asked (with the user): **Option A** - write a bare `R` field with `REFFLD` only, then resolve for the preview. Options weighed: A (bare field), B (keep explicit attributes but only for a display-file-safe type - a smaller change, but it keeps the loss of inheritance, which is the actual defect) and C (leave it and document the limit - rejected, a working fix exists).

- **What is written now (`handleAddFieldsFromDatabase`, `extension.ts`):** `R` in position 29, the name, usage `B`, the location, and `REFFLD(<field> [<lib>/]<file>)`. Length, data type and decimals are blank - `insertField` was given `null` for all three. No other keyword is written. A packed or binary database type can therefore no longer reach position 35 of a display file (the engine already shows it as zoned, I-74).
- **Why the definitions still reach the designer:** `fetchDatabaseFileFields` now reads `SELECT *` (still `ORDER BY WHNAME, WHFOBO` / `WHFOBO`) and each listed field carries `keywords` from `DspfEngine.inheritableKeywordsFromDspffdRow` (the same function Resolve uses). The webview already echoes the picked field objects back in `addFieldsFromDatabase`, so no second DSPFFD call is needed: after the insert the host posts them as `referencesResolved`, keyed by `resolveReferenceTarget` + `referenceKey` of each field as it now stands in the source. The preview and the "Inherited from referenced field" panel are populated at once; nothing else is written into the document. A field renamed by the collision rule (`CUSTNO` -> `CUSTNO2`) is keyed by its `REFFLD` database field, not its own name.
- **`+n` / `-n` and inheritance now work on these fields:** a field with no own length/type/decimals inherits the referenced editing and validity keywords (I-74's `referenceSpecifiesOwnShape` is false for it); the tests show an edit code kept for the bare field and dropped for the old explicit shape.
- **I-88's conflict check is not needed at insert time:** it guards keywords on the field (`WRDWRAP`, `PSHBTNFLD`, `CHRID`, `DUP`, `BLKFOLD`, `SFLCHCCTL`), and a freshly added field carries only `REFFLD`. It still runs on every later Resolve.
- **Known limit (not new):** the resolved definitions live in the designer's memory (I-74). After the designer is closed and reopened, an added field draws at the unresolved default width until Resolve Referenced Field / Resolve All is used - the same as any hand-written reference field.

New `src/test/i113AddFieldsBareReference.test.js` (31 checks, added to the `test` script): the list query and the keywords on each listed field; the written source (position 29 `R`, columns 30-37 blank, no `P` in position 35, only `REFFLD` as a keyword, usage `B`); the `referencesResolved` message (one entry per field, exact key, definition contents); the designer side (effective length, zoned type, inherited `EDTCDE` kept, the old explicit shape contrast, `+2` -> 8); the collision-renamed key; an older webview's field list with no `keywords`; and an empty selection posting nothing. **18 of the 31 fail against the pre-change code** (verified by running the new file against the previously compiled `dist/` before the change; the other 13 describe behavior that did not change, e.g. `REFFLD` naming and the existing field being untouched). The existing L14 tests in `extension.test.js` / `dspfWebview.test.js` pass unchanged.

*Raised by I-74. Size (estimate): Small–medium.*

---

<a id="i-114"></a>

### I-114 — `HELP` / `HLPRTN` on a `USRDFN` record: reachable only through the raw keyword editor (decision first)

> **Area:** Record · **Status:** Done (v0.10.193) · **Depends on:** I-105

Opened from a deferred finding raised by I-105, verbatim:

**`HELP` / `HLPRTN` on a `USRDFN` record.** Both are on `USRDFN`'s whitelist and live in the record-indicator list, but R2 keeps the Indicator subtab out of a `USRDFN` record, so they are reachable only through the raw keyword editor - the same gap `INVITE` had. Decide whether to show an Indicator subtab limited to those two kinds (R2 recorded that real SDA's own `USRDFN` menu has none).

**Done.** Decision: **show an Indicator subtab on a `USRDFN` record, limited to `HELP` and `HLPRTN`** - I-105's own rule (decision (a): "hide every non-applicable row ... and show every applicable one"), which is what made `INVITE` reachable. Options weighed: (1) that; (2) leave them raw-editor-only, matching real SDA's `USRDFN` menu (`docs/sda-reference/screens/record-level/usrdfn/_menu-example/image26.png` shows General, Application help, Help, Print, ALTNAME, TEXT - no Indicator category) - rejected, it keeps two whitelisted keywords hidden and contradicts I-105. This is a **deliberate departure from real SDA's menu**, in the same way I-105 surfaced `INVITE` (which real SDA files under Output, also absent from its `USRDFN` menu).

- **The change is one line plus wording.** `recordKeywordsPanelsHtml` (`webviewClientHelpers.js`) no longer blanks the Indicator panel for a `USRDFN` record (the R2 line `restrictTo === 'USRDFN' ? '' : ind`). Everything else it needed already existed: the kind selector lists only whitelisted kinds (I-105), the kind guard refuses the rest (I-109), and "+ Add indicator keyword" defaults to `HELP(10)` on a `USRDFN` record (I-109). Nothing else on the panel passes `USRDFN`'s whitelist (`MOUBTN` is gated out), so the subtab is just the repeatable `HELP` / `HLPRTN` rows.
- **Status text.** The panel's generic intro (about `CLEAR` rows and the CA/CF keys panel) would mislead here, so a `USRDFN` record gets its own: it accepts only `HELP` (the Help key) and `HLPRTN` (return from help), each row independently conditioned and repeatable. Other record types keep the generic text.
- **Subtabs on a `USRDFN` record are now General / Indicator / Help / Print** (Output / Input / Overlay stay dropped). Plain (7), `SFL` (4), `SFLMSG` (none, I-115), `MNUBAR` (7) and `SFLCTL` are unchanged. A hand-written out-of-list row on a `USRDFN` record (say `CLEAR(55)`) still renders truthfully - it keeps its own kind in the selector - and nothing is rewritten by rendering it.
- **Comments** naming the old subset (`buildWebviewTemplate.js`, `dspfWriter.js`, the R2 block and `isUsrDfnRecord` in `webviewClientHelpers.js`) were updated.
- **Tests.** New `src/test/i114UsrdfnIndicatorSubtab.test.js` (25 checks, wired into `npm test`): the panel is non-empty with the `USRDFN` wording and no `MOUBTN`; Add creates `HELP(10)`; the selector offers exactly `HELP` / `HLPRTN`; `HELP` -> `HLPRTN` commits; a second row can be added; a hand-written `CLEAR(55)` renders truthfully and untouched; plain / `SFL` / `MNUBAR` panels unchanged; and in the real template the subtabs are General, Indicator, Help, Print, Add posts an edit that writes `HELP(10)` next to the untouched `USRDFN`, and switching to `HLPRTN` rewrites it. Against the old code 3 of its checks fail and it then crashes at the missing Add button. Three existing checks that encoded "a `USRDFN` record has no Indicator subtab" were updated: `dspfWebview.test.js`'s R2 scenario (4 subtabs, Indicator present) and two in `i105UsrdfnRecordRows.test.js`.

*Raised by I-105. Size (estimate): Small–medium.*

---

<a id="i-115"></a>

### I-115 — `SFLMSG` records' Keywords tab is still the full row set although every row is refused (decision first)

> **Area:** Record · **Status:** Done (v0.10.192) · **Depends on:** I-105

Opened from a deferred finding raised by I-105, verbatim:

**`SFLMSG` records' Keywords tab is still the full row set.** The whitelist for a message subfile is `SFLMSGRCD` only, so every row on that tab is refused; the same hide-the-rows rule would leave the tab empty. Decide whether to drop the tab for `SFLMSG` records (the SFLMSG tab already covers what applies).

**Done.** Decision made first, with the user: **hide all rows, keep the raw editor and Conditioning** - the same rule as I-105 (a), applied to a message subfile. Options weighed: (1) that; (2) drop the Keywords tab entirely - rejected, because the tab's raw editor and record-level Conditioning accordion are the only place a hand-written keyword can still be listed and removed (I-105's accepted hazard), and the SFLMSG tab's own Roll-keyword hint sends people to the raw editor; (3) leave it and document the limit - rejected, a working fix exists.

- **The rule.** `recordRestrictionAllows` / `recordKeywordsRestriction` (`webviewClientHelpers.js`) gained an `'SFLMSG'` restriction. A record carrying `SFLMSGRCD` (and not `USRDFN`) now gets it, checked before plain `SFL`. It delegates to the same `DspfWriter.sflWhitelistConflictReason` the guards use, called with an `SFL` + `SFLMSGRCD` marker, so its message-subfile branch (only `SFL` and `SFLMSGRCD` allowed) gates the rows: every one of the 29 keywords the rows can write is refused, so `recordKeywordsPanelsHtml(..., 'SFLMSG')` returns an empty string for all seven panels and renders no element id at all.
- **`renderRecordProps` (`buildWebviewTemplate.js`).** With no subtab left, the strip is not built (the old code read `rkTabs[0].id`, which would have thrown on an empty list). The Keywords tab shows a one-line note - no record keyword rows apply, the SFLMSG tab covers what a message subfile takes, hand-written keywords stay listed in the raw editor - followed by the unchanged "Advanced / raw keywords" and "Conditioning" accordions. Plain, `SFL` (I-105's four subtabs), `SFLCTL`, `MNUBAR` and `USRDFN` records are unchanged.
- **Two hints on the SFLMSG tab were wrong and are reworded.** The I-25 KEEP hint said `KEEP` "is on the base Record Keywords -> General tab above"; a message subfile's whitelist has never allowed `KEEP` (ticking it was refused), and after this change the row is gone, so it now says that a message-subfile record accepts only `SFLMSGRCD` besides `SFL`, so the base rows are not offered. The Roll-keyword hint said "the raw Keywords editor below" though the editor is on another tab; it now says "(Keywords tab)". `dspfWebview.test.js`'s I-25 check was updated to the new wording.
- **Found, not changed (out of scope) - opened as I-117.** The SFLMSG tab's own General and Indicator panels (`CHECK(AB)` / `CHECK(RL)`, `LOGINP`, `LOGOUT`, `CHGINPDFT`, `INDTXT` / `SETOF` / `CHANGE`) offer keywords that `sflWhitelistConflictReason` refuses on the same record. Probed with the panel's own wiring on an `SFL` + `SFLMSGRCD` record: ticking `CHECK(AB)`, `CHECK(RL)`, `LOGINP` and `LOGOUT` is **accepted with no alert** (only `SFLNXTCHG` is refused, by I-11). I-23 had recorded that only `LOGINP` / `LOGOUT` (advisory) and `SFLNXTCHG` (hard block) have a stated `SFLMSGRCD` rule in the DDS Reference; the closed list in the `SFL` section (`SFLMSGRCD`, `SFLMSGKEY`, `SFLPGMQ` for message subfiles) says otherwise. Which is right needs the reference read again, so nothing was changed.
- **Tests.** New `src/test/i115SflmsgKeywordsTab.test.js` (27 checks, wired into `npm test`): which whitelist governs a record (`SFL` + `SFLMSGRCD` and `SFLMSGRCD` alone -> `SFLMSG`, `USRDFN` still wins, plain `SFL` / `MNUBAR` / `SFLCTL` / plain unchanged); the row gate and the writer guard agree for all 29 keywords; all seven panels empty and no element ids; the full row set is still built without the restriction; a hand-written `INZRCD` is still listed in the raw editor; and, in the real template, the Keywords tab keeps no subtab strip and no base rows but shows the note, the raw editor and Conditioning, the SFLMSG tab is untouched, and a plain record still has 7 subtabs and a plain `SFL` record 4. **11 of the 27 fail against the pre-change code.** `i105UsrdfnRecordRows.test.js`'s "SFLMSG is not restricted" check now expects `'SFLMSG'`.

*Raised by I-105. Size (estimate): Small.*

---

<a id="i-116"></a>

### I-116 — Read a referenced field's validity checks (and `FLTPCN`) from the `QDBRTVFD` API

> **Area:** Field · **Status:** Done (v0.10.198) · **Depends on:** I-112

Opened from a deferred finding raised by I-112, verbatim:

**Read a referenced field's validity checks (and `FLTPCN`) from the `QDBRTVFD` API** (`FILD0200`, per-field `Qdb_Qddfvchk` section) so the inherited panel can list `CHECK` / `COMP` / `RANGE` / `VALUES` / `CHKMSGID` instead of just stating the limit. Needs a real IBM i to confirm the structure layout and whether `FLTPCN` is reachable. Also worth confirming there: whether newer `QWHDRFFD` releases carry message-id columns and what `WHVCNE` counts. Size: Medium (unverified).


**Progress (parser confirmed against three real captures).** `docs/sda-reference/source/Block B.txt`, `"Block - TESTPF2.txt"`, `"Block - TESTPFK.txt"` (all `FILD0200`, IBM i 7.3, CCSID 37) plus a `DSPFFD` `OUTFILE` capture (`"DSPFFD outfile.txt"`) made it possible to work out the layout without guessing, then confirm it. `src/qdbrtvfdParser.js` (dependency-free, UMD like `mnuCmdEngine.js`) decodes all three; `src/test/i116Qdbrtvfd.test.js` checks every field of all three captures against expectations written by hand from the DDS and the `OUTFILE` (never from the parser's own output), plus the failure paths, and every new code mapping was mutation-checked (a wrong `CHECK` or `COMP` code makes the matching golden check fail).

- **Layout confirmed.** Length-prefixed field entries from offset 256 (a fixed 312-byte part plus a validity section spliced in at +252 whose length is entry length − 312); entry attributes (type, length, digits, decimals, buffer position); validity entries `RANGE`, `VALUES`, `COMP`, `CHECK` and `CHKMSGID` (message id, file, library, optional `&field`); numeric values stored as zoned digits scaled by the field's decimals, negative via a D zone.
- **`CHECK` codes, all now known:** `ME`=0x64, `M10`=0xa0, `M11`=0xa1, `VN`=0xa2, `AB`=0xa3, `VNE`=0xa5, `M10F`=0xa6, `M11F`=0xa7. `ER`/`FE`/`LC`/`RB`/`RZ`/`RL`/`RLTB` (the DDS Reference's keyboard/cursor-control `CHECK` codes) were deliberately not captured - they're workstation behaviours with no meaning on a physical file's own field, so `REFFLD` has nothing to inherit there.
- **`COMP` operators, all 8 now known:** `GT`=0x73, `GE`=0x74, `EQ`=0x75, `NE`=0x76, `LE`=0x77, `LT`=0x78, `NL`=0x79, `NG`=0x7a. Confirmed type-independent (a character field's `GT`/`NE` used the same codes as numeric).
- **`FLTPCN`.** Still cannot be told apart from the implicit default: `TESTPF2`'s `FLDFLTIMPL` (`7F 2`, no `FLTPCN` keyword at all) came back byte-identical to Block B's `FLDSGL` (`7F 2`, explicit `FLTPCN(*SINGLE)`). The receiver may simply not carry that distinction.
- **Keyed files.** `TESTPFK` (Block B's own 16 fields plus a `K FLDME` spec) produced a byte-for-byte identical receiver to the unkeyed file - same header, same field entries. `FILD0200` does not surface key information at all; a keyed file with some other difference in its fields is still unconfirmed, and reading key info (if ever needed) will need a different call or format.
- **`WHVCNE` and `WHCSID` (the two questions I-112 left open, from the `DSPFFD OUTFILE` capture).** `WHVCNE` is the count of validity-check keyword *entries* on the field (`CHECK(AB) VALUES('A' 'B')` is 2, not the 2 values inside `VALUES`) - it matches `field.validity.entries.length` exactly for all 16 `TESTPF` fields. `WHCSID` is 37 (the job CCSID) for character fields and the sentinel 65535 ("no CCSID applies") for every numeric field - not a real per-field CCSID, so it isn't useful for `FLTPCN`/decoding purposes.
- **Access.** A plain `CALL QSYS.QDBRTVFD` did not work from SQL and a wrapper in `QTEMP` is refused; a CL-language external procedure in a real library (Block B) works. That means a permanent object on the user's system, so the extension needs a setting / consent and a fallback to today's documented limit.

**Wired in (v0.10.198), per the decision "Yes We will use iSDAtemp library":** `extension.ts`'s `fetchReferencedFieldValidity` calls `QDBRTVFD` (via a CL-language wrapper procedure this extension creates once, in a fixed library `ISDATEMP` - never `QTEMP`, never user-configurable) whenever "Resolve Referenced Field" runs, and merges the result into the same `keywords` array `fetchReferencedFieldAttributes` already fills from `DSPFFD` - both flow through `DspfEngine.inheritedReferenceKeywords` unchanged, so IBM's own shape-override rule (a field that specifies its own length/decimals/type gets neither editing nor validity keywords copied) applies to the QDBRTVFD-sourced ones too, automatically. Per the decision "if connection to IBM i is not [available], [show a] hint" - a fetch failure (no connection, cannot create/reach the library or procedure, field not found, receiver doesn't decode) never fails the resolve: `definition.validityChecked`/`validityError` tell `referenceInheritedHtml` (webviewClientHelpers.js) whether to show the keywords or the fallback hint, naming the actual reason. Nothing here is ever editable - same read-only chip as every other inherited keyword, so "also don't allow to edit" needed no separate wiring. The third decision, the `+n`/`-n` length editor for a reference field's own length override, turned out to already be shipped, in I-74 (v0.10.179) - confirmed, not re-built. New `i116ResolveFieldValidity.test.js` (the extension-host wiring, against a synthetic receiver built from Block B's own real captured bytes); extended `i74ReferenceInheritedKeywords.test.js` for the new hint states.

---

<a id="i-117"></a>

### I-117 — The SFLMSG tab's own General / Indicator panels accept keywords the message-subfile whitelist refuses (decision first)

> **Area:** Record · **Status:** Done (v0.10.194) · **Depends on:** I-115

Opened from a deferred finding raised by I-115, verbatim:

**The SFLMSG tab's own General / Indicator panels accept keywords the message-subfile whitelist refuses.** `sflWhitelistConflictReason` allows only `SFL` and `SFLMSGRCD` on a message subfile ("For message subfiles: SFLMSGRCD, SFLMSGKEY, SFLPGMQ" in the `SFL` section), but the SFLMSG tab's rows commit `CHECK(AB)`, `CHECK(RL)`, `LOGINP` and `LOGOUT` with no alert (probed; only `SFLNXTCHG` is refused, I-11), and also offer `CHGINPDFT` and `INDTXT` / `SETOF` / `CHANGE`. I-23 read the DDS Reference and found an explicit `SFLMSGRCD` rule only for `LOGINP` / `LOGOUT` ("ignored", advisory) and `SFLNXTCHG`. Re-read the sections and decide: guard the rows (and drop them, as I-105 / I-115 do), or loosen the whitelist. Size: Small–medium (a decision first).

**Done.** Decision made first, re-reading the `SFL` section and each individual keyword's own section fresh:

- **The `SFL` section's closed list is unambiguous.** It splits the subfile record format's own extra keywords into two mutually exclusive groups: "For message subfiles: `SFLMSGRCD` (required at the record level), `SFLMSGKEY` (required at the field level), `SFLPGMQ`" versus "For all other subfiles (at the record level): `CHANGE`, `LOGINP`, `CHECK(AB)`, `CHECK(RL)`, `LOGOUT`, `SETOF`, `CHGINPDFT`, `SETOFF`, `INDTXT`, `SFLNXTCHG`, `KEEP`, `TEXT`." Nothing in the section says the second group is also usable on a message subfile - the "for message subfiles" / "for all other subfiles" framing is the same closed-list shape I-46 already read this same text as, for `sflWhitelistConflictReason`.
- **`LOGINP`/`LOGOUT` are the one documented exception, not a precedent for the rest.** Each of their own dedicated sections states outright: "The IBM i operating system ignores LOGINP/LOGOUT for... The record format is a subfile record format for a message subfile." That is an explicit, individually-stated exception - accepted at compile time but functionally a no-op - which is exactly why I-23 gave them an advisory note instead of hiding them, and exactly why nothing else in the "for all other subfiles" list gets the same treatment by default.
- **`CHECK(AB)`, `CHECK(RL)`, `CHGINPDFT`, `INDTXT`, `SETOF`, `CHANGE` have no such statement anywhere.** Re-read each one's own section (`CHECK`, `CHGINPDFT`, `INDTXT`, `SETOF`, `CHANGE`) fresh for this task: none of them mentions a message subfile, `SFLMSGRCD`, or an "ignored"/"not valid" condition tied to one. They are simply outside this record type's keyword set per the `SFL` section's closed list, with no documented fallback behavior to base an advisory note on.
- **The decision: drop the rows**, not loosen the whitelist. Loosening `sflWhitelistConflictReason` would mean accepting keywords the DDS Reference's own closed list excludes, with no textual basis; dropping the rows keeps this tab's own panels honest about what a message-subfile record actually takes, matches what `sflWhitelistConflictReason` already refuses everywhere else (the raw editor, the base Keywords tab per I-115), and follows the same "hide rows that never apply" precedent I-105/I-115 already established rather than inventing a third pattern.
- **`sflMsgPanelsHtml` (`webviewClientHelpers.js`).** The General panel's `CHECK(AB)`, `CHECK(RL)` and `CHGINPDFT` rows are removed; its existing hint (previously "the base Record Keywords rows (KEEP and the rest) are not offered here") is reworded to name them explicitly: "...the base Record Keywords rows (KEEP, CHECK(AB)/CHECK(RL), CHGINPDFT, and the rest) are not offered here...". The Indicator panel's repeatable `INDTXT`/`SETOF`/`CHANGE` row list (`indicatorTextRowsHtml`) is replaced outright with a matching hint. `LOGINP`, `LOGOUT` (with their I-23 advisory notes) and the hard-blocked `SFLNXTCHG` (I-11) are unchanged.
- **`wireSflMsgPanels` (`webviewClientHelpers.js`).** The now-removed rows' wiring (`sm-check-ab`, `sm-check-rl`, `wireChgInpDftFlag('sm-chginpdft', ...)`, `wireIndicatorTextRows('sm-ind', ...)`) is deleted; nothing else in this function changed.
- **Tests.** `i98SflmsgGeneralConditioning.test.js` (I-98's original CHECK(AB)/CHECK(RL)/CHGINPDFT conditioning-toggle checks, now moot since those rows are gone) is rewritten: it keeps the still-relevant LOGINP-has-no-toggle and SFLNXTCHG/LOGOUT-keep-their-toggle checks, adds checks that `sm-check-ab`/`sm-check-rl`/`sm-chginpdft`/`sm-ind-row0-kw` no longer render at all, and keeps the LOGINP on/off and hand-edited-indicator-survives-an-unrelated-edit scenarios (trimmed to drop the removed keywords). `dspfWebview.test.js`'s R5 SFLMSG block and `i25KeepConsolidationAudit.test.js`'s hint-text check are updated for the reworded General-panel hint and the dropped rows. All 144 test files pass with zero failures after the change.

*Raised by I-115. Size (estimate): Small–medium.*

---

### I-118 — Remove dead code, test-only exports and unreferenced fixtures

> **Area:** Tooling · **Status:** Done (v0.10.200) · **Depends on:** I-40

Opened from the maintainability audit in [`MAINTAINABILITY-AUDIT.md`](MAINTAINABILITY-AUDIT.md) (section 2). Scope: `commandKeyNumbersInUse` and `guardedSimple` (no callers); the ~22 exports referenced only by tests (list in the audit) - confirm each has no dynamic call site, then delete it together with its own test checks, or move it to a test helper if a test legitimately needs it; delete `src/fixtures/generateMenubarFixture.js`, `generateWidgetFixture.js`, `generateWindowRefsFixture.js` and `smoketest.js` if still unreferenced. Every deletion must leave `npm test` green with the same or fewer checks explained in the commit.

Removed as genuinely dead, no callers anywhere: `commandKeyNumbersInUse`, `guardedSimple`, `wireTwoField` (production superseded each - S36-4's hand-rolled guards, `wireUsrdfnGuardedTwoField` in I-44); `getEditCodeParts`, `getFileQuotedTextConditions`, `setFileHlpPnlGrpKeyword`/`setFileHlpSchIdxKeyword`, `getMnubardspFields`/`setMnubardspFields`. Their own test coverage was removed alongside them, except where a still-live sibling function (`setFileQuotedText`, the HLPPNLGRP/HLPSCHIDX getters) needed the coverage kept - those tests were rewritten to exercise the live function directly instead of losing the check. 3 of the 4 fixture scripts were genuinely orphaned and removed; `smoketest.js` was kept (it's an actively-documented manual dev tool per `vsc-extension-quickstart.md`, not unreferenced) and `lineBuilder.js` was kept (still used by the real `generateFixture.js` pipeline). Full details and exact test-check-delta accounting in the CHANGELOG (v0.10.200).

**Deferred finding - opened as I-124:** 6 of the audit's ~22 test-only-export candidates turned out to carry an explicit "kept for backward compatibility/API completeness" note - in their own doc comment for 4 of them, but for 2 (`getInputKeywords`/`setInputKeywords`, `getGeneralFieldKeywords`/`setGeneralFieldKeywords`) only in a *different* file's comment (the code that superseded them) or the test file's own header. Left untouched this task: `getValidityCheck`/`setValidityCheck`, `getMessageId`/`setMessageId`, `setCommandKey`/`removeCommandKey`, `getReferenceOverrides`/`setReferenceOverrides`, `colorAttrEditorHtml`/`wireColorAttrEditor`, `getInputKeywords`/`setInputKeywords`, `getGeneralFieldKeywords`/`setGeneralFieldKeywords`, and `noOptionIndicatorKeywordNames` (exists "for tests and audits", a deliberate test/audit-facing accessor, not dead code). The "kept for API completeness" rationale for the first 4 explicitly cites `getColorAttr`/`setColorAttr` as precedent, but `getColorAttr`/`setColorAttr` actually still have a live production caller (`webviewClientHelpers.js`) - these don't. Whether that makes the "kept" rationale stale (no live caller left to be compatible with, since `DspfWriter` isn't a published external API) or still worth honoring is a genuine judgment call left to a human or a dedicated follow-up task, not decided here.

*Raised by the 2026-09-21 audit. Size (estimate): Small.*

---

### I-119 — De-duplicate copied helpers

> **Area:** Tooling · **Status:** Done (v0.10.204) · **Depends on:** I-118

**Done (v0.10.204).** Scope was the audit's own section 3 list; each item below either got a real fix, was re-verified and found already resolved, or was extracted the same way:

- **`escapeHtml`.** Two versions escaped different character sets (`dspfEngine.js`'s own also escaped `'`; `webviewClientHelpers.js`'s own didn't, but was null/undefined-safe where `dspfEngine.js`'s own wasn't). Picked one behaviour on purpose: escape the full `&`/`<`/`>`/`"`/`'` set AND treat null/undefined as `''` (several callers pass field names/params that can genuinely be null; printing the literal text "null"/"undefined" into the UI would be its own bug). `DspfEngine.escapeHtml` is now the canonical implementation; `WebviewClientHelpers.escapeHtml` delegates to it via a `DspfEngine` parameter its own UMD wrapper now injects (`require('./dspfEngine.js')` in Node, `root.DspfEngine` in the browser - the real webview already loads `dspfEngine.js`'s `<script>` tag before `webviewClientHelpers.js`'s, in both `buildWebviewTemplate.js` and `buildMenuWebviewTemplate.js`). No test file needed touching for this - unlike `DspfWriter`'s existing "caller sets `global.DspfWriter` before `require()`" convention, which was deliberately left alone.
- **`isPulldownRecord`.** Same shape, `webviewClientHelpers.js`'s own had a defensive `record.keywords || []` that `dspfEngine.js`'s own lacked. Adopted the defensive version as canonical in `DspfEngine.isPulldownRecord`; `WebviewClientHelpers.isPulldownRecord` delegates.
- **`assembleParams`.** Byte-for-byte identical between the file-level and record-level PRINT panels. Extracted to `assemblePrintParams(paramsEl, fileEl, libEl)`; both panels' own `assembleParams` now call it.
- **`makeDefaultInstance`.** Re-checked directly (hashed every occurrence's body) rather than trusting the audit's line numbers, which had drifted. No byte-identical pair remains in the current source - apparently resolved incidentally by other work landed since the 2026-09-21 audit. Left alone rather than force a merge between bodies that are no longer actually the same.
- **`wireRemoveButtons`.** Identical except the class-name suffix (menu-bar-choice rows vs. choice-keyword rows, both removing the row's own `.choice-row-block`). Extracted to `wireChoiceRowRemoveButtons(ownerKey, classSuffix)`.
- **`commitHlpdoc`.** File-level and help-spec-level HLPDOC panels shared the "all three parts required" validation and the `setFileFlagKeyword` call, differing only in which conflict-reason check runs first while the checkbox is on. Extracted to `wireHlpdocFields(idPrefix, getKeywords, onChange, checkConflict)`, with `checkConflict` (a thunk) carrying the one real difference.
- **Getter/setter clone pairs.** `getFileMsgLocLines`/`getSflMsgRcdLines` + their setters generalized to `getDisplaySizeConditionedLines`/`setDisplaySizeConditionedLines(keywords, keywordName, ...)`. `nextAvailableFieldName`/`nextAvailableRecordName` generalized to `nextAvailableName(usedNames, baseName, defaultBase)`. `dupFloatNewConflictReason`/`blkfoldFloatNewConflictReason` generalized to `floatIncompatibleKeywordNewConflictReason(keywordName, oldField, updates)`. All six original names are now thin wrappers - no call site needed changing.
- **`parseScreenSizes`/`parseDisplaySizeTriples` single source.** `dspfWriter.js`'s own comment already named the problem ("duplicated (not required-in) rather than shared via `require()`, since this file is dropped into the webview as a plain `<script>`"). Since `dspfEngine.js`'s own `<script>` tag already loads before `dspfWriter.js`'s in both webviews (confirmed in both `buildWebviewTemplate.js` and `buildMenuWebviewTemplate.js`), the same `require()`-in-Node/global-in-browser injection used for `escapeHtml` applies here too: `dspfWriter.js`'s UMD wrapper now takes a `DspfEngine` parameter, and `parseDisplaySizeTriples` is a one-line delegate to `DspfEngine.parseScreenSizes` (now exported, and given the null-safety `parseDisplaySizeTriples` already had).
- **`buildMenuWebviewTemplate.js` vs. `buildWebviewTemplate.js`.** Diffed the two files directly (`difflib` matching blocks) rather than guessing from the audit's 28%-shared-lines figure. Most of the overlap is small, scattered lines (CSS rules, short conditionals) not worth extracting on their own, but one genuine ~20-line function, `showConfirmDialog`, was pasted verbatim (the menu designer's own comment already said "ported verbatim from the DSPF designer's own commitDelete/showConfirmDialog"). Moved to `WebviewClientHelpers.showConfirmDialog`; both templates' own `showConfirmDialog` are now one-line wrappers, so none of their 5 combined call sites needed touching.

New `i119DedupHelpers.test.js` exercises every extracted/delegating function directly - including the `escapeHtml` behaviour decision, both parse functions agreeing on several inputs, and the round-trip/leak checks for the getter/setter pairs - confirmed failing against pre-fix code via `git stash`. No behaviour change anywhere else; full suite 150 files, 9,883 checks, 0 failures.

*Raised by the 2026-09-21 audit. Size (estimate): Small-medium.*

---

### I-120 — Shared test harness

> **Area:** Tooling · **Status:** Done (v0.10.201) · **Depends on:** I-40

Every test file defines its own `check()` (145 copies), and 223 `new JSDOM()` calls rebuild the 1.65 MB page. Scope: a `src/test/helpers/` module with one `check`/failure counter (or the built-in `node:test` runner), one `makeDom`/`mount` builder that caches the generated HTML per process, and the repeated `reparsedField`, `withAlertCapture`, `lastEdit`, `kwd` helpers; a runner script that discovers `*.test.js` so a new test can no longer be forgotten in `package.json`'s `test` script. Migrate files mechanically, keep every check label, and compare check counts before and after (6,799 at v0.10.195). Report suite wall time before and after.

**Done (v0.10.201).** Test-infrastructure only, no `src/` behaviour change; the suite before and after was compared per file.

- **One `check`.** New `src/test/helpers/harness.js` exports `check(label, condition)` and `failureCount()`, printing the same `  ok  -` / `FAIL  -` lines. All 149 test files dropped their private `let failures` / `check()` copy (two textual variants, matched exactly with an assert per file) and now import it; every `failures` reference became `failureCount()`. No check label was touched.
- **Shared helpers.** New `src/test/helpers/common.js`: `kwd`, `withAlertCapture`, `newWebviewDom(html, options)` (the `runScripts` / `resources` / `pretendToBeVisual` defaults every full-page test repeated) and `webviewHtml(...args)` (`getWebviewHtml` minus the CSP meta, cached per process). Only copies identical to the shared version were replaced - `kwd` in 12 files, `withAlertCapture` in 12, the `getWebviewHtml(...).replace(CSP)` idiom at 167 call sites, the JSDOM options block at 187. The other copy-pasted helpers (`reparsedField`, `lastEdit`, `mount`, `setup`, `makeDom`, `render`, `tick`) differ per file - they close over a file's own `posted` / `errors` arrays or a global `DspfParser` - so they were left in place rather than merged by guesswork.
- **A real runner.** New `src/test/run.js`; `npm test` now runs it. It discovers `src/test/*.test.js` (a new test can no longer be forgotten in `package.json`; the old 149-entry `&&` chain is gone), runs each file in its own process, keeps going after a failing file, prints a per-file `--- file: N ok, M failed, S s` line and a summary (files, checks, wall time, slowest), and exits non-zero on any failing exit code or `FAIL  -` line. `node src/test/run.js i106 dspfWriter` filters by name, `--list` lists, `--slow N` widens the slowest list.
- **Found while building the runner.** Reading child output through a pipe silently lost lines: `dspfWriter.test.js` reported 295 of its 490 checks in one full run, still exiting 0, because tests end in `process.exit()` and a pipe can drop its tail under load. The runner sends child output to a temp file instead (synchronous, nothing lost).
- **Verification.** 149 files and **9,887 checks** (counted at run time; the audit's 6,799 was a static count of `check(` calls, loops excluded) before and after, identical per file, 0 failures. Wall time on a shared single core: 494 s before, 488 s after - essentially unchanged, because the cost is jsdom parsing and executing the page, which cannot be cached; the per-process HTML cache only removes the string generation. Consolidating jsdom builds (one page per suite) needs test-by-test state review and is not part of this mechanical step.

*Raised by the 2026-09-21 audit. Size (estimate): Medium.*

---

### I-121 — One declarative rule spec per keyword

> **Area:** Cross-level · **Status:** In progress (USRDFN slice done v0.10.205; WINDOW slice done v0.10.206; PULLDOWN slice done v0.10.207; MNUBAR slice done v0.10.208; SFL slice done v0.10.209; KEEP/ALWROL/CLRL/SLNO/ASSUME slice done v0.10.210; SFLNXTCHG/SFLMSGRCD + DSPMOD/SFL slice done v0.10.211; HLPDOC/HLPBDY/HLPPNLGRP/HLPRCD slice done v0.10.212) · **Depends on:** I-40, I-119

Rules for one keyword currently live in `*ConflictReason` functions (67), rule tables (~15), UI row/guard wiring and hand-generated docs. Scope: a spec module (levels, record types, data types and usage, parameter grammar and sub-parameters, requires / excludes, whitelist membership, option-indicator rules, UI panel, row and gating), seeded from the existing tables and `KEYWORD-LOOKUP.json`, and **each entry verified against `DDS_Keyword_V7r6.txt`**, not against the code. Then re-express the `*ConflictReason` functions over it, one record type at a time, with the existing tests as the safety net. Make the keyword index generated from the spec so I-40 is the last hand regeneration.

*Raised by the 2026-09-21 audit. Size (estimate): Large - split by record type when claiming.*

**USRDFN slice (v0.10.205).** New `src/keywordSpec.js` - a dependency-free UMD module, same shape as `dspfEngine.js`, loaded before `dspfWriter.js` in both webviews (and via `require` in Node) - holding `RECORD_TYPES.USRDFN`: the 9-keyword closed whitelist (re-verified fresh against `DDS_Keyword_V7r6.txt`'s own USRDFN section, unchanged from what the code already had), the exact DDS Reference citation text, the derived `indicatorKinds` (`HELP`/`HLPRTN` - Task I-114's own finding, now data instead of only living in a fallback-order loop's outcome), and `keywordTabs` (the General/Indicator/Help/Print subset Task R2/I-114 narrow a USRDFN record's Keywords tab to).

Investigating the actual duplication before writing the spec found it narrower than the task's own framing suggested: most of USRDFN's UI-side gating (which rows render, which indicator kinds the dropdown offers, the "+ Add indicator keyword" fallback order) already reads dynamically off a single whitelist array via `recordRestrictionAllows`/`ok()` rather than re-hardcoding it - this codebase's own prior audits (I-105, I-109, I-114) had already collapsed that layer. The one real duplication left was in `dspfWriter.js` itself: `usrdfnConflictReason` and `usrdfnWhitelistConflictReason` were two separate functions holding the *same* whitelist array and the *same* lookup, differing only in their returned message's wording - kept as two names only because roughly 50 call sites across `webviewClientHelpers.js` reference one or the other. Both now delegate to a single `usrdfnWhitelistCheck(keywordName, recordKeywords, message)` helper backed by `KeywordSpec.isWhitelisted('USRDFN', ...)`; both exported names, their signatures, and their exact message wording are unchanged, so none of those ~50 call sites needed touching. `USRDFN_WHITELIST_KEYWORDS` (the old hand-written array) is gone; the array now lives once, as data, in `keywordSpec.js`.

New `src/test/i121UsrdfnKeywordSpec.test.js`: confirms the spec's whitelist and citation text against the DDS Reference directly; sweeps all 186 keyword names in `KEYWORD-LOOKUP.json` confirming `usrdfnConflictReason` and `usrdfnWhitelistConflictReason` still agree with the spec on every one (so a future accidental second hand-written array would be caught); and confirms `indicatorKinds` is exactly the whitelist-only subset of the ten kinds the shared Indicator-instance component supports. This is a pure refactor (data relocated, one duplicate function body removed) with no behavior change, so there is no pre-fix regression to reproduce via `git stash` the way a bug fix would have; the full suite (151 files, 9,910 checks) is the safety net instead. Full suite: zero failures.

**WINDOW slice.** `RECORD_TYPES.WINDOW` added to `keywordSpec.js` - the first non-whitelist shape in the spec. WINDOW's own DDS Reference section (re-verified fresh against `DDS_Keyword_V7r6.txt`, unchanged from what the code already had) states a closed six-keyword **mutex**, not a whitelist: "The WINDOW keyword is not allowed on a record format that has any one of the following keywords specified: ALWROL, ASSUME, MNUBAR, PULLDOWN, SFL, USRDFN" - genuinely bidirectional in the source text itself (a record with WINDOW can't gain one of the six; a record with one of the six can't gain WINDOW), unlike USRDFN's one-directional "only these are allowed on a USRDFN record." SFLCTL is a named exception ("WINDOW keyword is allowed on a record with the SFLCTL keyword") and is deliberately not in the mutex list; PASSRCD has its own separate, already-fixed (I-24) restriction and is likewise not part of this list.

New `KeywordSpec.isMutex(recordType, keywordName)` alongside the existing `isWhitelisted` - the general shape for a closed exclusion list rather than a closed inclusion list. `dspfWriter.js`'s `windowMutexConflictReason` (Task I-47's own function) now delegates both directions of its check to `KeywordSpec.isMutex('WINDOW', ...)` instead of the hand-written `WINDOW_MUTEX_KEYWORDS` array, which is gone. `windowConflictReason` (Task I-12, the older one-directional ALWROL/ASSUME checkbox guard) is untouched - it's a different call site with its own reasoning, not part of this slice.

New `src/test/i121WindowKeywordSpec.test.js`: confirms the spec's mutex list and citation text against the DDS Reference directly (plus confirms WINDOW/SFLCTL/PASSRCD are each correctly absent from the list, for the reasons above); sweeps all 185 non-WINDOW keyword names in `KEYWORD-LOOKUP.json` confirming `windowMutexConflictReason` agrees with the spec in **both** directions (WINDOW-record-gains-keyword and keyword-record-gains-WINDOW) on every one; and confirms the SFLCTL exception is unaffected in either direction. Pure refactor, no behavior change - full suite (152 files, 9,921 checks) is the safety net. Full suite: zero failures.

**PULLDOWN slice.** `RECORD_TYPES.PULLDOWN` added to `keywordSpec.js`, reusing the mutex shape (`isMutex`) the WINDOW slice introduced - PULLDOWN's own DDS Reference section states the same "cannot be specified on a record with the PULLDOWN keyword" bidirectional mutex, just a much larger 27-keyword list (re-verified fresh against `DDS_Keyword_V7r6.txt`, unchanged from what the code already had: ALARM, ALTNAME, ALWGPH, ALWROL, ASSUME, CLEAR, CLRL, ERASE, ERASEINP, FRCDTA, HLPCLR, HLPSEQ, INVITE, INZRCD, MDTOFF, MNUBAR, OVERLAY, OVRATR, OVRDTA, PUTOVR, PUTRETAIN, RTNDTA, SFL, SLNO, USRDFN, WDWTITLE, WINDOW). `dspfWriter.js`'s `pulldownConflictReason` (Task I-13) now delegates both directions to `KeywordSpec.isMutex('PULLDOWN', ...)` instead of its own hand-written `PULLDOWN_CONFLICT_KEYWORDS` array, which is gone.

New `src/test/i121PulldownKeywordSpec.test.js`, mirroring the WINDOW slice's own test shape: confirms the spec's mutex list and citation text against the DDS Reference directly; sweeps all 185 non-PULLDOWN keyword names in `KEYWORD-LOOKUP.json` confirming `pulldownConflictReason` agrees with the spec in both directions. Pure refactor, no behavior change - full suite (153 files, 9,928 checks) is the safety net. Full suite: zero failures.

**MNUBAR slice.** `RECORD_TYPES.MNUBAR` added to `keywordSpec.js` - a whitelist shape like USRDFN's own slice (not the mutex shape WINDOW/PULLDOWN used), re-verified fresh against `DDS_Keyword_V7r6.txt`'s "The following keywords are allowed on a record containing the MNUBAR keyword:" 27-entry table. Genuinely new wrinkle: two of those 27 entries, `CAnn` and `CFnn`, are written in the DDS Reference itself as a placeholder pattern (n = a two-digit number), not literal keyword names - and this codebase models each instance as an individual literal keyword (`CA01`..`CA24`/`CF01`..`CF24`), so the fixed `whitelist` array alone couldn't express membership for these two entries. New `whitelistPatterns` field (`[/^CA\d{2}$/, /^CF\d{2}$/]`) added alongside `whitelist`, and `KeywordSpec.isWhitelisted` now checks it as a fallback after the literal array - still the same "is this keyword one of the allowed ones" question, just regex-matched for these two entries. `PAGEDOWN`/`PAGEUP` and `ROLLUP`/`ROLLDOWN` are DDS synonym pairs (not four distinct keywords) and are both spelled out literally in `whitelist`, same treatment PULLDOWN's own slice gave `WINDOW`.

`dspfWriter.js`'s `mnubarWhitelistConflictReason` (no prior task number - "had NO existing guard of any kind before" per its own doc comment) now delegates to `KeywordSpec.isWhitelisted('MNUBAR', ...)` instead of its own hand-written `MNUBAR_WHITELIST_KEYWORDS` array plus inline `/^CA\d{2}$/`/`/^CF\d{2}$/` regex test, both now gone.

New `src/test/i121MnubarKeywordSpec.test.js`: confirms the spec's whitelist array, `whitelistPatterns`, and citation text against the DDS Reference directly; directly exercises `isWhitelisted` against all 48 `CA01`..`CA24`/`CF01`..`CF24` instances plus five deliberately-non-matching near misses (`CA1`, `CAA1`, `CA100`, `CFxx`, `CB01`); sweeps all 186 keyword names in `KEYWORD-LOOKUP.json` confirming `mnubarWhitelistConflictReason` agrees with the spec on every one; and re-confirms all 48 `CAnn`/`CFnn` instances are allowed via the writer function directly, since they're not literal entries in `KEYWORD-LOOKUP.json`'s own keyword universe. Pure refactor, no behavior change - full suite (154 files, 9,941 checks) is the safety net. Full suite: zero failures.

**SFL slice.** SFL's own DDS Reference section states TWO mutually exclusive closed whitelists under one "Besides SFL, the following keywords are also valid on the subfile record format:" heading, split by whether the record is a message subfile - so this slice adds two spec entries, `RECORD_TYPES.SFL` (plain subfile) and `RECORD_TYPES.SFLMSG` (message subfile), not one. Both re-verified fresh against `DDS_Keyword_V7r6.txt`, unchanged from what the code already had: SFL's own whitelist is CHANGE, LOGINP, CHECK(AB)/CHECK(RL) (one keyword, two parameter values - matched by name only), LOGOUT, SETOF, CHGINPDFT, SETOFF, INDTXT, SFLNXTCHG, KEEP, TEXT; SFLMSG's is just SFLMSGRCD (SFLMSGKEY and SFLPGMQ are explicitly field-level per the DDS Reference's own text, not record-level, so they're outside this record-level whitelist's scope, matching the code's pre-existing behavior).

SFLMSG is a genuinely new *shape* in the spec: a record type identified by **two** marker keywords present together (SFL **and** SFLMSGRCD), not one - hence a new `markerKeywords` array field (plural), distinct from every other entry's singular `markerKeyword`. SFLCTL was also re-read fresh per this task's own instruction and needs no whitelist entry of its own: its DDS Reference section introduces its keyword tables as an explicit "SUMMARY OF SUBFILE KEYWORDS", not a closed "nothing else applies" list the way USRDFN's/SFL's own sections do (already noted in `sflWhitelistConflictReason`'s pre-existing doc comment, Task I-46's original finding) - so this single slice ends up covering both the "SFL/SFLCTL" and "message subfile" record types the task's own remaining-work list had listed as two separate future slices.

`dspfWriter.js`'s `sflWhitelistConflictReason` (Task I-46) now delegates to `KeywordSpec.isWhitelisted('SFL', ...)` and `KeywordSpec.isWhitelisted('SFLMSG', ...)` instead of its own hand-written `SFL_RECORD_WHITELIST_KEYWORDS` array plus inline SFL/SFLMSGRCD literal checks, both now gone.

New `src/test/i121SflKeywordSpec.test.js`: confirms both spec entries' whitelists and citation text against the DDS Reference directly (including that SFLMSGRCD is absent from the plain-SFL whitelist and SFLMSGKEY/SFLPGMQ are absent from the message-subfile one); sweeps all 186 keyword names in `KEYWORD-LOOKUP.json` confirming `sflWhitelistConflictReason` agrees with the spec in both the plain-SFL and message-subfile cases; confirms CHANGE (allowed on plain SFL) is correctly blocked on a message-subfile record, since the DDS Reference's two lists are mutually exclusive; and confirms a record with SFLMSGRCD but no SFL is untouched by this function (SFL itself remains the function's own outer gate). Pure refactor, no behavior change - full suite (155 files, 9,956 checks) is the safety net. Full suite: zero failures.

**KEEP/ALWROL/CLRL/SLNO/ASSUME slice.** A well-scoped piece of the "plain/base record" remainder rather than the whole undertaking - covers the existing `keepMutexConflictReason` (I-28) and `alwrolClrlSlnoConflictReason` (I-37) functions' own rule webs. Unlike WINDOW/PULLDOWN, none of these five is a record-TYPE identifier written once by a creation wizard - they're ordinary toggleable flags any record can carry - but the DDS Reference states their restrictions in the same closed-mutex shape, so five new `RECORD_TYPES` entries reuse `mutex`/`isMutex`, all re-verified fresh against `DDS_Keyword_V7r6.txt`, unchanged from what the code already had:
- `KEEP.mutex` = ALWROL, CLRL, SLNO
- `ALWROL.mutex` = `CLRL.mutex` = `SLNO.mutex` = ASSUME, SFL, SFLCTL, USRDFN (identical three-way list; KEEP itself is deliberately not repeated here - that pair is modeled once, on the `KEEP` entry above, to avoid two sources of truth for the same relationship)
- `ASSUME.mutex` = ALWROL, CLRL, SLNO - **deliberately narrowed**, not the fuller six-keyword list (ALWROL, CLRL, SFL, SLNO, USRDFN, USRDSPMGT) ASSUME's own DDS Reference section states. This matches `alwrolClrlSlnoConflictReason`'s own pre-existing, already-reasoned scope: SFL/USRDFN are record-type identifiers with no reachable reverse UI transition to guard, and USRDSPMGT is a separate S36E concern handled elsewhere - so only the confirmed-bidirectional ALWROL/CLRL/SLNO subset is modeled on this entry. A future slice widening ASSUME's own coverage would need to widen this comment and the `mutex` array together, not just the array alone.

New `KeywordSpec.mutexKeywords(recordType)` accessor alongside `isMutex` - returns a safe-to-`.filter()` copy of a record type's own mutex list, for the two call sites that need the actual conflicting names to join into a message rather than just a yes/no answer.

`dspfWriter.js`'s `keepMutexConflictReason` now delegates to `KeywordSpec.isMutex('KEEP', ...)`/`mutexKeywords('KEEP')` instead of its own hand-written `KEEP_MUTEX` array; `alwrolClrlSlnoConflictReason` now delegates to `mutexKeywords(keywordName)` (for ALWROL/CLRL/SLNO, each reading its own identical-content entry) and `mutexKeywords('ASSUME')` instead of its own hand-written `TARGET` and inline `['ASSUME','SFL','SFLCTL','USRDFN']` arrays.

New `src/test/i121KeepAlwrolClrlSlnoAssumeKeywordSpec.test.js`: confirms all five spec entries' mutex lists and citation text against the DDS Reference directly, including that ASSUME's own entry is correctly narrowed (SFL/USRDFN/USRDSPMGT absent) and that KEEP is absent from ALWROL/CLRL/SLNO's own entries (modeled once); sweeps all 186 keyword names in `KEYWORD-LOOKUP.json` confirming both writer functions agree with the spec from every angle each function itself supports (KEEP both directions; ALWROL/CLRL/SLNO and ASSUME each turning on); and spot-checks the ALWROL<->ASSUME reciprocal pair from both sides plus a keyword outside the five being universally unrestricted. Pure refactor, no behavior change - full suite (156 files, 9,977 checks) is the safety net. Full suite: zero failures.

**SFLNXTCHG/SFLMSGRCD + DSPMOD/SFL slice.** Two more small, closed-form record-level pairs, each already its own dedicated guard function. `RECORD_TYPES.SFLNXTCHG.mutex = ['SFLMSGRCD']` - a plain symmetric single-keyword mutex, re-verified fresh against `DDS_Keyword_V7r6.txt`'s "You cannot specify SFLNXTCHG with the SFLMSGRCD keyword." `RECORD_TYPES.DSPMOD.mutex = ['SFL']` - genuinely **one-directional**, unlike every mutex entry so far: DSPMOD's own DDS Reference section states "The DSPMOD keyword cannot be specified on a subfile record (SFL keyword)" about DSPMOD being added to an already-SFL record, not the reverse (SFL's own section says nothing about DSPMOD, and the pre-existing `dspmodSflConflictReason` never checked that direction either) - modeled with the same `mutex` shape anyway (rather than inventing a one-directional-only variant for a single pair), with the writer function itself simply never invoking `isMutex` in the reverse direction, the same restraint the KEEP/ALWROL/CLRL/SLNO slice's SFL/SFLCTL/USRDFN partners already got.

`dspfWriter.js`'s `sflNxtchgSflMsgRcdConflictReason` (I-23) now reads its partner name via `KeywordSpec.mutexKeywords('SFLNXTCHG')[0]` instead of its own inline ternary; `dspmodSflConflictReason` now delegates its SFL check to `KeywordSpec.isMutex('DSPMOD', ...)`.

New `src/test/i121SflnxtchgDspmodKeywordSpec.test.js`: confirms both spec entries' mutex lists and citation text against the DDS Reference directly; confirms `sflNxtchgSflMsgRcdConflictReason` is symmetric (blocks from either side) while `dspmodSflConflictReason` stays one-directional (SFL added to a DSPMOD record is untouched by this function). Pure refactor, no behavior change - full suite (157 files, 9,988 checks) is the safety net. Full suite: zero failures.

Remaining for I-121 after this slice: the rest of the plain/base record and file levels (the largest and least closed-form piece of all - most of the remaining `*ConflictReason` functions' rules), still not split into smaller pieces.

**HLPDOC/HLPBDY/HLPPNLGRP/HLPRCD slice (v0.10.212).** Another well-scoped piece of the plain/base-record-and-file-level remainder: the Help-keyword mutex web spread across three existing functions - `hlpdocConflictReason` (file-level, I-38), `hlpdocHspecConflictReason` (H-specification-level, I-67), and `hlprcdConflictReason` (file-level, no prior task number, "had NO conflict check of any kind before now" per its own doc comment) - each independently re-embedding the same DDS-Reference-stated pairings as bare string-literal comparisons rather than reading them from one place.

Re-verified fresh against `DDS_Keyword_V7r6.txt`'s own HLPDOC/HLPBDY/HLPPNLGRP/HLPRCD/HLPRTN sections, four distinct pairwise relationships (HLPDOC<->HLPBDY, HLPDOC<->HLPPNLGRP, HLPDOC<->HLPRTN, HLPPNLGRP<->HLPRCD) turned out to need only two new spec entries, each modeled once (matching the "avoid two sources of truth for the same pair" principle the KEEP/ALWROL/CLRL/SLNO/ASSUME slice already established) even though some pairings are independently restated from both sides in the DDS Reference's own prose: `RECORD_TYPES.HLPDOC.mutex = ['HLPBDY', 'HLPPNLGRP', 'HLPRTN']` (from HLPDOC's own section: "You cannot specify HLPDOC with HLPBDY, HLPPNLGRP, or HLPRTN"), and `RECORD_TYPES.HLPPNLGRP.mutex = ['HLPRCD']` (the OTHER half of HLPPNLGRP's own section - the HLPDOC half is already on the HLPDOC entry, not repeated). HLPRTN's own section states a priority rule ("takes priority over any HLPRCD, HLPPNLGRP, or HLPDOC keywords"), not a prohibition, so it is deliberately not a mutex partner of HLPRCD or HLPPNLGRP here - unchanged from this codebase's own pre-existing scope decision (I-90's finding, restated in `hlprcdConflictReason`'s own doc comment). HLPRCD and HLPDOC are likewise deliberately never checked against each other by either entry - nowhere does the DDS Reference forbid that pairing.

Since the three consumer functions each have their own bespoke scope per pairing (same-record array presence, same-H-spec presence, or file-wide presence via `anyHelpKeywordPresentInFile`) rather than a single shared iteration loop, this slice keeps each function's existing explicit per-name branches - each bare string-literal keyword name in an `if` condition is now sourced from `KeywordSpec.isMutex('HLPDOC', ...)`/`isMutex('HLPPNLGRP', 'HLPRCD')` instead, with the surrounding scope logic (which array or file-wide search each branch consults) untouched.

New `src/test/i121HlpdocHlprcdKeywordSpec.test.js`: confirms both spec entries' mutex lists and citation text against the DDS Reference directly (including that HLPPNLGRP's own entry deliberately omits HLPDOC, modeled once on the HLPDOC entry instead); exercises `hlpdocConflictReason` in both directions for HLPPNLGRP and HLPRTN; exercises `hlpdocHspecConflictReason` for HLPBDY (same-spec scope) and HLPPNLGRP (file-wide scope via a minimal `.fileKeywords`/`.records[].helpEntries[].keywords` model fixture), confirming HLPRTN is still never checked there; and exercises `hlprcdConflictReason` in both directions for HLPPNLGRP plus confirms HLPRCD/HLPDOC still coexist freely. Pure refactor, no behavior change - full suite (158 files, 10,008 checks) is the safety net. Full suite: zero failures.

Remaining for I-121 after this slice: the rest of the plain/base record and file levels (the largest and least closed-form piece of all - most of the remaining `*ConflictReason` functions' rules), still not split into smaller pieces.

---

### I-122 — Generated keyword x dimension test matrix; retire duplicate and stale tests

> **Area:** Tooling · **Status:** Not started · **Depends on:** I-120, I-121

Generate tests from the I-121 spec: L1 pure rule checks, L2 parse/write round-trip of parameters and sub-parameters, L3 UI display and selection (one jsdom per record type iterating rows), L4 behaviour through each commit path (checkbox, raw keyword editor, Basic tab). Cover the keywords with no tests today (`RMVWDW`, `SFLCSRRRN`, `SFLDLT`, `USRRSTDSP`, ...). Migration rule: map each existing `check()` to a keyword x dimension cell; delete it only when a generated cell covers it **and** a stash-based mutation run shows the generated cell fails when the rule is broken; keep unique regressions. Report the before/after check count and suite time.

*Raised by the 2026-09-21 audit. Size (estimate): Large - batch by level.*

---

### I-123 — Move "Task I-nn" history out of source comments

> **Area:** Tooling · **Status:** Not started · **Depends on:** I-121

35-48% of lines in the big source files are comments and about 1,100 lines cite a task ID. Keep comments that state a rule or a DDS Reference citation; move task narrative (what was wrong before, which session found it) to this file and the git log, leaving at most a one-line "see I-nn". Best done alongside I-121 so each rule's citation lives in the spec. Mechanical, no behaviour change: the test suite and the compiled output must be unchanged apart from comments.

*Raised by the 2026-09-21 audit. Size (estimate): Medium.*

---

<a id="i-124"></a>

### I-124 — Test-only exports that still carry a "kept for backward compatibility" note (decision first)

> **Area:** Tooling · **Status:** Done (v0.10.202) · **Depends on:** I-118

Opened from a deferred finding raised by I-118, verbatim:

**6 of the audit's test-only-export candidates carry an explicit "kept for backward compatibility/API completeness" note.** `getValidityCheck`/`setValidityCheck`, `getMessageId`/`setMessageId`, `setCommandKey`/`removeCommandKey`, `getReferenceOverrides`/`setReferenceOverrides`, `colorAttrEditorHtml`/`wireColorAttrEditor`, `getInputKeywords`/`setInputKeywords` and `getGeneralFieldKeywords`/`setGeneralFieldKeywords` have no live production caller. The note sits in their own doc comment for 4 of them; for `getInputKeywords`/`setInputKeywords` and `getGeneralFieldKeywords`/`setGeneralFieldKeywords` it sits only in a different file's comment (the code that superseded them) or the test file's own header. The note cites `getColorAttr`/`setColorAttr` as precedent, but those still have a live production caller in `webviewClientHelpers.js`. Decide whether the "kept" rationale is stale (there is no live caller to stay compatible with, and `DspfWriter` is not a published external API) or still worth honoring. If stale, delete each pair with its own test coverage, as I-118 did for the pairs it removed; if honored, reword the comments so they no longer claim a precedent that does not hold. `noOptionIndicatorKeywordNames` stays regardless (a deliberate test/audit accessor).

**Decision: the "kept for backward compatibility" rationale is stale - delete.** Evidence:

- `DspfWriter` is not a published API. The extension's entry point is `dist/extension.js`, `.vscodeignore` excludes `src/**` from the VSIX, and the README documents no programmatic API. There is no external caller to stay compatible with.
- Every remaining "caller" of the listed accessors was a test. The precedent the notes cite, `getColorAttr`/`setColorAttr`, was live only through `colorAttrEditorHtml`/`wireColorAttrEditor` - and those two had no production caller either (only an export line and comments). The whole chain was dead, so the note's precedent did not hold.
- The finding text says "6" but names 7 pairs; with the colour chain that is 8 pairs.

**Done (v0.10.202).** Deleted from `src/dspfWriter.js`: `getValidityCheck`/`setValidityCheck`, `getMessageId`/`setMessageId`, `setCommandKey`/`removeCommandKey`, `getReferenceOverrides`/`setReferenceOverrides`, `getInputKeywords`/`setInputKeywords`, `getGeneralFieldKeywords`/`setGeneralFieldKeywords`, `getColorAttr`/`setColorAttr` (with their doc comments and export lines); and from `src/webviewClientHelpers.js`: `colorAttrEditorHtml`/`wireColorAttrEditor`. Source diff +32 / -363 lines; the generated webview template is about 19 KB smaller. `noOptionIndicatorKeywordNames` stays (a deliberate test/audit accessor). Live replacements were already in place: the `...Instances` / `...States` functions, `getFileFlagKeyword`/`setFileFlagKeyword`, and `setCommandKeyAt`/`removeCommandKeyAt`.

- **Comments.** Every comment that pointed at a deleted function was reworded so nothing dangles (26 references). `referenceOverridesHtml` is live, so it stays, but its comment no longer claims it is exported "for backward compatibility" - it is exported so one test can render it alone.
- **Tests.** Six test blocks that only exercised the deleted accessors were removed (43 checks in `dspfWriter.test.js`), plus the legacy-editor block in `colorAttrPgmField.test.js` (2 checks) and one legacy assertion in `validityCheckInstances.test.js` (1 check). `setCommandKey`/`removeCommandKey` were also used as fixture builders in 14 places (`dspfWriter.test.js`, `dspfEngine.test.js`), so those were rewritten to `setCommandKeyAt`/`removeCommandKeyAt` with every check label kept (replace-by-number cases now look up the instance index first). One CHECK-coexistence assertion now uses `setValidityCheckInstances` in place of `setValidityCheck`.
- **Verification.** Full suite: 149 files, **9,841 checks** (9,887 before, minus exactly the 46 removed), 0 failures; `npm run compile` clean.

*Raised by I-118. Size (estimate): Small.*

---
