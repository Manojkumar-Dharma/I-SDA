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
| **L1a** | Wire L1's component into the **Color & attributes** picker (`COLOR`/`DSPATR`) — the single most common multi-instance case in real DDS (state-dependent field styling). | L1 | not started |
| **L1b** | Wire L1's component into the **Error message** picker (`ERRMSG`/`ERRMSGID`) — several message/condition pairs tried in order. | L1 | not started |
| **L1c** | Wire L1's component into the **Subfile Messages** panel (`SFLMSG`/`SFLMSGID`) on the SFLCTL picker (Task R4). | L1, R4 (already done) | not started |
| **L2** | **Delete-field reference cleanup.** Done — deleting a field with likely references elsewhere (the same advisory `findLikelyNameReferences` scan rename falls back on) is now blocked on an actionable confirmation dialog FIRST (naming the reference count/lines and warning they'll be left dangling) rather than deleting immediately and only warning afterward via a passive toast. Confirming still leaves the references unrewritten — there's still no sensible auto-fix target, same as rename's own limitation — so this is the "actionable prompt" option from the two named in the original task description, not the "auto-remove/comment-out" one (blindly rewriting an arbitrary keyword's free-text parameters from a substring match risked corrupting valid DDS worse than leaving it for the person to review). A field with no detected references still deletes immediately, unchanged — no confirmation click added to the common case. New generic `showConfirmDialog` UI helper in `buildWebviewTemplate.js` (a DOM-built modal, not `window.confirm`, to match the app's theme and avoid blocking the whole webview process) — scoped to field deletion only per this task; record deletion (`commitDeleteRecord`) has the identical gap but is out of scope here. See `runDeleteWarningScenario` in `dspfWebview.test.js`. | — (standalone) | done |
| **L3** | **`MNUBARCHC` Text field / Return field variants.** Done — `DspfEngine.parseMenubarChoice` now recognizes a `&text-field` reference as an alternative to the literal-text form, plus an optional trailing `&return-field` token (both verified against IBM's own MNUBARCHC keyword reference, Figures 213/214, and the real SDA screen `screens/field-level/menu-bar-choice/choice-keyword/image193.png`). `DspfWriter.getMenubarChoices`/`setMenubarChoices` carry `returnField` through symmetrically (writer already half-supported `&text-field` on write; this closes the read-side gap and adds the return field on both sides). The picker's MNUBARCHC row editor deliberately collapses SDA's separate "Text field"/"Text" entries into the SAME text box - typing `&NAME` there is a field reference, anything else a literal - matching the codebase's existing `&`-prefix convention for the sibling `CHOICE` keyword, plus a new "Return field" box. See `src/test/dspfEngine.test.js`, `src/test/dspfWriter.test.js`, and `src/test/dspfWebview.test.js` (Task L3 sections) and CHANGELOG. | D5 (already done — this extends its existing choice picker) | done |

## Medium priority

Real but narrower-impact gaps — worth doing, lower urgency than the High
tier above.

| Task | Description | Depends on | Status |
| --- | --- | --- | --- |
| **L4** | **`CRTSRCPF` support in "Create New Display File."** The wizard currently only adds a member to a source physical file that already exists; it doesn't offer to create the source physical file itself first. One-time setup friction with an easy manual workaround, so lower urgency than L1-L3. | — (standalone) | not started |

---

## Suggested parallelization

- L1 (the foundation component) should land before L1a/L1b/L1c — those
  three are independent of each other once L1 exists, so up to 3
  developers can take one panel each in parallel.
- L2 and L3 are done. L4 is standalone and independent of L1 — pick it
  up without waiting on anything else.
- Same collision risk as the picker screens effort: sync (`git fetch` +
  drift check) before every push, and update this doc's Status column
  the moment you pick up or finish a task.

## Out of scope here

The "not really fixable" and "already handled reasonably" items noted in
README's Known limitations list (e.g. `WINDOW(*DFT)`'s placeholder
position, `CHCCTL` having no visual form, `EDTCDE`/`EDTWRD` width
estimation edge cases, the `WINDOW` picker's missing Message
line/Roll row, M/P usage fail-open behavior, constants staying
Choice-keyword-excluded) are accepted constraints or reasonable defaults,
not tracked as tasks. If any of those turns out to be more fixable than
it looks, raise it as a new task here rather than silently reinterpreting
its priority.
