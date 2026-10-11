/**
 * e9DateEditSeparatorSource.test.js
 *
 * Task E9 - EDTCDE(Y) / EDTCDE(W) date separator: where it comes from.
 *  - precedence: connected job's DATSEP, then isda.previewDateSeparator, then '/'
 *  - the setting's values (five characters and the word "blank"), bad values ignored
 *  - the preview text and the engine follow it for Y and W; the WIDTH never changes
 *  - the field panel says which source is in use (and only for Y / W)
 *  - package.json declares the setting; extension.ts sends it
 *
 * Run with: node src/test/e9DateEditSeparatorSource.test.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const KeywordSpec = require(path.join(__dirname, '../keywordSpec.js'));
const DspfEngine = require(path.join(__dirname, '../dspfEngine.js'));
const DspfWriter = require(path.join(__dirname, '../dspfWriter.js'));
const { check, failureCount } = require('./helpers/harness');

const dom = new JSDOM('<!doctype html><html><body></body></html>');
global.document = dom.window.document;
global.Node = dom.window.Node;
global.window = dom.window;
global.DspfWriter = DspfWriter;
global.KeywordSpec = KeywordSpec;
global.DspfEngine = DspfEngine;
const Helpers = require(path.join(__dirname, '../webviewClientHelpers.js'));

const J = (f, s) => ({ dateFormat: f, dateSeparator: s });
const oct3 = new Date(2026, 9, 3, 11, 6, 45);
const R = KeywordSpec.resolveDateSeparator;

// 1. precedence
check('job wins over the setting', JSON.stringify(R(J('*MDY', '-'), '.')) === '{"separator":"-","source":"job"}');
check('setting is used with no job', JSON.stringify(R(null, ',')) === '{"separator":",","source":"setting"}');
check('default slash with neither', JSON.stringify(R(null, null)) === '{"separator":"/","source":"default"}');
check('an unusable job falls through to the setting', R({ dateFormat: '*XXX', dateSeparator: '-' }, '.').source === 'setting');
check('an unusable setting falls through to the default', R(null, 'x').source === 'default' && R(null, '').source === 'default' && R(null, undefined).source === 'default');
check('a job with a missing separator is the default slash but still source job', JSON.stringify(R(J('*MDY', ''), '.')) === '{"separator":"/","source":"job"}');

// 2. setting values
const N = KeywordSpec.normalizeSeparatorSetting;
check('setting accepts / - . ,', ['/', '-', '.', ','].every((c) => N(c) === c));
check('setting accepts the word blank (any case) and a lone space', N('blank') === ' ' && N('Blank') === ' ' && N(' ') === ' ');
check('setting rejects empty, letters, null', N('') === null && N('x') === null && N(null) === null && N(undefined) === null);
check('setting uses only the first character of a longer value', N('-x') === '-');

// 3. preview text and width
const p = (o) => KeywordSpec.systemValuePreviewText('DATE', o, oct3);
check('Y with a setting separator: 10-03-26', p({ editCode: 'Y', dateSeparator: '-' }) === '10-03-26');
check('W with a setting separator: 2026.10.03', p({ editCode: 'W', dateParameters: '*YY', dateSeparator: '.' }) === '2026.10.03');
check('an explicit separator beats the job in the same options', p({ editCode: 'Y', jobDate: J('*MDY', '.'), dateSeparator: ',' }) === '10,03,26');
check('no separator and no job keeps the slash', p({ editCode: 'Y' }) === '10/03/26' && p({ editCode: 'W', dateParameters: '*YY' }) === '2026/10/03');
check('a blank separator draws blanks', p({ editCode: 'Y', dateSeparator: ' ' }) === '10 03 26');
check('other edit codes ignore the separator', p({ editCode: '5', dateSeparator: '-' }) === '100326' && p({ dateSeparator: '-' }) === '100326');
check('width never depends on the separator', ['/', '-', '.', ',', ' '].every((c) => KeywordSpec.systemValueConstantWidth('DATE', { editCode: 'Y', dateSeparator: c }) === 8 && KeywordSpec.systemValueConstantWidth('DATE', { editCode: 'W', dateParameters: '*YY', dateSeparator: c }) === 10));
check('the preview is as wide as the field for every separator', ['/', '-', '.', ',', ' '].every((c) => ['Y', 'W'].every((code) => p({ editCode: code, dateSeparator: c }).length <= KeywordSpec.systemValueConstantWidth('DATE', { editCode: code, dateSeparator: c }))));

// 3b. the EDTCDE rules (Table 6 notes 2 and 3): zero suppression and patterns agree
const dt = (y, m, d) => new Date(y, m - 1, d, 0, 0, 0);
const pv = (o, when) => KeywordSpec.systemValuePreviewText('DATE', o, when);
const JUL = J('*JUL', '/'), YMD = J('*YMD', '/');
check('rule Y, 6 digits: farthest left zero suppressed', pv({ editCode: 'Y' }, dt(2003, 1, 5)) === ' 1/05/03');
check('rule Y, 8 digits: farthest left zero suppressed', pv({ editCode: 'Y', dateParameters: '*YY' }, dt(2003, 1, 5)) === ' 1/05/2003');
check('rule Y, 5 digits (Julian): farthest left zero suppressed', pv({ editCode: 'Y', jobDate: JUL }, dt(2003, 1, 5)) === ' 3/005');
check('rule Y, 7 digits (Julian *YY): nothing to suppress when the first digit is not zero', pv({ editCode: 'Y', dateParameters: '*YY', jobDate: JUL }, dt(2003, 1, 5)) === '2003/005');
check('rule W, 5 digits: farthest left zero suppressed', pv({ editCode: 'W', jobDate: JUL }, dt(2003, 1, 5)) === ' 3/005');
check('rule W, 6 digits: up to three left zeros suppressed, stopping at the first non-zero', pv({ editCode: 'W', jobDate: YMD }, dt(2003, 1, 5)) === ' 301/05');
check('rule W, 8 digits: pattern nnnn/nn/nn', pv({ editCode: 'W', dateParameters: '*YY', jobDate: YMD }, dt(2003, 1, 5)) === '2003/01/05');
check('every length the rules give a pattern for has one: Y 3-8, W 5-8', [3, 4, 5, 6, 7, 8].every((n) => KeywordSpec.dateEditCodePattern('Y', n)) && [5, 6, 7, 8].every((n) => KeywordSpec.dateEditCodePattern('W', n)) && !KeywordSpec.dateEditCodePattern('W', 4));

// 4. engine
const field = { nameType: 'CONSTANT', constantValue: null, length: 0, decimalPositions: 0, dataType: '', usage: 'O', keywords: [{ name: 'DATE', parameters: '' }, { name: 'EDTCDE', parameters: 'Y' }] };
function reset() { DspfEngine.setJobDateFormat(null); DspfEngine.setDateSeparatorSetting(null); }
reset();
check('engine: nothing set resolves to the default slash', JSON.stringify(DspfEngine.resolveDateSeparator()) === '{"separator":"/","source":"default"}');
check('engine: setDateSeparatorSetting stores the normalised value', DspfEngine.setDateSeparatorSetting('blank') === ' ' && DspfEngine.getDateSeparatorSetting() === ' ');
check('engine: a bad setting clears it', DspfEngine.setDateSeparatorSetting('zz') === null && DspfEngine.getDateSeparatorSetting() === null);
DspfEngine.setDateSeparatorSetting('-');
check('engine: the setting is used offline', DspfEngine.resolveDateSeparator().source === 'setting' && DspfEngine.resolveDateSeparator().separator === '-');
DspfEngine.setJobDateFormat(J('*MDY', '.'));
check('engine: the job overrides the setting', DspfEngine.resolveDateSeparator().source === 'job' && DspfEngine.resolveDateSeparator().separator === '.');
DspfEngine.setJobDateFormat(null);
check('engine: clearing the job returns to the setting', DspfEngine.resolveDateSeparator().source === 'setting');
const len = DspfEngine.displayLength(field, {}, {});
check('engine: displayLength of DATE EDTCDE(Y) is 8 whatever the source', len === 8);
DspfEngine.setJobDateFormat(J('*MDY', ','));
check('engine: displayLength unchanged with a job', DspfEngine.displayLength(field, {}, {}) === 8);
reset();

// 5. panel note
function panel(code, kind) {
  const kws = code === null ? [] : [{ name: kind || 'EDTCDE', parameters: code }];
  return Helpers.validityAndEditHtml(kws, 'f', { includeValidity: false }, new Set(), {});
}
reset();
check('panel: EDTCDE(Y) shows the default source', /date-sep-note/.test(panel('Y')) && /default/.test(panel('Y')) && /(?:'|&#39;|&#x27;)\/(?:'|&#39;|&#x27;)/.test(panel('Y')));
DspfEngine.setDateSeparatorSetting('-');
check('panel: setting source names isda.previewDateSeparator', /isda\.previewDateSeparator/.test(panel('W')) && /(?:'|&#39;|&#x27;)-(?:'|&#39;|&#x27;)/.test(panel('W')));
DspfEngine.setJobDateFormat(J('*DMY', '.'));
check('panel: job source names the job DATSEP', /connected job&#39;s DATSEP|connected job's DATSEP/.test(panel('Y')) && /'\.'|&#39;\.&#39;/.test(panel('Y')));
DspfEngine.setDateSeparatorSetting('blank');
DspfEngine.setJobDateFormat(null);
check('panel: blank is spelled out', /blank from the isda\.previewDateSeparator/.test(panel('y')));
check('panel: no note for other codes, EDTWRD, or no edit keyword', !/date-sep-note/.test(panel('J')) && !/date-sep-note/.test(panel("'0  /  '", 'EDTWRD')) && !/date-sep-note/.test(panel(null)));
reset();

// 6. wiring
const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '../../package.json'), 'utf8'));
const set = pkg.contributes.configuration.properties['isda.previewDateSeparator'];
check('package.json declares isda.previewDateSeparator, default not set', !!set && set.default === '' && set.enum.join('|') === '|/|-|.|,|blank');
const ext = fs.readFileSync(path.join(__dirname, '../extension.ts'), 'utf8');
check('extension.ts sends the setting on ready and on change, and disposes the listener', /type: 'previewDateSeparator'/.test(ext) && /affectsConfiguration\('isda\.previewDateSeparator'\)/.test(ext) && /previewDateSeparatorSub\.dispose\(\)/.test(ext) && /sendPreviewDateSeparator\(\);\n\s*\}\n\s*\}\);/.test(ext));
const tmpl = fs.readFileSync(path.join(__dirname, '../buildWebviewTemplate.js'), 'utf8');
check('webview handles the previewDateSeparator message', /msg\.type === 'previewDateSeparator'/.test(tmpl) && /DspfEngine\.setDateSeparatorSetting\(msg\.value\)/.test(tmpl));

if (failureCount() === 0) console.log('ALL CHECKS PASSED');
process.exit(failureCount() === 0 ? 0 : 1);
