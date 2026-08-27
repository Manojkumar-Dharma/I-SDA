/**
 * pulldownOverlayStacking.test.js
 *
 * Regression coverage for a real reported bug: "Choice pulldown/menu -
 * Radio and checkbox are not visually represented / rendered correctly."
 *
 * A PULLDOWN record's fields render as a SEPARATE overlay layer on top of
 * a bordered box (.dspf-pulldown-border, z-index:2 - see dspfEngine.js's
 * renderScreenHtml). The overlay's own fields (.dspf-pulldown-field) must
 * paint ABOVE that border so their text is visible instead of hidden
 * behind the border's opaque background.
 *
 * The actual bug: .dspf-pulldown-field { z-index: 3; } is a ONE-class
 * selector (specificity 0,1,0). But every widget type already has its own
 * TWO-class z-index rule (.dspf-field.dspf-widget-radio, -checkbox,
 * -button, -menubar, .dspf-field.dspf-cntfld - specificity 0,2,0). CSS
 * specificity always beats source order, so those widget rules won
 * regardless of where .dspf-pulldown-field sat in the file - any
 * SNGCHCFLD/MLTCHCFLD (radio/checkbox), button, or CNTFLD field placed
 * inside a PULLDOWN record silently computed z-index:1, one BELOW the
 * border's z-index:2, so the border's own background painted over the
 * field's text. The field's color/content/position were all correct -
 * this was purely a stacking-order bug, which is why it was invisible to
 * any test that only inspects the rendered HTML/DOM rather than actual
 * CSS cascade resolution (confirmed with a real Playwright/Chromium
 * screenshot during investigation - see the bug's commit message).
 *
 * This test parses the ACTUAL generated stylesheet (not a hand-copied
 * snippet) and computes real CSS specificity + source order for every
 * z-index rule touching a widget class, asserting the pulldown-field rule
 * dominates all of them - so a future edit that goes back to a plain
 * one-class ".dspf-pulldown-field" selector (or otherwise loses the tie)
 * fails this test even if nobody re-derives the exact bug by hand.
 *
 * Run with: node src/test/pulldownOverlayStacking.test.js
 */
const { getWebviewHtml } = require('../../dist/webviewTemplate.js');

let failures = 0;
function check(label, condition) {
  if (condition) {
    console.log('  ok  -', label);
  } else {
    failures++;
    console.log('FAIL  -', label);
  }
}

const dspfSource =
  [
    '     A                                      DSPSIZ(24 80 *DS3)',
    '     A          R SCR1',
    "     A                                  1  2'MAIN SCREEN'",
    '     A            NAME      10A  B  4  5',
  ].join('\n') + '\n';

const html = getWebviewHtml('vscode-webview://fake', 'testnonce', dspfSource, 'MYSCR.DSPF');
const styleMatch = html.match(/<style>([\s\S]*?)<\/style>/);
if (!styleMatch) {
  console.log('FAIL  - could not find <style> block in generated webview HTML');
  process.exit(1);
}
const css = styleMatch[1];

/** Splits a stylesheet into { selector, body, index } rule records, in
 *  source order. Deliberately simple (no @-rule/nesting support) - this
 *  webview's stylesheet is flat, and a naive regex is far less likely to
 *  itself be the source of a false pass/fail than a full CSS parser
 *  dependency would be worth here. */
function parseRules(cssText) {
  // Strip comments first - a bare brace-matching regex has no concept of
  // "this text is prose, not a selector", so an explanatory /* ... */
  // comment sitting before a rule (exactly what this file's own fix
  // comment above .dspf-pulldown-field looks like) would otherwise get
  // swallowed into that rule's "selector" and corrupt every match after it.
  const withoutComments = cssText.replace(/\/\*[\s\S]*?\*\//g, '');
  const rules = [];
  const re = /([^{}]+)\{([^{}]*)\}/g;
  let m;
  let index = 0;
  while ((m = re.exec(withoutComments))) {
    rules.push({ selector: m[1].trim(), body: m[2], index: index++ });
  }
  return rules;
}

/** Specificity as (classCount) for a single compound selector (no
 *  combinators, e.g. ".dspf-field.dspf-widget-radio"). This stylesheet's
 *  relevant rules are all pure class selectors (no ids, no bare type
 *  selectors combined with a class) so counting '.' tokens is an accurate,
 *  not just approximate, specificity for the comparisons this test makes. */
function classCount(compoundSelector) {
  const matches = compoundSelector.match(/\.[a-zA-Z0-9_-]+/g);
  return matches ? matches.length : 0;
}

const rules = parseRules(css);

// Every widget-type rule that sets z-index and could plausibly appear
// inside a PULLDOWN overlay (radio/checkbox/button/cntfld/menubar all have
// real precedent as PULLDOWN content - menu-bar itself wouldn't nest
// inside its own pulldown, but is included for completeness/future-proofing).
const widgetZIndexRules = rules.filter(
  (r) => /z-index\s*:/.test(r.body) && /\.dspf-field/.test(r.selector) && /\.dspf-(widget-radio|widget-checkbox|widget-button|widget-menubar|cntfld)\b/.test(r.selector)
);
check('sanity: found at least one widget-type z-index rule to compare against (radio/checkbox/button/cntfld/menubar)', widgetZIndexRules.length >= 4);

// The pulldown-overlay field rule itself.
const pulldownFieldRules = rules.filter((r) => /z-index\s*:\s*3\b/.test(r.body) && /\.dspf-pulldown-field\b/.test(r.selector));
check('found the .dspf-pulldown-field z-index:3 rule', pulldownFieldRules.length === 1);

if (pulldownFieldRules.length === 1 && widgetZIndexRules.length > 0) {
  const pdRule = pulldownFieldRules[0];
  const pdSpecificity = classCount(pdRule.selector);

  widgetZIndexRules.forEach((wRule) => {
    // Every individual compound selector on the (possibly comma-separated)
    // widget rule must be beaten or tied-and-later.
    wRule.selector.split(',').forEach((sel) => {
      const wSpecificity = classCount(sel.trim());
      const dominates = pdSpecificity > wSpecificity || (pdSpecificity === wSpecificity && pdRule.index > wRule.index);
      check(
        '.dspf-pulldown-field (specificity ' + pdSpecificity + ', rule #' + pdRule.index + ') out-ranks "' + sel.trim() +
          '" (specificity ' + wSpecificity + ', rule #' + wRule.index + ') in the CSS cascade',
        dominates
      );
    });
  });
}

// A pulldown field ALWAYS carries the base .dspf-field class too (see
// dspfEngine.js's renderFieldDiv classes array) - the fix relies on that
// being true; if it ever stopped being true the specificity math above
// would no longer describe what actually renders.
check('.dspf-pulldown-field rule itself is scoped to .dspf-field (matches every real pulldown field div, not a bare class)', pulldownFieldRules.length === 1 && /\.dspf-field\.dspf-pulldown-field/.test(pulldownFieldRules[0].selector));

console.log('\nBug fix: MNUBARCHC picker row inputs (record/text/return-field) no longer shrink below their declared width in a narrow properties panel');
{
  const choiceRowInputRules = rules.filter((r) => r.selector.trim() === '.choice-row input');
  check('found the .choice-row input rule', choiceRowInputRules.length === 1);
  if (choiceRowInputRules.length === 1) {
    check('.choice-row input sets flex-shrink:0 so fixed-width inputs (id/record/return-field) keep their declared width', /flex-shrink\s*:\s*0/.test(choiceRowInputRules[0].body));
  }
}

console.log('\n' + (failures === 0 ? 'ALL CHECKS PASSED' : failures + ' CHECK(S) FAILED'));
process.exit(failures === 0 ? 0 : 1);
