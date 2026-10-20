/**
 * menuCompileSteps.js - E2f: the menu compile (CRTMNU) as a list of steps, with a report per step.
 *
 * Compiling an SDA-style menu is not one command: the display file (`CRTDSPF`), the message file (`CRTMSGF`), one message
 * description per option (`ADDMSGD`, `CHGMSGD` when the ID is already there) and the menu object (`CRTMNU`). Before E2f the
 * extension ran them in a row and, on the first failure, showed that step's raw text in a toast. This module keeps what each
 * step did, so the failure can say WHICH step failed, with its messages (E2b `parseCommandText`), and which steps did not run.
 *
 * No `vscode` import: it runs in Node and in the tests, with any object that has `runCommand({ command, environment })`.
 *
 *   var steps = MenuCompileSteps.planSteps({ library, objectName, srcFile, memberName, commands });
 *   var report = await MenuCompileSteps.runSteps(connection, steps, { onStep: function (s, i, n) { ... } });
 *   if (!report.ok) {
 *     MenuCompileSteps.failureText(report);                  // toast: "CRTMSGF failed (CPF5815: ...)"
 *     MenuCompileSteps.formatReport(report);                 // Output channel: one block per step, then the phases
 *     MenuCompileSteps.toDiagnostics(report, { ... });       // Problems panel: file-level, source = the step's command
 *   }
 *
 * Rules.
 *   - Steps run in order and stop at the first failure; the steps after it are `skipped` (never run), not failed.
 *   - `CRTMSGF` on a message file that already exists is not a failure (status `exists`).
 *   - `ADDMSGD` that fails is retried as `CHGMSGD` (the ID is probably there from an earlier compile): the first attempt is
 *     `recovered` when the retry works, and both are reported when it does not.
 *   - The display file step's messages are line-level and come from the compile listing (E2d); this module only reports that
 *     step as the one that failed. Every other step has command text only, so its messages are file-level.
 *   - Never rejects: a command that throws is a failed step with the error as its text.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./compileMessages.js'), require('./compileDiagnostics.js'));
  } else {
    root.MenuCompileSteps = factory(root.CompileMessages, root.CompileDiagnostics);
  }
})(typeof self !== 'undefined' ? self : this, function (CompileMessages, CompileDiagnostics) {
  'use strict';

  /** The phases in the order a compile runs them. `ADDMSGD` covers its `CHGMSGD` retries. */
  var PHASES = ['CRTDSPF', 'CRTMSGF', 'ADDMSGD', 'CRTMNU'];

  /** The diagnostic sources a menu compile can publish under (the DSPF step uses `CRTDSPF`, E2d). */
  var DIAGNOSTIC_SOURCES = ['CRTMSGF', 'ADDMSGD', 'CRTMNU'];

  var EXISTS_RE = /CPF2112|already exist/i;

  function quote(text) { return String(text).replace(/'/g, "''"); }

  /**
   * planSteps({ library, objectName, srcFile, memberName, commands }) -> [{ phase, verb, label, command, fallback? }]
   * `commands` is `[{ optionNumber, numberValue, command }]` (what MnuCmdEngine.parseMnuCmd gives). The commands are the
   * same ones the extension built before E2f, character for character.
   */
  function planSteps(opts) {
    opts = opts || {};
    var lib = opts.library;
    var obj = opts.objectName;
    var steps = [];
    steps.push({
      phase: 'CRTDSPF', verb: 'CRTDSPF', label: 'CRTDSPF',
      command: 'CRTDSPF FILE(' + lib + '/' + obj + ') SRCFILE(' + lib + '/' + opts.srcFile + ') SRCMBR(' + opts.memberName + ') REPLACE(*YES)'
    });
    steps.push({ phase: 'CRTMSGF', verb: 'CRTMSGF', label: 'CRTMSGF', command: 'CRTMSGF MSGF(' + lib + '/' + obj + ')', tolerateExists: true });
    (opts.commands || []).forEach(function (opt) {
      var msgId = 'USR' + opt.optionNumber; // USRnnnn - the format TYPE(*DSPF) menus expect
      var tail = 'MSGID(' + msgId + ') MSGF(' + lib + '/' + obj + ') MSG(\'' + quote(opt.command) + '\') SEV(00)';
      steps.push({
        phase: 'ADDMSGD', verb: 'ADDMSGD', label: 'ADDMSGD for option ' + opt.numberValue, command: 'ADDMSGD ' + tail,
        fallback: { phase: 'ADDMSGD', verb: 'CHGMSGD', label: 'CHGMSGD for option ' + opt.numberValue, command: 'CHGMSGD ' + tail }
      });
    });
    steps.push({
      phase: 'CRTMNU', verb: 'CRTMNU', label: 'CRTMNU',
      command: 'CRTMNU MENU(' + lib + '/' + obj + ') TYPE(*DSPF) DSPF(' + lib + '/' + obj + ') MSGF(' + lib + '/' + obj + ') REPLACE(*YES)'
    });
    return steps;
  }

  function messagesOf(text) {
    try {
      return (CompileMessages.parseCommandText(String(text || '')).messages || []).filter(function (m) { return !m.noise; });
    } catch (e) {
      return [];
    }
  }

  /** Runs one command. Never rejects. -> { ok, code, text } */
  async function runOne(connection, command) {
    try {
      var result = await connection.runCommand({ command: command, environment: 'ile' });
      var code = result && typeof result.code === 'number' ? result.code : null;
      var text = result ? String(result.stderr || result.stdout || '') : '';
      if (code !== null && code !== 0) return { ok: false, code: code, text: text || 'unknown error' };
      return { ok: true, code: code, text: text };
    } catch (err) {
      return { ok: false, code: null, text: String(err && err.message ? err.message : err) };
    }
  }

  function record(step, status, r) {
    return {
      phase: step.phase, verb: step.verb, label: step.label, command: step.command, status: status,
      code: r ? r.code : null, text: r ? r.text : '', messages: r && status !== 'ok' && status !== 'skipped' ? messagesOf(r.text) : []
    };
  }

  /**
   * runSteps(connection, steps, hooks) -> Promise<{ ok, steps, failed, phases }>
   *   steps   one result per command that ran, plus one `skipped` entry per planned step after a failure:
   *           { phase, verb, label, command, status: 'ok' | 'exists' | 'recovered' | 'failed' | 'skipped', code, text, messages }
   *   failed  the step that stopped the compile (for a failed ADDMSGD whose CHGMSGD also failed: the CHGMSGD one, with
   *           `alsoTried` = the ADDMSGD result), or null
   *   phases  summary(report) (see below)
   * hooks.onStep(step, index, total) is called before each planned step (progress text); an exception in it is ignored.
   */
  async function runSteps(connection, steps, hooks) {
    hooks = hooks || {};
    var results = [];
    var failed = null;
    var planned = Array.isArray(steps) ? steps : [];
    for (var i = 0; i < planned.length; i++) {
      var step = planned[i];
      if (failed) { results.push(record(step, 'skipped', null)); continue; }
      try { if (typeof hooks.onStep === 'function') hooks.onStep(step, i, planned.length); } catch (e) { /* progress only */ }
      var r = await runOne(connection, step.command);
      if (r.ok) { results.push(record(step, 'ok', r)); continue; }
      if (step.tolerateExists && EXISTS_RE.test(r.text)) { results.push(record(step, 'exists', r)); continue; }
      if (step.fallback) {
        var retry = await runOne(connection, step.fallback.command);
        if (retry.ok) {
          results.push(record(step, 'recovered', r));
          results.push(record(step.fallback, 'ok', retry));
          continue;
        }
        var firstTry = record(step, 'failed', r);
        results.push(firstTry);
        var second = record(step.fallback, 'failed', retry);
        second.alsoTried = firstTry;
        results.push(second);
        failed = second;
        continue;
      }
      var bad = record(step, 'failed', r);
      results.push(bad);
      failed = bad;
    }
    var report = { ok: !failed, steps: results, failed: failed, phases: [] };
    report.phases = summary(report);
    return report;
  }

  /**
   * summary(report) -> [{ phase, status, total, ok, failed, skipped }] in PHASES order, one per phase of the plan.
   * status: 'ok' (all ran), 'failed' (the stopping step is in it), 'skipped' (never reached).
   * A phase with no planned step (a menu with no options has no ADDMSGD) is left out.
   */
  function summary(report) {
    var out = [];
    PHASES.forEach(function (phase) {
      var inPhase = (report.steps || []).filter(function (s) { return s.phase === phase; });
      if (!inPhase.length) return;
      var n = { ok: 0, failed: 0, skipped: 0 };
      inPhase.forEach(function (s) {
        if (s.status === 'failed') n.failed++;
        else if (s.status === 'skipped') n.skipped++;
        else n.ok++;
      });
      out.push({ phase: phase, status: n.failed ? 'failed' : n.skipped && !n.ok ? 'skipped' : 'ok', total: inPhase.length, ok: n.ok, failed: n.failed, skipped: n.skipped });
    });
    return out;
  }

  function idList(messages) {
    var ids = [];
    (messages || []).forEach(function (m) { if (m.msgId && ids.indexOf(m.msgId) < 0) ids.push(m.msgId); });
    return ids;
  }

  /**
   * failureText(report) -> the text of the toast for a failed menu compile. Names the step first, then its text as IBM i gave it
   * (the message text is never reworded), then which steps did not run. '' when the compile worked.
   */
  function failureText(report) {
    if (!report || report.ok || !report.failed) return '';
    var f = report.failed;
    var ids = idList(f.messages);
    var head = f.label + ' failed' + (ids.length ? ' (' + ids.join(', ') + ')' : '') + ':\n' + (f.text || 'unknown error');
    if (f.alsoTried) head += '\n\nAlso tried ' + f.verb + ' after ' + f.alsoTried.verb + ' failed:\n' + f.alsoTried.text;
    var skipped = (report.steps || []).filter(function (s) { return s.status === 'skipped'; });
    if (skipped.length) {
      var phases = [];
      skipped.forEach(function (s) { if (phases.indexOf(s.phase) < 0) phases.push(s.phase); });
      head += '\n\nNot run: ' + phases.join(', ') + '.';
    }
    return head;
  }

  /** The plain message of one step, in the form the extension always showed: `<label> failed:\n<text>`. */
  function stepMessage(step) {
    return step.label + ' failed:\n' + (step.text || 'unknown error');
  }

  var MARK = { ok: 'ok', exists: 'ok (already there)', recovered: 'failed, then replaced instead', failed: 'FAILED', skipped: 'not run' };

  /**
   * formatReport(report, options) -> text for the Output channel: the phases at the top, then one block per step that ran
   * (steps that were skipped are counted per phase, not listed one by one: a 30 option menu would otherwise print 30 lines).
   */
  function formatReport(report, options) {
    options = options || {};
    var lines = [];
    if (options.title) lines.push(options.title);
    lines.push(report && report.ok ? 'Menu compile: every step worked.' : 'Menu compile: stopped at ' + (report && report.failed ? report.failed.label : 'an unknown step') + '.');
    (report && report.phases ? report.phases : []).forEach(function (p) {
      var counts = p.total > 1 ? ' (' + (p.total - p.skipped) + ' of ' + p.total + ' ran' + (p.skipped ? ', ' + p.skipped + ' not run' : '') + ')' : '';
      lines.push('  ' + p.phase + ': ' + (p.status === 'ok' ? 'ok' : p.status === 'failed' ? 'FAILED' : 'not run') + counts);
    });
    (report && report.steps ? report.steps : []).forEach(function (s) {
      if (s.status === 'skipped') return;
      lines.push('');
      lines.push('--- ' + s.label + ': ' + MARK[s.status] + (s.code != null ? ' (return code ' + s.code + ')' : '') + ' ---');
      lines.push(s.command);
      if (s.text && s.status !== 'ok') lines.push(s.text);
      if (s.status === 'failed' || s.status === 'recovered') {
        var ids = idList(s.messages);
        if (ids.length) lines.push('Messages: ' + ids.join(', '));
      }
    });
    return lines.join('\n');
  }

  /**
   * toDiagnostics(report, options) -> { source, diagnostics } | null for the Problems panel, from the step that failed.
   * `source` is the step's command (CRTMSGF, ADDMSGD or CRTMNU: both ADDMSGD and its CHGMSGD retry are `ADDMSGD`);
   * every diagnostic is file-level (line 1, `fileLevel: true`), because these steps work on objects, not source lines.
   * The text names the step (and the option for a message description). null when the compile worked or the display file
   * step failed (that one is line-level, from the listing: E2d).
   * options: { firstLineLength } for the width of the squiggle, like E2d.
   */
  function toDiagnostics(report, options) {
    options = options || {};
    if (!report || report.ok || !report.failed || report.failed.phase === 'CRTDSPF') return null;
    var f = report.failed;
    var width = Math.max(2, (options.firstLineLength || 0) + 1);
    var list = f.messages.length ? f.messages : [{ msgId: '', text: f.text || 'unknown error' }];
    var diagnostics = list.map(function (m) {
      var text = String(m.text || '').trim() || (m.msgId ? String(m.msgId) : f.text || 'Compile message');
      return {
        line: 1, column: 1, endColumn: width,
        severity: m.msgId ? CompileDiagnostics.severityName(m, 'command') : 'error',
        message: f.label + ': ' + text,
        code: m.msgId || undefined,
        source: f.phase,
        fileLevel: true
      };
    });
    return { source: f.phase, diagnostics: diagnostics };
  }

  return {
    PHASES: PHASES,
    DIAGNOSTIC_SOURCES: DIAGNOSTIC_SOURCES,
    planSteps: planSteps,
    runSteps: runSteps,
    summary: summary,
    failureText: failureText,
    stepMessage: stepMessage,
    formatReport: formatReport,
    toDiagnostics: toDiagnostics
  };
});
