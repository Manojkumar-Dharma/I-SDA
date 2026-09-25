/**
 * keywordSpec.js
 *
 * Task I-121 - "One declarative rule spec per keyword". Rules for a given
 * keyword or record type currently live scattered across `*ConflictReason`
 * functions (dspfWriter.js), rule tables, and UI row/guard wiring
 * (webviewClientHelpers.js), each hand-synced against the DDS Reference
 * separately. This module is the first slice of a single declarative
 * source of truth those places can read from instead - started with the
 * USRDFN record type (I-121's own task note: "split by record type when
 * claiming"), the smallest and most self-contained rule surface.
 *
 * Each entry is verified against `DDS_Keyword_V7r6.txt` directly, not
 * against the existing code, per I-121's own instruction - the citation
 * in each entry's `ddsReference` field is the exact justifying text.
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

      // Task I-114: of the ten indicator "kinds" the shared repeatable
      // Indicator-instance component (recordIndicatorInstancesHtml) can
      // hold (CLEAR, HOME, HELP, HLPRTN, VLDCMDKEY, PAGEDOWN, PAGEUP,
      // CHANGE, SETOF, INDTXT), only HELP and HLPRTN are on USRDFN's own
      // whitelist above - this is a derived fact (every kind not on
      // `whitelist` is refused), kept here explicitly so the UI's kind
      // selector and status text don't have to re-derive it by re-running
      // the whitelist check against all ten kinds every render.
      indicatorKinds: ['HELP', 'HLPRTN'],

      // Task R2 (narrowed) / I-114 (Indicator added back): which of the
      // seven possible record-Keywords subtabs a USRDFN record shows.
      // Real SDA's own "Select Record Keywords" menu for a USRDFN record
      // has no Indicator/Output/Input/Overlay categories at all (not just
      // empty ones) - this codebase deliberately departs from that for
      // Indicator (I-114) so HELP/HLPRTN, otherwise reachable only through
      // the raw keyword editor, get a proper row.
      keywordTabs: ['general', 'indicator', 'help', 'print']
    },

    // Task I-121 WINDOW slice. Unlike USRDFN's closed whitelist (a record
    // of that type may carry ONLY the listed keywords), WINDOW's own DDS
    // Reference section states a short closed MUTEX list instead: a
    // record with WINDOW may not also carry any of these six, and -
    // stated in the same sentence, so genuinely bidirectional rather than
    // two separate rules - a record with any of these six may not also
    // carry WINDOW. A mutex is symmetric by construction: there is no
    // "marker keyword" whose presence is being tested for eligibility the
    // way USRDFN's whitelist tests every OTHER keyword against one fixed
    // record type; both keywordName and the record's existing keywords
    // are checked against the same list from either side. WINDOW itself
    // is deliberately absent from its own mutex list (a record cannot
    // conflict with itself), matching the code's existing
    // `windowMutexConflictReason`.
    WINDOW: {
      // DDS_Keyword_V7r6.txt, "WINDOW (Define a Window) keyword for
      // display files" section (line ~13664): a closed six-keyword
      // mutual-exclusion list, re-verified fresh against the DDS
      // Reference text itself, unchanged from what the code already had.
      // SFLCTL is explicitly named as an exception (not in this list) -
      // "The WINDOW keyword is allowed on a record with the SFLCTL
      // keyword" - and PASSRCD has its own separate, already-fixed (I-24)
      // restriction, not part of this closed list.
      ddsReference:
        'The WINDOW keyword is not allowed on a record format that has ' +
        'any one of the following keywords specified: ALWROL, ASSUME, ' +
        'MNUBAR, PULLDOWN, SFL, USRDFN.',
      mutex: ['ALWROL', 'ASSUME', 'MNUBAR', 'PULLDOWN', 'SFL', 'USRDFN']
    },

    // Task I-121 PULLDOWN slice. Same mutex shape as WINDOW above (a
    // closed list forbidden on the same record in either direction), just
    // a much larger list - re-verified fresh against PULLDOWN's own DDS
    // Reference section, unchanged from what the code already had.
    // PULLDOWN itself is deliberately absent from its own mutex list.
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

    // Task I-121 MNUBAR slice. Same closed-whitelist SHAPE as USRDFN
    // above ("only these are allowed on a record with the marker
    // keyword"), but with one genuinely new wrinkle USRDFN's own list
    // didn't need: two of the DDS Reference's own 27 table entries,
    // CAnn and CFnn, are written in the Reference itself as a
    // placeholder pattern (n = a two-digit number), not literal keyword
    // names - and this codebase's own model represents each one as an
    // individual literal keyword (CA01..CA24/CF01..CF24, see
    // DspfWriter.parseCommandKeys' own comment), so a fixed whitelist
    // array alone can't express membership for these two entries. Hence
    // the new `whitelistPatterns` field alongside `whitelist` below -
    // still the same "is this keyword one of the allowed ones" question
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

    // Task I-121 SFL slice. Whitelist shape again (like USRDFN's/
    // MNUBAR's own slices), but SFL's own DDS Reference section states
    // TWO mutually exclusive closed lists under one "Besides SFL, the
    // following keywords are also valid on the subfile record format:"
    // heading, split by whether the record is a message subfile - so
    // this slice is two spec entries, not one. SFLCTL's own section was
    // re-read fresh too (per this task's own "verify against the DDS
    // Reference directly" instruction) and, unlike SFL's, introduces its
    // keyword tables as an explicit SUMMARY of SFL-family keywords, not
    // a "no other keyword applies" claim - so SFLCTL needs no whitelist
    // entry of its own here (see sflWhitelistConflictReason's own doc
    // comment, Task I-46's original finding). That leaves this single
    // slice covering both the "SFL/SFLCTL" and "message subfile" record
    // types the task's own remaining-work list had listed separately.
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

    // Task I-121 SFL slice, message-subfile half. A genuinely different
    // shape from every other entry in this file so far: a record type
    // identified by TWO marker keywords being present TOGETHER (SFL AND
    // SFLMSGRCD), not by one - a plain SFL record with no SFLMSGRCD
    // falls under the SFL entry above instead; markerKeyword is
    // deliberately an array here (singular `markerKeyword` elsewhere)
    // to make that two-keyword identification explicit rather than
    // implicit in calling code.
    SFLMSG: {
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

    // Task I-121 KEEP/ALWROL/CLRL/SLNO/ASSUME slice - a well-scoped piece
    // of the "plain/base record" remainder rather than that whole
    // undertaking, covering the existing keepMutexConflictReason (I-28)
    // and alwrolClrlSlnoConflictReason (I-37) functions' own rule webs.
    // Unlike WINDOW/PULLDOWN above, none of KEEP/ALWROL/CLRL/SLNO/ASSUME
    // is a record-TYPE identifier written once by a creation wizard -
    // they're ordinary toggleable flags any record can carry (see this
    // codebase's own pre-existing doc comments on keepMutexConflictReason/
    // alwrolClrlSlnoConflictReason) - but the DDS Reference states their
    // restrictions in the exact same "cannot be specified with the
    // following keywords" closed-mutex shape `mutex`/`isMutex` already
    // model, just keyed by an ordinary keyword name here instead of a
    // record-type marker. Five entries, cross-verified fresh against
    // each keyword's own DDS Reference section AND (per I-23's/I-28's/
    // I-37's own established cross-verification method) each mutex
    // partner's own section restating the exclusion the other way:
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
      mutex: ['ASSUME', 'SFL', 'SFLCTL', 'USRDFN']
    },
    CLRL: {
      // DDS_Keyword_V7r6.txt, "CLRL (Clear Line) keyword for display
      // files" section (line ~3917): "The CLRL keyword cannot be
      // specified with any of the following keywords:" ASSUME, KEEP,
      // SFL, SFLCTL, USRDFN - identical partner list to ALWROL's own.
      ddsReference:
        'The CLRL keyword cannot be specified with any of the ' +
        'following keywords: ASSUME, KEEP, SFL, SFLCTL, USRDFN.',
      mutex: ['ASSUME', 'SFL', 'SFLCTL', 'USRDFN']
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
      mutex: ['ASSUME', 'SFL', 'SFLCTL', 'USRDFN']
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
    }
  };

  /** Whether `keywordName` is allowed on a record of `recordType` per that
   *  type's own closed whitelist. Returns true for a record type with no
   *  spec entry (nothing to restrict) or no whitelist. Checks the literal
   *  `whitelist` array first, then falls back to `whitelistPatterns` (the
   *  MNUBAR slice's own addition, for entries the DDS Reference itself
   *  states as a placeholder pattern - e.g. CAnn/CFnn - rather than as a
   *  literal keyword name). */
  function isWhitelisted(recordType, keywordName) {
    var spec = RECORD_TYPES[recordType];
    if (!spec || !spec.whitelist) return true;
    if (spec.whitelist.indexOf(keywordName) !== -1) return true;
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

  /** `recordType`'s own mutex list, in the DDS Reference's own order - a
   *  copy, safe for the caller to `.filter()` without mutating the spec.
   *  Returns an empty array for a record type with no spec entry or no
   *  mutex list. Used where a caller needs the actual conflicting names
   *  (to join into a message), not just the yes/no `isMutex` answers. */
  function mutexKeywords(recordType) {
    var spec = RECORD_TYPES[recordType];
    return (spec && spec.mutex) ? spec.mutex.slice() : [];
  }

  return {
    RECORD_TYPES: RECORD_TYPES,
    isWhitelisted: isWhitelisted,
    isMutex: isMutex,
    mutexKeywords: mutexKeywords
  };
});
