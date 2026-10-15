/**
 * E1d - keyword completion (src/ddsCompletion.js). Pure module: no vscode, no DOM. The VS Code side
 * (createProvider) is exercised with a fake of the API; the real activate() wiring is in extension.test.js.
 */
'use strict';
const path = require('path');
const fs = require('fs');
const { check, failureCount } = require('./helpers/harness');
const { buildLine: L } = require('../fixtures/lineBuilder.js');
const DdsCompletion = require('../ddsCompletion.js');
const DdsDiagnostics = require('../ddsDiagnostics.js');
const HoverData = require('../buildKeywordHoverData.js');
const KeywordSpec = require('../keywordSpec.js');

const data = HoverData.build();
const opts = { data, spec: KeywordSpec };
const BLANK = '     A' + ' '.repeat(38); // a keyword line with nothing typed yet (the cursor can sit at column 45)
const field = (name, func, extra) => L(Object.assign({ name, length: 10, dataType: 'A', usage: 'B', line: 2, col: 2, func }, extra || {}));
const src = (lines) => lines.join('\n');
const complete = (lines, ln, ch, extra) => DdsCompletion.completionAt(src(lines), ln, ch, Object.assign({}, opts, extra || {}));
const names = (r) => (r ? r.items.map((i) => i.name) : []);
const has = (r, n) => names(r).indexOf(n) >= 0;
const end = (lines, ln) => lines[ln].length;

// ---- module shape ----------------------------------------------------------------------------
const moduleSource = fs.readFileSync(path.join(__dirname, '../ddsCompletion.js'), 'utf8');
check('exports completionAt, insertFor, createProvider', typeof DdsCompletion.completionAt === 'function' &&
  typeof DdsCompletion.insertFor === 'function' && typeof DdsCompletion.createProvider === 'function');
check('no vscode import', !/require\(\s*['"]vscode['"]\s*\)/.test(moduleSource));
check('no DOM or window use', !/\b(window|document)\./.test(moduleSource.replace(/\/\*[\s\S]*?\*\//g, '')));
check('the keyword area starts at column 45 (index 44)', DdsCompletion.KEYWORD_AREA_START === 44);

// ---- the three levels (and the help specification) ---------------------------------------------
const base = [
  L({ func: 'DSPSIZ(24 80 *DS3)' }),   // 0 file
  BLANK,                                // 1 file, blank
  L({ nameType: 'R', name: 'REC1' }),   // 2
  BLANK,                                // 3 record, blank
  field('FLD1', 'DSPATR(HI) '),         // 4 field
  L({ nameType: 'H', name: 'HLP1' }),   // 5
  BLANK,                                // 6 help specification
];
const lvl = (ln) => complete(base, ln, 44, { filterByRules: false });
check('a blank line before the first record is at the file level', lvl(1) && lvl(1).level === 'file');
check('  and offers file keywords (CHGINPDFT is not one, ALTHELP is)', has(lvl(1), 'ALTHELP') && !has(lvl(1), 'DSPATR'));
check('a blank line after an R line is at the record level', lvl(3) && lvl(3).level === 'record' && has(lvl(3), 'OVERLAY') && !has(lvl(3), 'DSPATR'));
check('the end of a field line is at the field level', complete(base, 4, end(base, 4), { filterByRules: false }).level === 'field');
check('  and offers field keywords', has(complete(base, 4, end(base, 4), { filterByRules: false }), 'COLOR'));
check('a blank line after an H line is at the help-specification level', lvl(6) && lvl(6).level === 'help-specification');
check('  with its own keywords (HLPRCD)', has(lvl(6), 'HLPRCD'));
check('every offered name is in the index at that level', ['file', 'record', 'field', 'help-specification'].every((level) => {
  const ln = { file: 1, record: 3, field: 4, 'help-specification': 6 }[level];
  const r = complete(base, ln, ln === 4 ? end(base, 4) : 44, { filterByRules: false });
  return r.items.every((i) => {
    const key = /^C[AF]\d\d$/.test(i.name) ? 'C' + i.name.charAt(1) + '01-C' + i.name.charAt(1) + '24' : i.name;
    return (data.keywords[key] || []).some((e) => e.level === level);
  });
}));
check('parameter values (*AUTOENT ...) are not offered as keywords', names(lvl(1)).concat(names(complete(base, 4, end(base, 4)))).every((n) => n.charAt(0) !== '*'));

// ---- where there is no completion --------------------------------------------------------------
check('none left of column 45', complete(base, 4, 40) === null && complete(base, 4, 43) === null);
check('none on a comment line', complete([L({ comment: 'DSPATR is mentioned here' })], 0, 40) === null);
check('none past the end of the line or the source', complete(base, 4, 300) === null && complete(base, 99, 46) === null && complete(base, -1, 46) === null);
check('none inside a parameter list', complete([L({ nameType: 'R', name: 'R1' }), field('F1', 'DSPATR(H')], 1, end([0, field('F1', 'DSPATR(H')], 1)) === null);
check('none inside a quoted constant', (() => {
  const ls = [L({ nameType: 'R', name: 'R1' }), field('F1', "TEXT('AB")];
  return complete(ls, 1, end(ls, 1)) === null;
})());
check('after a closed parameter list the next keyword is completed', (() => {
  const ls = [L({ nameType: 'R', name: 'R1' }), field('F1', 'DSPATR(HI) COL')];
  const r = complete(ls, 1, end(ls, 1));
  return r && r.word === 'COL' && names(r).indexOf('COLOR') >= 0;
})());

// ---- the word being typed ----------------------------------------------------------------------
{
  const ls = [L({ nameType: 'R', name: 'R1' }), field('F1', 'DSPA')];
  const r = complete(ls, 1, end(ls, 1));
  check('the typed word is read, and only keywords starting with it are offered', r && r.word === 'DSPA' && names(r).join() === 'DSPATR');
  check('  the range covers the word', r.range.startLine === 1 && r.range.startCharacter === 44 && r.range.endCharacter === 48);
  check('  and the list is incomplete (the client asks again as it is typed)', r.incomplete === true);
  const low = complete([L({ nameType: 'R', name: 'R1' }), field('F1', 'dspa')], 1, 48);
  check('  lower case matches too', names(low).join() === 'DSPATR');
  const mid = complete([L({ nameType: 'R', name: 'R1' }), field('F1', 'DSPATR')], 1, 47);
  check('  completing in the middle of a word replaces all of it', mid.word === 'DSP' && mid.range.endCharacter === 50);
  const empty = complete(base, 3, 44, { filterByRules: false });
  check('an empty word gives a complete list', empty.incomplete === false && empty.word === '');
}

// ---- what the entity already has ---------------------------------------------------------------
{
  const ls = [L({ nameType: 'R', name: 'R1' }), field('F1', "DFT('X') COLOR(RED) DSPATR(HI) "), field('F2', "TEXT('f2')")];
  const r = complete(ls, 1, end(ls, 1), { filterByRules: false });
  check('a keyword the field has is not offered again', !has(r, 'DFT'));
  check('  a repeatable one (DSPATR) is', has(r, 'DSPATR') && has(r, 'COLOR'));
  check('  and the next field\'s keywords are not counted', has(r, 'TEXT'));
  const cont = [L({ nameType: 'R', name: 'R1' }), field('F1', 'COLOR(RED) +'), L({ func: 'BLKF' })];
  const c = complete(cont, 2, end(cont, 2), { filterByRules: false });
  check('a continuation line completes at the field level', c && c.level === 'field' && c.word === 'BLKF' && names(c).join() === 'BLKFOLD');
  const cont2 = [L({ nameType: 'R', name: 'R1' }), field('F1', "DFT('X') +"), L({ func: 'DF' })];
  const c2 = complete(cont2, 2, end(cont2, 2), { filterByRules: false });
  check('  and a keyword on an earlier line of the chain is not offered again (DF gives DFTVAL, not DFT)', names(c2).join() === 'DFTVAL');
  const second = [L({ nameType: 'R', name: 'R1' }), field('F1', 'DSPATR(HI)'), L({ func: "DFT('X')" }), BLANK];
  check('a keyword on a later keyword line of the same field counts too', !has(complete(second, 3, 44, { filterByRules: false }), 'DFT'));
  const typing = [L({ nameType: 'R', name: 'R1' }), field('F1', 'DFT')];
  check('the word being typed is not counted as present (DFT completes to DFT)', names(complete(typing, 1, end(typing, 1), { filterByRules: false })).indexOf('DFT') >= 0);
}

// ---- field usage and data type -----------------------------------------------------------------
{
  const mk = (extra) => [L({ nameType: 'R', name: 'R1' }), field('F1', '', extra)];
  const o = complete(mk({ dataType: 'S', usage: 'O', decimals: 0 }), 1, 44, { filterByRules: false });
  const i = complete(mk({ dataType: 'A', usage: 'I' }), 1, 44, { filterByRules: false });
  const b = complete(mk({ dataType: '', usage: '' }), 1, 44, { filterByRules: false });
  check('an output field is not offered the input-only keywords (BLANKS, CNTFLD, FLDCSRPRG)', !has(o, 'BLANKS') && !has(o, 'CNTFLD') && !has(o, 'FLDCSRPRG'));
  check('  an input field is', has(i, 'BLANKS') && has(i, 'CNTFLD') && has(i, 'FLDCSRPRG'));
  check('FLTFIXDEC (float only) is not offered on a numeric or a character field', !has(o, 'FLTFIXDEC') && !has(i, 'FLTFIXDEC'));
  check('a field with no usage or data type filled in is not filtered by them', has(b, 'BLANKS') && has(b, 'CNTFLD') && has(b, 'FLTFIXDEC'));
  const flt = complete(mk({ dataType: 'F', usage: 'B', decimals: 2 }), 1, 44, { filterByRules: false });
  check('a floating-point field is offered FLTFIXDEC', has(flt, 'FLTFIXDEC'));
  const num = complete(mk({ dataType: 'S', usage: 'B', decimals: 0 }), 1, 44, { filterByRules: false });
  check('CNTFLD needs data type A (a required type): left out on S, offered on A', !has(num, 'CNTFLD') && has(complete(mk({ dataType: 'A', usage: 'B' }), 1, 44, { filterByRules: false }), 'CNTFLD'));
  const edt = complete(mk({ dataType: 'Y', usage: 'B', decimals: 0 }), 1, 44, { filterByRules: false });
  check('EDTCDE is limited to data type Y (an allowed list): not offered on A, offered on Y', !has(i, 'EDTCDE') && has(edt, 'EDTCDE'));
}

// ---- the guards --------------------------------------------------------------------------------
const record = (kw) => [L({ nameType: 'R', name: 'REC1' }), L({ func: kw }), BLANK, field('F1', '')];
{
  const sfl = complete(record('SFL'), 2, 44);
  const sflAll = complete(record('SFL'), 2, 44, { filterByRules: false });
  const expected = ['CHANGE', 'CHECK', 'CHGINPDFT', 'INDTXT', 'KEEP', 'LOGINP', 'LOGOUT', 'SETOF', 'SFLNXTCHG', 'TEXT'];
  check('a subfile record is offered the keywords IBM allows on it (the whitelist) and not the others',
    expected.every((n) => has(sfl, n)) && !has(sfl, 'WDWBORDER') && !has(sfl, 'USRDFN') && !has(sfl, 'WINDOW') && !has(sfl, 'DSPMOD'));
  check('  with the rule check off every record keyword is listed', sflAll.items.length > sfl.items.length && has(sflAll, 'WDWBORDER'));
  check('  and the checked list is a subset of the unchecked one', sfl.items.every((i) => has(sflAll, i.name)));
  const win = complete(record('WINDOW(1 1 10 40)'), 2, 44);
  check('a window record is offered WDWBORDER and WDWTITLE (their parameter shapes are not held against them)', has(win, 'WDWBORDER') && has(win, 'WDWTITLE'));
  check('  and not SFL or USRDFN, which cannot go with WINDOW', !has(win, 'SFL') && !has(win, 'USRDFN'));
  check('a keyword that needs OVERLAY (PUTRETAIN) is not offered without it', !has(complete(record('SLNO(2)'), 2, 44), 'PUTRETAIN'));
  check('  and is with it', has(complete(record('OVERLAY'), 2, 44), 'PUTRETAIN'));
  const usr = complete(record('USRDFN'), 2, 44);
  check('a USRDFN record is offered its whitelist (INVITE, KEEP) and not SFL, WINDOW or SLNO', has(usr, 'INVITE') && has(usr, 'KEEP') && !has(usr, 'SFL') && !has(usr, 'WINDOW') && !has(usr, 'SLNO'));
  const fld = complete([L({ nameType: 'R', name: 'R1' }), field('F1', '', { dataType: 'S', usage: 'O', decimals: 0 })], 1, 44);
  check('a field-level rule hides a keyword the field cannot take (DATE on a named field)', !has(fld, 'DATE') && !has(fld, 'USER'));
  check('  but a keyword whose parameters alone are wrong stays (CHCCTL needs a choice number)', has(complete([L({ nameType: 'R', name: 'R1' }), field('F1', '')], 1, 44), 'CHCCTL'));
  const fileLevel = complete([L({ func: 'DSPSIZ(24 80 *DS3)' }), BLANK, L({ nameType: 'R', name: 'R1' })], 1, 44);
  check('file-level completion runs the guards over the whole source', fileLevel && fileLevel.level === 'file' && fileLevel.items.length > 10);
}

// ---- the checks that do not depend on the shipped index or spec ----------------------------------
{
  const fake = { keywords: { ZZKW: [{ level: 'record', category: 'Test', description: 'test', parameters: '', repeatable: false }], ZZTYP: [{ level: 'field', category: 'Test', description: 'test', parameters: '', repeatable: false }] }, references: {} };
  const rec = [L({ nameType: 'R', name: 'R1' }), BLANK];
  // a probe the parser never reads as the keyword proves nothing, so the keyword is offered
  const unread = { analyze: (text) => ({ diagnostics: text.indexOf('ZZKW') >= 0 ? [{ code: 'isda.test', message: 'bad', line: 1, column: 1, endColumn: 2, severity: 'error' }] : [], model: { records: [{ keywords: [] }] } }), recordKeywordCodes: () => [] };
  const a = DdsCompletion.completionAt(src(rec), 1, 44, { data: fake, spec: null, diagnostics: unread });
  check('a form the parser does not read as the keyword is not held against it', names(a).join() === 'ZZKW');
  // the same violation, with the keyword read: refused
  const read = { analyze: (text) => ({ diagnostics: text.indexOf('ZZKW') >= 0 ? [{ code: 'isda.test', message: 'bad', line: 1, column: 1, endColumn: 2, severity: 'error' }] : [], model: { records: [{ keywords: text.indexOf('ZZKW') >= 0 ? [{ name: 'ZZKW' }] : [] }] } }), recordKeywordCodes: () => [] };
  DdsCompletion.clearCache();
  const b = DdsCompletion.completionAt(src(rec), 1, 44, { data: fake, spec: null, diagnostics: read });
  check('  and one the parser reads that adds a violation is refused', b && names(b).length === 0);
  // a data type the spec blocks
  const stub = { blockedDataTypes: (n) => (n === 'ZZTYP' ? ['S'] : null) };
  const fieldLines = (type) => [L({ nameType: 'R', name: 'R1' }), field('F1', '', { dataType: type, usage: 'B', decimals: type === 'S' ? 0 : undefined }), ];
  const blockedOn = DdsCompletion.completionAt(src(fieldLines('S')), 1, 44, { data: fake, spec: stub, filterByRules: false });
  const blockedOff = DdsCompletion.completionAt(src(fieldLines('A')), 1, 44, { data: fake, spec: stub, filterByRules: false });
  check('a data type the spec blocks leaves the keyword out, another type does not', names(blockedOn).length === 0 && names(blockedOff).join() === 'ZZTYP');
  // a constant being typed
  const constant = [L({ nameType: 'R', name: 'R1' }), L({ line: 9, col: 2, func: "'Order ent" })];
  check('none inside a constant field\'s quoted text', complete(constant, 1, end(constant, 1)) === null);
  DdsCompletion.clearCache();
}

// ---- parameter snippets ------------------------------------------------------------------------
{
  const ins = (name, level) => DdsCompletion.insertFor(name, data.keywords[name].filter((e) => e.level === (level || 'field'))[0], KeywordSpec);
  check('a keyword with no parameters inserts bare (BLKFOLD)', ins('BLKFOLD').text === 'BLKFOLD' && ins('BLKFOLD').snippet === false);
  const color = ins('COLOR');
  check('an enumerated parameter is a choice snippet (COLOR)', color.snippet && color.text === 'COLOR(${1|BLU,GRN,PNK,RED,TRQ,WHT,YLW|})');
  const generic = ins('EDTMSK');
  check('another parameter is a placeholder named for it (EDTMSK)', generic.snippet && /^EDTMSK\(\$\{1:[^}]+\}\)$/.test(generic.text));
  check('an optional parameter inserts bare (ERASEINP)', ins('ERASEINP', 'record').text === 'ERASEINP' && ins('ERASEINP', 'record').snippet === false);
  const tricky = DdsCompletion.insertFor('XX', { parameters: 'a$b} c|d' }, null);
  check('a placeholder label has $ and } escaped and | turned into /', tricky.snippet && tricky.text === 'XX(${1:a\\$b\\} c/d})');
  check('every item carries insertText and a documentation text', (() => {
    const r = complete(base, 4, end(base, 4), { filterByRules: false });
    return r.items.every((i) => typeof i.insertText === 'string' && i.insertText.indexOf(i.name) === 0 && /^\*\*/.test(i.documentation));
  })());
}

// ---- command-key groups ------------------------------------------------------------------------
{
  const r = complete([L({ func: 'DSPSIZ(24 80 *DS3)' }), BLANK], 1, 44, { filterByRules: false });
  check('CA01-CA24 and CF01-CF24 are offered one by one', has(r, 'CA01') && has(r, 'CA24') && has(r, 'CF12') && !has(r, 'CA01-CA24'));
  const used = complete([L({ func: "CA03(99 'Exit')" }), BLANK], 1, 44, { filterByRules: false });
  check('a command key can be given again (it is repeatable, each with its own indicators)', has(used, 'CA03') && has(used, 'CA04'));
  check('  and its snippet is the keyword with a parameter placeholder', complete([BLANK], 0, 44, { filterByRules: false }).items.filter((i) => i.name === 'CF03')[0].insertText.indexOf('CF03(${1:') === 0);
}

// ---- budget, cache, failure ---------------------------------------------------------------------
{
  let calls = 0;
  const counting = Object.assign({}, DdsDiagnostics, { analyze: (s) => { calls++; return DdsDiagnostics.analyze(s); } });
  const ls = record('SFL');
  DdsCompletion.clearCache();
  const first = complete(ls, 2, 44, { diagnostics: counting });
  const firstCalls = calls;
  calls = 0;
  const second = complete(ls, 2, 44, { diagnostics: counting });
  check('the guards are asked on the first request (' + firstCalls + ' analyses)', firstCalls > 10);
  check('  and not again for the same context (cache)', calls === 0 && names(second).join() === names(first).join());
  calls = 0;
  const typed = [ls[0], ls[1], L({ func: 'TE' }), ls[3]];
  complete(typed, 2, end(typed, 2), { diagnostics: counting });
  const typedCalls = calls;
  calls = 0;
  complete([ls[0], ls[1], L({ func: 'TEX' }), ls[3]], 2, 47, { diagnostics: counting });
  check('typing more of the word reuses what the guards said (the word is not part of the context)', typedCalls > 0 && calls <= typedCalls);

  DdsCompletion.clearCache();
  let t = 0;
  const clock = () => { t += 100; return t; };
  const slow = complete(ls, 2, 44, { budgetMs: 150, now: clock });
  check('past the time budget the remaining keywords are offered and counted as unchecked', slow.unchecked > 0 && slow.items.length > first.items.length);

  DdsCompletion.clearCache();
  const broken = { analyze: () => { throw new Error('boom'); } };
  const b = complete(ls, 2, 44, { diagnostics: broken });
  check('a guard that throws does not take the completion down (keywords offered, counted unchecked)', b && b.items.length > 0 && b.unchecked === b.items.length);
  DdsCompletion.clearCache();
}

// ---- speed -------------------------------------------------------------------------------------
{
  const big = [L({ func: 'DSPSIZ(24 80 *DS3)' })];
  for (let i = 0; i < 4000; i++) {
    big.push(L({ nameType: 'R', name: 'R' + String(i).padStart(4, '0') }));
    big.push(field('F' + i, 'DSPATR(HI)'));
    big.push(field('G' + i, 'COLOR(RED)'));
    big.push(L({ func: '  ' }));
    big.push(L({ comment: 'spacing' }));
  }
  big.splice(big.length - 2, 0, field('LAST', ''));
  DdsCompletion.clearCache();
  const t0 = Date.now();
  const r = DdsCompletion.completionAt(src(big), big.length - 3, 44, opts);
  const ms = Date.now() - t0;
  check('field completion in a ' + big.length + '-line source answers in under 1 s (' + ms + ' ms)', r && r.level === 'field' && r.items.length > 30 && ms < 1000);
  DdsCompletion.clearCache();
}

// ---- the VS Code side --------------------------------------------------------------------------
{
  class Range { constructor(a, b, c, d) { this.a = a; this.b = b; this.c = c; this.d = d; } }
  class MarkdownString { constructor(v) { this.value = v; } }
  class SnippetString { constructor(v) { this.value = v; } }
  class CompletionItem { constructor(label, kind) { this.label = label; this.kind = kind; } }
  class CompletionList { constructor(items, inc) { this.items = items; this.isIncomplete = inc; } }
  const api = { Range, MarkdownString, SnippetString, CompletionItem, CompletionList, CompletionItemKind: { Keyword: 13 } };
  let enable = true;
  let filter = true;
  let accept = true;
  let loads = 0;
  const provider = DdsCompletion.createProvider(api, {
    getSettings: () => ({ enable, filterByRules: filter }),
    shouldComplete: () => accept,
    loadData: () => { loads++; return data; },
    spec: KeywordSpec,
  });
  const lines = [L({ nameType: 'R', name: 'R1' }), field('F1', 'COL')];
  const doc = { getText: () => src(lines) };
  const pos = (line, character) => ({ line, character });
  const list = provider.provideCompletionItems(doc, pos(1, end(lines, 1)));
  check('the provider answers with a CompletionList of keyword items', list instanceof CompletionList && list.items.length === 1 && list.items[0].label === 'COLOR' && list.items[0].kind === 13);
  check('  an incomplete one while a word is typed', list.isIncomplete === true);
  check('  with a snippet, the range of the word and the documentation', list.items[0].insertText instanceof SnippetString &&
    list.items[0].insertText.value.indexOf('COLOR(${1|') === 0 && list.items[0].range.b === 44 && list.items[0].range.d === 47 &&
    list.items[0].documentation instanceof MarkdownString);
  provider.provideCompletionItems(doc, pos(1, end(lines, 1)));
  check('the data is loaded once', loads === 1);
  const bare = DdsCompletion.createProvider(api, { getSettings: () => ({ enable: true, filterByRules: true }), shouldComplete: () => true, loadData: () => data, spec: KeywordSpec })
    .provideCompletionItems({ getText: () => src([L({ nameType: 'R', name: 'R1' }), field('F1', 'BLKF')]) }, pos(1, 48));
  check('a keyword with no parameters is inserted as plain text', bare.items.length === 1 && bare.items[0].insertText === 'BLKFOLD');
  check('no completion outside the keyword area', provider.provideCompletionItems(doc, pos(1, 10)) === undefined);
  enable = false;
  check('isda.completion.enable = false gives none', provider.provideCompletionItems(doc, pos(1, end(lines, 1))) === undefined);
  enable = true;
  accept = false;
  check('a document the extension does not treat as DDS gets none', provider.provideCompletionItems(doc, pos(1, end(lines, 1))) === undefined);
  accept = true;
  filter = false;
  const unfiltered = provider.provideCompletionItems({ getText: () => src(record('SFL')) }, pos(2, 44));
  filter = true;
  const filtered = provider.provideCompletionItems({ getText: () => src(record('SFL')) }, pos(2, 44));
  check('isda.completion.filterByRules = false lists keywords the rules would hide', unfiltered.items.length > filtered.items.length);
  DdsCompletion.clearCache();
}

process.exit(failureCount() === 0 ? 0 : 1);
