/**
 * keywordSpec.js
 *
 * "One declarative rule spec per keyword". Rules for a given keyword or
 * record type currently live scattered across `*ConflictReason` functions
 * (dspfWriter.js), rule tables, and UI row/guard wiring
 * (webviewClientHelpers.js), each hand-synced against the DDS Reference
 * separately. This module is the first slice of a single declarative
 * source of truth those places can read from instead - started with the
 * USRDFN record type (the task note: "split by record type when
 * claiming"), the smallest and most self-contained rule surface.
 *
 * Each entry is verified against `DDS_Keyword_V7r6.txt` directly, not
 * against the existing code, per the instruction - the citation in each
 * entry's `ddsReference` field is the exact justifying text.
 *
 * Written as plain, dependency-free JS (UMD-ish), same shape as
 * dspfEngine.js, so it runs unchanged in Node (tests, this file's own
 * require chain) and in the webview (loaded as a plain <script> before
 * dspfWriter.js, which now takes it as a second factory argument).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.KeywordSpec = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // -----------------------------------------------------------------------
  // Record types
  // -----------------------------------------------------------------------
  //
  // A record type entry describes the closed rule set the DDS Reference
  // states for that whole record format, where one exists - not every
  // per-keyword cross-reference, just the record-level "no keywords apply
  // except ..." / "the following keywords are allowed ..." shape that today
  // lives as a hand-written array beside two near-duplicate conflict-reason
  // functions (dspfWriter.js's usrdfnConflictReason/
  // usrdfnWhitelistConflictReason - same array, same rule, two names kept
  // only because ~50 existing call sites across webviewClientHelpers.js
  // already reference one name or the other with slightly different
  // message wording).
  // ---- Engine and writer constant tables ----
  //
  // Three hand-written tables in dspfWriter.js moved here.
  //
  // (1) SFL_CHOICE_KEYWORDS_LIST - the two subfile selection-list keywords
  // that exclude each other. SFLSNGCHC's and SFLMLTCHC's own DDS Reference
  // sections (each lists the other under "cannot be specified with")
  // establish the pair; SFLRTNSEL's qualifyingNames below uses the same
  // list, so the two can no longer drift. Declared order is the order
  // sflChoiceListNewConflictReason reports in.
  var SFL_CHOICE_KEYWORDS_LIST = ['SFLSNGCHC', 'SFLMLTCHC'];
  // The choice control-field value table, one object shared by CHCCTL and SFLCHCCTL (each section
  // prints the same table: 0 available / unselected, 1 selected, 2-4 unavailable, the cursor
  // restrictions only on an enhanced-interface controller).
  var CHOICE_CONTROL_VALUES = {
    0: { onOutput: 'available', onInput: 'unselected' },
    1: { onOutput: 'selected', onInput: 'selected' },
    2: { onOutput: 'unavailable (cannot place cursor on choice unless help for choice is available)' },
    3: { onOutput: 'unavailable (placing cursor on choice is allowed)' },
    4: { onOutput: 'unavailable (cannot place cursor on choice even if help for choice is available)' }
  };

  // (2) ALWROL_CLRL_SLNO_KEYWORDS - the three keywords whose DDS Reference
  // sections each state "cannot be specified with ... ALWROL, CLRL, SLNO"
  // (the ALWROL / CLRL / SLNO entries' `mutex` lists below). ASSUME's own
  // narrowed list is the same three names.
  var ALWROL_CLRL_SLNO_KEYWORDS = ['ALWROL', 'CLRL', 'SLNO'];

  // (3) RECORD_REFERENCES - the keywords whose parameter text names another
  // RECORD FORMAT, so renaming that record format must rewrite them
  // (renameRecordReferences). Not a DDS rule table: the DDS Reference
  // gives each keyword's parameter grammar, and these entries say where
  // the record-name token sits in it (verified: SFLCTL(record-format-name),
  // WINDOW(record-format-name | reference-line ...), MNUBARCHC(choice-
  // number record-name 'text')). `kind` is how the token is found in the
  // `parameters` text; `locator` is the source of the regex, scoped to that
  // keyword's own invocation, whose group 2 is the token to replace.
  //   whole          - the entire trimmed parameter text is the record name
  //   singleToken    - exactly one whitespace-separated token that is not a
  //                    number (a reference line) and not *DFT (inline
  //                    geometry), else the keyword carries no reference
  //   afterLeadingNumber - `<digits> <record-name> '<text>'`
  var RECORD_REFERENCES = {
    SFLCTL: { kind: 'whole', locator: '(\\bSFLCTL\\(\\s*)(\\S+?)(\\s*\\))' },
    WINDOW: { kind: 'singleToken', locator: '(\\bWINDOW\\(\\s*)(\\S+)(\\s*\\))' },
    MNUBARCHC: { kind: 'afterLeadingNumber', locator: '(\\bMNUBARCHC\\(\\s*\\d+\\s+)(\\S+)(\\s+\')' }
  };

  /** The keywords that carry a record-format-name reference, in table order. */
  function recordReferenceKeywords() { return Object.keys(RECORD_REFERENCES); }

  /** The record-format name `keywordName`'s `parameters` text references, or
   *  null when the keyword is not a record reference or this occurrence
   *  does not carry one (e.g. WINDOW with inline geometry). */
  function recordReferenceName(keywordName, parameters) {
    if (!Object.prototype.hasOwnProperty.call(RECORD_REFERENCES, keywordName)) return null;
    var params = parameters == null ? '' : String(parameters);
    var kind = RECORD_REFERENCES[keywordName].kind;
    if (kind === 'whole') {
      return params.trim() || null;
    }
    if (kind === 'singleToken') {
      var parts = params.trim().split(/\s+/).filter(Boolean);
      if (parts.length === 1 && !/^[+-]?\d+$/.test(parts[0]) && parts[0].toUpperCase() !== '*DFT') return parts[0];
      return null;
    }
    if (kind === 'afterLeadingNumber') {
      var m = params.trim().match(/^(\d+)\s+(\S+)\s+'/);
      return m ? m[2] : null;
    }
    return null;
  }

  /** A fresh case-insensitive RegExp locating the record-name token within
   *  `keywordName`'s own invocation (token = group 2), or null. */
  function recordReferenceLocator(keywordName) {
    if (!Object.prototype.hasOwnProperty.call(RECORD_REFERENCES, keywordName)) return null;
    return new RegExp(RECORD_REFERENCES[keywordName].locator, 'i');
  }

  function sflChoiceKeywords() { return SFL_CHOICE_KEYWORDS_LIST.slice(); }
  function alwrolClrlSlnoKeywords() { return ALWROL_CLRL_SLNO_KEYWORDS.slice(); }

  // The one rule CHKMSGID, ERRMSGID and SFLMSGID each state for their
  // message data field parameter (`&message-data-field` / `&msg-data`),
  // re-verified against DDS_Keyword_V7r6.txt (CHKMSGID ~line 3721,
  // ERRMSGID ~6215, SFLMSGID ~11617): "The field name must exist in the
  // record format, and the field must be defined as a character field
  // (data type A) with usage P." One shared object, so the three
  // keywords cannot drift apart.
  var MSG_DATA_FIELD_RULE = {
    mustExistInRecord: true,
    dataType: 'A',
    usage: 'P',
    ddsReference:
      'The field name must exist in the record format, and the field ' +
      'must be defined as a character field (data type A) with usage P.'
  };

  // SFLCSRPRG's own DDS Reference section (line ~10670, re-verified
  // fresh, unchanged from what the code already had) ends: "The SFLLIN
  // keyword is not allowed in a record that contains the SFLCSRPRG." Read
  // literally that is unsatisfiable (SFLCSRPRG is FIELD-level on the
  // subfile record, SFLLIN is RECORD-level on the control record), so
  // I-80 enforces it through the association the two records already
  // have: a control record's SFLCTL(subfile-record) parameter. A
  // genuinely new shape - an exclusion between a RECORD-level keyword on
  // one record and a FIELD-level keyword on a field of a DIFFERENT,
  // associated record (not `mutex`, which is same-record/same-field). One
  // shared object, referenced by both keywords, so the two cannot drift
  // apart.
  var SFLLIN_SFLCSRPRG_RULE = {
    controlRecordKeyword: 'SFLLIN',
    subfileFieldKeyword: 'SFLCSRPRG',
    associatedVia: 'SFLCTL',
    ddsReference:
      'The SFLLIN keyword is not allowed in a record that contains the SFLCSRPRG.'
  };

  var RECORD_TYPES = {
    USRDFN: {
      // The keyword that identifies a record as this type (see
      // buildTypedRecordPlan in webviewClientHelpers.js, which writes it -
      // always with blank parameters - for every USRDFN record the "+ Add
      // record" wizard creates).
      markerKeyword: 'USRDFN',

      // DDS_Keyword_V7r6.txt, "USRDFN (User-Defined) keyword for display
      // files" section (line ~13070): a closed whitelist, not a short
      // per-keyword exclusion list. USRDFN itself is always implicitly
      // allowed (it's the record-type identifier and is already present
      // by definition whenever this list is consulted for anything else).
      ddsReference:
        'No file- or record-level keywords apply to this record except ' +
        'INVITE, KEEP, PASSRCD, HLPRTN, HELP, HLPCLR, PRINT, OPENPRT, and ' +
        'TEXT. However, the HELP, HLPRTN, and INVITE keywords will only ' +
        'apply if they are specified on this record. They will not apply ' +
        'if they are specified at the file-level. Help specifications are ' +
        'valid for this record. Option indicators are not valid for this ' +
        'keyword.',
      whitelist: [
        'USRDFN', 'INVITE', 'KEEP', 'PASSRCD', 'HLPRTN', 'HELP', 'HLPCLR',
        'PRINT', 'OPENPRT', 'TEXT'
      ],

      // Of the ten indicator "kinds" the shared repeatable
      // Indicator-instance component (recordIndicatorInstancesHtml) can
      // hold (CLEAR, HOME, HELP, HLPRTN, VLDCMDKEY, PAGEDOWN, PAGEUP,
      // CHANGE, SETOF, INDTXT), only HELP and HLPRTN are on USRDFN's own
      // whitelist above - this is a derived fact (every kind not on
      // `whitelist` is refused), kept here explicitly so the UI's kind
      // selector and status text don't have to re-derive it by re-running
      // the whitelist check against all ten kinds every render.
      indicatorKinds: ['HELP', 'HLPRTN'],

      // Task R2 (narrowed) / I-114 (Indicator added back): which of the
      // seven possible record-Keywords subtabs a USRDFN record shows. Real
      // SDA's own "Select Record Keywords" menu for a USRDFN record has no
      // Indicator/Output/Input/Overlay categories at all (not just empty
      // ones) - this codebase deliberately departs from that for Indicator
      // so HELP/HLPRTN, otherwise reachable only through the raw keyword
      // editor, get a proper row.
      keywordTabs: ['general', 'indicator', 'help', 'print']
    },

    // Unlike USRDFN's closed whitelist (a record of that type may carry
    // ONLY the listed keywords), WINDOW's own DDS Reference section
    // states a short closed MUTEX list instead: a record with WINDOW may
    // not also carry any of these six, and - stated in the same sentence,
    // so genuinely bidirectional rather than two separate rules - a
    // record with any of these six may not also carry WINDOW. A mutex is
    // symmetric by construction: there is no "marker keyword" whose
    // presence is being tested for eligibility the way USRDFN's whitelist
    // tests every OTHER keyword against one fixed record type; both
    // keywordName and the record's existing keywords are checked against
    // the same list from either side. WINDOW itself is deliberately
    // absent from its own mutex list (a record cannot conflict with
    // itself), matching the code's existing `windowMutexConflictReason`.
    WINDOW: {
      // DDS_Keyword_V7r6.txt, "WINDOW (Define a Window) keyword for
      // display files" section (line ~13664): a closed six-keyword
      // mutual-exclusion list, re-verified fresh against the DDS
      // Reference text itself, unchanged from what the code already had.
      // SFLCTL is explicitly named as an exception (not in this list) -
      // "The WINDOW keyword is allowed on a record with the SFLCTL
      // keyword" - and PASSRCD has its own separate, already-fixed
      // restriction, not part of this closed list.
      ddsReference:
        'The WINDOW keyword is not allowed on a record format that has ' +
        'any one of the following keywords specified: ALWROL, ASSUME, ' +
        'MNUBAR, PULLDOWN, SFL, USRDFN.',
      mutex: ['ALWROL', 'ASSUME', 'MNUBAR', 'PULLDOWN', 'SFL', 'USRDFN'],

      // WINDOW's own DDS Reference section (line ~13673) separately
      // states this. A genuinely different restriction from the
      // same-record `mutex` list just above - PASSRCD is a file-level
      // keyword naming a record by string value, not a same-record
      // keyword-presence conflict - so it's a separate boolean field
      // plus its own citation, not folded into `mutex`/`ddsReference`.
      // See `passrcdRestrictedKeywords` below for the shared list this
      // flag feeds, and passrcdRecordConflictReason's own doc comment
      // in dspfWriter.js for the consuming logic.
      passrcdRestricted: true,
      passrcdDdsReference: 'WINDOW cannot be specified for the record format specified by the PASSRCD keyword.',

      // The reverse dependency: these record-level keywords each REQUIRE a
      // WINDOW keyword on the same record format. A third relation, distinct
      // from `mutex` (cannot coexist) and from `passrcdRestricted` (names a
      // record by string value). DDS_Keyword_V7r6.txt, RMVWDW (~line 10187):
      // "When the RMVWDW keyword is specified, a WINDOW keyword must be
      // specified on the same record format." USRRSTDSP (~line 13106): "The
      // WINDOW keyword must be specified on the same record as the USRRSTDSP
      // keyword." Both add that the keyword functions only when WINDOW
      // defines a window (not when it names a record format) - a runtime
      // "does not function", not a "cannot be specified" rule, so it is
      // deliberately not enforced here.
      requiredFor: [],   // Filled in below from RMVWDW / USRRSTDSP's own requiresOnRecord
      requiredForDdsReference:
        'RMVWDW: a WINDOW keyword must be specified on the same record format. ' +
        'USRRSTDSP: the WINDOW keyword must be specified on the same record as the USRRSTDSP keyword.'
    },

    // SFLCSRRRN's parameter. DDS_Keyword_V7r6.txt (~line 10686):
    // \"SFLCSRRRN(&relative-record)... The relative-record parameter is
    // required. It specifies the name of a hidden field... The field must be
    // defined in the subfile-control record format as a signed numeric (S in
    // position 35) field of length 5, with 0 decimal positions and usage H
    // (hidden).\" The name always carries the leading `&`.
    SFLCSRRRN: {
      // "You use this record-level keyword on the subfile-control record format".
      levels: ['record'],
      relativeRecordField: {
        parameterRequired: true,
        ampersandRequired: true,
        mustExistInRecord: true,
        dataType: 'S',
        length: 5,
        decimals: 0,
        usage: 'H',
        ddsReference:
          'SFLCSRRRN(&relative-record): the parameter is required and names a field in the subfile-control record format ' +
          'defined as a signed numeric (S) field of length 5 with 0 decimal positions and usage H (hidden).'
      }
    },

    // SFLCTL as the marker for three subfile-control-only record-level
    // keywords. Same `requiredFor` shape as WINDOW's: the keyword may only
    // appear on a record that also carries the marker. DDS_Keyword_V7r6.txt:
    // SFLDLT (~line 10810) \"You use this record-level keyword with an
    // option indicator on the subfile-control record format\"; SFLINZ
    // (~11258) \"You use this record-level keyword on the subfile-control
    // record format\"; SFLCSRRRN (~10686) \"You use this record-level
    // keyword on the subfile-control record format\". A subfile-control
    // record is the one carrying SFLCTL.
    SFLCTL: {
      // Task I-147 widened this from the three I-141 named to every subfile-control keyword the
      // slice specified (each of those entries has onRecordType 'SFLCTL'): SFLPAG, SFLCLR, SFLDSP,
      // SFLDSPCTL and SFLEND were accepted on a record with no SFLCTL. Task I-157 added the five
      // I-121d control-record keywords I-147 left for a re-read of their wording: SFLDROP,
      // SFLENTER, SFLFOLD, SFLMODE and SFLRNA (SFLMSGRCD is on the subfile record, not here).
      requiredFor: ['SFLCSRRRN', 'SFLDLT', 'SFLINZ', 'SFLPAG', 'SFLCLR', 'SFLDSP', 'SFLDSPCTL', 'SFLEND',
        'SFLDROP', 'SFLENTER', 'SFLFOLD', 'SFLMODE', 'SFLRNA'],
      requiredForDdsReference:
        'SFLCSRRRN, SFLDLT and SFLINZ are record-level keywords used on the subfile-control record format. ' +
        'SFLPAG (~line 11845) and SFLEND (~line 10975): \"You use this record-level keyword on the subfile-control record format\". ' +
        'SFLCLR (~line 10620), SFLDSP (~line 10907) and SFLDSPCTL (~line 10939): \"valid only for the subfile-control record format\". ' +
        'Task I-157 - SFLDROP (~line 10849), SFLFOLD (~line 11200), SFLMODE (~line 11491) and SFLENTER (~line 11159): ' +
        '\"You use this record-level keyword on the subfile-control record format\" (SFLENTER adds \"This optional keyword is valid only for ' +
        'the subfile-control record format\"); SFLRNA (~line 12116): \"You use this record-level keyword with the Subfile Initialize ' +
        '(SFLINZ) keyword on the subfile-control record format\".'
    },

    // Subfile mode and entry keywords (SFLCSRRRN is the entry above). Every
    // fact below was re-read from DDS_Keyword_V7r6.txt (line numbers are that
    // file's), NOT taken from the code. All six are record-level. SFLMSGRCD
    // sits on the subfile record (SFL); the other five on the subfile-control
    // record (SFLCTL). Pure refactor: nothing here adds a guard; relations no
    // guard enforces are recorded as facts and logged as findings. The CAnn /
    // CFnn parameter of SFLDROP / SFLENTER / SFLFOLD is
    // COMMAND_KEY_PARAMETER_KEYWORDS' fact and is NOT repeated here.
    SFLMODE: {
      levels: ['record'],
      onRecordType: 'SFLCTL',
      parameters: 'required',
      parameterGrammar: 'SFLMODE(&mode)',
      optionIndicators: 'notValid',
      modeField: {
        mustExistInRecord: true,
        dataType: 'A',
        length: 1,
        usage: 'H',
        foldedValue: '0',
        truncatedValue: '1',
        valueWithoutDropOrFold: '0'
      },
      ddsReference:
        'SFLMODE (~line 11491): SFLMODE(&mode); \"The mode parameter is required.\" The field must be defined in the ' +
        'subfile-control record format as a character (A in position 35) field of length 1 with usage H; it contains 0 ' +
        'for folded mode and 1 for truncated mode, and 0 if neither SFLDROP nor SFLFOLD is specified. \"Option ' +
        'indicators are not valid for this keyword.\"'
    },
    SFLRNA: {
      levels: ['record'],
      onRecordType: 'SFLCTL',
      parameters: 'none',
      optionIndicators: 'notValid',
      requiresOnRecord: ['SFLINZ'],
      notOnMessageSubfile: true,
      excludedWithFieldSelection: true,
      ddsReference:
        'SFLRNA (~line 12116): \"This keyword has no parameters.\" \"The SFLINZ keyword is required when SFLRNA is ' +
        'specified.\" \"SFLRNA cannot be specified for a message subfile (identified by the SFLMSGRCD keyword on the ' +
        'subfile record format).\" \"If the subfile record format contains field selection, SFLRNA is not valid.\" ' +
        '\"Option indicators are not valid for this keyword.\"'
    },
    SFLMSGRCD: {
      levels: ['record'],
      onRecordType: 'SFL',
      parameters: 'required',
      parameterGrammar: 'SFLMSGRCD(line-number)',
      parameterMaximum: 'the maximum line number of the display size in use',
      optionIndicators: 'notValid',
      displaySizeNames: 'valid',
      displaySizeNamesRequiredWhen: 'the first message line changes with the display size',
      textValidAtRecordLevel: true,
      // Predefined: only the field name and the keyword are specified (the
      // SFLMSGKEY and SFLPGMQ sections); SFLPGMQ(276) predefines 276 bytes
      // instead of the default 10 (found by the guard). The two predefined
      // fields a message subfile record may hold (the section: \"There can
      // be only two predefined fields\").
      predefinedFields: [
        { purpose: 'message identifier', position: 1, dataType: 'A', length: 4, usage: 'H', requires: 'SFLMSGKEY' },
        { purpose: 'program queue name', position: 2, dataType: 'A', length: 10, lengthWhenParameter276: 276, usage: 'H', requires: 'SFLPGMQ' }
      ],
      requiresWithSflinz: 'SFLPGMQ',
      mustNotOverlapDisplayableControlFields: true,
      messageTextMaxLength: { '24x80': 76, '27x132': 128 },
      messageStartPosition: 2,
      ddsReference:
        'SFLMSGRCD (~line 11718): SFLMSGRCD(line-number), the first display line for messages; \"Option indicators are ' +
        'not valid for this keyword; display size condition names are valid.\" The record has only two predefined ' +
        'fields (4-position A hidden message id with SFLMSGKEY; 10-position A hidden queue name with SFLPGMQ). With ' +
        'SFLMSGRCD, SFLINZ needs SFLPGMQ; the message lines must not overlap displayable control-record fields. ' +
        'SFLNXTCHG is refused with it (stated on SFLNXTCHG\'s entry).'
    },
    SFLDROP: {
      levels: ['record'],
      onRecordType: 'SFLCTL',
      parameters: 'required',
      parameterGrammar: 'SFLDROP(CAnn | CFnn)',
      optionIndicators: 'valid',
      startsTruncated: true,
      ignoredWhenSizeEqualsPage: true,
      notValidWithFieldSelection: true,
      pairedWith: { keyword: 'SFLFOLD', sameKeyRequired: true, winnerWhenBothActive: 'SFLFOLD' },
      ddsReference:
        'SFLDROP (~line 10849): SFLDROP(CAnn | CFnn); the subfile is first displayed truncated and the key toggles ' +
        'folded / truncated. Note 2: ignored when subfile size equals subfile page; not valid with field selection. ' +
        'Note 5: may be on the same record as SFLFOLD, which wins when both are active; both must use the same key. ' +
        '\"Option indicators are valid for this keyword.\"'
    },
    SFLENTER: {
      levels: ['record'],
      onRecordType: 'SFLCTL',
      parameters: 'required',
      parameterGrammar: 'SFLENTER(CAnn | CFnn)',
      optionIndicators: 'notValid',
      ddsReference:
        'SFLENTER (~line 11159): SFLENTER(CAnn | CFnn); \"This optional keyword is valid only for the subfile-control ' +
        'record format.\" \"The parameter value with this keyword is required.\" \"Option indicators are not valid for ' +
        'this keyword.\"'
    },
    SFLFOLD: {
      levels: ['record'],
      onRecordType: 'SFLCTL',
      parameters: 'required',
      parameterGrammar: 'SFLFOLD(CAnn | CFnn)',
      optionIndicators: 'valid',
      startsTruncated: false,
      ignoredWhenSizeEqualsPage: true,
      notValidWithFieldSelection: true,
      pairedWith: { keyword: 'SFLDROP', sameKeyRequired: true, winnerWhenBothActive: 'SFLFOLD' },
      ddsReference:
        'SFLFOLD (~line 11200): SFLFOLD(CAnn | CFnn); the subfile is first displayed folded and the key toggles ' +
        'truncated / folded. Note 2: with subfile size equal to subfile page a severity-20 error is issued and SFLFOLD ' +
        'is ignored; not valid with field selection. Note 5: may be on the same record as SFLDROP; SFLFOLD wins when ' +
        'both are active; both must use the same key. \"Option indicators are valid for this keyword.\"'
    },

    // Subfile control keywords (SFLCTL itself is the entry above). Every fact below was
    // re-read from DDS_Keyword_V7r6.txt (line numbers are that file's), NOT taken from the
    // code. All seven are record-level keywords of the subfile-control record format (the
    // record carrying SFLCTL). Fields:
    //   levels / onRecordType   - 'record' / 'SFLCTL' (the record kind)
    //   parameters              - 'none' | 'required' | 'optional'
    //   optionIndicators        - 'valid' | 'notValid' | 'required'
    //   displaySizeNames        - 'valid' | 'notValid' (display size condition names)
    //   requiredOnSubfileControl- the section says the subfile-control record must carry it
    //   excludesWhenSizeEqualsPage / excludesWithFieldSelection - keywords the
    //                             SFLPAG section refuses in those two situations
    //   optionIndicatorRequired - SFLDLT's rule as the guard reads it
    //                             (`guarded`); SFLCLR and SFLEND state the same
    //                             \"required\" rule but no guard enforces it yet
    //                             (finding, see keywordFixes.md I-121c)
    // Pure refactor: nothing here adds a guard. The record-level \"valid only for the
    // subfile-control record\" sentence is recorded as `onRecordType`; it is NOT
    // `validOnlyInSubfileControlRecord`, which is the FIELD-level shape the guard enforces.
    SFLPAG: {
      levels: ['record'],
      onRecordType: 'SFLCTL',
      parameters: 'required',
      parameterGrammar: 'number-of-records-to-be-displayed (a number, or a program-to-system field)',
      requiredOnSubfileControl: true,
      optionIndicators: 'notValid',
      displaySizeNames: 'valid',
      excludesWhenSizeEqualsPage: ['SFLDROP', 'SFLFOLD', 'SFLROLVAL'],
      // The reference contradicts itself on this list: SFLPAG's section says
      // these three are "not allowed" when SFLSIZ equals SFLPAG, but
      // SFLDROP's note 2 and SFLROLVAL's section say they are IGNORED (only
      // for the display sizes where the two are equal), and only SFLFOLD's
      // note 2 states an error ("an error message (severity 20) is issued and
      // SFLFOLD is ignored"). The guard refuses the stated error and leaves
      // the "ignored" ones alone (a multi-size file may legitimately have
      // them equal on one size).
      sizeEqualsPageError: ['SFLFOLD'],
      sizeEqualsPageIgnored: ['SFLDROP', 'SFLROLVAL'],
      // The "Field selection" part of SFLPAG's section lists SEVEN keywords
      // (SFLRNA "because SFLINZ is not valid", and SFLROLVAL); this entry
      // held five. Field selection is defined there: "When subfile page
      // equals subfile size, you can specify option indicators for fields in
      // the subfile record format. This is called field selection."
      excludesWithFieldSelection: ['SFLDROP', 'SFLFOLD', 'SFLINZ', 'SFLLIN', 'SFLRCDNBR', 'SFLRNA', 'SFLROLVAL'],
      ddsReference:
        'SFLPAG (~line 11845): \"You use this record-level keyword on the subfile-control record format to specify the ' +
        'number of records in the subfile to be displayed at the same time.\" \"This keyword is required for the ' +
        'subfile-control record format.\" If subfile size equals subfile page, SFLDROP, SFLFOLD and SFLROLVAL are not ' +
        'allowed; with field selection SFLDROP, SFLFOLD, SFLINZ, SFLLIN and SFLRCDNBR are not valid on the subfile-control ' +
        'record. Option indicators are not valid; display size condition names are (NO_OPTION_INDICATORS).'
    },
    SFLCLR: {
      levels: ['record'],
      onRecordType: 'SFLCTL',
      parameters: 'none',
      optionIndicators: 'required',
      displaySizeNames: 'notValid',
      ddsReference:
        'SFLCLR (~line 10620): \"This keyword has no parameters.\" \"This optional keyword is valid only for the ' +
        'subfile-control record format. Display size condition names are not valid for this keyword.\" \"An option ' +
        'indicator is required for this keyword to prevent the IBM i operating system from clearing the subfile on ' +
        'every output operation to the subfile-control record format.\"'
    },
    SFLDSP: {
      levels: ['record'],
      onRecordType: 'SFLCTL',
      parameters: 'none',
      requiredOnSubfileControl: true,
      optionIndicators: 'valid',
      displaySizeNames: 'notValid',
      ddsReference:
        'SFLDSP (~line 10907): \"This keyword has no parameters.\" \"This keyword is required and is valid only for the ' +
        'subfile-control record format. Display size condition names are not valid for this keyword.\" \"Option ' +
        'indicators are valid for this keyword.\"'
    },
    SFLDSPCTL: {
      levels: ['record'],
      onRecordType: 'SFLCTL',
      parameters: 'none',
      optionIndicators: 'valid',
      displaySizeNames: 'notValid',
      ddsReference:
        'SFLDSPCTL (~line 10939): \"This keyword has no parameters.\" \"This optional keyword is valid only for the ' +
        'subfile-control record format. Display size condition names are not valid for this keyword.\" \"Option ' +
        'indicators are valid for this keyword.\"'
    },
    SFLEND: {
      levels: ['record'],
      onRecordType: 'SFLCTL',
      parameters: 'optional',
      // SFLEND[(*PLUS | *MORE | {*SCRBAR [*SCRBAR | *PLUS | *MORE]})] (~line 10975).
      parameterGrammar: 'SFLEND[(*PLUS | *MORE | {*SCRBAR [*SCRBAR | *PLUS | *MORE]})]',
      firstParameters: ['*PLUS', '*MORE', '*SCRBAR'],
      defaultFirstParameter: '*PLUS',
      secondParameterOnlyAfter: '*SCRBAR',
      secondParameters: ['*SCRBAR', '*PLUS', '*MORE'],
      defaultSecondParameter: '*SCRBAR',
      scrollBarReservedColumns: 3,
      scrollBarMinimumLines: 3,
      moreAddsLines: 1,
      optionIndicators: 'required',
      ddsReference:
        'SFLEND (~line 10975): format SFLEND[(*PLUS | *MORE | {*SCRBAR [*SCRBAR | *PLUS | *MORE]})]; with no parameter ' +
        '*PLUS is used; the second set can only be specified when *SCRBAR is the first parameter and *SCRBAR is its ' +
        'default; *MORE makes the subfile take one more line (SFLPAG + 1); *SCRBAR reserves the last 3 columns of the ' +
        'subfile lines and the subfile must occupy at least 3 lines. \"An option indicator must be specified for this ' +
        'keyword.\"'
    },
    SFLINZ: {
      levels: ['record'],
      onRecordType: 'SFLCTL',
      parameters: 'none',
      optionIndicators: 'valid',
      displaySizeNames: 'notValid',
      excludedWithFieldSelection: true,
      ddsReference:
        'SFLINZ (~line 11258): \"This keyword has no parameters.\" Note 1: if field selection is used in the subfile ' +
        'record format, SFLINZ is not valid. Note 2: on a message subfile (SFLMSGRCD) it needs SFLPGMQ at field level in ' +
        'the same record. \"Option indicators are valid for this keyword. Display size condition names are not valid.\"'
    },
    SFLDLT: {
      levels: ['record'],
      onRecordType: 'SFLCTL',
      parameters: 'none',
      optionIndicators: 'required',
      displaySizeNames: 'notValid',
      // Task the stand-alone OPTION_INDICATOR_REQUIRED table, folded in here.
      optionIndicatorRequired: {
        required: true,
        noDisplaySize: true,
        guarded: true,
        ddsReference: 'Option indicators are required for this keyword; display size condition names are not valid.'
      },
      ddsReference:
        'SFLDLT (~line 10810): \"This keyword has no parameters.\" \"Option indicators are required for this keyword; ' +
        'display size condition names are not valid.\"'
    },

    // Initialize, retain and return keywords. Every fact below was re-read
    // from DDS_Keyword_V7r6.txt (line numbers are that file's), NOT taken from
    // the code. All seven are record-level keywords with no parameters.
    // Option-indicator validity (`optionIndicators`) is the same fact
    // NO_OPTION_INDICATORS carries for the five that refuse them; the two that
    // accept them (RETLCKSTS, INZINP) say so here. The RETKEY / RETCMDKEY S36E
    // notes live in S36E_RESTRICTIONS and are deliberately not repeated.
    //   levels / noParameters  - the keyword's level and its \"no parameters\"
    //   optionIndicators       - 'valid' | 'notValid'
    //   requiresOnRecord       - keywords that must be on the same record
    //   excludesOnRecord       - keywords refused on the same record
    //   excludesOnFileAndRecord- keywords refused at the file level AND on
    //                            this record (names ending in nn are the
    //                            CAnn / CFnn patterns)
    //   excludesInFile         - keywords refused anywhere in the file
    //   notOnRecordTypes       - record types (SFL / USRDFN markers) it is
    //                            refused on
    //   requiresInFile         - file-level keywords the file must carry
    // Enforcement lives with the existing guards (the SFL / USRDFN
    // whitelists refuse adding RETKEY / RETCMDKEY, and retKeyViolations reads
    // notOnRecordTypes for the other direction, I-188); relations with no
    // guard yet are recorded here and logged as findings in keywordFixes.md.
    INZRCD: {
      levels: ['record'],
      noParameters: true,
      optionIndicators: 'notValid',
      ddsReference:
        'INZRCD (~line 7775): \"This keyword has no parameters.\" ... ' +
        '\"Option indicators are not valid for this keyword.\" Does not apply to output operations.'
    },
    INZINP: {
      levels: ['record'],
      noParameters: true,
      optionIndicators: 'valid',
      // ~line 7667: \"This keyword requires the PUTOVR, OVERLAY, and
      // ERASEINP(*ALL) keywords to be specified at the record level.\" The
      // same section tells the reader to specify the same option indicators
      // for INZINP as for ERASEINP(*ALL), PUTOVR and OVERLAY, so they are
      // valid on it (no \"not valid\" sentence anywhere in the section).
      requiresOnRecord: ['PUTOVR', 'OVERLAY', 'ERASEINP(*ALL)'],
      ddsReference:
        'INZINP (~line 7635): \"This keyword has no parameters.\" It requires the PUTOVR, OVERLAY and ' +
        'ERASEINP(*ALL) keywords at the record level; option indicators are specified the same as for them.'
    },
    GETRETAIN: {
      levels: ['record'],
      noParameters: true,
      optionIndicators: 'notValid',
      // ~line 6542: \"You must specify the UNLOCK keyword without any
      // parameters when using GETRETAIN.\"
      requiresOnRecord: ['UNLOCK'],
      requiresBareKeyword: 'UNLOCK',
      ddsReference:
        'GETRETAIN (~line 6540): \"This keyword has no parameters.\" ... \"You must specify the UNLOCK keyword ' +
        'without any parameters when using GETRETAIN.\" ... \"Option indicators are not valid for this keyword.\"'
    },
    RTNDTA: {
      levels: ['record'],
      noParameters: true,
      optionIndicators: 'notValid',
      // ~line 10419: \"If the UNLOCK keyword is specified, the RTNDTA
      // keyword cannot be specified.\"
      excludesOnRecord: ['UNLOCK'],
      ddsReference:
        'RTNDTA (~line 10391): \"This keyword has no parameters.\" ... \"If the UNLOCK keyword is specified, the ' +
        'RTNDTA keyword cannot be specified.\" ... option indicators are not valid (see NO_OPTION_INDICATORS).'
    },
    RETLCKSTS: {
      levels: ['record'],
      noParameters: true,
      optionIndicators: 'valid',
      ddsReference:
        'RETLCKSTS (~line 10163): \"This keyword has no parameters. Option indicators are valid for this keyword.\"'
    },
    RETKEY: {
      levels: ['record'],
      noParameters: true,
      optionIndicators: 'notValid',
      // ~lines 14100-14140. CLEAR/HELP/HOME/PAGEUP/PAGEDOWN/ROLLDOWN/ROLLUP
      // are refused at the file level AND on the record; PRINT only on the
      // same record (it is allowed at the file level, as are HLPRTN); HLPRTN
      // on the record is merely not retained.
      excludesOnFileAndRecord: ['CLEAR', 'HELP', 'HOME', 'PAGEUP', 'PAGEDOWN', 'ROLLDOWN', 'ROLLUP'],
      excludesOnRecord: ['PRINT'],
      excludesInFile: ['ALTHELP', 'ALTPAGEUP', 'ALTPAGEDWN'],
      notOnRecordTypes: ['SFL', 'USRDFN'],
      requiresInFile: ['INDARA'],
      ddsReference:
        'RETKEY (~line 14110): \"These keywords have no parameters.\" You cannot specify RETKEY with a CLEAR, HELP, ' +
        'HOME, PAGEUP, PAGEDOWN, ROLLDOWN, or ROLLUP keyword on the file level or on this record format. PRINT is ' +
        'not allowed on the same record format. The file must specify INDARA; neither keyword is allowed on a ' +
        'subfile (SFL) or user-defined (USRDFN) record or in a file with ALTHELP, ALTPAGEUP or ALTPAGEDWN; ' +
        'option indicators are not valid.'
    },
    RETCMDKEY: {
      levels: ['record'],
      noParameters: true,
      optionIndicators: 'notValid',
      excludesOnFileAndRecord: ['CAnn', 'CFnn'],
      excludesOnRecord: ['SFLDROP', 'SFLENTER', 'SFLFOLD'],
      excludesInFile: ['ALTHELP', 'ALTPAGEUP', 'ALTPAGEDWN'],
      notOnRecordTypes: ['SFL', 'USRDFN'],
      requiresInFile: ['INDARA'],
      ddsReference:
        'RETCMDKEY (~line 14113): You cannot specify the CAnn or CFnn keywords with RETCMDKEY on the file level or ' +
        'on this record format, nor any CAnn, CFnn, SFLDROP, SFLENTER or SFLFOLD on the record. Same file and ' +
        'record-type rules as RETKEY (INDARA required; not on SFL / USRDFN; not with ALTHELP / ALTPAGEUP / ' +
        'ALTPAGEDWN); option indicators are not valid.'
    },

    // Window, menu-bar, help and logging record keywords. Every fact below was
    // re-read from DDS_Keyword_V7r6.txt (line numbers are that file's), NOT
    // taken from the code. Fields, beyond the ones I-121b documents:
    //   noParameters / minParameters - "has no parameters" / "at least one parameter must be specified"
    //   optionIndicators             - 'valid' | 'notValid' (agrees with NO_OPTION_INDICATORS)
    //   requiresOnRecord             - keywords that must be on the same record
    //   excludesInFile / notOnRecordTypes - as in I-121b
    //   repeatable                   - the keyword may appear more than once on a record
    //   parameters                   - the documented parameter shapes and limits
    // Enforcement stays with the existing guards; relations with no guard yet
    // are recorded here and logged as findings in keywordFixes.md.
    WDWTITLE: {
      levels: ['record'],
      minParameters: 1,
      optionIndicators: 'valid',
      repeatable: true,
      // ~line 13546: \"The WDWTITLE keyword can only be specified on a record
      // that contains a WINDOW keyword (in the definition format).\" If the
      // WINDOW keyword references another window, a warning is issued.
      requiresOnRecord: ['WINDOW'],
      // Several WDWTITLE keywords combine; for a parameter given twice the
      // first one wins.
      parameters: {
        text: '(*TEXT value) - a character string, or &field (character, usage P, in the window record)',
        textMaxFollows: 'window-positions of the WINDOW definition (longer text is truncated on the right)',
        colors: ['BLU', 'GRN', 'WHT', 'RED', 'TRQ', 'YLW', 'PNK'],
        displayAttributes: ['BL', 'CS', 'HI', 'ND', 'RI', 'UL'],
        alignments: ['*CENTER', '*LEFT', '*RIGHT'],
        alignmentDefault: '*CENTER',
        positions: ['*TOP', '*BOTTOM']
      },
      ddsReference:
        'WDWTITLE (~line 13456): at least one parameter must be specified: (*TEXT value), (*COLOR BLU|GRN|WHT|RED|TRQ|YLW|PNK), ' +
        '(*DSPATR BL|CS|HI|ND|RI|UL ...), *CENTER|*LEFT|*RIGHT, *TOP|*BOTTOM. Only on a record containing a WINDOW definition; ' +
        'more than one may be specified (the parameters combine, the first value of a repeated parameter wins). Option indicators are valid.'
    },
    RMVWDW: {
      levels: ['record'],
      noParameters: true,
      optionIndicators: 'valid',
      // ~line 10187: \"When the RMVWDW keyword is specified, a WINDOW keyword
      // must be specified on the same record format.\" It functions only when
      // WINDOW defines a window (a runtime fact, not enforced).
      requiresOnRecord: ['WINDOW'],
      ddsReference:
        'RMVWDW (~line 10187): \"This keyword has no parameters.\" ... \"a WINDOW keyword must be specified on the same record format\" ... \"Option indicators are valid for this keyword.\"'
    },
    USRRSTDSP: {
      levels: ['record'],
      noParameters: true,
      optionIndicators: 'valid',
      requiresOnRecord: ['WINDOW'],
      ddsReference:
        'USRRSTDSP (~line 13106): \"This keyword has no parameters.\" ... \"The WINDOW keyword must be specified on the same record as the USRRSTDSP keyword.\" ... \"Option indicators are valid for this keyword.\"'
    },
    MNUBARDSP: {
      levels: ['record'],
      optionIndicators: 'valid',
      repeatable: true,
      // ~line 8405. Two formats: on a record that is not a menu bar,
      // MNUBARDSP(menu-bar-record &choice-field [&pull-down-input]); on a
      // MNUBAR record, MNUBARDSP[(&pull-down-input)]. \"More than one MNUBARDSP
      // keyword can be specified on the record if all are optioned\"; the first
      // one in effect is used.
      parameters: {
        formOnPlainRecord: 'menu-bar-record &choice-field [&pull-down-input]',
        formOnMnubarRecord: '[&pull-down-input]',
        // The two field parameters are written with a leading & in the
        // reference syntax and in every example; Warrior confirmed against the
        // IBM i document that the compiler requires it. The menu-bar-record
        // parameter is a plain record name (no &).
        fieldReferencePrefix: '&',
        choiceField: { usage: 'H', length: 2, decimals: 0, keyboardShift: 'Y' },
        pullDownInput: { usage: 'H', length: 2, decimals: 0, keyboardShift: 'S', values: ['0', 'n', '-1'] }
      },
      multipleRequireOptionIndicators: true,
      ddsReference:
        'MNUBARDSP (~line 8405): on a non-menu-bar record MNUBARDSP(menu-bar-record &choice-field [&pull-down-input]) - the menu-bar record must be in the same file, ' +
        '&choice-field is a hidden (H) 2-long zero-decimal numeric Y field in the record, &pull-down-input a hidden (H) 2-long zero-decimal zoned (S) field; ' +
        'on a MNUBAR record MNUBARDSP[(&pull-down-input)]. Option indicators are valid and more than one keyword may be specified if all are optioned (the first in effect is used).'
    },
    ALTNAME: {
      levels: ['record'],
      parameters: { quotedName: true },
      optionIndicators: 'notValid',
      // Refused on USRDFN, SFL and MNUBAR records by those record types' own whitelists.
      notOnRecordTypes: ['SFL', 'USRDFN', 'MNUBAR'],
      ddsReference:
        'ALTNAME (~line 1934): ALTNAME(\'alternative-name\') - an alternative record name for program-described files. ' +
        'Option indicators are not valid (see NO_OPTION_INDICATORS). The System/36 notes live in S36E_RESTRICTIONS.'
    },
    HLPCLR: {
      levels: ['record'],
      noParameters: true,
      optionIndicators: 'valid',
      // ~line 6840: \"The record specifying the HLPCLR keyword must contain at
      // least one help specification.\"
      requiresHelpSpecification: true,
      ddsReference:
        'HLPCLR (~line 6831): \"This keyword has no parameters.\" ... \"Option indicators are allowed on this keyword.\" ... ' +
        '\"The record specifying the HLPCLR keyword must contain at least one help specification.\"'
    },
    HLPCMDKEY: {
      levels: ['record'],
      noParameters: true,
      optionIndicators: 'notValid',
      // ~line 6888: \"You cannot specify HLPCMDKEY on subfile (SFL keyword),
      // subfile control (SFLCTL keyword), or user-defined (USRDFN keyword)
      // record formats. You cannot specify the HLPCMDKEY keyword in a file
      // containing the USRDSPMGT keyword.\"
      notOnRecordTypes: ['SFL', 'SFLCTL', 'USRDFN'],
      excludesInFile: ['USRDSPMGT'],
      ddsReference:
        'HLPCMDKEY (~line 6860): \"This keyword has no parameters.\" ... cannot be specified on SFL, SFLCTL or USRDFN records or in a file containing USRDSPMGT; ' +
        'a CAnn / CFnn key must be on the help record or at the file level (a severity-10 warning otherwise); option indicators are not valid.'
    },
    HLPSEQ: {
      levels: ['record'],
      parameters: {
        form: 'HLPSEQ(group-name sequence-number)',
        groupNameMaxLength: 10,
        sequenceMin: 0,
        sequenceMax: 99,
        duplicateSequenceInGroup: false
      },
      optionIndicators: 'notValid',
      notOnRecordTypes: ['SFL', 'USRDFN'],
      ddsReference:
        'HLPSEQ (~line 7302): HLPSEQ(group-name sequence-number) - the group name is 1 to 10 characters, the sequence number 0 to 99, duplicate numbers within a group are not allowed. ' +
        'Cannot be specified on SFL or USRDFN record formats. Option indicators are not valid.'
    },
    LOGINP: {
      levels: ['record'],
      noParameters: true,
      optionIndicators: 'notValid',
      ddsReference:
        'LOGINP (~line 7872): \"This keyword has no parameters.\" ... ignored for a record with nothing to log or a message-subfile record (a runtime fact, not enforced) ... ' +
        '\"Option indicators are not valid for this keyword.\"'
    },
    LOGOUT: {
      levels: ['record'],
      noParameters: true,
      optionIndicators: 'valid',
      ddsReference:
        'LOGOUT (~line 7895): \"This keyword has no parameters.\" ... ignored for a record with nothing to log or a message-subfile record (a runtime fact, not enforced) ... ' +
        '\"Option indicators are valid for this keyword.\"'
    },
    SETOF: {
      levels: ['record'],
      parameters: {
        form: 'SETOF(response-indicator [\'text\'])',
        textMaxLength: 50,
        textOverflow: 'truncated to 50 characters on the program listing',
        equivalentKeyword: 'SETOFF'
      },
      optionIndicators: 'notValid',
      ddsReference:
        'SETOF (~line 10438): SETOF(response-indicator [\'text\']) - the optional text is truncated to 50 characters on the listing; SETOFF is equivalent. ' +
        'Any indicator is valid and becomes a response indicator. Option indicators are not valid.'
    },

    // Cursor, message and help-title keywords: CSRINPONLY, ENTFLDATR, MSGALARM,
    // HLPTITLE. Every fact below was re-read from DDS_Keyword_V7r6.txt (the
    // section named in each ddsReference), NOT taken from the code. Pure
    // refactor: nothing here adds a guard; rules with no guard yet are recorded
    // here and logged as findings in keywordFixes.md. The option-indicator rule
    // of HLPTITLE stays owned by the NO_OPTION_INDICATORS table (fileLevelOnly);
    // the entry restates it as `optionIndicators` and a test pins the two.
    CSRINPONLY: {
      levels: ['file', 'record'],
      parameters: 'none',
      optionIndicators: 'valid',
      // "This keyword only affects cursor movement caused by using the arrow keys."
      affectsOnly: 'arrow-key cursor movement',
      ddsReference:
        'CSRINPONLY (~line 4396): file- or record-level; restricts cursor movement to input-capable positions (arrow keys only). "This keyword ' +
        'has no parameters." "Option indicators are valid for this keyword."'
    },
    MSGALARM: {
      levels: ['file', 'record'],
      parameters: 'none',
      optionIndicators: 'valid',
      // The alarm sounds when the record is displayed with an active one of
      // these, or when a validity checking error is detected.
      soundsWith: ['ERRMSG', 'ERRMSGID', 'SFLMSG', 'SFLMSGID'],
      soundsOnValidityCheckError: true,
      // "If you specify the MSGALARM and ALARM keywords on the same record
      // format and both are active, the alarm sounds only once."
      withAlarmSoundsOnce: true,
      ddsReference:
        'MSGALARM (~line 8876): file- or record-level; sounds the short alarm when the record is displayed with an active ERRMSG, ERRMSGID, ' +
        'SFLMSG or SFLMSGID, or on a validity checking error. "This keyword has no parameters." With ALARM on the same record and both active the ' +
        'alarm sounds once. "Option indicators are valid with this keyword."'
    },
    ENTFLDATR: {
      levels: ['field', 'record', 'file'],
      parameters: 'optional',
      parameterGrammar: 'ENTFLDATR[([color] [display attribute] [cursor visible])]',
      optionIndicators: 'valid',
      color: { wrapper: '*COLOR', values: ['BLU', 'GRN', 'PNK', 'RED', 'TRQ', 'YLW', 'WHT'], default: 'WHT' },
      displayAttribute: { wrapper: '*DSPATR', values: ['BL', 'CS', 'HI', 'ND', 'RI', 'UL'], default: ['HI'] },
      cursorVisible: { values: ['*CURSOR', '*NOCURSOR'], default: '*CURSOR', noCursorNeedsDataType: 'I' },
      // "The field containing the ENTFLDATR keyword must be an input-capable field."
      fieldLevel: { allowedUsage: ['I', 'B'] },
      // "When defined at both the field- and record-level, the field-level
      // specification is used for the field."
      fieldLevelWinsOverRecordLevel: true,
      ignoredWithDspatrPR: true,
      ignoredWithoutEnhancedDataStream: true,
      unpredictableWith: ['EDTMSK'],
      ddsReference:
        'ENTFLDATR (~line 5977): field-, record- or file-level; the leading attribute of the field changes while the cursor is in it. Format ' +
        'ENTFLDATR[([color] [display attribute] [cursor visible])]: (*COLOR BLU|GRN|PNK|RED|TRQ|YLW|WHT) default white; (*DSPATR BL|CS|HI|ND|RI|UL ...) ' +
        'default HI; *CURSOR (default) / *NOCURSOR, and *NOCURSOR needs data type I (otherwise the default is used). The field must be input-capable; ' +
        'ignored with DSPATR(PR); the field-level specification wins over the record-level one; unpredictable with EDTMSK. "Option indicators are valid ' +
        'for this keyword."'
    },
    HLPTITLE: {
      levels: ['file', 'record'],
      parameters: 'required',
      parameterGrammar: "HLPTITLE('text')",
      textMaxLength: 55,
      // File level: not valid. Record level: valid, and required on EVERY
      // HLPTITLE of a record that has more than one.
      optionIndicators: { file: 'notValid', record: 'valid' },
      indicatorsRequiredOnEachWhenMultiple: true,
      maxPerRecordWithIndicators: 15,
      firstInEffectUsed: true,
      // "the file must contain at least one HLPPNLGRP keyword at either the
      // file or help specification level."
      requiresInFile: ['HLPPNLGRP'],
      fileLevelRequiredWhen: 'a file-level HLPPNLGRP and no help specifications are defined in the file',
      recordRequiredWhen: 'no file-level HLPTITLE is specified and the record contains help specifications',
      notValidOnRecordsWithoutHelpSpecs: true,
      ddsReference:
        'HLPTITLE (~line 7331): file- or record-level; HLPTITLE(\'text\'), the text up to 55 characters, the default title of online help (full-screen ' +
        'help only, when the help source gives none). The file needs at least one HLPPNLGRP (file or help-specification level); with a file-level ' +
        'HLPPNLGRP and no help specifications HLPTITLE is required at file level; otherwise every record with help specifications needs at least one; not ' +
        'valid on records without help specifications. Option indicators are not valid on a file-level HLPTITLE; allowed on record-level ones and then ' +
        'required on each if there are several; at most 15 per record when all have indicators; the first in effect is used.'
    },

    // File-level display and I/O keywords: IGCCNV, DSPRL, DSPSIZ, ERRSFL, INDARA,
    // MSGLOC, OPENPRT, REF. Every fact below was re-read from DDS_Keyword_V7r6.txt
    // (the section named in each ddsReference), NOT taken from the code. The field
    // names are the ones I-121b / I-121e use (levels, noParameters, optionIndicators,
    // requiresInFile, excludesInFile, parameters). Enforcement stays with the
    // existing guards; rules with no guard yet are recorded here and logged as
    // findings in keywordFixes.md.
    IGCCNV: {
      levels: ['file'],
      // "Option indicators are not allowed with this keyword."
      optionIndicators: 'notValid',
      repeatable: false,
      parameters: {
        format: 'IGCCNV(CFnn line-number)',
        commandKey: { keyTypes: ['CF'], first: 'CF01', last: 'CF24', notAlreadyAssigned: true },
        lineNumber: 'the display line that holds the conversion prompt line (it needs an entire line)',
        // The format line states two parameters, both required. The section gives the second
        // no range, so only "a line number" (a whole number from 1, as MSGLOC's "range 1
        // through 28" numbers the display's lines) is checked, never an upper bound.
        parameterCount: 2,
        lineNumberRule: { wholeNumber: true, min: 1, max: null }
      },
      // What the section does NOT settle, so it is not enforced.
      openQuestions: [
        'IGCCNV states no upper limit for line-number (a 24 x 80 display has 24 lines, but the section does not say the line must fit).',
        'IGCCNV says "a CF key that has already been assigned a function"; whether a CAnn of the same number counts as assigned is not stated, so only another CFnn use of that key is refused.',
        'IGCCNV says the file must be defined for a 24 x 80 display; a DSPSIZ that also lists 27 x 132 still defines it for 24 x 80, so only a DSPSIZ with no 24 x 80 size is refused.'
      ],
      // The remaining rules are runtime / advisory in the section and none is
      // enforced by the designer today.
      requiresDbcsDisplay: true,
      requiresDbcsInputField: true,
      requiresDisplaySize24x80: true,
      notDisplayedOverRecordTypes: ['USRDFN'],
      avoidWith: ['CHECK(ME)', 'CHECK', 'CMP', 'RANGE', 'VALUES'],
      ddsReference:
        'IGCCNV (DBCS Conversion) keyword (~line 15008): file-level, IGCCNV(CFnn line-number). The first parameter is a CF key (CF01-CF24) that ' +
        'is not already assigned a function; the second is the line of the conversion prompt line. Only for files displayed on DBCS display ' +
        'stations; at least one input-capable DBCS field (or a field with IGCALTTYP) is needed; avoid it with CHECK(ME) and with CHECK, CMP, RANGE ' +
        'and VALUES; the file must be defined for a 24 x 80 display; do not display the conversion format over a USRDFN format. Option indicators ' +
        'are not allowed with this keyword.'
    },
    DSPRL: {
      levels: ['file'],
      noParameters: true,
      optionIndicators: 'notValid',
      repeatable: false,
      bidirectionalDeviceOnly: true,
      ddsReference:
        'DSPRL (Display Right to Left) keyword (~line 5249): file-level; records are written right to left. This keyword has no parameters. ' +
        'Option indicators are not valid for this keyword. It can only be used on a bidirectional device.'
    },
    DSPSIZ: {
      levels: ['file'],
      optionIndicators: 'notValid',
      repeatable: false,
      // The size table itself (names, lines x positions, the default, the maximum
      // of two) lives in DSPSIZ_DOMAIN below; the accessors at the end of this
      // block copy it into `parameters` so there is one source.
      parameters: {
        formats: ['DSPSIZ(*DSw [*DSx])', 'DSPSIZ(lines positions[condition-name-1][lines positions[condition-name-2]])'],
        standardNames: [],      // filled from DSPSIZ_DOMAIN
        maxSizes: 0,            // filled from DSPSIZ_DOMAIN
        standardNameMayRepeat: false,
        userNameLength: { min: 2, max: 8 },
        userNameFirstCharacter: '*',
        userNameMayBeStandardName: false,
        firstSizeIsPrimary: true
      },
      // Without DSPSIZ the file opens only to a 24 x 80 display.
      absentMeans: '24 x 80 only',
      // The section says a user-defined name is "other than *DS3 or *DS4" yet the designer's own
      // Display Sizes picker (and widespread DDS) writes DSPSIZ(24 80 *DS3 27 132 *DS4), so a
      // standard name after a size is NOT refused; `userNameMayBeStandardName` above stays a
      // recorded fact. Mixing the two formats (*DS3 27 132) matches neither format line and is
      // refused.
      openQuestions: [
        'DSPSIZ says a user-defined condition name must be other than *DS3 or *DS4, but 24 80 *DS3 27 132 *DS4 is written by the Display Sizes picker and is common DDS; not refused.',
        'DSPSIZ(24 80 24 80) (the same size twice in the lines-and-positions form) is not covered by "you cannot specify a parameter value twice", which belongs to the *DS3 / *DS4 form; not refused.'
      ],
      // "If you specify user-defined display size condition names for DSPSIZ,
      // you cannot use IBM-supplied display size condition names for conditioning."
      userNamesExcludeStandardNamesForConditioning: true,
      ddsReference:
        'DSPSIZ (Display Size) keyword (~line 5270): file-level. DSPSIZ(*DSw [*DSx]) takes up to two of *DS3 / *DS4, at least one, neither twice; ' +
        'DSPSIZ(lines positions[condition-name] [lines positions[condition-name]]) takes 24 x 80 and 27 x 132 only, each optionally with a ' +
        'user-defined condition name of 2-8 characters whose first character is an asterisk. The first size is the primary size, the second the ' +
        'secondary. Without DSPSIZ the file opens only to 24 x 80 displays. Option indicators are not valid for this keyword.'
    },
    ERRSFL: {
      levels: ['file'],
      noParameters: true,
      optionIndicators: 'notValid',
      repeatable: false,
      // "If the message line overlaps a record already displayed on the screen,
      // the ERRSFL keyword is ignored."
      ignoredWhenMessageLineOverlapsRecord: true,
      // "If the ERRSFL keyword is specified in the file, you cannot specify a
      // message location value of 25 for the 24 x 80 display size or 28 for the
      // 27 x 132 display size."
      msglocRefused: [{ lines: 24, columns: 80, line: 25 }, { lines: 27, columns: 132, line: 28 }],
      // MSGLOC absent: the message line moves up one.
      msglocDefaultWithErrsfl: [{ lines: 24, columns: 80, line: 24 }, { lines: 27, columns: 132, line: 27 }],
      ddsReference:
        'ERRSFL (Error Subfile) keyword (~line 6322): file-level; messages are shown in a system-supplied error subfile on the message line (ignored ' +
        'if the message line overlaps a displayed record). This keyword has no parameters. Option indicators are not valid for this keyword. ' +
        'With ERRSFL a MSGLOC of 25 (24 x 80) or 28 (27 x 132) is refused; without MSGLOC the message line is 24 (24 x 80) or 27 (27 x 132).'
    },
    INDARA: {
      levels: ['file'],
      noParameters: true,
      optionIndicators: 'notValid',
      repeatable: false,
      // "If you specify INDARA, the LOGINP and LOGOUT keywords do not log
      // response or option indicators when your program sends I/O operations."
      loggingOmitsIndicators: ['LOGINP', 'LOGOUT'],
      // RETKEY / RETCMDKEY name INDARA as a file requirement in their own
      // entries; that relation is owned there.
      ddsReference:
        'INDARA (Indicator Area) keyword (~line 7481): file-level; option and response indicators move out of the buffer into a separate 99-byte ' +
        'indicator area. This keyword has no parameters. With INDARA, LOGINP and LOGOUT do not log response or option indicators. Option indicators ' +
        'are not valid for this keyword.'
    },
    MSGLOC: {
      levels: ['file'],
      optionIndicators: 'notValid',
      // MSGLOC is repeated once per display size: unconditioned for the primary
      // size and conditioned by a *DSx name for the secondary size. "Display size
      // condition names must be specified if the message line for the secondary
      // display size is different from the default message line."
      displaySizeNames: 'valid',
      repeatable: true,
      parameters: {
        lineNumber: { required: true, min: 1, max: 28, anyDisplaySize: true },
        defaultLine: [{ lines: 24, columns: 80, line: 25 }, { lines: 27, columns: 132, line: 28 }],
        // "A diagnostic will be issued when the file is opened if a message
        // location is in the 26 to 28 range for a 24 x 80 display size."
        diagnosticOn24x80: { min: 26, max: 28 }
      },
      excludesWithKeyword: [{ keyword: 'ERRSFL', lines: 24, columns: 80, line: 25 }, { keyword: 'ERRSFL', lines: 27, columns: 132, line: 28 }],
      ddsReference:
        'MSGLOC (Message Location) keyword (~line 9076): file-level, MSGLOC(line-number); the parameter is required and must be 1 through 28, valid ' +
        'whatever the DSPSIZ sizes; opening the file issues a diagnostic for 26-28 on a 24 x 80 display. Default message line: 25 (24 x 80), 28 ' +
        '(27 x 132). With ERRSFL, 25 (24 x 80) and 28 (27 x 132) are refused. Display size condition names are needed when the secondary size ' +
        'differs from the default. Option indicators are not valid for this keyword.'
    },
    OPENPRT: {
      levels: ['file'],
      noParameters: true,
      optionIndicators: 'notValid',
      repeatable: false,
      // "This keyword is valid only if you have specified a file-level PRINT
      // keyword with a printer file parameter. It is not valid with record-level
      // PRINT keywords." / "has no effect unless the PRINT file is specified."
      requiresInFile: ['PRINT'],
      requiresPrintFileParameter: true,
      notWithRecordLevel: ['PRINT'],
      // PRINT's format line is PRINT[(response-indicator ['text']) | (*PGM) |
      // ([library-name/]printer-file-name)], so a "printer file parameter" is the last form - a
      // bare PRINT (QSYSPRT / the device's PRTFILE), PRINT(*PGM) and PRINT(nn 'text') do not name
      // one.
      printFileParameterExcludes: ['no parameter', '*PGM', 'a response indicator (with optional text)'],
      openQuestions: [
        'OPENPRT says it "is not valid with record-level PRINT keywords"; whether that forbids a record-level PRINT beside a file-level PRINT(printer-file), or only restates that a record-level PRINT cannot satisfy the requirement, is not clear, so only the requirement is enforced.'
      ],
      ddsReference:
        'OPENPRT (Open Printer File) keyword (~line 9167): file-level; keeps the printer file open until the display file closes. This keyword has no ' +
        'parameters. Valid only with a file-level PRINT keyword that names a printer file; not valid with record-level PRINT. Option indicators are ' +
        'not valid for this keyword.'
    },
    REF: {
      levels: ['file'],
      optionIndicators: 'notValid',
      // "(REF can be specified only once.)"
      repeatable: false,
      parameters: {
        format: 'REF([library-name/]database-file-name [record-format-name])',
        databaseFileName: { required: true },
        libraryName: { required: false, default: '*LIBL' },
        recordFormatName: { required: false, default: 'every record format is searched in order' },
        ddmFileAllowed: true,
        iddFileAllowed: false,
        // One or two blank-separated parameters, the file token being
        // [library-name/]database-file-name. No rule is stated for the names themselves.
        parameterCount: { min: 1, max: 2 },
        libraryDelimiter: '/'
      },
      ddsReference:
        'REF (Reference) keyword (~line 10039): file-level, REF([library-name/]database-file-name [record-format-name]); the database file name is ' +
        'required, library and record format are optional; REF can be specified only once; a DDM file may be used, an IDDU file may not. Option ' +
        'indicators are not valid for this keyword.'
    },

    // File-level help, program-control and command-key keywords: PASSRCD,
    // USRDSPMGT, HLPFULL, HLPRCD, HLPSCHIDX, CA01-CA24, CF01-CF24. Every fact below
    // was re-read from DDS_Keyword_V7r6.txt (the section named in each ddsReference),
    // not taken from the code, and only what a section states is recorded (a
    // section that does not say "only once" gets no `repeatable`). The HLPPNLGRP <->
    // HLPRCD pair is owned by HLPPNLGRP's `mutex` above and the ALWROL / CLRL / SLNO
    // / WINDOW PASSRCD restrictions by those entries' `passrcdRestricted` flags;
    // neither is repeated here. The System/36 *response-indicator* restrictions are
    // I-121p's (S36E_RESTRICTIONS); this slice records only USRDSPMGT's own list.
    PASSRCD: {
      levels: ['file'],
      optionIndicators: 'notValid',
      parameters: {
        format: 'PASSRCD(record-format-name)',
        recordFormatName: { required: true, mustExistInFile: true }
      },
      // The keywords PASSRCD's OWN section forbids on the named record format. WINDOW
      // is forbidden by WINDOW's section instead (its entry carries the flag); the
      // flagged set is these three plus WINDOW (checked in the test).
      ownSectionRestrictedKeywords: ['ALWROL', 'CLRL', 'SLNO'],
      // "The passed data is processed only if your program's first request after
      // file open is an input operation without a record format name."
      passedDataProcessedOnlyIfFirstRequestIsInputWithoutFormat: true,
      ddsReference:
        'PASSRCD (Passed Record) keyword (~line 9375): file-level, PASSRCD(record-format-name); the name is required and must exist in the file; ' +
        'it is the format used when another program passes unformatted data, processed only if the first request after open is an input ' +
        'operation without a record format name. ALWROL, CLRL and SLNO cannot be specified on that record format. Option indicators are not ' +
        'valid for this keyword.'
    },
    USRDSPMGT: {
      levels: ['file'],
      noParameters: true,
      optionIndicators: 'notValid',
      // The keyword's own System/36 section (~line 14167): "You cannot use USRDSPMGT
      // in display files containing any of the following keywords". Eight names.
      cannotCoexistWith: ['ASSUME', 'ERASE', 'HLPCMDKEY', 'IGCCNV', 'KEEP', 'PUTRETAIN', 'SFL', 'SFLCTL'],
      // The System/36 considerations section (~line 13897) lists twelve - the eight
      // above plus ERRSFL, MNUBAR, PULLDOWN and SNGCHCFLD. The two lists are not
      // the same and the reference does not reconcile them; both are recorded.
      cannotCoexistWithConsiderationsList: ['ASSUME', 'ERASE', 'ERRSFL', 'HLPCMDKEY', 'IGCCNV', 'KEEP', 'MNUBAR', 'PULLDOWN', 'PUTRETAIN', 'SFL', 'SFLCTL', 'SNGCHCFLD'],
      overlayIgnored: true,
      ddsReference:
        'USRDSPMGT (User Display Management) keyword (~line 13097; the System/36 copy is at ~line 14167): file-level; all data written to the ' +
        'display is held until overwritten or cleared with CLRL, and the file is processed with System/36 environment functions. This keyword ' +
        'has no parameters. Its own section forbids ASSUME, ERASE, HLPCMDKEY, IGCCNV, KEEP, PUTRETAIN, SFL and SFLCTL in the file; the System/36 ' +
        'considerations list adds ERRSFL, MNUBAR, PULLDOWN and SNGCHCFLD. OVERLAY is ignored in such a file. Option indicators are not valid ' +
        'for this keyword (stated in the System/36 copy).'
    },
    HLPFULL: {
      levels: ['file'],
      noParameters: true,
      optionIndicators: 'notValid',
      // "When you specify the HLPFULL keyword, you must specify the HLPPNLGRP
      // keyword either at the file level or at the help specification level."
      requiresKeywordAtLevels: { keyword: 'HLPPNLGRP', levels: ['file', 'helpSpecification'] },
      absentMeans: 'help is shown in a window unless *HLPFULL is set for the user profile',
      ddsReference:
        'HLPFULL (Help Full) keyword (~line 7038): file-level; help text is shown full screen instead of in windows (without it, in a window ' +
        'unless *HLPFULL is set for the user profile). This keyword has no parameters. HLPPNLGRP must be specified at the file level or at the ' +
        'help specification level. Option indicators are not valid for this keyword.'
    },
    HLPRCD: {
      // "You use this file-level or help-specification-level keyword" (I-190: the entry
      // said file only; 'help' is the same level name HLPDOC, HLPARA and HLPBDY use).
      levels: ['file', 'help'],
      optionIndicators: 'valid',
      parameters: {
        format: 'HLPRCD(record-format-name [[library-name/]file-name])',
        recordFormatName: { required: true },
        fileName: { required: false, default: 'the file being defined' },
        libraryName: { required: false, default: '*LIBL' }
      },
      // Which record shows: the help-specification one when the cursor is in its
      // HLPARA and the H specification is active (its option indicator decides);
      // the file-level one when no help area of an active record holds the cursor.
      fileLevelShownWhenNoHelpAreaHoldsCursor: true,
      ddsReference:
        'HLPRCD (Help Record) keyword (~line 7150): file-level or help-specification-level, HLPRCD(record-format-name [[library-name/]file-name]); ' +
        'the record format is in the file being defined unless a file is named, and the library defaults to *LIBL at run time. The file-level ' +
        'record is displayed when no help area of the active records holds the cursor. Option indicators are valid for this keyword. (The ' +
        'HLPPNLGRP / HLPRCD exclusion is HLPPNLGRP\'s entry.)'
    },
    HLPSCHIDX: {
      levels: ['file'],
      optionIndicators: 'notValid',
      parameters: {
        format: 'HLPSCHIDX([library-name/]search-index-object)',
        searchIndexObject: { required: true, mustExistAtCreation: false },
        libraryName: { required: false, default: '*LIBL' }
      },
      // "HLPSCHIDX is valid only when at least one HLPPNLGRP keyword is specified in
      // the file." / "HLPSCHIDX keyword cannot be specified with the HLPSHELF keyword."
      requiresInFile: ['HLPPNLGRP'],
      excludesInFile: ['HLPSHELF'],
      enablesIndexSearchKey: 'F11',
      ddsReference:
        'HLPSCHIDX (Help Search Index) keyword (~line 7268): file-level, HLPSCHIDX([library-name/]search-index-object); enables the F11 index ' +
        'search on the Help display; the library defaults to *LIBL and the object need not exist when the file is created. Valid only when at ' +
        'least one HLPPNLGRP keyword is in the file; cannot be specified with HLPSHELF. Option indicators are not valid for this keyword.'
    },
    // CAnn and CFnn are ONE pattern entry each, not 24: the entry key is the ledger /
    // KEYWORD-LOOKUP name, and commandKeyEntry('CA05') resolves a concrete keyword to it.
    'CA01-CA24': {
      levels: ['file', 'record'],
      pattern: { type: 'CA', first: 1, last: 24, digits: 2 },
      optionIndicators: 'valid',
      parameters: {
        format: "CAnn[(response-indicator ['text'])]",
        responseIndicator: { required: false, min: 1, max: 99 },
        keyNumberMustHaveLeadingZero: true
      },
      transmitsInputData: false,
      sameKeyNumberAsOtherType: 'notAllowed',
      // The section says "CA02 and CF02 are not valid in the same display file", so the scope is
      // the whole file (any record, either level), not the same record.
      sameKeyNumberScope: 'file',
      fileLevelKeysExtendToRecordLevel: true,
      ddsReference:
        'CAnn (Command Attention) keyword (~line 2404): file-level or record-level, CAnn[(response-indicator [\'text\'])], nn = 01-24 with the ' +
        'leading zero; response indicators 01-99 are valid. No input data is transmitted. The same key number cannot be both CA and CF in a ' +
        'file (CA02 and CF02 are invalid together), and file-level keys extend to the record level, so CA02 at file level makes CF02 at record ' +
        'level an error. Option indicators are valid for this keyword.'
    },
    'CF01-CF24': {
      levels: ['file', 'record'],
      pattern: { type: 'CF', first: 1, last: 24, digits: 2 },
      optionIndicators: 'valid',
      parameters: {
        format: "CFnn[(response-indicator ['text'])]",
        responseIndicator: { required: false, min: 1, max: 99 },
        keyNumberMustHaveLeadingZero: true
      },
      transmitsInputData: true,
      sameKeyNumberAsOtherType: 'notAllowed',
      sameKeyNumberScope: 'file',
      fileLevelKeysExtendToRecordLevel: true,
      ddsReference:
        'CFnn (Command Function) keyword (~line 2509): file-level or record-level, CFnn[(response-indicator [\'text\'])], nn = 01-24 with the ' +
        'leading zero; response indicators 01-99 are valid. Changed input data is transmitted (unlike CA). The same key number cannot be both CA ' +
        'and CF in a file, and file-level keys extend to the record level. Option indicators are valid for this keyword.'
    },

    // The command-function keywords: ALWGPH, CLEAR, HELP, HLPRTN, HOME, INVITE,
    // PAGEDOWN, PAGEUP, PRINT, VLDCMDKEY (ROLLUP / ROLLDOWN are PAGEDOWN's and
    // PAGEUP's alternate names, not entries of their own). Every fact below was
    // re-read from DDS_Keyword_V7r6.txt (the section named in each ddsReference),
    // not taken from the code, and only what a section states is recorded; where the
    // section is silent nothing is invented (none of these sections states the legal
    // range of a response indicator, so none is recorded - see the section of
    // keywordFixes.md). The field names are the ones the other slices use (levels,
    // noParameters, optionIndicators, parameters, requiresInFile, excludesInFile,
    // mutex). Enforcement stays with the existing guards; rules with no guard yet
    // are recorded here and opened as tasks. The System/36 response- indicator
    // restrictions are I-121p's (S36E_RESTRICTIONS), not repeated here.
    ALWGPH: {
      levels: ['file', 'record'],
      noParameters: true,
      optionIndicators: 'valid',
      // "This keyword cannot be specified with the SFL or the USRDFN keywords."
      // (SFL and USRDFN records already refuse it through their own closed lists.)
      excludesOnRecordTypes: ['SFL', 'USRDFN'],
      // "The keyword is ignored if it is specified for a file displayed on any other
      // type of display." - a runtime fact, not enforced.
      ignoredExceptOnDevice: '5292 Model 2 Color Display Station',
      ddsReference:
        'ALWGPH (Allow Graphics) keyword (~line 2046): file- or record-level; allows graphics and alphanumeric contents to be displayed by the ' +
        'record format on a 5292 Model 2 Color Display Station at the same time, ignored on any other display. This keyword has no parameters. ' +
        'Option indicators are valid for this keyword. This keyword cannot be specified with the SFL or the USRDFN keywords.'
    },
    CLEAR: {
      levels: ['file', 'record'],
      optionIndicators: 'valid',
      parameters: {
        format: "CLEAR[(response-indicator ['text'])]",
        responseIndicator: { required: false },
        text: { quoted: true, maxPrintedLength: 50, longerIsTruncatedOnTheListing: true }
      },
      // "The Clear key is processed like a command attention key (no input data is
      // transmitted from the device)."
      processedLike: 'commandAttentionKey',
      // The format line is enforced (the indicator comes first, the optional text is
      // single-quoted); these two points the sections do not settle, so they are NOT enforced and
      // apply to every optional-indicator keyword here (CLEAR, HELP, HLPRTN, HOME, PAGEDOWN/ROLLUP,
      // PAGEUP/ROLLDOWN) and to VLDCMDKEY and PRINT.
      openQuestions: [
        'None of the ten sections states the legal range of a response indicator (only the CAnn / CFnn sections say 01 through 99), so CLEAR(0), CLEAR(100) and CLEAR(X) are accepted.',
        'Text over 50 characters is only truncated on the compile listing ("the text is truncated to 50 characters on the program printout"), so it is not refused.'
      ],
      ddsReference:
        'CLEAR (Clear) keyword (~line 3881): file- or record-level; your program receives control if the workstation user presses the Clear key and, ' +
        "optionally, the response indicator is set on. CLEAR[(response-indicator ['text'])]. The Clear key is processed like a command attention key. " +
        'The optional text (single quotation marks required) is truncated to 50 characters on the program printout. Option indicators are valid for this keyword.'
    },
    HELP: {
      levels: ['file', 'record'],
      optionIndicators: 'valid',
      parameters: {
        format: "HELP[(response-indicator ['text'])]",
        responseIndicator: { required: false },
        text: { quoted: true, maxPrintedLength: 50, longerIsTruncatedOnTheListing: true }
      },
      // "When a response indicator is specified on the HELP keyword, no H
      // specifications or HLPRCD, HLPPNLGRP, HLPDOC, or HLPRTN keywords can be
      // specified in the file."
      withResponseIndicatorExcludesInFile: ['HLPRCD', 'HLPPNLGRP', 'HLPDOC', 'HLPRTN'],
      withResponseIndicatorExcludesHelpSpecifications: true,
      // "HELP (with no response indicator) is required if the file contains H
      // specifications or HLPRCD, HLPPNLGRP, HLPDOC, or HLPRTN keywords."
      withoutResponseIndicatorRequiredWhenFileContains: ['HLPRCD', 'HLPPNLGRP', 'HLPDOC', 'HLPRTN'],
      withoutResponseIndicatorRequiredWhenFileHasHelpSpecifications: true,
      ddsReference:
        'HELP (Help) keyword (~line 6564): file- or record-level; enables the Help key. HELP[(response-indicator [\'text\'])]. When a response indicator ' +
        'is specified on the HELP keyword, no H specifications or HLPRCD, HLPPNLGRP, HLPDOC, or HLPRTN keywords can be specified in the file. HELP ' +
        '(with no response indicator) is required if the file contains H specifications or HLPRCD, HLPPNLGRP, HLPDOC, or HLPRTN keywords. Option ' +
        'indicators are valid for this keyword.'
    },
    HLPRTN: {
      levels: ['file', 'record'],
      optionIndicators: 'valid',
      parameters: {
        format: "HLPRTN[(response-indicator ['text'])]",
        responseIndicator: { required: false },
        text: { quoted: true, maxPrintedLength: 50, longerIsTruncatedOnTheListing: true }
      },
      // "HLPRTN at either the file or record level takes priority over any HLPRCD,
      // HLPPNLGRP, or HLPDOC keywords."
      takesPriorityOver: ['HLPRCD', 'HLPPNLGRP', 'HLPDOC'],
      // "A warning message appears at creation time if you specify an unoptioned
      // HLPRTN keyword on a file or record containing H specifications."
      unoptionedWithHelpSpecificationsWarnsAtCreation: true,
      ddsReference:
        'HLPRTN (Help Return) keyword (~line 7194): file- or record-level; returns control to your program when you press the Help key. HLPRTN[(response-' +
        'indicator [\'text\'])]. It takes priority over any HLPRCD, HLPPNLGRP, or HLPDOC keywords. Without an option indicator control returns to your program ' +
        '(a creation-time warning if the file or record contains H specifications); with one, only when it is on. Option indicators are valid for this keyword.'
    },
    HOME: {
      levels: ['file', 'record'],
      optionIndicators: 'valid',
      parameters: {
        format: "HOME[(response-indicator ['text'])]",
        responseIndicator: { required: false },
        text: { quoted: true, maxPrintedLength: 50, longerIsTruncatedOnTheListing: true }
      },
      // The home position, in order of priority (a runtime fact).
      homePositionPriority: ['the cursor position specified by the last output operation', 'the first unprotected input field', 'position 1, line 1'],
      ddsReference:
        'HOME (Home) keyword (~line 7380): file- or record-level; recognise and handle the Home key through your program. HOME[(response-indicator ' +
        '[\'text\'])]. If the cursor is already at the home position when the key is pressed, control returns to the program as for a command attention key. ' +
        'Option indicators are valid for this keyword.'
    },
    INVITE: {
      levels: ['file', 'record'],
      noParameters: true,
      optionIndicators: 'valid',
      // "INVITE cannot be specified at both the file and record level and cannot be
      // specified with the subfile keyword (SFL)."
      notAtBothFileAndRecordLevel: true,
      excludesOnRecordTypes: ['SFL'],
      ddsReference:
        'INVITE (Invite) keyword (~line 7553): file- or record-level; invites the device for a later read operation. This keyword has no parameters. ' +
        'INVITE cannot be specified at both the file and record level and cannot be specified with the subfile keyword (SFL). Option indicators are valid ' +
        'for this keyword.'
    },
    PAGEDOWN: {
      levels: ['file', 'record'],
      optionIndicators: 'valid',
      // "PAGEDOWN is the same as ROLLUP" - ROLLUP is read as PAGEDOWN and PAGEDOWN is
      // written back (the record-indicator group derives its alternate names here).
      alternateNames: ['ROLLUP'],
      parameters: {
        format: "PAGEDOWN[(response-indicator ['text'])]",
        responseIndicator: { required: false },
        text: { quoted: true, maxPrintedLength: 50, longerIsTruncatedOnTheListing: true }
      },
      // "The ROLLUP keyword cannot be specified with PAGEDOWN."
      notWithAlternateName: 'ROLLUP',
      ddsReference:
        'PAGEDOWN/PAGEUP (Page Down/Page Up) keywords (~line 9326): file- or record-level; PAGEDOWN[(response-indicator [\'text\'])]. The ROLLUP keyword ' +
        'cannot be specified with PAGEDOWN. Note: PAGEDOWN is the same as ROLLUP. Option indicators are valid for these keywords.'
    },
    PAGEUP: {
      levels: ['file', 'record'],
      optionIndicators: 'valid',
      alternateNames: ['ROLLDOWN'],
      parameters: {
        format: "PAGEUP[(response-indicator ['text'])]",
        responseIndicator: { required: false },
        text: { quoted: true, maxPrintedLength: 50, longerIsTruncatedOnTheListing: true }
      },
      // "The ROLLDOWN keyword cannot be specified with PAGEUP."
      notWithAlternateName: 'ROLLDOWN',
      ddsReference:
        'PAGEDOWN/PAGEUP (Page Down/Page Up) keywords (~line 9326): file- or record-level; PAGEUP[(response-indicator [\'text\'])]. The ROLLDOWN keyword ' +
        'cannot be specified with PAGEUP. Note: PAGEUP is the same as ROLLDOWN. Option indicators are valid for these keywords.'
    },
    PRINT: {
      levels: ['file', 'record'],
      optionIndicators: 'valid',
      parameters: {
        format: "PRINT[(response-indicator ['text']) | (*PGM) | ([library-name/]printer-file-name)]",
        // The four ways the section lists; a bare PRINT spools to QSYSPRT (or the
        // device's PRTFILE).
        forms: ['none', 'response-indicator', '*PGM', '[library-name/]printer-file-name'],
        text: { quoted: true, maxPrintedLength: 50, onlyWithResponseIndicator: true, longerIsTruncatedOnTheListing: true }
      },
      // "The only difference between these two forms [response indicator, *PGM] is
      // the response indicator; all other processing is the same."
      pgmEquivalentToResponseIndicator: true,
      // A single-token parameter is the response-indicator form or the printer-file form (the
      // section cannot tell them apart without a range for the indicator), and the sections state
      // no rule for a printer file or library name, so no length or character rule is enforced.
      openQuestions: [
        'The sections state no object-name rule for printer-file-name or library-name (no length, no character set), so PRINT(ABCDEFGHIJK) is accepted; only the shape [library-name/]printer-file-name is checked.',
        'A single-token parameter without a slash could be a response indicator or a printer file; the range of a response indicator is not stated, so both are accepted.'
      ],
      ddsReference:
        'PRINT (Print) keyword (~line 9407): file- or record-level; the workstation user can press the Print key to print the current display. ' +
        "PRINT[(response-indicator ['text']) | (*PGM) | ([library-name/]printer-file-name)]. With a response indicator or *PGM control returns to your " +
        'program (no data is received); with a printer file the display image is printed through it. Option indicators are valid for this keyword.'
    },
    VLDCMDKEY: {
      levels: ['file', 'record'],
      // "Option indicators are not valid for this keyword." (the noOptionIndicators fact)
      optionIndicators: 'notValid',
      parameters: {
        format: "VLDCMDKEY(response-indicator ['text'])",
        responseIndicator: { required: true },
        text: { quoted: true, maxPrintedLength: 50, longerIsTruncatedOnTheListing: true }
      },
      // The keys a command key must be activated through to count as valid, with
      // the section's own conditions.
      validCommandKeysActivatedBy: [
        { keyword: 'ALTHELP(CAnn)' },
        { keyword: 'ALTPAGEUP(CFnn)', onlyIf: 'PAGEUP is also specified' },
        { keyword: 'ALTPAGEDWN(CFnn)', onlyIf: 'PAGEDOWN is also specified' },
        { keyword: 'CAnn' },
        { keyword: 'CFnn' },
        { keyword: 'CLEAR' },
        { keyword: 'HELP', onlyIf: 'the Help key is passed back to the application (HELP and HLPRTN, or HELP and no help areas for the displayed records)' },
        { keyword: 'HOME' },
        { keyword: 'PAGEDOWN' },
        { keyword: 'PAGEUP' },
        { keyword: 'PRINT', onlyIf: 'the Print key is passed back to the application (a response indicator or *PGM)' },
        { keyword: 'ROLLUP' },
        { keyword: 'ROLLDOWN' }
      ],
      ddsReference:
        'VLDCMDKEY (Valid Command Key) keyword (~line 13218): file- or record-level; the response indicator is set on when any valid command key other ' +
        "than the Enter key is pressed. VLDCMDKEY(response-indicator ['text']). The response-indicator parameter is required. For a command key to be " +
        'considered valid it must have been activated by one of the listed keywords. Option indicators are not valid for this keyword.'
    },

    // Same mutex shape as WINDOW above (a closed list forbidden on the
    // same record in either direction), just a much larger list -
    // re-verified fresh against PULLDOWN's own DDS Reference section,
    // unchanged from what the code already had. PULLDOWN itself is
    // deliberately absent from its own mutex list.
    PULLDOWN: {
      // DDS_Keyword_V7r6.txt, "PULLDOWN (Pull-Down Menu) keyword for
      // display files" section (line ~9772): "The following keywords
      // cannot be specified on a record with the PULLDOWN keyword:"
      // followed by this exact 27-entry list, explicitly bidirectional
      // per the code's own existing pulldownConflictReason doc comment
      // (PULLDOWN is toggled on/off interactively, unlike a record-type
      // identifier keyword such as USRDFN's own).
      ddsReference:
        'The following keywords cannot be specified on a record with ' +
        'the PULLDOWN keyword: ALARM, ALTNAME, ALWGPH, ALWROL, ASSUME, ' +
        'CLEAR, CLRL, ERASE, ERASEINP, FRCDTA, HLPCLR, HLPSEQ, INVITE, ' +
        'INZRCD, MDTOFF, MNUBAR, OVERLAY, OVRATR, OVRDTA, PUTOVR, ' +
        'PUTRETAIN, RTNDTA, SFL, SLNO, USRDFN, WDWTITLE, WINDOW.',
      mutex: [
        'ALARM', 'ALTNAME', 'ALWGPH', 'ALWROL', 'ASSUME', 'CLEAR', 'CLRL',
        'ERASE', 'ERASEINP', 'FRCDTA', 'HLPCLR', 'HLPSEQ', 'INVITE', 'INZRCD',
        'MDTOFF', 'MNUBAR', 'OVERLAY', 'OVRATR', 'OVRDTA', 'PUTOVR',
        'PUTRETAIN', 'RTNDTA', 'SFL', 'SLNO', 'USRDFN', 'WDWTITLE', 'WINDOW'
      ]
    },

    // Same closed-whitelist SHAPE as USRDFN above ("only these are
    // allowed on a record with the marker keyword"), but with one
    // genuinely new wrinkle USRDFN's own list didn't need: two of the
    // DDS Reference's own 27 table entries, CAnn and CFnn, are written
    // in the Reference itself as a placeholder pattern (n = a two-digit
    // number), not literal keyword names - and this codebase's own model
    // represents each one as an individual literal keyword
    // (CA01..CA24/CF01..CF24, see DspfWriter.parseCommandKeys' own
    // comment), so a fixed whitelist array alone can't express
    // membership for these two entries. Hence the new
    // `whitelistPatterns` field alongside `whitelist` below - still the
    // same "is this keyword one of the allowed ones" question
    // isWhitelisted already answers, just matched by regex for these two
    // entries instead of by array membership. PAGEDOWN/PAGEUP and
    // ROLLUP/ROLLDOWN are DDS synonym pairs for two keywords (not four
    // distinct ones) and are both spelled out literally in `whitelist`
    // below, same as PULLDOWN's own slice did for WINDOW itself.
    MNUBAR: {
      markerKeyword: 'MNUBAR',

      // DDS_Keyword_V7r6.txt, "MNUBAR (Menu Bar) keyword for display
      // files" section (line ~8171): "The following keywords are allowed
      // on a record containing the MNUBAR keyword:" followed by this
      // exact 27-entry table, re-verified fresh against the DDS
      // Reference text itself, unchanged from what the code already had.
      ddsReference:
        'The following keywords are allowed on a record containing the ' +
        'MNUBAR keyword: CAnn, CFnn, CLEAR, CLRL, CSRLOC, DSPMOD, HELP, ' +
        'HLPCLR, HLPCMDKEY, HLPRTN, HLPTITLE, HOME, INDTXT, INVITE, KEEP, ' +
        'LOCK, MNUBARDSP, MNUBARSEP, MNUBARSW, MNUCNL, OVERLAY, ' +
        'PAGEDOWN/PAGEUP, PRINT, PROTECT, ROLLUP/ROLLDOWN, TEXT, UNLOCK, ' +
        'VLDCMDKEY.',
      whitelist: [
        'MNUBAR', 'CLEAR', 'CLRL', 'CSRLOC', 'DSPMOD', 'HELP', 'HLPCLR',
        'HLPCMDKEY', 'HLPRTN', 'HLPTITLE', 'HOME', 'INDTXT', 'INVITE',
        'KEEP', 'LOCK', 'MNUBARDSP', 'MNUBARSEP', 'MNUBARSW', 'MNUCNL',
        'OVERLAY', 'PAGEDOWN', 'PAGEUP', 'PRINT', 'PROTECT', 'ROLLUP',
        'ROLLDOWN', 'TEXT', 'UNLOCK', 'VLDCMDKEY'
      ],
      whitelistPatterns: [/^CA\d{2}$/, /^CF\d{2}$/]
    },

    // Whitelist shape again (like USRDFN's/ MNUBAR's own slices), but
    // SFL's own DDS Reference section states TWO mutually exclusive
    // closed lists under one "Besides SFL, the following keywords are
    // also valid on the subfile record format:" heading, split by
    // whether the record is a message subfile - so this slice is two
    // spec entries, not one. SFLCTL's own section was re-read fresh too
    // (per this task's own "verify against the DDS Reference directly"
    // instruction) and, unlike SFL's, introduces its keyword tables as
    // an explicit SUMMARY of SFL-family keywords, not a "no other
    // keyword applies" claim - so SFLCTL needs no whitelist entry of its
    // own here (see sflWhitelistConflictReason's own doc comment, Task
    // the original finding). That leaves this single slice covering both
    // the "SFL/SFLCTL" and "message subfile" record types the task's own
    // remaining-work list had listed separately.
    SFL: {
      markerKeyword: 'SFL',

      // DDS_Keyword_V7r6.txt, "SFL (Subfile) keyword for display files"
      // section (line ~10515): "For all other subfiles (at the record
      // level):" list, re-verified fresh against the DDS Reference text
      // itself, unchanged from what the code already had. CHECK(AB) and
      // CHECK(RL) are the same keyword name (CHECK) with two different
      // parameter values, not two distinct keywords - matched here by
      // name only, same as the code's own existing behavior (parameters
      // aren't otherwise restricted by this whitelist). SETOF/SETOFF are
      // two genuinely distinct DDS keywords (not a synonym pair the way
      // PAGEDOWN/PAGEUP or ROLLUP/ROLLDOWN are), both listed in the DDS
      // Reference table itself, both included.
      ddsReference:
        'For all other subfiles (at the record level), besides SFL the ' +
        'following keywords are also valid on the subfile record ' +
        'format: CHANGE, LOGINP, CHECK(AB), CHECK(RL), LOGOUT, SETOF, ' +
        'CHGINPDFT, SETOFF, INDTXT, SFLNXTCHG, KEEP, TEXT.',
      whitelist: [
        'SFL', 'CHANGE', 'LOGINP', 'CHECK', 'LOGOUT', 'SETOF', 'SETOFF',
        'CHGINPDFT', 'INDTXT', 'SFLNXTCHG', 'KEEP', 'TEXT'
      ]
    },

    // A genuinely different shape from every other entry in this file
    // so far: a record type identified by TWO marker keywords being
    // present TOGETHER (SFL AND SFLMSGRCD), not by one - a plain SFL
    // record with no SFLMSGRCD falls under the SFL entry above instead;
    // markerKeyword is deliberately an array here (singular
    // `markerKeyword` elsewhere) to make that two-keyword
    // identification explicit rather than implicit in calling code.
    SFLMSG: {
      // "SFLMSG... and SFLMSGID... keywords for display files": "You use these record-level
      // keywords on the subfile-control record format".
      levels: ['record'],
      markerKeywords: ['SFL', 'SFLMSGRCD'],

      // DDS_Keyword_V7r6.txt, same SFL section as above, "For message
      // subfiles:" list - SFLMSGKEY and SFLPGMQ are themselves field-
      // level, not record-level (SFLMSGKEY explicitly "required at the
      // field level" in the DDS Reference's own text), so they're
      // outside this record-level whitelist's own scope, matching the
      // code's pre-existing behavior (SFLMSGRCD is the only entry).
      ddsReference:
        'For message subfiles, besides SFL the following keywords are ' +
        'also valid on the subfile record format: SFLMSGRCD (required ' +
        'at the record level), SFLMSGKEY (required at the field level), ' +
        'SFLPGMQ.',
      whitelist: ['SFL', 'SFLMSGRCD']
    },

    // A well-scoped piece of the "plain/base record" remainder rather than
    // that whole undertaking, covering the existing
    // keepMutexConflictReason and alwrolClrlSlnoConflictReason functions'
    // own rule webs. Unlike WINDOW/PULLDOWN above, none of
    // KEEP/ALWROL/CLRL/SLNO/ASSUME is a record-TYPE identifier written
    // once by a creation wizard - they're ordinary toggleable flags any
    // record can carry (see this codebase's own pre-existing doc comments
    // on keepMutexConflictReason/ alwrolClrlSlnoConflictReason) - but the
    // DDS Reference states their restrictions in the exact same "cannot be
    // specified with the following keywords" closed-mutex shape
    // `mutex`/`isMutex` already model, just keyed by an ordinary keyword
    // name here instead of a record-type marker. Five entries,
    // cross-verified fresh against each keyword's own DDS Reference
    // section AND (per I-23's/I-28's/ the established cross-verification
    // method) each mutex partner's own section restating the exclusion the
    // other way:
    KEEP: {
      // DDS_Keyword_V7r6.txt, "KEEP (Keep) keyword for display files"
      // section (line ~7826): "This keyword cannot be specified with the
      // following keywords:" ALWROL, CLRL, SLNO - cross-verified against
      // each of those three's own sections, which restate the same
      // exclusion against KEEP.
      ddsReference:
        'This keyword cannot be specified with the following keywords: ' +
        'ALWROL, CLRL, SLNO.',
      mutex: ['ALWROL', 'CLRL', 'SLNO']
    },
    ALWROL: {
      // DDS_Keyword_V7r6.txt, "ALWROL (Allow Roll) keyword for display
      // files" section (line ~2102): "The ALWROL keyword cannot be
      // specified with any of the following keywords:" ASSUME, KEEP,
      // SFL, SFLCTL, USRDFN. KEEP is covered by the KEEP entry above
      // already (identical bidirectional relationship, so not repeated
      // here to avoid two sources of truth for the same pair) - this
      // entry covers ALWROL's remaining four partners.
      ddsReference:
        'The ALWROL keyword cannot be specified with any of the ' +
        'following keywords: ASSUME, KEEP, SFL, SFLCTL, USRDFN.',
      mutex: ['ASSUME', 'SFL', 'SFLCTL', 'USRDFN'],

      // ALWROL's own DDS Reference section (line ~2144) separately
      // states this - see the WINDOW entry's own comment above for why
      // this is a separate field from `mutex`.
      passrcdRestricted: true,
      passrcdDdsReference: 'The ALWROL keyword cannot be specified for the record format specified by the PASSRCD keyword.'
    },
    CLRL: {
      // DDS_Keyword_V7r6.txt, "CLRL (Clear Line) keyword for display
      // files" section (line ~3917): "The CLRL keyword cannot be
      // specified with any of the following keywords:" ASSUME, KEEP,
      // SFL, SFLCTL, USRDFN - identical partner list to ALWROL's own.
      ddsReference:
        'The CLRL keyword cannot be specified with any of the ' +
        'following keywords: ASSUME, KEEP, SFL, SFLCTL, USRDFN.',
      mutex: ['ASSUME', 'SFL', 'SFLCTL', 'USRDFN'],

      // CLRL's own DDS Reference section (line ~3987) separately states
      // this - see the WINDOW entry's own comment above.
      passrcdRestricted: true,
      passrcdDdsReference: 'The CLRL keyword cannot be specified for the record format specified by the PASSRCD keyword.'
    },
    SLNO: {
      // DDS_Keyword_V7r6.txt, "SLNO (Starting Line Number) keyword for
      // display files" section (line ~12576): "The SLNO keyword is not
      // allowed in a record format that has one of the following
      // keywords specified:" ASSUME, KEEP, SFL, SFLCTL, USRDFN -
      // identical partner list to ALWROL's/CLRL's own, just phrased
      // "not allowed... has" instead of "cannot be specified with".
      ddsReference:
        'The SLNO keyword is not allowed in a record format that has ' +
        'one of the following keywords specified: ASSUME, KEEP, SFL, ' +
        'SFLCTL, USRDFN.',
      mutex: ['ASSUME', 'SFL', 'SFLCTL', 'USRDFN'],

      // SLNO's own DDS Reference section (line ~12631) separately
      // states this - see the WINDOW entry's own comment above.
      passrcdRestricted: true,
      passrcdDdsReference: 'SLNO cannot be specified for the record format specified by the PASSRCD keyword.'
    },
    // ASSUME's own DDS Reference section states a broader six-keyword
    // list (ALWROL, CLRL, SFL, SLNO, USRDFN, USRDSPMGT) than this entry
    // holds - deliberately narrowed to just the ALWROL/CLRL/SLNO
    // reciprocal pair, matching alwrolClrlSlnoConflictReason's own
    // pre-existing scope (its own doc comment: SFL/USRDFN are record-
    // type identifiers with no reachable reverse UI transition to guard,
    // and USRDSPMGT is a separate S36E concern handled elsewhere) - a
    // future slice extending ASSUME's own entry to the full six-keyword
    // list would need to widen this comment and mutex array together,
    // not just the array alone.
    ASSUME: {
      ddsReference:
        'This keyword cannot be specified with any of the following ' +
        'keywords: ALWROL, CLRL, SFL, SLNO, USRDFN, USRDSPMGT. (This ' +
        'entry deliberately models only the ALWROL/CLRL/SLNO subset - ' +
        'see the comment above.)',
      mutex: ['ALWROL', 'CLRL', 'SLNO']
    },

    // Task I-121 SFLNXTCHG/SFLMSGRCD + DSPMOD/SFL slice - two more small,
    // closed-form record-level pairs, each already its own dedicated
    // guard function (sflNxtchgSflMsgRcdConflictReason, Task I-23;
    // dspmodSflConflictReason).
    SFLNXTCHG: {
      // The level, parameter and option-indicator facts from the same section (line ~11790): "You
      // use this record-level keyword on the subfile record format", "This keyword has no
      // parameters." and "Option indicators are valid for this keyword."
      levels: ['record'],
      parameters: 'none',
      optionIndicators: 'valid',
      // DDS_Keyword_V7r6.txt, "SFLNXTCHG (Subfile Next Changed) keyword
      // for display files" section (line ~11826): "You cannot specify
      // SFLNXTCHG with the SFLMSGRCD keyword." A plain, symmetric
      // single-keyword mutex - re-verified fresh, unchanged from what
      // the code already had.
      ddsReference: 'You cannot specify SFLNXTCHG with the SFLMSGRCD keyword.',
      mutex: ['SFLMSGRCD']
    },
    // DSPMOD/SFL is genuinely one-directional, unlike every mutex entry
    // above: DSPMOD's own DDS Reference section states "The DSPMOD
    // keyword cannot be specified on a subfile record (SFL keyword)" -
    // about DSPMOD being added to an already-SFL record, not the reverse
    // (SFL's own section says nothing about DSPMOD, and this codebase's
    // pre-existing dspmodSflConflictReason has never checked that
    // direction either). Modeled as an ordinary `mutex` entry anyway
    // (reusing the same shape rather than inventing a one-directional-
    // only variant for a single pair) - dspfWriter.js's own refactored
    // function below simply never calls isMutex in the reverse
    // direction, the same restraint SFL/SFLCTL/USRDFN already got in the
    // ALWROL/CLRL/SLNO slice above.
    DSPMOD: {
      ddsReference:
        'The DSPMOD keyword cannot be specified on a subfile record ' +
        '(SFL keyword). The subfile is displayed according to the ' +
        'DSPMOD of the corresponding subfile control record.',
      mutex: ['SFL']
    },

    // HLPDOC, HLPBDY/HLPPNLGRP/HLPRCD/HLPRTN's own cross-exclusions,
    // currently spread across three functions (hlpdocConflictReason,
    // hlpdocHspecConflictReason, hlprcdConflictReason), each re-embedding
    // the same DDS-Reference-stated pairings as bare string-literal
    // comparisons rather than reading them from one place. Four distinct
    // pairwise relationships, each modeled ONCE (one owner entry, same
    // "avoid two sources of truth for the same pair" principle the
    // ALWROL/CLRL/SLNO/ASSUME slice above already established) even
    // though some of them are independently restated from both sides in
    // the DDS Reference's own prose:
    //  1. HLPDOC <-> HLPBDY (help-specification-level scope only - HLPBDY
    //     doesn't exist at file level in this codebase)
    //  2. HLPDOC <-> HLPPNLGRP (file-wide scope - HLPPNLGRP's own section
    //     states this "a display file cannot contain both..." regardless
    //     of which level either keyword lives at)
    //  3. HLPDOC <-> HLPRTN (file-level scope only - the research
    //     found the H-spec-level question unsettled by the DDS Reference
    //     alone and deliberately left unchecked there; not re-litigated
    //     by this slice)
    //  4. HLPPNLGRP <-> HLPRCD (file-level scope)
    // HLPRTN's OWN section states a priority rule ("HLPRTN... takes
    // priority over any HLPRCD, HLPPNLGRP, or HLPDOC keywords"), not a
    // prohibition - deliberately not modeled as a mutex partner of
    // HLPRCD or HLPPNLGRP here, matching this codebase's own pre-existing
    // scope decision (hlprcdConflictReason's own doc comment).
    HLPDOC: {
      // DDS_Keyword_V7r6.txt, "HLPDOC (Help Document) keyword for
      // display files" section (line ~6937): "You cannot specify HLPDOC
      // with HLPBDY, HLPPNLGRP, or HLPRTN." Covers relationships 1-3
      // above; relationship 4 (HLPPNLGRP<->HLPRCD, which doesn't involve
      // HLPDOC at all) is on the HLPPNLGRP entry below instead.
      ddsReference: 'You cannot specify HLPDOC with HLPBDY, HLPPNLGRP, or HLPRTN.',
      mutex: ['HLPBDY', 'HLPPNLGRP', 'HLPRTN'],
      // The level, parameter-grammar and option-indicator facts from the same section (line
      // ~6937): "You use this file- or help-specification-level keyword", the format line
      // HLPDOC(online-help-information-text-label-name document-name folder-name) and "Option
      // indicators are valid for this keyword."
      levels: ['file', 'help'],
      parameterForm: 'HLPDOC(online-help-information-text-label-name document-name folder-name)',
      optionIndicators: 'valid'
    },
    HLPPNLGRP: {
      // DDS_Keyword_V7r6.txt, "HLPPNLGRP (Help Panel Group) keyword for
      // display files" section (line ~7099): "a display file cannot
      // contain both HLPPNLGRP and HLPRCD keywords, nor HLPPNLGRP and
      // HLPDOC keywords." The HLPDOC half is relationship 2, already
      // modeled on the HLPDOC entry above (not repeated here); this
      // entry only adds HLPRCD (relationship 4), HLPPNLGRP's other
      // stated exclusion.
      ddsReference:
        'a display file cannot contain both HLPPNLGRP and HLPRCD ' +
        'keywords, nor HLPPNLGRP and HLPDOC keywords. (This entry adds ' +
        'only the HLPRCD half - the HLPDOC half is already modeled on ' +
        'the HLPDOC entry above.)',
      mutex: ['HLPRCD']
    },

    // htmlConflictReason's own HTML_MUTUAL_EXCLUSION_KEYWORDS array, plus
    // its separate SFL record-level restriction, folded into one entry.
    // HTML's own DDS Reference section states two independent
    // restrictions: a 14-keyword field-level mutex (the SAME field,
    // unlike every RECORD_TYPES entry above which is scoped to a record)
    // and a same-record exclusion against SFL (one-directional, like
    // DSPMOD's own entry above - SFL's own section says nothing about
    // HTML). `isMutex`/`mutexKeywords` don't care what array the caller
    // checks membership against, so both restrictions fit under the
    // ordinary `mutex` shape; the new `notAllowedInRecordType` field is a
    // separate, single-value slot (not folded into `mutex` itself) so a
    // future keyword-index generator (the eventual I-40-replacing goal)
    // can tell "same field" partners apart from "same record" ones
    // without re-parsing this comment.
    HTML: {
      // DDS_Keyword_V7r6.txt, "HTML (Hypertext Markup Language) keyword
      // for display files" section (line ~7416): "The following keywords
      // are not allowed with the HTML keyword:" COLOR, DATE, DFT,
      // DSPATR, EDTCDE, EDTWRD, HLPID, MSGCON, NOCCSID, OVRATR,
      // PUTRETAIN, SYSNAME, TIME, USER - re-verified fresh, unchanged
      // from what the code already had. "The HTML keyword is not allowed
      // in a field of a subfile record" (line ~7454) - SFL's own section
      // states nothing about HTML, so this is one-directional, same
      // restraint as the DSPMOD/SFL entry above.
      ddsReference:
        'The following keywords are not allowed with the HTML keyword: ' +
        'COLOR, DATE, DFT, DSPATR, EDTCDE, EDTWRD, HLPID, MSGCON, ' +
        'NOCCSID, OVRATR, PUTRETAIN, SYSNAME, TIME, USER. ... The HTML ' +
        'keyword is not allowed in a field of a subfile record.',
      mutex: [
        'COLOR', 'DATE', 'DFT', 'DSPATR', 'EDTCDE', 'EDTWRD', 'HLPID',
        'MSGCON', 'NOCCSID', 'OVRATR', 'PUTRETAIN', 'SYSNAME', 'TIME', 'USER'
      ],
      notAllowedInRecordType: 'SFL'
    },

    // msgidExclusionConflictReason/ msgidExclusionNewConflictReason's own
    // MSGID_EXCLUDED_KEYWORDS array plus msgidSflRecordReason's separate
    // SFL exclusion, same shape as the HTML entry just above (a
    // field-level mutex list plus a one-directional "not allowed in a
    // field of this record type" restriction) - re-verified fresh against
    // DDS_Keyword_V7r6.txt's own MSGID section.
    MSGID: {
      // DDS_Keyword_V7r6.txt, "MSGID (Message Identifier) keyword for
      // display files" section (line ~8967): "The following keywords
      // cannot be specified on a field with the MSGID keyword:" DFT,
      // DFTVAL, FLTFIXDEC, FLTPCN, MSGCON - re-verified fresh, unchanged
      // from what the code already had. "You cannot specify MSGID in a
      // subfile record format (SFL keyword)" (same section) - SFL's own
      // section states nothing about MSGID, so this is one-directional,
      // same restraint as the HTML/DSPMOD entries above.
      ddsReference:
        'The following keywords cannot be specified on a field with ' +
        'the MSGID keyword: DFT, DFTVAL, FLTFIXDEC, FLTPCN, MSGCON. ' +
        '... You cannot specify MSGID in a subfile record format (SFL ' +
        'keyword).',
      mutex: ['DFT', 'DFTVAL', 'FLTFIXDEC', 'FLTPCN', 'MSGCON'],
      notAllowedInRecordType: 'SFL'
    },

    // wrdwrapKeywordHit's own WRDWRAP_KEYWORD_CONFLICTS map and
    // igcalttypKeywordHits's own IGCALTTYP_KEYWORD_CONFLICTS map, both
    // shared through the same generic `exclusionListHit` token-matching
    // engine in dspfWriter.js. A genuinely new shape from every entry
    // above: not a plain keyword NAME set (`mutex`), but a map from
    // keyword name to either null (any use of it is excluded) or an array
    // of the specific PARAMETER TOKENS that are excluded (a use with none
    // of them is fine) - e.g. AUTO(RAB) is fine on a WRDWRAP field but
    // AUTO(RAZ)/AUTO(RAB) both conflict, while CMP is excluded outright
    // regardless of its operator since every comparison operator it can
    // take is on the list. Named `conditionalMutex` to distinguish it
    // from the unconditional `mutex` shape; evaluated by the new
    // `conditionalMutexHit` accessor below, which IS the token-matching
    // engine itself now (moved out of dspfWriter.js's own
    // `exclusionListHit`, the same "evaluation logic lives beside the
    // data it evaluates" split `isMutex`/`isWhitelisted` already
    // established).
    WRDWRAP: {
      // DDS_Keyword_V7r6.txt, "WRDWRAP (Word Wrap) keyword for display
      // files" section (line ~13788): "WRDWRAP cannot be specified with
      // the following keywords: AUTO(RAZ, RAB), CHECK(MF, M10F, M11F,
      // RB, RZ, RL, RLTB), CHGINPDFT(MF), DSPATR(OID, SP), DUP,
      // FLTFIXDEC, IGCALTTYP." Re-verified fresh, unchanged from what the
      // code already had.
      ddsReference:
        'WRDWRAP cannot be specified with the following keywords: ' +
        'AUTO(RAZ, RAB), CHECK(MF, M10F, M11F, RB, RZ, RL, RLTB), ' +
        'CHGINPDFT(MF), DSPATR(OID, SP), DUP, FLTFIXDEC, IGCALTTYP. ' +
        '... Notes: ... 3. Subfiles do not support WRDWRAP.',
      conditionalMutex: {
        AUTO: ['RAZ', 'RAB'],
        CHECK: ['MF', 'M10F', 'M11F', 'RB', 'RZ', 'RL', 'RLTB'],
        CHGINPDFT: ['MF'],
        DSPATR: ['OID', 'SP'],
        DUP: null,
        FLTFIXDEC: null,
        IGCALTTYP: null
      },
      notAllowedInRecordType: 'SFL',
      // The two field-eligibility facts from the same DDS Reference section
      // (line ~13788), previously the hard-coded WRDWRAP_BLOCKED_SHIFTS
      // array and a literal I/B test in dspfWriter.js plus a second copy of
      // the nine shifts in webviewClientHelpers.js's
      // generalFieldKeywordRowMatches- DataType: "This keyword can only be
      // specified on fields that have a usage of input-only (I) or
      // input/output (B)" and "You cannot specify the WRDWRAP keyword on the
      // following keyboard shifts: Signed Numeric (S), Numeric Only (Y),
      // Digits Only (D), Numeric Only Character (M), Floating Point (F),
      // DBCS Only (J), DBCS Open (O), DBCS Either (E), Graphic (G)".
      // Re-verified fresh, unchanged from what the code had.
      allowedUsage: ['I', 'B'],
      blockedDataTypes: ['S', 'Y', 'D', 'M', 'F', 'J', 'O', 'E', 'G']
    },
    IGCALTTYP: {
      // "You specify this field-level keyword"; "This keyword has no parameters."; "Option
      // indicators are not allowed with IGCALTTYP."
      levels: ['field'],
      noParameters: true,
      optionIndicators: 'notValid',
      // DDS_Keyword_V7r6.txt, "IGCALTTYP (Alternative Data Type) keyword"
      // section (line ~14968): "The following keywords are not allowed
      // with the IGCALTTYP keyword: AUTO(RAZ), BLKFOLD, CHECK(M10 M11
      // M10F M11F RL RZ VN VNE), CMP(EQ GE GT LE LT NE NG NL), COMP(EQ GE
      // GT LE LT NE NG NL), DUP, RANGE, VALUES." Re-verified fresh,
      // unchanged from what the code already had. IGCALTTYP-vs-WRDWRAP is
      // already covered from WRDWRAP's own entry above (WRDWRAP.
      // conditionalMutex.IGCALTTYP === null) and deliberately not
      // repeated here - single source of truth for that pair, same
      // principle the HLPDOC/HLPPNLGRP slice established.
      ddsReference:
        'The following keywords are not allowed with the IGCALTTYP ' +
        'keyword: AUTO(RAZ), BLKFOLD, CHECK(M10 M11 M10F M11F RL RZ VN ' +
        'VNE), CMP(EQ GE GT LE LT NE NG NL), COMP(EQ GE GT LE LT NE NG ' +
        'NL), DUP, RANGE, VALUES.',
      conditionalMutex: {
        AUTO: ['RAZ'],
        BLKFOLD: null,
        CHECK: ['M10', 'M11', 'M10F', 'M11F', 'RL', 'RZ', 'VN', 'VNE'],
        CMP: null,
        COMP: null,
        DUP: null,
        RANGE: null,
        VALUES: null
      },
      // IGCALTTYP's own "Specify this keyword only for input- and
      // output-capable fields whose keyboard shift type is A, N, X, W, or
      // I. Do not specify this keyword for DBCS fields." (line ~14968
      // section). Previously the hard-coded IGCALTTYP_ALLOWED_SHIFTS array
      // and a literal B test in dspfWriter.js. Note the opposite polarity
      // from WRDWRAP's `blockedDataTypes`: IBM states this one as an
      // allow-list, so it is modeled as one rather than inverted into a
      // blocked list.
      allowedUsage: ['B'],
      allowedDataTypes: ['A', 'N', 'X', 'W', 'I']
    },
    // VALNUM's first entry. DDS_Keyword_V7r6.txt, "VALNUM (Validate Numeric)
    // keyword for display files" (line ~13146): "The field containing the
    // VALNUM keyword must be defined as an input-capable field with the data
    // type Y." Re-verified fresh. Until now this lived only as the
    // General-tab row filter's own 'input-capable' and 'numeric-only' scopes
    // in webviewClientHelpers.js (no writer-level guard exists - see the
    // Deferred findings table). `allowedUsage` is the same fact WRDWRAP
    // carries; `requiredDataTypes` is the strict twin of `allowedDataTypes`
    // (a blank data type does NOT satisfy it - the row stays hidden until a
    // data type is chosen, exactly as before).
    VALNUM: {
      ddsReference:
        'The field containing the VALNUM keyword must be defined as an ' +
        'input-capable field with the data type Y.',
      allowedUsage: ['I', 'B'],
      requiredDataTypes: ['Y']
    },

    // The field-level rule web spread across four existing functions:
    // pshbtnfldConflictReason, pshbtnfldNew- ConflictReason,
    // pshbtnfldRemovalConflictReason, and
    // pshbtnfldBasicEditConflictReason - each independently re-embedding
    // the same DDS-Reference-stated facts as bare arrays/literals.
    //
    // DDS_Keyword_V7r6.txt, "PSHBTNFLD (Push Button Field) keyword for
    // display files" section (line ~9670), re-verified fresh, unchanged
    // from what the code already had: "The following keywords can be
    // specified on a field with the PSHBTNFLD keyword: ALIAS, CHANGE,
    // CHCAVAIL, CHCUNAVAIL, CHCCTL, INDTXT, NOCCSID, PSHBTNCHC,
    // DSPATR(PC), TEXT." - the closed-whitelist SHAPE USRDFN/MNUBAR/SFL
    // already established, but with a wrinkle none of those needed:
    // DSPATR is listed with a required parameter, "DSPATR(PC)" - not a
    // bare keyword name the way every other entry in the table is. A
    // fixed `whitelist` array alone answers "is DSPATR one of the allowed
    // names" (yes) but not "is THIS use of DSPATR allowed" (only with
    // PC). The new `whitelistRequiredTokens` field alongside `whitelist`
    // below names the one entry that needs its parameters checked too -
    // still the same "is this keyword allowed" question `isWhitelisted`
    // already answers, just also consulting the instance's own
    // parameters (token-split the same way `conditionalMutexHit` already
    // does) for that one name.
    PSHBTNFLD: {
      // "The gutter value must be a number greater than one."
      // (DDS_Keyword_V7r6.txt ~line 9704.)
      gutterMinimum: 2,
      markerKeyword: 'PSHBTNFLD',
      ddsReference:
        'The following keywords can be specified on a field with the ' +
        'PSHBTNFLD keyword: ALIAS, CHANGE, CHCAVAIL, CHCUNAVAIL, CHCCTL, ' +
        'INDTXT, NOCCSID, PSHBTNCHC, DSPATR(PC), TEXT. A field containing ' +
        'the PSHBTNFLD keyword must also contain one or more PSHBTNCHC ' +
        'keywords defining the choices for the field. The field ' +
        'containing the PSHBTNFLD keyword must be defined as an ' +
        'input-capable field with data type Y, length equal to 2, and ' +
        'decimal positions of 0.',
      whitelist: [
        'PSHBTNFLD', 'ALIAS', 'CHANGE', 'CHCAVAIL', 'CHCUNAVAIL', 'CHCCTL',
        'INDTXT', 'NOCCSID', 'PSHBTNCHC', 'DSPATR', 'TEXT'
      ],
      whitelistRequiredTokens: {
        DSPATR: ['PC']
      },

      // "The field containing the PSHBTNFLD keyword must be defined as
      // an input-capable field with data type Y, length equal to 2, and
      // decimal positions of 0" - re-verified fresh, unchanged from what
      // the code already had (usage I or B both count as input-capable;
      // `usageDefault` is the value the pre-existing code corrects a
      // non-conforming usage TO, matching every one of IBM's own
      // examples, kept as its own fact since "B" specifically, not just
      // "any conforming value", is what a correcting rewrite should
      // produce).
      definitionRequirements: {
        dataType: 'Y',
        length: 2,
        decimalPositions: 0,
        usage: ['I', 'B'],
        usageDefault: 'B'
      }
    },

    // DUP's own DDS Reference section (line ~5490) and BLKFOLD's own
    // (line ~2392) each independently state the identical restriction,
    // re-verified fresh, unchanged from what
    // floatIncompatibleKeywordNewConflictReason already enforced for
    // both - only the "which keywords" fact itself, previously living
    // solely as each of these two one-line wrapper functions' own
    // hard-coded name, is new here.
    DUP: {
      floatDdsReference: 'You cannot specify the DUP keyword on a floating-point field (F in position 35).',
      notAllowedOnFloatingPointField: true
    },
    BLKFOLD: {
      floatDdsReference: 'You cannot specify the BLKFOLD keyword on a floating-point field (F in position 35).',
      notAllowedOnFloatingPointField: true
    },

    // chridNewConflictReason and chridBasicEditConflictReason each
    // independently re-embed the same DDS-Reference-stated facts as their
    // own local constants (CHRID_USAGE_LABELS, CHRID_NUMERIC_TEXT,
    // CHRID_DUP_TEXT).
    //
    // DDS_Keyword_V7r6.txt, CHRID's own section (line ~3848), re-verified
    // fresh, unchanged from what the code already had: "The CHRID keyword
    // is not valid on constant fields, numeric fields (fields with decimal
    // positions specified in positions 36 through 37), message fields (M
    // specified in position 38), hidden fields (H specified in position
    // 38), or program-to-system fields (P in Position 38) ... The CHRID
    // keyword cannot be specified with the DUP (Duplication) keyword."
    // A new shape - field-eligibility restrictions (which USAGE values,
    // and which other field properties, a keyword is incompatible with) -
    // distinct from every existing shape (`whitelist` is keyword-vs-
    // keyword membership; `definitionRequirements` states what a field
    // MUST be; this states what it must NOT be). `mutex: ['DUP']` reuses
    // the existing shape unchanged for the keyword-vs-keyword half.
    CHRID: {
      ddsReference:
        'The CHRID keyword is not valid on constant fields, numeric ' +
        'fields (fields with decimal positions specified in positions 36 ' +
        'through 37), message fields (M specified in position 38), ' +
        'hidden fields (H specified in position 38), or ' +
        'program-to-system fields (P in Position 38). ... The CHRID ' +
        'keyword cannot be specified with the DUP (Duplication) keyword.',
      mutex: ['DUP'],
      ineligibleUsage: {
        H: 'hidden (H)',
        M: 'message (M)',
        P: 'program-to-system (P)'
      },
      ineligibleWhenDecimalsSpecified: true,
      ineligibleOnConstant: true
    },

    // DATFMT/DATSEP (date fields, data type L) and TIMFMT/TIMSEP (time fields,
    // data type T). Each pair's own DDS Reference section re-verified fresh:
    // DATFMT (line ~4531), DATSEP (line ~4602), TIMFMT (line ~12864), TIMSEP
    // (line ~12927) - unchanged from what dateSeparatorConflictReason/
    // timeSeparatorConflictReason already had as their own hard-coded
    // FIXED_SEPARATOR_DATE_FORMATS/FIXED_SEPARATOR_TIME_FORMATS arrays.
    //
    // A shape distinct from CHRID's `mutex` (a fixed list of keyword NAMES
    // forbidden outright): here DATSEP/TIMSEP aren't forbidden by a sibling
    // keyword's mere PRESENCE, but by that sibling's own PARAMETER value being
    // one of four fixed-separator formats - `fixedSeparatorPartner` names the
    // sibling keyword to check, `fixedSeparatorFormats` the values that forbid
    // this one. The closed value sets of four display-attribute keywords, each
    // from its own DDS Reference section (DDS_Keyword_V7r6.txt: DSPATR ~line
    // 8603 region, COLOR ~4092, WDWBORDER ~10850 region, CHGINPDFT ~3080
    // region). Lists are in IBM's own order; the webview keeps its own panel
    // display order and a test ties the two together. `validValues` is the fact
    // `validValues()` / `isValidValue()` read. The three alternative-key
    // keywords' file-wide command-key exclusions. Each alt key claims one
    // command key (ALTHELP a CA key, default CA01; ALTPAGEDWN / ALTPAGEUP a CF
    // key, defaults CF08 / CF07), and its own DDS Reference section (ALTHELP
    // ~line 1884, ALTPAGEDWN/ ALTPAGEUP ~line 1970) lists the keywords that
    // "cannot be specified in a file with" it - the same list for the
    // no-parameter (default) and the explicit-parameter forms, matched on the
    // key NUMBER. `excluded` gives each listed keyword's relation to the alt
    // key's number:
    //   'any'      - listed with BOTH key types (plain CAnn / CFnn,
    //                SFLDROP / SFLENTER / SFLFOLD (CAnn | CFnn), other alt keys)
    //   'caOnly'   - the keyword's own parameter is a CA key, listed as CAnn
    //                (MNUCNL, MNUBARSW) - a clash for either alt key type
    //   'opposite' - listed only with the OPPOSITE key type (MOUBTN,
    //                PSHBTNCHC: ALTHELP's CA key vs their CFnn, the page
    //                keys' CF key vs their CAnn)
    // The page keys list each other only in the no-parameter (default)
    // rows (ALTPAGEDWN with ALTPAGEUP(CF08), ALTPAGEUP with ALTPAGEDWN(CF07));
    // it is applied to explicit parameters too, same key-number logic.
    ALTHELP: {
      ddsReference: 'The following keywords cannot be specified in a file with an ALTHELP keyword that has no parameter (CA01 default), ' +
        'or with ALTHELP(CAnn) (where nn is the same number): ALTPAGEDWN(CFnn), ALTPAGEUP(CFnn), CAnn, CFnn, MNUCNL(CAnn), MNUBARSW(CAnn), ' +
        'MOUBTN(...CFnn), PSHBTNCHC(...CFnn), SFLDROP(CAnn | CFnn), SFLENTER(CAnn | CFnn), SFLFOLD(CAnn | CFnn).',
      claimedKeyType: 'CA',
      defaultKey: 'CA01',
      excluded: [
        { keyword: 'ALTPAGEDWN', relation: 'any' }, { keyword: 'ALTPAGEUP', relation: 'any' },
        { keyword: 'CAnn', relation: 'any' }, { keyword: 'CFnn', relation: 'any' },
        { keyword: 'MNUCNL', relation: 'caOnly' }, { keyword: 'MNUBARSW', relation: 'caOnly' },
        { keyword: 'MOUBTN', relation: 'opposite' }, { keyword: 'PSHBTNCHC', relation: 'opposite' },
        { keyword: 'SFLDROP', relation: 'any' }, { keyword: 'SFLENTER', relation: 'any' }, { keyword: 'SFLFOLD', relation: 'any' }
      ]
    },
    ALTPAGEDWN: {
      ddsReference: 'The following keywords cannot be specified in a file with an ALTPAGEDWN keyword that has no parameter (CF08 default), ' +
        'or with ALTPAGEDWN(CFnn) (where nn is the same number): ALTHELP(CAnn), ALTPAGEUP(CFnn), CAnn, CFnn, MNUCNL(CAnn), MNUBARSW(CAnn), ' +
        'MOUBTN(...CAnn), PSHBTNCHC(...CAnn), SFLDROP(CAnn | CFnn), SFLENTER(CAnn | CFnn), SFLFOLD(CAnn | CFnn).',
      claimedKeyType: 'CF',
      defaultKey: 'CF08',
      // ALTPAGEDWN / ALTPAGEUP's shared section (~line 1945): \"You use these file-level keywords\"
      // and the format lines ALTPAGEDWN[(CFnn)] / ALTPAGEUP[(CFnn)]. The section states no
      // option-indicator fact for the keywords themselves (it says PAGEDOWN / PAGEUP's indicators
      // apply to them), so none is added.
      levels: ['file'],
      parameterForm: 'ALTPAGEDWN[(CFnn)]',
      excluded: [
        { keyword: 'ALTHELP', relation: 'any' }, { keyword: 'ALTPAGEUP', relation: 'any' },
        { keyword: 'CAnn', relation: 'any' }, { keyword: 'CFnn', relation: 'any' },
        { keyword: 'MNUCNL', relation: 'caOnly' }, { keyword: 'MNUBARSW', relation: 'caOnly' },
        { keyword: 'MOUBTN', relation: 'opposite' }, { keyword: 'PSHBTNCHC', relation: 'opposite' },
        { keyword: 'SFLDROP', relation: 'any' }, { keyword: 'SFLENTER', relation: 'any' }, { keyword: 'SFLFOLD', relation: 'any' }
      ]
    },
    ALTPAGEUP: {
      ddsReference: 'The following keywords cannot be specified in a file with an ALTPAGEUP keyword that has no parameter (CF07 default), ' +
        'or with ALTPAGEUP(CFnn) (where nn is the same number): ALTHELP(CAnn), ALTPAGEDWN(CFnn), CAnn, CFnn, MNUCNL(CAnn), MNUBARSW(CAnn), ' +
        'MOUBTN(...CAnn), PSHBTNCHC(...CAnn), SFLDROP(CAnn | CFnn), SFLENTER(CAnn | CFnn), SFLFOLD(CAnn | CFnn).',
      claimedKeyType: 'CF',
      defaultKey: 'CF07',
      // See ALTPAGEDWN (the two share one section).
      levels: ['file'],
      parameterForm: 'ALTPAGEUP[(CFnn)]',
      excluded: [
        { keyword: 'ALTHELP', relation: 'any' }, { keyword: 'ALTPAGEDWN', relation: 'any' },
        { keyword: 'CAnn', relation: 'any' }, { keyword: 'CFnn', relation: 'any' },
        { keyword: 'MNUCNL', relation: 'caOnly' }, { keyword: 'MNUBARSW', relation: 'caOnly' },
        { keyword: 'MOUBTN', relation: 'opposite' }, { keyword: 'PSHBTNCHC', relation: 'opposite' },
        { keyword: 'SFLDROP', relation: 'any' }, { keyword: 'SFLENTER', relation: 'any' }, { keyword: 'SFLFOLD', relation: 'any' }
      ]
    },

    // MOUBTN(EVENT [TRAILING-EVENT] {Command key | EVENT-ID} [*QUEUE |
    // *NOQUEUE]), from its own DDS Reference section (DDS_Keyword_V7r6.txt,
    // ~line 8729). `validValues` is the EVENT / TRAILING-EVENT domain (the
    // two share it), in IBM's order: unshifted then shifted,
    // left/middle/right, each Pressed / Released / Double click.
    MOUBTN: {
      ddsReference: 'MOUBTN(EVENT [TRAILING-EVENT] {Command key | EVENT-ID} [*QUEUE | *NOQUEUE]). ' +
        'EVENT and TRAILING-EVENT take *ULP *ULR *ULD *UMP *UMR *UMD *URP *URR *URD *SLP *SLR *SLD *SMP *SMR *SMD *SRP *SRR *SRD. ' +
        'Command key: CA01-CA24, CF01-CF24, ENTER, ROLLUP, ROLLDOWN, HELP, HOME, PRINT, CLEAR; EVENT-ID: E00-E15. ' +
        'QUEUE parameter default is *NOQUEUE.',
      validValues: ['*ULP', '*ULR', '*ULD', '*UMP', '*UMR', '*UMD', '*URP', '*URR', '*URD',
        '*SLP', '*SLR', '*SLD', '*SMP', '*SMR', '*SMD', '*SRP', '*SRR', '*SRD'],
      commandKeyNames: ['ENTER', 'ROLLUP', 'ROLLDOWN', 'HELP', 'HOME', 'PRINT', 'CLEAR'],
      commandKeyRanges: [{ prefix: 'CA', min: 1, max: 24 }, { prefix: 'CF', min: 1, max: 24 }],
      eventIdRange: { prefix: 'E', min: 0, max: 15 },
      queueValues: ['*QUEUE', '*NOQUEUE'],
      queueDefault: '*NOQUEUE',
      // The MOUBTN section's exclusion table ("The following keywords cannot
      // be specified when the listed Command key has been used on the MOUBTN
      // keyword": CFxx excludes ALTHELP(CAyy) and CAxx; CAxx excludes
      // ALTPAGEDWN(CFyy), ALTPAGEUP(CFyy) and CFxx; xx = yy; and CF01 / CA07
      // / CA08 exclude the alt keys written without a parameter). Every row
      // is the same rule: a MOUBTN Command key of one type (CA or CF) and a
      // partner claiming the SAME number as the OPPOSITE type. `partners`
      // names the alt keys and the type + default key each one claims (the
      // alt-key sections give the defaults: ALTHELP CA01, ALTPAGEDWN CF08,
      // ALTPAGEUP CF07); `plainKeyTypes` are the ordinary CAnn / CFnn
      // keywords, which claim their own type and number. Same-type pairs
      // (MOUBTN(CF08) with ALTPAGEDWN(CF08)) are not in the table and stay
      // allowed.
      commandKeyExclusion: {
        rule: 'oppositeTypeSameNumber',
        partners: [
          { keyword: 'ALTHELP', keyType: 'CA', defaultKey: 'CA01' },
          { keyword: 'ALTPAGEDWN', keyType: 'CF', defaultKey: 'CF08' },
          { keyword: 'ALTPAGEUP', keyType: 'CF', defaultKey: 'CF07' }
        ],
        plainKeyTypes: ['CA', 'CF'],
        ddsReference: 'MOUBTN Command key CFxx cannot be combined with ALTHELP(CAyy) or CAxx, and CAxx cannot be combined ' +
          'with ALTPAGEDWN(CFyy), ALTPAGEUP(CFyy) or CFxx, where xx = yy; CF01, CA07 and CA08 cannot be combined with ' +
          'ALTHELP, ALTPAGEUP and ALTPAGEDWN written with no parameter.'
      }
    },
    DSPATR: {
      ddsReference: 'Valid attributes for the first format of the DSPATR keyword. ' +
        'For all fields: BL, CS, HI, ND, PC, RI, UL. For input-capable fields only: MDT, OID, PR, SP.',
      validValues: ['BL', 'CS', 'HI', 'ND', 'PC', 'RI', 'UL', 'MDT', 'OID', 'PR', 'SP'],
      inputCapableOnlyValues: ['MDT', 'OID', 'PR', 'SP']
    },
    COLOR: {
      // "This field-level keyword specifies the color of a field"; "Option indicators are valid for
      // this keyword."
      levels: ['field'],
      optionIndicators: 'valid',
      ddsReference: 'COLOR(GRN | WHT | RED | TRQ | YLW | PNK | BLU): the valid parameter values are GRN, WHT, RED, TRQ, YLW, PNK and BLU.',
      validValues: ['GRN', 'WHT', 'RED', 'TRQ', 'YLW', 'PNK', 'BLU']
    },
    WDWBORDER: {
      ddsReference: 'WDWBORDER([color] [display-attribute] [characters]): the color parameter takes the COLOR values ' +
        '(default BLU); the display-attribute values are BL, CS, HI, ND, RI, UL.',
      displayAttributeValues: ['BL', 'CS', 'HI', 'ND', 'RI', 'UL'],
      colorValuesFrom: 'COLOR',
      // The rules the same section states and nothing enforced (line ~13293): "At least one
      // parameter must be specified.", the color parameter's own value list (BLU, GRN, WHT, RED,
      // TRQ, YLW, PNK; WDWBORDER takes the seven colours, not the whole COLOR keyword list) and "If
      // the WDWBORDER keyword is specified at the record level, the WINDOW or PULLDOWN keyword must
      // also be specified on the same record." (one of the two, hence `requiresOneOfOnRecord`).
      minParameters: 1,
      colorValues: ['BLU', 'GRN', 'WHT', 'RED', 'TRQ', 'YLW', 'PNK'],
      requiresOneOfOnRecord: ['WINDOW', 'PULLDOWN'],
      // WDWBORDER's section (line ~13293): "You use this file-level or record-level keyword", the
      // format line WDWBORDER([color] [display-attribute] [characters]) and "Option indicators
      // are valid for this keyword." ("At least one parameter must be specified" is an
      // enforcement rule, I-182, not stated here.)
      levels: ['file', 'record'],
      parameterForm: 'WDWBORDER([color] [display-attribute] [characters])',
      optionIndicators: 'valid'
    },
    CHGINPDFT: {
      ddsReference: 'CHGINPDFT[(input-default1 input-default2 . . .)]: valid parameter values are BL, CS, HI, RI, UL ' +
        '(the equivalent DSPATR keywords) and FE, LC, ME, MF (the equivalent CHECK codes).',
      validValues: ['BL', 'CS', 'HI', 'RI', 'UL', 'FE', 'LC', 'ME', 'MF'],
      dspatrValues: ['BL', 'CS', 'HI', 'RI', 'UL'],
      checkCodes: ['FE', 'LC', 'ME', 'MF']
    },

    DATFMT: {
      ddsReference:
        'You use this field-level keyword to specify the format of a ' +
        'date field. This keyword is valid only for date fields (data ' +
        'type L).',
      validDataType: 'L',
      // The format table in DATFMT's own DDS Reference section, in
      // IBM's order. No value is "unspecified": that is a UI state, not
      // a DDS value.
      validValues: ['*JOB', '*MDY', '*DMY', '*YMD', '*JUL', '*ISO', '*USA', '*EUR', '*JIS'],
      valuesDdsReference: 'Valid date formats: *JOB, *MDY, *DMY, *YMD, *JUL, *ISO, *USA, *EUR, *JIS.',
      // The "Field length" column of the same format table, plus the two
      // sentences that complete it: "If you do not specify the DATFMT
      // keyword, the default is *ISO", and for *JOB "There are always 10
      // spaces reserved on the display screen for a Date field with
      // DATFMT(*JOB), even though 8 characters in the case of *MDY, *DMY,
      // and *YMD, or 6 characters in the case of *JUL are displayed." (*JOB
      // has no length of its own in the table; 10 comes from that
      // sentence.) Previously the engine's own DATFMT_LENGTHS literal.
      displayLengths: {
        '*MDY': 8, '*DMY': 8, '*YMD': 8, '*JUL': 6,
        '*ISO': 10, '*USA': 10, '*EUR': 10, '*JIS': 10, '*JOB': 10
      },
      defaultFormat: '*ISO',
      displayLengthDdsReference:
        'The Field length column of the DATFMT format table (*MDY/*DMY/*YMD ' +
        '8, *JUL 6, *ISO/*USA/*EUR/*JIS 10); *JOB always reserves 10 ' +
        'positions on the display; with no DATFMT the default is *ISO.'
    },
    DATSEP: {
      ddsReference:
        'You use this field-level keyword to specify the separator ' +
        'character for a date field. This keyword is valid only for ' +
        'date fields (data type L). If you specify the *ISO, *USA, ' +
        '*EUR, or *JIS date format value for the DATFMT keyword, you ' +
        'should not specify the DATSEP keyword. These formats have ' +
        'fixed date separators.',
      validDataType: 'L',
      fixedSeparatorPartner: 'DATFMT',
      fixedSeparatorFormats: ['*ISO', '*USA', '*EUR', '*JIS'],
      // DATSEP(*JOB | 'date-separator'): slash, dash, period, comma or blank.
      validValues: ['*JOB', '/', '-', '.', ',', ' '],
      valuesDdsReference: 'DATSEP(*JOB | \'date-separator\'): valid separators are a slash (/), dash, period (.), comma (,) or blank.'
    },
    TIMFMT: {
      ddsReference:
        'You use this field-level keyword to specify the format of a ' +
        'time field. This keyword is valid for time fields (data type ' +
        'T).',
      validDataType: 'T',
      // TIMFMT has no *JOB value - its format table lists only these five.
      validValues: ['*HMS', '*ISO', '*USA', '*EUR', '*JIS'],
      valuesDdsReference: 'Valid time formats: *HMS, *ISO, *USA, *EUR, *JIS (no *JOB).',
      // Every row of TIMFMT's own format table lists a Field length of 8,
      // and the default (no TIMFMT) is *ISO, also 8. Previously the
      // engine's bare `return 8`.
      displayLength: 8,
      displayLengthDdsReference:
        'The Field length column of the TIMFMT format table is 8 for every ' +
        'format (*HMS, *ISO, *USA, *EUR, *JIS); with no TIMFMT the default ' +
        'is *ISO.'
    },
    TIMSEP: {
      ddsReference:
        'You use this field-level keyword to specify the separator ' +
        'character used for a time field. This keyword is valid only ' +
        'for time fields (data type T). If you specify the *ISO, *USA, ' +
        '*EUR, or *JIS time-format values for the TIMFMT keyword, you ' +
        'should not specify the TIMSEP keyword. These formats have ' +
        'fixed separators.',
      validDataType: 'T',
      fixedSeparatorPartner: 'TIMFMT',
      fixedSeparatorFormats: ['*ISO', '*USA', '*EUR', '*JIS'],
      // TIMSEP(*JOB | 'time-separator'): colon, period, comma or blank (no slash).
      validValues: ['*JOB', ':', '.', ',', ' '],
      valuesDdsReference: 'TIMSEP(*JOB | \'time-separator\'): valid separators are a colon (:), period (.), comma (,) or blank.'
    },

    // SFLCHCCTL's own DDS Reference section (line ~10566) states four independent
    // rules, previously spread across sflchcctlDefinitionUpdates and
    // sflchcctlFieldConflictReason (the first-field/one-per-record pair, plus the
    // SFLNXTCHG cross-check folded in later), each re-embedding the same facts as
    // its own hard-coded literals - sflchcctlReorderConflictReason and
    // sflNxtchgSflchcctlConflictReason/ sflctlNxtchgSflchcctlConflictReason read
    // the first-field and SFLNXTCHG facts too, from the other direction.
    //
    // Re-verified fresh against DDS_Keyword_V7r6.txt, unchanged from what the
    // code already had: "When the SFLCHCCTL keyword is specified on a field, that
    // field will be considered the control field for that record. That field must
    // be the first field defined in the subfile record. That field must have a
    // length of 1, data type of Y, decimal positions of zero, and have a usage of
    // H... SFLNXTCHC keyword cannot be specified in a record that contains a
    // field with the SFLCHCCTL keyword. Only one SFLCHCCTL keyword can be used in
    // one subfile record." ("SFLNXTCHC" is the single-dropped-letter SFLNXTCHG
    // typo the doc comment already identified - the DDS Reference spells
    // SFLNXTCHG correctly 15 other times in the same document.)
    //
    // `definitionRequirements` reuses PSHBTNFLD's own shape unchanged - a
    // single-value `usage: ['H']` array is exactly as well-formed a case
    // of "the allowed usage values" as PSHBTNFLD's two-value ['I', 'B'].
    // `mustBeFirstField` and `onePerRecord` are two genuinely new shapes -
    // no prior RECORD_TYPES entry needed either fact - each a plain
    // boolean flag, consulted by name so a future keyword needing the
    // same rule (SFLSCROLL's own "only one per record" restriction,
    // enforced today only as sflScrollFieldConflictReason's own inline
    // siblingFieldsKeywords check, is a candidate - not migrated here,
    // outside this slice's scope, logged in the Deferred findings table).
    // `mutex: ['SFLNXTCHG']` reuses the DSPMOD/SFL shape - a one-
    // directional-in-the-DDS-Reference's-own-wording pair (SFLCHCCTL's own
    // section states the restriction; SFLNXTCHG's own section, modeled
    // separately above, states only its own SFLMSGRCD exclusion) modeled
    // as an ordinary mutex entry, read from both directions in
    // dspfWriter.js exactly as DSPMOD/SFL already is.
    SFLCHCCTL: {
      // Field level, format SFLCHCCTL (no parameters), option indicators not valid, and the
      // control-value table the section prints (shared with CHCCTL).
      levels: ['field'],
      parameters: 'none',
      parameterGrammar: 'SFLCHCCTL',
      optionIndicators: 'notValid',
      controlValues: CHOICE_CONTROL_VALUES,
      cursorRestrictionsNeedEnhancedInterfaceController: true,
      ddsReference:
        'When the SFLCHCCTL keyword is specified on a field, that field ' +
        'will be considered the control field for that record. That ' +
        'field must be the first field defined in the subfile record. ' +
        'That field must have a length of 1, data type of Y, decimal ' +
        'positions of zero, and have a usage of H. ... SFLNXTCHC keyword ' +
        'cannot be specified in a record that contains a field with the ' +
        'SFLCHCCTL keyword. Only one SFLCHCCTL keyword can be used in ' +
        'one subfile record.',
      definitionRequirements: {
        dataType: 'Y',
        length: 1,
        decimalPositions: 0,
        usage: ['H'],
        usageDefault: 'H'
      },
      mustBeFirstField: true,
      onePerRecord: true,
      mutex: ['SFLNXTCHG']
    },

    // RANGE's own DDS Reference section (line ~10007), COMP's own (line
    // ~4381), and VALUES' own (line ~13201) each independently state
    // the identical restriction as DUP/BLKFOLD above - all three are
    // field-level-only keywords (per their own sections), and each is a
    // plain named keyword occurrence (per getValidityCheckInstances'
    // own doc comment: mutually exclusive alternative keyword NAMES,
    // not two keywords paired into one state), so
    // floatIncompatibleKeywordNewConflictReason applies to them
    // unchanged - see rangeFloatNewConflictReason/
    // compFloatNewConflictReason/valuesFloatNewConflictReason in
    // dspfWriter.js.
    RANGE: {
      floatDdsReference: 'You cannot specify RANGE on a floating-point field (F in position 35).',
      notAllowedOnFloatingPointField: true
    },
    COMP: {
      floatDdsReference: 'You cannot specify the COMP keyword on a floating-point field (F in position 35).',
      notAllowedOnFloatingPointField: true
    },
    VALUES: {
      floatDdsReference: 'You cannot specify VALUES on a floating-point field (F in position 35).',
      notAllowedOnFloatingPointField: true
    },

    // dftGroupConflictReason (L81/L82) blocked its four group members on a
    // floating-point field with a literal `dataType === 'F'` test. DFT's
    // and DFTVAL's own DDS Reference sections state it outright,
    // re-verified fresh: DFT (line ~4688) "The DFT keyword is not valid on
    // floating point fields.", DFTVAL (line ~4762) "You cannot specify the
    // DFTVAL keyword on the same field with a DFT, EDTCDE (Edit Code), or
    // EDTWRD (Edit Word) keyword, or on a floating-point field." EDTCDE and
    // EDTWRD get the same flag on the strength of their own eligibility
    // sentences (EDTCDE line ~5600: "valid only for fields with Y or blank
    // in position 35"; EDTWRD line ~5933: "valid for numeric only fields (Y
    // specified in position 35)") - F is neither, which is what the
    // group-wide float clause was already enforcing. Their OTHER data types
    // (e.g. A, P) fall outside those sentences too but are not enforced
    // anywhere - logged as a finding, not folded into this slice.
    DFT: {
      floatDdsReference: 'The DFT keyword is not valid on floating point fields.',
      notAllowedOnFloatingPointField: true,
      // DFT's own page (line ~4683, re-verified fresh): "For output-only and
      // input/output fields, you must also specify PUTOVR at the record
      // level and OVRDTA at the field level with the DFT keyword." A
      // cross-LEVEL companion rule (one record-level and one field-level
      // keyword) on the usages that can output; surfaced as an advisory note
      // (L83), never a hard block.
      outputRequirement: {
        usages: ['O', 'B'],
        recordKeyword: 'PUTOVR',
        fieldKeyword: 'OVRDTA',
        ddsReference: 'For output-only and input/output fields, you must also specify PUTOVR at the record level and OVRDTA at the field level with the DFT keyword.'
      }
    },
    DFTVAL: {
      floatDdsReference: 'You cannot specify the DFTVAL keyword on the same field with a DFT, EDTCDE (Edit Code), or EDTWRD (Edit Word) keyword, or on a floating-point field.',
      notAllowedOnFloatingPointField: true
    },
    EDTWRD: {
      floatDdsReference: 'The EDTWRD keyword is valid for numeric only fields (Y specified in position 35).',
      notAllowedOnFloatingPointField: true,
      // As EDTCDE above: Y, with a blank data type passing (a blank
      // position 35 plus decimal positions plus an editing keyword is Y by
      // the DDS default rules).
      allowedDataTypes: ['Y']
    },

    // Task I-121 (CHECK(AB) floating-point slice) - CHECK's own DDS
    // Reference section states "You cannot specify the CHECK(AB) keyword
    // on a floating-point field (F in position 35)". Unlike DUP/BLKFOLD/
    // RANGE/COMP/VALUES that is a fact about ONE CODE among CHECK's many,
    // not the whole keyword (CHECK(ME), CHECK(MF) etc. are fine on F), so
    // it gets its own token-qualified field, `notAllowedOnFloatingPointCodes`,
    // and deliberately NOT `notAllowedOnFloatingPointField` (which would
    // flag every CHECK). See floatIncompatibleCheckCodes / dspfWriter.js's
    // checkAbFloatIncompatibleNewConflictReason.
    CHECK: {
      // CHECK's own section: "Use CHECK at the field level to specify that the IBM i operating
      // system or the device is to check the validity of the data" (validity checking and the other
      // codes), and for the AB code "Use this code at the file level, record level, or field
      // level". The levels are the union; the per-code level is the AB row's.
      levels: ['file', 'record', 'field'],
      floatDdsReference: 'You cannot specify the CHECK(AB) keyword on a floating-point field (F in position 35). ' +
        'You cannot specify the CHECK(M10), CHECK(M10F), CHECK(M11), and CHECK(M11F) keywords on a floating-point field (F in position 35).',
      notAllowedOnFloatingPointCodes: ['AB', 'M10', 'M10F', 'M11', 'M11F'],
      // The full set of codes CHECK's own DDS Reference section lists, by
      // the function IBM groups them under. The two-panel split the editor
      // uses (Keying options vs Validity check) is a presentation choice
      // and is not modelled here; RLTB is in the reference's
      // cursor-control list.
      codeGroups: {
        validity: ['AB', 'ME', 'MF', 'M10', 'M10F', 'M11', 'M11F', 'VN', 'VNE'],
        keyboard: ['ER', 'FE', 'LC', 'RB', 'RZ'],
        cursor: ['RL', 'RLTB']
      },
      codesDdsReference: 'Validity checking: AB, ME, MF, M10, M10F, M11, M11F, VN, VNE. ' +
        'Keyboard control: ER, FE, LC, RB, RZ. Cursor control: RL, RLTB.'
    },

    CHKMSGID: {
      ddsReference:
        'CHKMSGID is allowed only on fields which also contain a ' +
        'CHECK(M10), CHECK(M11), CHECK(VN), CHECK(VNE), CMP, COMP, ' +
        'RANGE, or VALUES keyword. The field must be input-capable ' +
        '(usage B or I).',
      qualifyingNames: ['CMP', 'COMP', 'RANGE', 'VALUES'],
      qualifyingCheckKeyword: 'CHECK',
      qualifyingCheckCodes: ['M10', 'M11', 'VN', 'VNE'],
      qualifyingListText: 'CHECK(M10), CHECK(M11), CHECK(VN), CHECK(VNE), CMP, COMP, RANGE, or VALUES',
      definitionRequirements: {
        usage: ['I', 'B']
      },
      msgDataField: MSG_DATA_FIELD_RULE
    },

    SFLLIN: {
      crossRecordExclusion: SFLLIN_SFLCSRPRG_RULE
    },
    SFLCSRPRG: {
      // SFLCSRPRG's section (line ~10663): "You use this field-level keyword", "This keyword has
      // no parameters." and "Option indicators are not valid for this keyword."
      levels: ['field'],
      parameters: 'none',
      optionIndicators: 'notValid',
      crossRecordExclusion: SFLLIN_SFLCSRPRG_RULE
    },

    // SFLRTNSEL's own DDS Reference section (re-verified fresh against
    // DDS_Keyword_V7r6.txt, unchanged from what the code already had)
    // states "If this keyword is specified then SFLMLTCHC or SFLSNGCHC
    // must be specified." - the CHKMSGID dependency-on-qualifying-keywords
    // shape (`qualifyingNames`), reused unchanged with no CHECK-code
    // variant. Previously the two names were hard-coded in
    // sflrtnselNewConflictReason.
    SFLRTNSEL: {
      // SFLRTNSEL's section (line ~12273): "You use this record-level keyword on a
      // selection-list subfile control record", "This keyword has no parameters." and "Option
      // indicators are not valid for this keyword."
      levels: ['record'],
      parameters: 'none',
      optionIndicators: 'notValid',
      ddsReference:
        'If this keyword is specified then SFLMLTCHC or SFLSNGCHC must be specified.',
      qualifyingNames: SFL_CHOICE_KEYWORDS_LIST.slice(),
      qualifyingListText: 'SFLSNGCHC or SFLMLTCHC'
    },

    // SFLMLTCHC's own DDS Reference section (line ~11398) and SFLSNGCHC's
    // (line ~12500), re-verified fresh against DDS_Keyword_V7r6.txt, each
    // state: "The following subfile control record keywords cannot be
    // specified on a record with the [SFLMLTCHC | SFLSNGCHC] keyword:
    // SFLDROP, SFLFOLD, [the other choice keyword]". A plain record-level
    // mutex - the existing `mutex` shape reused unchanged. Each section
    // states it from its own side, so each keyword gets its own entry (as
    // with every other one-directional mutex entry); order matches the
    // order the guard reports in.
    SFLSNGCHC: {
      // Record level, optional parameters in any order, option indicators not valid ("Option
      // indicators are not valid for this keyword." - SFLSNGCHC section, after the CHCAVAIL /
      // CHCSLT / CHCUNAVAIL paragraph).
      levels: ['record'],
      parameters: 'optional',
      parameterGrammar: 'SFLSNGCHC[([*NORSTCSR | *RSTCSR] [*NOSLTIND | *SLTIND] [*NOAUTOSLT | *AUTOSLT | *AUTOSLTENH])]',
      optionIndicators: 'notValid',
      ddsReference:
        'The following subfile control record keywords cannot be specified ' +
        'on a record with the SFLSNGCHC keyword: SFLDROP, SFLFOLD, SFLMLTCHC.',
      mutex: ['SFLMLTCHC', 'SFLDROP', 'SFLFOLD'],
      // The subfile shape and the record it is valid on, each from the section.
      controlRecordOnly: {
        ddsReference: 'This optional keyword is valid only for the subfile-control record format.'
      },
      subfileShape: {
        outputFields: 1, inputCapableFields: false, hiddenFields: 'allowed',
        ddsReference:
          'A subfile containing the SFLSNGCHC keyword must: Contain only one output field; ' +
          'Cannot contain input capable fields; Can contain hidden fields.'
      }
    },
    SFLMLTCHC: {
      // Record level, optional parameters in any order, option indicators not valid.
      levels: ['record'],
      parameters: 'optional',
      parameterGrammar: 'SFLMLTCHC[(&number-selected] [*NORSTCSR | *RSTCSR] [*NOSLTIND | *SLTIND])]',
      optionIndicators: 'notValid',
      ddsReference:
        'The following subfile control record keywords cannot be specified ' +
        'on a record with the SFLMLTCHC keyword: SFLDROP, SFLFOLD, SFLSNGCHC.',
      mutex: ['SFLSNGCHC', 'SFLDROP', 'SFLFOLD'],
      // As SFLSNGCHC (the section says "Might contain hidden fields"), plus the
      // &number-selected parameter's field shape.
      controlRecordOnly: {
        ddsReference: 'This optional keyword is valid only for the subfile-control record format.'
      },
      subfileShape: {
        outputFields: 1, inputCapableFields: false, hiddenFields: 'allowed',
        ddsReference:
          'A subfile containing the SFLMLTCHC keyword must: Contain only one output field; ' +
          'Cannot contain input capable fields; Might contain hidden fields.'
      },
      numberSelectedField: {
        dataType: 'Y', length: 4, decimalPositions: 0, usage: 'H',
        ddsReference:
          'The &number-selected parameter allows the application to find the number of items that were selected ' +
          'in the multiple-selection list. This parameter must name a hidden field with a length of 4, data type ' +
          'of Y, and zero decimal positions.'
      }
    },

    // ERRMSGID's and SFLMSGID's own optional `&msg-data` parameter states
    // the SAME rule as CHKMSGID's `&message-data-field` (see
    // MSG_DATA_FIELD_RULE above). Their other rules (MSGID's mutual
    // exclusions, SFLMSGID's record-level shape) are separate,
    // already-migrated or out-of-scope facts and are not part of these
    // entries.
    ERRMSGID: {
      // Same section as ERRMSG: "You can use one of these field-level keywords"; "Option indicators
      // are valid for these keywords."
      levels: ['field'],
      optionIndicators: 'valid',
      msgDataField: MSG_DATA_FIELD_RULE
    },
    SFLMSGID: {
      // Same section as SFLMSG: "You use these record-level keywords on the subfile-control record
      // format".
      levels: ['record'],
      msgDataField: MSG_DATA_FIELD_RULE
    },

    // The deferred finding the SFLCHCCTL slice itself raised: SFLSCROLL's
    // own DDS Reference section (line ~12311) states the identical
    // one-per-record shape SFLCHCCTL's onePerRecord fact already models,
    // plus a same-field mutex, previously living only as
    // sflScrollFieldConflictReason's own inline literals.
    //
    // Re-verified fresh against DDS_Keyword_V7r6.txt, unchanged from
    // what the code already had: "You cannot specify the SFLROLVAL, the
    // SFLSCROLL and the SFLRCDNBR keywords for the same field. Only one
    // SFLSCROLL keyword is allowed in the subfile control record."
    // `mutex: ['SFLROLVAL', 'SFLRCDNBR']` reuses the plain same-field
    // mutex shape CHRID's own DUP entry already established; `onePerRecord`
    // reuses SFLCHCCTL's shape unchanged.
    //
    // The two further rules in the same DDS Reference section, previously
    // unenforced anywhere (logged as deferred findings by this slice, then
    // opened as their own tasks), now enforced and stated here:
    //  - `definitionRequirements`: "This field must have the
    //    keyboard shift attribute of signed numeric with zero decimal
    //    positions. It has to be 5 digits in length, and it must be
    //    defined as a hidden field." Same shape as SFLCHCCTL's own
    //    definitionRequirements, plus `dataTypeBlankWithDecimals`: a
    //    blank data type with decimal positions specified IS signed
    //    numeric in DDS (the default), so it satisfies the rule as-is.
    //  - `notAllowedWhenEqual`: "SFLSCROLL is not allowed when
    //    SFLSIZ equals SFLPAG." A new shape - a restriction on two OTHER
    //    record-level keywords' parameter values, not on the SFLSCROLL
    //    field itself; see KeywordSpec.notAllowedWhenEqual.
    SFLSCROLL: {
      ddsReference:
        'You cannot specify the SFLROLVAL, the SFLSCROLL and the ' +
        'SFLRCDNBR keywords for the same field. Only one SFLSCROLL ' +
        'keyword is allowed in the subfile control record.',
      mutex: ['SFLROLVAL', 'SFLRCDNBR'],
      onePerRecord: true,
      definitionRequirements: {
        dataType: 'S',
        dataTypeBlankWithDecimals: true,
        length: 5,
        decimalPositions: 0,
        usage: ['H'],
        usageDefault: 'H',
        ddsReference:
          'This field must have the keyboard shift attribute of signed ' +
          'numeric with zero decimal positions. It has to be 5 digits in ' +
          'length, and it must be defined as a hidden field.'
      },
      notAllowedWhenEqual: {
        keywords: ['SFLSIZ', 'SFLPAG'],
        ddsReference: 'SFLSCROLL is not allowed when SFLSIZ equals SFLPAG.'
      },
      // See SFLRCDNBR / SFLROLVAL just below.
      validOnlyInSubfileControlRecord: {
        ddsReference: 'This keyword is valid only for the subfile-control record format.'
      }
    },

    // SFLRCDNBR's and SFLROLVAL's own DDS Reference sections (lines ~12062
    // and ~12173, re-read fresh alongside SFLSCROLL's, line ~12311) each
    // state the same field-level restriction SFLSCROLL does: "This
    // [optional] keyword is valid only for the subfile-control record
    // format." A new shape (`validOnlyInSubfileControlRecord`): a
    // field-level keyword restricted to fields of ONE record kind - the
    // subfile-control record (the one carrying SFLCTL) - so it is refused on
    // a field of an SFL detail record or of a plain record. These two
    // entries carry only that fact; their same-field mutex with SFLSCROLL
    // stays stated once, on SFLSCROLL's entry.
    //
    // The three further rules in SFLRCDNBR's own section, previously
    // unenforced anywhere (opened from I-122d), now stated here:
    //  - `mutex` (SFLROLVAL): "You cannot specify both SFLRCDNBR and
    //    SFLROLVAL for the same field." The same-field shape SFLSCROLL's
    //    entry already uses (SFLSCROLL's own two stay on its entry).
    //  - `parameterWords`: the format is SFLRCDNBR[([CURSOR] [*TOP])], so
    //    the parameter text holds at most CURSOR and *TOP, each once.
    //  - `definitionRequirements`: "This field must be a zoned decimal
    //    field with zero decimal positions. It must have the keyboard shift
    //    attribute of signed numeric (S in position 35), and it can be up
    //    to 4 digits in length. It must be defined as an output-only, an
    //    input/output, or a hidden field." SFLSCROLL's shape with a length
    //    RANGE (`lengthMin`..`lengthMax`, no exact `length`) and three
    //    usages (O, B, H); `usageDefault` H is what enabling the keyword
    //    rewrites a wrong usage to (IBM's example is `F2 4S 0H`).
    SFLRCDNBR: {
      // SFLRCDNBR's section (line ~12062): "You use this field-level keyword on the
      // subfile-control record format" and "Option indicators are not valid for this keyword." Its
      // parameter grammar SFLRCDNBR[([CURSOR] [*TOP])] is I-177's, so no `parameters` fact here.
      levels: ['field'],
      optionIndicators: 'notValid',
      mutex: ['SFLROLVAL'],
      parameterWords: {
        allowed: ['CURSOR', '*TOP'],
        eachAtMostOnce: true,
        ddsReference: 'SFLRCDNBR[([CURSOR] [*TOP])]'
      },
      definitionRequirements: {
        dataType: 'S',
        dataTypeBlankWithDecimals: true,
        lengthMin: 1,
        lengthMax: 4,
        decimalPositions: 0,
        usage: ['O', 'B', 'H'],
        usageDefault: 'H',
        ddsReference:
          'This field must be a zoned decimal field with zero decimal positions. ' +
          'It must have the keyboard shift attribute of signed numeric (S in position 35), ' +
          'and it can be up to 4 digits in length. It must be defined as an output-only, ' +
          'an input/output, or a hidden field.'
      },
      validOnlyInSubfileControlRecord: {
        ddsReference: 'This optional keyword is valid only for the subfile-control record format.'
      }
    },
    SFLROLVAL: {
      // SFLROLVAL's section (line ~12173): "You use this field-level keyword in the subfile-control
      // record format", "This keyword has no parameters." and "Option indicators are not valid for
      // this keyword."
      levels: ['field'],
      parameters: 'none',
      optionIndicators: 'notValid',
      validOnlyInSubfileControlRecord: {
        ddsReference: 'This keyword is valid only for the subfile-control record format.'
      }
    },

    // SFLSIZ's own DDS Reference section (line ~12367), re-verified fresh
    // against DDS_Keyword_V7r6.txt, unchanged from what already enforced:
    // "You cannot use display size condition names for this keyword when a
    // program-to-system field is used as a parameter for it." A new shape
    // (`sizeConditionedValueMustBeNumber`): the keyword's UNCONDITIONED value
    // may be a number or a program-to-system field (&name), but a
    // display-size-CONDITIONED instance's value may not be a field, so it
    // must be a plain number. SFLSIZ had no RECORD_TYPES entry before; this
    // one carries only that fact. Its other facts are not restated here: "not
    // allowed with SFLSCROLL when equal to SFLPAG" lives on SFLSCROLL, and
    // "option indicators are not valid" is a NO_OPTION_INDICATOR_KEYWORDS
    // entry.
    SFLSIZ: {
      sizeConditionedValueMustBeNumber: {
        ddsReference:
          'You cannot use display size condition names for this keyword ' +
          'when a program-to-system field is used as a parameter for it.'
      }
    },

    // SFLMSGKEY's own DDS Reference section (line ~11675) and SFLPGMQ's
    // (line ~11935), re-verified fresh against DDS_Keyword_V7r6.txt,
    // unchanged from what I-101 (batch 4) already enforced. SFLMSGKEY:
    // "Option indicators are not valid for this keyword or with the
    // associated field." - the keyword half is a
    // NO_OPTION_INDICATOR_KEYWORDS table entry; this carries the FIELD half
    // (`noOptionIndicatorsOnField`: the field the keyword sits on takes no
    // option indicators either), a fact the table cannot express. SFLPGMQ:
    // "Option indicators and display size condition names are not valid for
    // this keyword." - the indicator half is likewise a table entry;
    // `noDisplaySizeCondition` carries the display-size half, previously
    // the one-element NO_DISPLAY_SIZE_CONDITION_KEYWORDS array. Each entry
    // carries only its own new fact; the option-indicator table itself is
    // deliberately left where it is.
    SFLMSGKEY: {
      noOptionIndicatorsOnField: {
        ddsReference:
          'Option indicators are not valid for this keyword or with the ' +
          'associated field.'
      }
    },
    SFLPGMQ: {
      noDisplaySizeCondition: {
        ddsReference:
          'Option indicators and display size condition names are not ' +
          'valid for this keyword.'
      }
    },

    // The *param flags each keyword's own format string offers, re-verified
    // fresh against DDS_Keyword_V7r6.txt (SNGCHCFLD ~line 12652, MLTCHCFLD
    // ~line 8022), unchanged from what the code already had:
    //   SNGCHCFLD[([*NORSTCSR | *RSTCSR] [*NOAUTOSLT | *AUTOSLT | *AUTOSLTENH]
    //              [*NOSLTIND | *SLTIND] [*NOAUTOENT | *AUTOENT | *AUTOENTNN]
    //              [[(*NUMCOL n) | (*NUMROW n)] [(*GUTTER n)]])]
    //   MLTCHCFLD[([*RSTCSR | *NORSTCSR] [*NOSLTIND | *SLTIND]
    //              [[(*NUMCOL n) | (*NUMROW n)] [(*GUTTER n)]])]
    // i.e. MLTCHCFLD has no AUTOSLT / AUTOENT family at all. This was three
    // hand-kept copies (dspfWriter.js CHOICE_SELECTION_FLAGS and
    // SNGCHCFLD_ONLY_FLAGS, webviewClientHelpers.js SNGCHCFLD_ONLY_GROUPS).
    // `selectionParameters.groups` lists each mutually-exclusive flag group
    // (the same groups real SDA's "Define Choice Selection Type" screen
    // shows); the numeric *NUMCOL / *NUMROW / *GUTTER parameters are not
    // bare flags and are not modeled here.
    SNGCHCFLD: {
      selectionParameters: {
        groups: [
          { name: 'rstcsr', flags: ['*RSTCSR', '*NORSTCSR'] },
          { name: 'sltind', flags: ['*SLTIND', '*NOSLTIND'] },
          { name: 'autoslt', flags: ['*AUTOSLT', '*NOAUTOSLT', '*AUTOSLTENH'] },
          { name: 'autoent', flags: ['*AUTOENT', '*NOAUTOENT', '*AUTOENTNN'] }
        ],
        ddsReference:
          'SNGCHCFLD[([*NORSTCSR | *RSTCSR] [*NOAUTOSLT | *AUTOSLT | ' +
          '*AUTOSLTENH] [*NOSLTIND | *SLTIND] [*NOAUTOENT | *AUTOENT | ' +
          '*AUTOENTNN] [[(*NUMCOL nbr-of-cols) | (*NUMROW nbr-of-rows)] ' +
          '[(*GUTTER gutter-width)]])]',
        // "The gutter-width must be a positive integer of at least 2."
        // (SNGCHCFLD, DDS_Keyword_V7r6.txt ~line 12718; MLTCHCFLD ~line
        // 8080 says the same; PSHBTNFLD, ~line 9704, "must be a number
        // greater than one" - the same minimum.)
        gutterMinimum: 2,
        // "It can only be specified if either *NUMCOL or *NUMROW has been
        // specified" (SNGCHCFLD ~line 12717; MLTCHCFLD ~line 8079 says the
        // same). PSHBTNFLD's section says the opposite ("it can be
        // specified even if *NUMCOL or *NUMROW have not been specified",
        // ~line 9702), so it carries no such fact.
        gutterRequiresLayout: true
      }
    },
    MLTCHCFLD: {
      selectionParameters: {
        groups: [
          { name: 'rstcsr', flags: ['*RSTCSR', '*NORSTCSR'] },
          { name: 'sltind', flags: ['*SLTIND', '*NOSLTIND'] }
        ],
        ddsReference:
          'MLTCHCFLD[([*RSTCSR | *NORSTCSR] [*NOSLTIND | *SLTIND] ' +
          '[[(*NUMCOL nbr-of-cols) | (*NUMROW nbr-of-rows)] ' +
          '[(*GUTTER gutter-width)]])]',
        gutterMinimum: 2,
        gutterRequiresLayout: true
      }
    },

    // EDTCDE's own DDS Reference section (line ~5618), re-verified fresh
    // against DDS_Keyword_V7r6.txt, unchanged from what the code already
    // had: "You can optionally specify asterisk fill or floating currency
    // symbol with edit codes 1 through 4, A through D, and J through Q."
    // Only W, X, Y and Z (the other IBM edit codes) are therefore
    // excluded; user-defined codes 5-9 are not mentioned either way and
    // are left alone. A new shape (`noFillCodes`): a list of the keyword's
    // own parameter values that cannot take the optional fill argument,
    // plus the allowed-codes wording the message quotes. Previously the
    // hand-written EDTCDE_NO_FILL_CODES array in dspfWriter.js. EDTCDE's
    // DFT/DFTVAL/ EDTWRD exclusions live in MUTEX_GROUPS, not here.
    EDTCDE: {
      floatDdsReference: 'The EDTCDE keyword is valid only for fields with Y or blank in position 35 (Data Type/Keyboard Shift).',
      notAllowedOnFloatingPointField: true,
      // The same sentence as an allow-list. Blank passes (see the writer's
      // keywordAllowedDataTypeAllows): the DDS position-35 default text says
      // a blank entry with decimal positions and an editing keyword becomes
      // Y, and the sentence itself lists blank as valid.
      allowedDataTypes: ['Y'],
      // The display-affecting columns of EDTCDE's "Table 6. Summary chart
      // for IBM i edit codes", for the dspfEngine's exact-width
      // calculation (previously its own EDTCDE_COMMAS / EDTCDE_SIGN_WIDTH
      // literals). `commaCodes`: the codes with "Commas displayed" = Yes
      // (1, 2, A, B, J, K, N, O). `signWidth`: extra positions the sign
      // reserves - CR (A-D) is two characters, a minus (J-Q) is one, the
      // no-sign codes (1-4) and the codes that strip it (X, Z) reserve
      // none. `runtimeSeparatorCodes`: W and Y insert
      // job-attribute-dependent slashes (table notes 2 and 3), so their
      // width cannot be known at design time.
      editCodeDisplay: {
        commaCodes: ['1', '2', 'A', 'B', 'J', 'K', 'N', 'O'],
        signWidth: {
          '1': 0, '2': 0, '3': 0, '4': 0,
          A: 2, B: 2, C: 2, D: 2,
          J: 1, K: 1, L: 1, M: 1,
          N: 1, O: 1, P: 1, Q: 1,
          X: 0, Z: 0
        },
        runtimeSeparatorCodes: ['W', 'Y'],
        ddsReference:
          'Table 6. Summary chart for IBM i edit codes (Commas displayed, ' +
          'Sign displayed when negative value) and its notes 2 and 3 on ' +
          'the W and Y date-edit codes.'
      },
      noFillCodes: {
        codes: ['W', 'X', 'Y', 'Z'],
        allowedText: '1-4, A-D and J-Q',
        ddsReference:
          'You can optionally specify asterisk fill or floating currency ' +
          'symbol with edit codes 1 through 4, A through D, and J ' +
          'through Q.'
      }
    },

    // EDTMSK's own DDS Reference section (line ~5782), re-verified fresh,
    // unchanged from what already enforced: "The field containing the
    // EDTMSK keyword must be usage I or usage B. It must also contain the
    // EDTCDE or EDTWRD keywords." Both facts reuse existing shapes
    // unchanged - the CHKMSGID `qualifyingNames`/`qualifyingListText`
    // dependency and `definitionRequirements.usage`. The section's further
    // list of keywords that cannot be specified on an EDTMSK field
    // (AUTO(RAB, RAZ), CHECK(AB, MF, RB, RZ, RLTB), CHOICE, CNTFLD,
    // DSPATR(OID SP)) is not enforced anywhere and is not restated here -
    // logged in the Deferred findings table.
    //
    // That Deferred finding, now closed: the same section (re-verified
    // fresh) states "The following keywords cannot be specified on a field
    // with the EDTMSK keyword: AUTO (RAB, RAZ), CHECK(AB, MF, RB, RZ,
    // RLTB), CHOICE, CNTFLD, DSPATR(OID SP)." Three of the five are
    // parameter-restricted, so it reuses the token- qualified
    // `conditionalMutex` shape (WRDWRAP/IGCALTTYP slice) rather than the
    // plain name-only `mutex`: AUTO(RAB)/AUTO(RAZ) conflict but a bare AUTO
    // or AUTO(...) with no listed token does not, CHECK(ME) is fine but
    // CHECK(AB) is not, DSPATR(HI) is fine but DSPATR(OID)/ DSPATR(SP) are
    // not; CHOICE and CNTFLD are excluded outright (null).
    EDTMSK: {
      ddsReference:
        'The field containing the EDTMSK keyword must be usage I or usage ' +
        'B. It must also contain the EDTCDE or EDTWRD keywords. The ' +
        'following keywords cannot be specified on a field with the ' +
        'EDTMSK keyword: AUTO (RAB, RAZ), CHECK(AB, MF, RB, RZ, RLTB), ' +
        'CHOICE, CNTFLD, DSPATR(OID SP).',
      qualifyingNames: ['EDTCDE', 'EDTWRD'],
      qualifyingListText: 'EDTCDE or EDTWRD',
      definitionRequirements: {
        usage: ['I', 'B']
      },
      conditionalMutex: {
        AUTO: ['RAB', 'RAZ'],
        CHECK: ['AB', 'MF', 'RB', 'RZ', 'RLTB'],
        CHOICE: null,
        CNTFLD: null,
        DSPATR: ['OID', 'SP']
      }
    },

    // MNUBARSW's own DDS Reference section (line ~8626) and MNUCNL's (line
    // ~8684), re-verified fresh against DDS_Keyword_V7r6.txt, each state:
    // "Within a record, the CAnn key specified by [this keyword] cannot be
    // specified again using another keyword (such as [the other one])" and
    // "Because [this keyword] at the file level extends to all records in
    // the file, this must be considered when assigning a CAnn key." Each
    // also documents its own default when the CAnn parameter is omitted
    // (MNUBARSW: CA10, MNUCNL: CA12). A new shape -
    // `caKeyPartner`/`caKeyDefault` - for two keywords sharing one CA-key
    // namespace, each with its own default; deliberately NOT `mutex` (that
    // shape is "cannot coexist at all"; this is "cannot be assigned the
    // SAME CAnn value", and the two ARE meant to coexist, per this file's
    // own MNUBARSW/MNUCNL example). The file-vs-record scoping the two
    // sections state stays procedural, in mnuBarKeyConflictReason - it
    // isn't a per-keyword fact.
    MNUBARSW: {
      caKeyPartner: 'MNUCNL',
      caKeyDefault: 'CA10',
      // The level, parameter-grammar and option-indicator facts from the same section
      // (DDS_Keyword_V7r6.txt ~line 8611): \"You use this file- or record-level keyword\", \"The
      // format of the keyword is MNUBARSW [(CAnn)].\", \"Option indicators are valid for this
      // keyword.\" and \"The MNUBARSW keyword is allowed only in a file containing a menu-bar
      // record.\" (the last is a spec fact only: no guard reads it, see I-196).
      levels: ['file', 'record'],
      parameterForm: 'MNUBARSW [(CAnn)]',
      optionIndicators: 'valid',
      requiresMenuBarRecordInFile: true,
      // "If the MNUBARSW keyword is specified on the record, the CAnn key or default CA10 key can
      // be used only as a CA key on other records, not as a CF key" - and a file-level MNUBARSW
      // extends to every record, so the scope is the whole file (same reading as the CAnn / CFnn
      // entries).
      sameKeyNumberAsOtherType: 'notAllowed',
      sameKeyNumberScope: 'file',
      ddsReference:
        'Within a record, the CAnn key specified by the MNUBARSW keyword ' +
        'cannot be specified again using another keyword (such as MNUCNL).'
    },
    MNUCNL: {
      caKeyPartner: 'MNUBARSW',
      caKeyDefault: 'CA12',
      // The same facts from MNUCNL's section (~line 8655): \"file- or record-level keyword\", the
      // format line MNUCNL[(CAnn [response-indicator])], \"Option indicators are valid for this
      // keyword.\" and \"The MNUCNL keyword is allowed only in a file containing a menu-bar
      // record.\" (spec fact only, I-196).
      levels: ['file', 'record'],
      parameterForm: 'MNUCNL[(CAnn [response-indicator])]',
      optionIndicators: 'valid',
      requiresMenuBarRecordInFile: true,
      // "If the MNUCNL keyword is specified on the record, the CAnn key or default CA12 key can be
      // used only as a CA key on other records, not as a CF key" - and a file-level MNUCNL extends
      // to every record, so the scope is the whole file (same reading as the CAnn / CFnn entries).
      sameKeyNumberAsOtherType: 'notAllowed',
      sameKeyNumberScope: 'file',
      ddsReference:
        'Within a record, the CAnn key specified by the MNUCNL keyword ' +
        'cannot be specified again using another keyword (such as MNUBARSW).'
    },

    // Input, format and display field keywords: KEYBRD, BLANKS, CNTFLD,
    // FLTFIXDEC, FLTPCN, MAPVAL, FLDCSRPRG, ERRMSG. Each entry below was
    // verified against its own section of DDS_Keyword_V7r6.txt, not
    // against the code. Only the data-type facts are consumed so far (the
    // General-tab row filter's float-only / datetime-only scopes); the
    // usage facts and CNTFLD's data type are stated here because the
    // reference states them, but nothing enforces them yet - logged in the
    // Deferred findings table, not changed here.

    // KEYBRD is not a DDS keyword: the reference has no such section. It is
    // iSDA's own name for the field's position-35 "Data type and keyboard
    // shift" column (keywordFixes.md L79), whose valid entries live in
    // KEYBOARD_SHIFT_ENTRIES. The entry records that, so the keyword index
    // does not list it (I-197) and nobody invents a rule for it.
    KEYBRD: {
      notADdsKeyword: true,
      ddsReference:
        'No KEYBRD section exists in the DDS Reference for display files. ' +
        'The keyboard shift is position 35 of the DDS specification, "Data ' +
        'type and keyboard shift".'
    },
    // "BLANKS (Blanks) keyword": "when specified for a numeric, input-capable
    // field"; "also valid for character fields". Option indicators are not
    // valid (the option-indicator table already carries that).
    BLANKS: {
      ddsReference:
        'This field-level keyword, when specified for a numeric, ' +
        'input-capable field, enables your program to distinguish when the ' +
        'field is blank and when the field is zero on the display. This ' +
        'keyword is also valid for character fields, but there is ' +
        'generally no need to specify it for them.',
      allowedUsage: ['I', 'B']
    },
    // "CNTFLD (Continued-Entry Field) keyword": "The field containing the
    // CNTFLD keyword must be defined as an input-capable field with the
    // data type A. It cannot be defined in a subfile." One numeric
    // parameter, the width of the column.
    CNTFLD: {
      ddsReference:
        'The field containing the CNTFLD keyword must be defined as an ' +
        'input-capable field with the data type A. It cannot be defined in ' +
        'a subfile.',
      allowedUsage: ['I', 'B'],
      requiredDataTypes: ['A'],
      // The rest of the section's field rules, as facts the guard reads.
      notInSubfile: true,
      widthMustBeLessThanFieldLength: true,
      // A blank data type with no decimal positions IS character (A), so a
      // field still being drafted is not refused for it.
      blankDataTypeIsCharacterWithoutDecimals: true,
      // "CNTFLD(width of column) One parameter must be specified." - the
      // width is a whole number - and "The following keywords cannot be
      // specified on a field with the CNTFLD keyword: AUTO (RAB, RAZ),
      // CHECK(AB, MF, RB, RZ, RLTB), CHOICE, DSPATR(OID SP), EDTMSK". The
      // same token-qualified conditionalMutex shape EDTMSK's own list
      // uses, read from CNTFLD's side; EDTMSK's side stays on EDTMSK's
      // entry.
      widthParameterIsNumber: true,
      // "This value must fit within the width of the display or window." and
      // "The CNTFLD keyword must be defined with at least 2 spaces
      // separating it from other fields." Both need the screen (the file's
      // DSPSIZ, the record's WINDOW, the other fields' positions), so the
      // guard reads them from the model; the numbers live here.
      widthMustFitDisplay: true,
      minSpacesFromOtherFields: 2,
      layoutReference:
        'This value must fit within the width of the display or window. ' +
        'This value must be less than the length of the field.',
      spacingReference:
        'The CNTFLD keyword must be defined with at least 2 spaces separating it from other fields.',
      conditionalMutex: {
        AUTO: ['RAB', 'RAZ'],
        CHECK: ['AB', 'MF', 'RB', 'RZ', 'RLTB'],
        CHOICE: null,
        DSPATR: ['OID', 'SP'],
        EDTMSK: null
      }
    },
    // "FLTFIXDEC (Floating-Point to Fixed Decimal) keyword": "to display a
    // number in an output-capable (usage B or O) floating-point field". No
    // parameters.
    FLTFIXDEC: {
      ddsReference:
        'You use this field-level keyword to display a number in an ' +
        'output-capable (usage B or O) floating-point field in fixed-decimal ' +
        'notation.',
      allowedUsage: ['B', 'O'],
      requiredDataTypes: ['F']
    },
    // "FLTPCN (Floating-Point Precision) keyword": "This keyword is valid
    // for floating-point fields only (data type F)." Parameter *SINGLE or
    // *DOUBLE.
    //
    // The rest of FLTPCN's own section, previously unenforced:
    // "FLTPCN(*SINGLE | *DOUBLE)" (one of the two values - no brackets in
    // the format), "A single precision field can be up to 9 digits; a
    // double precision field can be up to 17 digits. If you specify a field
    // length greater than 9 (single precision) or 17 (double precision), an
    // error message appears and the file is not created." and "Option
    // indicators are not valid for this keyword." (the last one is the
    // NO_OPTION_INDICATOR_KEYWORDS row further down).
    FLTPCN: {
      // "You use this field-level keyword to specify the precision of a floating-point field";
      // "Option indicators are not valid for this keyword."
      levels: ['field'],
      optionIndicators: 'notValid',
      ddsReference:
        'This keyword is valid for floating-point fields only (data type F).',
      requiredDataTypes: ['F'],
      parameterValues: ['*SINGLE', '*DOUBLE'],
      maxLengthByParameter: { '*SINGLE': 9, '*DOUBLE': 17 },
      maxLengthReference:
        'A single precision field can be up to 9 digits; a double precision ' +
        'field can be up to 17 digits. If you specify a field length greater ' +
        'than 9 (single precision) or 17 (double precision), an error message ' +
        'appears and the file is not created.'
    },
    // "MAPVAL (Map Values) keyword": "This keyword is only valid with the
    // date (L), time (T), or timestamp (Z) data types."
    MAPVAL: {
      ddsReference:
        'This keyword is only valid with the date (L), time (T), or ' +
        'timestamp (Z) data types.',
      requiredDataTypes: ['L', 'T', 'Z']
    },
    // "FLDCSRPRG (Cursor Progression Field) keyword": "The field containing
    // the FLDCSRPRG keyword is defined as an input-capable field. It cannot
    // be defined in a subfile." "not allowed with the SNGCHCFLD or MLTCHCFLD
    // keywords".
    FLDCSRPRG: {
      ddsReference:
        'The field containing the FLDCSRPRG keyword is defined as an ' +
        'input-capable field. It cannot be defined in a subfile. The ' +
        'FLDCSRPRG keyword is not allowed with the SNGCHCFLD or MLTCHCFLD ' +
        'keywords.',
      allowedUsage: ['I', 'B'],
      // The rest of the section's field rules, as facts the guard reads.
      notInSubfile: true,
      notWithKeywords: ['SNGCHCFLD', 'MLTCHCFLD'],
      parameterNamesInputCapableFieldInSameRecord: true
    },
    // "ERRMSG (Error Message) and ERRMSGID": "Option indicators are valid
    // for these keywords." Parameters: 'message-text' [response-indicator].
    // ERRMSG is already in REPEATABLE_INSTANCE_GROUPS; the shared-indicator
    // rules stay with the response-indicator checks.
    ERRMSG: {
      // "You can use one of these field-level keywords" (ERRMSG / ERRMSGID); "Option indicators are
      // valid for these keywords."
      levels: ['field'],
      optionIndicators: 'valid',
      ddsReference:
        'You can use one of these field-level keywords to identify a ' +
        'message that is displayed on the message line and that is ' +
        'associated with that field. Option indicators are valid for these ' +
        'keywords.'
    },

    // ---- Reference and database-inherit field keywords ----
    // ALIAS, REFFLD, DLTCHK, DLTEDT and HLPID, each re-read fresh against its own section
    // of DDS_Keyword_V7r6.txt (ALIAS ~1837, DLTCHK ~4785, DLTEDT ~4805, HLPID ~7070, REFFLD
    // ~10095), not against the code. I-121o itself changed no behaviour (its one consumer
    // is the General keywords panel's HLPID row scope, validOnlyOnConstantField); then
    // enforced the rest through referenceFieldRules() below. Option indicators are "not
    // valid" for all five; that stays in the NO_OPTION_INDICATORS table and is not
    // restated.
    //   requiresReferenceFlag   the keyword is valid only when position 29 is R
    //   validOnlyOnConstantField the keyword belongs to a constant field only
    //   alternativeNameMustBeUnique ALIAS: unique among alias names and field names
    //   copiedFromReferencedField ALIAS: a referencing field copies it in
    //   fieldNameRequired       REFFLD: the referenced field name is always written
    //   srcMeansSameSourceFile  REFFLD: *SRC names the DDS source being defined
    //   srcFieldMustPrecede     REFFLD: a *SRC target must precede the referencing field
    //   parameterForm           the keyword's parameter grammar, as IBM writes it
    //   deletes                 DLTCHK / DLTEDT: the FIELD_KEYWORD_GROUPS group they delete
    ALIAS: {
      ddsReference:
        'You use this field-level keyword to specify an alternative name ' +
        'for a field. The alternative-name must be different from all ' +
        'other alternative names and from all DDS field names in the ' +
        'record format. When you refer to a field that has the ALIAS ' +
        'keyword, the ALIAS keyword is copied in unless the ALIAS keyword ' +
        'is explicitly specified on the referencing field.',
      parameterForm: 'ALIAS(alternative-name)',
      alternativeNameMustBeUnique: true,
      copiedFromReferencedField: true
    },
    REFFLD: {
      ddsReference:
        'You use this field-level keyword to refer to a field when the ' +
        'name, record format, file, or library of the referenced field ' +
        'differs from its equivalent in positions 19 through 28. The ' +
        'referenced-field-name is required even if it is the same as the ' +
        'referencing field. Use the record format name when the ' +
        'referenced file contains more than one record format. Note: When ' +
        'you refer to a field in the same DDS source file, the field you ' +
        'are referring to must precede the field you are defining. You ' +
        'must specify an R in position 29.',
      parameterForm: 'REFFLD([record-format-name/]referenced-field-name [{*SRC | [library-name/]database-file-name}])',
      requiresReferenceFlag: true,
      fieldNameRequired: true,
      // The file part is optional: REFFLD(ITEM) is the first documented
      // example, and "+ Fields from database file" writes the two-part
      // form REFFLD(NAME FILE) on a field with no length or type.
      fileParameterOptional: true,
      srcMeansSameSourceFile: true,
      srcFieldMustPrecede: true
    },
    DLTCHK: {
      ddsReference:
        'You use this field-level keyword to specify that the IBM i ' +
        'operating system is to ignore all validity checking and CHKMSGID ' +
        'keywords that are specified for a referenced field. This keyword ' +
        'is valid only when R is specified in position 29. This keyword ' +
        'has no parameters. If you specify any new validity checking ' +
        'keywords, DLTCHK is unnecessary.',
      requiresReferenceFlag: true,
      noParameters: true,
      // DLTCHK's section (~line 4785): \"You use this field-level keyword\" and \"Option indicators
      // are not valid for this keyword.\" (the no-option-indicators table carries the same fact).
      levels: ['field'],
      optionIndicators: 'notValid',
      deletes: 'VALIDITY'
    },
    DLTEDT: {
      ddsReference:
        'You use this field-level keyword to specify that the IBM i ' +
        'operating system is to ignore the EDTCDE or EDTWRD keyword if ' +
        'either of them is specified for a referenced field. This keyword ' +
        'is valid only when you specify R in position 29. This keyword ' +
        'has no parameters. If you specify a new editing keyword, DLTEDT ' +
        'is unnecessary.',
      requiresReferenceFlag: true,
      noParameters: true,
      // DLTEDT's section (~line 4805): field-level, option indicators not valid.
      levels: ['field'],
      optionIndicators: 'notValid',
      deletes: 'EDIT'
    },
    HLPID: {
      ddsReference:
        'You use this constant field-level keyword to specify an ' +
        'identifier for the constant in the field-level help. The ' +
        'identifier you specify can be used on the HLPARA keyword to link ' +
        'help text to this constant field. The help-identifier parameter ' +
        'is required and can be only a numeric value from 1 to 999. The ' +
        'value you specify must be unique within the record you are ' +
        'defining.',
      parameterForm: 'HLPID(help-identifier)',
      // HLPID's section (line ~7070): "You use this constant field-level keyword" and "Option
      // indicators are not valid for this keyword." (the same fact the no-option-indicators table
      // carries; its parameter facts are the ones above).
      levels: ['field'],
      optionIndicators: 'notValid',
      validOnlyOnConstantField: true,
      parameterRequired: true,
      identifierRange: { min: 1, max: 999 },
      uniqueWithinRecord: true
    },

    // ---- Constant and system-value field keywords ----
    // DATE, TIME, USER, SYSNAME, MSGCON and NOCCSID, each re-read fresh
    // against DDS_Keyword_V7r6.txt (DATE ~line 4480, SYSNAME ~12785, TIME
    // ~12832, USER ~13042, MSGCON ~8922, NOCCSID ~9147; "Constant fields"
    // ~line 671). Facts per entry (only those the keyword's own section
    // states):
    //   constantFieldOnly         the keyword supplies an unnamed constant
    //                             field's value (positions 17-38 blank; for
    //                             MSGCON: "cannot be used to initialize a
    //                             named field")
    //   listedCompanionKeywords   the keywords the section says the field can
    //                             carry besides its location and the keyword;
    //                             companionsStatedAsOnly is true only where
    //                             the text says "only" (TIME)
    //   noParameters / dateParameters / msgconParameters   the parameter
    //                             grammar and domain
    //   fixedLength               a length the section states outright
    //   mutex                     MSGCON's field-level exclusion list
    // Option indicators are NOT restated here: DATE / TIME / USER / SYSNAME are
    // in the noOptionIndicators table below (notValidFieldConditionable); MSGCON
    // may be conditioned (its note is kept as text, not a rule). The shared
    // value-source list (DATE, TIME, USER, SYSNAME) is the
    // SYSTEM_VALUE_CONSTANT_KEYWORDS fact (v0.10.280), asked via
    // systemValueConstantKeywords(). Task I-143 enforces MSGCON's three rules
    // (named field, exclusion list, length 1-132: DspfWriter.msgconConflictReason
    // and msgconNewConflictReason). Task I-144 enforces constant-only, no
    // parameters and DATE's parameter grammar
    // (DspfWriter.systemValueKeywordNewConflictReason) and uses the display
    // widths (systemValueConstantWidth); the companion-keyword lists below are
    // stated as facts but not enforced for DATE / USER / SYSNAME: their sections
    // say "optionally", only TIME says "only". Those three lists stay OPEN - the
    // literal reading is a list of what is available, not a prohibition, and a
    // refusal on the wrong reading blocks valid DDS. If a compile ever shows a
    // list is closed, flipping companionsStatedAsOnly for that keyword is the
    // whole change (the collector is driven by the flag).
    DATE: {
      ddsReference:
        'You use this field-level keyword to display the current date as a ' +
        'constant (output-only) field. You can specify the location of the ' +
        'field, the DATE keyword, and, optionally, EDTCDE , EDTWRD, COLOR, ' +
        'DSPATR, or TEXT keywords. Positions 17 through 38 must be blank.',
      constantFieldOnly: true,
      listedCompanionKeywords: ['EDTCDE', 'EDTWRD', 'COLOR', 'DSPATR', 'TEXT'],
      companionsStatedAsOnly: false,
      // DATE([*JOB|*SYS] [*Y|*YY]): omitted = *JOB and *Y.
      dateParameters: {
        source: ['*JOB', '*SYS'],
        year: ['*Y', '*YY'],
        defaults: { source: '*JOB', year: '*Y' }
      },
      // The section says the length "is dependent on" the job DATFMT, on
      // separators (EDTCDE(Y) adds them) and on the year digits (*Y 2, *YY
      // 4). Its own example: "mmddyy" becomes "mm/dd/yy". The job DATFMT
      // is not known at design time, so the width assumes a three-part
      // format (MDY, DMY or YMD): 6 digits with *Y, 8 with *YY, plus 2
      // separators under EDTCDE(Y). JUL (yyddd) and the run-time DATSEP
      // character are not modelled.
      displayWidth: { digits: { '*Y': 6, '*YY': 8 }, separatorsWithEdtcdeY: 2 }
    },
    TIME: {
      ddsReference:
        'You use this field-level keyword to display the current system time ' +
        'as a constant (output-only) field. This keyword has no parameters. ' +
        'You can specify only the location of the field, TIME, and ' +
        'optionally, the EDTCDE, EDTWRD, COLOR, DSPATR, or TEXT keyword. ' +
        'Positions 17 through 38 must be blank.',
      constantFieldOnly: true,
      noParameters: true,
      fieldLevel: true,
      listedCompanionKeywords: ['EDTCDE', 'EDTWRD', 'COLOR', 'DSPATR', 'TEXT'],
      companionsStatedAsOnly: true,
      // "The edit word '0_:__:__' (_ represents a blank) is assumed for
      // a TIME field": 8 characters, overridden by EDTWRD.
      displayWidth: { defaultEditWord: '0_:__:__' }
    },
    USER: {
      ddsReference:
        'You use this field-level keyword to display the user profile name ' +
        'for the current job as a constant (output-only) field that is 10 ' +
        'characters long. You can specify the location of the field, the ' +
        'USER keyword, and, optionally, the COLOR, DSPATR, and TEXT ' +
        'keywords. Positions 17 through 38 must be blank. This keyword has ' +
        'no parameters.',
      constantFieldOnly: true,
      noParameters: true,
      fieldLevel: true,
      listedCompanionKeywords: ['COLOR', 'DSPATR', 'TEXT'],
      companionsStatedAsOnly: false,
      fixedLength: 10
    },
    SYSNAME: {
      ddsReference:
        'You use this field-level keyword to display the current system ' +
        'name as a constant (output-only) field that is 8 characters long. ' +
        'You can specify the location of the field, the SYSNAME keyword, ' +
        'and, optionally, the COLOR, DSPATR, and TEXT keywords. Positions ' +
        '17 through 38 must be blank. This keyword has no parameters.',
      constantFieldOnly: true,
      noParameters: true,
      fieldLevel: true,
      listedCompanionKeywords: ['COLOR', 'DSPATR', 'TEXT'],
      companionsStatedAsOnly: false,
      fixedLength: 8
    },
    MSGCON: {
      ddsReference:
        'MSGCON(length message-ID [library-name/]message-file-name). The ' +
        'length can be from 1 to 132 bytes. The MSGCON keyword must be ' +
        'explicitly specified for the field. The MSGCON keyword cannot be ' +
        'used to initialize a named field. The MSGCON keyword cannot be ' +
        'specified with any of the following keywords: DATE DFT EDTCDE ' +
        'EDTWRD TIME',
      constantFieldOnly: true,
      // The format line states three parameters - length, message-ID and
      // [library-name/]message-file-name - of which only the library is optional, so the
      // parameter text is exactly `parameterCount` blank-separated tokens and the file token
      // is `[library-name/]message-file-name` (one `libraryDelimiter` at most, neither side
      // empty). The section states NO rule for the message ID or for the file / library names
      // (no length, character set or format; the 7-character form and the 10-character field
      // lengths belong to MSGID's own section, which has field-name parameters MSGCON lacks),
      // so none is enforced: `messageIdRule` / `fileNameRule` are null on purpose and
      // `openQuestions` records why.
      msgconParameters: {
        lengthMin: 1, lengthMax: 132,
        parameterCount: 3, libraryDelimiter: '/',
        messageIdRule: null, fileNameRule: null,
        // The usual IBM i message ID is seven characters, but MSGCON's section does not say the
        // compiler requires it, so a different length is an ADVISORY only (never a refusal) and
        // messageIdRule stays null. Promote to a refusal only if a compile settles it.
        messageIdAdvisoryLength: 7,
        openQuestions: [
          'MSGCON states no rule for the message-ID (MSGID\'s 7-character form is MSGID\'s own, for its &field and msg-id parameters).',
          'MSGCON states no rule for message-file-name or library-name beyond the optional library-name/ prefix.'
        ]
      },
      mutex: ['DATE', 'DFT', 'EDTCDE', 'EDTWRD', 'TIME'],
      optionIndicatorNote:
        'Option indicators are not valid for changing the value of the ' +
        'message line, but they are valid for conditioning the presence or ' +
        'absence of the message on the display.'
    },
    NOCCSID: {
      ddsReference:
        'You use this field-level keyword to specify that CCSID conversion ' +
        'of the field is not done. This keyword has no parameters.',
      noParameters: true,
      fieldLevel: true,
      // NOCCSID's section (line ~9147): "You use this field-level keyword" and "This keyword has no
      // parameters." It states nothing about option indicators, so no `optionIndicators` fact is
      // added (the panels' Conditioning toggle is not read from the spec).
      levels: ['field']
    },

    // ---- Output, cursor and screen-control keywords ----
    // Thirteen record-level keywords, each re-read in its OWN section of
    // DDS_Keyword_V7r6.txt (`ddsSection` names the heading; `ddsReference`
    // quotes the sentences the facts come from, joined by ' ... '). Facts
    // are flat fields on the entry, read through recordKeywordFacts():
    //   levels                  ['record'] for all thirteen
    //   noParameters            "This keyword has no parameters."
    //   optionIndicatorsValid   "Option indicators are valid for this keyword."
    //                           (true only; where the section says they are
    //                           NOT valid - RTNCSRLOC, UNLOCK - the fact is
    //                           NO_OPTION_INDICATORS below, not repeated)
    //   displaySizeNamesValid   false where the section says they are not
    //   requiresRecordKeyword   a keyword the section says must be on the
    //                           same record format
    //   oncePerRecordFormat     "only once per record format" (NOT the
    //                           field-level `onePerRecord`)
    //   repeatable              "can be specified more than once"
    //   parameterCount          {min, max} of the keyword's parameter list
    //   validValues             the keyword's literal parameter values
    //   notAllowedInRecordTypes record formats (by their keyword) it is not
    //                           valid on
    //   mutex                   keywords the section says cannot be on the
    //                           same record format (bidirectional as KEEP's)
    // Cross-checks, not copies: PULLDOWN's mutex above already lists ALARM,
    // ERASE, ERASEINP, FRCDTA, MDTOFF, OVERLAY, PUTOVR; the USRDFN, SFL and
    // MNUBAR whitelists decide where the thirteen may go. The test pins
    // every one of those lists against the facts here.
    ALARM: {
      ddsSection: 'ALARM (Audible Alarm) keyword for display files',
      ddsReference: 'This keyword has no parameters. ... Option indicators are valid for this keyword.',
      levels: ['record'],
      noParameters: true,
      optionIndicatorsValid: true
    },
    BLINK: {
      ddsSection: 'BLINK (Blink) keyword for display files',
      ddsReference: 'This keyword has no parameters. ... Option indicators are valid for this keyword.',
      levels: ['record'],
      noParameters: true,
      optionIndicatorsValid: true
    },
    CSRLOC: {
      ddsSection: 'CSRLOC (Cursor Location) keyword for display files',
      ddsReference:
        'CSRLOC(field-name-1 field-name-2) ... Field-name-1 and field-name-2 are 3-byte, zoned decimal, hidden fields. ' +
        '... Specify the CSRLOC keyword only once per record format. ... ' +
        'The CSRLOC keyword is not valid for the following record formats: ... ' +
        'Subfile record formats (identified by the SFL keyword) ... ' +
        'User-defined record formats (identified by the USRDFN keyword) ... ' +
        'Option indicators are valid for this keyword. Display size condition names are not valid.',
      levels: ['record'],
      parameterCount: { min: 2, max: 2 },
      oncePerRecordFormat: true,
      notAllowedInRecordTypes: ['SFL', 'USRDFN'],
      optionIndicatorsValid: true,
      displaySizeNamesValid: false
    },
    RTNCSRLOC: {
      ddsSection: 'RTNCSRLOC (Return Cursor Location) keyword for display files',
      ddsReference:
        'The *RECNAME parameter indicates that RTNCSRLOC should return the name of the record and field on which the cursor is positioned. ' +
        '... The *WINDOW or *MOUSE parameter is used to qualify the cursor-row2 and cursor-column-2 parameters.',
      levels: ['record'],
      // The two formats are told apart by their FIRST token: *WINDOW / *MOUSE
      // means the row/column format, anything else (with or without a
      // leading *RECNAME) the record/field format. Option indicators:
      // NO_OPTION_INDICATORS.RTNCSRLOC.
      validValues: ['*RECNAME', '*WINDOW', '*MOUSE'],
      windowMouseValues: ['*WINDOW', '*MOUSE'],
      valuesDdsReference:
        'RTNCSRLOC([*RECNAME] &cursor-record &cursor-field [&cursor-position]) or ' +
        'RTNCSRLOC({*WINDOW | *MOUSE} &cursor-row &cursor-column [&cursor-row2 [&cursor-column2]])'
    },
    ERASE: {
      ddsSection: 'ERASE (Erase) keyword for display files',
      ddsReference:
        'ERASE(record-name-1 [record-name-2 ...[record-name-20]]) ... ERASE can be specified more than once. ' +
        'The OVERLAY keyword must be specified whenever the ERASE keyword is specified. ' +
        '... Option indicators are valid for this keyword.',
      levels: ['record'],
      parameterCount: { min: 1, max: 20 },
      repeatable: true,
      requiresRecordKeyword: 'OVERLAY',
      optionIndicatorsValid: true
    },
    ERASEINP: {
      ddsSection: 'ERASEINP (Erase Input) keyword for display files',
      ddsReference:
        'ERASEINP[(*MDTON | *ALL)] ... The OVERLAY keyword must be specified whenever ERASEINP is specified. ' +
        '... Option indicators are valid for this keyword.',
      levels: ['record'],
      parameterCount: { min: 0, max: 1 },
      validValues: ['*MDTON', '*ALL'],
      valuesDdsReference: 'ERASEINP[(*MDTON | *ALL)]',
      requiresRecordKeyword: 'OVERLAY',
      optionIndicatorsValid: true
    },
    OVERLAY: {
      ddsSection: 'OVERLAY (Overlay) keyword for display files',
      ddsReference: 'This keyword has no parameters. ... Option indicators are valid for this keyword.',
      levels: ['record'],
      noParameters: true,
      optionIndicatorsValid: true
    },
    PUTOVR: {
      ddsSection: 'PUTOVR (Put with Explicit Override) keyword for display files',
      ddsReference:
        'This keyword has no parameters. ' +
        '... The PUTRETAIN keyword and the PUTOVR keyword cannot be specified on the same record format. ' +
        '... Option indicators are valid for the PUTOVR, OVRATR, and OVRDTA keywords.',
      levels: ['record'],
      noParameters: true,
      mutex: ['PUTRETAIN'],
      optionIndicatorsValid: true
    },
    FRCDTA: {
      ddsSection: 'FRCDTA (Force Data) keyword for display files',
      ddsReference:
        'This keyword has no parameters. ... The FRCDTA keyword can be specified once for each record format. ' +
        '... Option indicators are valid for this keyword.',
      levels: ['record'],
      noParameters: true,
      oncePerRecordFormat: true,
      optionIndicatorsValid: true
    },
    PROTECT: {
      ddsSection: 'PROTECT (Protect) keyword for display files',
      ddsReference:
        'This keyword has no parameters. ' +
        '... The OVERLAY keyword must be specified in the record format in which PROTECT is specified. ' +
        '... Option indicators are valid for this keyword.',
      levels: ['record'],
      noParameters: true,
      requiresRecordKeyword: 'OVERLAY',
      optionIndicatorsValid: true
    },
    MDTOFF: {
      ddsSection: 'MDTOFF (Modified Data Tag Off) keyword for display files',
      ddsReference:
        'MDTOFF[(*UNPR | *ALL)] ... Option indicators are valid for this keyword. ' +
        '... MDTOFF is not valid for the subfile record format (identified by the SFL keyword). ' +
        'It is valid for all other record formats for which OVERLAY keyword is also specified.',
      levels: ['record'],
      parameterCount: { min: 0, max: 1 },
      validValues: ['*UNPR', '*ALL'],
      valuesDdsReference: 'MDTOFF[(*UNPR | *ALL)]',
      requiresRecordKeyword: 'OVERLAY',
      notAllowedInRecordTypes: ['SFL'],
      optionIndicatorsValid: true
    },
    LOCK: {
      ddsSection: 'LOCK (Lock) keyword for display files',
      ddsReference: 'This keyword has no parameters. ... Option indicators are valid for this keyword.',
      levels: ['record'],
      noParameters: true,
      optionIndicatorsValid: true
    },
    UNLOCK: {
      ddsSection: 'UNLOCK (Unlock) keyword for display files',
      ddsReference:
        'UNLOCK[(*ERASE) | (*MDTOFF)] | [(*ERASE *MDTOFF)] | [(*MDTOFF *ERASE)] ... ' +
        'The GETRETAIN keyword is ignored and an error message results at file creation time ' +
        'if the GETRETAIN keyword is specified with UNLOCK(any parameter). ' +
        '... If the UNLOCK keyword is specified, the RTNDTA keyword cannot be specified.',
      levels: ['record'],
      parameterCount: { min: 0, max: 2 },
      validValues: ['*ERASE', '*MDTOFF'],
      valuesDdsReference: 'UNLOCK[(*ERASE) | (*MDTOFF)] | [(*ERASE *MDTOFF)] | [(*MDTOFF *ERASE)]'
      // The GETRETAIN / RTNDTA relations are NOT repeated here: already holds
      // them on those two entries (GETRETAIN `requiresOnRecord` /
      // `requiresBareKeyword` UNLOCK; RTNDTA `excludesOnRecord` UNLOCK). They
      // are not a plain mutex - GETRETAIN with a BARE UNLOCK is the legal form.
    },

    // Help-specification-level keywords: HLPARA, HLPBDY, HLPEXCLD. Every fact
    // below was re-read from DDS_Keyword_V7r6.txt (the section named in each
    // ddsReference), NOT taken from the code. `levels: ['help']` is the H
    // specification (an H in position 17, after the record-level keywords and
    // before the first field). Field names are the ones I-121b / I-121e / I-121i
    // use. Enforcement stays with the existing guards; rules with no guard yet
    // are recorded here and logged as findings in keywordFixes.md.
    //   * HLPBDY's exclusion with HLPDOC is NOT repeated here: it already lives
    //     Once, on HLPDOC's entry, where hlpdocHspecConflictReason
    //     reads it; isMutex reads only the owner's list, so a copy here would be
    //     a second source of truth.
    //   * Option indicators: HLPARA is in NO_OPTION_INDICATORS (the fact is stated
    //     there too, and the sweep test pins the two together); HLPBDY and
    //     HLPEXCLD accept them.
    HLPARA: {
      levels: ['help'],
      optionIndicators: 'notValid',
      parameterForms: [
        'HLPARA(top-line left-position bottom-line right-position)',
        'HLPARA(*RCD)',
        'HLPARA(*NONE)',
        'HLPARA(*FLD field-name [choice-number])',
        'HLPARA(*CNST help-identifier)'
      ],
      specialValues: ['*RCD', '*NONE', '*FLD', '*CNST'],
      coordinates: {
        withinDisplaySize: true,
        topLineNotAfterBottomLine: true,
        leftPositionNotAfterRightPosition: true,
        adjustedBySlno: true,
        // Without a secondary-size HLPARA the primary one is used if valid for it, else *NONE.
        secondarySizeFallback: 'primary HLPARA if valid for the secondary size, otherwise *NONE'
      },
      rcd: {
        notOnRecordTypes: ['SFLCTL', 'USRDFN'],
        recordNeedsDisplayableField: true,
        // Hidden (H), message (M) and program-to-system (P) fields and SFLPGMQ / SFLMSGKEY fields are not displayable.
        notDisplayable: ['usage H', 'usage M', 'usage P', 'SFLPGMQ', 'SFLMSGKEY']
      },
      fld: {
        fieldMustExistInRecord: true,
        choiceNumber: { min: 1, max: 99, onlyForFieldsWith: ['MNUBARCHC', 'CHOICE'], mustBeOnThatKeyword: true }
      },
      cnst: {
        constantFieldMustExistInRecord: true,
        constantFieldNeedsKeyword: 'HLPID',
        sameHelpIdentifier: true
      },
      atLeastOnePerHelpSpecification: true,
      multipleNeedDisplaySizeConditioning: true,
      helpAreasMayOverlap: true,
      // The first H specification whose HLPARA holds the cursor and whose HLPRCD / HLPPNLGRP / HLPDOC indicator is on is used.
      firstMatchingHelpSpecificationUsed: true,
      // The rules for the H specification itself, stated in HLPARA's section (shared by HLPBDY and HLPEXCLD).
      helpSpecification: {
        startsWithHInPosition17: true,
        locatedAfterRecordKeywordsBeforeFirstField: true,
        exactlyOneOf: ['HLPRCD', 'HLPPNLGRP', 'HLPDOC'],
        atMostOneOf: ['HLPBDY', 'HLPEXCLD'],
        atLeastOne: ['HLPARA'],
        notOnRecordTypes: ['SFL'],
        notOnSflctlWith: 'SFLMSGRCD'
      },
      ddsReference:
        'HLPARA (Help Area) (~line 6618): help-specification-level; defines the rectangular area (or the record, a field, a constant, or none) whose ' +
        'cursor position selects the H specification\'s help. Forms: HLPARA(top-line left-position bottom-line right-position), HLPARA(*RCD), ' +
        'HLPARA(*NONE), HLPARA(*FLD field-name [choice-number]), HLPARA(*CNST help-identifier). Line and position values are within the display size, ' +
        'top line not after bottom line, left position not after right position, adjusted by SLNO; with no HLPARA for a secondary size the primary one is used ' +
        'if valid there, else *NONE. *RCD is not valid for SFLCTL or USRDFN records and needs a displayable field in the record (not H, M or P usage, not ' +
        'SFLPGMQ / SFLMSGKEY). *FLD names a field of the record; the choice number (1 to 99) is for a menu-bar or selection field and must be on its MNUBARCHC / ' +
        'CHOICE. *CNST names a constant field of the record that has HLPID with the same identifier. At least one HLPARA per H specification, and display size ' +
        'conditioning when there are several. The H specification: exactly one HLPRCD / HLPPNLGRP / HLPDOC, up to one HLPBDY or HLPEXCLD, at least one HLPARA; ' +
        'not in SFL records or in SFLCTL records associated with SFLMSGRCD. Option indicators are not valid for this keyword.'
    },
    HLPBDY: {
      levels: ['help'],
      noParameters: true,
      optionIndicators: 'valid',
      // Partitions the accumulated H specifications into sublists; the H specification carrying HLPBDY is before the boundary.
      partitionsHelpSpecifications: true,
      atMostOneOfPerHelpSpecification: ['HLPBDY', 'HLPEXCLD'],
      // The HLPDOC exclusion is HLPDOC's entry (see the note above).
      ddsReference:
        'HLPBDY (Help Boundary) (~line 6773): help-specification-level; limits the online help available, partitioning the accumulated H specifications ' +
        'into sublists (the H specification with HLPBDY is before the boundary); with HLPRCD the user reaches only the sublist of the selected H specification, ' +
        'with HLPPNLGRP the sublists determine the extended help. This keyword has no parameters. Option indicators are valid for this keyword. (The ' +
        'HLPDOC exclusion is HLPDOC\'s entry; up to one HLPBDY or HLPEXCLD is from HLPARA\'s section.)'
    },
    HLPEXCLD: {
      levels: ['help'],
      noParameters: true,
      optionIndicators: 'valid',
      // Allowed only on help-specifications that specify a HLPPNLGRP keyword.
      requiresOnHelpSpecification: ['HLPPNLGRP'],
      atMostOneOfPerHelpSpecification: ['HLPBDY', 'HLPEXCLD'],
      // At least one instance of each HLPPNLGRP parameter should not have HLPEXCLD (a run-time error otherwise).
      eachHlppnlgrpParameterNeedsOneNonExcluded: true,
      ddsReference:
        'HLPEXCLD (Help Excluded) (~line 7003): help-specification-level; the help of this H specification is not shown as extended help but is still ' +
        'item-specific help. This keyword has no parameters. Allowed only on H specifications that specify HLPPNLGRP. At least one instance of each HLPPNLGRP ' +
        'parameter should not carry HLPEXCLD (if all are excluded, a run-time error is issued when Help is pressed in that panel group\'s help area). Without it, ' +
        'extended help is the file-level HLPPNLGRP help plus the HLPPNLGRP of every active H specification. Option indicators are valid for this keyword.'
    },
    // Keywords valid at several levels: CHANGE, OVRATR, OVRDTA, PUTRETAIN,
    // TEXT, INDTXT. Every fact below was re-read from DDS_Keyword_V7r6.txt (the
    // section named in each ddsReference), NOT taken from the code. The point of
    // this slice is the per-level scope fact (file / record / field). Pure
    // refactor: nothing here adds a guard; rules with no guard yet are recorded
    // here and logged as findings in keywordFixes.md.
    //   * Option indicators: CHANGE, INDTXT and TEXT are in NO_OPTION_INDICATORS
    //     (levels agree with `levels` below; a test pins the two); OVRATR, OVRDTA
    //     and PUTRETAIN accept them.
    //   * PUTRETAIN / PUTOVR: the exclusion lives once, on PUTOVR's entry (the
    //     owner's list is the only one isMutex reads), so it is NOT repeated here.
    //   * CHANGE and INDTXT are repeatable response / option indicator rows
    //     (RECORD_INDICATOR_KEYWORDS); the System/36 warning on CHANGE lives in
    //     S36E_RESTRICTIONS. Neither is repeated here.
    CHANGE: {
      levels: ['record', 'field'],
      parameters: 'required',
      parameterGrammar: "CHANGE(response-indicator ['text'])",
      textQuoted: true,
      textMaxLength: 50,
      optionIndicators: 'notValid',
      // Record level: any input-capable field in the record format has its modified
      // data tag (MDT) on. Field level: that input-capable field has its MDT on.
      setsIndicatorWhen: {
        record: 'any input-capable field in the record format has its MDT on',
        field: 'the input-capable field has its MDT on'
      },
      // The MDT is also set by DSPATR(MDT) and by retyping the same data.
      notSetByCommandKeys: ['CAnn', 'Help', 'Print', 'Home', 'Clear'],
      indicatorStaysOnThroughValidityErrors: true,
      ddsReference:
        'CHANGE (~line 2592): record- or field-level; sets the response indicator on an input operation when an input-capable field has its MDT on ' +
        '(record level: any such field; field level: that field). Format CHANGE(response-indicator [\'text\']); the single quotation marks are required ' +
        'and the text is truncated to 50 characters. Not set when a command attention key (CAnn, Help, Print, Home, Clear) is pressed; stays on through ' +
        'validity checking errors until the record reaches the program. "Option indicators are not valid for this keyword."'
    },
    OVRATR: {
      levels: ['record', 'field'],
      parameters: 'none',
      optionIndicators: 'valid',
      usedWith: 'PUTOVR',
      canCombineWith: ['OVRDTA'],
      // "When OVRATR is specified at both the record and field level, the field level specification is used for that field."
      fieldLevelWinsOverRecordLevel: true,
      overridableAttributes: ['CHECK(ER)', 'CHECK(ME)', 'DSPATR (all except OID and SP)', 'DUP'],
      // Field level: valid only on these field types. Record level: applies to each of them.
      fieldTypes: ['input-only', 'output-only', 'input/output', 'constant'],
      fieldLevel: { allowedUsage: ['I', 'O', 'B'], constantFields: true },
      ddsReference:
        'OVRATR (~line 9267): field- or record-level; with PUTOVR overrides the display attributes of a field or record already on the display ' +
        '(CHECK(ER), CHECK(ME), DSPATR except OID and SP, DUP). "This keyword has no parameters." Can be used with OVRDTA; the field-level ' +
        'specification wins over the record-level one. At field level valid only on input-only, output-only, input/output and constant fields; at ' +
        'record level it applies to each of them. "Option indicators are valid for this keyword."'
    },
    OVRDTA: {
      levels: ['record', 'field'],
      parameters: 'none',
      optionIndicators: 'valid',
      usedWith: 'PUTOVR',
      canCombineWith: ['OVRATR'],
      fieldLevelWinsOverRecordLevel: true,
      // "OVRDTA is required if the DFT keyword is specified for output-only or input/output fields."
      requiredWhenFieldHas: { keyword: 'DFT', onUsage: ['O', 'B'] },
      fieldTypes: ['output-only', 'input/output', 'message'],
      fieldLevel: { allowedUsage: ['O', 'B', 'M'], constantFields: false },
      ddsReference:
        'OVRDTA (~line 9305): field- or record-level; with PUTOVR overrides the data contents of a field or record already on the display. ' +
        '"This keyword has no parameters." Can be used with OVRATR; the field-level specification wins over the record-level one. Required if DFT ' +
        'is specified for output-only or input/output fields. At field level valid only on output-only, input/output and message fields; at record ' +
        'level it applies to each of them. "Option indicators are valid for this keyword."'
    },
    PUTRETAIN: {
      levels: ['record', 'field'],
      parameters: 'none',
      optionIndicators: 'valid',
      // "The OVERLAY keyword must be specified whenever PUTRETAIN is specified." Without it PUTRETAIN is ignored.
      requiresRecordKeyword: 'OVERLAY',
      ignoredWithoutOverlay: true,
      // Applies only to the record format it is specified for, and only if that record is already displayed.
      appliesOnlyToRecordAlreadyDisplayed: true,
      // "This keyword can be specified for more than one field of a record format, but only once per field",
      // and at the record level and the field level of the same record format.
      oncePerField: true,
      allowedAtBothLevelsOfOneRecord: true,
      // A warning is issued at file creation when the record also has DSPMOD; PUTRETAIN is ignored when the display mode changes.
      warnsAtCreationWith: ['DSPMOD'],
      ignoredWhenDisplayModeChanges: true,
      recommendedFileCreationOption: 'RSTDSP(*YES)',
      ddsReference:
        'PUTRETAIN (~line 9919): record- or field-level; with OVERLAY stops the system deleting data already on the display when the record is ' +
        'displayed again. "This keyword has no parameters." OVERLAY must be specified whenever PUTRETAIN is, otherwise PUTRETAIN is ignored. Applies ' +
        'only to the record format it is specified for and only if that record is already displayed; may be on more than one field but once per field, ' +
        'and at both levels of one record. Cannot be specified with PUTOVR (recorded once, on PUTOVR). Warning at creation with DSPMOD; RSTDSP(*YES) ' +
        'recommended. "Option indicators are valid for this keyword."'
    },
    INDTXT: {
      levels: ['file', 'record', 'field'],
      parameters: 'required',
      parameterGrammar: "INDTXT(indicator 'indicator-text')",
      textRequired: true,
      textQuoted: true,
      textMaxLength: 50,
      optionIndicators: 'notValid',
      // "You can specify the keyword once for each response and option indicator."
      oncePerIndicator: true,
      // "When an indicator has been given a text assignment ..., no other text assignment is allowed."
      noOtherTextAssignmentAllowed: true,
      // The keyword does not put the indicator in the record area; with the indicator unused the text is lost without a diagnostic.
      doesNotAddIndicatorToRecordArea: true,
      textLostSilentlyWhenIndicatorUnused: true,
      ddsReference:
        'INDTXT (~line 7517): file-, record- or field-level; associates descriptive text with a response or option indicator, once per indicator. ' +
        'Format INDTXT(indicator \'indicator-text\'); the text is required, the single quotation marks are required, truncated to 50 characters. ' +
        'It does not put the indicator in the input or output record area; if the indicator is not used elsewhere the text is lost without a ' +
        'diagnostic; an indicator that already has text (from this keyword or response indicator text) cannot be given another. ' +
        '"Option indicators are not valid for this keyword."'
    },
    TEXT: {
      levels: ['record', 'field'],
      parameters: 'required',
      parameterGrammar: "TEXT('description')",
      textQuoted: true,
      // "only the first 50 characters are used by the high-level language compiler."
      textMaxLength: 50,
      optionIndicators: 'notValid',
      // "TEXT is valid for any record format or field, except a SFLMSGKEY or SFLPGMQ field."
      validForAnyRecordFormat: true,
      notValidOnFieldsWithKeyword: ['SFLMSGKEY', 'SFLPGMQ'],
      // No file-level form is documented (Task I-6 removed the file-level TEXT row).
      fileLevelForm: false,
      ddsReference:
        'TEXT (~line 12810): record- or field-level; a description for program documentation. "TEXT is valid for any record format or field, ' +
        'except a SFLMSGKEY or SFLPGMQ field." Format TEXT(\'description\'); the single quotation marks are required, only the first 50 characters ' +
        'are used by the compiler. No file-level form is documented. "Option indicators are not valid for this keyword."'
    },
    // Choice and menu-bar field keywords: MNUBARCHC, MNUBARSEP, CHOICE, CHCACCEL,
    // CHCAVAIL, CHCCTL, CHCSLT, CHCUNAVAIL. Every fact below was re-read from
    // DDS_Keyword_V7r6.txt (the section named in each ddsReference), NOT taken from
    // the code. All eight are field-level keywords. Pure refactor: nothing here
    // adds a guard; rules with no guard yet are recorded here and logged as
    // findings in keywordFixes.md.
    //   * Option indicators: CHCACCEL and CHCCTL are in NO_OPTION_INDICATORS (a test
    //     pins the two together); the other six accept them.
    //   * The three colour-state keywords (CHCAVAIL, CHCUNAVAIL, CHCSLT) stay listed
    //     in CHOICE_COLOR_STATE_KEYWORDS and PSHBTNFLD's whitelist keeps saying which
    //     of them a push-button field may carry; the `requiresOneOfOnField` lists
    //     below are the keyword's own section and a test cross-checks both ways.
    //   * Where the record-level facts (MNUBAR's whitelist, PULLDOWN, SNGCHCFLD /
    //     MLTCHCFLD parameters) live on their own entries they are NOT repeated.
    MNUBARCHC: {
      levels: ['field'],
      parameters: 'required',
      parameterGrammar: 'MNUBARCHC(choice-number pull-down-record choice-text [&return-field])',
      optionIndicators: 'valid',
      choiceNumber: { min: 1, max: 99, uniqueWithinMenuBarField: true },
      pullDownRecord: { required: true, mustExistInFile: true, mustHaveKeyword: 'PULLDOWN' },
      choiceText: {
        required: true,
        forms: ['character string', '&field-name'],
        // The field must exist in the menu-bar record: character, usage P.
        textField: { mustExistInMenuBarRecord: true, dataType: 'A', usage: 'P' },
        mustFitOneLine: true,
        // The first choice on a line begins at position 3 and a trailing blank is always inserted.
        firstChoiceStartsAtPosition: 3,
        maxLength: { '24x80': 76, '27x132': 128 },
        trailingBlanksTruncated: true,
        blanksBetweenChoices: 3
      },
      maxLinesForMenuBarField: 12,
      maxLinesIncludeSeparatorLine: true,
      // How the line count is worked out. The reference gives the formula (sum of the choice-text
      // lengths plus 3 blanks between choices) but not the line width or the wrapping, so these two
      // are decisions, not quotations: a line holds as many text positions as the longest single
      // choice the reference allows (76 on 80 columns, 128 on 132, i.e. columns minus 4), and a
      // choice that does not fit moves whole to the next line. The worked example (78 positions on
      // a 24x80 display occupy 2 lines) rules out any width of 78 or more.
      lineLayout: { textPositionsAreColumnsMinus: 4, choiceMovesWholeToNextLine: true, separatorCountsAsLine: true },
      mnemonic: {
        marker: '>',
        literalMarkerByDoubling: true,
        markerCannotBeTheMnemonic: true,
        singleByteNonBlank: true,
        onlyOneInChoiceText: true,
        notSharedBetweenChoices: true
      },
      // The optional hidden field that tells the program a choice was selected.
      returnField: { optional: true, mustExistInMenuBarRecord: true, usage: 'H', dataType: 'Y', length: 2, decimalPositions: 0 },
      // The menu-bar field itself: input-capable numeric, length 2, row 1 column 2.
      menuBarField: { inputCapable: true, dataType: 'Y', length: 2, decimalPositions: 0, row: 1, column: 2 },
      requiresOnRecord: ['MNUBAR'],
      multiplePerField: true,
      allowedOnSameField: ['ALIAS', 'CHCAVAIL', 'CHCSLT', 'INDTXT', 'MNUBARSEP', 'TEXT'],
      ddsReference:
        'MNUBARCHC (~line 8211): field-level; defines a choice for a menu-bar field. Format MNUBARCHC(choice-number pull-down-record choice-text [&return-field]). ' +
        'The choice number (1 to 99) must be unique within the menu-bar field; the pull-down record must exist in the file and contain PULLDOWN. The choice text ' +
        '(character string or a character usage-P field of the menu-bar record) must fit on one line: the first choice begins at position 3, so at most 76 ' +
        'characters on a 24 x 80 display and 128 on 27 x 132; 3 blanks between choices; a menu-bar field takes at most 12 lines including the separator line. ' +
        '">" marks the mnemonic (doubled to mean the character itself; it cannot be the mnemonic; single-byte, not blank, one per choice text, not shared between choices). ' +
        'The optional return-field is a 2-digit numeric hidden field; the menu-bar field is input-capable Y 2,0 at row 1 column 2. The MNUBAR keyword is required at ' +
        'the record level. Allowed alongside it on the field: ALIAS, CHCAVAIL, CHCSLT, INDTXT, MNUBARSEP, TEXT. "Option indicators are valid for this keyword."'
    },
    MNUBARSEP: {
      levels: ['field'],
      parameters: 'required',
      parameterGrammar: 'MNUBARSEP([color] [display-attribute] [character])',
      onParameterRequired: 'one',
      optionIndicators: 'valid',
      color: { wrapper: '*COLOR', values: ['BLU', 'GRN', 'PNK', 'RED', 'TRQ', 'YLW', 'WHT'], default: 'BLU', ignoredOnMonochrome: true },
      displayAttribute: { wrapper: '*DSPATR', values: ['BL', 'CS', 'HI', 'ND', 'RI', 'UL'], default: 'normal (or low) intensity' },
      // HI, RI and UL make the separator line not display.
      attributesThatHideSeparator: ['HI', 'RI', 'UL'],
      character: { wrapper: '*CHAR', length: 1, default: '-', recommendedInvariantCharactersOnly: true },
      requiresOnRecord: ['MNUBAR'],
      // The *NOSEPARATOR parameter cannot be used on MNUBAR when MNUBARSEP is specified.
      conflictsWithMnubarParameter: '*NOSEPARATOR',
      ifMoreThanOneColorKeywordFirstSpecifiedIsUsed: true,
      ddsReference:
        'MNUBARSEP (~line 8485): field-level, on a menu-bar field; sets the colour, display attributes or character of the menu-bar separator line. ' +
        'Format MNUBARSEP([color] [display-attribute] [character]); one parameter must be specified. (*COLOR BLU|GRN|PNK|RED|TRQ|YLW|WHT), default blue, ignored on a ' +
        'monochrome display; (*DSPATR BL|CS|HI|ND|RI|UL), default normal intensity, HI / RI / UL cause the separator line not to be displayed; (*CHAR \'c\'), one character, ' +
        'default a dash. The MNUBAR keyword must be on the record; the *NOSEPARATOR parameter cannot be used on MNUBAR if MNUBARSEP is specified. ' +
        '"Option indicators are valid for this keyword."'
    },
    CHOICE: {
      levels: ['field'],
      parameters: 'required',
      parameterGrammar: 'CHOICE(choice-number choice-text [*SPACEB])',
      optionIndicators: 'valid',
      choiceNumber: { min: 1, max: 99, uniqueWithinSelectionField: true },
      choiceText: {
        required: true,
        forms: ['character string', '&field-name'],
        textField: { mustExistInSameRecord: true, dataType: 'A', usage: 'P' },
        // The sum of position, choice-number width, text and gutter must fit the smallest display size.
        mustFitSmallestDisplaySize: true,
        maxWidth: { '24x80': 80, '27x132': 132 }
      },
      mnemonic: {
        marker: '>',
        literalMarkerByDoubling: true,
        markerCannotBeTheMnemonic: true,
        singleByteNonBlank: true,
        onlyOneInChoiceText: true,
        notSharedBetweenChoices: true,
        ignoredWhenRenderedWithNumericSelection: true
      },
      spaceBefore: { parameter: '*SPACEB', optional: true },
      // Vertical selection fields get a blank line between non-consecutive choice numbers; horizontal ones do not.
      blankLineAutomaticallyBetweenNonConsecutiveVertical: true,
      requiresOneOfOnField: ['SNGCHCFLD', 'MLTCHCFLD'],
      multiplePerField: true,
      allChoicesMustFitSmallestDisplaySize: true,
      // When an option indicator turns a CHOICE off the list of choices is compressed.
      choiceTurnedOffCompressesList: true,
      ddsReference:
        'CHOICE (~line 3756): field-level; defines a choice for a selection field. Format CHOICE(choice-number choice-text [*SPACEB]). The choice number (1 to 99) ' +
        'is required and must be unique within the selection field; the choice text is a character string or a character usage-P field of the same record and must ' +
        'fit the smallest display size (80 on 24 x 80, 132 on 27 x 132). ">" marks the mnemonic (doubled to mean the character itself; single-byte, not blank, ' +
        'one per text, not shared between choices). *SPACEB inserts a blank space before the choice; vertical selection fields get one automatically between ' +
        'non-consecutive choice numbers. SNGCHCFLD or MLTCHCFLD must also be on the field. Several CHOICE keywords per field. "Option indicators are valid for this ' +
        'keyword. When a CHOICE keyword is turned off, the list of choices is compressed."'
    },
    CHCACCEL: {
      levels: ['field'],
      parameters: 'required',
      parameterGrammar: 'CHCACCEL(choice-number accelerator-text)',
      optionIndicators: 'notValid',
      choiceNumber: { min: 1, max: 99 },
      acceleratorText: {
        required: true,
        forms: ['character string', '&field-name'],
        textField: { mustExistInSameRecord: true, dataType: 'A', usage: 'P' },
        placedSpacesRightOfLongestChoiceText: 3,
        // Together with the longest choice text it must not exceed the smallest display size's width.
        combinedWithChoiceTextMustFitSmallestDisplaySize: true
      },
      // CHCACCEL only describes the accelerator key; it does not enable the function key.
      doesNotEnableFunctionKey: true,
      requiresOnField: ['SNGCHCFLD'],
      requiresOnRecord: ['PULLDOWN'],
      ddsReference:
        'CHCACCEL (~line 2653): field-level, on a single-choice selection field in a pull-down record; supplies the text describing the accelerator key (it does not ' +
        'enable the function key). Format CHCACCEL(choice-number accelerator-text); choice number 1 to 99; the text is a character string or a character usage-P ' +
        'field of the same record, placed 3 spaces right of the longest choice text, the two together not wider than the smallest display size. Allowed only on ' +
        'SNGCHCFLD fields in PULLDOWN records. "Option indicators are not valid for this keyword."'
    },
    CHCAVAIL: {
      levels: ['field'],
      parameters: 'required',
      parameterGrammar: 'CHCAVAIL([color] [display-attributes])',
      onParameterRequired: 'one',
      optionIndicators: 'valid',
      color: {
        wrapper: '*COLOR',
        values: ['BLU', 'GRN', 'PNK', 'RED', 'TRQ', 'YLW', 'WHT'],
        default: 'GRN',
        defaultAppliesTo: ['menu bar', 'selection field'],
        ignoredOnMonochrome: true,
        choiceTextFrom: ['MNUBARCHC', 'CHOICE', 'PSHBTNCHC']
      },
      displayAttribute: {
        wrapper: '*DSPATR',
        values: ['BL', 'CS', 'HI', 'ND', 'RI', 'UL'],
        defaults: { menuBar: 'high intensity', selectionField: 'normal (or low) intensity' }
      },
      appliesTo: ['menu bar', 'push button', 'selection field', 'subfile single-choice list', 'subfile multiple-choice list'],
      // Allowed on a field only if it has one or more of these.
      requiresOneOfOnField: ['PSHBTNCHC', 'CHOICE', 'MNUBARCHC'],
      // Also allowed on a subfile control record that uses one of these.
      allowedOnSubfileControlRecordWithOneOf: ['SFLSNGCHC', 'SFLMLTCHC'],
      ddsReference:
        'CHCAVAIL (~line 2700): field-level; colour / display attributes of the available choices in a menu bar, push button, selection field, or subfile single- or ' +
        'multiple-choice list. Format CHCAVAIL([color] [display-attributes]); one parameter must be specified. (*COLOR BLU|GRN|PNK|RED|TRQ|YLW|WHT), default green, ' +
        'ignored on a monochrome display; (*DSPATR BL|CS|HI|ND|RI|UL), default high intensity in a menu bar and normal intensity in a selection field. Allowed on a field ' +
        'only if it has one or more PSHBTNCHC, CHOICE or MNUBARCHC keywords; also on a subfile control record that uses SFLSNGCHC or SFLMLTCHC. "Option indicators are ' +
        'valid for this keyword."'
    },
    CHCCTL: {
      levels: ['field'],
      parameters: 'required',
      parameterGrammar: 'CHCCTL(choice-number &control-field [msg-id [msg-lib/]msg-file]) or CHCCTL(choice-number &control-field [&msg-id [&msg-lib/]&msg-file])',
      optionIndicators: 'notValid',
      choiceNumber: { min: 1, max: 99 },
      // The 1-byte numeric hidden field holding the control value.
      controlField: { required: true, mustBeInSameRecord: true, dataType: 'Y', length: 1, decimalPositions: 0, usage: 'H' },
      controlValues: CHOICE_CONTROL_VALUES,
      // The cursor restrictions apply only to displays attached to a controller with the enhanced interface.
      cursorRestrictionsNeedEnhancedInterfaceController: true,
      message: {
        optional: true,
        defaultMessage: 'CPD919B',
        messageFileRequiredWithMessageId: true,
        libraryDefault: '*LIBL',
        messageIdField: { mustExistInSameRecord: true, dataType: 'A', usage: 'P', length: 7 },
        messageFileOrLibraryField: { mustExistInSameRecord: true, dataType: 'A', usage: 'P', length: 10 }
      },
      // A CHOICE or PSHBTNCHC keyword with the same choice number must be on the field.
      requiresOneOfOnFieldWithSameChoiceNumber: ['CHOICE', 'PSHBTNCHC'],
      ddsReference:
        'CHCCTL (~line 2833): field-level, on a selection field; controls the availability of a choice. Format CHCCTL(choice-number &control-field [msg-id [msg-lib/]msg-file]) ' +
        'or with the message parts as &fields. The choice number (1 to 99) and the control field are required; the control field is a 1-byte numeric (Y, 0 decimals) hidden ' +
        'field in the same record whose output values are 0 available, 1 selected, 2 / 3 / 4 unavailable (cursor restrictions only on enhanced-interface controllers) and ' +
        'whose input values are 0 unselected, 1 selected. The optional message is shown when an unavailable choice is selected, default CPD919B; a message-id field is A / P / 7, ' +
        'a library or file field A / P / 10, the message file is required with a message id, *LIBL is searched if the library is omitted. A CHOICE or PSHBTNCHC keyword with the ' +
        'same choice number must be on the field. "Option indicators are not valid for this keyword."'
    },
    CHCSLT: {
      levels: ['field'],
      parameters: 'required',
      parameterGrammar: 'CHCSLT([color] [display-attributes])',
      onParameterRequired: 'one',
      optionIndicators: 'valid',
      color: {
        wrapper: '*COLOR',
        values: ['BLU', 'GRN', 'PNK', 'RED', 'TRQ', 'YLW', 'WHT'],
        default: 'WHT',
        defaultAppliesTo: ['menu bar', 'selection field in a pull-down menu that does not display selection characters'],
        ignoredOnMonochrome: true,
        choiceTextFrom: ['MNUBARCHC', 'CHOICE']
      },
      displayAttribute: {
        wrapper: '*DSPATR',
        values: ['BL', 'CS', 'HI', 'ND', 'RI', 'UL'],
        defaults: { menuBar: 'normal (or low) intensity', selectionFieldInPullDownWithoutSelectionCharacters: 'high intensity' }
      },
      // For a selection field in a pull-down menu with PULLDOWN(*NOSLTIND); also a subfile control record.
      appliesTo: ['menu bar', 'selection field', 'subfile single-choice list', 'subfile multiple-choice list'],
      requiresOneOfOnField: ['MNUBARCHC', 'CHOICE'],
      // With CHOICE (rather than MNUBARCHC) the record must have PULLDOWN(*NOSLTIND).
      whenChoiceInsteadOfMnubarchcRecordNeeds: 'PULLDOWN(*NOSLTIND)',
      // On a subfile control record SFLSNGCHC or SFLMLTCHC must also be there.
      onSubfileControlRecordRequiresOneOf: ['SFLSNGCHC', 'SFLMLTCHC'],
      ddsReference:
        'CHCSLT (~line 2920): field-level; colour / display attributes of a selected choice in a menu bar or selection field (a selection field in a PULLDOWN(*NOSLTIND) ' +
        'pull-down menu), and of a subfile single- or multiple-choice list. Format CHCSLT([color] [display-attributes]); one parameter must be specified. (*COLOR ...), ' +
        'default white, ignored on monochrome; (*DSPATR BL|CS|HI|ND|RI|UL), default normal intensity in a menu bar and high intensity in a selection field of a pull-down ' +
        'that does not display selection characters. MNUBARCHC or CHOICE must also be on the field; with CHOICE the record needs PULLDOWN(*NOSLTIND); on a subfile ' +
        'control record SFLSNGCHC or SFLMLTCHC is required. "Option indicators are valid for this keyword."'
    },
    CHCUNAVAIL: {
      levels: ['field'],
      parameters: 'required',
      parameterGrammar: 'CHCUNAVAIL([color] [display-attributes])',
      onParameterRequired: 'one',
      optionIndicators: 'valid',
      color: {
        wrapper: '*COLOR',
        values: ['BLU', 'GRN', 'PNK', 'RED', 'TRQ', 'YLW', 'WHT'],
        default: 'BLU',
        defaultAppliesTo: ['selection field'],
        ignoredOnMonochrome: true,
        choiceTextFrom: ['CHOICE', 'PSHBTNCHC']
      },
      displayAttribute: {
        wrapper: '*DSPATR',
        values: ['BL', 'CS', 'HI', 'ND', 'RI', 'UL'],
        defaults: { selectionFieldOnMonochrome: 'normal (or low) intensity' },
        // On a monochrome display the first character of an unavailable choice is overwritten with an asterisk.
        monochromeFirstCharacterOverwrittenWith: '*'
      },
      appliesTo: ['selection field', 'push button field', 'subfile single-choice list', 'subfile multiple-choice list'],
      requiresOneOfOnField: ['CHOICE', 'PSHBTNCHC'],
      onSubfileControlRecordRequiresOneOf: ['SFLSNGCHC', 'SFLMLTCHC'],
      ddsReference:
        'CHCUNAVAIL (~line 3002): field-level; colour / display attributes of the unavailable choices in a selection field or push button field (and subfile single- or ' +
        'multiple-choice lists). Format CHCUNAVAIL([color] [display-attributes]); one parameter must be specified. (*COLOR ...), default blue, ignored on monochrome; ' +
        '(*DSPATR BL|CS|HI|ND|RI|UL), default normal intensity on monochrome, where the first character of an unavailable choice is overwritten with an asterisk. ' +
        'On a field it is allowed only if there are also one or more CHOICE or PSHBTNCHC keywords; on a subfile control record only if SFLSNGCHC or SFLMLTCHC is also ' +
        'used. "Option indicators are valid for this keyword."'
    },
  };

  /**
   * The field-level keywords that supply a CONSTANT field's value from the
   * system rather than from literal text: DATE, TIME, USER, SYSNAME
   * (DDS_Keyword_V7r6.txt, "Constant fields" ~line 671: "specify no value"
   * for each; the HTML / DFT / MSGCON ways to supply a constant are separate
   * facts). Declared in the designer's own choice order (IBM's list reads
   * DATE, TIME, SYSNAME, USER); the engine's placeholder preview takes the
   * first one present in this order. `description` is the dropdown wording.
   * Previously the four names were hand-copied in buildWebviewTemplate.js
   * (the constant field's list, the Add placeholder dropdown, and two copies
   * of the labels) and again as the engine's if/else chain.
   */
  var SYSTEM_VALUE_CONSTANT_KEYWORDS = [
    { name: 'DATE', description: 'current date' },
    { name: 'TIME', description: 'current time' },
    { name: 'USER', description: 'signed-on user profile' },
    { name: 'SYSNAME', description: 'system name' }
  ];

  /** The system-value constant keyword names, in declared order (a fresh
   *  array). */
  function systemValueConstantKeywords() {
    return SYSTEM_VALUE_CONSTANT_KEYWORDS.map(function (e) { return e.name; });
  }
  /** Whether `name` is exactly a system-value constant keyword (DATE, TIME,
   *  USER, SYSNAME). Case-sensitive, like the keyword names it is compared
   *  against; non-strings and inherited property names are not. */
  function isSystemValueConstantKeyword(name) {
    if (typeof name !== 'string') return false;
    return SYSTEM_VALUE_CONSTANT_KEYWORDS.some(function (e) { return e.name === name; });
  }
  /** The dropdown label for a system-value keyword ('DATE - current date'),
   *  or null for a name that is not one. */
  function systemValueConstantLabel(name) {
    if (typeof name !== 'string') return null;
    for (var i = 0; i < SYSTEM_VALUE_CONSTANT_KEYWORDS.length; i++) {
      var e = SYSTEM_VALUE_CONSTANT_KEYWORDS[i];
      if (e.name === name) return e.name + ' - ' + e.description;
    }
    return null;
  }

  /**
   * The keywords valid only when position 29 is R (REFFLD, DLTCHK,
   * DLTEDT), in entry order. A fresh array.
   */
  function referenceFlagRequiredKeywords() {
    return Object.keys(RECORD_TYPES).filter(function (k) { return RECORD_TYPES[k].requiresReferenceFlag === true; });
  }
  /**
   * True when `keywordName` is valid only on a reference field (R in
   * position 29).
   */
  function requiresReferenceFlag(keywordName) {
    var e = Object.prototype.hasOwnProperty.call(RECORD_TYPES, keywordName) ? RECORD_TYPES[keywordName] : null;
    return !!(e && e.requiresReferenceFlag === true);
  }
  /**
   * True when `keywordName` belongs to a constant field only (HLPID). Not the
   * same fact as constantFieldOnly, which marks the keywords that SUPPLY a
   * constant's value.
   */
  function validOnlyOnConstantField(keywordName) {
    var e = Object.prototype.hasOwnProperty.call(RECORD_TYPES, keywordName) ? RECORD_TYPES[keywordName] : null;
    return !!(e && e.validOnlyOnConstantField === true);
  }
  /**
   * The numeric range a help identifier (HLPID) may take, as a fresh {
   * min, max }; null for a keyword with no such fact.
   */
  function helpIdentifierRange() {
    var e = RECORD_TYPES.HLPID;
    return e && e.identifierRange ? { min: e.identifierRange.min, max: e.identifierRange.max } : null;
  }

  /**
   * The enforceable rules the entries state, in one fresh object: {
   * requireReferenceFlag: [names], aliasUnique, help: { min, max, unique,
   * constantOnly, required } }. Nothing here is copied from the guard; the
   * guard reads only this.
   */
  function referenceFieldRules() {
    var h = RECORD_TYPES.HLPID;
    return {
      requireReferenceFlag: referenceFlagRequiredKeywords(),
      aliasUnique: RECORD_TYPES.ALIAS.alternativeNameMustBeUnique === true,
      help: {
        min: h.identifierRange.min,
        max: h.identifierRange.max,
        unique: h.uniqueWithinRecord === true,
        constantOnly: h.validOnlyOnConstantField === true,
        required: h.parameterRequired === true
      }
    };
  }

  /**
   * The entry for a constant / system-value keyword, or null (own-property
   * safe, case-sensitive, non-strings are not keywords).
   */
  function constantKeywordEntry(name) {
    if (typeof name !== 'string' || !Object.prototype.hasOwnProperty.call(RECORD_TYPES, name)) return null;
    var e = RECORD_TYPES[name];
    return (e.constantFieldOnly || e.noParameters || e.msgconParameters) ? e : null;
  }

  /** The keywords that supply an unnamed constant field's value (DATE,
   *  TIME, USER, SYSNAME, MSGCON) in entry order (a fresh array). */
  function constantFieldOnlyKeywords() {
    return Object.keys(RECORD_TYPES).filter(function (k) { return RECORD_TYPES[k].constantFieldOnly === true; });
  }
  /** Whether `name` is one of those keywords. */
  function isConstantFieldOnlyKeyword(name) {
    var e = constantKeywordEntry(name);
    return !!(e && e.constantFieldOnly === true);
  }
  /** The keywords the keyword's section lists as allowed on the same
   *  field besides its location (a fresh array), or null when the section
   *  lists none or `name` is not a constant keyword. */
  function listedCompanionKeywords(name) {
    var e = constantKeywordEntry(name);
    return e && e.listedCompanionKeywords ? e.listedCompanionKeywords.slice() : null;
  }
  /** Whether that list is stated as exclusive ("only" - TIME alone). */
  function companionsStatedAsOnly(name) {
    var e = constantKeywordEntry(name);
    return !!(e && e.companionsStatedAsOnly === true);
  }
  /** Whether the keyword's section says it has no parameters (TIME, USER,
   *  SYSNAME, NOCCSID). False for DATE and MSGCON, which take some, and for
   *  any other name. */
  function constantKeywordTakesNoParameters(name) {
    var e = constantKeywordEntry(name);
    return !!(e && e.noParameters === true);
  }
  /**
   * The field-level keywords whose section says "no parameters" (TIME,
   * USER, SYSNAME, NOCCSID), in entry order (a fresh array). Not the
   * record-level no-parameter keywords.
   */
  function fieldKeywordsWithoutParameters() {
    return Object.keys(RECORD_TYPES).filter(function (k) { return RECORD_TYPES[k].fieldLevel === true && RECORD_TYPES[k].noParameters === true; });
  }
  /** DATE([*JOB|*SYS] [*Y|*YY]) - the two parameter domains and the
   *  defaults, as a fresh object. */
  function dateParameters() {
    var d = RECORD_TYPES.DATE.dateParameters;
    return { source: d.source.slice(), year: d.year.slice(), defaults: { source: d.defaults.source, year: d.defaults.year } };
  }
  /** A length the keyword's section states outright (USER 10, SYSNAME 8),
   *  or null. */
  function fixedDisplayLength(name) {
    var e = constantKeywordEntry(name);
    return e && typeof e.fixedLength === 'number' ? e.fixedLength : null;
  }
  /**
   * IBM's own slash patterns for the two date edit codes
   * (DDS_Keyword_V7r6.txt, EDTCDE table notes 2 and 3, ~line 5671 and 5680),
   * keyed by the number of digits in the field. `n` is a digit, `/` is the
   * separator (its character is the job attribute DATSEP at run time, "/" by
   * default - the pattern fixes how MANY separator characters there are, so
   * the display width is exact). Y: "nn/n"... "nn/nn/nnnn". W: "nn/nnn"...
   * "nnnn/nn/nn". A digit count not in a code's list is not a date IBM
   * defines the pattern for.
   */
  var DATE_EDIT_CODE_PATTERNS = {
    Y: { 3: 'nn/n', 4: 'nn/nn', 5: 'nn/nn/n', 6: 'nn/nn/nn', 7: 'nnn/nn/nn', 8: 'nn/nn/nnnn' },
    W: { 5: 'nn/nnn', 6: 'nnnn/nn', 7: 'nnnn/nnn', 8: 'nnnn/nn/nn' }
  };
  /**
   * The job attribute DATFMT (and DATSEP) as the DATE keyword's own section
   * describes them (DDS_Keyword_V7r6.txt ~line 4505): "the job attribute
   * DATFMT determines the order of the month, day, and year. (DATFMT can be
   * MDY, DMY, YMD, or JUL... DATSEP can be a slash (/), dash (-), period
   * (.), or comma (,).)" The API that reads them (QUSRJOBI JOBI0400, Date
   * format CHAR(4) and Date separator CHAR(1)) returns the format with its
   * asterisk and may return a blank separator (job attribute *BLANK), which
   * is accepted as a plain blank. `order` is the digit order of the date in
   * the field; Julian is year then day-of-year.
   */
  var JOB_DATE_FORMATS = {
    '*MDY': { order: 'MDY', julian: false },
    '*DMY': { order: 'DMY', julian: false },
    '*YMD': { order: 'YMD', julian: false },
    '*JUL': { order: 'YDDD', julian: true }
  };
  var JOB_DATE_SEPARATORS = ['/', '-', '.', ',', ' '];
  /** A job date info { dateFormat: '*MDY', dateSeparator: '/' } checked and
   *  normalised (upper-case format; a missing separator becomes the default
   *  slash IBM documents), or null for anything unusable - the caller then
   *  keeps its design-time assumption. */
  function normalizeJobDate(info) {
    if (!info || typeof info !== 'object') return null;
    var f = String(info.dateFormat == null ? '' : info.dateFormat).trim().toUpperCase();
    if (f && f.charAt(0) !== '*') f = '*' + f;
    if (!Object.prototype.hasOwnProperty.call(JOB_DATE_FORMATS, f)) return null;
    var sep = info.dateSeparator;
    if (sep == null || sep === '') sep = '/';
    sep = String(sep).charAt(0);
    if (JOB_DATE_SEPARATORS.indexOf(sep) < 0) return null;
    return { dateFormat: f, dateSeparator: sep };
  }

  /** The pattern for edit code `code` (Y or W, any case) on a field of
   *  `digits` digits, or null. */
  function dateEditCodePattern(code, digits, julian) {
    var c = String(code == null ? '' : code).trim().toUpperCase();
    if (!Object.prototype.hasOwnProperty.call(DATE_EDIT_CODE_PATTERNS, c)) return null;
    // A Julian date (DATE with DATFMT *JUL) is yy/ddd - the DATFMT table's
    // own "Julian *JUL yy/ddd 6" - not the month/day/year pattern the
    // generic digit-count table gives for five or seven digits.
    if (julian === true && c === 'Y') {
      if (digits === 5) return 'nn/nnn';
      if (digits === 7) return 'nnnn/nnn';
    }
    var table = DATE_EDIT_CODE_PATTERNS[c];
    return Object.prototype.hasOwnProperty.call(table, digits) ? table[digits] : null;
  }
  /** The display width that pattern gives, or null (the caller keeps the
   *  field's coded length). */
  function dateEditCodeWidth(code, digits, julian) {
    var p = dateEditCodePattern(code, digits, julian);
    return p ? p.length : null;
  }
  /** How many digits a DATE / TIME constant carries before any editing:
   *  TIME hhmmss = 6; DATE per its *Y (2-digit year) / *YY (4-digit year)
   *  parameter - 6 / 8 for a job DATFMT of MDY, DMY or YMD, 5 / 7 for the
   *  Julian format (yyddd, yyyyddd). `jobDate` (optional, { dateFormat,
   *  dateSeparator }, Task I-156) is the connected job's DATFMT; without it
   *  the design-time assumption is a six / eight digit date. null for any
   *  other keyword. */
  function systemValueDigits(name, dateParameterText, jobDate) {
    if (name === 'TIME') return 6;
    if (name !== 'DATE') return null;
    var w = RECORD_TYPES.DATE.displayWidth;
    var tokens = String(dateParameterText || '').toUpperCase().split(/\s+/).filter(Boolean);
    var n = tokens.indexOf('*YY') >= 0 ? w.digits['*YY'] : w.digits['*Y'];
    return jobDateIsJulian(jobDate) ? n - 1 : n;
  }
  /** Whether `jobDate` is a usable job date info whose format is *JUL. */
  function jobDateIsJulian(jobDate) {
    var jd = normalizeJobDate(jobDate);
    return !!(jd && JOB_DATE_FORMATS[jd.dateFormat].julian);
  }

  /**
   * The columns a system-value constant occupies on the display, or null
   * for a keyword that is not one of DATE / TIME / USER / SYSNAME. `opts`
   * (all optional): `dateParameters` (the DATE parameter text), `editCode`
   * (the first EDTCDE token), `editWordWidth` (the width of an EDTWRD
   * template). USER / SYSNAME state their length outright; TIME is its
   * default edit word's length unless an edit word or edit code replaces
   * it; DATE is its year digits unless an edit word or edit code replaces
   * them. The Y and W edit codes insert separators in IBM's own patterns
   * (dateEditCodePattern); a field with other edit codes is sized by the
   * caller (the engine's numeric edit-code rules). `opts.jobDate` is the
   * connected job's DATFMT / DATSEP.
   */
  function systemValueConstantWidth(name, opts) {
    var e = constantKeywordEntry(name);
    if (!e || SYSTEM_VALUE_CONSTANT_KEYWORDS.every(function (x) { return x.name !== name; })) return null;
    var o = opts || {};
    if (typeof e.fixedLength === 'number') return e.fixedLength;
    if (typeof o.editWordWidth === 'number' && o.editWordWidth > 0) return o.editWordWidth;
    var w = e.displayWidth;
    if (!w) return null;
    var digits = systemValueDigits(name, o.dateParameters, o.jobDate);
    var code = String(o.editCode || '').toUpperCase();
    var patterned = dateEditCodeWidth(code, digits, name === 'DATE' && jobDateIsJulian(o.jobDate));
    if (patterned != null) return patterned;
    // The default edit word is what IBM supplies; only an IBM edit code or an
    // edit word replaces it. A user-defined code 5-9 (QEDIT5-9) is defined on
    // the system, so its width is not known here: keep the default's.
    if (w.defaultEditWord && (code === '' || /^[5-9]$/.test(code))) return w.defaultEditWord.length;
    return digits;
  }

  /**
   * The design-time text a DATE / TIME constant previews, built from `now` (a Date) in
   * IBM's own formats and always the width the field is drawn at (never longer): TIME
   * with no edit code or word is its default edit word '0_:__:__' poured over hhmmss
   * ("11:06:45", IBM's own example); DATE with no editing is the bare digits (IBM:
   * "mmddyy" - *Y two-digit year, *YY four); EDTCDE(Y) and EDTCDE(W) pour the digits
   * into IBM's pattern with "/" (the DATSEP default). Digit order: MDY for everything
   * except W, which IBM says is correct only for a YMD job date with a four-digit
   * year, so W previews YMD - unless `opts.jobDate` says otherwise: then every code
   * uses that format's order (and a Julian date is yyddd), and Y uses that job's
   * DATSEP character. A field with another edit code or an edit word previews its bare
   * digits (a shorter text is fine
   *  - the box is never overrun). Y and W apply IBM's zero suppression
   *  (the suppressed digit shows as a blank). null for USER / SYSNAME / any other name
   *  (the engine keeps its "*USER" / "*SYSNAME" placeholders).
   */
  function systemValuePreviewText(name, opts, now) {
    if (name !== 'DATE' && name !== 'TIME') return null;
    var o = opts || {};
    var jobDate = normalizeJobDate(o.jobDate);
    var d = now instanceof Date ? now : new Date();
    function p2(n) { return (n < 10 ? '0' : '') + n; }
    var code = String(o.editCode || '').toUpperCase();
    var digitText;
    if (name === 'TIME') {
      digitText = p2(d.getHours()) + p2(d.getMinutes()) + p2(d.getSeconds());
    } else {
      var yyyy = String(d.getFullYear());
      var four = String(o.dateParameters || '').toUpperCase().split(/\s+/).indexOf('*YY') >= 0;
      var yr = four ? yyyy : yyyy.slice(-2);
      var mm = p2(d.getMonth() + 1), dd = p2(d.getDate());
      // With the connected job's DATFMT known, the digit order is that
      // format's ("the job attribute DATFMT determines the order of the
      // month, day, and year"); a Julian date is yy then the day of the year.
      // Without it the design-time assumption stands: MDY, except W, which
      // IBM says is correct only for a YMD job date with a four-digit year.
      if (jobDate) {
        var order = JOB_DATE_FORMATS[jobDate.dateFormat].order;
        var doy = Math.round((new Date(d.getFullYear(), d.getMonth(), d.getDate()) - new Date(d.getFullYear(), 0, 1)) / 86400000) + 1;
        var ddd = (doy < 100 ? (doy < 10 ? '00' : '0') : '') + doy;
        digitText = order === 'MDY' ? mm + dd + yr : order === 'DMY' ? dd + mm + yr : order === 'YMD' ? yr + mm + dd : yr + ddd;
      } else {
        digitText = code === 'W' ? yr + mm + dd : mm + dd + yr;
      }
    }
    // IBM's EDTCDE table: Y suppresses the farthest left zero of a date field
    // 3-6 or 8 digits long (the two farthest left of a 7-digit one); W
    // suppresses the farthest left zero of a 5-digit date and the three
    // farthest left zeros of a 6-8 digit one. Suppressed zeros print as
    // blanks (the width does not change).
    var suppress = 0;
    if (code === 'Y') suppress = digitText.length === 7 ? 2 : 1;
    else if (code === 'W') suppress = digitText.length === 5 ? 1 : 3;
    function pour(pattern) {
      var i = 0, blanking = true;
      return pattern.replace(/n/g, function () {
        var ch = digitText.charAt(i);
        var out = (blanking && ch === '0' && i < suppress) ? ' ' : ch;
        if (out !== ' ') blanking = false;
        i++;
        return out;
      });
    }
    var pattern = dateEditCodePattern(code, digitText.length, name === 'DATE' && !!jobDate && JOB_DATE_FORMATS[jobDate.dateFormat].julian);
    if (pattern) {
      var poured = pour(pattern);
      // EDTCDE(Y) on a DATE uses the job attribute DATSEP at run time (the
      // slash is only the default); W always inserts slashes.
      return (code === 'Y' && jobDate) ? poured.replace(/\//g, jobDate.dateSeparator) : poured;
    }
    if (typeof o.editWordWidth === 'number' && o.editWordWidth > 0) return digitText;
    if (name === 'TIME' && code === '') {
      var i = 0;
      return RECORD_TYPES.TIME.displayWidth.defaultEditWord.replace(/[_0]/g, function () { return digitText.charAt(i++); });
    }
    return digitText;
  }
  /** MSGCON's length parameter range, { min: 1, max: 132 } (a fresh
   *  object). */
  function msgconLengthRange() {
    var m = RECORD_TYPES.MSGCON.msgconParameters;
    return { min: m.lengthMin, max: m.lengthMax };
  }
  /* The usual message-ID length MSGCON gets an advisory (not a refusal) for. */
  function msgconMessageIdAdvisoryLength() {
    return RECORD_TYPES.MSGCON.msgconParameters.messageIdAdvisoryLength;
  }
  /**
   * MSGCON's parameter shape as the format line states it: { count: 3,
   * libraryDelimiter: '/' } (a fresh object). Nothing about the message-ID
   * or file / library names is stated, so nothing else is here.
   */
  function msgconParameterShape() {
    var m = RECORD_TYPES.MSGCON.msgconParameters;
    return { count: m.parameterCount, libraryDelimiter: m.libraryDelimiter };
  }

  /**
   * IBM's own "Valid entries for display files" table for position 35
   * (DDS_Keyword_V7r6.txt ~line 930): each keyboard-shift entry and the
   * data type it permits. The webview hand-kept two literal lists (a
   * character one and a numeric one) plus the numeric-field test that picks
   * between them, and kept the Basic tab's Data type choices as three more
   * copies. Entries are in the PANEL's own display order (one global order
   * that yields both panel lists as subsequences: S N A X Y W I D M, then
   * the DBCS data types J O E G the Basic tab never sets but a hand-written
   * file can carry). `permitted` is IBM's "Data type permitted" column:
   * 'character', 'numeric' or 'either' (IBM: "Character or numeric"); J / O
   * / E / G are the DBCS data types, character. Blank (the default) is not
   * an entry here - the UI adds its own "(none)".
   */
  var KEYBOARD_SHIFT_ENTRIES = [
    { code: 'S', permitted: 'numeric' },
    { code: 'N', permitted: 'either' },
    { code: 'A', permitted: 'character' },
    { code: 'X', permitted: 'character' },
    { code: 'Y', permitted: 'numeric' },
    { code: 'W', permitted: 'character' },
    { code: 'I', permitted: 'either' },
    { code: 'D', permitted: 'either' },
    { code: 'M', permitted: 'character' },
    { code: 'J', permitted: 'character' },
    { code: 'O', permitted: 'character' },
    { code: 'E', permitted: 'character' },
    { code: 'G', permitted: 'character' }
  ];
  /** The position-35 entries that are data types rather than keyboard
   *  shifts (IBM's "Data type" rows: F floating point, L date, T time,
   *  Z timestamp). */
  var POSITION_35_DATA_TYPES = ['F', 'L', 'T', 'Z'];
  /** Which position-35 values count as a NUMERIC field for the keyboard-
   *  shift list: S, Y and F are numeric in IBM's table; L / T / Z are kept
   *  in this grouping on purpose - real SDA has no screen of its own for
   *  them, so every field-level UI treats them as numeric (see the
   *  webview's own long comment on the Keying options panel, Task I-31). */
  var NUMERIC_SHIFT_DATA_TYPES = ['S', 'Y', 'L', 'T', 'Z', 'F'];

  /** Whether `dataType` selects the numeric keyboard-shift list. A missing
   *  or unrecognized value is NOT numeric (falls to the wider character
   *  list, so nothing already set becomes unselectable). */
  function isNumericShiftDataType(dataType) {
    return typeof dataType === 'string' && NUMERIC_SHIFT_DATA_TYPES.indexOf(dataType) !== -1;
  }
  /** The keyboard-shift codes a field of `dataType` may carry, in panel
   *  order, without the blank default: those IBM permits for numeric
   *  (S N Y I D) or for character (N A X W I D M J O E G) fields. A fresh
   *  array. */
  function keyboardShiftValues(dataType) {
    var want = isNumericShiftDataType(dataType) ? 'numeric' : 'character';
    return KEYBOARD_SHIFT_ENTRIES.filter(function (e) {
      return e.permitted === want || e.permitted === 'either';
    }).map(function (e) { return e.code; });
  }
  /** 'character' | 'numeric' | 'either' for a keyboard-shift code (any
   *  case), else null (blank, a data type, or not a position-35 value). */
  function keyboardShiftPermitted(code) {
    if (typeof code !== 'string') return null;
    var c = code.toUpperCase();
    for (var i = 0; i < KEYBOARD_SHIFT_ENTRIES.length; i++) {
      if (KEYBOARD_SHIFT_ENTRIES[i].code === c) return KEYBOARD_SHIFT_ENTRIES[i].permitted;
    }
    return null;
  }
  /** Whether `value` (any case) is a valid non-blank position-35 entry:
   *  a keyboard shift or one of F / L / T / Z. */
  function isPosition35Value(value) {
    if (typeof value !== 'string') return false;
    return keyboardShiftPermitted(value) !== null || POSITION_35_DATA_TYPES.indexOf(value.toUpperCase()) !== -1;
  }

  // The L/T/Z usage restriction the DDS Reference states once, for all
  // three date/time data types together, in the general
  // field-description text ("Date (L), Time (T), and Timestamp (Z)",
  // page 18, re-verified fresh): "Valid field usage (DDS position 38)
  // can be O, B, or I" - unchanged from what dateTimeUsageConflictReason
  // already enforced. Keyed by data-type letter rather than by keyword
  // name, since this restricts a FIELD PROPERTY (its data type), not any
  // one keyword's own use - a genuinely different axis from every
  // RECORD_TYPES entry above, so it gets its own small map rather than
  // an awkward fourth "record type" named after a data-type letter.
  var DATE_TIME_DATA_TYPES = { L: true, T: true, Z: true };
  var DATE_TIME_ALLOWED_USAGE = ['O', 'B', 'I'];

  // The PSHBTNFLD/PSHBTNCHC mutual requirement ("A field containing the
  // PSHBTNFLD keyword must also contain one or more PSHBTNCHC keywords";
  // PSHBTNCHC's own section states the reverse: "When the PSHBTNCHC
  // keyword is specified on a field, the PSHBTNFLD keyword must also be
  // specified"). A genuinely different relationship shape from
  // MUTEX_GROUPS above - "each member requires the other's presence"
  // rather than "each member excludes the others" - but the same
  // symmetric-pair-list idiom, so it gets its own list rather than
  // overloading MUTEX_GROUPS with an inverted meaning.
  var REQUIRE_PAIRS = [
    ['PSHBTNFLD', 'PSHBTNCHC']
  ];

  /** The keyword that `keywordName` mutually requires the presence of
   *  (the PSHBTNFLD/PSHBTNCHC shape - each requires the other), or null
   *  if `keywordName` is in no `REQUIRE_PAIRS` entry. Symmetric: either
   *  member of a pair maps to the other. */
  function requiredPartner(keywordName) {
    var pair = REQUIRE_PAIRS.filter(function (p) { return p.indexOf(keywordName) !== -1; })[0];
    if (!pair) return null;
    return pair[0] === keywordName ? pair[1] : pair[0];
  }

  /**
   * `recordType`'s closed parameter-word rule (SFLRCDNBR: CURSOR and
   * *TOP, each at most once), a copy, or null.
   */
  function parameterWords(recordType) {
    var spec = RECORD_TYPES[recordType];
    if (!spec || !spec.parameterWords) return null;
    return Object.assign({}, spec.parameterWords, { allowed: spec.parameterWords.allowed.slice() });
  }

  /** `recordType`'s own field-definition requirements (the PSHBTNFLD
   *  shape - data type, length, decimal positions and allowed usage
   *  values a field carrying this keyword must conform to), or null for
   *  a record type with no spec entry or no such rule. */
  function definitionRequirements(recordType) {
    var spec = RECORD_TYPES[recordType];
    return (spec && spec.definitionRequirements) || null;
  }

  /** `recordType`'s own human-readable label for why `usage` makes a
   *  field ineligible for it (the CHRID shape - e.g. "hidden (H)" for
   *  usage H), or null when `recordType` has no such restriction or
   *  `usage` isn't one of the restricted values. */
  function ineligibleUsageLabel(recordType, usage) {
    var spec = RECORD_TYPES[recordType];
    var map = spec && spec.ineligibleUsage;
    if (!map) return null;
    var u = String(usage == null ? '' : usage).trim().toUpperCase();
    return Object.prototype.hasOwnProperty.call(map, u) ? map[u] : null;
  }

  /** Whether `recordType`'s keyword is ineligible on a field whose decimal
   *  positions are specified (the CHRID shape - "numeric fields"). */
  function ineligibleWhenDecimalsSpecified(recordType) {
    var spec = RECORD_TYPES[recordType];
    return !!(spec && spec.ineligibleWhenDecimalsSpecified);
  }

  /** Whether `recordType`'s keyword is ineligible on a constant field (the
   *  CHRID shape). */
  function ineligibleOnConstant(recordType) {
    var spec = RECORD_TYPES[recordType];
    return !!(spec && spec.ineligibleOnConstant);
  }

  /** Whether `keywords` carries a keyword `recordType` may accompany (the
   *  CHKMSGID shape - a dependency on one of several qualifying keyword
   *  NAMES, or a qualifying keyword parameterized with one of several
   *  specific CODES - e.g. CHECK only qualifies via CHECK(M10)/CHECK(M11)/
   *  CHECK(VN)/CHECK(VNE), matched by token so CHECK(ME VN) also
   *  qualifies). False for a record type with no `qualifyingNames`. */
  function hasQualifyingKeyword(recordType, keywords) {
    var spec = RECORD_TYPES[recordType];
    if (!spec || !spec.qualifyingNames) return false;
    return (keywords || []).some(function (k) {
      if (spec.qualifyingNames.indexOf(k.name) !== -1) return true;
      if (!spec.qualifyingCheckKeyword || k.name !== spec.qualifyingCheckKeyword) return false;
      var tokens = String(k.parameters || '').toUpperCase().split(/[\s,()]+/).filter(Boolean);
      return tokens.some(function (t) { return (spec.qualifyingCheckCodes || []).indexOf(t) !== -1; });
    });
  }

  /** `recordType`'s own human-readable list of its qualifying keywords
   *  (the CHKMSGID shape), for use in a message, or '' when it has none. */
  function qualifyingListText(recordType) {
    var spec = RECORD_TYPES[recordType];
    return (spec && spec.qualifyingListText) || '';
  }

  // dftGroupConflictReason's (L81/L82) own DFT_DFTVAL_CONFLICT_GROUP
  // array: a genuinely different shape from every RECORD_TYPES entry
  // above - a full N-WAY mutual exclusion (every member excludes every
  // OTHER member), not a pairwise owner-and-partners relationship.
  // Modeling it as four separate RECORD_TYPES.<NAME>.mutex entries would
  // mean the same 4-choose-2 = 6 pairings stated 8 times over (each entry
  // repeating the other three) - a `MUTEX_GROUPS` list of the group
  // itself, consulted via `groupMutexKeywords` below, states each pairing
  // exactly once instead.
  //
  // DFT's own DDS Reference section (line ~4687) states "The DFTVAL,
  // EDTCDE, and EDTWRD keywords cannot be specified with the DFT
  // keyword"; DFTVAL's own section restates the identical rule from its
  // side; EDTCDE's own section (line ~5596) states "The DFT and DFTVAL
  // keywords cannot be specified with the EDTCDE keyword" - all
  // re-verified fresh. Between them, DFT/DFTVAL/EDTCDE/EDTWRD's sections
  // establish DFT<->DFTVAL, DFT<->EDTCDE, DFT<->EDTWRD, DFTVAL<->EDTCDE,
  // and DFTVAL<->EDTWRD explicitly; none of the four sections states
  // EDTCDE<->EDTWRD as a "cannot be specified with" sentence in so many
  // words, but this codebase's own `editKeywordSectionHtml` already
  // models EDTCDE/EDTWRD as a single mutually-exclusive dropdown choice
  // (you pick one "kind" or the other), so the full 4-way group -
  // unchanged from what L81/L82 already implemented - is kept as-is
  // rather than narrowed on the strength of one missing sentence.
  var MUTEX_GROUPS = [
    ['DFT', 'DFTVAL', 'EDTCDE', 'EDTWRD']
  ];

  /** The other members of whichever MUTEX_GROUPS group contains
   *  `keywordName`, or an empty array if it's in none. A copy, safe for
   *  the caller to `.filter()`/`.map()` without mutating the spec. */
  function groupMutexKeywords(keywordName) {
    var group = MUTEX_GROUPS.filter(function (g) { return g.indexOf(keywordName) !== -1; })[0];
    if (!group) return [];
    return group.filter(function (n) { return n !== keywordName; });
  }

  /** Whether `keywordName` is allowed on a record of `recordType` per that
   *  type's own closed whitelist. Returns true for a record type with no
   *  spec entry (nothing to restrict) or no whitelist. Checks the literal
   *  `whitelist` array first, then falls back to `whitelistPatterns` (the
   *  MNUBAR slice's own addition, for entries the DDS Reference itself
   *  states as a placeholder pattern - e.g. CAnn/CFnn - rather than as a
   *  literal keyword name).
   *
   *  `parameters` (optional, the PSHBTNFLD slice's own addition) narrows
   *  a whitelisted NAME to a required parameter TOKEN set via
   *  `whitelistRequiredTokens` - e.g. DSPATR is a whitelisted name on
   *  PSHBTNFLD, but only a `DSPATR(PC)` instance is actually allowed;
   *  every other DSPATR use is not, even though the bare name matches.
   *  Token-split the same way `conditionalMutexHit` splits parameters.
   *  Ignored for any keyword with no `whitelistRequiredTokens` entry, so
   *  every pre-existing call site (none of which passes `parameters`) is
   *  unaffected. */
  function isWhitelisted(recordType, keywordName, parameters) {
    var spec = RECORD_TYPES[recordType];
    if (!spec || !spec.whitelist) return true;
    if (spec.whitelist.indexOf(keywordName) !== -1) {
      var required = spec.whitelistRequiredTokens && spec.whitelistRequiredTokens[keywordName];
      if (!required) return true;
      var tokens = String(parameters || '').toUpperCase().split(/[\s,()]+/).filter(Boolean);
      return tokens.length > 0 && tokens.every(function (t) { return required.indexOf(t) !== -1; });
    }
    if (spec.whitelistPatterns) {
      return spec.whitelistPatterns.some(function (re) { return re.test(keywordName); });
    }
    return false;
  }

  /** Whether `keywordName` is on `recordType`'s own closed mutex list (the
   *  WINDOW shape: a short list of keywords forbidden on the SAME record
   *  in EITHER direction, as opposed to `isWhitelisted`'s "only these are
   *  allowed" shape). Returns false for a record type with no spec entry
   *  or no mutex list - nothing to conflict with. */
  function isMutex(recordType, keywordName) {
    var spec = RECORD_TYPES[recordType];
    if (!spec || !spec.mutex) return false;
    return spec.mutex.indexOf(keywordName) !== -1;
  }

  /**
   * The record-level keywords that require a WINDOW keyword on the same
   * record (RMVWDW, USRRSTDSP), in the DDS Reference's order. A copy, safe
   * to filter.
   */
  /* SFLCSRRRN's parameter rule (a copy), or null. */
  function sflcsrrrnFieldRule() {
    var spec = RECORD_TYPES.SFLCSRRRN;
    return (spec && spec.relativeRecordField) ? Object.assign({}, spec.relativeRecordField) : null;
  }

  function sflctlDependentKeywords() {
    var spec = RECORD_TYPES.SFLCTL;
    return (spec && spec.requiredFor) ? spec.requiredFor.slice() : [];
  }

  /**
   * SFLDLT's option-indicator rule: \"Option indicators are required for this
   * keyword; display size condition names are not valid.\"
   * (DDS_Keyword_V7r6.txt ~line 10822). The fact is `{required, noDisplaySize,
   * ddsReference}`; null for any other keyword.
   */
  function optionIndicatorRequiredFact(keywordName) {
    var n = String(keywordName == null ? '' : keywordName).trim().toUpperCase();
    var e = Object.prototype.hasOwnProperty.call(RECORD_TYPES, n) ? RECORD_TYPES[n] : null;
    return (e && e.optionIndicatorRequired && e.optionIndicatorRequired.guarded) ? e.optionIndicatorRequired : null;
  }

  function windowDependentKeywords() {
    var spec = RECORD_TYPES.WINDOW;
    return (spec && spec.requiredFor) ? spec.requiredFor.slice() : [];
  }

  /** `recordType`'s own mutex list, in the DDS Reference's own order - a
   *  copy, safe for the caller to `.filter()` without mutating the spec.
   *  Returns an empty array for a record type with no spec entry or no
   *  mutex list. Used where a caller needs the actual conflicting names
   *  (to join into a message), not just the yes/no `isMutex` answers. */
  function mutexKeywords(recordType) {
    var spec = RECORD_TYPES[recordType];
    return (spec && spec.mutex) ? spec.mutex.slice() : [];
  }

  /** The single record type `keywordName` is excluded from being used
   *  within (the HTML/SFL shape: a field-level keyword forbidden from
   *  appearing on a field belonging to a record of this type), or null if
   *  `keywordName` has no spec entry or no such restriction. One-
   *  directional by construction - there is no reverse "which field-level
   *  keywords does record type X forbid" query, since only HTML needs
   *  this today. */
  function notAllowedInRecordType(keywordName) {
    var spec = RECORD_TYPES[keywordName];
    return (spec && spec.notAllowedInRecordType) || null;
  }

  /**
   * Whether `keywordName` is one of the keywords the DDS Reference
   * forbids on the record format named by the file-level PASSRCD keyword
   * (the WINDOW/ALWROL/ CLRL/SLNO shape - see each entry's own
   * `passrcdRestricted` comment above). Returns false for a keyword with
   * no spec entry or no such flag.
   */
  function isPassrcdRestricted(keywordName) {
    var spec = RECORD_TYPES[keywordName];
    return !!(spec && spec.passrcdRestricted);
  }

  /**
   * Whether `keywordName` is one of the keywords the DDS Reference
   * forbids on a floating-point field (F in position 35) - see each
   * entry's own `floatDdsReference` comment above. Returns false for a
   * keyword with no spec entry or no such flag.
   */
  function isNotAllowedOnFloatingPointField(keywordName) {
    var spec = RECORD_TYPES[keywordName];
    return !!(spec && spec.notAllowedOnFloatingPointField);
  }

  // The two field-level keyword families a referenced (REF/REFFLD) field's
  // own definition can REPLACE or DELETE, previously three separate literal
  // copies (the engine's REFERENCE_EDIT_KEYWORDS /
  // REFERENCE_VALIDITY_KEYWORDS and the writer's EDIT_KEYWORDS). Each
  // carries its delete keyword. Re-verified fresh against
  // DDS_Keyword_V7r6.txt: DLTEDT (line ~4805) "...ignore the EDTCDE or
  // EDTWRD keyword if either of them is specified for a referenced field",
  // and "If you specify a new editing keyword, DLTEDT is unnecessary. The
  // new editing keyword overrides the referenced editing keyword."; DLTCHK
  // (line ~4785) "...ignore all validity checking and CHKMSGID keywords that
  // are specified for a referenced field", with the same override sentence.
  // EDTMSK is deliberately not part of EDIT (it stands alone and combines
  // with EDTCDE/EDTWRD - see dspfWriter.js).
  var FIELD_KEYWORD_GROUPS = {
    EDIT: {
      keywords: ['EDTCDE', 'EDTWRD'],
      deleteKeyword: 'DLTEDT',
      ddsReference: 'DLTEDT: ignore the EDTCDE or EDTWRD keyword if either of them is specified for a referenced field. If you specify a new editing keyword, DLTEDT is unnecessary. The new editing keyword overrides the referenced editing keyword.'
    },
    VALIDITY: {
      keywords: ['CHECK', 'COMP', 'RANGE', 'VALUES', 'CHKMSGID'],
      deleteKeyword: 'DLTCHK',
      ddsReference: 'DLTCHK: ignore all validity checking and CHKMSGID keywords that are specified for a referenced field. If you specify any new validity checking keywords, DLTCHK is unnecessary. The new validity checking keywords override the referenced validity checking keywords.'
    }
  };
  /**
   * A copy of the named group ('EDIT' or 'VALIDITY'): { keywords,
   * deleteKeyword, ddsReference }; null for an unknown name.
   */
  function fieldKeywordGroup(name) {
    var g = FIELD_KEYWORD_GROUPS[name];
    return g ? { keywords: g.keywords.slice(), deleteKeyword: g.deleteKeyword, ddsReference: g.ddsReference } : null;
  }

  /**
   * The companion-keyword rule `keywordName` carries for output-capable
   * usages (see DFT's entry), as a copy safe to mutate, or null when it has
   * none.
   */
  function outputRequirement(keywordName) {
    var spec = RECORD_TYPES[keywordName];
    var r = spec && spec.outputRequirement;
    return r ? { usages: r.usages.slice(), recordKeyword: r.recordKeyword, fieldKeyword: r.fieldKeyword, ddsReference: r.ddsReference } : null;
  }

  /** Task I-121 (CHECK(AB) floating-point slice) - the parameter codes of
   *  `keywordName` the DDS Reference forbids on a floating-point field
   *  (F in position 35) when the keyword is NOT forbidden as a whole (see
   *  CHECK's entry above). A copy, safe to mutate; [] for a keyword with
   *  no spec entry or no such field. */
  function floatIncompatibleCheckCodes(keywordName) {
    var spec = RECORD_TYPES[keywordName];
    return spec && spec.notAllowedOnFloatingPointCodes ? spec.notAllowedOnFloatingPointCodes.slice() : [];
  }

  /**
   * Every CHECK code, grouped by IBM's function name. Copies; empty for a
   * keyword with no such fact.
   */
  function checkCodeGroups(keywordName) {
    var spec = RECORD_TYPES[keywordName];
    var out = {};
    if (!spec || !spec.codeGroups) return out;
    Object.keys(spec.codeGroups).forEach(function (g) { out[g] = spec.codeGroups[g].slice(); });
    return out;
  }
  function checkCodes() {
    var g = checkCodeGroups('CHECK');
    return Object.keys(g).reduce(function (all, k) { return all.concat(g[k]); }, []);
  }
  /** 'validity' | 'keyboard' | 'cursor', or null for a non-CHECK code. */
  function checkCodeGroup(code) {
    var c = String(code == null ? '' : code).trim().toUpperCase();
    var g = checkCodeGroups('CHECK');
    for (var k in g) if (Object.prototype.hasOwnProperty.call(g, k) && g[k].indexOf(c) >= 0) return k;
    return null;
  }

  /**
   * The values a keyword's parameter may take, as declared in its own DDS
   * Reference section (DATFMT / DATSEP / TIMFMT / TIMSEP). A copy, safe to
   * mutate; [] for a keyword with no such fact. Does not include the UI's
   * own "unspecified" choice.
   */
  function validValues(keywordName) {
    var spec = RECORD_TYPES[keywordName];
    return spec && spec.validValues ? spec.validValues.slice() : [];
  }
  // ---- Accessors ----
  var I121A_FACT_KEYS = ['levels', 'noParameters', 'optionIndicatorsValid',
    'displaySizeNamesValid', 'requiresRecordKeyword', 'oncePerRecordFormat',
    'repeatable', 'parameterCount', 'notAllowedInRecordTypes', 'validValues',
    'windowMouseValues', 'mutex'];
  var OUTPUT_CONTROL_KEYWORDS = ['ALARM', 'BLINK', 'CSRLOC', 'RTNCSRLOC', 'ERASE',
    'ERASEINP', 'OVERLAY', 'PUTOVR', 'FRCDTA', 'PROTECT', 'MDTOFF', 'LOCK', 'UNLOCK'];
  /**
   * The thirteen output / cursor / screen-control keywords, in the order the
   * slice lists them. A copy.
   */
  function outputControlKeywords() { return OUTPUT_CONTROL_KEYWORDS.slice(); }
  /**
   * `keywordName`'s own-section facts (see the block comment at the entries),
   * as a fresh object holding only the facts it has. null for a keyword
   * outside the thirteen. Arrays and objects are copies.
   */
  function recordKeywordFacts(keywordName) {
    if (OUTPUT_CONTROL_KEYWORDS.indexOf(keywordName) < 0) return null;
    var spec = RECORD_TYPES[keywordName];
    var out = {};
    I121A_FACT_KEYS.forEach(function (k) {
      if (spec[k] === undefined) return;
      var v = spec[k];
      out[k] = Array.isArray(v) ? v.slice() : (v && typeof v === 'object' ? Object.assign({}, v) : v);
    });
    return out;
  }
  /**
   * The display-attribute values WDWBORDER's own DDS Reference section lists
   * (BL, CS, HI, ND, RI, UL). A copy; [] for a keyword with no such fact. The
   * color parameter is not repeated here: it takes the COLOR values
   * (validValues('COLOR')).
   */
  function displayAttributeValues(keywordName) {
    var spec = RECORD_TYPES[keywordName];
    return spec && spec.displayAttributeValues ? spec.displayAttributeValues.slice() : [];
  }
  /** Whether `value` is one of `keywordName`'s declared values (exact
   *  match, case-sensitive for the separator characters; the special
   *  *VALUES are compared upper-cased). False for a keyword with no fact. */
  function isValidValue(keywordName, value) {
    var list = validValues(keywordName);
    if (!list.length || value == null) return false;
    var v = String(value);
    return list.indexOf(v) >= 0 || list.indexOf(v.toUpperCase()) >= 0 && v.charAt(0) === '*';
  }

  /**
   * What a command-key keyword or token looks like: a two-letter type (CA =
   * command attention, CF = command function) followed by a two-digit key
   * number, CA01..CA24 / CF01..CF24 (DDS_Keyword_V7r6.txt, CAnn and CFnn
   * sections; the number range itself is PSHBTNCHC_COMMAND_KEY_DOMAIN's).
   * Previously the same /^(CA|CF)(\d{2})$/ was hand-copied three times (the
   * engine's COMMAND_KEY_RE, the writer's COMMAND_KEY_RE and its
   * COMMAND_KEY_TOKEN_RE). A grammar fact, not a keyword's: it describes the
   * NAME shape shared by the CAnn / CFnn keywords and by every command-key
   * parameter token.
   */
  var COMMAND_KEY_GRAMMAR = {
    types: ['CA', 'CF'],
    digits: 2
  };
  var COMMAND_KEY_RE = new RegExp('^(' + COMMAND_KEY_GRAMMAR.types.join('|') + ')(\\d{' + COMMAND_KEY_GRAMMAR.digits + '})$');

  /** The command-key type prefixes, in declared order (a fresh array). */
  function commandKeyTypes() {
    return COMMAND_KEY_GRAMMAR.types.slice();
  }

  /** `{ type, number }` for an exact CAnn / CFnn token ('CA05' ->
   *  { type: 'CA', number: '05' }), else null. Case-sensitive and not
   *  trimmed, like the regexes it replaces - callers uppercase / trim
   *  first where their input needs it. Non-strings are not keys. */
  function parseCommandKey(token) {
    if (typeof token !== 'string') return null;
    var m = COMMAND_KEY_RE.exec(token);
    return m ? { type: m[1], number: m[2] } : null;
  }

  /** Whether `name` is exactly a CAnn / CFnn keyword name. */
  function isCommandKeyName(name) {
    return parseCommandKey(name) !== null;
  }

  /** The alt-key keyword names (ALTHELP, ALTPAGEDWN, ALTPAGEUP), derived
   *  from the RECORD_TYPES entries that claim a command key (those with a
   *  `claimedKeyType` and a `defaultKey`), in declared order. A fresh
   *  array; previously hand-written in the writer, here and the webview. */
  function altKeyNames() {
    return Object.keys(RECORD_TYPES).filter(function (k) {
      var e = RECORD_TYPES[k];
      return e && typeof e.claimedKeyType === 'string' && typeof e.defaultKey === 'string';
    });
  }

  /** Whether `name` (any case) is an alt-key keyword. Own-property safe. */
  function isAltKeyName(name) {
    if (typeof name !== 'string') return false;
    return altKeyNames().indexOf(name.toUpperCase()) !== -1;
  }

  /** The `{ type, number }` an alt key claims when it has no parameter
   *  (ALTHELP -> CA01, ALTPAGEDWN -> CF08, ALTPAGEUP -> CF07), else null
   *  for a name that is not an alt key. */
  function altKeyDefaultKey(name) {
    if (!isAltKeyName(name)) return null;
    return parseCommandKey(RECORD_TYPES[name.toUpperCase()].defaultKey);
  }

  /**
   * The alt keys' file-wide command-key exclusions, one entry per alt key
   * (ALTHELP, ALTPAGEDWN, ALTPAGEUP): { keyType, defaultKey, excluded: [{
   * keyword, relation }], ddsReference }. Copies.
   */
  function altKeyFileExclusions() {
    var out = {};
    altKeyNames().forEach(function (k) {
      var e = RECORD_TYPES[k];
      if (!e || !e.excluded) return;
      out[k] = {
        keyType: e.claimedKeyType,
        defaultKey: e.defaultKey,
        excluded: e.excluded.map(function (x) { return { keyword: x.keyword, relation: x.relation }; }),
        ddsReference: e.ddsReference
      };
    });
    return out;
  }

  /**
   * MOUBTN's Command-key exclusion table (see the spec entry's own
   * comment). A copy; null if the fact is missing.
   */
  function moubtnCommandKeyExclusion() {
    var e = RECORD_TYPES.MOUBTN && RECORD_TYPES.MOUBTN.commandKeyExclusion;
    if (!e) return null;
    return {
      rule: e.rule,
      partners: e.partners.map(function (x) { return { keyword: x.keyword, keyType: x.keyType, defaultKey: x.defaultKey }; }),
      plainKeyTypes: e.plainKeyTypes.slice(),
      ddsReference: e.ddsReference
    };
  }

  /** The full list of PASSRCD-restricted keyword names, in `RECORD_TYPES`'
   *  own declared order (WINDOW, ALWROL, CLRL, SLNO) - the single source
   *  of truth `passrcdRecordConflictReason`'s own callers previously each
   *  re-derived independently (a hard-coded 'WINDOW' at its creation-time
   *  call site, `alsoCheckPassrcd` set true only at the ALWROL/CLRL/SLNO
   *  `wire*GuardedFlag` call sites, and a hand-written array at the
   *  file-level PASSRCD-edit handler that swept all four at once). */
  function passrcdRestrictedKeywords() {
    return Object.keys(RECORD_TYPES).filter(function (name) {
      return RECORD_TYPES[name].passrcdRestricted;
    });
  }

  /**
   * The token-matching engine moved here from dspfWriter.js's own
   * `exclusionListHit`, now reading `recordType`'s `conditionalMutex`
   * map instead of taking one as a plain argument. Returns the matched
   * label (e.g. "CHECK(RB)", "DUP") when `k` (a `{name, parameters}`
   * keyword instance) hits `recordType`'s own conditional-mutex map,
   * else null. Token-matched (split on whitespace/commas/parens) rather
   * than substring-matched, so e.g. CHECK(RB) hits but CHECK(AB)
   * doesn't.
   */
  function conditionalMutexHit(recordType, k) {
    var spec = RECORD_TYPES[recordType];
    var list = spec && spec.conditionalMutex;
    if (!list || !k || !Object.prototype.hasOwnProperty.call(list, k.name)) return null;
    var bad = list[k.name];
    if (bad === null) return k.name;
    var tokens = String(k.parameters || '').toUpperCase().split(/[\s,()]+/).filter(Boolean);
    var matched = bad.filter(function (b) { return tokens.indexOf(b) >= 0; });
    return matched.length ? k.name + '(' + matched.join(', ') + ')' : null;
  }

  /** Whether `dataType` is one of the Date(L)/Time(T)/Timestamp(Z) types
   *  the DDS Reference restricts to usage O/B/I only (see
   *  DATE_TIME_DATA_TYPES' own comment above). */
  function isDateTimeDataType(dataType) {
    return !!DATE_TIME_DATA_TYPES[dataType];
  }

  /** The allowed usage values (O, B, I) for a Date/Time/Timestamp field -
   *  a copy, safe for the caller to inspect without mutating the spec. */
  function dateTimeAllowedUsage() {
    return DATE_TIME_ALLOWED_USAGE.slice();
  }

  /**
   * The closed list of field usages `keywordName` may be specified on
   * (e.g. ['I', 'B'] for WRDWRAP), or null when the keyword's spec entry
   * states no such restriction. Returns a copy.
   */
  function allowedUsage(keywordName) {
    var spec = RECORD_TYPES[keywordName];
    return spec && spec.allowedUsage ? spec.allowedUsage.slice() : null;
  }

  /** The keyboard-shift / data-type letters `keywordName` is documented as
   *  NOT valid on (WRDWRAP's nine), or null. Returns a copy. */
  function blockedDataTypes(keywordName) {
    var spec = RECORD_TYPES[keywordName];
    return spec && spec.blockedDataTypes ? spec.blockedDataTypes.slice() : null;
  }

  /** The data-type letters `keywordName` REQUIRES (VALNUM's Y), or null.
   *  Unlike `allowedDataTypes`, callers treat a blank data type as NOT
   *  satisfying it. Returns a copy. */
  function requiredDataTypes(keywordName) {
    var spec = RECORD_TYPES[keywordName];
    return spec && spec.requiredDataTypes ? spec.requiredDataTypes.slice() : null;
  }

  /** The keyboard-shift / data-type letters `keywordName` is documented as
   *  valid ONLY on (IGCALTTYP's A/N/X/W/I), or null. The allow-list twin of
   *  `blockedDataTypes`, kept separate because IBM states each keyword one
   *  way or the other. Returns a copy. */
  function allowedDataTypes(keywordName) {
    var spec = RECORD_TYPES[keywordName];
    return spec && spec.allowedDataTypes ? spec.allowedDataTypes.slice() : null;
  }

  /** `keywordName`'s own single valid data-type letter (the DATFMT/
   *  DATSEP/TIMFMT/TIMSEP shape - e.g. 'L' for DATFMT), or null for a
   *  keyword with no spec entry or no such restriction. */
  function validDataType(keywordName) {
    var spec = RECORD_TYPES[keywordName];
    return (spec && spec.validDataType) || null;
  }

  /** Whether `format` (e.g. '*ISO') is one of `keywordName`'s own
   *  fixed-separator format values (the DATSEP/TIMSEP shape, checked
   *  against the sibling format keyword named by `fixedSeparatorPartner`
   *  below). Returns false for a keyword with no such list. */
  function isFixedSeparatorFormat(keywordName, format) {
    var spec = RECORD_TYPES[keywordName];
    var list = spec && spec.fixedSeparatorFormats;
    if (!list) return false;
    return list.indexOf(String(format == null ? '' : format).toUpperCase()) !== -1;
  }

  /** The sibling format keyword (e.g. 'DATFMT' for 'DATSEP') whose value
   *  `isFixedSeparatorFormat` should be checked against, or null for a
   *  keyword with no spec entry or no such partner. */
  function fixedSeparatorPartner(keywordName) {
    var spec = RECORD_TYPES[keywordName];
    return (spec && spec.fixedSeparatorPartner) || null;
  }

  /**
   * Whether `keywordName` must be on the first (named, non-constant)
   * field defined in its record (the SFLCHCCTL shape). Returns false for
   * a keyword with no spec entry or no such flag.
   */
  function mustBeFirstField(keywordName) {
    var spec = RECORD_TYPES[keywordName];
    return !!(spec && spec.mustBeFirstField);
  }

  /**
   * The pair of record-level keywords whose EQUAL parameter values
   * forbid `keywordName` (the SFLSCROLL shape: "not allowed when SFLSIZ
   * equals SFLPAG"), as `{ keywords: [a, b], ddsReference }`, or null
   * for a keyword with no such fact.
   */
  function notAllowedWhenEqual(keywordName) {
    var spec = RECORD_TYPES[keywordName];
    return (spec && spec.notAllowedWhenEqual) || null;
  }

  /**
   * The rule a keyword's message data field parameter must satisfy (the
   * CHKMSGID/ERRMSGID/SFLMSGID shape: must exist in the record, data
   * type A, usage P), or null for a keyword with no such parameter.
   */
  function msgDataFieldRule(keywordName) {
    var spec = RECORD_TYPES[keywordName];
    return (spec && spec.msgDataField) || null;
  }

  /**
   * `{ partner, defaultCakey }` for `keywordName`'s CA-key-collision
   * partner, or null when it has none.
   */
  function caKeyPartner(keywordName) {
    var spec = RECORD_TYPES[keywordName];
    if (!spec || !spec.caKeyPartner) return null;
    return { partner: spec.caKeyPartner, defaultCakey: spec.caKeyDefault };
  }

  /**
   * Whether `keywordName`'s display-size- conditioned instances must
   * carry a plain number rather than a program-to-system field
   * (SFLSIZ).
   */
  function sizeConditionedValueMustBeNumber(keywordName) {
    var spec = RECORD_TYPES[keywordName];
    return !!(spec && spec.sizeConditionedValueMustBeNumber);
  }

  /**
   * Whether `code` is one of `keywordName`'s own parameter values that
   * cannot take the optional fill argument (EDTCDE's W/X/Y/Z).
   * Case-insensitive; false for a keyword with no such fact or a
   * blank/unknown code.
   */
  function isNoFillEditCode(keywordName, code) {
    var spec = RECORD_TYPES[keywordName];
    var rule = spec && spec.noFillCodes;
    if (!rule) return false;
    var c = String(code == null ? '' : code).trim().toUpperCase();
    return !!c && rule.codes.indexOf(c) >= 0;
  }

  /**
   * The number of screen positions a DATFMT value reserves (e.g. '*MDY'
   * -> 8, '*JOB' -> 10), case- insensitive, or null for an unknown/blank
   * value (the caller applies the default - see
   * `datfmtDefaultDisplayLength`).
   */
  function datfmtDisplayLength(format) {
    var lengths = RECORD_TYPES.DATFMT.displayLengths;
    var f = String(format == null ? '' : format).trim().toUpperCase();
    return Object.prototype.hasOwnProperty.call(lengths, f) ? lengths[f] : null;
  }

  /** The display length a date field gets with no DATFMT keyword (the
   *  default format's own length - DDS: "the default is *ISO"). */
  function datfmtDefaultDisplayLength() {
    return datfmtDisplayLength(RECORD_TYPES.DATFMT.defaultFormat);
  }

  /** The display length of every time field (all TIMFMT formats, and the
   *  no-TIMFMT default, are 8). */
  function timfmtDisplayLength() {
    return RECORD_TYPES.TIMFMT.displayLength;
  }

  function editCodeKey(code) {
    return String(code == null ? '' : code).trim().toUpperCase();
  }

  /** Whether EDTCDE `code` inserts thousands-grouping commas. False for a
   *  blank/unknown code. */
  function editCodeInsertsCommas(code) {
    var c = editCodeKey(code);
    return !!c && RECORD_TYPES.EDTCDE.editCodeDisplay.commaCodes.indexOf(c) >= 0;
  }

  /** The extra positions EDTCDE `code`'s sign reserves (0, 1 or 2), or
   *  null for a blank/unknown code (the caller adds nothing). */
  function editCodeSignWidth(code) {
    var widths = RECORD_TYPES.EDTCDE.editCodeDisplay.signWidth;
    var c = editCodeKey(code);
    return c && Object.prototype.hasOwnProperty.call(widths, c) ? widths[c] : null;
  }

  /** Whether EDTCDE `code` (W, Y) inserts runtime-dependent separator
   *  characters, so its display width is unknowable at design time. */
  function isRuntimeSeparatorEditCode(code) {
    var c = editCodeKey(code);
    return !!c && RECORD_TYPES.EDTCDE.editCodeDisplay.runtimeSeparatorCodes.indexOf(c) >= 0;
  }

  /** The human-readable list of codes that CAN take the fill argument
   *  (for a message), or '' for a keyword with no `noFillCodes` fact. */
  function fillAllowedCodesText(keywordName) {
    var spec = RECORD_TYPES[keywordName];
    return (spec && spec.noFillCodes && spec.noFillCodes.allowedText) || '';
  }

  /**
   * Whether a field carrying `keywordName` takes no option indicators
   * of its own (SFLMSGKEY's "or with the associated field" half).
   */
  function noOptionIndicatorsOnField(keywordName) {
    var spec = RECORD_TYPES[keywordName];
    return !!(spec && spec.noOptionIndicatorsOnField);
  }

  /**
   * Whether display size condition names (*DS3/*DS4) are not valid for
   * `keywordName` (SFLPGMQ).
   */
  function noDisplaySizeCondition(keywordName) {
    var spec = RECORD_TYPES[keywordName];
    return !!(spec && spec.noDisplaySizeCondition);
  }

  /**
   * Whether `keywordName` is a field-level keyword valid only in the
   * subfile-control record format (SFLSCROLL, SFLRCDNBR, SFLROLVAL).
   */
  function validOnlyInSubfileControlRecord(keywordName) {
    var spec = RECORD_TYPES[keywordName];
    return !!(spec && spec.validOnlyInSubfileControlRecord);
  }

  /**
   * The cross-record exclusion fact (`controlRecordKeyword`,
   * `subfileFieldKeyword`, `associatedVia`, `ddsReference`)
   * `keywordName` takes part in, or null.
   */
  function crossRecordExclusion(keywordName) {
    var spec = RECORD_TYPES[keywordName];
    return (spec && spec.crossRecordExclusion) || null;
  }

  /**
   * Every keyword that carries a message data field parameter, in spec
   * order.
   */
  function msgDataFieldKeywords() {
    return Object.keys(RECORD_TYPES).filter(function (k) {
      return !!RECORD_TYPES[k].msgDataField;
    });
  }

  /**
   * `keywordName`'s flag groups (`[{name, flags}]`, copies), or [] for
   * a keyword with no `selectionParameters` fact.
   */
  function choiceSelectionFlagGroups(keywordName) {
    var spec = RECORD_TYPES[keywordName];
    var sp = spec && spec.selectionParameters;
    if (!sp) return [];
    return sp.groups.map(function (g) { return { name: g.name, flags: g.flags.slice() }; });
  }

  function selectionKeywordNames() {
    return Object.keys(RECORD_TYPES).filter(function (k) { return !!RECORD_TYPES[k].selectionParameters; });
  }

  /** Every flag any selection-type keyword offers (SNGCHCFLD's group order
   *  first), de-duplicated - what a reader of either keyword's parameters
   *  recognizes. */
  function choiceSelectionAllFlags() {
    var out = [];
    selectionKeywordNames().forEach(function (k) {
      choiceSelectionFlagGroups(k).forEach(function (g) {
        g.flags.forEach(function (f) { if (out.indexOf(f) < 0) out.push(f); });
      });
    });
    return out;
  }

  /** The flags some OTHER selection-type keyword offers but `keywordName`
   *  does not (MLTCHCFLD -> the six AUTOSLT / AUTOENT flags; SNGCHCFLD ->
   *  none). [] for a keyword with no fact. */
  function choiceSelectionFlagsNotOffered(keywordName) {
    if (!RECORD_TYPES[keywordName] || !RECORD_TYPES[keywordName].selectionParameters) return [];
    var own = [];
    choiceSelectionFlagGroups(keywordName).forEach(function (g) { own = own.concat(g.flags); });
    return choiceSelectionAllFlags().filter(function (f) { return own.indexOf(f) < 0; });
  }

  /** The flag-group names `keywordName` offers that no other selection-type
   *  keyword does (SNGCHCFLD -> autoslt, autoent). */
  function choiceSelectionExclusiveGroups(keywordName) {
    var mine = choiceSelectionFlagGroups(keywordName).map(function (g) { return g.name; });
    var others = [];
    selectionKeywordNames().forEach(function (k) {
      if (k === keywordName) return;
      choiceSelectionFlagGroups(k).forEach(function (g) { others.push(g.name); });
    });
    return mine.filter(function (n) { return others.indexOf(n) < 0; });
  }

  /**
   * The smallest *GUTTER width `keywordName` accepts (SNGCHCFLD /
   * MLTCHCFLD / PSHBTNFLD: 2), or 0 for a keyword with no such fact.
   */
  function gutterMinimum(keywordName) {
    var spec = RECORD_TYPES[keywordName];
    if (!spec) return 0;
    if (typeof spec.gutterMinimum === 'number') return spec.gutterMinimum;
    var sp = spec.selectionParameters;
    return sp && typeof sp.gutterMinimum === 'number' ? sp.gutterMinimum : 0;
  }

  /**
   * Whether `keywordName`'s *GUTTER may only be specified together with
   * *NUMCOL or *NUMROW (SNGCHCFLD / MLTCHCFLD: true; PSHBTNFLD and
   * every other keyword: false).
   */
  function gutterRequiresLayout(keywordName) {
    var spec = RECORD_TYPES[keywordName];
    var sp = spec && spec.selectionParameters;
    return !!(sp && sp.gutterRequiresLayout);
  }

  // ---- Accessors ----
  /**
   * What the command-function keywords' format lines state about their parameter
   * text, for the writer's guard: { noParameters, required, optional (fresh
   * arrays of names), printKeyword, pgm, libraryDelimiter }. The legal range of
   * a response indicator and the shape of an object name are NOT stated by these
   * sections, so they are not here (open questions on the entries).
   */
  function commandFunctionParameterShapes() {
    var none = [], req = [], opt = [];
    commandFunctionKeywords().forEach(function (n) {
      var e = commandFunctionEntry(n);
      if (e.noParameters) none.push(n);
      else if (n === 'PRINT') return;
      else if (e.parameters && e.parameters.responseIndicator && e.parameters.responseIndicator.required) req.push(n);
      else opt.push(n);
    });
    return { noParameters: none, required: req, optional: opt, printKeyword: 'PRINT', pgm: '*PGM', libraryDelimiter: '/' };
  }
  var COMMAND_FUNCTION_KEYWORDS = ['ALWGPH', 'CLEAR', 'HELP', 'HLPRTN', 'HOME', 'INVITE',
    'PAGEDOWN', 'PAGEUP', 'PRINT', 'VLDCMDKEY'];
  /**
   * The ten command-function keywords, in entry order (a fresh array).
   * ROLLUP / ROLLDOWN are PAGEDOWN's / PAGEUP's alternate names.
   */
  function commandFunctionKeywords() { return COMMAND_FUNCTION_KEYWORDS.slice(); }
  /** The entry for one of them, or null (own-property safe, case-sensitive,
   *  non-strings are not keywords). */
  function commandFunctionEntry(name) {
    if (typeof name !== 'string' || COMMAND_FUNCTION_KEYWORDS.indexOf(name) < 0) return null;
    return RECORD_TYPES[name];
  }
  /** Other spellings DDS reads as the same keyword (PAGEDOWN -> ['ROLLUP'],
   *  PAGEUP -> ['ROLLDOWN']); [] for every other name. A fresh array. */
  function alternateNamesOf(name) {
    var e = commandFunctionEntry(name);
    return e && e.alternateNames ? e.alternateNames.slice() : [];
  }
  /** Whether the keyword's format has a response-indicator parameter (CLEAR,
   *  HELP, HLPRTN, HOME, PAGEDOWN, PAGEUP, VLDCMDKEY; PRINT's is one of its
   *  forms). ALWGPH and INVITE have no parameters. */
  function takesResponseIndicator(name) {
    var e = commandFunctionEntry(name);
    if (!e || !e.parameters) return false;
    return !!e.parameters.responseIndicator || (name === 'PRINT');
  }
  /** Whether the section says the response indicator is required (VLDCMDKEY
   *  alone: "The response-indicator parameter is required"). */
  function responseIndicatorRequired(name) {
    var e = commandFunctionEntry(name);
    return !!(e && e.parameters && e.parameters.responseIndicator && e.parameters.responseIndicator.required === true);
  }
  /** The length the optional 'text' is truncated to on the listing (50), or
   *  null for a keyword with no text parameter. */
  function indicatorTextMaxLength(name) {
    var e = commandFunctionEntry(name);
    return e && e.parameters && e.parameters.text ? e.parameters.text.maxPrintedLength : null;
  }
  /** PRINT's four forms as the section lists them (a fresh array). */
  function printForms() { return RECORD_TYPES.PRINT.parameters.forms.slice(); }
  /** HELP's two relations to the other help keywords, as the section states
   *  them (fresh arrays): with a response indicator none of
   *  `excludedInFile` (nor H specifications) may be in the file; without one
   *  HELP is required when the file contains any of `requiredWhenFileContains`
   *  (or H specifications). */
  function helpRelations() {
    var h = RECORD_TYPES.HELP;
    return {
      withResponseIndicatorExcludesInFile: h.withResponseIndicatorExcludesInFile.slice(),
      withResponseIndicatorExcludesHelpSpecifications: h.withResponseIndicatorExcludesHelpSpecifications === true,
      withoutResponseIndicatorRequiredWhenFileContains: h.withoutResponseIndicatorRequiredWhenFileContains.slice(),
      withoutResponseIndicatorRequiredWhenFileHasHelpSpecifications: h.withoutResponseIndicatorRequiredWhenFileHasHelpSpecifications === true
    };
  }
  /** The record types the section says the keyword cannot be specified with
   *  (ALWGPH: SFL, USRDFN; INVITE: SFL), a fresh array, [] otherwise. */
  function commandFunctionExcludedRecordTypes(name) {
    var e = commandFunctionEntry(name);
    return e && e.excludesOnRecordTypes ? e.excludesOnRecordTypes.slice() : [];
  }
  /** The alternate spelling the section forbids beside the keyword on the same
   *  record or file (PAGEDOWN -> 'ROLLUP', PAGEUP -> 'ROLLDOWN'), or null. */
  function commandFunctionNotWithAlternateName(name) {
    var e = commandFunctionEntry(name);
    return e && e.notWithAlternateName ? e.notWithAlternateName : null;
  }
  /** Whether the section forbids the keyword at both file and record level
   *  (INVITE). */
  function commandFunctionNotAtBothLevels(name) {
    var e = commandFunctionEntry(name);
    return !!(e && e.notAtBothFileAndRecordLevel === true);
  }
  /** VLDCMDKEY's list of keywords a command key must be activated through
   *  (copies of the entries). */
  function validCommandKeys() {
    return RECORD_TYPES.VLDCMDKEY.validCommandKeysActivatedBy.map(function (k) {
      var o = { keyword: k.keyword };
      if (k.onlyIf) o.onlyIf = k.onlyIf;
      return o;
    });
  }

  /**
   * The group's keyword names in the writer's original order (a copy).
   */
  function recordIndicatorKeywordNames() {
    return Object.keys(RECORD_INDICATOR_KEYWORDS);
  }

  /** Legacy spelling -> canonical keyword, e.g. `{ ROLLUP: 'PAGEDOWN',
   *  ROLLDOWN: 'PAGEUP' }` (a fresh object each call). */
  function recordIndicatorAlternateKinds() {
    var out = {};
    Object.keys(RECORD_INDICATOR_KEYWORDS).forEach(function (k) {
      (RECORD_INDICATOR_KEYWORDS[k].alternateNames || []).forEach(function (alt) { out[alt] = k; });
    });
    return out;
  }

  /** Whether a record-level indicator row of this kind may carry option-
   *  indicator conditions: false exactly when the keyword's own section says
   *  option indicators are not valid for it (the noOptionIndicators fact -
   *  VLDCMDKEY / SETOF / CHANGE / INDTXT), true for the other six and for
   *  any kind outside the group, as the webview's old list behaved. */
  function recordIndicatorTakesOptionIndicators(kind) {
    var f = noOptionIndicatorsFact(kind);
    if (!f || f.fileLevelOnly) return true;
    return f.levels.indexOf('record') < 0;
  }

  /**
   * The keyword names of `groupName` ('validityCheck' | 'errorMessages' |
   * 'messageId') in the writer's original order (a fresh array); [] for
   * an unknown group.
   */
  function repeatableGroupKinds(groupName) {
    return Object.prototype.hasOwnProperty.call(REPEATABLE_INSTANCE_GROUPS, groupName)
      ? Object.keys(REPEATABLE_INSTANCE_GROUPS[groupName]) : [];
  }

  /** Alternate spelling -> canonical keyword for `groupName`, e.g.
   *  `{ CMP: 'COMP' }` for 'validityCheck' (a fresh object each call). */
  function repeatableGroupAlternateKinds(groupName) {
    var out = {};
    repeatableGroupKinds(groupName).forEach(function (k) {
      (REPEATABLE_INSTANCE_GROUPS[groupName][k].alternateNames || []).forEach(function (alt) { out[alt] = k; });
    });
    return out;
  }

  // PSHBTNCHC(choice-number choice-text [command-key] [*SPACEB]): the
  // command-key parameter's own documented domain (DDS_Keyword_V7r6.txt,
  // PSHBTNCHC section, ~line 9633). Previously a generated array in the writer
  // and a hand-written regex in the engine, each its own copy. `ranges` first,
  // then `names`, in IBM's order; an omitted parameter means ENTER. MOUBTN's
  // Command key shares the seven names (its own fact lists them in its own
  // order, ahead of EVENT-ID).
  var PSHBTNCHC_COMMAND_KEY_DOMAIN = {
    ddsReference: 'The command-key parameter is optional and indicates which function key should be generated when this ' +
      'push-button choice is selected. The following keys can be used as parameters: CA01 to CA24, CF01 to CF24, PRINT, ' +
      'HELP, CLEAR, ENTER, HOME, ROLLUP, and ROLLDOWN. If the command-key specified is not defined then ENTER will be used.',
    ranges: [{ prefix: 'CA', min: 1, max: 24 }, { prefix: 'CF', min: 1, max: 24 }],
    names: ['PRINT', 'HELP', 'CLEAR', 'ENTER', 'HOME', 'ROLLUP', 'ROLLDOWN'],
    omittedMeans: 'ENTER'
  };

  // DSPSIZ's own standard display sizes and limits (DDS_Keyword_V7r6.txt,
  // "Display size condition names" ~line 495 and the Display size table
  // ~line 520). Previously the engine's KNOWN_DISPLAY_SIZE_NAMES table, the
  // writer's 24x80 default and "at most two sizes" guards, the DSPMOD
  // prerequisite's literal sizes and the Display Sizes picker's two rows
  // each carried their own copy. `standardSizes` is in the table's order:
  // *DS3 (the 24x80 default) first, *DS4 (27x132) second.
  var DSPSIZ_DOMAIN = {
    ddsReference: 'If you want your program to open this file to display devices with display sizes other than 24 lines x 80 ' +
      'characters, specify the DSPSIZ (Display Size) keyword at the file level. ... If you do not specify the DSPSIZ keyword, ' +
      'your program can only open this file to display devices with a 24 x 80 display. A user-defined display size condition ' +
      'name can be specified instead of *DS3 or *DS4.',
    standardSizes: [
      { name: '*DS3', lines: 24, columns: 80 },
      { name: '*DS4', lines: 27, columns: 132 }
    ],
    defaultName: '*DS3',
    maxSizes: 2
  };

  // The keywords whose one parameter IS a command key, and which key types that
  // parameter may be (DDS_Keyword_V7r6.txt: MNUCNL ~line 8669 and MNUBARSW
  // ~line 8611 "assign a command attention (CA) key"; SFLDROP ~10849, SFLENTER
  // ~11159 and SFLFOLD ~11200 are "SFLxxx(CAnn | CFnn)"). The writer's
  // command-key claim collector (commandKeyClaimsInModel) named the five
  // inline; the alt keys' `excluded` lists above record the same split as
  // `caOnly` / `any`. PSHBTNCHC and MOUBTN carry their command key inside a
  // longer parameter list and have their own facts, so they are not in this
  // table.
  var COMMAND_KEY_PARAMETER_KEYWORDS = {
    MNUCNL: { keyTypes: ['CA'], ddsReference: 'You use this file- or record-level keyword to assign a command attention (CA) key to be the cancel key for menu bars or pull-down menus.' },
    MNUBARSW: { keyTypes: ['CA'], ddsReference: 'You use this file- or record-level keyword to assign a command attention (CA) key to be the Switch-to-menu-bar key.' },
    SFLDROP: { keyTypes: ['CA', 'CF'], ddsReference: 'The format of the keyword is: SFLDROP(CAnn | CFnn)' },
    SFLENTER: { keyTypes: ['CA', 'CF'], ddsReference: 'The format of the keyword is: SFLENTER(CAnn | CFnn)' },
    SFLFOLD: { keyTypes: ['CA', 'CF'], ddsReference: 'The format of the keyword is: SFLFOLD(CAnn | CFnn)' }
  };

  /** The keywords whose parameter is a command key, in declared order. */
  function commandKeyParameterKeywords() {
    return Object.keys(COMMAND_KEY_PARAMETER_KEYWORDS);
  }

  /** The key types ('CA' / 'CF') `name`'s parameter accepts, as a fresh
   *  array, or null if `name` (any case) is not such a keyword. */
  function commandKeyParameterKeyTypes(name) {
    if (typeof name !== 'string') return null;
    var e = Object.prototype.hasOwnProperty.call(COMMAND_KEY_PARAMETER_KEYWORDS, name.toUpperCase())
      ? COMMAND_KEY_PARAMETER_KEYWORDS[name.toUpperCase()] : null;
    return e ? e.keyTypes.slice() : null;
  }

  /** The DDS Reference wording behind `name`'s key types, or null. */
  function commandKeyParameterReference(name) {
    if (typeof name !== 'string') return null;
    var up = name.toUpperCase();
    return Object.prototype.hasOwnProperty.call(COMMAND_KEY_PARAMETER_KEYWORDS, up) ? COMMAND_KEY_PARAMETER_KEYWORDS[up].ddsReference : null;
  }

  /** The two standard display sizes (*DS3 24x80, *DS4 27x132) as fresh
   *  `{ name, lines, columns }` copies, in DDS's table order. */
  function standardDisplaySizes() {
    return DSPSIZ_DOMAIN.standardSizes.map(function (z) { return { name: z.name, lines: z.lines, columns: z.columns }; });
  }

  /** The standard size a bare condition name (any case) stands for, as a
   *  fresh `{ name, lines, columns }`, or null for anything else (a
   *  user-defined name is not a standard size). */
  function standardDisplaySize(name) {
    if (typeof name !== 'string') return null;
    var up = name.toUpperCase();
    for (var i = 0; i < DSPSIZ_DOMAIN.standardSizes.length; i++) {
      var z = DSPSIZ_DOMAIN.standardSizes[i];
      if (z.name === up) return { name: z.name, lines: z.lines, columns: z.columns };
    }
    return null;
  }

  /** The size a file without DSPSIZ opens to: 24x80, which is *DS3. */
  function defaultDisplaySize() {
    return standardDisplaySize(DSPSIZ_DOMAIN.defaultName);
  }

  /** Most sizes one DSPSIZ keyword may declare (DDS allows two). */
  function maxDisplaySizes() {
    return DSPSIZ_DOMAIN.maxSizes;
  }

  /** The DSPSIZ domain's DDS Reference citation. */
  function displaySizeReference() {
    return DSPSIZ_DOMAIN.ddsReference;
  }

  /** PSHBTNCHC's command-key domain as a fresh ordered array (CA01..CA24,
   *  CF01..CF24, then the seven names). */
  function pshbtnchcCommandKeys() {
    var keys = [];
    PSHBTNCHC_COMMAND_KEY_DOMAIN.ranges.forEach(function (r) {
      for (var i = r.min; i <= r.max; i++) keys.push(r.prefix + (i < 10 ? '0' : '') + i);
    });
    return keys.concat(PSHBTNCHC_COMMAND_KEY_DOMAIN.names);
  }

  /** Whether `token` (any case) is a key the PSHBTNCHC command-key parameter
   *  accepts. Blank / non-string tokens are not. */
  function isPshbtnchcCommandKey(token) {
    if (typeof token !== 'string' || !token) return false;
    return pshbtnchcCommandKeys().indexOf(token.toUpperCase()) !== -1;
  }

  /** The key an omitted PSHBTNCHC command-key parameter stands for. */
  function pshbtnchcDefaultCommandKey() {
    return PSHBTNCHC_COMMAND_KEY_DOMAIN.omittedMeans;
  }

  /** The domain's DDS Reference citation. */
  function pshbtnchcCommandKeyReference() {
    return PSHBTNCHC_COMMAND_KEY_DOMAIN.ddsReference;
  }

  /**
   * The three state keyword names in the writer's original order (a fresh
   * array).
   */
  function choiceColorStateKeywords() {
    return Object.keys(CHOICE_COLOR_STATE_KEYWORDS);
  }

  /** The state keywords `recordType`'s own whitelist allows on a field
   *  (`PSHBTNFLD` -> CHCAVAIL, CHCUNAVAIL; a record type with no whitelist
   *  allows all three, as isWhitelisted does), same order. */
  function choiceColorStateKeywordsAllowedOn(recordType) {
    return choiceColorStateKeywords().filter(function (k) { return isWhitelisted(recordType, k); });
  }

  /**
   * Whether only one field in the whole record may carry `keywordName`
   * (the SFLCHCCTL shape). Returns false for a keyword with no spec
   * entry or no such flag.
   */
  function isOnePerRecord(keywordName) {
    var spec = RECORD_TYPES[keywordName];
    return !!(spec && spec.onePerRecord);
  }

  /**
   * The fact for `keywordName` (`{kind, levels, ddsReference[,
   * fileLevelOnly]}`), or null.
   */
  function noOptionIndicatorsFact(keywordName) {
    var n = String(keywordName == null ? '' : keywordName).trim().toUpperCase();
    return Object.prototype.hasOwnProperty.call(NO_OPTION_INDICATORS, n) ? NO_OPTION_INDICATORS[n] : null;
  }

  /** Names carrying the fact; `fileLevelOnly` picks the file-level-only
   *  entries (HLPTITLE) instead of the every-level ones. */
  function noOptionIndicatorsNames(fileLevelOnly) {
    return Object.keys(NO_OPTION_INDICATORS).filter(function (k) {
      return !!NO_OPTION_INDICATORS[k].fileLevelOnly === !!fileLevelOnly;
    });
  }

  // -----------------------------------------------------------------------
  // -----------------------------------------------------------------------
  //
  // The 95 keywords (plus the file-level-only HLPTITLE) whose own DDS
  // Reference section says option indicators are not valid / not allowed,
  // previously eight hand-written arrays in dspfWriter.js (I-95 / I-101
  // batches 1-4) feeding one NO_OPTION_INDICATOR_KEYWORDS table. One
  // declarative fact per keyword now:
  //   kind    - which wording the section uses (the writer maps it to the
  //             message; the wording stays a presentation concern):
  //     notValid                   plain "not valid for this keyword"
  //     notValidDisplaySizeValid   ... and display size condition names ARE valid
  //     notValidFieldConditionable ... but indicators can condition the field
  //     notAllowed                 "not allowed with" (IGCALTTYP)
  //     notValidOrWithField        keyword AND its field (SFLMSGKEY)
  //     notValidAndDisplaySize     indicators AND display-size names (SFLPGMQ)
  //     notValidFileLevelOnly      only the file-level instance (HLPTITLE)
  //   levels  - the level(s) the section was read at (file / record /
  //             field / help); informational, for a future generator.
  // Held back as before: MSGCON and MSGID (conditional). Order is the
  // original table's, so noOptionIndicatorKeywordNames() is unchanged.
  var NO_OPTION_INDICATORS = {
    IGCALTTYP: { kind: 'notAllowed', levels: ['field'],
      ddsReference: 'Option indicators are not allowed with IGCALTTYP.' },
    // IGCCNV's section (~line 15040) says "Option indicators are not allowed with
    // this keyword." The webview never offered a Conditioning toggle on its row,
    // but the table (and so the writer's refusal) did not list it.
    IGCCNV: { kind: 'notAllowed', levels: ['file'],
      ddsReference: 'Option indicators are not allowed with this keyword.' },
    ALTHELP: { kind: 'notValid', levels: ['file'],
      ddsReference: 'Option indicators are not valid for this keyword.' },
    ALTPAGEDWN: { kind: 'notValid', levels: ['file'],
      ddsReference: 'Option indicators are not valid for this keyword.' },
    ALTPAGEUP: { kind: 'notValid', levels: ['file'],
      ddsReference: 'Option indicators are not valid for this keyword.' },
    DSPRL: { kind: 'notValid', levels: ['file'],
      ddsReference: 'Option indicators are not valid for this keyword.' },
    DSPSIZ: { kind: 'notValid', levels: ['file'],
      ddsReference: 'Option indicators are not valid for this keyword.' },
    ERRSFL: { kind: 'notValid', levels: ['file'],
      ddsReference: 'Option indicators are not valid for this keyword.' },
    HLPFULL: { kind: 'notValid', levels: ['file'],
      ddsReference: 'Option indicators are not valid for this keyword.' },
    HLPSCHIDX: { kind: 'notValid', levels: ['file'],
      ddsReference: 'Option indicators are not valid for this keyword.' },
    INDARA: { kind: 'notValid', levels: ['file'],
      ddsReference: 'Option indicators are not valid for this keyword.' },
    MSGLOC: { kind: 'notValid', levels: ['file'],
      ddsReference: 'Option indicators are not valid for this keyword.' },
    OPENPRT: { kind: 'notValid', levels: ['file'],
      ddsReference: 'Option indicators are not valid for this keyword.' },
    PASSRCD: { kind: 'notValid', levels: ['file'],
      ddsReference: 'Option indicators are not valid for this keyword.' },
    REF: { kind: 'notValid', levels: ['file'],
      ddsReference: 'Option indicators are not valid for this keyword.' },
    USRDSPMGT: { kind: 'notValid', levels: ['file'],
      ddsReference: 'Option indicators are not valid for this keyword.' },
    ALWROL: { kind: 'notValid', levels: ['record'],
      ddsReference: 'Option indicators are not valid for this keyword.' },
    ASSUME: { kind: 'notValid', levels: ['record'],
      ddsReference: 'Option indicators are not valid for this keyword.' },
    CLRL: { kind: 'notValid', levels: ['record'],
      ddsReference: 'Option indicators are not valid for this keyword.' },
    GETRETAIN: { kind: 'notValid', levels: ['record'],
      ddsReference: 'Option indicators are not valid for this keyword.' },
    GRDRCD: { kind: 'notValid', levels: ['record'],
      ddsReference: 'Option indicators are not valid for this keyword.' },
    HLPCMDKEY: { kind: 'notValid', levels: ['record'],
      ddsReference: 'Option indicators are not valid for this keyword.' },
    HLPSEQ: { kind: 'notValid', levels: ['record'],
      ddsReference: 'Option indicators are not valid for this keyword.' },
    INZRCD: { kind: 'notValid', levels: ['record'],
      ddsReference: 'Option indicators are not valid for this keyword.' },
    LOGINP: { kind: 'notValid', levels: ['record'],
      ddsReference: 'Option indicators are not valid for this keyword.' },
    MNUBAR: { kind: 'notValid', levels: ['record'],
      ddsReference: 'Option indicators are not valid for this keyword.' },
    PULLDOWN: { kind: 'notValid', levels: ['record'],
      ddsReference: 'Option indicators are not valid for this keyword.' },
    RTNCSRLOC: { kind: 'notValid', levels: ['record'],
      ddsReference: 'Option indicators are not valid for this keyword.' },
    RTNDTA: { kind: 'notValid', levels: ['record'],
      ddsReference: 'Option indicators are not valid for this keyword.' },
    SETOF: { kind: 'notValid', levels: ['record'],
      ddsReference: 'Option indicators are not valid for this keyword.' },
    // SETOFF is documented as equivalent to SETOF (its own section is only
    // that equivalence), and SETOF's section says option indicators are not
    // valid, so the same holds for it.
    SETOFF: { kind: 'notValid', levels: ['record'],
      ddsReference: 'The SETOFF keyword is equivalent to the SETOF keyword. (SETOF: Option indicators are not valid for this keyword.)' },
    SFL: { kind: 'notValid', levels: ['record'],
      ddsReference: 'Option indicators are not valid for this keyword.' },
    SFLCTL: { kind: 'notValid', levels: ['record'],
      ddsReference: 'Option indicators are not valid for this keyword.' },
    SFLENTER: { kind: 'notValid', levels: ['record'],
      ddsReference: 'Option indicators are not valid for this keyword.' },
    SFLMLTCHC: { kind: 'notValid', levels: ['record'],
      ddsReference: 'Option indicators are not valid for this keyword.' },
    SFLMODE: { kind: 'notValid', levels: ['record'],
      ddsReference: 'Option indicators are not valid for this keyword.' },
    SFLRNA: { kind: 'notValid', levels: ['record'],
      ddsReference: 'Option indicators are not valid for this keyword.' },
    SFLRTNSEL: { kind: 'notValid', levels: ['record'],
      ddsReference: 'Option indicators are not valid for this keyword.' },
    SFLSNGCHC: { kind: 'notValid', levels: ['record'],
      ddsReference: 'Option indicators are not valid for this keyword.' },
    SLNO: { kind: 'notValid', levels: ['record'],
      ddsReference: 'Option indicators are not valid for this keyword.' },
    UNLOCK: { kind: 'notValid', levels: ['record'],
      ddsReference: 'Option indicators are not valid for this keyword.' },
    // ---- Option indicators (RETKEY / RETCMDKEY) ----
    // DDS_Keyword_V7r6.txt, "RETKEY (Retain Function Keys) and RETCMDKEY"
    // section (~line 14136), the closing line of "Considerations for
    // specifying RETKEY and RETCMDKEY keywords": "Option indicators are not
    // valid for these keywords." Missed until now - I-44 read the shared
    // section as silent either way and left the Conditioning toggle on.
    RETKEY: { kind: 'notValid', levels: ['record'],
      ddsReference: 'Option indicators are not valid for these keywords (RETKEY and RETCMDKEY).' },
    RETCMDKEY: { kind: 'notValid', levels: ['record'],
      ddsReference: 'Option indicators are not valid for these keywords (RETKEY and RETCMDKEY).' },
    USRDFN: { kind: 'notValid', levels: ['record'],
      ddsReference: 'Option indicators are not valid for this keyword.' },
    SFLLIN: { kind: 'notValidDisplaySizeValid', levels: ['record'],
      ddsReference: 'Option indicators are not valid for this keyword. Display size condition names are valid.' },
    SFLMSGRCD: { kind: 'notValidDisplaySizeValid', levels: ['record'],
      ddsReference: 'Option indicators are not valid for this keyword. Display size condition names are valid.' },
    SFLPAG: { kind: 'notValidDisplaySizeValid', levels: ['record'],
      ddsReference: 'Option indicators are not valid for this keyword. Display size condition names are valid.' },
    SFLSIZ: { kind: 'notValidDisplaySizeValid', levels: ['record'],
      ddsReference: 'Option indicators are not valid for this keyword. Display size condition names are valid.' },
    WINDOW: { kind: 'notValidDisplaySizeValid', levels: ['record'],
      ddsReference: 'Option indicators are not valid for this keyword. Display size condition names are valid.' },
    ALIAS: { kind: 'notValid', levels: ['field'],
      ddsReference: 'Option indicators are not valid for this keyword.' },
    BLANKS: { kind: 'notValid', levels: ['field'],
      ddsReference: 'Option indicators are not valid for this keyword.' },
    BLKFOLD: { kind: 'notValid', levels: ['field'],
      ddsReference: 'Option indicators are not valid for this keyword.' },
    CHCACCEL: { kind: 'notValid', levels: ['field'],
      ddsReference: 'Option indicators are not valid for this keyword.' },
    CHCCTL: { kind: 'notValid', levels: ['field'],
      ddsReference: 'Option indicators are not valid for this keyword.' },
    CHKMSGID: { kind: 'notValid', levels: ['field'],
      ddsReference: 'Option indicators are not valid for this keyword.' },
    CNTFLD: { kind: 'notValid', levels: ['field'],
      ddsReference: 'Option indicators are not valid for this keyword.' },
    COMP: { kind: 'notValid', levels: ['field'],
      ddsReference: 'Option indicators are not valid for this keyword.' },
    DLTCHK: { kind: 'notValid', levels: ['field'],
      ddsReference: 'Option indicators are not valid for this keyword.' },
    DLTEDT: { kind: 'notValid', levels: ['field'],
      ddsReference: 'Option indicators are not valid for this keyword.' },
    EDTCDE: { kind: 'notValid', levels: ['field'],
      ddsReference: 'Option indicators are not valid for this keyword.' },
    EDTMSK: { kind: 'notValid', levels: ['field'],
      ddsReference: 'Option indicators are not valid for this keyword.' },
    EDTWRD: { kind: 'notValid', levels: ['field'],
      ddsReference: 'Option indicators are not valid for this keyword.' },
    FLDCSRPRG: { kind: 'notValid', levels: ['field'],
      ddsReference: 'Option indicators are not valid for this keyword.' },
    FLTFIXDEC: { kind: 'notValid', levels: ['field'],
      ddsReference: 'Option indicators are not valid for this keyword.' },
    FLTPCN: { kind: 'notValid', levels: ['field'],
      ddsReference: 'Option indicators are not valid for this keyword.' },
    HLPID: { kind: 'notValid', levels: ['field'],
      ddsReference: 'Option indicators are not valid for this keyword.' },
    MLTCHCFLD: { kind: 'notValid', levels: ['field'],
      ddsReference: 'Option indicators are not valid for this keyword.' },
    PSHBTNFLD: { kind: 'notValid', levels: ['field'],
      ddsReference: 'Option indicators are not valid for this keyword.' },
    RANGE: { kind: 'notValid', levels: ['field'],
      ddsReference: 'Option indicators are not valid for this keyword.' },
    SFLCHCCTL: { kind: 'notValid', levels: ['field'],
      ddsReference: 'Option indicators are not valid for this keyword.' },
    SFLCSRPRG: { kind: 'notValid', levels: ['field'],
      ddsReference: 'Option indicators are not valid for this keyword.' },
    SNGCHCFLD: { kind: 'notValid', levels: ['field'],
      ddsReference: 'Option indicators are not valid for this keyword.' },
    VALUES: { kind: 'notValid', levels: ['field'],
      ddsReference: 'Option indicators are not valid for this keyword.' },
    CHRID: { kind: 'notValidFieldConditionable', levels: ['field'],
      ddsReference: 'Option indicators are not valid for this keyword, although option indicators can be used to condition the field on which it is specified.' },
    DATE: { kind: 'notValidFieldConditionable', levels: ['field'],
      ddsReference: 'Option indicators are not valid for this keyword, although option indicators can be used to condition the field on which it is specified.' },
    DATFMT: { kind: 'notValidFieldConditionable', levels: ['field'],
      ddsReference: 'Option indicators are not valid for this keyword, although option indicators can be used to condition the field on which it is specified.' },
    DATSEP: { kind: 'notValidFieldConditionable', levels: ['field'],
      ddsReference: 'Option indicators are not valid for this keyword, although option indicators can be used to condition the field on which it is specified.' },
    DFT: { kind: 'notValidFieldConditionable', levels: ['field'],
      ddsReference: 'Option indicators are not valid for this keyword, although option indicators can be used to condition the field on which it is specified.' },
    HTML: { kind: 'notValidFieldConditionable', levels: ['field'],
      ddsReference: 'Option indicators are not valid for this keyword, although option indicators can be used to condition the field on which it is specified.' },
    MAPVAL: { kind: 'notValidFieldConditionable', levels: ['field'],
      ddsReference: 'Option indicators are not valid for this keyword, although option indicators can be used to condition the field on which it is specified.' },
    SYSNAME: { kind: 'notValidFieldConditionable', levels: ['field'],
      ddsReference: 'Option indicators are not valid for this keyword, although option indicators can be used to condition the field on which it is specified.' },
    TIME: { kind: 'notValidFieldConditionable', levels: ['field'],
      ddsReference: 'Option indicators are not valid for this keyword, although option indicators can be used to condition the field on which it is specified.' },
    TIMFMT: { kind: 'notValidFieldConditionable', levels: ['field'],
      ddsReference: 'Option indicators are not valid for this keyword, although option indicators can be used to condition the field on which it is specified.' },
    TIMSEP: { kind: 'notValidFieldConditionable', levels: ['field'],
      ddsReference: 'Option indicators are not valid for this keyword, although option indicators can be used to condition the field on which it is specified.' },
    USER: { kind: 'notValidFieldConditionable', levels: ['field'],
      ddsReference: 'Option indicators are not valid for this keyword, although option indicators can be used to condition the field on which it is specified.' },
    ALTNAME: { kind: 'notValid', levels: ['record'],
      ddsReference: 'Option indicators are not valid for this keyword.' },
    CHANGE: { kind: 'notValid', levels: ['record', 'field'],
      ddsReference: 'Option indicators are not valid for this keyword.' },
    CHGINPDFT: { kind: 'notValid', levels: ['file', 'record', 'field'],
      ddsReference: 'Option indicators are not valid for this keyword.' },
    HLPARA: { kind: 'notValid', levels: ['help'],
      ddsReference: 'Option indicators are not valid for this keyword.' },
    INDTXT: { kind: 'notValid', levels: ['file', 'record', 'field'],
      ddsReference: 'Option indicators are not valid for this keyword.' },
    REFFLD: { kind: 'notValid', levels: ['field'],
      ddsReference: 'Option indicators are not valid for this keyword.' },
    SFLRCDNBR: { kind: 'notValid', levels: ['field'],
      ddsReference: 'Option indicators are not valid for this keyword.' },
    SFLROLVAL: { kind: 'notValid', levels: ['field'],
      ddsReference: 'Option indicators are not valid for this keyword.' },
    SFLSCROLL: { kind: 'notValid', levels: ['field'],
      ddsReference: 'Option indicators are not valid for this keyword.' },
    TEXT: { kind: 'notValid', levels: ['record', 'field'],
      ddsReference: 'Option indicators are not valid for this keyword.' },
    VALNUM: { kind: 'notValid', levels: ['file', 'record', 'field'],
      ddsReference: 'Option indicators are not valid for this keyword.' },
    VLDCMDKEY: { kind: 'notValid', levels: ['file', 'record'],
      ddsReference: 'Option indicators are not valid for this keyword.' },
    WRDWRAP: { kind: 'notValid', levels: ['file', 'record', 'field'],
      ddsReference: 'Option indicators are not valid for this keyword.' },
    SFLMSGKEY: { kind: 'notValidOrWithField', levels: ['field'],
      ddsReference: 'Option indicators are not valid for this keyword or with the associated field.' },
    SFLPGMQ: { kind: 'notValidAndDisplaySize', levels: ['field'],
      ddsReference: 'Option indicators and display size condition names are not valid for this keyword.' },
    HLPTITLE: { kind: 'notValidFileLevelOnly', levels: ['file', 'record'], fileLevelOnly: true,
      ddsReference: 'Option indicators are not valid on a file-level HLPTITLE keyword. Option indicators are allowed on record-level HLPTITLE keywords ...' },
  };

  // -----------------------------------------------------------------------
  // -----------------------------------------------------------------------
  //
  // The ten keywords real SDA's "Define Indicator Keywords" screen lists as
  // repeatable rows (CLEAR / PAGEDOWN / PAGEUP / HOME / HELP / HLPRTN /
  // VLDCMDKEY / SETOF / CHANGE / INDTXT), in the order the writer has
  // always read them. Previously hand-kept in dspfWriter.js
  // (RECORD_INDICATOR_KEYWORD_NAMES, RECORD_INDICATOR_ALT_KIND) and, for the
  // rows that take no option indicators, again in webviewClientHelpers.js
  // (RECORD_INDICATOR_NO_CONDITIONING_KINDS). One fact per keyword:
  //   alternateNames - legacy spellings of the SAME keyword, read back as
  //                    it (PAGEDOWN = ROLLUP, PAGEUP = ROLLDOWN)
  //   ddsReference   - the DDS_Keyword_V7r6.txt wording that identifies it
  // Whether a row may carry option-indicator conditions is NOT a fact here:
  // it is the noOptionIndicators fact above (VLDCMDKEY / SETOF / CHANGE /
  // INDTXT have one, the other six do not), so the two can never drift. Not
  // migrated: the row labels and the dropdown's own order (a screen
  // presentation). (Task later added SETOFF as SETOF's alternate name.) the
  // seven keywords of this group that are command-function keywords (CLEAR,
  // PAGEDOWN, PAGEUP, HOME, HELP, HLPRTN, VLDCMDKEY) take their alternate
  // names and their DDS citation from their own RECORD_TYPES entry - the
  // group derives from the entries, not the reverse. SETOF, CHANGE and INDTXT
  // are not command-function keywords and keep theirs here.
  function fromEntry(name) {
    var e = RECORD_TYPES[name];
    var out = { ddsReference: e.ddsReference };
    if (e.alternateNames) out.alternateNames = e.alternateNames.slice();
    return out;
  }
  var RECORD_INDICATOR_KEYWORDS = {
    CLEAR: fromEntry('CLEAR'),
    PAGEDOWN: fromEntry('PAGEDOWN'),
    PAGEUP: fromEntry('PAGEUP'),
    HOME: fromEntry('HOME'),
    HELP: fromEntry('HELP'),
    HLPRTN: fromEntry('HLPRTN'),
    VLDCMDKEY: fromEntry('VLDCMDKEY'),
    // "SETOF is equivalent to the SETOFF keyword" (and SETOFF's own section
    // says the reverse, "The SETOF keyword is preferred").
    SETOF: { alternateNames: ['SETOFF'], ddsReference: 'SETOF is equivalent to the SETOFF keyword.' },
    CHANGE: { ddsReference: 'set on the specified response indicator for an input operation' },
    INDTXT: { ddsReference: 'associate a descriptive text (indicating intent or use) with a specific response or option indicator' }
  };

  // -----------------------------------------------------------------------
  // -----------------------------------------------------------------------
  //
  // Keyword families the writer reads as repeatable, independently-
  // conditioned instances (Task L1 foundation), previously one hand-kept
  // constant each in dspfWriter.js - and, for the validity check, a literal
  // copy twice in webviewClientHelpers.js. One fact per keyword, grouped by
  // the panel that owns the family:
  //   validityCheck  RANGE / COMP / VALUES - mutually exclusive alternatives
  //                  for one kind of validity check (L5). CMP is COMP's
  //                  documented legacy spelling ("This keyword is equivalent
  //                  to the COMP keyword... The COMP keyword is preferred",
  //                  Task L34): read as COMP, never written back.
  //   errorMessages  ERRMSG / ERRMSGID - one screen, two repeatable lists (L1b)
  //   messageId      MSGID - the message-identifier keyword (L1)
  // alternateNames - spellings read back as the keyword (as the record-
  //                  indicator group's ROLLUP / SETOFF are)
  // ddsReference   - the DDS_Keyword_V7r6.txt wording that identifies it
  // The kinds' order is the writer's original one. Not migrated: the
  // webview's per-kind placeholder text and the ERRMSG / ERRMSGID labels
  // (screen presentation). CHKMSGID's `qualifyingNames` lists the same four
  // spellings; it is kept as is and a test pins it to this group.
  var REPEATABLE_INSTANCE_GROUPS = {
    validityCheck: {
      RANGE: { ddsReference: 'RANGE(low-value high-value)' },
      COMP: { alternateNames: ['CMP'], ddsReference: 'CMP(relational-operator value); This keyword is equivalent to the COMP keyword. The COMP keyword is preferred.' },
      VALUES: { ddsReference: 'VALUES(value-1 [value-2... [value-100]])' }
    },
    errorMessages: {
      ERRMSG: { ddsReference: 'ERRMSG(\'message-text\' [response-indicator])' },
      ERRMSGID: { ddsReference: 'ERRMSGID(message-identifier message-file [response-indicator])' }
    },
    messageId: {
      MSGID: { ddsReference: 'You use this field-level keyword to allow an application program to identify, at program run time, the message description that contains text for a named field.' }
    }
  };

  // -----------------------------------------------------------------------
  // -----------------------------------------------------------------------
  //
  // The three whole-field (not per-choice) color / attribute states a
  // SNGCHCFLD / MLTCHCFLD field's choices can be shown in - available,
  // unavailable (see CHCCTL) and selected - all sharing the
  // "(*COLOR c) (*DSPATR a a)" shape. dspfWriter.js kept the names as
  // CHOICE_COLOR_STATE_KEYWORDS (only its doc comments referred to it),
  // and webviewClientHelpers.js hard-coded WHICH of them a push-button
  // field may show as `['avail', 'unavail']` in two call sites, a second
  // copy of a rule PSHBTNFLD's own whitelist (above) already states:
  // "CHCAVAIL, CHCUNAVAIL, CHCCTL, ..." with no CHCSLT. That subset is now
  // asked of the whitelist (`choiceColorStateKeywordsAllowedOn`), so the
  // panel can never offer a state the spec forbids. One fact per keyword:
  //   ddsReference - the DDS_Keyword_V7r6.txt wording identifying it
  // Not migrated: the webview's rows (element-id key + label, screen
  // presentation). The DDS Reference sections (CHCAVAIL ~line 11475, CHCSLT and
  // CHCUNAVAIL right after) themselves say CHCSLT is for "a menu bar or selection
  // field" - no push button - and the other two include push buttons.
  var CHOICE_COLOR_STATE_KEYWORDS = {
    CHCAVAIL: { ddsReference: 'the color or display attributes to be used when the system is displaying the available choices in a menu bar, push button, selection field, or subfile single-choice or multiple-choice selection list' },
    CHCUNAVAIL: { ddsReference: 'the color or display attributes to be used when the system displays the unavailable choices in a selection field or a push button field' },
    CHCSLT: { ddsReference: 'the color or display attributes to be used when the system is displaying a selected choice in a menu bar or selection field' }
  };


  // -----------------------------------------------------------------------
  // System/36 environment (S36E) restriction table
  // -----------------------------------------------------------------------
  //
  // System/36 environment (S36E) keyword restriction rule set.
  //
  // Task I-121p moved this table here from dspfWriter.js unchanged in
  // content, so the writer's S36E consumers (getS36ERestriction,
  // s36ERuleViolationMessage, findS36EConflictInModel) read spec facts.
  // It owns no keywords: ALTNAME/MSGID/RETKEY/RETCMDKEY/CHANGE/HELP/
  // HLPRTN/PRINT stay with their own level slices. Original scope note:
  // this task is the RULE TABLE only - a data-driven description of
  // what each of the 6 named keywords (ALTNAME, CHANGE, HELP/HLPRTN, MSGID,
  // PRINT(*PGM), RETKEY/RETCMDKEY) is restricted to when the file also has
  // USRDSPMGT (S36-2's already-confirmed file flag). Wiring these as UI
  // hard blocks is S36-4, not this task.
  //
  // Every entry below was checked against IBM's current DDS Reference for
  // display files before being encoded (per this task's own "verify each
  // against IBM's current DDS reference before encoding - don't guess"
  // instruction) rather than assumed from general S36E knowledge.
  //
  // Update: all six are now verified, using the official IBM i "DDS for
  // Display Files" reference PDF the person supplied directly
  // (docs/sda-reference/source/DDS_Keyword_V7r6.pdf) - the same appendix
  // web searches and archived-mirror fetches repeatedly failed to surface
  // in full during S36-3's original research. Reading that appendix
  // directly revealed something the original research missed: of the six,
  // only CHANGE, HELP/HLPRTN, and PRINT are actually GATED BY USRDSPMGT
  // (their behavior changes specifically because USRDSPMGT is present).
  // ALTNAME, MSGID, and RETKEY/RETCMDKEY appear in that same appendix
  // chapter simply because they're commonly used together with S36E
  // migrated/program-described files, but IBM's own text never qualifies
  // their rules with "in a file containing USRDSPMGT" the way it explicitly
  // does for the other three - their rules apply unconditionally. Each
  // entry's new `gatedByUsrdspmgt` field records this distinction; S36-4's
  // existing hard-block wiring already only ever checked `appliesTo ===
  // 'response-indicator'` (true for exactly CHANGE/HELP/PRINT), so this
  // correction needed no change to that wiring itself - only to what this
  // table records as true.
  //
  // The three USRDSPMGT-gated entries (CHANGE, HELP, PRINT) share one real
  // mechanism confirmed on IBM's "Keyword considerations for display files
  // used in the System/36 environment" page: S36E applications do not
  // support response indicators on these keywords, so specifying one in a
  // USRDSPMGT file is flagged at file-creation time. HELP is the one
  // exception called out by name on that same page - CHANGE and PRINT's
  // response indicator only produces a WARNING, but HELP's produces an
  // ERROR, and IBM's own S36E-specific HELP/HLPRTN sub-page explains why:
  // in a USRDSPMGT file, a HELP response indicator alone does not return
  // control to the program at all - HLPRTN must be specified for that.
  //
  // Correction: PRINT(*PGM) is its OWN documented case, not - as this
  // table previously (incorrectly) inferred from a separate, general PRINT
  // keyword page's "the only difference between these two forms is the
  // response indicator" statement - simply the response-indicator warning
  // in disguise. IBM's dedicated "PRINT(*PGM) keyword" S36E sub-page says
  // nothing about a warning at all: PRINT(*PGM) is a fully valid, EXPECTED
  // combination with USRDSPMGT: how the Print key behaves at runtime
  // depends on which compiler wrote the reading program (an S36-compatible
  // RPG II/COBOL compiler only interrupts the program if it's coded to
  // handle the Print-key exception; an IBM i RPG III/IV/COBOL compiler
  // always interrupts it). That's a behavioral note for the person writing
  // the program, not a DDS-level restriction - so checkS36EResponseIndicatorViolation
  // below now explicitly excludes the literal '*PGM' value from PRINT's
  // response-indicator check (a genuine NUMERIC response indicator on
  // PRINT still warns, exactly as before).
  var S36E_RESTRICTIONS = {
    ALTNAME: {
      keyword: 'ALTNAME',
      verified: true,
      gatedByUsrdspmgt: false,
      severity: null,
      appliesTo: null,
      rule: "ALTNAME's own general rules (NOT conditioned on USRDSPMGT): the alternative name must be 1-8 characters, its first character must not be '*', it must be different from every other record name and alternate name in the file (duplicates raise an error), and ALTNAME is not allowed on subfile records (SFL). Option indicators are not valid for this keyword.",
      source: "IBM i DDS Reference for display files (docs/sda-reference/source/DDS_Keyword_V7r6.pdf), \"ALTNAME (Alternative Record Name) keyword\" - listed under \"System/36 environment considerations for display files\" but not itself qualified by USRDSPMGT"
    },
    CHANGE: {
      keyword: 'CHANGE',
      verified: true,
      gatedByUsrdspmgt: true,
      severity: 'warning',
      appliesTo: 'response-indicator',
      rule: 'Specifying a response indicator on CHANGE in a file that also contains USRDSPMGT produces a warning at file-creation time - S36E applications do not support response indicators on this keyword.',
      source: "IBM i DDS Reference for display files (docs/sda-reference/source/DDS_Keyword_V7r6.pdf), \"Keyword considerations for display files used in the System/36 environment\""
    },
    HELP: {
      keyword: 'HELP',
      verified: true,
      gatedByUsrdspmgt: true,
      severity: 'error',
      appliesTo: 'response-indicator',
      rule: 'Specifying a response indicator on HELP in a file that also contains USRDSPMGT is an error, not just a warning - unlike CHANGE/PRINT. A HELP response indicator alone will not return control to the application program in a USRDSPMGT file; HLPRTN must also be specified to return control.',
      source: "IBM i DDS Reference for display files (docs/sda-reference/source/DDS_Keyword_V7r6.pdf), \"Keyword considerations for display files used in the System/36 environment\" (response-indicator keyword list, HELP called out as the ERROR exception) and the \"HELP and HLPRTN keyword\" System/36 environment sub-page"
    },
    HLPRTN: {
      keyword: 'HLPRTN',
      verified: true,
      gatedByUsrdspmgt: true,
      severity: null,
      appliesTo: null,
      rule: 'HLPRTN is not itself restricted by USRDSPMGT - it is the keyword that must be present to satisfy HELP\'s own S36E restriction above (returning control to the program when Help is pressed in a USRDSPMGT file).',
      source: 'IBM i DDS Reference for display files (docs/sda-reference/source/DDS_Keyword_V7r6.pdf), "HELP and HLPRTN keyword" System/36 environment sub-page'
    },
    MSGID: {
      keyword: 'MSGID',
      verified: true,
      gatedByUsrdspmgt: false,
      severity: null,
      appliesTo: null,
      rule: "MSGID's own general syntax (NOT conditioned on USRDSPMGT): MSGID(message-identifier [library-name/]message-file) or MSGID(*NONE). message-file may be a 2-character &field (must be in the same record, usage H/P/B/O only, and restricted to the special values U1/U2/P1/P2/M1/M2 - any other value defaults to U1; no library allowed with this form), or one of the special values *USR1/*USR2/*PGM1/*PGM2/*SYS1/*SYS2 (library not allowed, defaults to *LIBL).",
      source: "IBM i DDS Reference for display files (docs/sda-reference/source/DDS_Keyword_V7r6.pdf), \"MSGID keyword\" (including Table 15's special-value mapping) - listed under \"System/36 environment considerations for display files\" but not itself qualified by USRDSPMGT"
    },
    PRINT: {
      keyword: 'PRINT',
      verified: true,
      gatedByUsrdspmgt: true,
      severity: 'warning',
      appliesTo: 'response-indicator',
      // Special values that are NOT response indicators and so never
      // trigger this rule (see pgmSpecialValueNote). Was a literal
      // `=== '*PGM'` test in the writer's s36ERuleViolationMessage.
      excludedResponseValues: ['*PGM'],
      rule: 'Specifying a NUMERIC response indicator on PRINT in a file that also contains USRDSPMGT produces a warning at file-creation time - S36E applications do not support response indicators on this keyword. This does NOT apply to PRINT(*PGM) - see pgmSpecialValueNote below; a literal \'*PGM\' is a distinct, valid special value, not a response indicator.',
      pgmSpecialValueNote: "PRINT(*PGM) is a fully valid, expected combination with USRDSPMGT (no warning) - IBM's own S36E sub-page documents it as a runtime behavioral note instead: how the Print key is handled depends on which compiler wrote the reading program. An S36-compatible compiler (RPG II or COBOL) only interrupts the program if it's coded to handle the Print-key exception (otherwise the screen image is printed); an IBM i compiler (RPG III, RPG IV, or COBOL) always interrupts the program (acting as if Enter was pressed if the program doesn't handle the exception).",
      source: "IBM i DDS Reference for display files (docs/sda-reference/source/DDS_Keyword_V7r6.pdf), \"Keyword considerations for display files used in the System/36 environment\" (response-indicator keyword list) plus the dedicated \"PRINT(*PGM) keyword\" System/36 environment sub-page"
    },
    RETKEY: {
      keyword: 'RETKEY',
      verified: true,
      gatedByUsrdspmgt: false,
      severity: null,
      appliesTo: null,
      rule: "RETKEY/RETCMDKEY's own general rules (NOT conditioned on USRDSPMGT): the file must specify INDARA; both keywords are ignored on the first output operation after the file is opened (the retain function only applies between record formats in the same file); neither is allowed on a subfile format (SFL) or a user-defined record (USRDFN); neither can be specified in a file that also contains ALTHELP, ALTPAGEUP, or ALTPAGEDWN. RETKEY specifically retains CLEAR/HELP/HLPRTN/HOME/PAGEDOWN/PAGEUP/PRINT/ROLLDOWN/ROLLUP; it cannot be combined with CLEAR/HELP/HOME/PAGEUP/PAGEDOWN/ROLLDOWN/ROLLUP on the file level or this record, and PRINT is not allowed on the same record as RETKEY (though HLPRTN and PRINT ARE allowed at the file level alongside RETKEY).",
      source: "IBM i DDS Reference for display files (docs/sda-reference/source/DDS_Keyword_V7r6.pdf), \"RETKEY (Retain Function Keys) and RETCMDKEY (Retain Command Keys) keywords\" and \"Considerations for specifying RETKEY and RETCMDKEY keywords\" - listed under \"System/36 environment considerations for display files\" but not itself qualified by USRDSPMGT"
    },
    RETCMDKEY: {
      keyword: 'RETCMDKEY',
      verified: true,
      gatedByUsrdspmgt: false,
      severity: null,
      appliesTo: null,
      rule: "See RETKEY's own rule for the shared general considerations (INDARA, ignored on first output op, not on SFL/USRDFN, incompatible with ALTHELP/ALTPAGEUP/ALTPAGEDWN). RETCMDKEY specifically retains CAnn/CFnn keys; it cannot be combined with CAnn or CFnn on the file level or this record, and none of CAnn/CFnn/SFLDROP/SFLENTER/SFLFOLD are allowed on the record being defined.",
      source: "IBM i DDS Reference for display files (docs/sda-reference/source/DDS_Keyword_V7r6.pdf), \"RETKEY (Retain Function Keys) and RETCMDKEY (Retain Command Keys) keywords\" and \"Considerations for specifying RETKEY and RETCMDKEY keywords\" - listed under \"System/36 environment considerations for display files\" but not itself qualified by USRDSPMGT"
    }
  };

  /**
   * The S36E rule-table entry for one keyword, or null.
   * Case-insensitive, blank-safe (same contract the writer's
   * getS36ERestriction always had).
   */
  function s36eRestriction(keywordName) {
    return S36E_RESTRICTIONS[String(keywordName || '').toUpperCase()] || null;
  }

  /** Names in the S36E table, in table order. */
  function s36eRestrictedKeywords() {
    return Object.keys(S36E_RESTRICTIONS);
  }

  /** True when `keywordName` carries a verified USRDSPMGT-gated
   *  response-indicator rule (CHANGE / HELP / PRINT). */
  function isS36eResponseIndicatorKeyword(keywordName) {
    var r = s36eRestriction(keywordName);
    return !!(r && r.verified && r.appliesTo === 'response-indicator');
  }

  /** True when `value` is a special value the keyword's S36E rule carves
   *  out of the response-indicator check (PRINT's literal *PGM). */
  function isS36eExcludedResponseValue(keywordName, value) {
    var r = s36eRestriction(keywordName);
    if (!r || !r.excludedResponseValues) return false;
    var v = String(value || '').trim().toUpperCase();
    return r.excludedResponseValues.indexOf(v) !== -1;
  }


  // ---- Accessors ----
  var I121D_KEYWORDS = ['SFLMODE', 'SFLRNA', 'SFLMSGRCD', 'SFLDROP', 'SFLENTER', 'SFLFOLD'];
  function i121dEntry(name) {
    var n = String(name == null ? '' : name).trim().toUpperCase();
    return I121D_KEYWORDS.indexOf(n) !== -1 ? RECORD_TYPES[n] : null;
  }
  /** The six subfile mode / entry keywords this slice specifies (SFLCSRRRN is I-142's). */
  function subfileModeEntryKeywords() { return I121D_KEYWORDS.slice(); }
  /** Record type ('SFLCTL' or, for SFLMSGRCD, 'SFL') the keyword sits on, or null. */
  function subfileModeEntryRecordType(name) { var e = i121dEntry(name); return e ? e.onRecordType : null; }
  /** 'valid' | 'notValid' option-indicator mode, or null for another keyword. */
  function subfileModeEntryIndicatorMode(name) { var e = i121dEntry(name); return e ? e.optionIndicators : null; }
  /** SFLMODE's mode-field definition (copy). */
  function sflmodeField() { return JSON.parse(JSON.stringify(RECORD_TYPES.SFLMODE.modeField)); }
  /** Keywords SFLRNA requires on the same record (copy). */
  function sflrnaRequires() { return RECORD_TYPES.SFLRNA.requiresOnRecord.slice(); }
  /** SFLMSGRCD's message-subfile facts: predefined fields etc. (deep copy). */
  function messageSubfileFacts() {
    var e = RECORD_TYPES.SFLMSGRCD;
    return JSON.parse(JSON.stringify({
      predefinedFields: e.predefinedFields, requiresWithSflinz: e.requiresWithSflinz,
      messageTextMaxLength: e.messageTextMaxLength, messageStartPosition: e.messageStartPosition
    }));
  }
  /** SFLDROP / SFLFOLD fold-mode facts (copy), or null for any other keyword. */
  function foldDropRules(name) {
    var n = String(name == null ? '' : name).trim().toUpperCase();
    if (n !== 'SFLDROP' && n !== 'SFLFOLD') return null;
    var e = RECORD_TYPES[n];
    return JSON.parse(JSON.stringify({
      startsTruncated: e.startsTruncated, ignoredWhenSizeEqualsPage: e.ignoredWhenSizeEqualsPage,
      notValidWithFieldSelection: e.notValidWithFieldSelection, pairedWith: e.pairedWith
    }));
  }
  // ---- Accessors ----
  // Task I-180 added FLTPCN (its data type F and its precision rules).
  var I150_KEYWORDS = ['BLANKS', 'CNTFLD', 'FLDCSRPRG', 'FLTFIXDEC', 'FLTPCN'];
  function i150Entry(name) {
    var n = String(name == null ? '' : name).trim().toUpperCase();
    return I150_KEYWORDS.indexOf(n) !== -1 ? RECORD_TYPES[n] : null;
  }
  /* The five field keywords whose usage / data type / subfile / parameter rules the guard enforces. */
  function fieldKindGuardedKeywords() { return I150_KEYWORDS.slice(); }
  /** Whether the keyword cannot be on a field of a subfile record. */
  function notInSubfile(name) { var e = i150Entry(name); return !!(e && e.notInSubfile); }
  /** Keywords the keyword cannot share a field with (copy; [] otherwise). */
  function notWithKeywords(name) { var e = i150Entry(name); return (e && e.notWithKeywords) ? e.notWithKeywords.slice() : []; }
  /** Whether a blank data type counts as character (A) for the keyword when no decimal positions are given. */
  function blankDataTypeIsCharacter(name) { var e = i150Entry(name); return !!(e && e.blankDataTypeIsCharacterWithoutDecimals); }
  // ---- Accessors ----
  /** The values the keyword's parameter must be one of (FLTPCN: *SINGLE, *DOUBLE), a copy, or null. */
  function parameterValues(name) { var e = i150Entry(name); return (e && e.parameterValues) ? e.parameterValues.slice() : null; }
  /** The longest field length each of the keyword's parameter values allows (FLTPCN), a copy, or null. */
  function maxLengthByParameter(name) { var e = i150Entry(name); return (e && e.maxLengthByParameter) ? Object.assign({}, e.maxLengthByParameter) : null; }
  /** The DDS Reference sentence stating those length caps, or ''. */
  function maxLengthReference(name) { var e = i150Entry(name); return (e && e.maxLengthReference) || ''; }
  /** Whether the keyword's one parameter must be a whole number (CNTFLD's column width). */
  /* Whether the keyword's width parameter must fit within the display or window width (CNTFLD). */
  function widthMustFitDisplay(name) { var e = i150Entry(name); return !!(e && e.widthMustFitDisplay); }
  /**
   * The least number of blank columns between the keyword's field and any other field (CNTFLD: 2),
   * else 0.
   */
  function minSpacesFromOtherFields(name) { var e = i150Entry(name); return (e && e.minSpacesFromOtherFields) || 0; }
  function widthParameterIsNumber(name) { var e = i150Entry(name); return !!(e && e.widthParameterIsNumber); }
  // ---- Accessors ----
  var I121C_KEYWORDS = ['SFLPAG', 'SFLCLR', 'SFLDSP', 'SFLDSPCTL', 'SFLEND', 'SFLINZ', 'SFLDLT'];
  function i121cEntry(name) {
    var n = String(name == null ? '' : name).trim().toUpperCase();
    return I121C_KEYWORDS.indexOf(n) !== -1 ? RECORD_TYPES[n] : null;
  }
  /** The seven subfile-control keywords this slice specifies (SFLCTL is I-141's). */
  function subfileControlKeywords() { return I121C_KEYWORDS.slice(); }
  /** Record type the keyword is valid on ('SFLCTL'), or null. */
  function subfileControlRecordType(name) { var e = i121cEntry(name); return e ? e.onRecordType : null; }
  /** 'none' | 'required' | 'optional' for the keyword's parameters, or null. */
  function parameterMode(name) { var e = i121cEntry(name); return e ? e.parameters : null; }
  /** 'valid' | 'notValid' | 'required' for option indicators, or null. */
  function optionIndicatorMode(name) { var e = i121cEntry(name); return e ? e.optionIndicators : null; }
  /** 'valid' | 'notValid' for display size condition names, or null when the section is silent. */
  function displaySizeNamesMode(name) { var e = i121cEntry(name); return (e && e.displaySizeNames) || null; }
  /** Whether the subfile-control record must carry the keyword (SFLPAG, SFLDSP). */
  function requiredOnSubfileControl(name) { var e = i121cEntry(name); return !!(e && e.requiredOnSubfileControl); }
  /** Keywords SFLPAG refuses when SFLSIZ equals SFLPAG (copy; [] otherwise). */
  function excludedWhenSizeEqualsPage() { return RECORD_TYPES.SFLPAG.excludesWhenSizeEqualsPage.slice(); }
  /** Keywords SFLPAG refuses on the control record under field selection (copy). */
  function excludedWithFieldSelection() { return RECORD_TYPES.SFLPAG.excludesWithFieldSelection.slice(); }
  /**
   * Keywords whose own section states an ERROR (not "ignored") when SFLSIZ
   * equals SFLPAG: SFLFOLD (a copy).
   */
  function sizeEqualsPageErrors() { return RECORD_TYPES.SFLPAG.sizeEqualsPageError.slice(); }
  /* Keywords the reference says are only IGNORED then (a copy). */
  function sizeEqualsPageIgnored() { return RECORD_TYPES.SFLPAG.sizeEqualsPageIgnored.slice(); }
  /** SFLEND's parameter grammar as data (copies). */
  function sflendGrammar() {
    var e = RECORD_TYPES.SFLEND;
    return {
      first: e.firstParameters.slice(), defaultFirst: e.defaultFirstParameter,
      second: e.secondParameters.slice(), defaultSecond: e.defaultSecondParameter,
      secondOnlyAfter: e.secondParameterOnlyAfter,
      scrollBarReservedColumns: e.scrollBarReservedColumns, scrollBarMinimumLines: e.scrollBarMinimumLines,
      moreAddsLines: e.moreAddsLines
    };
  }
  // ---- Accessors ----
  /** Keywords the subfile-control record must carry (SFLPAG, SFLDSP), in the slice's order. */
  function subfileControlRequiredKeywords() {
    return I121C_KEYWORDS.filter(function (k) { return RECORD_TYPES[k].requiredOnSubfileControl === true; });
  }
  /** Keywords whose section says an option indicator is required (SFLCLR, SFLEND, SFLDLT), in the slice's order. */
  function optionIndicatorRequiredKeywords() {
    return I121C_KEYWORDS.filter(function (k) { return RECORD_TYPES[k].optionIndicators === 'required'; });
  }
  /** Whether the keyword's section says display size condition names (*DS3 / *DS4) are not valid on it. */
  function refusesDisplaySizeNames(name) { return displaySizeNamesMode(name) === 'notValid'; }
  // ---- Accessors ----
  var I121B_KEYWORDS = ['INZRCD', 'INZINP', 'GETRETAIN', 'RTNDTA', 'RETLCKSTS', 'RETKEY', 'RETCMDKEY'];
  // Task the eleven (window, menu-bar, help and logging record keywords).
  var I121E_KEYWORDS = ['WDWTITLE', 'RMVWDW', 'USRRSTDSP', 'MNUBARDSP', 'ALTNAME', 'HLPCLR', 'HLPCMDKEY', 'HLPSEQ', 'LOGINP', 'LOGOUT', 'SETOF'];
  // Task the eight (file-level display and I/O keywords).
  var I121F_KEYWORDS = ['IGCCNV', 'DSPRL', 'DSPSIZ', 'ERRSFL', 'INDARA', 'MSGLOC', 'OPENPRT', 'REF'];
  // Task the seven (file-level help, program-control and command-key keywords).
  var I121G_KEYWORDS = ['PASSRCD', 'USRDSPMGT', 'HLPFULL', 'HLPRCD', 'HLPSCHIDX', 'CA01-CA24', 'CF01-CF24'];
  function i121bEntry(name) {
    var n = String(name == null ? '' : name).trim().toUpperCase();
    return (I121B_KEYWORDS.indexOf(n) !== -1 || I121E_KEYWORDS.indexOf(n) !== -1 || I121F_KEYWORDS.indexOf(n) !== -1 || I121G_KEYWORDS.indexOf(n) !== -1) ? RECORD_TYPES[n] : null;
  }
  function i121bList(name, field) {
    var e = i121bEntry(name);
    return e && e[field] ? e[field].slice() : [];
  }
  /** The seven initialize / retain / return keywords, in the slice's order. */
  function initRetainReturnKeywords() { return I121B_KEYWORDS.slice(); }
  /**
   * The entry of any keyword in RECORD_TYPES, whichever task owns it (null for a name that has
   * no entry). takesNoParameters / optionIndicatorsAllowed read the keyword's own entry rather
   * than the slices' table, so a keyword added later cannot be silently answered "no".
   */
  function recordTypeEntry(name) {
    var n = String(name == null ? '' : name).trim().toUpperCase();
    if (Object.prototype.hasOwnProperty.call(RECORD_TYPES, n)) return RECORD_TYPES[n];
    // A concrete command key ('CA05', 'CF24') has no entry of its own - it answers as its pattern
    // entry ('CA01-CA24' / 'CF01-CF24'). null for CA00, CA25 and anything that is not a key.
    return commandKeyEntry(n);
  }
  /** Whether `name` is documented as taking no parameters: its entry says `noParameters: true` or
   *  `parameters: 'none'`. False for a keyword with no entry. */
  function takesNoParameters(name) { var e = recordTypeEntry(name); return !!(e && (e.noParameters === true || e.parameters === 'none')); }
  /**
   * Whether option indicators are valid on `name`: its entry says `optionIndicators: 'valid'`, or
   *  - the spelling the record-level keywords (ALARM, BLINK, CSRLOC, ERASE, ERASEINP, OVERLAY,
   *  PUTOVR, FRCDTA, PROTECT, MDTOFF, LOCK) use - `optionIndicatorsValid: true`. False for
   *  'notValid' / 'required' / unstated, and for a keyword with no entry.
   */
  function optionIndicatorsAllowed(name) {
    var e = recordTypeEntry(name);
    return !!(e && (e.optionIndicators === 'valid' || e.optionIndicatorsValid === true));
  }
  /** Keywords that must be on the same record as `name` (copy; [] if none). */
  function recordRequires(name) { return i121bList(name, 'requiresOnRecord'); }
  /**
   * The three I-121b keywords whose record-level requires / excludes the record
   * guard enforces: INZINP (PUTOVR, OVERLAY, ERASEINP(*ALL)), GETRETAIN (a bare
   * UNLOCK) and RTNDTA (not with UNLOCK). RETKEY / RETCMDKEY also carry
   * `excludesOnRecord` facts but span the file level too - they are I-149.
   */
  var I148_KEYWORDS = ['INZINP', 'GETRETAIN', 'RTNDTA'];
  function initRetainReturnRelationKeywords() { return I148_KEYWORDS.slice(); }
  /** The one keyword `name` needs WITHOUT parameters (GETRETAIN -> UNLOCK), or null. */
  function requiresBareKeyword(name) { var e = i121bEntry(name); return (e && e.requiresBareKeyword) || null; }
  /** Keywords refused on the same record as `name` (copy; [] if none). */
  function recordExcludes(name) { return i121bList(name, 'excludesOnRecord'); }
  /** Keywords refused at the file level AND on `name`'s record (copy). */
  function fileAndRecordExcludes(name) { return i121bList(name, 'excludesOnFileAndRecord'); }
  /** Keywords whose presence anywhere in the file refuses `name` (copy). */
  function fileExcludes(name) { return i121bList(name, 'excludesInFile'); }
  /** File-level keywords the file must carry for `name` (copy). */
  function fileRequires(name) { return i121bList(name, 'requiresInFile'); }
  /** Record types (SFL / USRDFN) `name` is refused on (copy). */
  function notOnRecordTypes(name) { return i121bList(name, 'notOnRecordTypes'); }
  /**
   * The keywords whose own section says they are "allowed only in a file containing a menu-bar
   * record" (MNUBARSW, MNUCNL), read from each entry's requiresMenuBarRecordInFile fact.
   */
  function requiresMenuBarRecordInFile() {
    return Object.keys(RECORD_TYPES).filter(function (k) { return RECORD_TYPES[k] && RECORD_TYPES[k].requiresMenuBarRecordInFile === true; });
  }
  // ---- Accessors ----
  /** The eleven window / menu-bar / help / logging record keywords, in the slice's order. */
  function windowHelpLogKeywords() { return I121E_KEYWORDS.slice(); }
  /** The record-level keywords whose own entry says a WINDOW must be on the same record, minus WDWTITLE
   *  (which needs the *defining* form; guarded separately). */
  function requiresWindowOnRecord() {
    return ['RMVWDW', 'USRRSTDSP'].filter(function (k) { return RECORD_TYPES[k].requiresOnRecord.indexOf('WINDOW') !== -1; });
  }
  /** WDWTITLE's documented parameter vocabulary: { colors, displayAttributes, alignments, positions } (copies). */
  function wdwtitleVocabulary() {
    var p = RECORD_TYPES.WDWTITLE.parameters;
    return { colors: p.colors.slice(), displayAttributes: p.displayAttributes.slice(), alignments: p.alignments.slice(), positions: p.positions.slice(), alignmentDefault: p.alignmentDefault };
  }
  /**
   * WDWBORDER's documented parameter vocabulary: { colors, displayAttributes,
   * requiresOneOfOnRecord } (copies).
   */
  function wdwborderVocabulary() {
    var e = RECORD_TYPES.WDWBORDER;
    return { colors: e.colorValues.slice(), displayAttributes: e.displayAttributeValues.slice(), requiresOneOfOnRecord: e.requiresOneOfOnRecord.slice() };
  }
  /**
   * The minimum number of parameters `name`'s entry states ("at least one parameter must be
   * specified"), or 0 when it states none.
   */
  function minParameters(name) { var e = recordTypeEntry(name); return e && typeof e.minParameters === 'number' ? e.minParameters : 0; }
  /** HLPSEQ's limits: { groupNameMaxLength, sequenceMin, sequenceMax }. */
  function hlpseqLimits() {
    var p = RECORD_TYPES.HLPSEQ.parameters;
    return { groupNameMaxLength: p.groupNameMaxLength, sequenceMin: p.sequenceMin, sequenceMax: p.sequenceMax };
  }
  /** SETOF / SETOFF's text limit (50 characters on the listing). */
  function setofTextMaxLength() { return RECORD_TYPES.SETOF.parameters.textMaxLength; }
  /** MNUBARDSP's hidden-field shapes: { choiceField, pullDownInput } (copies). */
  function mnubardspFieldShapes() {
    var p = RECORD_TYPES.MNUBARDSP.parameters;
    return { fieldReferencePrefix: p.fieldReferencePrefix, choiceField: Object.assign({}, p.choiceField), pullDownInput: { usage: p.pullDownInput.usage, length: p.pullDownInput.length, decimals: p.pullDownInput.decimals, keyboardShift: p.pullDownInput.keyboardShift, values: p.pullDownInput.values.slice() } };
  }
  /** Whether `name` is one whose record needs at least one help specification (HLPCLR). */
  function requiresHelpSpecification(name) { var e = i121bEntry(name); return !!(e && e.requiresHelpSpecification); }
  RECORD_TYPES.WINDOW.requiredFor = requiresWindowOnRecord();
  // ---- Accessors ----
  var I121I_KEYWORDS = ['CSRINPONLY', 'ENTFLDATR', 'MSGALARM', 'HLPTITLE'];
  function i121iEntry(name) {
    var n = String(name == null ? '' : name).trim().toUpperCase();
    return I121I_KEYWORDS.indexOf(n) !== -1 ? RECORD_TYPES[n] : null;
  }
  /** The four cursor, message and help-title keywords, in the slice's order. */
  function cursorMessageHelpKeywords() { return I121I_KEYWORDS.slice(); }
  /** The levels the keyword is valid at (copy), or null for another keyword. */
  function cursorMessageHelpLevels(name) { var e = i121iEntry(name); return e ? e.levels.slice() : null; }
  /** 'valid' | 'notValid' for the keyword at `level` ('file' | 'record' | 'field'), or null. HLPTITLE differs by level. */
  function cursorMessageHelpIndicatorMode(name, level) {
    var e = i121iEntry(name);
    if (!e) return null;
    if (typeof e.optionIndicators === 'string') return e.optionIndicators;
    return e.optionIndicators[level] || null;
  }
  /** ENTFLDATR's parameter value sets and defaults (deep copy). */
  function entFldAtrRules() {
    var e = RECORD_TYPES.ENTFLDATR;
    return JSON.parse(JSON.stringify({ color: e.color, displayAttribute: e.displayAttribute, cursorVisible: e.cursorVisible, fieldLevel: e.fieldLevel }));
  }
  /** HLPTITLE's limits and requirements (deep copy). */
  function hlptitleRules() {
    var e = RECORD_TYPES.HLPTITLE;
    return JSON.parse(JSON.stringify({
      textMaxLength: e.textMaxLength, maxPerRecordWithIndicators: e.maxPerRecordWithIndicators,
      indicatorsRequiredOnEachWhenMultiple: e.indicatorsRequiredOnEachWhenMultiple, requiresInFile: e.requiresInFile,
      notValidOnRecordsWithoutHelpSpecs: e.notValidOnRecordsWithoutHelpSpecs
    }));
  }
  /** MSGALARM's trigger keywords (copy). */
  function msgalarmTriggers() { return RECORD_TYPES.MSGALARM.soundsWith.slice(); }
  // ---- Accessors ----
  var I121K_KEYWORDS = ['HLPARA', 'HLPBDY', 'HLPEXCLD'];
  function i121kEntry(name) {
    var n = String(name == null ? '' : name).trim().toUpperCase();
    return I121K_KEYWORDS.indexOf(n) !== -1 ? RECORD_TYPES[n] : null;
  }
  /** The three help-specification-level keywords, in the slice's order. */
  function helpSpecKeywords() { return I121K_KEYWORDS.slice(); }
  /** The keyword's own-section facts (a deep copy without the prose), or null for another keyword. */
  function helpSpecFacts(name) {
    var e = i121kEntry(name);
    if (!e) return null;
    var copy = JSON.parse(JSON.stringify(e));
    delete copy.ddsReference;
    return copy;
  }
  /** The rules for an H specification itself (HLPARA's section), a deep copy. */
  function helpSpecificationRules() { return JSON.parse(JSON.stringify(RECORD_TYPES.HLPARA.helpSpecification)); }
  // ---- Accessors ----
  var I121J_KEYWORDS = ['CHANGE', 'OVRATR', 'OVRDTA', 'PUTRETAIN', 'TEXT', 'INDTXT'];
  function i121jEntry(name) {
    var n = String(name == null ? '' : name).trim().toUpperCase();
    return I121J_KEYWORDS.indexOf(n) !== -1 ? RECORD_TYPES[n] : null;
  }
  /** The six multi-level keywords, in the slice's order. */
  function multiLevelKeywords() { return I121J_KEYWORDS.slice(); }
  /** The levels ('file' | 'record' | 'field') the keyword is valid at (copy), or null for another keyword. */
  function multiLevelLevels(name) { var e = i121jEntry(name); return e ? e.levels.slice() : null; }
  /** Whether the keyword is valid at `level`; null for another keyword. */
  function multiLevelValidAt(name, level) { var e = i121jEntry(name); return e ? e.levels.indexOf(level) !== -1 : null; }
  /** 'valid' | 'notValid' for the keyword's option indicators, or null for another keyword. */
  function multiLevelIndicatorMode(name) { var e = i121jEntry(name); return e ? e.optionIndicators : null; }
  /** The keyword's own-section facts (a deep copy without the prose), or null for another keyword. */
  function multiLevelFacts(name) {
    var e = i121jEntry(name);
    if (!e) return null;
    var copy = JSON.parse(JSON.stringify(e));
    delete copy.ddsReference;
    return copy;
  }
  /**
   * The field-level eligibility facts the slice recorded, as one shape: {
   * allowedUsage:[..]|null, constantFields:bool|null, notOnFieldsWithKeyword:[..] }. OVRATR:
   * usage I/O/B and constants; OVRDTA: usage O/B/M, no constants; TEXT: not on a SFLMSGKEY /
   * SFLPGMQ field. Null for any other keyword.
   */
  function fieldLevelEligibility(name) {
    var e = i121jEntry(name);
    if (!e || (!e.fieldLevel && !e.notValidOnFieldsWithKeyword)) return null;
    var fl = e.fieldLevel || {};
    return {
      allowedUsage: fl.allowedUsage ? fl.allowedUsage.slice() : null,
      constantFields: typeof fl.constantFields === 'boolean' ? fl.constantFields : null,
      notOnFieldsWithKeyword: (e.notValidOnFieldsWithKeyword || []).slice()
    };
  }
  /* PUTRETAIN's record-level facts: { requiresRecordKeyword, warnsAtCreationWith:[..] }. */
  function putretainRecordRules() {
    var e = RECORD_TYPES.PUTRETAIN;
    return { requiresRecordKeyword: e.requiresRecordKeyword, warnsAtCreationWith: e.warnsAtCreationWith.slice() };
  }
  // ---- Accessors ----
  var I121L_KEYWORDS = ['MNUBARCHC', 'MNUBARSEP', 'CHOICE', 'CHCACCEL', 'CHCAVAIL', 'CHCCTL', 'CHCSLT', 'CHCUNAVAIL'];
  function i121lEntry(name) {
    var n = String(name == null ? '' : name).trim().toUpperCase();
    return I121L_KEYWORDS.indexOf(n) !== -1 ? RECORD_TYPES[n] : null;
  }
  /** The eight choice and menu-bar field keywords, in the slice's order. */
  function choiceMenuBarKeywords() { return I121L_KEYWORDS.slice(); }
  /** 'valid' | 'notValid' for the keyword's option indicators, or null for another keyword. */
  function choiceMenuBarIndicatorMode(name) { var e = i121lEntry(name); return e ? e.optionIndicators : null; }
  /** The keywords of which the field must carry at least one, or [] (a copy; null for another keyword). */
  function choiceMenuBarRequiresOneOf(name) {
    var e = i121lEntry(name);
    return e ? (e.requiresOneOfOnField || []).slice() : null;
  }
  /** The keyword's own-section facts (a deep copy without the prose), or null for another keyword. */
  function choiceMenuBarFacts(name) {
    var e = i121lEntry(name);
    if (!e) return null;
    var copy = JSON.parse(JSON.stringify(e));
    delete copy.ddsReference;
    return copy;
  }
  /**
   * The companion-keyword facts the slice recorded for the three colour-state keywords, CHCACCEL
   * and CHCSLT, as one shape (a copy; null for any other keyword): { oneOfOnField:[..],
   * allOfOnField:[..], onRecord:[..], subfileControlRecordOneOf:[..],
   *    choiceWithoutMnubarchcRecordNeeds:string|null }.
   *  `oneOfOnField` - the field must carry at least one of these (CHCAVAIL / CHCUNAVAIL / CHCSLT);
   *  `allOfOnField` / `onRecord` - CHCACCEL's SNGCHCFLD and PULLDOWN;
   *  `subfileControlRecordOneOf` - at record level (a subfile control record) one of these is needed.
   */
  function choiceCompanionRules(name) {
    var e = i121lEntry(name);
    if (!e) return null;
    var sub = e.allowedOnSubfileControlRecordWithOneOf || e.onSubfileControlRecordRequiresOneOf || [];
    var wired = !!(e.requiresOneOfOnField || e.requiresOnField || e.requiresOnRecord);
    if (!wired) return null;
    return {
      oneOfOnField: (e.requiresOneOfOnField || []).slice(),
      allOfOnField: (e.requiresOnField || []).slice(),
      onRecord: (e.requiresOnRecord || []).slice(),
      subfileControlRecordOneOf: sub.slice(),
      choiceWithoutMnubarchcRecordNeeds: e.whenChoiceInsteadOfMnubarchcRecordNeeds || null
    };
  }
  /**
   * SFLSNGCHC / SFLMLTCHC record and subfile rules (copies), or null for any other keyword: {
   * controlRecordOnly, subfileShape:{outputFields,inputCapableFields,hiddenFields},
   * numberSelectedField:{dataType,length,decimalPositions,usage} | null }.
   */
  function sflChoiceRules(name) {
    var e = SFL_CHOICE_KEYWORDS_LIST.indexOf(name) >= 0 ? RECORD_TYPES[name] : null;
    if (!e) return null;
    return {
      controlRecordOnly: !!e.controlRecordOnly,
      subfileShape: { outputFields: e.subfileShape.outputFields, inputCapableFields: e.subfileShape.inputCapableFields, hiddenFields: e.subfileShape.hiddenFields },
      numberSelectedField: e.numberSelectedField
        ? { dataType: e.numberSelectedField.dataType, length: e.numberSelectedField.length, decimalPositions: e.numberSelectedField.decimalPositions, usage: e.numberSelectedField.usage }
        : null
    };
  }
  /**
   * CHCCTL's control-field shape and the choice keywords that must carry the same number (a copy):
   * { controlField:{dataType,length,decimalPositions,usage}, sameNumberOneOf:[..] }.
   */
  function chcctlRules() {
    var e = RECORD_TYPES.CHCCTL;
    return {
      controlField: { dataType: e.controlField.dataType, length: e.controlField.length, decimalPositions: e.controlField.decimalPositions, usage: e.controlField.usage },
      sameNumberOneOf: e.requiresOneOfOnFieldWithSameChoiceNumber.slice()
    };
  }
  /**
   * CHCAVAIL / CHCUNAVAIL / CHCSLT value rules, read from each entry (copies): { minParameters
   * (\"one parameter must be specified\"), colors, displayAttributes }, or null.
   */
  function choiceStateValueRules(name) {
    var e = i121lEntry(name);
    if (!e || !e.color || !e.displayAttribute) return null;
    return { minParameters: e.onParameterRequired === 'one' ? 1 : 0, colors: e.color.values.slice(), displayAttributes: e.displayAttribute.values.slice() };
  }
  /* The choice-number range CHCACCEL and CHCCTL state ({ min, max }), or null. */
  function choiceNumberRange(name) {
    var e = i121lEntry(name);
    return e && e.choiceNumber ? { min: e.choiceNumber.min, max: e.choiceNumber.max } : null;
  }
  /**
   * CHCACCEL's text-field shape and CHCCTL's message-field shapes (copies): {
   * acceleratorTextField:{dataType,usage}, messageIdField:{dataType,usage,length},
   *    messageFileField:{dataType,usage,length}, messageFileRequiredWithId }.
   */
  function choiceTextAndMessageRules() {
    var t = RECORD_TYPES.CHCACCEL.acceleratorText.textField;
    var m = RECORD_TYPES.CHCCTL.message;
    return {
      acceleratorTextField: { dataType: t.dataType, usage: t.usage },
      messageIdField: { dataType: m.messageIdField.dataType, usage: m.messageIdField.usage, length: m.messageIdField.length },
      messageFileField: { dataType: m.messageFileOrLibraryField.dataType, usage: m.messageFileOrLibraryField.usage, length: m.messageFileOrLibraryField.length },
      messageFileRequiredWithId: m.messageFileRequiredWithMessageId === true
    };
  }
  /* The keyword the record named by an MNUBARCHC must carry. */
  function mnubarchcPullDownRecordKeyword() { return RECORD_TYPES.MNUBARCHC.pullDownRecord.mustHaveKeyword; }
  /* The menu-bar field's line limit and how its lines are counted. */
  function menuBarLineRules() {
    var e = RECORD_TYPES.MNUBARCHC;
    return {
      maxLines: e.maxLinesForMenuBarField,
      blanksBetweenChoices: e.choiceText.blanksBetweenChoices,
      columnsMinus: e.lineLayout.textPositionsAreColumnsMinus,
      separatorCountsAsLine: e.lineLayout.separatorCountsAsLine
    };
  }
  /**
   * The menu-bar record rules of the two menu-bar field keywords, read from their own entries (a
   * copy): { requiresOnRecord:[..], conflictsWithMnubarParameter } for MNUBARCHC and MNUBARSEP (the
   * latter is the MNUBAR parameter the keyword cannot sit beside). Null for any other keyword.
   */
  function menuBarRecordRules(name) {
    var n = String(name == null ? '' : name).trim().toUpperCase();
    if (n !== 'MNUBARCHC' && n !== 'MNUBARSEP') return null;
    var e = RECORD_TYPES[n];
    return { requiresOnRecord: (e.requiresOnRecord || []).slice(), conflictsWithMnubarParameter: e.conflictsWithMnubarParameter || null };
  }
  // ---- Accessors ----
  // DSPSIZ's size table is DSPSIZ_DOMAIN (defined above); copy it into the entry
  // so the entry and the domain cannot drift.
  RECORD_TYPES.DSPSIZ.parameters.standardNames = DSPSIZ_DOMAIN.standardSizes.map(function (z) { return z.name; });
  RECORD_TYPES.DSPSIZ.parameters.maxSizes = DSPSIZ_DOMAIN.maxSizes;
  /** The eight file-level display and I/O keywords, in the slice's order. */
  function fileDisplayIoKeywords() { return I121F_KEYWORDS.slice(); }
  /** MSGLOC's documented limits: { min, max, diagnosticMin, diagnosticMax, defaults:[{lines,columns,line}] }. */
  function msgLocLimits() {
    var p = RECORD_TYPES.MSGLOC.parameters;
    return {
      min: p.lineNumber.min, max: p.lineNumber.max,
      diagnosticMin: p.diagnosticOn24x80.min, diagnosticMax: p.diagnosticOn24x80.max,
      defaults: p.defaultLine.map(function (d) { return { lines: d.lines, columns: d.columns, line: d.line }; })
    };
  }
  /** The MSGLOC values ERRSFL refuses, as fresh { lines, columns, line } copies. */
  function errsflRefusedMsgLocs() {
    return RECORD_TYPES.ERRSFL.msglocRefused.map(function (d) { return { lines: d.lines, columns: d.columns, line: d.line }; });
  }
  /** DSPSIZ's user-defined condition name rule: { min, max, firstCharacter }. */
  function dspsizUserNameRule() {
    var p = RECORD_TYPES.DSPSIZ.parameters;
    return { min: p.userNameLength.min, max: p.userNameLength.max, firstCharacter: p.userNameFirstCharacter };
  }
  /**
   * The stated shape of the file-level display / I-O keywords the writer enforces: { igccnv: {
   * parameterCount, firstKey: {type, first, last}, lineMin }, ref: { min, max, delimiter } }.
   */
  function fileDisplayIoShapes() {
    var ig = RECORD_TYPES.IGCCNV.parameters;
    var ck = parseCommandKey(ig.commandKey.first), cl = parseCommandKey(ig.commandKey.last);
    var rf = RECORD_TYPES.REF.parameters;
    return {
      igccnv: {
        parameterCount: ig.parameterCount,
        firstKey: { type: ck.type, first: Number(ck.number), last: Number(cl.number) },
        lineMin: ig.lineNumberRule.min
      },
      ref: { min: rf.parameterCount.min, max: rf.parameterCount.max, delimiter: rf.libraryDelimiter }
    };
  }
  // ---- Accessors ----
  /** The seven file-level help, program-control and command-key entries, in the slice's order (a fresh array). */
  function fileHelpCommandKeywords() { return I121G_KEYWORDS.slice(); }
  /** The pattern entry for a concrete command key ('CA05' -> the 'CA01-CA24' entry, 'CF24' -> 'CF01-CF24'),
   *  or null when `token` is not an exact CAnn / CFnn in 01-24 (CA00 and CA25 are not keys). */
  function commandKeyEntry(token) {
    var k = parseCommandKey(token);
    if (!k) return null;
    var n = Number(k.number);
    var e = RECORD_TYPES[k.type + '01-' + k.type + '24'];
    return (e && n >= e.pattern.first && n <= e.pattern.last) ? e : null;
  }
  /**
   * The other command-key type that may not share `token`'s key number in the same display file
   * ('CA03' -> { type: 'CA', number: '03', other: 'CF' }), or null when `token` is not a CAnn /
   * CFnn in 01-24 or its entry states no such rule. The scope ('file') is the entry's own
   * sameKeyNumberScope fact.
   */
  function commandKeyNumberClash(token) {
    var e = commandKeyEntry(token);
    if (!e || e.sameKeyNumberAsOtherType !== 'notAllowed') return null;
    var k = parseCommandKey(token);
    return { type: k.type, number: k.number, other: k.type === 'CA' ? 'CF' : 'CA', scope: e.sameKeyNumberScope || 'file' };
  }
  /**
   * The CA claim `name` makes on a key number for the CA / CF number guard, or null. The plain CAnn
   * / CFnn keywords answer as commandKeyNumberClash does; MNUBARSW / MNUCNL claim their CAnn
   * parameter (the first token of `parameters`) or, when it is blank, their own default (CA10 /
   * CA12), as a CA key that may not also be a CF key. A key outside CA01-CA24 or of the CF type
   * claims nothing here (I-186 reports it).
   */
  function commandKeyNumberClaim(name, parameters) {
    var up = String(name || '').toUpperCase();
    var plain = commandKeyNumberClash(up);
    if (plain) return plain;
    var e = Object.prototype.hasOwnProperty.call(RECORD_TYPES, up) ? RECORD_TYPES[up] : null;
    if (!e || e.sameKeyNumberAsOtherType !== 'notAllowed' || !e.caKeyDefault) return null;
    var first = String(parameters || '').trim().split(/\s+/)[0].toUpperCase();
    var c = commandKeyNumberClash(first || e.caKeyDefault);
    return (c && c.type === 'CA') ? c : null;
  }
  /**
   * The stated key-number range of a command-key type ('CA' -> { first: 1, last: 24 }), read from
   * the type's pattern entry (CAnn / CFnn: "nn = 01-24"), or null for a type that has no entry.
   */
  function commandKeyNumberRange(type, keywordName) {
    // MOUBTN and PSHBTNCHC state their own Command key range (MOUBTN's commandKeyRanges,
    // PSHBTNCHC's command-key domain); both read CA01-CA24 / CF01-CF24, and are read here rather
    // than assumed.
    var up = typeof keywordName === 'string' ? keywordName.toUpperCase() : '';
    var own = up === 'MOUBTN' ? RECORD_TYPES.MOUBTN.commandKeyRanges : up === 'PSHBTNCHC' ? PSHBTNCHC_COMMAND_KEY_DOMAIN.ranges : null;
    if (own) {
      for (var i = 0; i < own.length; i++) if (own[i].prefix === type) return { first: own[i].min, last: own[i].max };
      return null;
    }
    var e = (type === 'CA' || type === 'CF') ? RECORD_TYPES[type + '01-' + type + '24'] : null;
    return e && e.pattern ? { first: e.pattern.first, last: e.pattern.last } : null;
  }
  /**
   * Whether `token` has the CAnn / CFnn shape but a number outside the type's stated range (CA00,
   * CA25, CF99 -> true; CA05, CLEAR, CA3 -> false). parseCommandKey reads the grammar only, so the
   * range is this separate domain fact.
   */
  function isCommandKeyOutOfRange(token, keywordName) {
    var k = parseCommandKey(token);
    if (!k) return false;
    var r = commandKeyNumberRange(k.type, keywordName);
    var n = Number(k.number);
    return !!r && (n < r.first || n > r.last);
  }
  /**
   * The command-key types the parameter of `name` (any case) accepts: the alt keys' claimed type
   * (ALTHELP -> CA, ALTPAGEDWN / ALTPAGEUP -> CF) or the COMMAND_KEY_PARAMETER_KEYWORDS types
   * (MNUCNL / MNUBARSW CA; SFLDROP / SFLENTER / SFLFOLD CA or CF), as a fresh array; null for any
   * other keyword.
   */
  function commandKeyValueTypes(name) {
    if (typeof name !== 'string') return null;
    var up = name.toUpperCase();
    if (isAltKeyName(up)) return [RECORD_TYPES[up].claimedKeyType];
    return commandKeyParameterKeyTypes(up);
  }
  /** The keywords PASSRCD's own section forbids on the named record format (a fresh array). */
  function passrcdOwnSectionRestricted() { return RECORD_TYPES.PASSRCD.ownSectionRestrictedKeywords.slice(); }
  /** USRDSPMGT's two forbidden-keyword lists: { own: [...8], considerations: [...12] } (fresh arrays). */
  function usrdspmgtForbiddenKeywords() {
    return {
      own: RECORD_TYPES.USRDSPMGT.cannotCoexistWith.slice(),
      considerations: RECORD_TYPES.USRDSPMGT.cannotCoexistWithConsiderationsList.slice()
    };
  }

  return {
    RECORD_TYPES: RECORD_TYPES,
    S36E_RESTRICTIONS: S36E_RESTRICTIONS,
    s36eRestriction: s36eRestriction,
    s36eRestrictedKeywords: s36eRestrictedKeywords,
    isS36eResponseIndicatorKeyword: isS36eResponseIndicatorKeyword,
    isS36eExcludedResponseValue: isS36eExcludedResponseValue,
    isWhitelisted: isWhitelisted,
    isMutex: isMutex,
    mutexKeywords: mutexKeywords,
    windowDependentKeywords: windowDependentKeywords,
    sflctlDependentKeywords: sflctlDependentKeywords,
    sflcsrrrnFieldRule: sflcsrrrnFieldRule,
    optionIndicatorRequiredFact: optionIndicatorRequiredFact,
    notAllowedInRecordType: notAllowedInRecordType,
    isPassrcdRestricted: isPassrcdRestricted,
    passrcdRestrictedKeywords: passrcdRestrictedKeywords,
    isNotAllowedOnFloatingPointField: isNotAllowedOnFloatingPointField,
    floatIncompatibleCheckCodes: floatIncompatibleCheckCodes,
    outputRequirement: outputRequirement,
    fieldKeywordGroup: fieldKeywordGroup,
    checkCodeGroups: checkCodeGroups,
    validValues: validValues,
    moubtnCommandKeyExclusion: moubtnCommandKeyExclusion,
    altKeyFileExclusions: altKeyFileExclusions,
    systemValueConstantKeywords: systemValueConstantKeywords,
    isSystemValueConstantKeyword: isSystemValueConstantKeyword,
    systemValueConstantLabel: systemValueConstantLabel,
    constantFieldOnlyKeywords: constantFieldOnlyKeywords,
    isConstantFieldOnlyKeyword: isConstantFieldOnlyKeyword,
    listedCompanionKeywords: listedCompanionKeywords,
    companionsStatedAsOnly: companionsStatedAsOnly,
    constantKeywordTakesNoParameters: constantKeywordTakesNoParameters,
    dateParameters: dateParameters,
    fixedDisplayLength: fixedDisplayLength,
    referenceFlagRequiredKeywords: referenceFlagRequiredKeywords,
    requiresReferenceFlag: requiresReferenceFlag,
    validOnlyOnConstantField: validOnlyOnConstantField,
    helpIdentifierRange: helpIdentifierRange,
    referenceFieldRules: referenceFieldRules,
    fieldKeywordsWithoutParameters: fieldKeywordsWithoutParameters,
    systemValueConstantWidth: systemValueConstantWidth,
    systemValuePreviewText: systemValuePreviewText,
    systemValueDigits: systemValueDigits,
    normalizeJobDate: normalizeJobDate,
    jobDateIsJulian: jobDateIsJulian,
    JOB_DATE_FORMATS: JOB_DATE_FORMATS,
    JOB_DATE_SEPARATORS: JOB_DATE_SEPARATORS,
    dateEditCodePattern: dateEditCodePattern,
    dateEditCodeWidth: dateEditCodeWidth,
    msgconLengthRange: msgconLengthRange,
    msgconParameterShape: msgconParameterShape,
    msgconMessageIdAdvisoryLength: msgconMessageIdAdvisoryLength,
    isNumericShiftDataType: isNumericShiftDataType,
    keyboardShiftValues: keyboardShiftValues,
    keyboardShiftPermitted: keyboardShiftPermitted,
    isPosition35Value: isPosition35Value,
    commandKeyTypes: commandKeyTypes,
    parseCommandKey: parseCommandKey,
    isCommandKeyName: isCommandKeyName,
    altKeyNames: altKeyNames,
    isAltKeyName: isAltKeyName,
    altKeyDefaultKey: altKeyDefaultKey,
    isValidValue: isValidValue,
    choiceCompanionRules: choiceCompanionRules,
    chcctlRules: chcctlRules,
    sflChoiceRules: sflChoiceRules,
    choiceStateValueRules: choiceStateValueRules,
    choiceNumberRange: choiceNumberRange,
    choiceTextAndMessageRules: choiceTextAndMessageRules,
    mnubarchcPullDownRecordKeyword: mnubarchcPullDownRecordKeyword,
    menuBarLineRules: menuBarLineRules,
    menuBarRecordRules: menuBarRecordRules,
    choiceMenuBarKeywords: choiceMenuBarKeywords,
    choiceMenuBarIndicatorMode: choiceMenuBarIndicatorMode,
    choiceMenuBarRequiresOneOf: choiceMenuBarRequiresOneOf,
    choiceMenuBarFacts: choiceMenuBarFacts,
    multiLevelKeywords: multiLevelKeywords,
    multiLevelLevels: multiLevelLevels,
    multiLevelValidAt: multiLevelValidAt,
    multiLevelIndicatorMode: multiLevelIndicatorMode,
    multiLevelFacts: multiLevelFacts,
    fieldLevelEligibility: fieldLevelEligibility,
    putretainRecordRules: putretainRecordRules,
    helpSpecKeywords: helpSpecKeywords,
    helpSpecFacts: helpSpecFacts,
    helpSpecificationRules: helpSpecificationRules,
    displayAttributeValues: displayAttributeValues,
    outputControlKeywords: outputControlKeywords,
    recordKeywordFacts: recordKeywordFacts,
    checkCodes: checkCodes,
    checkCodeGroup: checkCodeGroup,
    conditionalMutexHit: conditionalMutexHit,
    groupMutexKeywords: groupMutexKeywords,
    requiredPartner: requiredPartner,
    definitionRequirements: definitionRequirements,
    parameterWords: parameterWords,
    ineligibleUsageLabel: ineligibleUsageLabel,
    ineligibleWhenDecimalsSpecified: ineligibleWhenDecimalsSpecified,
    ineligibleOnConstant: ineligibleOnConstant,
    isDateTimeDataType: isDateTimeDataType,
    dateTimeAllowedUsage: dateTimeAllowedUsage,
    validDataType: validDataType,
    allowedUsage: allowedUsage,
    blockedDataTypes: blockedDataTypes,
    allowedDataTypes: allowedDataTypes,
    requiredDataTypes: requiredDataTypes,
    isFixedSeparatorFormat: isFixedSeparatorFormat,
    fixedSeparatorPartner: fixedSeparatorPartner,
    mustBeFirstField: mustBeFirstField,
    isOnePerRecord: isOnePerRecord,
    hasQualifyingKeyword: hasQualifyingKeyword,
    qualifyingListText: qualifyingListText,
    msgDataFieldRule: msgDataFieldRule,
    crossRecordExclusion: crossRecordExclusion,
    validOnlyInSubfileControlRecord: validOnlyInSubfileControlRecord,
    sizeConditionedValueMustBeNumber: sizeConditionedValueMustBeNumber,
    caKeyPartner: caKeyPartner,
    isNoFillEditCode: isNoFillEditCode,
    datfmtDisplayLength: datfmtDisplayLength,
    datfmtDefaultDisplayLength: datfmtDefaultDisplayLength,
    timfmtDisplayLength: timfmtDisplayLength,
    editCodeInsertsCommas: editCodeInsertsCommas,
    editCodeSignWidth: editCodeSignWidth,
    isRuntimeSeparatorEditCode: isRuntimeSeparatorEditCode,
    fillAllowedCodesText: fillAllowedCodesText,
    noOptionIndicatorsOnField: noOptionIndicatorsOnField,
    noDisplaySizeCondition: noDisplaySizeCondition,
    msgDataFieldKeywords: msgDataFieldKeywords,
    notAllowedWhenEqual: notAllowedWhenEqual,
    noOptionIndicatorsFact: noOptionIndicatorsFact,
    noOptionIndicatorsNames: noOptionIndicatorsNames,
    choiceSelectionFlagGroups: choiceSelectionFlagGroups,
    choiceSelectionAllFlags: choiceSelectionAllFlags,
    choiceSelectionFlagsNotOffered: choiceSelectionFlagsNotOffered,
    choiceSelectionExclusiveGroups: choiceSelectionExclusiveGroups,
    gutterMinimum: gutterMinimum,
    gutterRequiresLayout: gutterRequiresLayout,
    RECORD_INDICATOR_KEYWORDS: RECORD_INDICATOR_KEYWORDS,
    CHOICE_COLOR_STATE_KEYWORDS: CHOICE_COLOR_STATE_KEYWORDS,
    choiceColorStateKeywords: choiceColorStateKeywords,
    pshbtnchcCommandKeys: pshbtnchcCommandKeys,
    isPshbtnchcCommandKey: isPshbtnchcCommandKey,
    pshbtnchcDefaultCommandKey: pshbtnchcDefaultCommandKey,
    pshbtnchcCommandKeyReference: pshbtnchcCommandKeyReference,
    standardDisplaySizes: standardDisplaySizes,
    standardDisplaySize: standardDisplaySize,
    defaultDisplaySize: defaultDisplaySize,
    maxDisplaySizes: maxDisplaySizes,
    displaySizeReference: displaySizeReference,
    commandKeyParameterKeywords: commandKeyParameterKeywords,
    commandKeyParameterKeyTypes: commandKeyParameterKeyTypes,
    commandKeyParameterReference: commandKeyParameterReference,
    choiceColorStateKeywordsAllowedOn: choiceColorStateKeywordsAllowedOn,
    REPEATABLE_INSTANCE_GROUPS: REPEATABLE_INSTANCE_GROUPS,
    repeatableGroupKinds: repeatableGroupKinds,
    repeatableGroupAlternateKinds: repeatableGroupAlternateKinds,
    recordIndicatorKeywordNames: recordIndicatorKeywordNames,
    recordIndicatorAlternateKinds: recordIndicatorAlternateKinds,
    commandFunctionKeywords: commandFunctionKeywords,
    commandFunctionEntry: commandFunctionEntry,
    alternateNamesOf: alternateNamesOf,
    takesResponseIndicator: takesResponseIndicator,
    responseIndicatorRequired: responseIndicatorRequired,
    indicatorTextMaxLength: indicatorTextMaxLength,
    printForms: printForms,
    helpRelations: helpRelations,
    commandFunctionExcludedRecordTypes: commandFunctionExcludedRecordTypes,
    commandFunctionNotAtBothLevels: commandFunctionNotAtBothLevels,
    commandFunctionNotWithAlternateName: commandFunctionNotWithAlternateName,
    validCommandKeys: validCommandKeys,
    recordIndicatorTakesOptionIndicators: recordIndicatorTakesOptionIndicators,
    RECORD_REFERENCES: RECORD_REFERENCES,
    recordReferenceKeywords: recordReferenceKeywords,
    recordReferenceName: recordReferenceName,
    recordReferenceLocator: recordReferenceLocator,
    sflChoiceKeywords: sflChoiceKeywords,
    alwrolClrlSlnoKeywords: alwrolClrlSlnoKeywords,
    fieldKindGuardedKeywords: fieldKindGuardedKeywords,
    parameterValues: parameterValues,
    maxLengthByParameter: maxLengthByParameter,
    maxLengthReference: maxLengthReference,
    widthParameterIsNumber: widthParameterIsNumber,
    widthMustFitDisplay: widthMustFitDisplay,
    minSpacesFromOtherFields: minSpacesFromOtherFields,
    notInSubfile: notInSubfile,
    notWithKeywords: notWithKeywords,
    blankDataTypeIsCharacter: blankDataTypeIsCharacter,
    subfileModeEntryKeywords: subfileModeEntryKeywords,
    subfileModeEntryRecordType: subfileModeEntryRecordType,
    subfileModeEntryIndicatorMode: subfileModeEntryIndicatorMode,
    sflmodeField: sflmodeField,
    sflrnaRequires: sflrnaRequires,
    messageSubfileFacts: messageSubfileFacts,
    foldDropRules: foldDropRules,
    subfileControlKeywords: subfileControlKeywords,
    subfileControlRecordType: subfileControlRecordType,
    parameterMode: parameterMode,
    optionIndicatorMode: optionIndicatorMode,
    displaySizeNamesMode: displaySizeNamesMode,
    requiredOnSubfileControl: requiredOnSubfileControl,
    excludedWhenSizeEqualsPage: excludedWhenSizeEqualsPage,
    excludedWithFieldSelection: excludedWithFieldSelection,
    sizeEqualsPageErrors: sizeEqualsPageErrors,
    sizeEqualsPageIgnored: sizeEqualsPageIgnored,
    sflendGrammar: sflendGrammar,
    subfileControlRequiredKeywords: subfileControlRequiredKeywords,
    optionIndicatorRequiredKeywords: optionIndicatorRequiredKeywords,
    refusesDisplaySizeNames: refusesDisplaySizeNames,
    initRetainReturnKeywords: initRetainReturnKeywords,
    takesNoParameters: takesNoParameters,
    optionIndicatorsAllowed: optionIndicatorsAllowed,
    initRetainReturnRelationKeywords: initRetainReturnRelationKeywords,
    recordRequires: recordRequires,
    requiresBareKeyword: requiresBareKeyword,
    recordExcludes: recordExcludes,
    fileAndRecordExcludes: fileAndRecordExcludes,
    fileExcludes: fileExcludes,
    fileRequires: fileRequires,
    notOnRecordTypes: notOnRecordTypes,
    requiresMenuBarRecordInFile: requiresMenuBarRecordInFile,
    windowHelpLogKeywords: windowHelpLogKeywords,
    requiresWindowOnRecord: requiresWindowOnRecord,
    wdwtitleVocabulary: wdwtitleVocabulary,
    wdwborderVocabulary: wdwborderVocabulary,
    minParameters: minParameters,
    hlpseqLimits: hlpseqLimits,
    setofTextMaxLength: setofTextMaxLength,
    mnubardspFieldShapes: mnubardspFieldShapes,
    requiresHelpSpecification: requiresHelpSpecification,
    cursorMessageHelpKeywords: cursorMessageHelpKeywords,
    cursorMessageHelpLevels: cursorMessageHelpLevels,
    cursorMessageHelpIndicatorMode: cursorMessageHelpIndicatorMode,
    entFldAtrRules: entFldAtrRules,
    hlptitleRules: hlptitleRules,
    msgalarmTriggers: msgalarmTriggers,
    fileDisplayIoKeywords: fileDisplayIoKeywords,
    msgLocLimits: msgLocLimits,
    errsflRefusedMsgLocs: errsflRefusedMsgLocs,
    dspsizUserNameRule: dspsizUserNameRule,
    commandFunctionParameterShapes: commandFunctionParameterShapes,
    fileDisplayIoShapes: fileDisplayIoShapes,
    fileHelpCommandKeywords: fileHelpCommandKeywords,
    commandKeyEntry: commandKeyEntry,
    commandKeyNumberClash: commandKeyNumberClash,
    commandKeyNumberClaim: commandKeyNumberClaim,
    commandKeyNumberRange: commandKeyNumberRange,
    isCommandKeyOutOfRange: isCommandKeyOutOfRange,
    commandKeyValueTypes: commandKeyValueTypes,
    passrcdOwnSectionRestricted: passrcdOwnSectionRestricted,
    usrdspmgtForbiddenKeywords: usrdspmgtForbiddenKeywords
  };
});
