# Known limitations — follow-up task breakdown

Source: the "Known limitations" section in the main
[`README.md`](../../README.md), DSPF (screen) designer subsection. This
tracks the subset of those limitations that are genuinely actionable
follow-up work, broken into tasks the same way
[`PICKER-SCREENS-PLAN.md`](./PICKER-SCREENS-PLAN.md) tracked the picker
screens effort — so parallel sessions can pick one up, mark it `in
progress`, and not collide with each other.

Not every bullet in README's Known limitations list has a task here.
Several are either inherent constraints with no real fix (e.g.
`WINDOW(*DFT)`'s runtime-only position — genuinely unknowable at design
time, not a bug), or edge cases already handled with a reasonable default
(e.g. M/P field-usage panels failing open rather than guessing). Only the
items below are being tracked as real work.

Update the Status column (`not started` / `in progress` / `done`) when you
pick up or finish a task so parallel sessions don't collide, and check
`git fetch` / `git log --oneline main..FETCH_HEAD` before every push —
upstream drift between parallel sessions is the main risk here, same as
it was for the picker screens.

---

## High priority

Broad user-facing impact — either a common DDS pattern the pickers can't
model at all today, or a data-integrity risk.

| Task | Description | Depends on | Status |
| --- | --- | --- | --- |
| **L1** | **Multi-instance conditioned keywords — foundation.** Every dedicated picker manages ONE instance of its keyword(s) at a time, conditioned as a whole via the generic keyword editor's Conditioning toggle. Real DDS allows MULTIPLE independently-conditioned instances of the same keyword (e.g. `COLOR(RED)` under indicator 10 and `COLOR(GRN)` under indicator 20 on the same field). Build a generic, reusable "repeatable conditioned instance" UI component that any picker panel can wrap around its `getX`/`setX` pair — same shape as Task R3's `INDTXT`/`SETOF`/`CHANGE` repeatable-row list on the SFL picker (already a working precedent for "multiple instances, one indicator each, add/remove rows"), generalized so it isn't SFL-specific. This is the foundation task; L1a/L1b/L1c below wire it into specific panels. | — (design + build the component itself; no picker changes yet) | **done** — `DspfWriter.getRepeatableKeywordInstances`/`setRepeatableKeywordInstances` (full per-instance conditioning, not just a bare indicator) + `WebviewClientHelpers.repeatableConditionedInstancesHtml`/`wireRepeatableConditionedInstances` (repeatable list + Conditioning accordion + add/remove, caller-supplied payload). See CHANGELOG `[0.9.55]` and `src/test/repeatableConditionedInstances.test.js`. L1a/L1b/L1c can now be picked up independently. |
| **L1a** | Wire L1's component into the **Color & attributes** picker (`COLOR`/`DSPATR`) — the single most common multi-instance case in real DDS (state-dependent field styling). | L1 | **done** — `DspfWriter.getColorAttrStates`/`setColorAttrStates` (positionally pairs same-condition COLOR/DSPATR instances into states rather than merging/losing data on a signature collision) + `WebviewClientHelpers.colorAttrStatesHtml`/`wireColorAttrStatesEditor`, wired into the field/constant props panel. Along the way, L1's own "+ Add" mechanism was corrected from "append a blank instance and commit it" (which silently evaporates on the next re-render for a payload that can be entirely empty) to a permanently-visible staging row read on Add — see `renderStaging`/`readNewInstance` in `repeatableConditionedInstancesHtml`/`wireRepeatableConditionedInstances` (both are optional trailing params; every existing caller that doesn't pass them - including L1b's own `makeDefaultInstance`-style usage and L1c's `makeDefaultSflMsg`/`makeDefaultSflMsgId` below, all added independently around the same time - keeps working exactly as before). See CHANGELOG `[0.9.55]`, `src/test/colorAttrStates.test.js`, and the updated Color & attributes scenario in `src/test/dspfWebview.test.js`. |
| **L1b** | Wire L1's component into the **Error message** picker (`ERRMSG`/`ERRMSGID`) — several message/condition pairs tried in order. Done — replaced the old single-instance "Error message" text box (in the Validity check panel) with a new, correctly-visibility-gated "Error messages" accordion built on L1's `repeatableConditionedInstancesHtml`/`wireRepeatableConditionedInstances`. `DspfWriter.getErrorMessageInstances`/`setErrorMessageInstances` read/write both `ERRMSG('text' [respInd])` and `ERRMSGID(msgid [library/]msgfile [respInd] [&msgdata])` as one merged, ordered list (verified against IBM's DDS Reference V4R5, ERRMSG/ERRMSGID keyword section, Figure 174, and the real SDA "Define Error Messages" screen `screens/field-level/character/error-messages/image171.png`) - note library/msgfile is written as ONE slash-qualified token, not the two separate space-separated tokens the old code would have guessed at. Along the way, fixed a real visibility bug: ERRMSG/ERRMSGID are valid on Output-only fields too (IBM's own rule), not just Input-or-Both like the neighboring Validity check keywords they used to share a gate with - they now have their own `errorMessages` visibility flag. Also worked around a genuine UX gap in L1's own generic component (independently rediscovered and properly fixed on the L1a side above via `renderStaging`/`readNewInstance` - both approaches coexist safely since the new params are optional/backward compatible): since it commits on every field change immediately (no batch Apply), a freshly-added or kind-switched instance with blank required fields would otherwise vanish again on the very next re-render (its own setX correctly drops incomplete entries to avoid writing malformed DDS) - fixed here by seeding a non-blank placeholder (`'New message'`, or `MSGID`/`MSGFILE`) so the row survives until the user overwrites it. See CHANGELOG and `src/test/dspfWriter.test.js`/`src/test/dspfWebview.test.js` (Task L1b sections). | L1 | done |
| **L1c** | Wire L1's component into the **Subfile Messages** panel (`SFLMSG`/`SFLMSGID`) on the SFLCTL picker (Task R4). | L1, R4 (already done) | **done** — `sflCtlPanelsHtml`/`wireSflCtlPanels` in `webviewClientHelpers.js` now wire L1's generic component into SFLMSG and SFLMSGID as two SEPARATE repeatable groups (not paired the way Color & attributes pairs COLOR+DSPATR - real DDS lets each of SFLMSG/SFLMSGID repeat independently, per this doc's own L1 entry). Replaced the old single-primary-instance `getSflMsgId`/`setSflMsgId` with per-instance `parseSflMsgIdParams`/`formatSflMsgIdParams` in `dspfWriter.js` (an incomplete SFLMSGID - blank message ID or file - is still never committed, same guarantee the superseded functions gave). Also factored `quoteDdsLiteral`/`unquoteDdsLiteral` out of `getFileQuotedText`/`setFileQuotedText` so SFLMSG's per-instance quoting reuses the exact same convention. Uses the same non-blank-placeholder default (`'New message'`, `MSGID`/`MSGFILE`) L1b's own `makeDefaultInstance`-style approach uses, rather than L1a's newer staging-row mechanism - both are backward-compatible, optional-param approaches on the same shared component, so either is a valid pattern for a future picker to follow. See the Task L1c scenarios in `src/test/dspfWebview.test.js` and CHANGELOG. |
| **L1d** | Wire L1's component into the **Keying options** picker (`CHECK`'s ME/ER/MF/FE/RB/RZ/RL/LC codes). | L1 | **done** — `CHECK` is shared between TWO UI panels (Keying options: ME/ER/MF/FE/RB/RZ/RL/LC; Validity check: AB/VN/VNE/M10/M11 + M10F/M11F immediate variants), both reading/writing the SAME keyword - converting only one to multi-instance would have been a real data-loss bug (the untouched panel's old single-merged-instance setter would collapse every instance back into one on its very next edit), so BOTH panels were converted together via one new shared pair, `checkInstancesHtml`/`wireCheckInstancesEditor` in `webviewClientHelpers.js`, parameterized by which code subset each panel owns. Each panel only ever reads/writes its OWN codes within an instance, always re-reading (never caching) the other panel's codes at commit time - verified end-to-end in `src/test/dspfWebview.test.js` (checking ME via Keying options, then AB via Validity check on that SAME instance, correctly merges to `CHECK(ME AB)` on one keyword; adding a second instance from either panel correctly leaves the first alone). Replaced `dspfWriter.js`'s old single-primary-instance `getCheckOptions`/`setCheckOptions` with `parseCheckCodes`/`formatCheckCodes`, used directly with Task L1's own `getRepeatableKeywordInstances`/`setRepeatableKeywordInstances` (CHECK's payload is just its raw code list already - no dedicated instance-shape wrapper needed, unlike ERRMSG/ERRMSGID's Task L1b). Each panel seeds its own non-blank placeholder on "+ Add" (Keying options: `ME`; Validity check: `AB`) - same trap every other L1-based picker's `makeDefaultInstance` already guards against. `KEYBRD` (the other Keying-options keyword) was deliberately left single-instance - see Known limitations in the README. |
| **L2** | **Delete-field reference cleanup.** Done — deleting a field with likely references elsewhere (the same advisory `findLikelyNameReferences` scan rename falls back on) is now blocked on an actionable confirmation dialog FIRST (naming the reference count/lines and warning they'll be left dangling) rather than deleting immediately and only warning afterward via a passive toast. Confirming still leaves the references unrewritten — there's still no sensible auto-fix target, same as rename's own limitation — so this is the "actionable prompt" option from the two named in the original task description, not the "auto-remove/comment-out" one (blindly rewriting an arbitrary keyword's free-text parameters from a substring match risked corrupting valid DDS worse than leaving it for the person to review). A field with no detected references still deletes immediately, unchanged — no confirmation click added to the common case. New generic `showConfirmDialog` UI helper in `buildWebviewTemplate.js` (a DOM-built modal, not `window.confirm`, to match the app's theme and avoid blocking the whole webview process) — scoped to field deletion only per this task; record deletion (`commitDeleteRecord`) has the identical gap but is out of scope here. See `runDeleteWarningScenario` in `dspfWebview.test.js`. | — (standalone) | done |
| **L3** | **`MNUBARCHC` Text field / Return field variants.** Done — `DspfEngine.parseMenubarChoice` now recognizes a `&text-field` reference as an alternative to the literal-text form, plus an optional trailing `&return-field` token (both verified against IBM's own MNUBARCHC keyword reference, Figures 213/214, and the real SDA screen `screens/field-level/menu-bar-choice/choice-keyword/image193.png`). `DspfWriter.getMenubarChoices`/`setMenubarChoices` carry `returnField` through symmetrically (writer already half-supported `&text-field` on write; this closes the read-side gap and adds the return field on both sides). The picker's MNUBARCHC row editor deliberately collapses SDA's separate "Text field"/"Text" entries into the SAME text box - typing `&NAME` there is a field reference, anything else a literal - matching the codebase's existing `&`-prefix convention for the sibling `CHOICE` keyword, plus a new "Return field" box. See `src/test/dspfEngine.test.js`, `src/test/dspfWriter.test.js`, and `src/test/dspfWebview.test.js` (Task L3 sections) and CHANGELOG. | D5 (already done — this extends its existing choice picker) | done |
| **L5** | **Extend L1's repeatable-conditioned-instance component to the remaining single-instance pickers.** Validity check, Keying options, Input keywords, General keywords, Database reference, Message ID, and the record-level pickers each still manage ONE instance of their keyword(s) at a time via the generic Conditioning toggle, unlike Color & attributes (L1a), Error message (L1b), and Subfile Messages (L1c), which already moved onto L1's component. Each of these needs its own follow-up in the same shape as L1a/L1b/L1c — wire the existing `getX`/`setX` pair per keyword into `repeatableConditionedInstancesHtml`/`wireRepeatableConditionedInstances`, following either the staging-row pattern (L1a) or the non-blank-placeholder-default pattern (L1b/L1c), whichever fits the panel better. Can be split across parallel sessions one panel at a time — update this row (or split it into L5a/L5b/etc. sub-tasks, same convention as L1a/L1b/L1c) as pieces land. **Keying options' piece is done — see Task L1d above**, which also picked up Validity check's own `CHECK` codes along the way (`CHECK` is shared between the two panels; converting only one would have silently collapsed the other's multi-instance edits — see L1d's row for the pattern). **Validity check's OWN validity keyword (`RANGE`/`COMP`/`VALUES`, unrelated to `CHECK`) is now also done** — `DspfWriter.getValidityCheckInstances`/`setValidityCheckInstances` (built on L1's foundation; no positional pairing needed, unlike L1a's COLOR+DSPATR, since RANGE/COMP/VALUES are mutually exclusive alternative keyword names rather than two keywords combined into one state — each instance maps 1:1 onto one keyword occurrence) + `WebviewClientHelpers.validityCheckInstancesHtml`/`wireValidityCheckInstances`, following L1b's ERRMSG-style per-row "kind" selector (RANGE vs COMP vs VALUES reshapes the row the same way ERRMSG vs ERRMSGID does). Replaces the old single select+textbox+Apply-button UI in the Validity check panel; RANGE/COMP/VALUES now commit immediately like the CHECK codes already did in that same panel, while EDTCDE/EDTWRD/EDTMSK stays behind its own Apply button, unaffected. See `src/test/validityCheckInstances.test.js` and the Task L5 scenarios in `src/test/dspfWebview.test.js`. Still open: Input keywords, General keywords, Database reference, Message ID, and the record-level pickers. | L1 (done) | **in progress** — Keying options / CHECK (via L1d) and Validity check's RANGE/COMP/VALUES both done |

## Medium priority

Real but narrower-impact gaps — worth doing, lower urgency than the High
tier above.

| Task | Description | Depends on | Status |
| --- | --- | --- | --- |
| **L4** | **`CRTSRCPF` support in "Create New Display File."** Done — the remote-path wizard now checks whether the source physical file exists (`CHKOBJ`) before running `ADDPFM`, and if it doesn't, offers to create it (`CRTSRCPF`) via a confirmation prompt naming the file, rather than letting `ADDPFM` fail with a raw CPF error. Declining is a silent cancel (same as every other prompt in this flow); if `CRTSRCPF` itself fails, that failure is surfaced and `ADDPFM` is never attempted. `RCDLEN` is left to `CRTSRCPF`'s own default (`*SRC`/112, the standard DDS source PF record length) rather than hardcoded. Scoped to the DSPF designer's "Create New Display File" only, per this task; "Create New Menu" has the identical gap on its own remote path but is a separate, untracked limitation, left alone here. See the new scenarios in `src/test/createNewDspf.test.js`. | — (standalone) | done |

---

## Suggested parallelization

- L1 (the foundation component), L1a, L1b, L1c, L1d, L2, L3, and L4
  are all done. **L5 is the one open task** — extending L1's component
  to the remaining single-instance pickers (see the High priority
  table above). L1d already covered one of L5's originally-named
  pieces (Keying options' `CHECK` codes, and — since `CHECK` is
  shared — Validity check's own `CHECK` codes too); Validity check's
  OWN validity keyword (`RANGE`/`COMP`/`VALUES`, unrelated to `CHECK`)
  is now also done, the same general way. Still open: Input keywords,
  General keywords, Database reference, Message ID, and the
  record-level pickers. It can be split across
  parallel sessions one panel at a time; whoever picks up a panel
  should mark it (or a new L5x sub-task row) `in progress` here first
  — and if a keyword turns out to be shared between two panels the way
  `CHECK` was, see L1d's own row above for the pattern that keeps both
  panels safe (one shared getter/setter pair, parameterized by which
  code/field subset each panel owns).
- Same collision risk as the picker screens effort: sync (`git fetch` +
  drift check) before every push, and update this doc's Status column
  the moment you pick up or finish a task.

## Out of scope here

The "not really fixable" and "already handled reasonably" items noted in
README's Known limitations list (e.g. `WINDOW(*DFT)`'s placeholder
position, `CHCCTL` having no visual form, `EDTCDE`/`EDTWRD` width
estimation edge cases, the `WINDOW` picker's missing Roll row, M/P
usage fail-open behavior, constants staying Choice-keyword-excluded)
are accepted constraints or reasonable defaults, not tracked as tasks.
If any of those turns out to be more fixable than it looks, raise it as
a new task here rather than silently reinterpreting its priority. (The
`WINDOW` picker's missing Message line row, by contrast, IS potentially
fixable — see README's Planned enhancements — it just isn't broken into
a tracked task yet.)
