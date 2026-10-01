/**
 * i121RepeatableGroupsKeywordSpec.test.js
 *
 * Task I-121 - "One declarative rule spec per keyword", repeatable-instance
 * keyword groups slice. VALIDITY_CHECK_KEYWORDS (RANGE / COMP / VALUES) and
 * CMP's legacy spelling, ERROR_MESSAGE_NAMES (ERRMSG / ERRMSGID) and
 * MESSAGE_ID_NAMES (MSGID) were hand-kept constants in dspfWriter.js, and the
 * validity-check kinds were also a literal twice in webviewClientHelpers.js.
 * They are now keywordSpec.js's REPEATABLE_INSTANCE_GROUPS, one fact per
 * keyword. Pure refactor: every derived value must equal the old literal.
 *
 * Run with: node src/test/i121RepeatableGroupsKeywordSpec.test.js
 */
const path = require('path');
const { JSDOM } = require('jsdom');
const DspfWriter = require(path.join(__dirname, '../dspfWriter.js'));
const KeywordSpec = require(path.join(__dirname, '../keywordSpec.js'));
const { check, failureCount } = require('./helpers/harness');

const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>');
global.document = dom.window.document;
global.Node = dom.window.Node;
global.DspfWriter = DspfWriter;
const Helpers = require(path.join(__dirname, '../webviewClientHelpers.js'));

const kw = (name, parameters) => [{ name, parameters, conditions: [], raw: '', sourceLines: [] }];
const names = (list) => list.map((k) => k.name + '(' + k.parameters + ')').join(' ');

console.log('\nspec table');
{
  const G = KeywordSpec.REPEATABLE_INSTANCE_GROUPS;
  check('three groups', Object.keys(G).join() === 'validityCheck,errorMessages,messageId');
  check('validity-check kinds equal the old list, same order', KeywordSpec.repeatableGroupKinds('validityCheck').join() === 'RANGE,COMP,VALUES');
  check('error-message kinds equal the old list', KeywordSpec.repeatableGroupKinds('errorMessages').join() === 'ERRMSG,ERRMSGID');
  check('message-id kinds equal the old list', KeywordSpec.repeatableGroupKinds('messageId').join() === 'MSGID');
  check('CMP is COMP\'s only alternate spelling in the validity group', JSON.stringify(KeywordSpec.repeatableGroupAlternateKinds('validityCheck')) === '{"CMP":"COMP"}');
  check('the other groups have no alternate spellings', Object.keys(KeywordSpec.repeatableGroupAlternateKinds('errorMessages')).length === 0 && Object.keys(KeywordSpec.repeatableGroupAlternateKinds('messageId')).length === 0);
  check('every keyword has a non-empty DDS Reference citation', Object.keys(G).every((g) => Object.keys(G[g]).every((k) => typeof G[g][k].ddsReference === 'string' && G[g][k].ddsReference.length > 5)));
  check('unknown / blank / null / prototype group names -> [] and {}', ['nope', '', null, undefined, 'constructor', 'toString'].every((g) => KeywordSpec.repeatableGroupKinds(g).length === 0 && Object.keys(KeywordSpec.repeatableGroupAlternateKinds(g)).length === 0));
  const kinds = KeywordSpec.repeatableGroupKinds('validityCheck'); kinds.push('X');
  const alt = KeywordSpec.repeatableGroupAlternateKinds('validityCheck'); alt.CMP = 'X';
  check('accessors return fresh copies', KeywordSpec.repeatableGroupKinds('validityCheck').length === 3 && KeywordSpec.repeatableGroupAlternateKinds('validityCheck').CMP === 'COMP');
  // CHKMSGID's own `qualifyingNames` lists the same four spellings; pin it here so the two cannot drift.
  const readNames = KeywordSpec.repeatableGroupKinds('validityCheck').concat(Object.keys(KeywordSpec.repeatableGroupAlternateKinds('validityCheck'))).sort();
  check('CHKMSGID\'s qualifyingNames are exactly the validity-check kinds plus CMP', KeywordSpec.RECORD_TYPES.CHKMSGID.qualifyingNames.slice().sort().join() === readNames.join());
}

console.log('\nvalidity check - writer behaviour unchanged');
{
  ['RANGE', 'COMP', 'VALUES'].forEach((k) => {
    const inst = DspfWriter.getValidityCheckInstances(kw(k, '1 9'));
    check(k + ': read as an instance', inst.length === 1 && inst[0].kind === k && inst[0].parameters === '1 9');
  });
  check('legacy CMP is read as COMP', DspfWriter.getValidityCheckInstances(kw('CMP', 'GT 0'))[0].kind === 'COMP');
  check('re-writing a CMP-sourced field normalizes it to COMP', names(DspfWriter.setValidityCheckInstances(kw('CMP', 'GT 0'), [{ kind: 'COMP', conditions: [], parameters: 'GT 1' }])) === 'COMP(GT 1)');
  check('clearing removes a legacy CMP too', DspfWriter.setValidityCheckInstances(kw('CMP', 'GT 0'), []).length === 0);
  check('an unrelated keyword is neither read nor removed', DspfWriter.getValidityCheckInstances(kw('DSPATR', 'RI')).length === 0 && names(DspfWriter.setValidityCheckInstances(kw('DSPATR', 'RI'), [])) === 'DSPATR(RI)');
  check('a state with no kind writes nothing', DspfWriter.setValidityCheckInstances([], [{ kind: '', conditions: [], parameters: 'x' }]).length === 0);
  check('DspfWriter.validityCheckKinds returns a fresh copy of the kinds', DspfWriter.validityCheckKinds().join() === 'RANGE,COMP,VALUES' && (DspfWriter.validityCheckKinds().push('X'), DspfWriter.validityCheckKinds().length === 3));
}

console.log('\nerror messages and message id - writer behaviour unchanged');
{
  check('ERRMSG is read as an error-message instance', DspfWriter.getErrorMessageInstances(kw('ERRMSG', "'Bad' 25")).length === 1);
  check('ERRMSGID is read as an error-message instance', DspfWriter.getErrorMessageInstances(kw('ERRMSGID', 'MSG0001 MSGF 25')).length === 1);
  check('an unrelated keyword is not read as an error message', DspfWriter.getErrorMessageInstances(kw('MSGID', 'A B C')).length === 0);
  check('MSGID is read as a message-id instance', DspfWriter.getMessageIdInstances(kw('MSGID', 'A B C')).length === 1);
  check('ERRMSG is not a message-id instance', DspfWriter.getMessageIdInstances(kw('ERRMSG', "'x'")).length === 0);
  check('clearing error messages removes both spellings', DspfWriter.setErrorMessageInstances(kw('ERRMSG', "'Bad'").concat(kw('ERRMSGID', 'M F')), []).length === 0);
}

console.log('\nwebview');
{
  const root = document.getElementById('root');
  root.innerHTML = Helpers.validityCheckInstancesHtml(kw('RANGE', '1 99'), 'v', new Set());
  const html = root.innerHTML;
  const opts = Array.from(root.querySelectorAll('select[class$="-kind"] option')).map((o) => o.value);
  check('the panel is wrapped with the three kinds (data-kw)', /data-kw="RANGE COMP VALUES"/.test(html));
  check('the kind dropdown offers exactly RANGE, COMP, VALUES in that order', opts.join() === 'RANGE,COMP,VALUES');
  root.innerHTML = Helpers.validityCheckInstancesHtml(kw('CMP', 'GT 0'), 'v2', new Set());
  const sel = root.querySelector('select[class$="-kind"]');
  check('a legacy CMP shows as a COMP row', !!sel && sel.value === 'COMP');
}

const fails = failureCount();
console.log(fails ? '\n' + fails + ' CHECK(S) FAILED' : '\nAll checks passed');
process.exit(fails ? 1 : 0);
