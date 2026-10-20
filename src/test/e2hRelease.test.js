/**
 * e2hRelease.test.js
 *
 * E2h - the E2 release: evidence for the acceptance paragraph that no single sub-task test holds. The E2 tests each
 * hold one piece (parser E2b, line map E2c, editor diagnostics E2d, designer helpers E2e, menu steps E2f, compile
 * commands E2g, listing fetch E2i). What none of them does is follow ONE failed compile all the way to the designer:
 * the registered compile command, the Problems panel and the real designer provider's message to its panel, then
 * the designer's own mapping of each message to a record or field, then an edit and a good recompile.
 *
 * Recorded: the E2a samples (a real failing CRTDSPF on IBM i V7R3M0). Pure Node with the vscode mock.
 * Run with: node src/test/e2hRelease.test.js   (needs `npm run compile`)
 */
'use strict';
const path = require('path');
const Module = require('module');

const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === 'vscode') return require('./vscode-mock.js');
  return originalLoad.apply(this, arguments);
};

const vscodeMock = require('./vscode-mock.js');
const ext = require(path.join(__dirname, '../../dist/extension.js'));
const DspfParser = require(path.join(__dirname, '../../dist/dspfParser.js'));
const H = require(path.join(__dirname, '../webviewClientHelpers.js'));
const { check, failureCount } = require('./helpers/harness');
const { createFakeCodeForI, recordedCrtdspfFailure, fixture } = require('./helpers/fakeCodeForI');

const DDS = fixture('testdsp.dds');
const DDS_LINES = DDS.split('\n');

(async () => {
  try {
    const uri = new vscodeMock.Uri('member', '/MANOJKUMAR/QDDSSRC/TESTDSP.DSPF');
    const doc = vscodeMock.__mockDocument(DDS, uri);
    const fake = createFakeCodeForI({ libraryExists: false, compiles: { CRTDSPF: recordedCrtdspfFailure() } });
    vscodeMock.__setMockExtension('halcyontechltd.code-for-ibmi', fake.asExtension());
    vscodeMock.__setOpenTextDocuments([doc]);
    const context = vscodeMock.__mockExtensionContext();
    ext.activate(context);
    const commands = vscodeMock.__registeredCommands;

    // The real designer provider, with a panel that records what the host posts to it.
    const posted = [];
    const panel = {
      webview: {
        cspSource: 'vscode-webview://fake', options: null,
        set html(v) { this._html = v; }, get html() { return this._html; },
        onDidReceiveMessage: () => ({ dispose: () => {} }),
        postMessage: (m) => posted.push(m),
      },
      onDidDispose: () => {},
    };
    vscodeMock.__registeredCustomEditorProviders['dspfDesigner.editor'].provider.resolveCustomTextEditor(doc, panel, {});
    const compileMsgs = () => posted.filter((m) => m.type === 'compileMessages');

    // ---- 1. a failed compile: the Problems panel and the designer get the same messages --------------------------
    console.log('1: one failed compile reaches the editor and the designer');
    const before = compileMsgs().length;
    await commands['dspfDesigner.compileDspf'](uri);
    const collection = vscodeMock.__diagnosticCollections.filter((c) => c.name === 'iSDA').pop();
    const problems = (collection.get(uri) || []).filter((d) => d.source === 'CRTDSPF');
    const sent = compileMsgs().slice(before);
    const last = sent[sent.length - 1];
    check('1: the Problems panel has the 7 messages of the recorded listing', problems.length === 7);
    check('1: the designer was sent them in one fresh message', !!last && last.fresh === true && last.messages.length === 7);
    const key = (m) => m.code + '@' + (m.fileLevel ? 'file' : m.line);
    const panelKeys = problems.map((d) => d.code + '@' + (d.range.start.line === 0 && /not created/.test(d.message) ? 'file' : d.range.start.line + 1)).sort().join();
    check('1: the designer and the Problems panel hold the same messages, line for line',
      !!last && last.messages.map(key).sort().join() === panelKeys);

    // ---- 2. each message sits on the right record or field of the designer -----------------------------------------
    console.log('\n2: each message lands on the right record or field');
    const model = DspfParser.parseDspf(DDS);
    const idx = H.indexCompileMessages(model, last.messages);
    const entry = (code) => idx.entries.find((e) => e.code === code);
    const textOf = (target) => (target && target.sourceLine ? DDS_LINES[target.sourceLine - 1] : '');
    check('2: CPD5237 (field name twice) is on the field CUSTID of record HDRREC, the second one (line 15)',
      entry('CPD5237').target.kind === 'field' && entry('CPD5237').target.sourceLine === 15 && entry('CPD5237').target.record === 'HDRREC' && /CUSTID/.test(textOf(entry('CPD5237').target)));
    check('2: CPD7830 (start line too large) is on the F3=Exit constant at line 17',
      entry('CPD7830').target.kind === 'field' && entry('CPD7830').target.sourceLine === 17 && /F3=Exit/.test(textOf(entry('CPD7830').target)));
    const dspattr = ['CPD7850', 'CPD7520', 'CPD7494'].map(entry);
    check('2: CPD7850, CPD7520 and CPD7494 are all on one field, the one carrying DSPATR(XX) (line 31)',
      dspattr.every((e) => e.target && e.target.kind === 'field' && e.target.sourceLine === dspattr[0].target.sourceLine) && /CUSTBAL|9Y 2O/.test(textOf(dspattr[0].target)) && /DSPATR\(XX\)/.test(DDS_LINES[30]));
    check('2: CPD5236 (record name twice) is on the record HDRREC, the one at line 36', entry('CPD5236').target.kind === 'record' && entry('CPD5236').target.record === 'HDRREC');
    check('2: the escape message CPF7302 has no target (it belongs to the file)', entry('CPF7302').target === null && entry('CPF7302').fileLevel === true);
    check('2: every message that has a line has a target, so none is lost on the way to a badge',
      idx.entries.filter((e) => !e.fileLevel).every((e) => e.target));
    check('2: the counts add up to the 7 messages, all errors', idx.counts.total === 7 && idx.counts.error === 7);
    check('2: the record badges count the messages of the record and its fields (DTLREC 3, HDRREC 3)',
      idx.byRecord.DTLREC && idx.byRecord.DTLREC.total === 3 && idx.byRecord.HDRREC && idx.byRecord.HDRREC.total === 3);

    // ---- 3. an edit: both surfaces drop the line's messages together -----------------------------------------------
    console.log('\n3: an edit');
    const sentBefore = compileMsgs().length;
    vscodeMock.__changeListener({ document: doc, contentChanges: [{ range: new vscodeMock.Range(14, 3, 14, 4), text: 'x' }] });
    const afterEdit = compileMsgs().slice(sentBefore);
    const editLast = afterEdit[afterEdit.length - 1];
    check('3: the designer is told, not as a fresh compile', !!editLast && editLast.fresh === false);
    check('3: the edited line lost its message (CPD5237) in the designer and in the Problems panel',
      !!editLast && !editLast.messages.some((m) => m.code === 'CPD5237') && editLast.messages.length === 6 &&
      !(collection.get(uri) || []).some((d) => d.code === 'CPD5237'));

    // ---- 4. a good recompile clears both ----------------------------------------------------------------------------
    console.log('\n4: a good recompile');
    fake.setCompile('CRTDSPF', { code: 0 });
    const sentBeforeGood = compileMsgs().length;
    await commands['dspfDesigner.compileDspf'](uri);
    const afterGood = compileMsgs().slice(sentBeforeGood);
    const goodLast = afterGood[afterGood.length - 1];
    check('4: the Problems panel is empty', (collection.get(uri) || []).filter((d) => d.source === 'CRTDSPF').length === 0);
    check('4: the designer is sent an empty list, fresh, so its badges and panel go', !!goodLast && goodLast.fresh === true && goodLast.messages.length === 0);
    check('4: the designer index of an empty list has no counts', H.indexCompileMessages(model, goodLast ? goodLast.messages : null).counts.total === 0);
    check('4: no work file is left in ISDATEMP after both compiles', Object.keys(fake.workFiles).length === 0);

    // ---- 5. a designer opened after the failure is told what is already in the Problems panel ----------------------
    console.log('\n5: a designer opened later');
    fake.setCompile('CRTDSPF', recordedCrtdspfFailure());
    await commands['dspfDesigner.compileDspf'](uri);
    let ready = null;
    const late = [];
    const latePanel = {
      webview: {
        cspSource: 'x', options: null, set html(v) {}, get html() { return ''; },
        onDidReceiveMessage: (h) => { ready = h; return { dispose: () => {} }; },
        postMessage: (m) => late.push(m),
      },
      onDidDispose: () => {},
    };
    vscodeMock.__registeredCustomEditorProviders['dspfDesigner.editor'].provider.resolveCustomTextEditor(doc, latePanel, {});
    if (ready) await ready({ type: 'ready' });
    const lateMsg = late.filter((m) => m.type === 'compileMessages').pop();
    check('5: a designer that opens after a failed compile is sent the 7 messages, not as a fresh compile', !!lateMsg && lateMsg.messages.length === 7 && lateMsg.fresh === false);

    ext.deactivate && ext.deactivate();
    context.subscriptions.forEach((s) => { if (s && typeof s.dispose === 'function') s.dispose(); });
  } catch (e) {
    console.error(e);
    check('the release test ran without throwing: ' + (e && e.message), false);
  }
  console.log('\n' + (failureCount() ? failureCount() + ' CHECK(S) FAILED' : 'All checks passed'));
  process.exit(failureCount() ? 1 : 0);
})();
