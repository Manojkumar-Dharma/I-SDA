/**
 * i19MnubarFieldShapeNote.test.js
 *
 * Task I-19 - MNUBAR's own field-shape structural constraint. Per
 * keywordFixes.md's I-19 section: MNUBAR's own DDS Reference section
 * states "A record with the MNUBAR keyword specified must contain one
 * and only one menu bar field (a field with one or more MNUBARCHC
 * keywords), and cannot contain any displayable fields other than the
 * menu bar field." This is a record-composition rule, not a keyword
 * conflict, so it's implemented as `DspfWriter.mnubarFieldShapeNote` (a
 * pure, read-only function over a record's `fields` array) surfaced as
 * an ADVISORY note on the MNUBAR tab - see that function's own doc
 * comment for the full scope reasoning (why it's a note and not a hard
 * block, and how constants/hidden/program-to-system fields are treated).
 *
 * Runs the DSPF designer's real generated client-side script in jsdom
 * for the DOM-level checks; the unit-level checks call the pure
 * function directly with hand-built field arrays.
 *
 * Run with: node src/test/i19MnubarFieldShapeNote.test.js
 */
const { JSDOM } = require('jsdom');
const { getWebviewHtml } = require('../../dist/webviewTemplate.js');
const DspfWriter = require('../../dist/dspfWriter.js');
const DspfParser = require('../../dist/dspfParser.js');

let failures = 0;
function check(label, condition) {
  if (condition) {
    console.log('  ok  -', label);
  } else {
    failures++;
    console.log('FAIL  -', label);
  }
}

// ---------------------------------------------------------------------
// Unit-level: DspfWriter.mnubarFieldShapeNote directly (same convention
// as L81/L83's own dspfWriter.test.js-style direct unit coverage).
// ---------------------------------------------------------------------
console.log('\nUnit: DspfWriter.mnubarFieldShapeNote');

function field(overrides) {
  return Object.assign({ nameType: 'FIELD', name: 'FLD', usage: 'O', keywords: [] }, overrides);
}
function mnubarchcKw() { return { name: 'MNUBARCHC', parameters: "1 PULLREC 'File'", conditions: [], raw: '', sourceLines: [] }; }

{
  const clean = [field({ name: 'MNUFLD', usage: 'B', keywords: [mnubarchcKw()] })];
  check('exactly one menu-bar field, nothing else -> null (compliant)', DspfWriter.mnubarFieldShapeNote(clean) === null);
}
{
  const withHidden = [
    field({ name: 'MNUFLD', usage: 'B', keywords: [mnubarchcKw()] }),
    field({ name: 'RTNFLD', usage: 'H' }),
  ];
  check('menu-bar field + a hidden (H) return-field -> still null (H is not displayable)', DspfWriter.mnubarFieldShapeNote(withHidden) === null);
}
{
  const withProgToSystem = [
    field({ name: 'MNUFLD', usage: 'B', keywords: [mnubarchcKw()] }),
    field({ name: 'FILETXT', usage: 'P' }),
  ];
  check('menu-bar field + a program-to-system (P) choice-text field -> still null (P is not displayable)', DspfWriter.mnubarFieldShapeNote(withProgToSystem) === null);
}
{
  const none = [field({ name: 'PLAINFLD', usage: 'O' })];
  const note = DspfWriter.mnubarFieldShapeNote(none);
  check('no MNUBARCHC field at all -> a note is returned', typeof note === 'string' && note.length > 0);
  check('the no-menu-bar-field note names the problem', /no menu-bar field/.test(note));
}
{
  const two = [
    field({ name: 'MNUFLD1', usage: 'B', keywords: [mnubarchcKw()] }),
    field({ name: 'MNUFLD2', usage: 'B', keywords: [mnubarchcKw()] }),
  ];
  const note = DspfWriter.mnubarFieldShapeNote(two);
  check('two MNUBARCHC-bearing fields -> a note naming both', typeof note === 'string' && /MNUFLD1/.test(note) && /MNUFLD2/.test(note));
}
{
  const extraDisplayable = [
    field({ name: 'MNUFLD', usage: 'B', keywords: [mnubarchcKw()] }),
    field({ name: 'EXTRAFLD', usage: 'I' }),
  ];
  const note = DspfWriter.mnubarFieldShapeNote(extraDisplayable);
  check('an extra displayable (I) field alongside a clean menu-bar field -> a note naming it', typeof note === 'string' && /EXTRAFLD/.test(note));
}
{
  const extraConstant = [
    field({ name: 'MNUFLD', usage: 'B', keywords: [mnubarchcKw()] }),
    { nameType: 'CONSTANT', name: '', constantValue: 'A label', keywords: [] },
  ];
  check('an extra CONSTANT (not a field) alongside a clean menu-bar field -> null (Reference says "fields", not constants)', DspfWriter.mnubarFieldShapeNote(extraConstant) === null);
}
{
  const constantAsMenuBar = [{ nameType: 'CONSTANT', name: '', constantValue: '>File', keywords: [mnubarchcKw()] }];
  check('a MNUBARCHC-bearing CONSTANT alone satisfies "the menu-bar field" (matches this codebase\'s own D4 precedent) -> null', DspfWriter.mnubarFieldShapeNote(constantAsMenuBar) === null);
}
{
  const both = [
    field({ name: 'MNUFLD1', usage: 'B', keywords: [mnubarchcKw()] }),
    field({ name: 'EXTRAFLD', usage: 'O' }),
  ];
  // Force the "more than one menu-bar field" branch alongside an extra displayable field too.
  both.push(field({ name: 'MNUFLD2', usage: 'B', keywords: [mnubarchcKw()] }));
  const note = DspfWriter.mnubarFieldShapeNote(both);
  check('both problems at once are both named in one message', typeof note === 'string' && /MNUFLD1/.test(note) && /MNUFLD2/.test(note) && /EXTRAFLD/.test(note));
}

// ---------------------------------------------------------------------
// DOM-level: the MNUBAR tab actually shows/hides the note.
// ---------------------------------------------------------------------
console.log('\nDOM: MNUBAR tab renders the advisory note');

const dspfSource =
  [
    '     A          R MB                          MNUBAR',
    "     A            MNUFLD         2Y 0B 1  2",
    '     A                                      MNUBARCHC(1 PULLREC \'File\')',
    "     A            EXTRAFLD      10A  O 2  2",
    '     A          R OTHERREC',
    "     A                                  1  2'Other record'",
  ].join('\n') + '\n';

const html = getWebviewHtml('vscode-webview://fake', 'testnonce19', dspfSource, 'MYMENU.DSPF').replace(
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
  const { document: doc, Event } = dom.window;

  const parsedInitial = DspfParser.parseDspf(dspfSource).records.find((r) => r.name === 'MB');
  check('setup: MB carries MNUBAR and has an extra displayable field (EXTRAFLD)', parsedInitial.keywords.some((k) => k.name === 'MNUBAR') && parsedInitial.fields.some((f) => f.name === 'EXTRAFLD'));

  function selectRecord(name) {
    const recordSelect = doc.getElementById('recordSelect');
    recordSelect.value = name;
    recordSelect.dispatchEvent(new Event('change', { bubbles: true }));
  }
  function mnubarTabText() {
    const tab = Array.from(doc.querySelectorAll('.tabs button, [role="tab"], .tab-btn')).find((el) => /MNUBAR/i.test(el.textContent));
    if (tab) tab.dispatchEvent(new Event('click', { bubbles: true }));
    return doc.getElementById('propsBody') ? doc.getElementById('propsBody').textContent : '';
  }

  selectRecord('MB');
  const bodyText = mnubarTabText();
  check('MB (has an extra displayable field) shows the warning note somewhere in the props panel', /displayable field\(s\) other than the menu-bar field/.test(bodyText));
  check('the note names the offending field (EXTRAFLD)', /EXTRAFLD/.test(bodyText));

  const warnEl = doc.querySelector('#propsBody .warn');
  check('the note is rendered with the shared .warn styling class', !!warnEl && /EXTRAFLD/.test(warnEl.textContent));

  selectRecord('OTHERREC');
  console.log('\nDOM: a non-MNUBAR record has no MNUBAR tab at all (nothing to warn about)');
  check('OTHERREC has no MNUBAR tab', !Array.from(doc.querySelectorAll('.tabs button, [role="tab"], .tab-btn')).some((el) => /MNUBAR/i.test(el.textContent)));

  console.log('\n' + (failures === 0 ? 'ALL CHECKS PASSED' : failures + ' CHECK(S) FAILED'));
  process.exit(failures === 0 ? 0 : 1);
}, 50);
