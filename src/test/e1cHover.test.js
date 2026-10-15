/**
 * E1c - keyword hover (src/ddsHover.js, built data from src/buildKeywordHoverData.js). Pure module: no vscode, no DOM.
 * The VS Code side (createProvider) is exercised with a fake of the API; the real activate() wiring is in extension.test.js.
 */
'use strict';
const path = require('path');
const fs = require('fs');
const { check, failureCount } = require('./helpers/harness');
const { buildLine: L } = require('../fixtures/lineBuilder.js');
const DdsHover = require('../ddsHover.js');
const HoverData = require('../buildKeywordHoverData.js');
const KeywordSpec = require('../keywordSpec.js');

const data = HoverData.build();
const opts = { data, spec: KeywordSpec };
const field = (name, func, extra) => L(Object.assign({ name, length: 10, dataType: 'A', usage: 'B', line: 2, col: 2, func }, extra || {}));
const src = (lines) => lines.join('\n');
// The position (0-based) of the first `text` on line `ln`, plus `offset`.
const colOf = (lines, ln, text, offset) => lines[ln].indexOf(text) + (offset || 0);
const hover = (lines, ln, ch) => DdsHover.hoverAt(src(lines), ln, ch, opts);

// ---- module shape ----------------------------------------------------------------------------
const moduleSource = fs.readFileSync(path.join(__dirname, '../ddsHover.js'), 'utf8');
check('exports hoverAt, describe, createProvider', typeof DdsHover.hoverAt === 'function' &&
  typeof DdsHover.describe === 'function' && typeof DdsHover.createProvider === 'function');
check('no vscode import', !/require\(\s*['"]vscode['"]\s*\)/.test(moduleSource));
check('no DOM or window use', !/\b(window|document)\./.test(moduleSource.replace(/\/\*[\s\S]*?\*\//g, '')));
check('the keyword area starts at column 45 (index 44)', DdsHover.KEYWORD_AREA_START === 44);

// ---- the three levels ------------------------------------------------------------------------
const basic = [
  L({ func: 'DSPSIZ(24 80 *DS3)' }),            // 0  file
  L({ nameType: 'R', name: 'REC1' }),           // 1
  L({ func: 'OVERLAY' }),                       // 2  record
  field('FLD1', 'DSPATR(HI UL)'),               // 3  field
];
const h0 = hover(basic, 0, 44);
check('a file-level keyword hovers at the file level', h0 && h0.keyword === 'DSPSIZ' && h0.level === 'file');
check('  and its range is the keyword with its parameter list', h0 && h0.range.startLine === 0 &&
  h0.range.startCharacter === 44 && h0.range.endCharacter === 44 + 'DSPSIZ(24 80 *DS3)'.length);
check('  and the text says what it is', h0 && /\*\*DSPSIZ\*\* - file keyword/.test(h0.markdown));
const h2 = hover(basic, 2, 46);
check('a record keyword (blank-name line after an R line) hovers at the record level', h2 && h2.keyword === 'OVERLAY' && h2.level === 'record');
const h3 = hover(basic, 3, 46);
check('a field keyword hovers at the field level', h3 && h3.keyword === 'DSPATR' && h3.level === 'field');
check('  the parameters and repeatability come from the index', h3 && /\*\*Parameters:\*\* HI RI CS BL ND UL/.test(h3.markdown) && /\*\*Repeatable:\*\* yes/.test(h3.markdown));
check('  a parameter hovers as its keyword (HI inside DSPATR)', (() => { const r = hover(basic, 3, colOf(basic, 3, 'HI')); return r && r.keyword === 'DSPATR' && r.range.endCharacter === 44 + 'DSPATR(HI UL)'.length; })());
check('  so does the opening and the closing parenthesis', hover(basic, 3, colOf(basic, 3, '(')) !== null && hover(basic, 3, colOf(basic, 3, ')')) !== null);
check('the second keyword on a field line keeps the field level (a keyword line with no name)', (() => {
  const lines = [L({ nameType: 'R', name: 'R1' }), field('F1', 'DSPATR(HI)'), L({ func: 'COLOR(RED)' })];
  const r = hover(lines, 2, 46);
  return r && r.level === 'field';
})());

// ---- where there is no hover -----------------------------------------------------------------
check('no hover left of column 45', hover(basic, 3, 40) === null && hover(basic, 3, 43) === null);
check('no hover on a comment line', hover([L({ comment: 'DSPATR(HI) is mentioned here' })], 0, 20) === null);
check('no hover past the end of the line or the source', hover(basic, 3, 200) === null && hover(basic, 9, 46) === null && hover(basic, -1, 46) === null);
check('no hover on a blank between keywords', (() => {
  const lines = [L({ nameType: 'R', name: 'R1' }), field('F1', 'DSPATR(HI)   COLOR(RED)')];
  return hover(lines, 1, 44 + 'DSPATR(HI)'.length + 1) === null;
})());
check('no hover on a quoted constant at the top level', (() => {
  const lines = [L({ nameType: 'R', name: 'R1' }), L({ line: 2, col: 2, func: "'Enter DSPATR here'" })];
  return hover(lines, 1, colOf(lines, 1, 'DSPATR')) === null;
})());
check('no hover on a word the index does not know', hover([L({ func: 'NOTAKEYWORD' })], 0, 46) === null);
check('no hover with no data', DdsHover.hoverAt(src(basic), 3, 46, {}) === null);
check('lower case is read as upper case', (() => {
  const lines = [L({ nameType: 'R', name: 'R1' }), field('F1', 'dspatr(hi)')];
  const r = hover(lines, 1, 46);
  return r && r.keyword === 'DSPATR';
})());
check('CRLF line ends are handled', (() => {
  const r = DdsHover.hoverAt(src(basic).replace(/\n/g, '\r\n'), 3, 46, opts);
  return r && r.keyword === 'DSPATR';
})());
check('a short line (no keyword area at all) gives nothing and does not throw', hover([L({ nameType: 'R', name: 'R1' })], 0, 44) === null);

// ---- a literal parameter ---------------------------------------------------------------------
check('inside a quoted parameter the keyword still answers (TEXT)', (() => {
  const lines = [L({ nameType: 'R', name: 'R1' }), field('F1', "TEXT('shows DSPATR')")];
  const r = hover(lines, 1, colOf(lines, 1, 'DSPATR'));
  return r && r.keyword === 'TEXT';
})());

// ---- continuation lines ----------------------------------------------------------------------
const cont = [
  L({ nameType: 'R', name: 'R1' }),                               // 0
  field('F1', 'DSPATR(HI +'),                                     // 1
  L({ func: '  UL)' }),                                           // 2  continuation of line 1
  field('F2', 'COLOR(RED)'),                                      // 3
];
const hc = hover(cont, 2, colOf(cont, 2, 'UL'));
check('a parameter on a continuation line hovers as the keyword that opened it', hc && hc.keyword === 'DSPATR' && hc.level === 'field');
check('  and the range covers both lines', hc && hc.range.startLine === 1 && hc.range.endLine === 2 && hc.range.startCharacter === 44 &&
  hc.range.endCharacter === colOf(cont, 2, 'UL') + 2 + 1);
check('  the same hover from the first line has the same range', (() => { const r = hover(cont, 1, 46); return r && r.range.endLine === 2; })());
check('the line after a finished continuation is its own entry', (() => { const r = hover(cont, 3, 46); return r && r.keyword === 'COLOR' && r.range.startLine === 3; })());
const dash = [
  L({ nameType: 'R', name: 'R1' }),
  field('F1', 'DSPATR(HI -'),
  L({ func: 'UL)' }),
];
check('a "-" continuation reads the same way', (() => { const r = hover(dash, 2, 44); return r && r.keyword === 'DSPATR' && r.range.startLine === 1; })());
const nameOnly = [
  L({ nameType: 'R', name: 'R1' }),
  field('F1', 'DSPATR +'),
  L({ func: '(HI)' }),
];
check('the keyword name alone on a line, the parameters on the next, hover from either', hover(nameOnly, 1, 46) !== null || hover(nameOnly, 2, 45) !== null);
const three = [
  L({ nameType: 'R', name: 'R1' }),
  field('F1', 'DSPATR(HI +'),
  L({ func: '  UL +' }),
  L({ func: '  BL)' }),
];
check('a parameter on the third line of a chain hovers as the keyword that opened it', (() => {
  const r = hover(three, 3, colOf(three, 3, 'BL'));
  return r && r.keyword === 'DSPATR' && r.range.startLine === 1 && r.range.endLine === 3;
})());
const splitPlus = [L({ nameType: 'R', name: 'R1' }), field('F1', 'DSPA+'), L({ func: '    TR(HI)' })];
check('"+" joins at the first nonblank of the next line, so a name split across lines is one word', (() => {
  const r = hover(splitPlus, 2, colOf(splitPlus, 2, 'TR'));
  return r && r.keyword === 'DSPATR' && r.range.startLine === 1 && r.range.endLine === 2;
})());
const splitDash = [L({ nameType: 'R', name: 'R1' }), field('F1', 'DSPA-'), L({ func: 'TR(HI)' })];
check('"-" joins at column 45 of the next line', (() => {
  const r = hover(splitDash, 2, 44);
  return r && r.keyword === 'DSPATR';
})());
const dashBlanks = [L({ nameType: 'R', name: 'R1' }), field('F1', 'DSPA-'), L({ func: '  TR(HI)' })];
check('"-" keeps the blanks that start the next line, so they split the word', hover(dashBlanks, 2, colOf(dashBlanks, 2, 'TR')) === null);
const longComment = [L({ comment: ' '.repeat(40) + 'DSPATR(HI) in a comment' })];
check('no hover on a comment even where its text reaches the keyword area', longComment[0].length > 50 && hover(longComment, 0, colOf(longComment, 0, 'DSPATR')) === null);
check('a continuation line that has text in columns 7-44 is not a continuation', (() => {
  const lines = [L({ nameType: 'R', name: 'R1' }), field('F1', 'DSPATR(HI +'), field('F2', 'COLOR(RED)')];
  const r = hover(lines, 2, 46);
  return r && r.keyword === 'COLOR' && r.level === 'field';
})());

// ---- help specifications, families, values ---------------------------------------------------
const helpKeywords = Object.keys(data.keywords).filter((k) => data.keywords[k].some((e) => e.level === 'help-specification'));
check('the index lists help-specification keywords', helpKeywords.length >= 4);
check('a keyword on an H line hovers at the help-specification level', (() => {
  const kw = helpKeywords[0];
  const lines = [L({ nameType: 'H', name: 'HLP1' }), L({ func: kw })];
  const r = hover(lines, 1, 44);
  return r && r.keyword === kw && r.level === 'help-specification';
})());
check('CA03 is described under the CAnn family', (() => {
  const lines = [L({ func: 'CA03(03)' })];
  const r = hover(lines, 0, 45);
  return r && r.keyword === 'CA03' && /CAnn \(Command Attention\) keyword for display files/.test(r.markdown);
})());
check('CF12 is described under the CFnn family', (() => { const r = hover([L({ func: 'CF12(12)' })], 0, 45); return r && r.keyword === 'CF12'; })());
check('CA25 is not a family member', hover([L({ func: 'CA25' })], 0, 45) === null);
check('a *-value that the index describes answers for itself inside a parameter list', (() => {
  const lines = [L({ nameType: 'R', name: 'R1' }), L({ func: 'WINDOW(4 5 10 20 *RSTCSR)' })];
  const r = hover(lines, 1, colOf(lines, 1, '*RSTCSR') + 2);
  return r && r.keyword === '*RSTCSR' && r.range.startCharacter === colOf(lines, 1, '*RSTCSR') && r.range.endCharacter === colOf(lines, 1, '*RSTCSR') + 7;
})());
check('a *-value the index does not describe answers as its keyword (*DS3 in DSPSIZ)', (() => { const r = hover(basic, 0, colOf(basic, 0, '*DS3') + 1); return r && r.keyword === 'DSPSIZ'; })());

// ---- the level a keyword is not listed at ----------------------------------------------------
check('a field keyword placed on a record line says it is not listed there', (() => {
  const lines = [L({ nameType: 'R', name: 'R1' }), L({ func: 'DSPATR(HI)' })];
  const r = hover(lines, 1, 46);
  return r && r.level === 'record' && /Not listed at the record level; it is a field keyword/.test(r.markdown);
})());
check('a keyword listed at two levels names the other one', (() => {
  const r = hover([L({ func: 'CHECK(AB)' })], 0, 46);
  return r && /_Also a .*keyword\._/.test(r.markdown);
})());

// ---- what the text says ----------------------------------------------------------------------
const spec = KeywordSpec.RECORD_TYPES;
const withIndicators = Object.keys(spec).find((k) => data.keywords[k] && (spec[k].optionIndicators === 'valid' || spec[k].optionIndicatorsValid === true));
const withoutIndicators = Object.keys(spec).find((k) => data.keywords[k] && spec[k].optionIndicators === 'notValid');
check('a keyword whose spec says option indicators are valid says so', withIndicators && /\*\*Option indicators:\*\* valid/.test(DdsHover.describe(withIndicators, 'record', data, KeywordSpec).markdown));
check('a keyword whose spec says they are not valid says so', withoutIndicators && /\*\*Option indicators:\*\* not valid/.test(DdsHover.describe(withoutIndicators, 'record', data, KeywordSpec).markdown));
const grammarKeyword = Object.keys(spec).find((k) => data.keywords[k] && typeof spec[k].parameterGrammar === 'string' && spec[k].parameterGrammar);
check('a keyword whose spec has a parameter grammar shows it as a form', grammarKeyword && DdsHover.describe(grammarKeyword, 'record', data, KeywordSpec).markdown.indexOf('**Form:** `') >= 0);
check('nothing is said about option indicators when the spec is silent', (() => {
  const silent = Object.keys(data.keywords).find((k) => /^[A-Z]/.test(k) && !spec[k]);
  return silent === undefined || !/Option indicators/.test(DdsHover.describe(silent, 'file', data, KeywordSpec).markdown);
})());
check('the DDS Reference section is cited with its title and line', (() => {
  const r = hover(basic, 3, 46);
  const ref = data.references.DSPATR;
  return r.markdown.indexOf('"' + ref.title + '"') >= 0 && r.markdown.indexOf('(line ' + ref.line + ' of DDS_Keyword_V7r6.txt)') >= 0;
})());
check('a keyword with no section found cites the reference without one', (() => {
  const r = DdsHover.describe('*RSTCSR', 'record', data, KeywordSpec);
  return r && /DDS Reference \(V7R6\)\s*$/.test(r.markdown) && !/line \d+ of/.test(r.markdown);
})());
check('no internal task notes reach the text (I-nn, Task I-nn, S36-n)', Object.keys(data.keywords).every((k) => {
  const entries = data.keywords[k];
  return entries.every((e) => {
    const md = DdsHover.describe(k, e.level, data, KeywordSpec).markdown;
    return !/\bI-\d+\b|Task [A-Z]*-?\d|S36-\d/.test(md);
  });
}));
check('clean() drops a trailing task note and a parenthesised one', DdsHover.clean('Fold output (Task I-39)') === 'Fold output' &&
  DdsHover.clean('Continued field - Task I-30 correction: a number') === 'Continued field' &&
  DdsHover.clean('Unique name. See S36-3 in LIMITATIONS-PLAN.md.') === 'Unique name.' &&
  DdsHover.clean('No notes here') === 'No notes here');

// ---- every keyword in the generated index ----------------------------------------------------
{
  let tried = 0;
  const failures = [];
  const samples = { file: [], record: [], field: [], 'help-specification': [] };
  for (const name of Object.keys(data.keywords)) {
    const star = name.charAt(0) === '*';
    const text = name === 'CA01-CA24' ? 'CA01' : name === 'CF01-CF24' ? 'CF01' : name;
    for (const e of data.keywords[name]) {
      let lines;
      let ln;
      let ch;
      if (star) {
        lines = [L({ nameType: 'R', name: 'R1' }), L({ func: 'WINDOW(1 1 5 5 ' + text + ')' })];
        ln = 1; ch = colOf(lines, 1, text) + 1;
      } else if (e.level === 'file') {
        lines = [L({ func: text })]; ln = 0; ch = 44;
      } else if (e.level === 'record') {
        lines = [L({ nameType: 'R', name: 'R1' }), L({ func: text + '(X)' })]; ln = 1; ch = 45;
      } else if (e.level === 'field') {
        lines = [L({ nameType: 'R', name: 'R1' }), field('F1', text + '(X)')]; ln = 1; ch = 45;
      } else {
        lines = [L({ nameType: 'H', name: 'H1' }), L({ func: text })]; ln = 1; ch = 44;
      }
      tried++;
      const r = hover(lines, ln, ch);
      if (!r || r.keyword !== text || r.level !== (star ? 'record' : e.level) || r.markdown.indexOf('**' + text + '**') !== 0) failures.push(name + '@' + e.level);
      samples[e.level] = samples[e.level] || [];
    }
  }
  check('every keyword of the generated index hovers at each level it is listed at (' + tried + ' entries)', failures.length === 0 && tried >= 185);
  if (failures.length) console.log('  failed: ' + failures.slice(0, 12).join(', '));
}

// ---- the build of the data -------------------------------------------------------------------
check('the data carries every keyword of KEYWORD-LOOKUP.json', Object.keys(data.keywords).length === Object.keys(require('../../docs/sda-reference/keyword-index/KEYWORD-LOOKUP.json').keywords).length);
{
  const refText = fs.readFileSync(path.join(__dirname, '../../docs/sda-reference/source/DDS_Keyword_V7r6.txt'), 'utf8').split(/\r\n|\r|\n/);
  const refs = Object.keys(data.references);
  check('at least 170 of the keywords have a DDS Reference section', refs.length >= 170);
  check('only *-values, which are not sections of their own, and IGCCNV have no citation', Object.keys(data.keywords).filter((k) => !data.references[k] && k.charAt(0) !== '*').join(',') === 'IGCCNV');
  check('every citation points at a section heading in the first column', refs.every((k) => {
    const raw = refText[data.references[k].line - 1];
    return raw !== undefined && /^\f?\S/.test(raw) && raw.replace(/^\f/, '').trim().indexOf(data.references[k].title.split(' ')[0]) === 0;
  }));
  check('WINDOW cites its section, not a "Related reference" cross-link', (() => {
    const raw = refText[data.references.WINDOW.line - 1];
    return /^\fWINDOW \(Window\) keyword for display files/.test(raw);
  })());
}
check('readReferences: an indented heading is a cross-link and is not a section', (() => {
  const refs = HoverData.readReferences(['    ZZTOP (Zz Top) keyword for display files', 'ZZTOP (Zz Top) keyword for display files', '   ZZTOP (Zz Top) keyword for display files'].join('\n'));
  return refs.ZZTOP && refs.ZZTOP.line === 2;
})());
check('readReferences: a table-of-contents entry (dot leaders) is not a heading', Object.keys(HoverData.readReferences('ZZTOP (Zz Top) keyword for display files........ 12\n')).length === 0);
check('readReferences: a heading wrapped over two lines is joined', (() => {
  const refs = HoverData.readReferences('AAAA (A) and BBBB (B)\nkeywords for display files\n');
  return refs.AAAA && refs.BBBB && refs.AAAA.line === 1;
})());
check('namesOfHeading splits families and pairs', JSON.stringify(HoverData.namesOfHeading('PAGEDOWN/PAGEUP (Page Down/Page Up)')) === '["PAGEDOWN","PAGEUP"]' &&
  JSON.stringify(HoverData.namesOfHeading('CAnn (Command Attention)')) === '["CA01-CA24"]' &&
  JSON.stringify(HoverData.namesOfHeading('ERRMSG (Error Message) and ERRMSGID (Error Message Identifier)')) === '["ERRMSG","ERRMSGID"]');
check('the build script is wired into build:webview-assets and copies ddsHover.js', (() => {
  const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '../../package.json'), 'utf8'));
  const s = pkg.scripts['build:webview-assets'];
  return /node src\/buildKeywordHoverData\.js/.test(s) && /'ddsHover\.js'/.test(s);
})());
check('the manifest has isda.hover.enable, on by default', (() => {
  const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '../../package.json'), 'utf8'));
  const p = pkg.contributes.configuration.properties['isda.hover.enable'];
  return p && p.type === 'boolean' && p.default === true;
})());

// ---- the VS Code side ------------------------------------------------------------------------
{
  class MarkdownString { constructor(v) { this.value = v; } }
  class Range { constructor(a, b, c, d) { this.start = { line: a, character: b }; this.end = { line: c, character: d }; } }
  class Hover { constructor(contents, range) { this.contents = contents; this.range = range; } }
  const api = { MarkdownString, Range, Hover };
  let loads = 0;
  let enable = true;
  let accept = true;
  const provider = DdsHover.createProvider(api, {
    getSettings: () => ({ enable }),
    shouldHover: () => accept,
    loadData: () => { loads++; return data; },
    spec: KeywordSpec,
  });
  const doc = { getText: () => src(basic) };
  const pos = (line, character) => ({ line, character });
  const hv = provider.provideHover(doc, pos(3, 46));
  check('the provider answers with a Hover holding markdown and the keyword range', hv instanceof Hover && hv.contents instanceof MarkdownString &&
    /\*\*DSPATR\*\*/.test(hv.contents.value) && hv.range.start.line === 3 && hv.range.start.character === 44 && hv.range.end.character === 44 + 'DSPATR(HI UL)'.length);
  check('the data is loaded once, on the first hover', loads === 1 && (provider.provideHover(doc, pos(2, 46)), loads === 1));
  check('no hover where there is no keyword', provider.provideHover(doc, pos(3, 10)) === undefined);
  enable = false;
  check('isda.hover.enable = false gives no hover', provider.provideHover(doc, pos(3, 46)) === undefined);
  enable = true;
  accept = false;
  check('a document the extension does not treat as DDS gets no hover', provider.provideHover(doc, pos(3, 46)) === undefined);
}

// ---- speed -----------------------------------------------------------------------------------
{
  const big = [L({ func: 'DSPSIZ(24 80 *DS3)' })];
  for (let i = 0; i < 4000; i++) {
    big.push(L({ nameType: 'R', name: 'R' + String(i).padStart(4, '0') }));
    big.push(field('F' + i, 'DSPATR(HI)'));
    big.push(field('G' + i, 'COLOR(RED)'));
    big.push(L({ func: '  ' }));
    big.push(L({ comment: 'spacing' }));
  }
  const text = src(big);
  const t0 = Date.now();
  const r = DdsHover.hoverAt(text, big.length - 3, 46, opts);
  const ms = Date.now() - t0;
  check('hover at the end of a ' + big.length + '-line source answers in under 200 ms (' + ms + ' ms)', r && r.keyword === 'COLOR' && ms < 200);
}

process.exit(failureCount() === 0 ? 0 : 1);
