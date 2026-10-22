/**
 * E11f - preview fidelity for SFGR formats (dspfEngine.js, screenExport.js; the CSS is in buildWebviewTemplate.js).
 * Pure Node: no vscode; the CSS is checked in the compiled page text.
 *
 *  1. wrap: a field longer than the rest of its row runs on into the next rows from column 1 (sample: the six long
 *     constants), SFGR fields only; DDS previews do not change;
 *  2. lines to clear: a later format clears the rows, input fields stay (covered), blank / number / 0 / start line;
 *  3. the I / O / B tick, SFGR fields only;
 *  4. attribute rules: HI + RI + UL is nondisplay (SFGR only), column separators (CS) and LOWER draw for DDS too,
 *     SFGR numeric N draws 9s;
 *  5. the exporters mirror the engine (classes, covered opacity), and the page carries the CSS.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { check, failureCount } = require('./helpers/harness');
const SfgrModel = require('../sfgrModel.js');
const DspfEngine = require('../dspfEngine.js');
const ScreenExport = require('../screenExport.js');
const ScreenText = require('../screenText.js');
const DspfParser = require('../../dist/dspfParser.js');
const { buildLine: L } = require('../fixtures/lineBuilder.js');

const sampleText = fs.readFileSync(path.join(__dirname, '..', '..', 'docs', 'sda-reference', 'source', 'stipfm.dspf36'), 'utf8');

function mk(type, parts) {
  const a = new Array(80).fill(' ');
  a[5] = type;
  parts.forEach(([col, text]) => { for (let k = 0; k < text.length; k++) a[col - 1 + k] = text[k]; });
  return a.join('').replace(/\s+$/, '');
}
const S = (name, parts) => mk('S', [[7, name]].concat(parts || []));
const D = (name, parts) => mk('D', [[7, name]].concat(parts || []));
const POS = (len, line, col) => [[15, String(len).padStart(4)], [19, String(line).padStart(2)], [21, String(col).padStart(2)]];
const model = (lines) => SfgrModel.buildModel(lines.join('\n'));
const draw = (file, name, on, size) => DspfEngine.resolveScreen(file, name, new Set(on || []), null, false, size || 0);
const html = (screen) => DspfEngine.renderScreenHtml(screen);

// ---- 1. wrap ---------------------------------------------------------------------------------------------------------
{
  const file = SfgrModel.buildModel(sampleText);
  let outside = 0;
  let pieces = 0;
  file.records.forEach((r) => {
    const sc = draw(file, r.name);
    sc.fields.forEach((f) => {
      if (f.line < 1 || f.line > sc.lines || f.column < 1 || f.column + f.length - 1 > sc.columns) outside++;
      if (f.wrapCount) pieces++;
    });
  });
  check('wrap: with the wrap drawn no field of the sample is past the screen edge (was 6 before E11f)', outside === 0);
  check('wrap: the six long constants are 15 pieces in all (SAISIE 3, ECRDI 2, SORTIE 10)', pieces === 15);

  // the long constant of SAISIE line 177: column 1, 188 cells -> 3 rows (80 + 80 + 28), the first on line 21
  const sc = draw(file, 'SAISIE');
  const run = sc.fields.filter((f) => f.sourceLine === 177);
  check('wrap: 188 cells from column 1 on row 21 are rows 21, 22, 23 of 80, 80 and 28 cells', run.length === 3 &&
    run.map((f) => f.line).join() === '21,22,23' && run.map((f) => f.length).join() === '80,80,28' && run.every((f) => f.column === 1));
  check('wrap: the pieces carry their index and count, and the field\'s own source line and anchor', run.map((f) => f.wrapIndex).join() === '0,1,2' &&
    run.every((f) => f.wrapCount === 3 && f.anchorLine === run[0].anchorLine));
  check('wrap: the text is cut to the cells each piece owns (one character per cell)', run.every((f) => f.text.length === f.length));

  // a field that starts mid-row: 5 cells left on the row, the rest on the next
  const f2 = model([S('F1'), D('LONGFLD', POS(12, 4, 76).concat([[23, 'Y'], [27, 'A']]))]);
  const w = draw(f2, 'F1').fields;
  check('wrap: a field starting at column 76 with length 12 is 5 cells on row 4 and 7 on row 5 from column 1', w.length === 2 &&
    w[0].line === 4 && w[0].column === 76 && w[0].length === 5 && w[1].line === 5 && w[1].column === 1 && w[1].length === 7 &&
    w[0].text + w[1].text === 'LONGFLDXXXXX'.slice(0, 12));
  check('wrap: a field that just fits is not wrapped', draw(model([S('F1'), D('FIT', POS(5, 4, 76).concat([[23, 'Y']]))]), 'F1').fields.length === 1);
  const w132 = draw(model([S('F1', [[39, 'Y']]), D('A', [[15, '  10'], [19, ' 2'], [21, 'C8'], [23, 'Y']])]), 'F1').fields;
  check('wrap: on a 132-column format the row is 132 wide', w132.length === 2 && w132[0].length === 5 && w132[1].column === 1 && w132[1].length === 5);

  // DDS is unchanged: a DDS field past the edge is one box, no wrap fields on it
  const dds = DspfParser.parseDspf ? DspfParser.parseDspf('     A          R REC1\n     A            F1            20A  O  2 70') : null;
  if (dds) {
    const d = DspfEngine.resolveScreen(dds, 'REC1', new Set(), null, false, 0);
    check('DDS: a field past the edge stays one box and is not wrapped', d.fields.length === 1 && d.fields[0].wrapCount === undefined && d.fields[0].length === 20);
  } else check('DDS parser build available', false);
}

// ---- 2. lines to clear -----------------------------------------------------------------------------------------------
{
  const below = (name, start, clear, fields) => [S(name, (start ? [[17, String(start).padStart(2)]] : []).concat(clear === null ? [] : [[19, String(clear).padStart(2)]]))].concat(fields);
  const text = (line, col, t) => D('K' + line, POS(t.length, line, col).concat([[56, 'C'], [57, t]]));
  const inp = (line, col) => D('IN' + line, POS(5, line, col).concat([[26, 'Y'], [23, 'Y']]));
  const out = (line, col) => D('OU' + line, POS(5, line, col).concat([[23, 'Y']]));

  // display A (rows 1 - 24) then display B starting at line 12 clearing 13 lines (12 through 24): Figure B-2
  const base = ['A'].concat([]);
  const file = model([].concat(
    below('DISPA', 0, 0, [text(2, 2, 'TOP'), text(14, 2, 'LOWCONST'), out(16, 2), inp(18, 2)]),
    below('DISPB', 12, 13, [text(1, 2, 'B')])));
  const m = DspfEngine.resolveMultiScreen(file, ['DISPA', 'DISPB'], new Set(), 0);
  const names = m.fields.map((f) => f.sourceRecord + ':' + (f.text.trim() || f.name) + '@' + f.line);
  check('clear: display B (start 12, 13 lines) removes display A\'s constants and output fields on rows 12 - 24', !names.some((n) => /LOWCONST|OU16/.test(n)) &&
    names.some((n) => n === 'DISPA:TOP@2'));
  check('clear: the input field on a cleared row stays, drawn covered and naming the format that covers it', (() => {
    const f = m.fields.find((x) => x.name === 'IN18');
    return f && f.covered === true && f.coveredBy === 'DISPB' && f.line === 18;
  })());
  check('clear: what is above the start line is untouched, and B\'s own field is on its start line', m.fields.find((x) => x.sourceRecord === 'DISPA' && x.text.trim() === 'TOP').covered === undefined &&
    m.fields.find((x) => x.sourceRecord === 'DISPB').line === 12);
  check('clear: the result lists the cleared rows for the panels', m.clears.length === 1 && m.clears[0].recordName === 'DISPB' && m.clears[0].from === 12 && m.clears[0].to === 24);
  check('clear: the preview marks the covered field (class and hover text)', (() => {
    const h = html(m);
    return /dspf-covered/.test(h) && /covered by DISPB \(still accepts input\)/.test(h);
  })());

  // blank clears every line; 0 clears none
  const all = model([].concat(below('DISPA', 0, 0, [text(2, 2, 'TOP'), inp(5, 2)]), below('DISPB', 0, null, [text(1, 2, 'B')])));
  const mAll = DspfEngine.resolveMultiScreen(all, ['DISPA', 'DISPB'], new Set(), 0);
  check('clear: blank lines to clear clears the whole display (constants gone, input kept covered)', mAll.fields.filter((f) => f.sourceRecord === 'DISPA').length === 1 &&
    mAll.fields.find((f) => f.name === 'IN5').covered === true && mAll.clears[0].from === 1 && mAll.clears[0].to === 24);
  const none = model([].concat(below('DISPA', 0, 0, [text(2, 2, 'TOP')]), below('DISPB', 0, 0, [text(1, 2, 'B')])));
  const mNone = DspfEngine.resolveMultiScreen(none, ['DISPA', 'DISPB'], new Set(), 0);
  check('clear: 0 lines to clear removes nothing', mNone.fields.length === 2 && mNone.clears.length === 0);
  const clip = model([].concat(below('DISPA', 0, 0, [text(23, 2, 'LAST')]), below('DISPB', 20, 24, [text(1, 2, 'B')])));
  check('clear: a count that runs past the last line stops at the last line', DspfEngine.resolveMultiScreen(clip, ['DISPA', 'DISPB'], new Set(), 0).clears[0].to === 24);

  // the order matters: the format shown first is not cleared by a format shown before it
  const rev = DspfEngine.resolveMultiScreen(file, ['DISPB', 'DISPA'], new Set(), 0);
  check('clear: formats drawn in the other order (A after B) clear nothing of B', rev.fields.every((f) => !f.covered) && rev.fields.some((f) => f.sourceRecord === 'DISPA'));

  // a DDS record has no lines to clear: nothing changes
  const dds = DspfParser.parseDspf([L({ nameType: 'R', name: 'REC1' }), L({ line: 5, col: 2, func: "'X'" }), L({ nameType: 'R', name: 'REC2' }), L({ line: 6, col: 2, func: "'Y'" })].join('\n'));
  const dm = DspfEngine.resolveMultiScreen(dds, ['REC1', 'REC2'], new Set(), 0);
  check('clear: DDS records clear nothing and report no clears', dm.fields.length === 2 && dm.clears.length === 0);

  // single-format screens never clear
  check('clear: resolveScreen of one format draws all its fields (clearing is between formats)', draw(file, 'DISPB').fields.length === 1);
}

// ---- 3. usage tick ---------------------------------------------------------------------------------------------------
{
  const file = model([S('F1'), D('INF', POS(5, 2, 2).concat([[26, 'Y']])), D('OUF', POS(5, 3, 2).concat([[23, 'Y']])), D('BOF', POS(5, 4, 2).concat([[23, 'Y'], [26, 'Y']])),
    D('KON', POS(5, 5, 2).concat([[56, 'C'], [57, 'TXT']]))]);
  const sc = draw(file, 'F1');
  check('tick: SFGR fields carry their usage letter (I, O, B); a constant carries none', sc.fields.map((f) => f.usageMark || '-').join('') === 'IOB-');
  const h = html(sc);
  check('tick: the HTML has the class and the letter for each, and the constant has neither', (h.match(/dspf-usage-mark/g) || []).length === 3 &&
    /data-usage-mark="I"/.test(h) && /data-usage-mark="O"/.test(h) && /data-usage-mark="B"/.test(h));
  const dds = DspfParser.parseDspf('     A          R REC1\n     A            F1             5A  B  2  2');
  const dh = html(DspfEngine.resolveScreen(dds, 'REC1', new Set(), null, false, 0));
  check('tick: a DDS field has no tick (DDS previews do not change)', !/dspf-usage-mark|data-usage-mark/.test(dh));
}

// ---- 4. attribute rules ----------------------------------------------------------------------------------------------
{
  const attrs = (cols) => model([S('F1'), D('A', POS(5, 2, 2).concat([[23, 'Y']], cols))]);
  const all3 = attrs([[39, 'Y'], [45, 'Y'], [47, 'Y']]);
  check('HI + RI + UL together is nondisplay: the SFGR field is not drawn', draw(all3, 'F1').fields.length === 0);
  check('HI + RI (without UL) is drawn', draw(attrs([[39, 'Y'], [45, 'Y']]), 'F1').fields.length === 1);
  const cond = attrs([[39, 'Y'], [45, 'Y'], [47, '31']]);
  check('the rule follows the indicators: UL on indicator 31 makes it nondisplay only when 31 is on', draw(cond, 'F1', []).fields.length === 1 &&
    draw(cond, 'F1', ['31']).fields.length === 0);
  const dds = DspfParser.parseDspf('     A          R REC1\n     A            F1             5A  O  2  2DSPATR(HI RI UL)');
  check('DDS: the same three DSPATRs are drawn as the keywords say (the rule is SFGR only)', DspfEngine.resolveScreen(dds, 'REC1', new Set(), null, false, 0).fields.length === 1);

  // column separators
  const cs = draw(attrs([[49, 'Y']]), 'F1').fields[0];
  check('CS: column separators set the style flag and the preview class', cs.style.columnSeparators === true && /dspf-cs/.test(html(draw(attrs([[49, 'Y']]), 'F1'))));
  check('CS: without it the style has no such key (existing styles are unchanged)', !('columnSeparators' in draw(attrs([]), 'F1').fields[0].style));
  const ddsCs = DspfParser.parseDspf('     A          R REC1\n     A            F1             5A  O  2  2DSPATR(CS)');
  check('CS: a DDS field with DSPATR(CS) draws it too', /dspf-cs/.test(html(DspfEngine.resolveScreen(ddsCs, 'REC1', new Set(), null, false, 0))));

  // lowercase and numeric placeholders
  const lc = model([S('F1', [[21, 'Y']]), D('NAME', POS(8, 2, 2).concat([[26, 'Y']]))]);
  check('LOWER: a field that allows lowercase is filled with lowercase x', draw(lc, 'F1').fields[0].text === 'NAMExxxx');
  const uc = model([S('F1'), D('NAME', POS(8, 2, 2).concat([[26, 'Y']]))]);
  check('LOWER: one that does not is filled with X', draw(uc, 'F1').fields[0].text === 'NAMEXXXX');
  const ddsLc = DspfParser.parseDspf('     A          R REC1\n     A            F1             8A  B  2  2LOWER');
  check('LOWER: a DDS field with the LOWER keyword is filled with x too', DspfEngine.resolveScreen(ddsLc, 'REC1', new Set(), null, false, 0).fields[0].text === 'F1xxxxxx');
  const num = (t) => draw(model([S('F1'), D('NUM', POS(8, 2, 2).concat([[26, 'Y'], [27, t]]))]), 'F1').fields[0].text;
  check('numeric: SFGR N, S and D (DDS M, S, D) are filled with 9, alphabetic types with X', num('N') === 'NUM99999' && num('S') === 'NUM99999' && num('D') === 'NUM99999' &&
    num('A') === 'NUMXXXXX' && num('') === 'NUMXXXXX');
  const ddsM = DspfParser.parseDspf('     A          R REC1\n     A            F1             8M  B  2  2');
  check('numeric: a DDS M field is unchanged (still X; only SFGR fields use their own type)', DspfEngine.resolveScreen(ddsM, 'REC1', new Set(), null, false, 0).fields[0].text === 'F1XXXXXX');
}

// ---- 5. exporters and page --------------------------------------------------------------------------------------------
{
  const file = SfgrModel.buildModel(sampleText);
  const sc = draw(file, 'SAISIE');
  let svgOk = true;
  let txtOk = true;
  file.records.forEach((r) => {
    const s = draw(file, r.name);
    try { svgOk = svgOk && /^<svg/.test(ScreenExport.buildSvg(s)); txtOk = txtOk && typeof ScreenText.buildText(s) === 'string'; } catch (e) { svgOk = false; txtOk = false; }
  });
  check('export: every sample format (wrapped pieces included) exports to SVG and text without error', svgOk && txtOk);

  // classes mirror: for every field of every format the serialiser's classes equal the engine's
  const re = /<div class="([^"]*)"[^>]*data-source-line="(\d*)"[^>]*data-render-line="(\d+)"[^>]*data-render-column="(\d+)"/g;
  let compared = 0;
  let same = true;
  file.records.forEach((r) => {
    const s = draw(file, r.name);
    const h = html(s);
    const fromHtml = [];
    let m;
    re.lastIndex = 0;
    while ((m = re.exec(h)) !== null) fromHtml.push(m[1].split(' ').filter((c) => /^dspf-(cs|covered|usage-mark|wrap-cont|field|constant|field)$/.test(c)).sort().join());
    const fromExport = s.fields.map((f) => ScreenExport.fieldClasses ? ScreenExport.fieldClasses(f).filter((c) => /^dspf-(cs|covered|usage-mark|wrap-cont|field|constant|field)$/.test(c)).sort().join() : null);
    if (fromExport.every((x) => x !== null)) {
      compared += fromHtml.length;
      if (fromHtml.join('|') !== fromExport.join('|')) same = false;
    }
  });
  check('export: the serialiser\'s field classes agree with the engine\'s for the new classes (drift guard)', ScreenExport.fieldClasses ? same && compared > 400 : true);

  const covered = { lines: 24, columns: 80, fields: [{ name: 'IN', nameType: 'FIELD', usage: 'I', dataType: 'A', line: 3, column: 2, length: 5, height: 1, text: 'IN', style: {}, covered: true, anchorLine: 3, anchorColumn: 2, sourceLine: 1 }] };
  check('export: a covered field is drawn at 0.45 opacity in the SVG', /opacity="0.45"/.test(ScreenExport.buildSvg(covered)));

  const page = fs.readFileSync(path.join(__dirname, '..', 'buildWebviewTemplate.js'), 'utf8');
  check('page: the CSS for column separators, covered and the usage tick is in the designer', /\.dspf-cs \{/.test(page) && /\.dspf-covered \{/.test(page) &&
    /\.dspf-usage-mark::after \{[^}]*attr\(data-usage-mark\)/.test(page));
  check('page: no backtick was added to the template (it would end the template literal early)', !/\/\* E11f[^*]*`/.test(page));
}

process.exit(failureCount() === 0 ? 0 : 1);
