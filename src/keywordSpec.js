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
      notAllowedInRecordType: 'SFL'
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
      }
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
    }
  };

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

  return {
    RECORD_TYPES: RECORD_TYPES,
    isWhitelisted: isWhitelisted,
    isMutex: isMutex,
    mutexKeywords: mutexKeywords,
    notAllowedInRecordType: notAllowedInRecordType,
    conditionalMutexHit: conditionalMutexHit,
    groupMutexKeywords: groupMutexKeywords,
    requiredPartner: requiredPartner,
    definitionRequirements: definitionRequirements
  };
});
