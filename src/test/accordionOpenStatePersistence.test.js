/**
 * accordionOpenStatePersistence.test.js
 *
 * Bug fix (follow-up to L64) - every props-panel accordion used to snap
 * back CLOSED on the very next re-render, because the whole panel is
 * regenerated from scratch on every commit (see commitSourceChange's own
 * render() call in buildWebviewTemplate.js) and accordionHtml's openByDefault
 * was a fixed true/false with no memory of what the person actually had
 * open. Concretely: opening Color & attributes, then picking a color from
 * ITS OWN dropdown, immediately re-collapsed the very accordion the person
 * was still working in - reported directly against L64's new accordions,
 * but the underlying accordionHtml()/accordionWrapHtml() re-render-always-
 * collapses behavior was shared by every OTHER accordion too (Error
 * messages, Keying options, Advanced/raw keywords, etc.), not just the four
 * L64 added.
 *
 * Fix: accordionOpenState, a plain Map keyed by a unique per-accordion
 * string (declared once in buildWebviewTemplate.js's script, never reset),
 * remembers each accordion's open/closed state across re-renders. A single
 * delegated 'toggle' listener on `document` (capturing phase - native
 * <details> toggle events don't bubble, but a capturing listener still
 * receives them) keeps it in sync regardless of which function generated
 * the accordion's markup (buildWebviewTemplate.js's own accordionHtml, or
 * webviewClientHelpers.js's accordionWrapHtml - both emit the same
 * data-accordion-key attribute and neither wires its own listener).
 *
 * This test drives the ACTUAL generated client script in jsdom (same
 * rationale as dspfWebview.test.js) rather than just checking string output,
 * since only running the real code can catch the toggle listener wiring
 * itself being wrong.
 * Run with: node src/test/accordionOpenStatePersistence.test.js
 */
const { JSDOM } = require('jsdom');
const { getWebviewHtml } = require('../../dist/webviewTemplate.js');
const { buildLine } = require('../fixtures/lineBuilder.js');

let failures = 0;
function check(label, condition) {
  if (condition) {
    console.log('  ok  -', label);
  } else {
    failures++;
    console.log('FAIL  -', label);
  }
}

// NAME already carries a COLOR keyword (so its Color & attributes accordion
// has a real inst0 row, not just the always-present "+ Add" staging row);
// CITY has none, just to prove per-field independence at the end.
const dspfSource =
  [
    buildLine({ seq: '00010', nameType: 'R', name: 'SCR1' }),
    buildLine({ seq: '00020', name: 'NAME', dataType: 'A', length: '10', usage: 'B', line: '4', col: '5' }),
    buildLine({ seq: '00030', func: 'COLOR(BLU)' }),
    buildLine({ seq: '00040', name: 'CITY', dataType: 'A', length: '10', usage: 'B', line: '5', col: '5' }),
  ].join('\n') + '\n';

const html = getWebviewHtml('vscode-webview://fake', 'testnonce', dspfSource, 'MYSCR.DSPF', 'modern').replace(
  /<meta http-equiv="Content-Security-Policy"[^>]*>/,
  ''
);

const dom = new JSDOM(html, {
  runScripts: 'dangerously',
  resources: 'usable',
  pretendToBeVisual: true,
  beforeParse(window) {
    window.acquireVsCodeApi = () => ({ getState: () => null, setState: () => {}, postMessage: () => {} });
  },
});

setTimeout(() => {
  const doc = dom.window.document;
  const { Event } = dom.window;

  function selectField(name) {
    const el = Array.from(doc.querySelectorAll('.dspf-field')).find((e) => (e.getAttribute('data-field') || '') === name);
    el.dispatchEvent(new Event('click', { bubbles: true }));
  }

  function accordion(key) {
    return doc.querySelector('details.props-accordion[data-accordion-key="' + key + '"]');
  }

  function openAccordion(details) {
    details.open = true;
    // Real browsers fire 'toggle' asynchronously when .open is set
    // programmatically; jsdom doesn't reliably do this on its own, so this
    // dispatches it directly - the fix's listener only cares about
    // receiving the event, not how it was produced.
    details.dispatchEvent(new Event('toggle'));
  }

  console.log('setup: select NAME, its Color & attributes and Keying options accordions both exist and both start closed');
  selectField('NAME');
  const colorAttrKey = doc.querySelector('[id^="field-"][id$="-colorattr-inst0-color"]');
  check('setup: a Color & attributes color <select> is present (confirms the accordion body itself rendered)', !!colorAttrKey);
  const fieldOwnerKey = colorAttrKey.id.replace(/-colorattr-inst0-color$/, '');
  const colorAttrAccordion = accordion(fieldOwnerKey + '::colorattr');
  const keyingOptionsAccordion = accordion(fieldOwnerKey + '::keying-options');
  check('Color & attributes accordion found via its data-accordion-key', !!colorAttrAccordion);
  check('Keying options accordion found via its data-accordion-key', !!keyingOptionsAccordion);
  check('both start closed (openByDefault false, nothing toggled yet)', !colorAttrAccordion.open && !keyingOptionsAccordion.open);

  console.log('\nopening Color & attributes, then picking a color from its OWN dropdown (the exact reported scenario)');
  openAccordion(colorAttrAccordion);
  check('Color & attributes is now open', colorAttrAccordion.open);
  const colorSelect = doc.getElementById(fieldOwnerKey + '-colorattr-inst0-color');
  colorSelect.value = 'BLU';
  colorSelect.dispatchEvent(new Event('change', { bubbles: true }));

  // The commit above re-rendered the whole props panel from scratch, so
  // stale element references must be re-queried.
  const colorAttrAccordionAfter = accordion(fieldOwnerKey + '::colorattr');
  const keyingOptionsAccordionAfter = accordion(fieldOwnerKey + '::keying-options');
  check('bug fix: Color & attributes stays OPEN across the re-render its own edit triggered (previously snapped shut)', !!colorAttrAccordionAfter && colorAttrAccordionAfter.open);
  check('an untouched accordion (Keying options) stays closed - this is per-key state, not "everything opens now"', !!keyingOptionsAccordionAfter && !keyingOptionsAccordionAfter.open);
  check('the color choice itself was not lost by the same edit', doc.getElementById(fieldOwnerKey + '-colorattr-inst0-color').value === 'BLU');

  console.log('\nclosing it again persists too (not just "open" that survives)');
  colorAttrAccordionAfter.open = false;
  colorAttrAccordionAfter.dispatchEvent(new Event('toggle'));
  const sel2 = doc.getElementById(fieldOwnerKey + '-colorattr-inst0-color');
  sel2.value = '';
  sel2.dispatchEvent(new Event('change', { bubbles: true }));
  const colorAttrAccordionAfter2 = accordion(fieldOwnerKey + '::colorattr');
  check('explicitly closing it is remembered too across the next re-render', !!colorAttrAccordionAfter2 && !colorAttrAccordionAfter2.open);

  console.log('\nper-field independence: selecting a DIFFERENT field starts its own same-labelled accordion closed');
  selectField('CITY');
  // CITY has no COLOR/DSPATR keyword yet, so it has no "-colorattr-inst0-*"
  // row - only the always-present "+ Add" staging select - but that's
  // enough to derive its owner key.
  const otherColorSelect = doc.querySelector('[id^="field-"][id$="-colorattr-new-color"]');
  const otherOwnerKey = otherColorSelect.id.replace(/-colorattr-new-color$/, '');
  check('CITY is a genuinely different owner key than NAME', otherOwnerKey !== fieldOwnerKey);
  const otherColorAttrAccordion = accordion(otherOwnerKey + '::colorattr');
  check("CITY's own Color & attributes accordion starts closed, unaffected by NAME's toggling above", !!otherColorAttrAccordion && !otherColorAttrAccordion.open);

  console.log('\n' + (failures === 0 ? 'ALL CHECKS PASSED' : failures + ' CHECK(S) FAILED'));
  process.exit(failures === 0 ? 0 : 1);
}, 0);
