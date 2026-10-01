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
  // Task I-121 message-data-field slice - the one rule CHKMSGID,
  // ERRMSGID and SFLMSGID each state for their message data field
  // parameter (`&message-data-field` / `&msg-data`), re-verified against
  // DDS_Keyword_V7r6.txt (CHKMSGID ~line 3721, ERRMSGID ~6215, SFLMSGID
  // ~11617): "The field name must exist in the record format, and the
  // field must be defined as a character field (data type A) with usage
  // P." One shared object, so the three keywords cannot drift apart.
  var MSG_DATA_FIELD_RULE = {
    mustExistInRecord: true,
    dataType: 'A',
    usage: 'P',
    ddsReference:
      'The field name must exist in the record format, and the field ' +
      'must be defined as a character field (data type A) with usage P.'
  };

  // Task I-121 SFLLIN/SFLCSRPRG slice - SFLCSRPRG's own DDS Reference
  // section (line ~10670, re-verified fresh, unchanged from what the code
  // already had) ends: "The SFLLIN keyword is not allowed in a record
  // that contains the SFLCSRPRG." Read literally that is unsatisfiable
  // (SFLCSRPRG is FIELD-level on the subfile record, SFLLIN is
  // RECORD-level on the control record), so I-80 enforces it through the
  // association the two records already have: a control record's
  // SFLCTL(subfile-record) parameter. A genuinely new shape - an
  // exclusion between a RECORD-level keyword on one record and a
  // FIELD-level keyword on a field of a DIFFERENT, associated record
  // (not `mutex`, which is same-record/same-field). One shared object,
  // referenced by both keywords, so the two cannot drift apart.
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
      mutex: ['ALWROL', 'ASSUME', 'MNUBAR', 'PULLDOWN', 'SFL', 'USRDFN'],

      // Task I-121 PASSRCD-restricted-keywords slice - WINDOW's own DDS
      // Reference section (line ~13673) separately states this. A
      // genuinely different restriction from the same-record `mutex`
      // list just above - PASSRCD is a file-level keyword naming a
      // record by string value, not a same-record keyword-presence
      // conflict - so it's a separate boolean field plus its own
      // citation, not folded into `mutex`/`ddsReference`. See
      // `passrcdRestrictedKeywords` below for the shared list this flag
      // feeds, and passrcdRecordConflictReason's own doc comment in
      // dspfWriter.js (Task I-24) for the consuming logic.
      passrcdRestricted: true,
      passrcdDdsReference: 'WINDOW cannot be specified for the record format specified by the PASSRCD keyword.'
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
      mutex: ['ASSUME', 'SFL', 'SFLCTL', 'USRDFN'],

      // Task I-121 PASSRCD-restricted-keywords slice - ALWROL's own DDS
      // Reference section (line ~2144) separately states this - see the
      // WINDOW entry's own comment above for why this is a separate
      // field from `mutex`.
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

      // Task I-121 PASSRCD-restricted-keywords slice - CLRL's own DDS
      // Reference section (line ~3987) separately states this - see the
      // WINDOW entry's own comment above.
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

      // Task I-121 PASSRCD-restricted-keywords slice - SLNO's own DDS
      // Reference section (line ~12631) separately states this - see
      // the WINDOW entry's own comment above.
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

    // Task I-121 Help-keyword mutex web slice - HLPDOC (I-38/I-67),
    // HLPBDY/HLPPNLGRP/HLPRCD/HLPRTN's own cross-exclusions, currently
    // spread across three functions (hlpdocConflictReason,
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
    //  3. HLPDOC <-> HLPRTN (file-level scope only - I-90's own research
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
      mutex: ['HLPBDY', 'HLPPNLGRP', 'HLPRTN']
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

    // Task I-121 HTML slice - htmlConflictReason's (I-41) own
    // HTML_MUTUAL_EXCLUSION_KEYWORDS array, plus its separate SFL
    // record-level restriction, folded into one entry. HTML's own DDS
    // Reference section states two independent restrictions: a 14-keyword
    // field-level mutex (the SAME field, unlike every RECORD_TYPES entry
    // above which is scoped to a record) and a same-record exclusion
    // against SFL (one-directional, like DSPMOD's own entry above - SFL's
    // own section says nothing about HTML). `isMutex`/`mutexKeywords`
    // don't care what array the caller checks membership against, so
    // both restrictions fit under the ordinary `mutex` shape; the new
    // `notAllowedInRecordType` field is a separate, single-value slot
    // (not folded into `mutex` itself) so a future keyword-index
    // generator (I-121's own eventual I-40-replacing goal) can tell "same
    // field" partners apart from "same record" ones without re-parsing
    // this comment.
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

    // Task I-121 MSGID slice - msgidExclusionConflictReason/
    // msgidExclusionNewConflictReason's (I-91) own MSGID_EXCLUDED_KEYWORDS
    // array plus msgidSflRecordReason's (I-92) separate SFL exclusion,
    // same shape as the HTML entry just above (a field-level mutex list
    // plus a one-directional "not allowed in a field of this record
    // type" restriction) - re-verified fresh against
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

    // Task I-121 WRDWRAP/IGCALTTYP slice - wrdwrapKeywordHit's (I-58) own
    // WRDWRAP_KEYWORD_CONFLICTS map and igcalttypKeywordHits's (I-71) own
    // IGCALTTYP_KEYWORD_CONFLICTS map, both shared through the same
    // generic `exclusionListHit` token-matching engine in dspfWriter.js.
    // A genuinely new shape from every entry above: not a plain keyword
    // NAME set (`mutex`), but a map from keyword name to either null (any
    // use of it is excluded) or an array of the specific PARAMETER TOKENS
    // that are excluded (a use with none of them is fine) - e.g.
    // AUTO(RAB) is fine on a WRDWRAP field but AUTO(RAZ)/AUTO(RAB) both
    // conflict, while CMP is excluded outright regardless of its operator
    // since every comparison operator it can take is on the list. Named
    // `conditionalMutex` to distinguish it from the unconditional `mutex`
    // shape; evaluated by the new `conditionalMutexHit` accessor below,
    // which IS the token-matching engine itself now (moved out of
    // dspfWriter.js's own `exclusionListHit`, the same "evaluation logic
    // lives beside the data it evaluates" split `isMutex`/`isWhitelisted`
    // already established).
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
      // Task I-121 WRDWRAP/IGCALTTYP eligibility slice - the two
      // field-eligibility facts from the same DDS Reference section (line
      // ~13788), previously the hard-coded WRDWRAP_BLOCKED_SHIFTS array and
      // a literal I/B test in dspfWriter.js plus a second copy of the nine
      // shifts in webviewClientHelpers.js's generalFieldKeywordRowMatches-
      // DataType: "This keyword can only be specified on fields that have a
      // usage of input-only (I) or input/output (B)" and "You cannot specify
      // the WRDWRAP keyword on the following keyboard shifts: Signed Numeric
      // (S), Numeric Only (Y), Digits Only (D), Numeric Only Character (M),
      // Floating Point (F), DBCS Only (J), DBCS Open (O), DBCS Either (E),
      // Graphic (G)". Re-verified fresh, unchanged from what the code had.
      allowedUsage: ['I', 'B'],
      blockedDataTypes: ['S', 'Y', 'D', 'M', 'F', 'J', 'O', 'E', 'G']
    },
    IGCALTTYP: {
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
      // Task I-121 WRDWRAP/IGCALTTYP eligibility slice - IGCALTTYP's own
      // "Specify this keyword only for input- and output-capable fields
      // whose keyboard shift type is A, N, X, W, or I. Do not specify this
      // keyword for DBCS fields." (line ~14968 section). Previously the
      // hard-coded IGCALTTYP_ALLOWED_SHIFTS array and a literal B test in
      // dspfWriter.js. Note the opposite polarity from WRDWRAP's
      // `blockedDataTypes`: IBM states this one as an allow-list, so it is
      // modeled as one rather than inverted into a blocked list.
      allowedUsage: ['B'],
      allowedDataTypes: ['A', 'N', 'X', 'W', 'I']
    },
    // Task I-121 VALNUM slice - VALNUM's first entry. DDS_Keyword_V7r6.txt,
    // "VALNUM (Validate Numeric) keyword for display files" (line ~13146):
    // "The field containing the VALNUM keyword must be defined as an
    // input-capable field with the data type Y." Re-verified fresh. Until
    // now this lived only as the General-tab row filter's own 'input-capable'
    // and 'numeric-only' scopes in webviewClientHelpers.js (no writer-level
    // guard exists - see the Deferred findings table). `allowedUsage` is the
    // same fact WRDWRAP carries; `requiredDataTypes` is the strict twin of
    // `allowedDataTypes` (a blank data type does NOT satisfy it - the row
    // stays hidden until a data type is chosen, exactly as before).
    VALNUM: {
      ddsReference:
        'The field containing the VALNUM keyword must be defined as an ' +
        'input-capable field with the data type Y.',
      allowedUsage: ['I', 'B'],
      requiredDataTypes: ['Y']
    },

    // Task I-121 PSHBTNFLD slice - the field-level rule web spread across
    // four existing functions: pshbtnfldConflictReason (I-57, the
    // whitelist itself plus the PSHBTNCHC requirement), pshbtnfldNew-
    // ConflictReason (I-64, the same whitelist's diff-based backstop),
    // pshbtnfldRemovalConflictReason (I-85, the requirement's reverse/
    // removal direction), and pshbtnfldBasicEditConflictReason (I-62, the
    // field-definition rule) - each independently re-embedding the same
    // DDS-Reference-stated facts as bare arrays/literals.
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
      // Task I-133: "The gutter value must be a number greater than one."
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

    // Task I-121 DUP/BLKFOLD-floating-point slice - DUP's own DDS
    // Reference section (line ~5490) and BLKFOLD's own (line ~2392) each
    // independently state the identical restriction, re-verified fresh,
    // unchanged from what floatIncompatibleKeywordNewConflictReason
    // (I-72/I-96) already enforced for both - only the "which keywords"
    // fact itself, previously living solely as each of these two
    // one-line wrapper functions' own hard-coded name, is new here.
    DUP: {
      floatDdsReference: 'You cannot specify the DUP keyword on a floating-point field (F in position 35).',
      notAllowedOnFloatingPointField: true
    },
    BLKFOLD: {
      floatDdsReference: 'You cannot specify the BLKFOLD keyword on a floating-point field (F in position 35).',
      notAllowedOnFloatingPointField: true
    },

    // Task I-121 CHRID slice - chridNewConflictReason (I-59, the field-
    // eligibility rule and its DUP mutex) and chridBasicEditConflictReason
    // (I-73, the Basic-tab-edit direction of the same eligibility rule)
    // each independently re-embed the same DDS-Reference-stated facts as
    // their own local constants (CHRID_USAGE_LABELS, CHRID_NUMERIC_TEXT,
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

    // Task I-121 date/time-keyword slice - DATFMT/DATSEP (date fields,
    // data type L) and TIMFMT/TIMSEP (time fields, data type T). Each
    // pair's own DDS Reference section re-verified fresh: DATFMT (line
    // ~4531), DATSEP (line ~4602), TIMFMT (line ~12864), TIMSEP (line
    // ~12927) - unchanged from what dateSeparatorConflictReason/
    // timeSeparatorConflictReason already had as their own hard-coded
    // FIXED_SEPARATOR_DATE_FORMATS/FIXED_SEPARATOR_TIME_FORMATS arrays.
    //
    // A shape distinct from CHRID's `mutex` (a fixed list of keyword
    // NAMES forbidden outright): here DATSEP/TIMSEP aren't forbidden by a
    // sibling keyword's mere PRESENCE, but by that sibling's own
    // PARAMETER value being one of four fixed-separator formats -
    // `fixedSeparatorPartner` names the sibling keyword to check,
    // `fixedSeparatorFormats` the values that forbid this one.
    // Task I-121 (DSPATR/COLOR/WDWBORDER/CHGINPDFT value-domain slice) -
    // the closed value sets of four display-attribute keywords, each from
    // its own DDS Reference section (DDS_Keyword_V7r6.txt: DSPATR ~line 8603
    // region, COLOR ~4092, WDWBORDER ~10850 region, CHGINPDFT ~3080
    // region). Lists are in IBM's own order; the webview keeps its own
    // panel display order and a test ties the two together. `validValues`
    // is the fact `validValues()` / `isValidValue()` read.
    // Task I-139 - the three alternative-key keywords' file-wide command-key
    // exclusions. Each alt key claims one command key (ALTHELP a CA key,
    // default CA01; ALTPAGEDWN / ALTPAGEUP a CF key, defaults CF08 / CF07),
    // and its own DDS Reference section (ALTHELP ~line 1884, ALTPAGEDWN/
    // ALTPAGEUP ~line 1970) lists the keywords that "cannot be specified in
    // a file with" it - the same list for the no-parameter (default) and
    // the explicit-parameter forms, matched on the key NUMBER. `excluded`
    // gives each listed keyword's relation to the alt key's number:
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
      excluded: [
        { keyword: 'ALTHELP', relation: 'any' }, { keyword: 'ALTPAGEDWN', relation: 'any' },
        { keyword: 'CAnn', relation: 'any' }, { keyword: 'CFnn', relation: 'any' },
        { keyword: 'MNUCNL', relation: 'caOnly' }, { keyword: 'MNUBARSW', relation: 'caOnly' },
        { keyword: 'MOUBTN', relation: 'opposite' }, { keyword: 'PSHBTNCHC', relation: 'opposite' },
        { keyword: 'SFLDROP', relation: 'any' }, { keyword: 'SFLENTER', relation: 'any' }, { keyword: 'SFLFOLD', relation: 'any' }
      ]
    },

    // Task I-121 (MOUBTN parameter-domain slice) - MOUBTN(EVENT
    // [TRAILING-EVENT] {Command key | EVENT-ID} [*QUEUE | *NOQUEUE]), from
    // its own DDS Reference section (DDS_Keyword_V7r6.txt, ~line 8729).
    // `validValues` is the EVENT / TRAILING-EVENT domain (the two share it),
    // in IBM's order: unshifted then shifted, left/middle/right, each
    // Pressed / Released / Double click.
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
      // Task I-136 - the MOUBTN section's exclusion table ("The following
      // keywords cannot be specified when the listed Command key has been
      // used on the MOUBTN keyword": CFxx excludes ALTHELP(CAyy) and CAxx;
      // CAxx excludes ALTPAGEDWN(CFyy), ALTPAGEUP(CFyy) and CFxx; xx = yy;
      // and CF01 / CA07 / CA08 exclude the alt keys written without a
      // parameter). Every row is the same rule: a MOUBTN Command key of one
      // type (CA or CF) and a partner claiming the SAME number as the
      // OPPOSITE type. `partners` names the alt keys and the type + default
      // key each one claims (the alt-key sections give the defaults: ALTHELP
      // CA01, ALTPAGEDWN CF08, ALTPAGEUP CF07); `plainKeyTypes` are the
      // ordinary CAnn / CFnn keywords, which claim their own type and number.
      // Same-type pairs (MOUBTN(CF08) with ALTPAGEDWN(CF08)) are not in the
      // table and stay allowed.
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
      ddsReference: 'COLOR(GRN | WHT | RED | TRQ | YLW | PNK | BLU): the valid parameter values are GRN, WHT, RED, TRQ, YLW, PNK and BLU.',
      validValues: ['GRN', 'WHT', 'RED', 'TRQ', 'YLW', 'PNK', 'BLU']
    },
    WDWBORDER: {
      ddsReference: 'WDWBORDER([color] [display-attribute] [characters]): the color parameter takes the COLOR values ' +
        '(default BLU); the display-attribute values are BL, CS, HI, ND, RI, UL.',
      displayAttributeValues: ['BL', 'CS', 'HI', 'ND', 'RI', 'UL'],
      colorValuesFrom: 'COLOR'
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
      // Task I-121 (date/time value-domain slice) - the format table in
      // DATFMT's own DDS Reference section, in IBM's order. No value is
      // "unspecified": that is a UI state, not a DDS value.
      validValues: ['*JOB', '*MDY', '*DMY', '*YMD', '*JUL', '*ISO', '*USA', '*EUR', '*JIS'],
      valuesDdsReference: 'Valid date formats: *JOB, *MDY, *DMY, *YMD, *JUL, *ISO, *USA, *EUR, *JIS.',
      // Task I-121 (display-width slice) - the "Field length" column of the
      // same format table, plus the two sentences that complete it: "If you
      // do not specify the DATFMT keyword, the default is *ISO", and for
      // *JOB "There are always 10 spaces reserved on the display screen
      // for a Date field with DATFMT(*JOB), even though 8 characters in
      // the case of *MDY, *DMY, and *YMD, or 6 characters in the case of
      // *JUL are displayed." (*JOB has no length of its own in the table;
      // 10 comes from that sentence.) Previously the engine's own
      // DATFMT_LENGTHS literal.
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
      // Task I-121 (display-width slice) - every row of TIMFMT's own format
      // table lists a Field length of 8, and the default (no TIMFMT) is
      // *ISO, also 8. Previously the engine's bare `return 8`.
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

    // Task I-121 SFLCHCCTL slice - SFLCHCCTL's own DDS Reference section
    // (line ~10566) states four independent rules, previously spread
    // across sflchcctlDefinitionUpdates (I-79, the field-shape rule) and
    // sflchcctlFieldConflictReason (I-79's own first-field/one-per-record
    // pair, plus I-86's SFLNXTCHG cross-check folded in later), each
    // re-embedding the same facts as its own hard-coded literals -
    // sflchcctlReorderConflictReason (I-87) and sflNxtchgSflchcctlConflictReason/
    // sflctlNxtchgSflchcctlConflictReason (I-86) read the first-field and
    // SFLNXTCHG facts too, from the other direction.
    //
    // Re-verified fresh against DDS_Keyword_V7r6.txt, unchanged from what
    // the code already had: "When the SFLCHCCTL keyword is specified on a
    // field, that field will be considered the control field for that
    // record. That field must be the first field defined in the subfile
    // record. That field must have a length of 1, data type of Y, decimal
    // positions of zero, and have a usage of H... SFLNXTCHC keyword cannot
    // be specified in a record that contains a field with the SFLCHCCTL
    // keyword. Only one SFLCHCCTL keyword can be used in one subfile
    // record." ("SFLNXTCHC" is the single-dropped-letter SFLNXTCHG typo
    // I-86's own doc comment already identified - the DDS Reference spells
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

    // Task I-125 - RANGE's own DDS Reference section (line ~10007),
    // COMP's own (line ~4381), and VALUES' own (line ~13201) each
    // independently state the identical restriction as DUP/BLKFOLD
    // above - all three are field-level-only keywords (per their own
    // sections), and each is a plain named keyword occurrence (per
    // getValidityCheckInstances' own doc comment: mutually exclusive
    // alternative keyword NAMES, not two keywords paired into one
    // state), so floatIncompatibleKeywordNewConflictReason (I-72/I-96)
    // applies to them unchanged - see rangeFloatNewConflictReason/
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

    // Task I-121 (DFT/DFTVAL floating-point slice) - dftGroupConflictReason
    // (L81/L82) blocked its four group members on a floating-point field
    // with a literal `dataType === 'F'` test. DFT's and DFTVAL's own DDS
    // Reference sections state it outright, re-verified fresh: DFT (line
    // ~4688) "The DFT keyword is not valid on floating point fields.",
    // DFTVAL (line ~4762) "You cannot specify the DFTVAL keyword on the
    // same field with a DFT, EDTCDE (Edit Code), or EDTWRD (Edit Word)
    // keyword, or on a floating-point field." EDTCDE and EDTWRD get
    // the same flag on the strength of their own eligibility sentences
    // (EDTCDE line ~5600: "valid only for fields with Y or blank in
    // position 35"; EDTWRD line ~5933: "valid for numeric only fields (Y
    // specified in position 35)") - F is neither, which is what the
    // group-wide float clause was already enforcing. Their OTHER data
    // types (e.g. A, P) fall outside those sentences too but are not
    // enforced anywhere - logged as a finding, not folded into this slice.
    DFT: {
      floatDdsReference: 'The DFT keyword is not valid on floating point fields.',
      notAllowedOnFloatingPointField: true,
      // Task I-121 (DFT output-requirement slice) - DFT's own page (line
      // ~4683, re-verified fresh): "For output-only and input/output fields,
      // you must also specify PUTOVR at the record level and OVRDTA at the
      // field level with the DFT keyword." A cross-LEVEL companion rule
      // (one record-level and one field-level keyword) on the usages that
      // can output; surfaced as an advisory note (L83), never a hard block.
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
      // Task I-138 - as EDTCDE above: Y, with a blank data type passing
      // (a blank position 35 plus decimal positions plus an editing keyword
      // is Y by the DDS default rules).
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
      floatDdsReference: 'You cannot specify the CHECK(AB) keyword on a floating-point field (F in position 35). ' +
        'You cannot specify the CHECK(M10), CHECK(M10F), CHECK(M11), and CHECK(M11F) keywords on a floating-point field (F in position 35).',
      notAllowedOnFloatingPointCodes: ['AB', 'M10', 'M10F', 'M11', 'M11F'],
      // Task I-121 (CHECK option-code table slice) - the full set of codes
      // CHECK's own DDS Reference section lists, by the function IBM
      // groups them under. The two-panel split the editor uses (Keying
      // options vs Validity check) is a presentation choice and is not
      // modelled here; RLTB is in the reference's cursor-control list.
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
      crossRecordExclusion: SFLLIN_SFLCSRPRG_RULE
    },

    // Task I-121 SFLRTNSEL slice - SFLRTNSEL's own DDS Reference section
    // (re-verified fresh against DDS_Keyword_V7r6.txt, unchanged from what
    // the code already had) states "If this keyword is specified then
    // SFLMLTCHC or SFLSNGCHC must be specified." - the CHKMSGID
    // dependency-on-qualifying-keywords shape (`qualifyingNames`), reused
    // unchanged with no CHECK-code variant. Previously the two names were
    // hard-coded in sflrtnselNewConflictReason (I-81).
    SFLRTNSEL: {
      ddsReference:
        'If this keyword is specified then SFLMLTCHC or SFLSNGCHC must be specified.',
      qualifyingNames: ['SFLSNGCHC', 'SFLMLTCHC'],
      qualifyingListText: 'SFLSNGCHC or SFLMLTCHC'
    },

    // Task I-121 SFLSNGCHC/SFLMLTCHC slice - SFLMLTCHC's own DDS Reference
    // section (line ~11398) and SFLSNGCHC's (line ~12500), re-verified
    // fresh against DDS_Keyword_V7r6.txt, each state: "The following
    // subfile control record keywords cannot be specified on a record with
    // the [SFLMLTCHC | SFLSNGCHC] keyword: SFLDROP, SFLFOLD, [the other
    // choice keyword]". A plain record-level mutex - the existing `mutex`
    // shape reused unchanged. Each section states it from its own side, so
    // each keyword gets its own entry (as with every other one-directional
    // mutex entry); order matches the order the guard reports in.
    SFLSNGCHC: {
      ddsReference:
        'The following subfile control record keywords cannot be specified ' +
        'on a record with the SFLSNGCHC keyword: SFLDROP, SFLFOLD, SFLMLTCHC.',
      mutex: ['SFLMLTCHC', 'SFLDROP', 'SFLFOLD']
    },
    SFLMLTCHC: {
      ddsReference:
        'The following subfile control record keywords cannot be specified ' +
        'on a record with the SFLMLTCHC keyword: SFLDROP, SFLFOLD, SFLSNGCHC.',
      mutex: ['SFLSNGCHC', 'SFLDROP', 'SFLFOLD']
    },

    // Task I-121 message-data-field slice - ERRMSGID's and SFLMSGID's own
    // optional `&msg-data` parameter states the SAME rule as CHKMSGID's
    // `&message-data-field` (see MSG_DATA_FIELD_RULE above). Their other
    // rules (MSGID's mutual exclusions, SFLMSGID's record-level shape)
    // are separate, already-migrated or out-of-scope facts and are not
    // part of these entries.
    ERRMSGID: {
      msgDataField: MSG_DATA_FIELD_RULE
    },
    SFLMSGID: {
      msgDataField: MSG_DATA_FIELD_RULE
    },

    // Task I-121 SFLSCROLL slice - the deferred finding the SFLCHCCTL
    // slice itself raised: SFLSCROLL's own DDS Reference section (line
    // ~12311) states the identical one-per-record shape SFLCHCCTL's
    // onePerRecord fact already models, plus a same-field mutex,
    // previously living only as sflScrollFieldConflictReason's own
    // inline literals.
    //
    // Re-verified fresh against DDS_Keyword_V7r6.txt, unchanged from
    // what the code already had: "You cannot specify the SFLROLVAL, the
    // SFLSCROLL and the SFLRCDNBR keywords for the same field. Only one
    // SFLSCROLL keyword is allowed in the subfile control record."
    // `mutex: ['SFLROLVAL', 'SFLRCDNBR']` reuses the plain same-field
    // mutex shape CHRID's own DUP entry already established; `onePerRecord`
    // reuses SFLCHCCTL's shape unchanged.
    //
    // Task I-126 / I-127 - the two further rules in the same DDS Reference
    // section, previously unenforced anywhere (logged as deferred findings
    // by this slice, then opened as their own tasks), now enforced and
    // stated here:
    //  - `definitionRequirements` (I-126): "This field must have the
    //    keyboard shift attribute of signed numeric with zero decimal
    //    positions. It has to be 5 digits in length, and it must be
    //    defined as a hidden field." Same shape as SFLCHCCTL's own
    //    definitionRequirements, plus `dataTypeBlankWithDecimals`: a
    //    blank data type with decimal positions specified IS signed
    //    numeric in DDS (the default), so it satisfies the rule as-is.
    //  - `notAllowedWhenEqual` (I-127): "SFLSCROLL is not allowed when
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
      // Task I-129 - see SFLRCDNBR / SFLROLVAL just below.
      validOnlyInSubfileControlRecord: {
        ddsReference: 'This keyword is valid only for the subfile-control record format.'
      }
    },

    // Task I-129 - SFLRCDNBR's and SFLROLVAL's own DDS Reference sections
    // (lines ~12062 and ~12173, re-read fresh alongside SFLSCROLL's, line
    // ~12311) each state the same field-level restriction SFLSCROLL does:
    // "This [optional] keyword is valid only for the subfile-control record
    // format." A new shape (`validOnlyInSubfileControlRecord`): a
    // field-level keyword restricted to fields of ONE record kind - the
    // subfile-control record (the one carrying SFLCTL) - so it is refused on
    // a field of an SFL detail record or of a plain record. These two
    // entries carry only that fact; their same-field mutex with SFLSCROLL
    // stays stated once, on SFLSCROLL's entry.
    SFLRCDNBR: {
      validOnlyInSubfileControlRecord: {
        ddsReference: 'This optional keyword is valid only for the subfile-control record format.'
      }
    },
    SFLROLVAL: {
      validOnlyInSubfileControlRecord: {
        ddsReference: 'This keyword is valid only for the subfile-control record format.'
      }
    },

    // Task I-121 SFLSIZ slice - SFLSIZ's own DDS Reference section (line
    // ~12367), re-verified fresh against DDS_Keyword_V7r6.txt, unchanged
    // from what I-22 already enforced: "You cannot use display size
    // condition names for this keyword when a program-to-system field is
    // used as a parameter for it." A new shape
    // (`sizeConditionedValueMustBeNumber`): the keyword's UNCONDITIONED
    // value may be a number or a program-to-system field (&name), but a
    // display-size-CONDITIONED instance's value may not be a field, so it
    // must be a plain number. SFLSIZ had no RECORD_TYPES entry before; this
    // one carries only that fact. Its other facts are not restated here:
    // "not allowed with SFLSCROLL when equal to SFLPAG" lives on SFLSCROLL,
    // and "option indicators are not valid" is a NO_OPTION_INDICATOR_KEYWORDS
    // entry.
    SFLSIZ: {
      sizeConditionedValueMustBeNumber: {
        ddsReference:
          'You cannot use display size condition names for this keyword ' +
          'when a program-to-system field is used as a parameter for it.'
      }
    },

    // Task I-121 SFLMSGKEY/SFLPGMQ slice - SFLMSGKEY's own DDS Reference
    // section (line ~11675) and SFLPGMQ's (line ~11935), re-verified fresh
    // against DDS_Keyword_V7r6.txt, unchanged from what I-101 (batch 4)
    // already enforced. SFLMSGKEY: "Option indicators are not valid for
    // this keyword or with the associated field." - the keyword half is a
    // NO_OPTION_INDICATOR_KEYWORDS table entry; this carries the FIELD half
    // (`noOptionIndicatorsOnField`: the field the keyword sits on takes no
    // option indicators either), a fact the table cannot express.
    // SFLPGMQ: "Option indicators and display size condition names are not
    // valid for this keyword." - the indicator half is likewise a table
    // entry; `noDisplaySizeCondition` carries the display-size half,
    // previously the one-element NO_DISPLAY_SIZE_CONDITION_KEYWORDS array.
    // Each entry carries only its own new fact; the option-indicator table
    // itself is deliberately left where it is.
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

    // Task I-121 SNGCHCFLD/MLTCHCFLD selection-type-parameters slice - the
    // *param flags each keyword's own format string offers, re-verified
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
        // Task I-133: "The gutter-width must be a positive integer of at
        // least 2." (SNGCHCFLD, DDS_Keyword_V7r6.txt ~line 12718; MLTCHCFLD
        // ~line 8080 says the same; PSHBTNFLD, ~line 9704, "must be a
        // number greater than one" - the same minimum.)
        gutterMinimum: 2,
        // Task I-134: "It can only be specified if either *NUMCOL or
        // *NUMROW has been specified" (SNGCHCFLD ~line 12717; MLTCHCFLD
        // ~line 8079 says the same). PSHBTNFLD's section says the opposite
        // ("it can be specified even if *NUMCOL or *NUMROW have not been
        // specified", ~line 9702), so it carries no such fact.
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

    // Task I-121 EDTCDE/EDTMSK slice - EDTCDE's own DDS Reference section
    // (line ~5618), re-verified fresh against DDS_Keyword_V7r6.txt,
    // unchanged from what the code already had: "You can optionally
    // specify asterisk fill or floating currency symbol with edit codes 1
    // through 4, A through D, and J through Q." Only W, X, Y and Z (the
    // other IBM edit codes) are therefore excluded; user-defined codes 5-9
    // are not mentioned either way and are left alone. A new shape
    // (`noFillCodes`): a list of the keyword's own parameter values that
    // cannot take the optional fill argument, plus the allowed-codes
    // wording the message quotes. Previously the hand-written
    // EDTCDE_NO_FILL_CODES array in dspfWriter.js. EDTCDE's DFT/DFTVAL/
    // EDTWRD exclusions live in MUTEX_GROUPS, not here.
    EDTCDE: {
      floatDdsReference: 'The EDTCDE keyword is valid only for fields with Y or blank in position 35 (Data Type/Keyboard Shift).',
      notAllowedOnFloatingPointField: true,
      // Task I-138 - the same sentence as an allow-list. Blank passes (see
      // the writer's keywordAllowedDataTypeAllows): the DDS position-35
      // default text says a blank entry with decimal positions and an editing
      // keyword becomes Y, and the sentence itself lists blank as valid.
      allowedDataTypes: ['Y'],
      // Task I-121 (display-width slice) - the display-affecting columns
      // of EDTCDE's "Table 6. Summary chart for IBM i edit codes", for the
      // dspfEngine's exact-width calculation (previously its own
      // EDTCDE_COMMAS / EDTCDE_SIGN_WIDTH literals). `commaCodes`: the
      // codes with "Commas displayed" = Yes (1, 2, A, B, J, K, N, O).
      // `signWidth`: extra positions the sign reserves - CR (A-D) is two
      // characters, a minus (J-Q) is one, the no-sign codes (1-4) and the
      // codes that strip it (X, Z) reserve none. `runtimeSeparatorCodes`:
      // W and Y insert job-attribute-dependent slashes (table notes 2 and
      // 3), so their width cannot be known at design time.
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

    // Task I-121 EDTCDE/EDTMSK slice - EDTMSK's own DDS Reference section
    // (line ~5782), re-verified fresh, unchanged from what I-31 already
    // enforced: "The field containing the EDTMSK keyword must be usage I
    // or usage B. It must also contain the EDTCDE or EDTWRD keywords."
    // Both facts reuse existing shapes unchanged - the CHKMSGID
    // `qualifyingNames`/`qualifyingListText` dependency and
    // `definitionRequirements.usage`. The section's further list of
    // keywords that cannot be specified on an EDTMSK field (AUTO(RAB, RAZ),
    // CHECK(AB, MF, RB, RZ, RLTB), CHOICE, CNTFLD, DSPATR(OID SP)) is not
    // enforced anywhere and is not restated here - logged in the Deferred
    // findings table.
    //
    // Task I-130 - that Deferred finding, now closed: the same section
    // (re-verified fresh) states "The following keywords cannot be
    // specified on a field with the EDTMSK keyword: AUTO (RAB, RAZ),
    // CHECK(AB, MF, RB, RZ, RLTB), CHOICE, CNTFLD, DSPATR(OID SP)." Three
    // of the five are parameter-restricted, so it reuses the token-
    // qualified `conditionalMutex` shape (WRDWRAP/IGCALTTYP slice) rather
    // than the plain name-only `mutex`: AUTO(RAB)/AUTO(RAZ) conflict but a
    // bare AUTO or AUTO(...) with no listed token does not, CHECK(ME) is
    // fine but CHECK(AB) is not, DSPATR(HI) is fine but DSPATR(OID)/
    // DSPATR(SP) are not; CHOICE and CNTFLD are excluded outright (null).
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

    // Task I-121 MNUBARSW/MNUCNL slice - MNUBARSW's own DDS Reference
    // section (line ~8626) and MNUCNL's (line ~8684), re-verified fresh
    // against DDS_Keyword_V7r6.txt, each state: "Within a record, the CAnn
    // key specified by [this keyword] cannot be specified again using
    // another keyword (such as [the other one])" and "Because [this
    // keyword] at the file level extends to all records in the file, this
    // must be considered when assigning a CAnn key." Each also documents
    // its own default when the CAnn parameter is omitted (MNUBARSW: CA10,
    // MNUCNL: CA12). A new shape - `caKeyPartner`/`caKeyDefault` - for two
    // keywords sharing one CA-key namespace, each with its own default;
    // deliberately NOT `mutex` (that shape is "cannot coexist at all";
    // this is "cannot be assigned the SAME CAnn value", and the two ARE
    // meant to coexist, per this file's own MNUBARSW/MNUCNL example). The
    // file-vs-record scoping the two sections state stays procedural, in
    // mnuBarKeyConflictReason (I-19) - it isn't a per-keyword fact.
    MNUBARSW: {
      caKeyPartner: 'MNUCNL',
      caKeyDefault: 'CA10',
      ddsReference:
        'Within a record, the CAnn key specified by the MNUBARSW keyword ' +
        'cannot be specified again using another keyword (such as MNUCNL).'
    },
    MNUCNL: {
      caKeyPartner: 'MNUBARSW',
      caKeyDefault: 'CA12',
      ddsReference:
        'Within a record, the CAnn key specified by the MNUCNL keyword ' +
        'cannot be specified again using another keyword (such as MNUBARSW).'
    }
  };

  // Task I-121 date/time-keyword slice - the L/T/Z usage restriction the
  // DDS Reference states once, for all three date/time data types
  // together, in the general field-description text ("Date (L), Time
  // (T), and Timestamp (Z)", page 18, re-verified fresh): "Valid field
  // usage (DDS position 38) can be O, B, or I" - unchanged from what
  // dateTimeUsageConflictReason already enforced. Keyed by data-type
  // letter rather than by keyword name, since this restricts a FIELD
  // PROPERTY (its data type), not any one keyword's own use - a
  // genuinely different axis from every RECORD_TYPES entry above, so it
  // gets its own small map rather than an awkward fourth "record type"
  // named after a data-type letter.
  var DATE_TIME_DATA_TYPES = { L: true, T: true, Z: true };
  var DATE_TIME_ALLOWED_USAGE = ['O', 'B', 'I'];

  // Task I-121 PSHBTNFLD slice - the PSHBTNFLD/PSHBTNCHC mutual
  // requirement ("A field containing the PSHBTNFLD keyword must also
  // contain one or more PSHBTNCHC keywords"; PSHBTNCHC's own section
  // states the reverse: "When the PSHBTNCHC keyword is specified on a
  // field, the PSHBTNFLD keyword must also be specified"). A genuinely
  // different relationship shape from MUTEX_GROUPS above - "each member
  // requires the other's presence" rather than "each member excludes the
  // others" - but the same symmetric-pair-list idiom, so it gets its own
  // list rather than overloading MUTEX_GROUPS with an inverted meaning.
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

  // Task I-121 DFT/DFTVAL/EDTCDE/EDTWRD slice - dftGroupConflictReason's
  // (L81/L82) own DFT_DFTVAL_CONFLICT_GROUP array: a genuinely different
  // shape from every RECORD_TYPES entry above - a full N-WAY mutual
  // exclusion (every member excludes every OTHER member), not a pairwise
  // owner-and-partners relationship. Modeling it as four separate
  // RECORD_TYPES.<NAME>.mutex entries would mean the same 4-choose-2 = 6
  // pairings stated 8 times over (each entry repeating the other three) -
  // a `MUTEX_GROUPS` list of the group itself, consulted via
  // `groupMutexKeywords` below, states each pairing exactly once instead.
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

  /** Task I-121 PASSRCD-restricted-keywords slice - whether `keywordName`
   *  is one of the keywords the DDS Reference forbids on the record
   *  format named by the file-level PASSRCD keyword (the WINDOW/ALWROL/
   *  CLRL/SLNO shape - see each entry's own `passrcdRestricted` comment
   *  above). Returns false for a keyword with no spec entry or no such
   *  flag. */
  function isPassrcdRestricted(keywordName) {
    var spec = RECORD_TYPES[keywordName];
    return !!(spec && spec.passrcdRestricted);
  }

  /** Task I-121 DUP/BLKFOLD-floating-point slice - whether `keywordName`
   *  is one of the keywords the DDS Reference forbids on a floating-point
   *  field (F in position 35) - see each entry's own `floatDdsReference`
   *  comment above. Returns false for a keyword with no spec entry or no
   *  such flag. */
  function isNotAllowedOnFloatingPointField(keywordName) {
    var spec = RECORD_TYPES[keywordName];
    return !!(spec && spec.notAllowedOnFloatingPointField);
  }

  // Task I-121 (edit/validity keyword groups slice) - the two field-level
  // keyword families a referenced (REF/REFFLD) field's own definition can
  // REPLACE or DELETE, previously three separate literal copies (the
  // engine's REFERENCE_EDIT_KEYWORDS / REFERENCE_VALIDITY_KEYWORDS and the
  // writer's EDIT_KEYWORDS). Each carries its delete keyword. Re-verified
  // fresh against DDS_Keyword_V7r6.txt: DLTEDT (line ~4805) "...ignore the
  // EDTCDE or EDTWRD keyword if either of them is specified for a referenced
  // field", and "If you specify a new editing keyword, DLTEDT is
  // unnecessary. The new editing keyword overrides the referenced editing
  // keyword."; DLTCHK (line ~4785) "...ignore all validity checking and
  // CHKMSGID keywords that are specified for a referenced field", with the
  // same override sentence. EDTMSK is deliberately not part of EDIT (it
  // stands alone and combines with EDTCDE/EDTWRD - see dspfWriter.js).
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
  /** Task I-121 (edit/validity keyword groups slice) - a copy of the named
   *  group ('EDIT' or 'VALIDITY'): { keywords, deleteKeyword, ddsReference };
   *  null for an unknown name. */
  function fieldKeywordGroup(name) {
    var g = FIELD_KEYWORD_GROUPS[name];
    return g ? { keywords: g.keywords.slice(), deleteKeyword: g.deleteKeyword, ddsReference: g.ddsReference } : null;
  }

  /** Task I-121 (DFT output-requirement slice) - the companion-keyword rule
   *  `keywordName` carries for output-capable usages (see DFT's entry), as a
   *  copy safe to mutate, or null when it has none. */
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

  /** Task I-121 (CHECK option-code table slice) - every CHECK code, grouped
   *  by IBM's function name. Copies; empty for a keyword with no such
   *  fact. */
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

  /** Task I-121 (date/time value-domain slice) - the values a keyword's
   *  parameter may take, as declared in its own DDS Reference section
   *  (DATFMT / DATSEP / TIMFMT / TIMSEP). A copy, safe to mutate; [] for a
   *  keyword with no such fact. Does not include the UI's own
   *  "unspecified" choice. */
  function validValues(keywordName) {
    var spec = RECORD_TYPES[keywordName];
    return spec && spec.validValues ? spec.validValues.slice() : [];
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

  /** Task I-139 - the alt keys' file-wide command-key exclusions, one entry
   *  per alt key (ALTHELP, ALTPAGEDWN, ALTPAGEUP): { keyType, defaultKey,
   *  excluded: [{ keyword, relation }], ddsReference }. Copies. */
  function altKeyFileExclusions() {
    var out = {};
    ['ALTHELP', 'ALTPAGEDWN', 'ALTPAGEUP'].forEach(function (k) {
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

  /** Task I-136 - MOUBTN's Command-key exclusion table (see the spec entry's
   *  own comment). A copy; null if the fact is missing. */
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

  /** Task I-121 (WRDWRAP/IGCALTTYP slice) - the token-matching engine
   *  moved here from dspfWriter.js's own `exclusionListHit`, now reading
   *  `recordType`'s `conditionalMutex` map instead of taking one as a
   *  plain argument. Returns the matched label (e.g. "CHECK(RB)", "DUP")
   *  when `k` (a `{name, parameters}` keyword instance) hits
   *  `recordType`'s own conditional-mutex map, else null. Token-matched
   *  (split on whitespace/commas/parens) rather than substring-matched,
   *  so e.g. CHECK(RB) hits but CHECK(AB) doesn't. */
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

  /** Task I-121 (WRDWRAP/IGCALTTYP eligibility slice) - the closed list of
   *  field usages `keywordName` may be specified on (e.g. ['I', 'B'] for
   *  WRDWRAP), or null when the keyword's spec entry states no such
   *  restriction. Returns a copy. */
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

  /** Task I-121 SFLCHCCTL slice - whether `keywordName` must be on the
   *  first (named, non-constant) field defined in its record (the
   *  SFLCHCCTL shape). Returns false for a keyword with no spec entry or
   *  no such flag. */
  function mustBeFirstField(keywordName) {
    var spec = RECORD_TYPES[keywordName];
    return !!(spec && spec.mustBeFirstField);
  }

  /** Task I-127 - the pair of record-level keywords whose EQUAL parameter
   *  values forbid `keywordName` (the SFLSCROLL shape: "not allowed when
   *  SFLSIZ equals SFLPAG"), as `{ keywords: [a, b], ddsReference }`, or
   *  null for a keyword with no such fact. */
  function notAllowedWhenEqual(keywordName) {
    var spec = RECORD_TYPES[keywordName];
    return (spec && spec.notAllowedWhenEqual) || null;
  }

  /** Task I-121 message-data-field slice - the rule a keyword's message
   *  data field parameter must satisfy (the CHKMSGID/ERRMSGID/SFLMSGID
   *  shape: must exist in the record, data type A, usage P), or null for
   *  a keyword with no such parameter. */
  function msgDataFieldRule(keywordName) {
    var spec = RECORD_TYPES[keywordName];
    return (spec && spec.msgDataField) || null;
  }

  /** Task I-121 MNUBARSW/MNUCNL slice - `{ partner, defaultCakey }` for
   *  `keywordName`'s CA-key-collision partner, or null when it has none. */
  function caKeyPartner(keywordName) {
    var spec = RECORD_TYPES[keywordName];
    if (!spec || !spec.caKeyPartner) return null;
    return { partner: spec.caKeyPartner, defaultCakey: spec.caKeyDefault };
  }

  /** Task I-121 SFLSIZ slice - whether `keywordName`'s display-size-
   *  conditioned instances must carry a plain number rather than a
   *  program-to-system field (SFLSIZ). */
  function sizeConditionedValueMustBeNumber(keywordName) {
    var spec = RECORD_TYPES[keywordName];
    return !!(spec && spec.sizeConditionedValueMustBeNumber);
  }

  /** Task I-121 EDTCDE/EDTMSK slice - whether `code` is one of
   *  `keywordName`'s own parameter values that cannot take the optional
   *  fill argument (EDTCDE's W/X/Y/Z). Case-insensitive; false for a
   *  keyword with no such fact or a blank/unknown code. */
  function isNoFillEditCode(keywordName, code) {
    var spec = RECORD_TYPES[keywordName];
    var rule = spec && spec.noFillCodes;
    if (!rule) return false;
    var c = String(code == null ? '' : code).trim().toUpperCase();
    return !!c && rule.codes.indexOf(c) >= 0;
  }

  /** Task I-121 (display-width slice) - the number of screen positions a
   *  DATFMT value reserves (e.g. '*MDY' -> 8, '*JOB' -> 10), case-
   *  insensitive, or null for an unknown/blank value (the caller applies
   *  the default - see `datfmtDefaultDisplayLength`). */
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

  /** Task I-121 SFLMSGKEY/SFLPGMQ slice - whether a field carrying
   *  `keywordName` takes no option indicators of its own (SFLMSGKEY's
   *  "or with the associated field" half). */
  function noOptionIndicatorsOnField(keywordName) {
    var spec = RECORD_TYPES[keywordName];
    return !!(spec && spec.noOptionIndicatorsOnField);
  }

  /** Task I-121 SFLMSGKEY/SFLPGMQ slice - whether display size condition
   *  names (*DS3/*DS4) are not valid for `keywordName` (SFLPGMQ). */
  function noDisplaySizeCondition(keywordName) {
    var spec = RECORD_TYPES[keywordName];
    return !!(spec && spec.noDisplaySizeCondition);
  }

  /** Task I-129 - whether `keywordName` is a field-level keyword valid only
   *  in the subfile-control record format (SFLSCROLL, SFLRCDNBR,
   *  SFLROLVAL). */
  function validOnlyInSubfileControlRecord(keywordName) {
    var spec = RECORD_TYPES[keywordName];
    return !!(spec && spec.validOnlyInSubfileControlRecord);
  }

  /** Task I-121 SFLLIN/SFLCSRPRG slice - the cross-record exclusion fact
   *  (`controlRecordKeyword`, `subfileFieldKeyword`, `associatedVia`,
   *  `ddsReference`) `keywordName` takes part in, or null. */
  function crossRecordExclusion(keywordName) {
    var spec = RECORD_TYPES[keywordName];
    return (spec && spec.crossRecordExclusion) || null;
  }

  /** Task I-121 message-data-field slice - every keyword that carries a
   *  message data field parameter, in spec order. */
  function msgDataFieldKeywords() {
    return Object.keys(RECORD_TYPES).filter(function (k) {
      return !!RECORD_TYPES[k].msgDataField;
    });
  }

  /** Task I-121 SNGCHCFLD/MLTCHCFLD slice - `keywordName`'s flag groups
   *  (`[{name, flags}]`, copies), or [] for a keyword with no
   *  `selectionParameters` fact. */
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

  /** Task I-133 - the smallest *GUTTER width `keywordName` accepts
   *  (SNGCHCFLD / MLTCHCFLD / PSHBTNFLD: 2), or 0 for a keyword with no
   *  such fact. */
  function gutterMinimum(keywordName) {
    var spec = RECORD_TYPES[keywordName];
    if (!spec) return 0;
    if (typeof spec.gutterMinimum === 'number') return spec.gutterMinimum;
    var sp = spec.selectionParameters;
    return sp && typeof sp.gutterMinimum === 'number' ? sp.gutterMinimum : 0;
  }

  /** Task I-134 - whether `keywordName`'s *GUTTER may only be specified
   *  together with *NUMCOL or *NUMROW (SNGCHCFLD / MLTCHCFLD: true;
   *  PSHBTNFLD and every other keyword: false). */
  function gutterRequiresLayout(keywordName) {
    var spec = RECORD_TYPES[keywordName];
    var sp = spec && spec.selectionParameters;
    return !!(sp && sp.gutterRequiresLayout);
  }

  /** Task I-121 record-indicator group slice - the group's keyword names in
   *  the writer's original order (a copy). */
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

  /** Task I-121 repeatable-instance groups slice - the keyword names of
   *  `groupName` ('validityCheck' | 'errorMessages' | 'messageId') in the
   *  writer's original order (a fresh array); [] for an unknown group. */
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

  /** Task I-121 choice color-state slice - the three state keyword names in
   *  the writer's original order (a fresh array). */
  function choiceColorStateKeywords() {
    return Object.keys(CHOICE_COLOR_STATE_KEYWORDS);
  }

  /** The state keywords `recordType`'s own whitelist allows on a field
   *  (`PSHBTNFLD` -> CHCAVAIL, CHCUNAVAIL; a record type with no whitelist
   *  allows all three, as isWhitelisted does), same order. */
  function choiceColorStateKeywordsAllowedOn(recordType) {
    return choiceColorStateKeywords().filter(function (k) { return isWhitelisted(recordType, k); });
  }

  /** Task I-121 SFLCHCCTL slice - whether only one field in the whole
   *  record may carry `keywordName` (the SFLCHCCTL shape). Returns false
   *  for a keyword with no spec entry or no such flag. */
  function isOnePerRecord(keywordName) {
    var spec = RECORD_TYPES[keywordName];
    return !!(spec && spec.onePerRecord);
  }

  /** Task I-121 no-option-indicators slice - the fact for `keywordName`
   *  (`{kind, levels, ddsReference[, fileLevelOnly]}`), or null. */
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
  // Task I-121 no-option-indicators slice
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
    // Task I-135: SETOFF is documented as equivalent to SETOF (its own section
    // is only that equivalence), and SETOF's section says option indicators
    // are not valid, so the same holds for it.
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
  // Task I-121 record-indicator keyword group slice
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
  // INDTXT have one, the other six do not), so the two can never drift.
  // Not migrated: the row labels and the dropdown's own order (a screen
  // presentation). (Task I-135 later added SETOFF as SETOF's alternate name.)
  var RECORD_INDICATOR_KEYWORDS = {
    CLEAR: { ddsReference: 'specify that your program is to receive control if the workstation user presses the Clear key' },
    PAGEDOWN: { alternateNames: ['ROLLUP'], ddsReference: 'The PAGEDOWN keyword is the same as the ROLLUP keyword.' },
    PAGEUP: { alternateNames: ['ROLLDOWN'], ddsReference: 'The PAGEUP keyword is the same as the ROLLDOWN keyword.' },
    HOME: { ddsReference: 'specify that you want to recognize and handle the Home key through your program' },
    HELP: { ddsReference: 'enable the Help key' },
    HLPRTN: { ddsReference: 'return control to your program when you press the Help key' },
    VLDCMDKEY: { ddsReference: 'set on the specified response indicator when any valid command key other than the Enter key' },
    // Task I-135: "SETOF is equivalent to the SETOFF keyword" (and SETOFF's
    // own section says the reverse, "The SETOF keyword is preferred").
    SETOF: { alternateNames: ['SETOFF'], ddsReference: 'SETOF is equivalent to the SETOFF keyword.' },
    CHANGE: { ddsReference: 'set on the specified response indicator for an input operation' },
    INDTXT: { ddsReference: 'associate a descriptive text (indicating intent or use) with a specific response or option indicator' }
  };

  // -----------------------------------------------------------------------
  // Task I-121 repeatable-instance keyword groups slice
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
  // Task I-121 choice color-state keywords slice
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

  return {
    RECORD_TYPES: RECORD_TYPES,
    isWhitelisted: isWhitelisted,
    isMutex: isMutex,
    mutexKeywords: mutexKeywords,
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
    isValidValue: isValidValue,
    checkCodes: checkCodes,
    checkCodeGroup: checkCodeGroup,
    conditionalMutexHit: conditionalMutexHit,
    groupMutexKeywords: groupMutexKeywords,
    requiredPartner: requiredPartner,
    definitionRequirements: definitionRequirements,
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
    choiceColorStateKeywordsAllowedOn: choiceColorStateKeywordsAllowedOn,
    REPEATABLE_INSTANCE_GROUPS: REPEATABLE_INSTANCE_GROUPS,
    repeatableGroupKinds: repeatableGroupKinds,
    repeatableGroupAlternateKinds: repeatableGroupAlternateKinds,
    recordIndicatorKeywordNames: recordIndicatorKeywordNames,
    recordIndicatorAlternateKinds: recordIndicatorAlternateKinds,
    recordIndicatorTakesOptionIndicators: recordIndicatorTakesOptionIndicators
  };
});
