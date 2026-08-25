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
| **L1** | **Multi-instance conditioned keywords — foundation.** Every dedicated picker manages ONE instance of its keyword(s) at a time, conditioned as a whole via the generic keyword editor's Conditioning toggle. Real DDS allows MULTIPLE independently-conditioned instances of the same keyword (e.g. `COLOR(RED)` under indicator 10 and `COLOR(GRN)` under indicator 20 on the same field). Build a generic, reusable "repeatable conditioned instance" UI component that any picker panel can wrap around its `getX`/`setX` pair — same shape as Task R3's `INDTXT`/`SETOF`/`CHANGE` repeatable-row list on the SFL picker (already a working precedent for "multiple instances, one indicator each, add/remove rows"), generalized so it isn't SFL-specific. This is the foundation task; L1a/L1b/L1c below wire it into specific panels. | — (design + build the component itself; no picker changes yet) | not started |
| **L1a** | Wire L1's component into the **Color & attributes** picker (`COLOR`/`DSPATR`) — the single most common multi-instance case in real DDS (state-dependent field styling). | L1 | not started |
| **L1b** | Wire L1's component into the **Error message** picker (`ERRMSG`/`ERRMSGID`) — several message/condition pairs tried in order. | L1 | not started |
| **L1c** | Wire L1's component into the **Subfile Messages** panel (`SFLMSG`/`SFLMSGID`) on the SFLCTL picker (Task R4). | L1, R4 (already done) | not started |
| **L2** | **Delete-field reference cleanup.** Deleting a field only warns (never rewrites) if something else looks like it references it by name — unlike rename, which does fix up references. Risk: silently broken DDS after a delete that the person may not notice or know how to fix. Scope: when a named field is deleted, find the same reference patterns rename already detects, and either auto-remove/comment-out the dangling reference or turn the warning into an actionable prompt (e.g. "N other places reference this field — remove them too?") rather than a passive notice. Decide the exact UX before writing code — this is as much a design decision as an implementation one. | — (standalone) | not started |
| **L3** | **`MNUBARCHC` Text field / Return field variants.** Only the literal-text form (`id record 'text'`) is modeled today; the "Text field" and "Return field" variable-argument forms shown on the real SDA screen (`screens/field-level/menu-bar-choice/choice-keyword/image193.png`) aren't. Blocks full picker coverage for MNUBAR-based menu screens using dynamic (non-literal) choice text. Needs `DspfEngine.parseMenubarChoice` extended to recognize the two new argument shapes before the picker can round-trip them. | D5 (already done — this extends its existing choice picker) | not started |

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
- L2, L3, and L4 are all standalone and independent of L1 and each other
  — pick any one up without waiting on the others.
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
