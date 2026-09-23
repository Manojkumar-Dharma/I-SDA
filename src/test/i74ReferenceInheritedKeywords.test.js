/**
 * i74ReferenceInheritedKeywords.test.js
 *
 * Task I-74 - REF/REFFLD: a reference field ("R" in position 29) inherits the
 * referenced database field's other keywords (TEXT, ALIAS, CCSID, DATFMT/DATSEP/
 * TIMFMT/TIMSEP, editing, ...), shown read-only and NEVER written into the DDS
 * source, and a "+n"/"-n" length is applied to the referenced field's length.
 *
 * Covers: the parser's lengthAdjust, the writer keeping/writing "+n"/"-n", the
 * engine's effective definition and IBM's override rules, the DSPFFD row ->
 * keyword mapping, the read-only panel HTML, and the real webview script
 * (jsdom): the panel, the Basic tab's Length box, and that Apply keeps "+n".
 * Run with: node src/test/i74ReferenceInheritedKeywords.test.js
 */
const path = require('path');
const { JSDOM } = require('jsdom');
const DspfParser = require(path.join(__dirname, '../../dist/dspfParser.js'));
const DspfWriter = require(path.join(__dirname, '../dspfWriter.js'));
const DspfEngine = require(path.join(__dirname, '../dspfEngine.js'));
const { getWebviewHtml } = require(path.join(__dirname, '../../dist/webviewTemplate.js'));
const WebviewClientHelpers = require(path.join(__dirname, '../webviewClientHelpers.js'));
const { buildLine } = require('../fixtures/lineBuilder');

let failures = 0;
function check(label, condition) {
  if (condition) {
    console.log('  ok  -', label);
  } else {
    failures++;
    console.log('FAIL  -', label);
  }
}

const KEY = '/CUSTMAST/'; // referenceKey() of a field with no library: "/FILE/FIELD"
function sourceWith(fields) {
  return [buildLine({ func: 'REF(CUSTMAST)' }), buildLine({ nameType: 'R', name: 'REC1' })]
    .concat(fields.map((f, i) => buildLine(Object.assign({ ref: 'R', usage: 'B', line: 3 + i, col: 5 }, f))))
    .join('\n') + '\n';
}
function parse(fields, resolved) {
  const model = DspfParser.parseDspf(sourceWith(fields));
  if (resolved) model.resolvedReferences = resolved;
  return { model, record: model.records[0] };
}
function fieldOf(record, name) { return record.fields.find((f) => f.name === name); }
const kwNames = (list) => list.map((k) => k.name);

console.log('parser: +n / -n length is kept as a signed adjustment, not an absolute length');
{
  const { record } = parse([{ name: 'F1', length: '+2' }, { name: 'F2', length: '-1' }, { name: 'F3', length: '25' }, { name: 'F4' }]);
  const f1 = fieldOf(record, 'F1'), f2 = fieldOf(record, 'F2'), f3 = fieldOf(record, 'F3'), f4 = fieldOf(record, 'F4');
  check('"+2": lengthAdjust 2, absolute length null, raw text kept', f1.lengthAdjust === 2 && f1.length === null && f1.lengthRaw === '+2');
  check('"-1": lengthAdjust -1, absolute length null', f2.lengthAdjust === -1 && f2.length === null && f2.lengthRaw === '-1');
  check('"25": absolute length, no adjustment', f3.length === 25 && f3.lengthAdjust === null);
  check('blank: neither', f4.length === null && f4.lengthAdjust === null && f4.lengthRaw === null);
}

console.log('\nwriter: the adjustment survives unrelated edits and is written back as +n / -n');
{
  const src = sourceWith([{ name: 'F1', length: '+2' }]);
  const lines = src.split('\n');
  const { record } = parse([{ name: 'F1', length: '+2' }]);
  const f1 = fieldOf(record, 'F1');
  const moved = DspfWriter.applyFieldUpdate(f1, lines, { column: 9 });
  check('moving the field leaves "+2" in the length columns', /F1\s+R\s+\+2\s+B/.test(moved[2]));
  const minus = DspfWriter.applyFieldUpdate(f1, lines, { lengthAdjust: -3 });
  check('lengthAdjust -3 is written as "-3"', /F1\s+R\s+-3\s+B/.test(minus[2]));
  const plus = DspfWriter.applyFieldUpdate(f1, lines, { lengthAdjust: 4 });
  check('lengthAdjust 4 is written as "+4"', /F1\s+R\s+\+4\s+B/.test(plus[2]));
  const abs = DspfWriter.applyFieldUpdate(f1, lines, { length: 10 });
  check('an absolute length replaces the adjustment', /F1\s+R\s+10\s+B/.test(abs[2]));
  const blank = DspfWriter.applyFieldUpdate(f1, lines, { lengthAdjust: null });
  check('lengthAdjust null clears the length columns', !/\+2|-/.test(blank[2].slice(28, 35)));
  const reparsed = DspfParser.parseDspf(plus.join('\n')).records[0].fields.find((f) => f.name === 'F1');
  check('round trip: parses back as lengthAdjust 4', reparsed.lengthAdjust === 4 && reparsed.length === null);
}

console.log('\nengine: effective length of a reference field');
{
  const resolved = {};
  resolved[KEY + 'F1'] = { length: 30, dataType: '', decimalPositions: null, keywords: [] };
  resolved[KEY + 'F2'] = { length: 40, dataType: '', decimalPositions: null, keywords: [] };
  resolved[KEY + 'F3'] = { length: 12, dataType: '', decimalPositions: null, keywords: [] };
  resolved[KEY + 'F4'] = { length: 20, dataType: '', decimalPositions: null, keywords: [] };
  const { model, record } = parse([{ name: 'F1', length: '+2' }, { name: 'F2', length: '-1' }, { name: 'F3', length: '5' }, { name: 'F4' }], resolved);
  const widths = {};
  DspfEngine.resolveScreen(model, 'REC1').fields.forEach((f) => { widths[f.name] = f.length; });
  check('+2 on a referenced length of 30 draws 32 wide', widths.F1 === 32);
  check('-1 on 40 draws 39 wide', widths.F2 === 39);
  check('an absolute length of its own wins over the referenced one', widths.F3 === 5);
  check('a blank length uses the referenced length', widths.F4 === 20);
  check('the source model is not modified (length still null for +2, adjust kept)', fieldOf(record, 'F1').length === null && fieldOf(record, 'F1').lengthAdjust === 2);

  const unresolved = parse([{ name: 'F1', length: '+2' }]);
  let ok = true;
  try { DspfEngine.resolveScreen(unresolved.model, 'REC1'); } catch (e) { ok = false; }
  check('an unresolved reference field still renders (no crash, no resolvedReferences at all)', ok);
  const empty = parse([{ name: 'F1', length: '+2' }], {});
  check('an empty cache renders it too', DspfEngine.resolveScreen(empty.model, 'REC1').fields.length === 1);
  check('the min effective length is 1 (-99 on 30)', DspfEngine.effectiveReferenceLength({ lengthAdjust: -99 }, { length: 30 }) === 1);
  check('the key is library/file/field, upper-cased', DspfEngine.referenceKey({ library: 'mylib', file: 'custmast', fieldName: 'cusno' }) === 'MYLIB/CUSTMAST/CUSNO');
  check('a reference to a library-qualified REF file is looked up under that library', (function () {
    const m = DspfParser.parseDspf([buildLine({ func: 'REF(MYLIB/CUSTMAST)' }), buildLine({ nameType: 'R', name: 'REC1' }), buildLine({ name: 'F1', ref: 'R', length: '+1', usage: 'B', line: 3, col: 5 })].join('\n') + '\n');
    m.resolvedReferences = { 'MYLIB/CUSTMAST/F1': { length: 9, dataType: '', decimalPositions: null, keywords: [] } };
    return DspfEngine.resolveScreen(m, 'REC1').fields[0].length === 10;
  })());
}

console.log('\nengine: which keywords a reference field inherits (IBM DDS Reference, position 29)');
{
  const def = {
    length: 7, dataType: 'S', decimalPositions: 2,
    keywords: [
      { name: 'TEXT', parameters: "'Customer'" },
      { name: 'ALIAS', parameters: 'CUSTOMER_NAME' },
      { name: 'CCSID', parameters: '37' },
      { name: 'EDTCDE', parameters: 'J' },
      { name: 'RANGE', parameters: '1 99' },
    ],
  };
  const inh = (field) => DspfEngine.inheritedReferenceKeywords(field, def);

  const plain = inh({ isReference: true, keywords: [] });
  check('a bare reference field inherits everything listed (TEXT, ALIAS, CCSID, editing, validity)', kwNames(plain.keywords).join() === 'TEXT,ALIAS,CCSID,EDTCDE,RANGE');
  check('inherited keywords are flagged inherited', plain.keywords.every((k) => k.inherited === true));
  check('no notes when nothing was dropped', plain.notes.length === 0);
  check('a non-reference field inherits nothing', inh({ isReference: false, keywords: [] }).keywords.length === 0);

  const ownText = inh({ isReference: true, keywords: [{ name: 'TEXT', parameters: "'Mine'" }, { name: 'ALIAS', parameters: 'X' }] });
  check('own TEXT / ALIAS override the inherited ones', !kwNames(ownText.keywords).includes('TEXT') && !kwNames(ownText.keywords).includes('ALIAS') && kwNames(ownText.keywords).includes('CCSID'));

  const ownEdit = inh({ isReference: true, keywords: [{ name: 'EDTWRD', parameters: "'  -  '" }] });
  check('own EDTWRD replaces the inherited edit code', !kwNames(ownEdit.keywords).includes('EDTCDE'));
  check('...but does not touch validity checking', kwNames(ownEdit.keywords).includes('RANGE'));

  const dltEdt = inh({ isReference: true, keywords: [{ name: 'DLTEDT', parameters: '' }] });
  check('DLTEDT deletes the inherited editing', !kwNames(dltEdt.keywords).includes('EDTCDE') && kwNames(dltEdt.keywords).includes('RANGE'));

  const ownCheck = inh({ isReference: true, keywords: [{ name: 'VALUES', parameters: "'A' 'B'" }] });
  check('any own validity keyword replaces ALL inherited validity checking', !kwNames(ownCheck.keywords).includes('RANGE') && kwNames(ownCheck.keywords).includes('EDTCDE'));
  const dltChk = inh({ isReference: true, keywords: [{ name: 'DLTCHK', parameters: '' }] });
  check('DLTCHK deletes the inherited validity checking', !kwNames(dltChk.keywords).includes('RANGE'));

  [['a +n length', { lengthRaw: '+2', lengthAdjust: 2 }], ['an absolute length', { lengthRaw: '9', length: 9 }], ['own decimal positions', { decimalPositionsRaw: '2', decimalPositions: 2 }], ['a data type / keyboard shift', { dataType: 'Y' }]].forEach(function (c) {
    const r = inh(Object.assign({ isReference: true, keywords: [] }, c[1]));
    check(c[0] + ': neither editing nor validity checking is inherited', !kwNames(r.keywords).includes('EDTCDE') && !kwNames(r.keywords).includes('RANGE'));
    check(c[0] + ': ...TEXT, ALIAS and CCSID still are', ['TEXT', 'ALIAS', 'CCSID'].every((n) => kwNames(r.keywords).includes(n)));
    check(c[0] + ': ...and both drops are explained', r.notes.length === 2);
  });

  const dateDef = { length: 10, dataType: 'L', decimalPositions: null, keywords: [{ name: 'DATFMT', parameters: '*ISO' }, { name: 'DATSEP', parameters: "'-'" }, { name: 'TIMFMT', parameters: '*ISO' }, { name: 'TIMSEP', parameters: "'.'" }] };
  check('a date field inherits DATFMT/DATSEP, not TIMFMT/TIMSEP', kwNames(DspfEngine.inheritedReferenceKeywords({ isReference: true, keywords: [] }, dateDef).keywords).join() === 'DATFMT,DATSEP');
  const timeDef = Object.assign({}, dateDef, { dataType: 'T' });
  check('a time field inherits TIMFMT/TIMSEP, not DATFMT/DATSEP', kwNames(DspfEngine.inheritedReferenceKeywords({ isReference: true, keywords: [] }, timeDef).keywords).join() === 'TIMFMT,TIMSEP');
  check('an own DATFMT overrides the inherited one', kwNames(DspfEngine.inheritedReferenceKeywords({ isReference: true, keywords: [{ name: 'DATFMT', parameters: '*USA' }] }, dateDef).keywords).join() === 'DATSEP');
}

console.log('\nengine: effective data type, decimals and width');
{
  const resolved = {};
  resolved[KEY + 'AMT'] = { length: 7, dataType: 'P', decimalPositions: 2, keywords: [{ name: 'EDTCDE', parameters: 'J' }] };
  resolved[KEY + 'NAMEF'] = { length: 20, dataType: '', decimalPositions: null, keywords: [] };
  const { model, record } = parse([{ name: 'AMT' }, { name: 'NAMEF', dataType: 'A' }], resolved);
  const eff = DspfEngine.effectiveReferenceField(fieldOf(record, 'AMT'), model, record);
  check('packed becomes zoned (S) - packed/binary are not supported in display files', eff.dataType === 'S');
  check('decimals are taken from the referenced field', eff.decimalPositions === 2);
  check('the referenced length is used', eff.length === 7);
  check('the inherited EDTCDE is applied to the effective field', kwNames(eff.keywords).includes('EDTCDE'));
  check('the field itself is untouched (dataType still blank)', fieldOf(record, 'AMT').dataType === null && fieldOf(record, 'AMT').keywords.length === 0);
  check('EDTCDE(J) widens the drawn field: 7 digits + point + sign + 1 comma = 10', (function () {
    const w = DspfEngine.resolveScreen(model, 'REC1').fields.find((f) => f.name === 'AMT');
    return w.length === 10;
  })());
  const decDef = { length: 5, dataType: 'S', decimalPositions: 2 };
  check('overriding the type to character (A) does not copy the decimals', DspfEngine.effectiveReferenceField({ isReference: true, name: 'X', dataType: 'A', keywords: [] }, { fileKeywords: [{ name: 'REF', parameters: 'CUSTMAST' }], resolvedReferences: { [KEY + 'X']: decDef } }, null).decimalPositions === undefined);
  check('overriding the type to numeric (S) with blank decimals keeps the referenced decimals', DspfEngine.effectiveReferenceField({ isReference: true, name: 'X', dataType: 'S', keywords: [] }, { fileKeywords: [{ name: 'REF', parameters: 'CUSTMAST' }], resolvedReferences: { [KEY + 'X']: decDef } }, null).decimalPositions === 2);
}

console.log('\nDSPFFD row -> inheritable keywords');
{
  const row = { WHFLDT: 'A', WHFTXT: "Customer's name  ", WHALIS: 'CUSNAME', WHALI2: '', WHCSID: 37, WHECDE: '  ', WHEWRD: '                                ' };
  const k = DspfEngine.inheritableKeywordsFromDspffdRow(row);
  const by = (n) => k.find((x) => x.name === n);
  check('TEXT comes from WHFTXT, quoted with the apostrophe doubled', by('TEXT') && by('TEXT').parameters === "'Customer''s name'");
  check('ALIAS falls back to WHALIS', by('ALIAS') && by('ALIAS').parameters === 'CUSNAME');
  check('CCSID comes from WHCSID for a character field', by('CCSID') && by('CCSID').parameters === '37');
  check('blank edit code / edit word give no editing keyword', !by('EDTCDE') && !by('EDTWRD'));
  check('a character field gets no date/time keywords', !by('DATFMT') && !by('TIMFMT'));
  check('WHALI2 (the longer alias) wins when present', DspfEngine.inheritableKeywordsFromDspffdRow({ WHFLDT: 'A', WHALIS: 'SHORT', WHALI2: 'A_MUCH_LONGER_ALIAS' }).find((x) => x.name === 'ALIAS').parameters === 'A_MUCH_LONGER_ALIAS');
  check('CCSID 65535 (no conversion) and 0 are not inherited', DspfEngine.inheritableKeywordsFromDspffdRow({ WHFLDT: 'A', WHCSID: 65535 }).length === 0 && DspfEngine.inheritableKeywordsFromDspffdRow({ WHFLDT: 'A', WHCSID: 0 }).length === 0);
  const num = DspfEngine.inheritableKeywordsFromDspffdRow({ WHFLDT: 'S', WHCSID: 37, WHECDE: 'J ', WHEWRD: '' });
  check('CCSID is not inherited by a numeric field', !num.some((x) => x.name === 'CCSID'));
  check('EDTCDE comes from WHECDE', num.some((x) => x.name === 'EDTCDE' && x.parameters === 'J'));
  check('an edit code with a fill / currency character keeps it (second token)', DspfEngine.inheritableKeywordsFromDspffdRow({ WHFLDT: 'S', WHECDE: 'Z*' }).find((x) => x.name === 'EDTCDE').parameters === 'Z *');
  check('EDTWRD comes from WHEWRD, right padding trimmed', DspfEngine.inheritableKeywordsFromDspffdRow({ WHFLDT: 'S', WHEWRD: "  0   -  " + ' '.repeat(23) }).find((x) => x.name === 'EDTWRD').parameters === "'  0   -'");
  const date = DspfEngine.inheritableKeywordsFromDspffdRow({ WHFLDT: 'L', WHFMT: '*USA', WHSEP: '/' });
  check('a date field gets DATFMT and DATSEP from WHFMT / WHSEP', date.map((x) => x.name + '=' + x.parameters).join() === "DATFMT=*USA,DATSEP='/'");
  const time = DspfEngine.inheritableKeywordsFromDspffdRow({ WHFLDT: 'T', WHFMT: 'HMS', WHSEP: '.' });
  check('a time field gets TIMFMT and TIMSEP (a missing * is added)', time.map((x) => x.name + '=' + x.parameters).join() === "TIMFMT=*HMS,TIMSEP='.'");
  check('lower-case column names (as some drivers return them) work too', DspfEngine.inheritableKeywordsFromDspffdRow({ whfldt: 'A', whftxt: 'x' }).length === 1);
  check('a missing row gives nothing', DspfEngine.inheritableKeywordsFromDspffdRow(null).length === 0);
}

console.log('\nread-only panel HTML');
{
  const unresolved = WebviewClientHelpers.referenceInheritedHtml({ field: { isReference: true }, definition: null });
  check('unresolved: says so and that nothing is written to the source', /Not resolved yet/.test(unresolved) && /nothing is written/.test(unresolved));
  const def = { length: 30, dataType: '', decimalPositions: null };
  const html = WebviewClientHelpers.referenceInheritedHtml({
    field: { isReference: true, lengthAdjust: 2 },
    definition: def,
    inherited: { keywords: [{ name: 'TEXT', parameters: "'A <b>&</b>'" }], notes: ['Editing keywords ... not inherited'] },
    effectiveLength: 32,
  });
  check('shows the referenced length / type / decimals', /length 30, data type A, decimals 0/.test(html));
  check('shows the +n and the effective length', /Length \+2 gives an effective length of 32/.test(html));
  check('lists the inherited keyword as a read-only chip (no input, no button)', /class="keyword-chip inherited-keyword"/.test(html) && !/<input|<button/.test(html));
  check('escapes keyword text', /&lt;b&gt;&amp;&lt;\/b&gt;/.test(html) && !/<b>/.test(html));
  check('shows the drop notes', /Editing keywords \.\.\. not inherited/.test(html));
  const emptyHtml = WebviewClientHelpers.referenceInheritedHtml({ field: { isReference: true }, definition: def, inherited: { keywords: [], notes: [] } });
  check('says when nothing is listed as inherited', /No keywords are listed as inherited/.test(emptyHtml));
  // Task I-112: the documented limit is stated whether or not anything is listed, and only when resolved.
  check('I-112: states the validity-checking / FLTPCN limit when nothing is listed', /reference-inherited-limit/.test(emptyHtml) && /CHECK, COMP, RANGE, VALUES, CHKMSGID/.test(emptyHtml) && /FLTPCN/.test(emptyHtml));
  check('I-112: states the limit alongside listed keywords too', /reference-inherited-limit/.test(html));
  check('I-112: no limit note on the unresolved panel', !/reference-inherited-limit/.test(WebviewClientHelpers.referenceInheritedHtml({ field: { isReference: true }, definition: null, inherited: { keywords: [], notes: [] } })));
  // Task I-116: CHECK/COMP/RANGE/VALUES/CHKMSGID and FLTPCN come from a
  // separate QDBRTVFD fetch (extension.ts's fetchReferencedFieldValidity),
  // attempted every time the field is resolved. def.validityChecked says
  // whether THIS resolve's attempt succeeded - not whether the field has any
  // of these keywords (same as every other inherited category, it may
  // genuinely have none). A def with no validityChecked at all (every case
  // above, and every definition resolved before I-116 shipped) is treated
  // the same as false - the limit hint above already covers that.
  const checkedHtml = WebviewClientHelpers.referenceInheritedHtml({
    field: { isReference: true },
    definition: Object.assign({}, def, { validityChecked: true }),
    inherited: { keywords: [{ name: 'CHECK', parameters: 'ME' }, { name: 'FLTPCN', parameters: '*SINGLE' }], notes: [] },
  });
  check('I-116: validityChecked true -> the I-112 fallback hint is gone', !/reference-inherited-limit/.test(checkedHtml));
  check('I-116: ...and the QDBRTVFD-sourced keywords render as ordinary read-only chips, same as any other inherited keyword', /CHECK\(ME\)/.test(checkedHtml) && /FLTPCN\(\*SINGLE\)/.test(checkedHtml) && !/<input|<button/.test(checkedHtml));

  const notConnectedHtml = WebviewClientHelpers.referenceInheritedHtml({
    field: { isReference: true },
    definition: Object.assign({}, def, { validityChecked: false, validityError: 'Not connected to an IBM i.' }),
    inherited: { keywords: [{ name: 'TEXT', parameters: "'x'" }], notes: [] },
  });
  check('I-116: validityChecked false -> the hint is back, with the actual reason (not a generic one)', /reference-inherited-limit/.test(notConnectedHtml) && /Not connected to an IBM i\./.test(notConnectedHtml));

  const noReasonHtml = WebviewClientHelpers.referenceInheritedHtml({
    field: { isReference: true },
    definition: Object.assign({}, def, { validityChecked: false }),
    inherited: { keywords: [], notes: [] },
  });
  check('I-116: validityChecked false with no validityError -> falls back to a generic "requires a connection" reason', /requires a connection to the IBM i/.test(noReasonHtml));
}

// ---------------------------------------------------------------------------
// The real webview script in jsdom
// ---------------------------------------------------------------------------
const wvSource = sourceWith([{ name: 'CUSTNO', length: '+2' }]);
const html = getWebviewHtml('vscode-webview://fake', 'testnonce', wvSource, 'MYSCR.DSPF').replace(/<meta http-equiv="Content-Security-Policy"[^>]*>/, '');
const posted = [];
const dom = new JSDOM(html, {
  runScripts: 'dangerously',
  resources: 'usable',
  pretendToBeVisual: true,
  beforeParse(window) {
    window.acquireVsCodeApi = () => ({ getState: () => null, setState: () => {}, postMessage: (m) => posted.push(m) });
  },
});

setTimeout(() => {
  const { document: doc, Event, MessageEvent } = dom.window;
  console.log('\nwebview: reference field panel (jsdom)');

  const fieldEl = Array.from(doc.querySelectorAll('.dspf-field')).find((el) => /CUSTNO/i.test(el.textContent) || el.getAttribute('data-source-line'));
  check('setup: the reference field is drawn', !!fieldEl);
  fieldEl.dispatchEvent(new Event('click', { bubbles: true }));

  const lengthBox = doc.getElementById('p-length');
  check('the Length box of a reference field is a text box', lengthBox && lengthBox.type === 'text');
  check('it shows the +n as typed ("+2"), not a bare 2', lengthBox && lengthBox.value === '+2');
  check('the inherited panel says "Not resolved yet" before Resolve', /Not resolved yet/.test(doc.body.textContent));
  check('the Resolve button is there', !!doc.getElementById('p-resolve-ref'));

  check('before Resolve the field is drawn 1 wide (nothing known about the referenced length)', fieldEl.getAttribute('data-length') === '1');

  dom.window.dispatchEvent(new MessageEvent('message', {
    data: {
      type: 'referencesResolved',
      entries: [{
        key: '/CUSTMAST/CUSTNO',
        definition: { length: 30, dataType: '', decimalPositions: null, keywords: [{ name: 'TEXT', parameters: "'Customer number'" }, { name: 'ALIAS', parameters: 'CUSNO' }, { name: 'EDTWRD', parameters: "'  -  '" }] },
      }],
    },
  }));

  const bodyText = doc.body.textContent;
  check('after Resolve the panel lists the inherited TEXT', /TEXT\('Customer number'\)/.test(bodyText));
  check('...and ALIAS', /ALIAS\(CUSNO\)/.test(bodyText));
  check('...marked read-only inherited chips', doc.querySelectorAll('.inherited-keyword').length === 2);
  check('the +2 gives an effective length of 32', /effective length of 32/.test(bodyText));
  check('the +2 length means the referenced editing keyword is not inherited (and the panel says why)', !/EDTWRD\(/.test(bodyText) && /Editing keywords of the referenced field are not inherited/.test(bodyText));
  const drawn = Array.from(doc.querySelectorAll('.dspf-field')).find((el) => el.getAttribute('data-source-line'));
  check('the drawn field is exactly 32 columns wide after Resolve (30 + 2)', !!drawn && drawn.getAttribute('data-length') === '32' && /span 32/.test(drawn.getAttribute('style')));
  check('resolving posted nothing to the document (no applyEdit)', !posted.some((m) => m.type === 'applyEdit'));

  console.log('\nwebview: Apply keeps a +n length');
  posted.length = 0;
  doc.getElementById('p-apply').dispatchEvent(new Event('click', { bubbles: true }));
  const apply = posted.find((m) => m.type === 'applyEdit');
  check('Apply posts an edit', !!apply);
  check('the source still says "+2" after an unrelated Apply', !!apply && /CUSTNO\s+R\s+\+2\s+B/.test(apply.text));

  console.log('\nwebview: typing a new +n / -n / absolute length');
  posted.length = 0;
  doc.getElementById('p-length').value = '-3';
  doc.getElementById('p-apply').dispatchEvent(new Event('click', { bubbles: true }));
  const minus = posted.find((m) => m.type === 'applyEdit');
  check('"-3" is written as -3', !!minus && /CUSTNO\s+R\s+-3\s+B/.test(minus.text));

  posted.length = 0;
  const box2 = doc.getElementById('p-length');
  if (box2) {
    box2.value = '12';
    doc.getElementById('p-apply').dispatchEvent(new Event('click', { bubbles: true }));
    const abs = posted.find((m) => m.type === 'applyEdit');
    check('"12" is written as an absolute length', !!abs && /CUSTNO\s+R\s+12\s+B/.test(abs.text));
  }

  console.log(failures === 0 ? '\nALL CHECKS PASSED' : '\n' + failures + ' CHECK(S) FAILED');
  process.exit(failures === 0 ? 0 : 1);
}, 1500);
