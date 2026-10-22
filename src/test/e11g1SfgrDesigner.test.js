/**
 * E11g1 - the designer page on System/36 DSPF36 (SFGR) source: opens, draws, shows a read-only Properties view, hides
 * the DDS-only controls, and never lets a DDS edit touch SFGR text. Runs the page's real script in jsdom (same
 * approach as dspfWebview.test.js) on the real sample (docs/sda-reference/source/stipfm.dspf36).
 */
'use strict';
const path = require('path');
const fs = require('fs');
const { check, failureCount } = require('./helpers/harness');
const { newWebviewDom, webviewHtml } = require('./helpers/common');
const Parser = require('../sfgrParser.js');

const SFGR = fs.readFileSync(path.join(__dirname, '../../docs/sda-reference/source/stipfm.dspf36'), 'utf8');
const P = Parser.parse(SFGR);
const DDS = ['     A                                      DSPSIZ(24 80 *DS3)', '     A          R SCR1', "     A                                  1  2'MAIN SCREEN'", '     A            NAME      10A  B  4  5'].join('\n') + '\n';

function open(source, kind) {
  const posted = [];
  const html = webviewHtml('vscode-webview://fake', 'e11g1', source, kind === 'sfgr' ? 'STIPFM.DSPF36' : 'MYSCR.DSPF', 'modern', 'green', kind);
  const dom = newWebviewDom(html, { beforeParse(window) { window.acquireVsCodeApi = () => ({ getState: () => null, setState: () => {}, postMessage: (m) => posted.push(m) }); } });
  return { dom, posted, html };
}

// ---- the template ----------------------------------------------------------------------------
{
  const { html } = open(SFGR, 'sfgr');
  check('the page embeds the SFGR parser, model and writer', /root\.SfgrParser = factory/.test(html) && /root\.SfgrModel = factory/.test(html) && /root\.SfgrWriter = factory/.test(html));
  check('the body carries the source kind', /<body[^>]*data-source-kind="sfgr"/.test(html));
  check('a DDS page carries "dds" (the default)', /<body[^>]*data-source-kind="dds"/.test(open(DDS, 'dds').html));
  const { getWebviewHtml } = require('../../dist/webviewTemplate.js');
  check('getWebviewHtml with no source kind is a DDS page', /data-source-kind="dds"/.test(getWebviewHtml('c', 'n', DDS, 'a.dspf')));
  check('an unknown source kind is a DDS page', /data-source-kind="dds"/.test(getWebviewHtml('c', 'n', DDS, 'a.dspf', 'modern', 'green', 'nonsense')));
  check('no parse site is left on the DDS parser alone (all go through parseSource)', (html.match(/DspfParser\.parseDspf\(/g) || []).length === 1);
}

setTimeout(() => {
  const { dom, posted } = open(SFGR, 'sfgr');
  const { document: doc, Event, KeyboardEvent, MessageEvent } = dom.window;
  const css = (id, prop) => dom.window.getComputedStyle(doc.getElementById(id))[prop];

  console.log('opens and draws');
  check('the page knows it is SFGR', doc.body.dataset.sourceKind === 'sfgr');
  const options = Array.from(doc.getElementById('recordSelect').options).map((o) => o.value);
  check('one record per format (' + P.formats.length + ')', options.length === P.formats.length && options.join() === P.formats.map((f) => f.name).join());
  check('the first format draws its fields and constants', doc.querySelectorAll('.dspf-field').length > 0);
  check('the screen is drawn', !!doc.querySelector('.dspf-screen'));

  console.log('\nDDS-only controls');
  check('the note says what the source is', css('sfgrNote', 'display') !== 'none' && /DSPF36/.test(doc.getElementById('sfgrNote').textContent));
  check('+ Field, + Constant, + Add record and Add from database are hidden', ['placeFieldBtn', 'placeConstantBtn', 'newRecordToggleBtn', 'addFromDbBtn', 'fabPlaceFieldBtn', 'fabAddRecordBtn'].every((id) => css(id, 'display') === 'none'));
  check('the keyword finder and modification tracking are hidden', ['keywordFinderInput', 'modTrackingToggle'].every((id) => { let e = doc.getElementById(id); while (e && e !== doc.body) { if (dom.window.getComputedStyle(e).display === 'none') return true; e = e.parentElement; } return false; }));
  check('the heading and the compile buttons say DSPF36 / CRTS36DSPF', /DSPF36/.test(doc.getElementById('designerTitle').textContent) && /CRTS36DSPF/.test(doc.getElementById('compileDspfBtn').textContent) && /CRTS36DSPF/.test(doc.getElementById('toolbarCompileBtn').textContent));

  console.log('\nread-only Properties');
  const props = () => doc.getElementById('propsBody').textContent;
  check('nothing selected: the format is described', /Format/.test(props()) && props().indexOf(P.formats[0].name) >= 0 && /Start line \(17 - 18\)/.test(props()) && /Key mask/.test(props()));
  check('the key mask of the first format is decoded', /Command keys/.test(props()));
  const field = doc.querySelector('.dspf-field');
  field.dispatchEvent(new Event('click', { bubbles: true }));
  check('a click selects it and shows the D specification', /Source lines/.test(props()) && /Line \/ column/.test(props()) && /row \d+ on the screen/.test(props()));
  check('the breadcrumb names the field', /Field:/.test(doc.getElementById('propsBreadcrumb').textContent));
  check('the read-only view has no input to type into', doc.getElementById('propsBody').querySelectorAll('input, select, textarea, button').length === 0);

  console.log('\nno DDS edit reaches the SFGR text');
  posted.length = 0;
  const before = doc.querySelectorAll('.dspf-field').length;
  doc.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true, cancelable: true }));
  check('Delete on a selected field posts no edit', posted.filter((m) => m.type === 'applyEdit').length === 0);
  check('and the field is still there', doc.querySelectorAll('.dspf-field').length === before);
  ['ArrowDown', 'ArrowRight'].forEach((key) => doc.body.dispatchEvent(new KeyboardEvent('keydown', { key, altKey: true, bubbles: true, cancelable: true })));
  doc.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'x', ctrlKey: true, bubbles: true, cancelable: true }));
  doc.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'v', ctrlKey: true, bubbles: true, cancelable: true }));
  doc.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'd', ctrlKey: true, bubbles: true, cancelable: true }));
  check('nudge, cut, paste and duplicate post no edit either', posted.filter((m) => m.type === 'applyEdit').length === 0);
  check('the note flashes when an edit is refused', doc.getElementById('sfgrNote').classList.contains('flash'));

  console.log('\nswitching format and external updates');
  const select = doc.getElementById('recordSelect');
  select.value = P.formats[3].name;
  select.dispatchEvent(new Event('change', { bubbles: true }));
  check('another format can be selected and its properties show', /Format/.test(props()) && props().indexOf(P.formats[3].name) >= 0);
  const smaller = ['     SONE', "     D          2 2 2           C                    A", '     STWO'].join('\n') + '\n';
  dom.window.dispatchEvent(new MessageEvent('message', { data: { type: 'externalUpdate', text: smaller } }));
  check('an external update (the text editor changed) re-reads the source as SFGR', Array.from(doc.getElementById('recordSelect').options).map((o) => o.value).join() === 'ONE,TWO');
  check('and still posts nothing', posted.filter((m) => m.type === 'applyEdit').length === 0);

  console.log('\na DDS page is unchanged');
  const dds = open(DDS, 'dds');
  const d = dds.dom.window.document;
  check('the note is hidden and the DDS controls show', dds.dom.window.getComputedStyle(d.getElementById('sfgrNote')).display === 'none' && dds.dom.window.getComputedStyle(d.getElementById('placeFieldBtn')).display !== 'none');
  const el = Array.from(d.querySelectorAll('.dspf-field')).find((e) => /MAIN SCREEN/.test(e.textContent));
  el.dispatchEvent(new dds.dom.window.Event('click', { bubbles: true }));
  dds.dom.window.document.body.dispatchEvent(new dds.dom.window.KeyboardEvent('keydown', { key: 'Delete', bubbles: true, cancelable: true }));
  const edit = dds.posted.filter((m) => m.type === 'applyEdit').pop();
  check('Delete still edits DDS', !!edit && !/MAIN SCREEN/.test(edit.text));
  check('the DDS heading is unchanged', /IBM i . DDS/.test(d.getElementById('designerTitle').textContent));

  console.log('\n' + (failureCount() === 0 ? 'ALL CHECKS PASSED' : failureCount() + ' CHECK(S) FAILED'));
  process.exit(failureCount() === 0 ? 0 : 1);
}, 50);
