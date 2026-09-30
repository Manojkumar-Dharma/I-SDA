/**
 * i121MoubtnParameterDomainKeywordSpec.test.js
 *
 * Task I-121 (MOUBTN parameter-domain slice) - MOUBTN's own DDS Reference
 * section gives the EVENT / TRAILING-EVENT domain (18 pointer events), the
 * Command key and EVENT-ID forms, and the *QUEUE / *NOQUEUE flag. They were a
 * hand-kept `MOUBTN_EVENTS` array and three hard-coded <option>s in the
 * webview; the events and queue flags are now read from the spec through
 * DspfWriter.moubtnParameterDomain. The Command key / EVENT-ID box stays a
 * free-text input (no validation was ever applied; adding one would be new
 * behavior). Pure refactor, no behavior change.
 *
 *  1. the facts: 18 events in IBM's order, key names / ranges, EVENT-ID range,
 *     queue values and default, citation, MOUBTN is the only carrier.
 *  2. structure: events are the 2 x 3 x 3 product, keys don't collide with
 *     EVENT-IDs, every key name is a keyword the spec knows.
 *  3. accessors: copy semantics.
 *  4. the webview's rendered row offers exactly the spec's events (twice: the
 *     EVENT and the '(single event)' + TRAILING-EVENT selects) and queue
 *     flags, in order, and the old hand-kept array is gone.
 *  5. parse / compose round-trips every spec event.
 *
 * Run with: node src/test/i121MoubtnParameterDomainKeywordSpec.test.js
 */
const fs = require('fs');
const path = require('path');
const KeywordSpec = require(path.join(__dirname, '../keywordSpec.js'));
const DspfWriter = require(path.join(__dirname, '../dspfWriter.js'));
const { check, failureCount } = require('./helpers/harness');

const j = (a) => JSON.stringify(a);
const web = fs.readFileSync(path.join(__dirname, '../webviewClientHelpers.js'), 'utf8');
const spec = KeywordSpec.RECORD_TYPES.MOUBTN;

console.log('=== 1. the facts ===');
const expected = ['*ULP', '*ULR', '*ULD', '*UMP', '*UMR', '*UMD', '*URP', '*URR', '*URD',
  '*SLP', '*SLR', '*SLD', '*SMP', '*SMR', '*SMD', '*SRP', '*SRR', '*SRD'];
check('18 events in IBM order', j(spec.validValues) === j(expected));
check('key names', j(spec.commandKeyNames) === j(['ENTER', 'ROLLUP', 'ROLLDOWN', 'HELP', 'HOME', 'PRINT', 'CLEAR']));
check('key ranges CA01-24 / CF01-24', j(spec.commandKeyRanges) === j([{ prefix: 'CA', min: 1, max: 24 }, { prefix: 'CF', min: 1, max: 24 }]));
check('EVENT-ID range E00-E15', j(spec.eventIdRange) === j({ prefix: 'E', min: 0, max: 15 }));
check('queue values and default', j(spec.queueValues) === j(['*QUEUE', '*NOQUEUE']) && spec.queueDefault === '*NOQUEUE');
check('citation names events, keys, EVENT-IDs and the default', /\*ULP.*\*SRD/.test(spec.ddsReference) && /CA01-CA24/.test(spec.ddsReference) && /E00-E15/.test(spec.ddsReference) && /\*NOQUEUE/.test(spec.ddsReference));
check('MOUBTN is the only carrier of commandKeyNames', Object.keys(KeywordSpec.RECORD_TYPES).filter((n) => KeywordSpec.RECORD_TYPES[n].commandKeyNames).join() === 'MOUBTN');

console.log('\n=== 2. structure ===');
const product = [];
['U', 'S'].forEach((s) => ['L', 'M', 'R'].forEach((b) => ['P', 'R', 'D'].forEach((e) => product.push('*' + s + b + e))));
check('events are shifted-state x button x action, in that nesting', j(spec.validValues) === j(product));
check('18 distinct events', new Set(spec.validValues).size === 18);
check('no event equals a key name or queue flag', spec.validValues.every((e) => spec.commandKeyNames.indexOf(e.slice(1)) < 0 && spec.queueValues.indexOf(e) < 0));
check('EVENT-ID prefix is not a command-key prefix', spec.commandKeyRanges.every((r) => r.prefix !== spec.eventIdRange.prefix));
check('names ROLLUP / ROLLDOWN / HELP / CLEAR agree with the record-indicator spec', ['ROLLUP', 'ROLLDOWN', 'HELP', 'CLEAR'].every((n) => spec.commandKeyNames.indexOf(n) >= 0));

console.log('\n=== 3. accessors ===');
const d = DspfWriter.moubtnParameterDomain();
d.events.push('*ZZZ'); d.queueValues.push('*ZZZ');
const d2 = DspfWriter.moubtnParameterDomain();
check('moubtnParameterDomain returns copies', d2.events.length === 18 && d2.queueValues.length === 2);
check('domain equals the spec', j(d2.events) === j(spec.validValues) && j(d2.queueValues) === j(spec.queueValues));
check('validValues / isValidValue work for MOUBTN', KeywordSpec.validValues('MOUBTN').length === 18 && KeywordSpec.isValidValue('MOUBTN', '*urp') && !KeywordSpec.isValidValue('MOUBTN', 'CF03'));

console.log('\n=== 4. rendered row ===');
global.DspfWriter = DspfWriter;
let helpers = null;
try { helpers = require(path.join(__dirname, '../webviewClientHelpers.js')); } catch (e) { /* reported below */ }
check('webviewClientHelpers loads in node', !!helpers);
check('old MOUBTN_EVENTS array is gone', !/var MOUBTN_EVENTS\b/.test(web));
check('old hard-coded queue options are gone', !/value="\*QUEUE"' \+ \(f\.queue/.test(web));
if (helpers && typeof helpers.moubtnInstanceRowHtml === 'function') {
  const html = helpers.moubtnInstanceRowHtml({ parameters: '*URP *ULP CF03 *QUEUE' }, 'p');
  const sel = (cls) => (html.match(new RegExp('<select class="p-' + cls + '">([\\s\\S]*?)</select>')) || [, ''])[1].match(/value="([^"]*)"/g).map((s) => s.slice(7, -1));
  check('EVENT select = spec events', j(sel('event')) === j(expected));
  check('TRAILING-EVENT select = "" + spec events', j(sel('trailing')) === j([''].concat(expected)));
  check('QUEUE select = "" + spec flags', j(sel('queue')) === j([''].concat(spec.queueValues)));
  check('selected state is unchanged', /value="\*URP" selected/.test(html) && /value="\*ULP" selected/.test(html) && /value="\*QUEUE" selected/.test(html));
} else {
  check('webviewClientHelpers exposes moubtnInstanceRowHtml', false);
}

console.log('\n=== 5. parse / compose round-trip ===');
if (helpers && helpers.parseMoubtnParams && helpers.composeMoubtnParams) {
  check('every spec event round-trips as a single event', spec.validValues.every((e) => helpers.composeMoubtnParams(helpers.parseMoubtnParams(e + ' CF03')) === e + ' CF03'));
  check('every spec event round-trips as a trailing event', spec.validValues.every((e) => helpers.composeMoubtnParams(helpers.parseMoubtnParams('*ULP ' + e + ' E15 *NOQUEUE')) === '*ULP ' + e + ' E15 *NOQUEUE'));
  check('every queue flag round-trips', spec.queueValues.every((q) => helpers.parseMoubtnParams('*ULP CF01 ' + q).queue === q));
} else {
  check('helpers expose parse / compose', false);
}

console.log('\n' + (failureCount() === 0 ? 'ALL CHECKS PASSED' : 'FAIL - ' + failureCount() + ' check(s) failed'));
process.exit(failureCount() === 0 ? 0 : 1);
