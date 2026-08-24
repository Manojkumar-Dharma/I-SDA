# Changelog

All notable changes to the iSDA extension are documented here.
Format loosely follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [0.9.53] - Unreleased

### Added
- **Task R13 - MNUBAR-specific record picker** (see
  `docs/sda-reference/PICKER-SCREENS-PLAN.md`), a new "MNUBAR" tab on the
  record properties panel shown only for records carrying `MNUBAR`, with
  a single General accordion:
  - `MNUBAR` itself, modeled as a plain present/absent flag with an
    optional free-text parameter - the real SDA screen's "Display
    separator" sub-row wasn't confidently matched to a specific literal
    DDS parameter value, so it's reachable through that free-text box (or
    the raw Keywords editor) rather than guessed at.
  - `MNUBARSW` (menu-bar switch key) and `MNUCNL` (menu-cancel key),
    reused as-is from the file-level picker (Task F1) - refactored
    `menuBarKeysPanelHtml`/`wireMenuBarKeysPanel` out of that picker into
    shared, `idPrefix`-parameterized functions (same pattern R7 already
    used for Window Border) so both reuse the same ~25 lines instead of
    duplicating them; the file-level panel's own ids/behavior are
    unchanged (manually verified, since it wasn't covered by existing
    dedicated tests).
  - `MNUBARDSP` (Menu-Bar Display Keywords) is deliberately **not**
    rebuilt here - it's already on Task R1's base Record Keywords →
    General tab (present for every record type including MNUBAR), and
    real SDA's own "Select Menu-Bar Record Keywords" menu only lists
    General + the base Record Keywords menu anyway - the dedicated
    "Define Menu-Bar Display Keywords" sub-screen is reached from
    MNUBARDSP's own "Select parameters" flag, not a separate top-level
    category, so R1's existing free-text parameters box already reaches
    its one sub-field ("Pull-down input field", a field name).
  - New `runMnuBarPickerScenario` in `dspfWebview.test.js`: tab
    visibility, MNUBAR's own pre-fill/commit, and MNUBARSW/MNUCNL
    committing independently of MNUBAR and of each other.

## [0.9.52] - Unreleased

### Added
- **Task R4 - SFLCTL-specific record picker** (see
  `docs/sda-reference/PICKER-SCREENS-PLAN.md`), a new "SFLCTL" tab on the
  record properties panel shown only for records carrying `SFLCTL`
  (mutually exclusive with the SFL tab - a control record gets SFLCTL,
  not SFL), with four accordions:
  - **General**: `SFLCTL`/`SFLCSRRRN`/`SFLMODE` (name parameters),
    `SFLDSP`/`SFLDSPCTL`/`SFLINZ`/`SFLDLT`/`SFLCLR`/`SFLRNA` (plain
    flags), `SFLEND` (`*MORE`/`*SCRBAR`/blank), `SFLDROP`/`SFLFOLD`/
    `SFLENTER` (a `CFnn`/`CAnn` parameter) - plus R3's Subfile Keywords
    (`SFLNXTCHG`/`LOGOUT`/`LOGINP`/`KEEP`/`CHECK(AB)`/`CHECK(RL)`) folded
    into the same accordion rather than showing a separate "SFL" tab on a
    control record, since those DDS keywords aren't restricted to the SFL
    detail record and real SDA's own SFLCTL screen groups `CHECK(AB)`/
    `CHECK(RL)` alongside SFLCTL's own keywords.
  - **Indicator**: R3's repeatable `INDTXT`/`SETOF`/`CHANGE` component,
    reused as-is (same rows, same Apply-button batch commit).
  - **Display Layout**: `SFLSIZ`/`SFLPAG` (each a literal number OR a
    field name, matching the real screen's "Program-to-system field"
    alternate entry) and `SFLLIN`. New `DspfWriter.getSflDisplayLayout`/
    `setSflDisplayLayout`.
  - **Subfile Messages**: `SFLMSG` (single quoted message, reusing the
    existing `getFileQuotedText`/`setFileQuotedText` shape) and
    `SFLMSGID` (message-id/message-file/library, new
    `DspfWriter.getSflMsgId`/`setSflMsgId`).
  - Deliberately not modeled as repeatable, despite the real screens
    showing 4 blank rows each: `SFLMSG`/`SFLMSGID` can appear multiple
    times in real DDS, each independently conditioned by its own
    up-to-3-indicator set (not an embedded parameter the way `INDTXT`'s
    response indicator is) - the same "multiple conditioned instances of
    a keyword" limitation R1/F1/D1/R3 already document and defer
    everywhere else. `SFLMSGID`'s trailing "Ind"/"Name" columns on the
    real screen aren't modeled either - only the documented msgid/
    message-file/library 3-parameter form was confidently verified.
  - New `runSflCtlPickerScenario` in `dspfWebview.test.js`: tab
    visibility/mutual-exclusivity with the SFL tab, General pre-fill and
    independent commits (including the reused R3 keywords), the reused
    Indicator component, Display Layout's field-name-or-number handling,
    and Subfile Messages' independent SFLMSG/SFLMSGID commits.

- **Task R2 - USRDFN wiring**: real SDA's own "Select Record Keywords"
  menu for a USRDFN record (`docs/sda-reference/screens/record-level/
  usrdfn/_menu-example/image26.png`) offers only 4 of R1's 8 categories -
  General, Application help, Help, Print (Indicator/Output/Input/Overlay
  are absent from that menu entirely, not just empty). Pure wiring, no
  new picker screens or `dspfWriter.js` primitives, per the task's own
  plan-doc note ("no screens of its own") - `renderRecordProps()` now
  narrows R1's Keywords subtabs to that 4-of-8 subset whenever the record
  carries the `USRDFN` keyword (new `WebviewClientHelpers.isUsrDfnRecord`,
  same "detect by the record type's one defining keyword" convention
  `isSflMsgRecord` already established for R5's SFLMSG tab). The
  previously-active subtab is preserved across records where it still
  exists, falling back to the first available one otherwise (switching
  from a normal record's Indicator tab to a USRDFN record no longer
  leaves every subtab panel hidden). USRDFN's own keyword parameter
  (which field carries the formatted data) isn't part of any of the 4
  screens either, so it stays reachable through the existing
  Advanced/raw keywords accordion, same reasoning.
  - 14 new `dspfWebview.test.js` checks covering both the narrowed tab
    set and that the General panel still commits normally underneath it.
- **SFL-specific "Select Subfile Keywords" picker (SDA parity plan task
  R3 - see `docs/sda-reference/PICKER-SCREENS-PLAN.md`)**, on top of Task
  R1's base 8-category Record Keywords set (shown for every record type
  including SFL already). New "SFL" tab, shown only for plain subfile
  records (an SFLMSG record - which also carries the `SFL` keyword - gets
  its own SFLMSG tab instead, not a redundant second one):
  - **General**: `SFLNXTCHG`/`LOGOUT`/`LOGINP`/`KEEP` (simple flags) and
    `CHECK(AB)`/`CHECK(RL)` (independent toggles sharing one `CHECK`
    keyword, reusing Task F1's `getFileFlagKeyword`'s `fixedParam` mode -
    no new primitive needed). `CHGINPDFT` (also on real SDA's screen) is
    deliberately not repeated - it's already on Task R1's base General
    tab, shown for every record type.
  - **Indicator**: a new repeatable `INDTXT`/`SETOF`/`CHANGE` row list -
    real DDS allows MULTIPLE instances of these on one record (each with
    its own response indicator; verified against IBM's own DDS reference
    that `SETOF`/`CHANGE` each take exactly one indicator per instance,
    not a space-separated list in one keyword), which neither Task R1's
    base panel nor the previous SFLMSG picker's single-instance flags
    could express.
  - New `dspfWriter.js` primitives: `getIndicatorTextRows`/
    `setIndicatorTextRows`, generic over any keyword-name list (not SFL-
    specific), full-replace semantics matching `setCheckOptions`/
    `setDisplaySizesList`.
  - New shared `webviewClientHelpers.js` component -
    `indicatorTextRowsHtml`/`wireIndicatorTextRows` (6-row fixed-size
    table, Apply-button batch commit) - plus `sflKeywordsPanelsHtml`/
    `wireSflKeywordsPanels`/`isSflRecord`.
  - New `src/test/sflRecordKeywordsPicker.test.js` (26 checks) plus 15 new
    `dspfWebview.test.js` checks.
- **Retrofit: Task R5's SFLMSG Indicator panel now uses the same
  `indicatorTextRowsHtml` component**, closing a gap that panel's own
  CHANGELOG entry explicitly flagged - it previously modeled `SETOF` as
  taking a space-separated list of indicators in one keyword (incorrect;
  real DDS takes one indicator per `SETOF` instance) and left `CHANGE` out
  entirely pending verification of its DDS argument shape. Both are now
  correct and supported, shared with Task R3's SFL panel rather than
  duplicated. `dspfWebview.test.js`'s existing SFLMSG Indicator checks
  were updated to match the new row-based UI (element ids changed from
  `sm-indtxt-*`/`sm-setof-*` to `sm-ind-row<N>-*` + a `.sm-ind-apply`
  button).

## [0.9.51] - Unreleased

### Added
- **Task D5 - Menu-bar choice fields (`MNB*`/`MNUACT`)**: five new panels
  covering `docs/sda-reference/screens/field-level/menu-bar-choice/*`,
  verified against IBM's own DDS reference and a real worked MNUBAR/
  PULLDOWN/CHCCTL example rather than guessed:
  - **Menu-bar choices (`MNUBARCHC`)** and **Menu-bar separator
    (`MNUBARSEP`)** - list/single-instance editors, gated on the field's
    *owning record* carrying `MNUBAR` (a brand-new field in that record
    hasn't been turned into the bar's own choice field yet).
  - **Choice selection type (`SNGCHCFLD`/`MLTCHCFLD`)** - the opt-in
    entry point for the remaining two panels, always offered on any
    non-constant field, with every `*param` flag from the real SDA
    screen (`*RSTCSR`/`*SLTIND`/`*AUTOSLT`/`*AUTOENT` families plus
    `*NUMCOL`/`*NUMROW`/`*GUTTER`).
  - **Choice keywords (`CHOICE`/`CHCCTL`/`CHCACCEL`)** - merged into one
    row per choice number (a choice's text, its optional control field/
    message, and its accelerator text are conceptually "the same
    choice", matching real SDA's own screen).
  - **Choice colors & attributes (`CHCAVAIL`/`CHCUNAVAIL`/`CHCSLT`)** -
    three independent color/attribute states.
  - Both list-style choice panels (Choice keywords and Menu-bar choices)
    only appear once a field already carries `SNGCHCFLD`/`MLTCHCFLD` (or,
    for menu-bar choices, once its owning record carries `MNUBAR`),
    avoiding an empty, confusing choice-list editor on unrelated fields.
  - New `DspfWriter` primitives: `getMenubarChoices`/`setMenubarChoices`,
    `getMenubarSeparator`/`setMenubarSeparator`,
    `getChoiceSelectionType`/`setChoiceSelectionType`,
    `getChoices`/`setChoices`,
    `getChoiceAccelerators`/`setChoiceAccelerators`,
    `getChoiceControls`/`setChoiceControls`,
    `getChoiceColorState`/`setChoiceColorState`.
  - Deliberately deferred: `MNUBARCHC`'s "Text field"/"Return field"
    variable-argument forms shown on the real SDA screen - only the
    literal-text form (`id record 'text'`) is modeled, matching what
    `DspfEngine.parseMenubarChoice` already renders.
  - 47 new `dspfWriter.test.js` checks (including a full end-to-end
    round-trip against the real worked MNUBAR/PULLDOWN/CHCCTL example)
    plus 21 new `dspfWebview.test.js` checks driving all five panels
    live, across both an MNB* field and a choice field.

## [0.9.49] - Unreleased

### Added
- **WINDOW-specific record picker (SDA parity plan task R7 - see
  `docs/sda-reference/PICKER-SCREENS-PLAN.md`)**, a new "Window" tab on
  the record properties panel shown only for records carrying `WINDOW`,
  with two accordions:
  - **Window Parameters**: the `WINDOW` keyword's own geometry, as a
    3-way mode picker matching real SDA's "Referenced window -OR- Window
    definition (Default start positioning -OR- Start line/Start
    position)" screen - `reference` (a bare record name, inherits another
    WINDOW record's geometry), `sized` (`*DFT lines columns` - the system
    positions it), and `positioned` (`start-line start-col lines columns`
    - each of the 4 can be a literal number or a field name, matching
    DDS's own flexibility there). New `DspfWriter.getWindowParamsKeyword`/
    `setWindowParamsKeyword`, deliberately named to avoid colliding with
    the existing drag-and-resize `setWindowGeometry(record, sourceLines,
    geometry)` - the `*DFT`-prefixed 3-token form for `sized` was cross-
    checked against that function's own (already-verified) reading of the
    DDS spec rather than re-derived from the screenshot alone. Also wires
    up `RSTCSR` (restrict cursor to window) as a plain flag.
  - **Border Parameters**: identical `WDWBORDER` (Color/Display
    attributes/Border Characters) screen the file-level picker (Task F1)
    already built - refactored `windowBorderPanelHtml`/
    `wireWindowBorderPanel` out of that picker into shared, `idPrefix`-
    parameterized functions so both reuse the same ~50 lines instead of
    duplicating them; the file-level panel's own ids/behavior are
    unchanged.
  - Deliberately not wired: the real SDA screen's "Message line" row
    (DDS keyword not confidently verified) and its per-row "Display
    size"/"Roll" columns - "Roll" turned out to be SDA's own in-terminal
    roll-key editing convenience rather than a DDS keyword at all, and
    "Display size" is the same cross-cutting multiple-DSPSIZ-conditioned-
    instances limitation R1/F1/D1 already defer elsewhere. All three
    route through the raw Keywords editor instead.
  - New `runWindowPickerScenario` in `dspfWebview.test.js` (20+ checks):
    tab visibility gating, geometry pre-fill for both the 4-token and
    `*DFT` 3-token forms, mode switching, and the shared Border Parameters
    panel producing the same `WDWBORDER` output as the file-level picker.

## [0.9.48] - Unreleased

### Added
- **Base Record Keywords picker (SDA parity plan task R1 - see
  `docs/sda-reference/PICKER-SCREENS-PLAN.md`)**, mapped against real
  SDA's own record-level "Select/Define ___ Keywords" screens
  (`docs/sda-reference/screens/record-level/base-record-keywords/`) - the
  base RECORD screen distilled out of ~71 reference screenshots that also
  covered SFL/SFLCTL/WINDOW/PULLDOWN/MNUBAR record-type variants (those
  stay deferred to their own later wiring tasks, same as D1's deferrals):
  - **General**: `INZRCD`/`KEEP`/`ASSUME`/`ALWROL`/`RETKEY`/`RETCMDKEY`
    flags, `CHGINPDFT`/`MNUBARDSP`/`ENTFLDATR` (+free-text parameters),
    `RTNCSRLOC` (row/column field names).
  - **Indicator**: `CLEAR`/`HOME`/`PAGEDOWN`/`PAGEUP`/`HELP`/`HLPRTN`/
    `VLDCMDKEY`/`SETOF`/`CHANGE` (each an indicator-parameter row) plus
    `INDTXT` (indicator + text) - CA/CF stay on the existing Command keys
    panel, same convention as F1's Indicator category.
  - **Application help**: `HLPPNLGRP` (+parameters), `HLPEXCLD`,
    `HLPBDY`, `HLPARA`.
  - **Help**: `HLPCLR`, `HLPSEQ` (help group name + sequence number),
    `HLPCMDKEY`, `HLPTITLE` (quoted text).
  - **Output**: `BLINK`/`ALARM`/`MSGALARM`/`LOCK`/`LOGOUT`/`INVITE`/
    `ALWGPH`/`FRCDTA` flags, `DSPMOD` (+display name), `CSRLOC`
    (row/column field names), `SLNO`/`CLRL` (+parameters).
  - **Input**: `LOGINP`, `UNLOCK` (+`*ERASE`/`*MDTOFF` sub-flags),
    `GETRETAIN`, `RETLCKSTS` (+indicators), `CHECK(AB)`/`CHECK(RL)`,
    `RTNDTA`.
  - **Overlay**: `OVERLAY`/`PUTRETAIN`/`PROTECT`/`PUTOVR`/`OVRDTA`/
    `OVRATR`/`INZINP`/`ERASE` flags, `MDTOFF` (+`*UNPR`/`*ALL`),
    `ERASEINP` (+`*MDTON`/`*ALL`).
  - **Print**: `PRINT` (+response indicator), `PRTFILE` (name + library) -
    same shape as F1's file-level Print category, minus `OPENPRT` (file-
    level only).
  - New `dspfWriter.js` primitives: `getUnlockKeyword`/`setUnlockKeyword`
    (UNLOCK's `*ERASE`/`*MDTOFF` option values, not separate keyword
    instances) and `getFileTwoFieldKeyword`/`setFileTwoFieldKeyword` (the
    generic "keyword(a b)" shape `CSRLOC`/`RTNCSRLOC`/`HLPSEQ` all share).
    Everything else reuses F1's `getFileFlagKeyword`/`setFileFlagKeyword`/
    `getFileQuotedText`/`getFilePrtFileKeyword` unchanged - those were
    already generic over any keywords array, not file-level-specific.
  - New `subtabsHtml`/`wireSubTabs` in `buildWebviewTemplate.js` - a
    second tab-strip helper with its own CSS classes, so R1's 8 category
    tabs can nest inside record props' existing Keywords tab without
    colliding with the outer Basic/Keywords/Cmd keys/Structure/Hidden
    tab strip's own `wireTabs()` wiring.
  - Covered by new `src/test/recordKeywordsPicker.test.js`: the two new
    primitives plus an end-to-end round-trip (one keyword per category)
    through `applyRecordUpdate` + re-parse.
  - Not included in this pass, same reasoning as F1/D1's deferrals:
    multiple CONDITIONED instances of a keyword (e.g. two differently-
    indicator-conditioned `CLEAR`s) - the picker manages one primary
    instance per keyword; the Advanced/raw keywords accordion underneath
    still reaches the rest.
- **Task D2 - Character field wiring (Usage B/I/O)**: D1's "Select Field
  Keywords" panels (Keying options, Validity check, Input keywords,
  Database reference, Message ID, Color & attributes) are now gated by
  the field's current Usage - and, for Validity check, its data type -
  matching real SDA's own "For Field Type" column exactly
  (`docs/sda-reference/screens/field-level/character/_menu/image161.png`):
  - Display attributes / Colors - all except Hidden
  - Keying options - Hidden, Input, or Both
  - Validity check - Input or Both, not float (`dataType === 'F'`)
  - Input keywords - Input or Both
  - General keywords - all types (always shown)
  - Database reference - Hidden, Input, Output, or Both
  - Message ID - Output or Both
  - `WebviewClientHelpers.fieldKeywordCategoryVisibility(usage, dataType)`
    is the new pure, DOM-free gate driving this - unrecognized/blank
    usage (M/P, or unset) fails OPEN rather than guessing, since SDA's
    own table never covers those. Gates VISIBILITY only - never deletes
    a keyword a field already carries just because its Usage changed;
    it stays editable via the raw Keywords tab, which is never gated.
  - Error message is deliberately tied to Validity check's own gate
    (both live in one combined panel) rather than SDA's separately-
    listed Input/Output/Both rule, since an error message without an
    associated validity check has nothing to report.
  - 39 new `fieldKeywordVisibility.test.js` checks (new dedicated test
    file, pure Node, no jsdom) plus 33 new `dspfWebview.test.js` checks
    driving the actual gated panels end-to-end across Both/Input/Output/
    float/Hidden fields.
- Fixed a stale-status bug found while wiring this up: D2's own row in
  `PICKER-SCREENS-PLAN.md` now reflects completion; README's task table
  synced to match.

## [0.9.47] - Unreleased

### Added
- **SFLMSG (message subfile) record-level picker (SDA parity plan task
  R5 - see `docs/sda-reference/PICKER-SCREENS-PLAN.md`)**, a new "SFLMSG"
  tab on the record properties panel shown only for records carrying
  `SFLMSGRCD` (standalone per the plan - `SFLMSG` doesn't use the base
  Record Keywords set at all):
  - **Message Record**: the `SFLMSGRCD` line number (1-27, or a field
    name), plus a read-only lookup of which fields currently carry
    `SFLMSGKEY`/`SFLPGMQ` (edit/rename those via the existing Hidden
    fields tab rather than duplicating that here).
  - **General**: `SFLNXTCHG`/`LOGOUT`/`LOGINP`/`KEEP` flags, `CHECK`'s
    `AB`/`RL` codes as independent toggles (same shared-keyword pattern
    as the file-level General panel's `CHECK(AB)`/`CHECK(RLTB)`/
    `CHECK(RL)`), and `CHGINPDFT` with optional parameters.
  - **Indicator**: `INDTXT` (indicator + text, single instance - same
    convention the file-level Indicator panel already uses) and `SETOF`
    (a space-separated indicator list).
  - No new `dspfWriter.js` functions needed - every keyword here fits the
    existing generic `getFileFlagKeyword`/`setFileFlagKeyword` present/
    absent-with-parameters shape (despite the "file" in the name, they
    operate on any keywords array), reusing `flagRowHtml`/`wireFlagRow`
    from the Task F1 file-keywords picker.
  - Deliberately not wired: the real SDA screen's "Roll keyword" (Message
    Record) and `CHANGE` (Indicator) - their exact DDS argument shape
    wasn't confidently verified, so both route through the existing raw
    Keywords editor accordion instead of guessed-at UI, same fallback the
    D1/F1 pickers already use for HLPPNLGRP/IGCCNV/PASSRCD/MSGID.
  - 1 new `dspfWebview.test.js` scenario (18 checks): tab visibility,
    Message Record pre-fill + read-only field lookups, and independent
    commit of each General/Indicator control.
- **Field-level "Select Field Keywords" picker screens (SDA parity plan
  task D1 - see `docs/sda-reference/PICKER-SCREENS-PLAN.md`)**, mapped
  directly against real SDA's own field-keyword screens rather than the
  DDS reference alone (verified against IBM's DDS keyword docs, not
  guessed):
  - **Keying options**: `CHECK`'s `ME`/`ER`/`MF`/`FE`/`RB`/`RZ`/`RL`/`LC`
    codes as checkboxes on a new accordion.
  - **Validity check** panel extended with `CHECK`'s remaining codes -
    `AB`/`VN`/`VNE`/`M10`/`M11`, each with an "Immed" toggle that writes
    `M10F`/`M11F` instead of the plain code. Both this and Keying options
    write into the SAME underlying `CHECK(...)` keyword (real DDS allows
    combining both categories' codes in one keyword) and now merge rather
    than clobber each other's codes.
  - **Input keywords**: `DUP`/`BLANKS`/`CHANGE`/`CHGINPDFT` as an
    immediate-commit checkbox row.
  - **General keywords**: `ALIAS`/`INDTXT`/`DFT`/`DFTVAL`/`FLDCSRPRG`
    (text) + `PUTRETAIN`/`OVRDTA`/`OVRATR`/`CHRID`/`IGCALTTYP`/`NOCCSID`
    (boolean flags), batch-committed via its own Apply button.
  - **Database reference**: `DLTCHK`/`DLTEDT` override toggles, alongside
    (not replacing) the existing Resolve Referenced Field button, which
    still owns `REFFLD`/`REF` themselves.
  - **Message ID**: `MSGID`, caller-supplied argument text (its shape
    varies too much - `[prefix] &field-name` vs `[prefix] msg-id
    message-file [library]` - to usefully decompose further).
  - **Display Attributes**: `DSPATR`'s checkbox list extended from 7 to
    the full 11 real values - added `CS` (column separators), `PR`
    (protect field), `OID` (operator ID magnetic card), `SP` (select by
    light pen), which real SDA's screen offers but were missing.
  - New `dspfWriter.js` primitives behind all of the above:
    `getCheckOptions`/`setCheckOptions`, `getInputKeywords`/
    `setInputKeywords`, `getGeneralFieldKeywords`/
    `setGeneralFieldKeywords`, `getReferenceOverrides`/
    `setReferenceOverrides`, `getMessageId`/`setMessageId` - each
    following the existing single-instance-per-keyword pattern
    `getColorAttr`/`getValidityCheck`/etc. already use.
  - Not included in this pass (documented as still-open under D1 in the
    plan doc, and as a new Known limitation below): multiple CONDITIONED
    instances of the same keyword (e.g. two independently-conditioned
    `ERRMSG`s, or `COLOR`/`DSPATR` varying by indicator the way real SDA's
    "Colors"/"Display Attributes" screens allow via their own
    Indicators/+ columns) - the existing single-instance model for
    `COLOR`/`DSPATR`/`ERRMSG` is unchanged.
  - `docs/sda-reference/` (screenshots + task plan) added to the repo in
    the prior commit; this release is task D1 off that plan.
  - 12 new `dspfWriter.test.js` cases, 8 new `dspfWebview.test.js` checks.

### Known limitations
- The field-level keyword panels above manage ONE instance of their
  keyword at a time, same as the existing Color & attributes/Validity
  check/Error message panels - real SDA allows several conditioned
  instances of `COLOR`/`DSPATR`/`ERRMSG`/`ERRMSGID` (e.g. a field that's
  red under indicator 10 and green under indicator 20). Conditioning a
  single instance still works via the generic keyword editor's
  Conditioning toggle once the keyword exists.

## [0.9.46] - Unreleased

### Changed
- **`isda.designerOpenColumn` now defaults to `"active"` (full-width, same
  tab) instead of `"beside"` (split next to the source).** The designer's
  own side panels already carry the context a split source view would
  otherwise provide, and full-width avoids the panels and the source
  fighting over horizontal space on anything but the widest terminals.
  `beside` is still available and behaves exactly as before for anyone who
  wants the source visible alongside the preview - just no longer the
  default. Updated `src/test/designerOpenColumn.test.js` and the README to
  match.
- **"+ Add record" now opens as a collapsible form behind a `+ Add record`
  toggle** instead of always showing its Record type picker and
  dependent-record controls. Keeps the sidebar quieter for the common case
  of just switching between existing records, and collapses itself again
  after a successful add.
- **The "+ Add record" Type picker now offers the real SDA record-type
  set** - `RECORD`, `USRDFN`, `SFL`, `SFLMSG`, `WINDOW`, `WDWSFL`,
  `PULDWN`, `PDNSFL`, `MNUBAR` - instead of the previous ad hoc list.
  Picking an SFL-family type (`SFL`/`SFLMSG`/`WDWSFL`/`PDNSFL`) now
  **auto-creates its paired `SFLCTL` record and prompts for its name**,
  matching real SDA's own behavior, instead of requiring you to first
  create a bare SFLCTL and pick it from a dropdown. `SFLCTL` is no longer
  a directly-selectable type, since it is always created this way now.
  New `DspfWriter.insertRecords`/`insertTypedRecordWithDependent` write
  the paired records together as one atomic edit.
  - **SFLMSG** additionally writes `SFLMSGRCD(line)` (line 1-27) on the
    new record and synthesizes two hidden (usage=H) fields matching IBM's
    own "Example: A message subfile using DDS" - a message-key field
    (`SFLMSGKEY`) and a program-queue field (`SFLPGMQ`, bare for the
    10-byte default or `SFLPGMQ(276)` via a "276-byte queue field"
    checkbox) - on its auto-created SFLCTL companion, same auto-create
    flow as plain SFL rather than pairing to an existing control record.
    Field names default to MSGKEY/PGMQ and are renameable afterward via
    the Hidden fields tab. Creating one runs a reparse-between-each-insert
    pipeline (record, then each hidden field) so the newly-created
    record's line range never goes stale between steps - see
    `buildWebviewTemplate.js`'s `newRecordBtn` handler.

### Added
- **Left/right side panels can now be hidden/minimized** via a toggle
  button pinned to the top of each one, so the screen preview can reclaim
  the freed-up width on wide-but-short layouts (e.g. a 27x132 `*DS4`
  display) where the docked panels would otherwise crowd it out. Each
  panel collapses independently and is session-only (not persisted across
  reopens).
- **"Hidden" tab on the record properties panel** - add/select/delete for
  usage=H (hidden) fields, which have no on-screen position and were
  previously unreachable once created (nothing to click on the canvas).
  Lists existing hidden fields with an inline Delete button per row;
  clicking a row selects it into the normal field props panel (Basic/
  Attributes/Keywords tabs all still apply; Position is simply blank,
  which insertField already supported); a "+ Add hidden field" inline form
  skips the canvas-click placement step entirely since a hidden field has
  no meaningful position to click.
- **Task F1 - SDA-style "Select File Keywords" picker.** The file-level
  Properties panel (previously just the generic raw keyword-chip editor)
  now has a tab strip mirroring real SDA's own file-level "Select/Define
  ___ Keywords" screens (see `docs/sda-reference/screens/file-level/` and
  `docs/sda-reference/PICKER-SCREENS-PLAN.md`, task F1): **General**
  (`INVITE`/`ALWGPH`/`MSGALARM`/`INDARA`/`USRDSPMGT`/`CHECK(AB|RLTB|RL)`/
  `DSPRL`/`CHGINPDFT`/`ENTFLDATR`/`ERRSFL`/`REF`/`PASSRCD`), **Indicator**
  (`CLEAR`/`HOME`/`PAGEDOWN`/`PAGEUP`/`HELP`/`HLPRTN`/`INDTXT`/
  `VLDCMDKEY` - `CA`/`CF` command keys stay on their existing dedicated
  panel), **Print** (`PRINT`/`PRTFILE`/`OPENPRT`), **Help**
  (`HLPPNLGRP`/`HLPSCHIDX`/`HLPFULL`/`HLPTITLE`), **Display sizes**
  (a full-replace, order-aware `DSPSIZ` editor alongside the existing
  append-only `addDisplaySize`), **DBCS conversion** (`IGCCNV`),
  **Alternate** (`ALTHELP`/`ALTPAGEUP`/`ALTPAGEDWN`), **Window Border**
  (`WDWBORDER`'s three sub-groups - Color/Display attributes/Border
  characters, each independently toggled, matching its own 5-screen SDA
  flow) and **Menu-bar** (`MNUBARSW`/`MNUCNL`). The old free-text editor
  remains underneath as a collapsed "Advanced / raw keywords" accordion
  for anything not covered here. New `dspfWriter.js` primitives -
  `getFileFlagKeyword`/`setFileFlagKeyword` (a generic present/absent +
  optional-parameters pair covering most of the above, including a
  `fixedParam` variant so `CHECK(AB)`/`CHECK(RLTB)`/`CHECK(RL)` act as
  three independent toggles sharing one keyword name), plus dedicated
  pairs for the keywords with real internal structure: `getFileQuotedText`/
  `setFileQuotedText` (`HLPTITLE`), `getFileRefKeyword`/`setFileRefKeyword`,
  `getFilePrtFileKeyword`/`setFilePrtFileKeyword`, `getWdwBorder`/
  `setWdwBorder`, and `getDisplaySizesList`/`setDisplaySizesList` - all
  pure `keywords[] -> keywords[]` transforms committed through the
  existing `applyFileKeywordsUpdate`, same convention as the Color &
  attributes/Validity check pickers. New `fileKeywordsPanelsHtml`/
  `wireFileKeywordsPanels` in `webviewClientHelpers.js` render and wire
  all 9 panels; `renderFileProps()` in `buildWebviewTemplate.js` now
  builds a `tabsHtml()` strip the same way the field/record Properties
  panels already do. Covered by new `src/test/fileKeywordsPicker.test.js`
  (per-function unit coverage plus an end-to-end round-trip through
  `applyFileKeywordsUpdate` + re-parse). A handful of keywords with
  multi-argument DDS syntax I wasn't fully certain of ordering for
  (`HLPPNLGRP`, `IGCCNV`, `PASSRCD`) take a single free-text parameters
  box rather than guessed-at sub-fields - same fallback the existing
  Validity check editor already uses for `VALUES`/`EDTWRD`.

## [0.9.44] - Unreleased

### Fixed
- **`EDTCDE`/`EDTWRD` numeric display width was a flat approximation
  (the field's raw digit length, no adjustment at all) - it's now exact.**
  For `EDTCDE`, width = coded length + a decimal point (if there are
  decimals) + thousands-grouping commas for the codes that have them +
  sign/CR reservation (0 for no-sign codes, 1 for a plain `-`, 2 for
  `CR`) + 1 for a floating currency symbol. Verified against all three
  of IBM's own worked examples in the EDTCDE reference (`PRICE 5,2
  EDTCDE(J)` -> 7, `SALES 7,2 EDTCDE(K $)` -> 11, `SALARY 8,2 EDTCDE(1
  *)` -> 10) - asterisk fill protection correctly adds no width, only a
  floating currency symbol does. `EDTCDE(Y)`/`EDTCDE(W)` ("date edit")
  are left at the coded length, since their separator width depends on
  the job's `DATSEP` attribute at runtime - not knowable at design time.
  For `EDTWRD`, width = the literal template's own character count
  (an edit word is a character-for-character stencil, so this is exact
  for the single-body-word style essentially every real-world example
  uses; the rarer 3-part `body,status,expansion` comma syntax very
  slightly over-reserves rather than under, which is the safe direction
  for overlap detection). This also fixes the same gap for `DATE`/
  `TIME`/`PAGNBR` system-value constants carrying `EDTCDE`/`EDTWRD`,
  since they share the same code path (they have no data-type column of
  their own to key off of). Added dedicated `dspfEngine.test.js`
  coverage reproducing IBM's worked examples plus an `EDTWRD` date-slash
  case and a system-value-constant case.

## [0.9.42] - Unreleased

### Fixed
- **Clicking a constant only ever selected the FIRST constant on its
  source line, however many were actually on it.** The field-wiring
  loop's underlying-field lookup tried `f.name === name && f.location.line
  === anchorLine` first - fine for a named field, but a `CONSTANT`'s DDS
  name column is always blank, so for every constant `name` (from the
  clicked element's `data-field` attribute) was `''`, and `'' === ''`
  matched whichever constant `.find()` happened to hit FIRST on that
  line, regardless of which one was actually clicked - the fallback
  line+COLUMN match (which would have disambiguated them) never even
  ran. Fixed in `buildWebviewTemplate.js` by guarding that first branch on
  `name` being truthy, so every constant now goes straight to the
  line+column match - a genuinely named field is unaffected (still
  matches by name first). Same fix applied in both the primary-record
  lookup and the cross-record fallback loop.

### Added
- **`DATE`/`TIME`/`PAGNBR` system-value constants now show the Attributes
  tab's dedicated "Edit code / word" picker.** These parse as `CONSTANT`
  (DDS leaves their name column blank, same as any other literal), and the
  picker was unconditionally hidden for every constant on the reasoning
  that "constants have no data type to validate" - true for the Validity
  check/Error message parts, but NOT for Edit code/word: real DDS commonly
  puts `EDTCDE`/`EDTWRD` on a `DATE`/`TIME`/`PAGNBR` placeholder (e.g.
  inserting slashes into a date). The keyword itself always parsed and
  wrote back correctly through the generic keyword-chip editor underneath -
  only the dedicated picker was missing. `webviewClientHelpers.js`'s
  `validityAndEditHtml`/`wireValidityAndEdit` now take an optional
  `{includeValidity: false}` to render just the Edit code/word section
  (used for these three constants); `buildWebviewTemplate.js` detects them
  via a `DATE`/`TIME`/`PAGNBR` keyword check alongside the existing
  `isConstant` check. Keyword insertion order for the named-field path is
  unchanged (still validity check, then edit code/word, then error
  message) so existing byte-for-byte output isn't disturbed by an
  unrelated continuation-wrap shift.
- **"Full overlay" compare mode** - the older, pre-dimmed-backdrop way of
  comparing several record formats, restored as an opt-in alongside (not
  instead of) the dimmed backdrop added in the 0.9.x compare-mode
  redesign. A new "Full overlay instead (read-only)" checkbox appears once
  Compare mode is on: switching it on renders every checked record (plus
  whichever is currently selected) together via the existing
  `DspfEngine.resolveMultiScreen` at full brightness, in ONE combined
  screen - no primary/backdrop split, no dimming/grayscale - and
  (matching the original design) nothing is editable while it's active:
  click/drag wiring is skipped entirely, same "which record would an edit
  belong to?" ambiguity the original read-only compare mode was built
  around. Switching it back off restores normal single-record editing
  immediately. Implemented as a new `renderFullOverlay()` branch at the
  top of `render()`, reusing `renderCompareRecordList`'s existing
  checklist (already excludes whichever record is "current") rather than
  building a second one.

Covered by new scenarios in `dspfWebview.test.js`
(`runFullOverlayCompareScenario`) and updated assertions in the existing
constant/EDTCDE-adjacent test coverage; version bump 0.9.41 -> 0.9.42.

## [0.9.43] - Unreleased

### Added
- **Full SDA record-TYPE list for "+ Add record"**: the Type picker added in
  0.9.41 (Basic screen, Subfile control, Subfile, Window) now covers ALL of
  real SDA's record types, matched against IBM's own DDS reference and
  examples rather than guessed:
  - **Window subfile control (WDWSFL)** - a subfile control record that's
    ALSO a window: writes `SFLCTL(sflname)` and `WINDOW(...)` on the same
    new record. Needs both a "which SFL record" pick and a geometry pick
    (inherit from an existing window, or a default box) at once.
  - **Pull-down subfile control (PDNSFL)** - a subfile control record
    that's ALSO a pull-down menu: writes `SFLCTL(sflname)` and `PULLDOWN`
    together (no geometry needed - pull-downs auto-size).
  - **Pull-down menu (PULLDOWN)** - plain `PULLDOWN` keyword, no dependent
    record (later referenced from a `MNUBARCHC` field elsewhere).
  - **Menu bar (MNUBAR)** - plain `MNUBAR` keyword, no dependent record.
  - `WebviewClientHelpers.recordTypeDependentInfo()` now returns up to TWO
    independent dependent-record slots (`sfl` and `window`) instead of one,
    since WDWSFL needs both simultaneously; the "+ Add record" form grew a
    second, independently-shown dependent dropdown to match.
  - Two record types from real SDA's own list were deliberately left out
    for now: `USRDFN` (an SDA workflow toggle with no DDS keyword of its
    own - already equivalent to Basic screen here) and `SFLMSG` (a message
    subfile, which needs two synthesized hidden fields alongside its own
    keyword - a bigger feature than a keyword-only type).
  - 6 new `dspfWriter.test.js` cases plus 20 new jsdom checks in
    `dspfWebview.test.js` covering every new type end-to-end.

## [0.9.41] - Unreleased

### Added
- **Record type + dependent record format name options when creating a
  record**, matching real SDA's own "+ Add record" flow. The "+ Add record"
  form in the DSPF designer now has a Type picker (Basic screen, Subfile
  control (SFLCTL), Subfile (SFL), Window) alongside the record name, instead
  of always creating a blank record format:
  - **Subfile control (SFLCTL)** - a second dropdown offers only existing
    records that already declare an `SFL` keyword ("which SFL record does
    this control?"), and writes `SFLCTL(sflname)` on the new record.
  - **Subfile (SFL)** - the dropdown instead offers existing records that
    already declare `SFLCTL`, since pairing a detail record to a control
    created before it means REWRITING that control's own `SFLCTL`
    parameter to point at the new record - handled by
    `DspfWriter.insertTypedRecord()`'s new `pairBack` parameter.
  - **Window** - the dropdown offers existing records that already own a
    `WINDOW` keyword; picking one inherits its geometry
    (`WINDOW(record-name)`), leaving it blank creates a sensible default
    box (`WINDOW(2 2 10 40)`) the user can then drag/resize as normal.
  - `WebviewClientHelpers.recordTypeDependentInfo()` is the pure,
    DOM-free helper deciding which existing records qualify as a
    dependent pick per type (and the label/requiredness to show) -
    unit-tested without jsdom.
  - `DspfWriter.insertTypedRecord()` wraps `insertRecord` with an optional
    second-record rewrite for the SFL-pairs-back-to-SFLCTL case. Always
    runs `insertRecord` first (which only ever appends after the LAST
    existing record's full footprint) so the pairBack record's own line
    range - computed against the ORIGINAL source - stays valid for the
    follow-up `applyRecordUpdate`.
  - 10 new `dspfWriter.test.js` cases plus a full jsdom scenario in
    `dspfWebview.test.js` driving the Type/dependent dropdowns end-to-end
    (including the "no valid dependent yet" refusal case).

## [0.9.40] - Unreleased

### Added
- **Resolve Referenced Field (and "Resolve All") via Code for i.** A
  field flagged as a database reference (position 29 `R`) can now have
  its real length/type/decimals fetched from a connected IBM i and
  written into the DDS source, the same convenience real SDA offers the
  moment you type `R` and press Enter.
  - `DspfEngine.resolveReferenceTarget()` works out WHICH field, in
    WHICH library/file, to resolve - REFFLD's own field-name/file
    parameters, falling back to the file-level REF keyword, correctly
    returning nothing resolvable for `REFFLD(field *SRC)` (no live file
    to query) or when there's no REF/REFFLD file at all. Pure, no I/O,
    fully unit-tested (7 new cases in `dspfEngine.test.js`).
  - `extension.ts`'s `fetchReferencedFieldAttributes()` does the actual
    network round-trip: runs `DSPFFD ... OUTPUT(*OUTFILE)` via Code for
    i's `code-for-ibmi.runCommand`, then reads the resulting QTEMP
    outfile's `WHFLDT`/`WHFLDB`/`WHFLDD`/`WHFLDP` via
    `instance.getConnection().runSQL()`. Deliberately uses DSPFFD's
    OUTFILE rather than the `QSYS2.SYSCOLUMNS` SQL catalog: DSPFFD
    reports the field's actual DDS type code (position 35) directly, so
    there's no lossy mapping back from a generic SQL type name.
  - `handleResolveReferencedField()` resolves one field (the field
    panel's new "Resolve Referenced Field (Code for i)" button, added to
    the new Attributes tab) or every reference field on the record at
    once (the record panel's new "Resolve all referenced fields (N)"
    button, added to the new Structure tab), applying every success as a
    single `WorkspaceEdit` and reporting any failures (not
    installed/connected, field not found, no REF/REFFLD file) without
    losing whatever did resolve.
  - Covered by 5 new cases in `extension.test.js` against a mock Code
    for i extension/connection: not-installed, a successful resolve
    (length written into the source, correct DSPFFD/SQL calls), field
    not found, and Resolve All resolving multiple fields at once.
  - Fixed a build gap along the way: `dspfEngine.js`/`dspfWriter.js`
    weren't being copied into `dist/` the way `mnuCmdEngine.js` already
    was, so `extension.ts`'s new `require()` calls of them would have
    failed at runtime once compiled - `npm run build:webview-assets`
    now copies all three.
  - This was the last remaining Display-designer-only gap from the Aug
    2026 parity audit; with "Create New Menu" landing separately (see
    0.9.37 below), no Display- or Menu-designer-only items remain.

## [0.9.39] - Unreleased

### Changed
- **SFLCTL-side subfile preview and PULLDOWN overlay are now editable**,
  closing two more items from the Known Limitations list. Both were
  previously read-only reference layers requiring a record switch to edit:
  - The subfile detail area, shown when previewing the `SFLCTL` (control)
    record, is no longer protected/read-only. `resolveSubfilePreview()`
    (`dspfEngine.js`) now tags its fields `subfile-edit-row-N` - the SAME
    tag prefix (and the SAME group-drag machinery in
    `buildWebviewTemplate.js`, `commitGroupEdit`) the `SFL` record's own
    "Preview SFLPAG rows" toggle already used - so dragging any field in
    the preview moves the whole row template together, writing the edit to
    the PAIRED `SFL` record automatically (resolved via the field-wiring
    loop's existing cross-record lookup fallback), without switching
    records first. The old `dspf-subfile-preview` protected styling (dashed
    border, `pointer-events: none`) no longer applies to these fields,
    since the tag that triggered it is gone.
  - A `PULLDOWN` overlay's fields (menu bar → clicked choice → dropdown)
    are now clickable (selects the field, showing its Properties panel)
    and draggable (writes back to the `PULLDOWN` record itself, via a
    plain single-field `startDrag` - unlike a subfile row, a pulldown's
    fields aren't a repeated template). Clicking a pulldown field no
    longer closes the overlay: previously ANY click bubbled up to
    `screenOutput`'s own "click anywhere closes the pulldown" listener,
    which would immediately undo whatever the click was trying to do; a
    pulldown field's own click/mousedown handlers now call
    `e.stopPropagation()` first, the same pattern the menu-bar choice's own
    click handler already used to avoid closing itself when toggling.
  - Covered by two new scenarios in `dspfWebview.test.js`
    (`runSubfileControlEditScenario`, `runPulldownEditScenario`) plus a tag
    assertion added to `dspfEngine.test.js`'s existing SFLCTL coverage.

## [0.9.38] - Unreleased

### Added
- **`isda.designerOpenColumn` setting** to control where the Screen/Menu
  Designer webview opens. Previously it always opened split "beside" the
  source column (`vscode.ViewColumn.Beside`) - fine for seeing the raw DDS
  and the visual designer together, but on a narrower window (or with
  other panels already open) the split leaves the designer cramped, and
  the only fix was manually dragging the tab out into its own window every
  time. The default (`"beside"`) is unchanged, so nobody's existing setup
  changes underfoot; `"active"` opens the designer full-width in the same
  tab group instead of splitting, and `"newWindow"` opens it and then
  immediately runs `workbench.action.moveEditorToNewWindow` to pop it out
  automatically. Applies everywhere a designer is opened - "Open
  Screen/Menu Design Preview", and newly created display files/menus from
  "Create New Display File"/"Create New Menu" (both already funnel through
  the same `openDesigner()`/`openMenuDesigner()` helpers). Covered by a
  new `src/test/designerOpenColumn.test.js`.

## [0.9.37] - Unreleased

### Added
- **"iSDA: Create New Menu" command**, the menu designer's counterpart to
  "Create New Display File" - closes the last remaining Menu-designer-only
  gap from the Aug 2026 parity audit. Previously, starting a new menu
  required an existing MNUDDS member (and its paired `QQ` MNUCMD commands
  member) to already exist, created some other way; there was no in-tool
  way to generate either. The new command prompts for a menu/member name
  (also used as the DDS record format name, since CRTMNU requires them to
  match) and a title, then generates *both* paired members together in one
  step: a starter MNUDDS boilerplate (title + two placeholder numbered
  options, `1. Option 1` / `2. Option 2` - enough to satisfy
  `isLikelyMenuFile()`'s own "2+ numbered options" heuristic immediately)
  self-validated through `parseDspf` the same way `createNewDspf`'s
  boilerplate already is, plus an (initially empty, header-comment-only)
  MNUCMD companion - the menu designer already handles a missing/empty
  companion gracefully, so there's nothing meaningful to pre-guess there.
  Same local-vs-remote destination choice as "Create New Display File"
  when Code for i is connected: locally, writes a `<name>.mnudds` file
  alongside a sibling `<name>QQ.mnucmd` (the same convention
  `getMenuCommandMemberUri` already uses for local/streamfile documents),
  with a single combined overwrite prompt if either already exists;
  remotely, issues two `ADDPFM`s (`SRCTYPE(MNUDDS)` then
  `SRCTYPE(MNUCMD)`) into the same source file/library, writes the
  generated content to both new `member:` scheme members, then opens the
  MNUDDS half directly in the menu designer (`openMenuDesigner()`, a new
  small helper also now shared by "Open Menu Design Preview" for
  consistency). If the companion `ADDPFM` fails after the menu member's
  own `ADDPFM` already succeeded, this doesn't roll anything back or treat
  it as fatal - `ADDPFM` isn't transactional, and the menu member is
  perfectly valid on its own - it warns instead, and the designer will
  pick the companion up automatically once it's added separately (see
  `getMenuCommandMemberUri`, which already treats a missing companion as
  "no mappings yet", not an error). New `explorer/context` and
  `commandPalette` contributions mirror "Create New Display File"'s.
  Covered by a new `src/test/createNewMenu.test.js`, mirroring
  `createNewDspf.test.js`'s local/remote/failure-path coverage plus the
  paired-write and partial-failure cases specific to two members instead
  of one.

## [0.9.36] - Unreleased

### Changed
- **DSPF designer: properties panel reorganized into a breadcrumb +
  tabs/accordions.** The panel previously showed file, record, and field
  properties as one long flat scroll with no indication of which level
  you were editing and no way to move between levels without deselecting
  on the canvas. Added a persistent `File > Record: X > Field: Y`
  breadcrumb (each earlier segment is clickable) above the properties
  body, replacing the old file-panel-only "Back to record" button. Field
  properties are now grouped into **Basic / Position / Attributes /
  Keywords** tabs; record properties into **Basic / Keywords / Cmd keys
  / Structure** tabs. The dense raw-keyword-chip editor and per-entity
  conditioning editor are collapsed into accordions within their tab
  rather than always fully expanded. No change to the underlying
  editing/commit logic - only how the same controls are grouped and
  navigated.
- **Menu designer: accordion styling now matches the DSPF designer.**
  The menu designer's properties were already well-separated (Record
  controls persistent in the sidebar, File attributes and per-option
  Conditioning each already collapsible) and didn't need the structural
  change above - this just restyles the File attributes and per-option
  Conditioning toggles with the same boxed accordion look, so both
  designers feel like the same product.

## [0.9.35] - Unreleased

### Fixed
- **Window preview: fields rendered visually behind the window and were
  hard to select/edit.** `.dspf-window-border` is `position: relative`
  with an explicit `z-index: 0`, which makes it establish its own CSS
  stacking context, painted above any *non-positioned, `z-index: auto`*
  content - regardless of HTML source order. Every specific field widget
  type (radio, checkbox, `CNTFLD`, button, menu bar) already had an
  explicit `z-index: 1` to counter this, but the base `.dspf-field` rule
  covering ordinary named fields and constants - the common case - never
  got the same treatment, so those fields rendered underneath a window's
  opaque background whenever one was being previewed. Added
  `position: relative; z-index: 1;` to the base rule in both the DSPF and
  menu designer (the menu designer renders windows too, e.g. `MNUBAR`
  pulldowns, and had the identical gap).

### Removed
- **Command key (`CAxx`/`CFxx`) assignment UI in the menu designer.**
  CRTMNU-compiled numbered-option menus don't use DDS command keys in
  practice - standard keys like F3/F12 are handled by CRTMNU's own
  generated program logic, not by keywords the menu designer would let
  someone assign. This had been added generically alongside the DSPF
  designer's own (still-supported) command-key UI without checking
  whether it actually applied to menus; removed the file-level and
  record-level Command keys panels, the function-key legend, and their
  wiring from `buildMenuWebviewTemplate.js`. The underlying
  `DspfWriter`/`DspfEngine` primitives are untouched and still power the
  DSPF designer's own command-key support.

## [0.9.34] - Unreleased

### Added
- **`CNTFLD(n)` wrapping in the preview.** A field carrying `CNTFLD(n)`
  now renders as `n` columns wide by `ceil(length/n)` rows tall instead
  of one long single-line field, with its full display text wrapped
  onto stacked `.dspf-cntfld-line` rows (same stacking approach the
  radio/checkbox widgets already use for their own choice rows). The
  underlying field length/text is untouched - only the rendered
  width/height and the wrapping of the display text change. A length
  that doesn't divide evenly by `n` still wraps correctly (the last
  line is just shorter). `cntfldFromKeywords()`/`cntfldInnerHtml()` in
  `dspfEngine.js`; new CSS in both `buildWebviewTemplate.js` and
  `buildMenuWebviewTemplate.js`.
- **`ERRMSG` on a window's own reserved message line.** A `WINDOW`
  record's last usable row is reserved for error messages unless the
  window specifies `*NOMSGLIN` (`resolveWindow()` now reads that option
  off the `WINDOW` keyword's trailing tokens, inherited correctly
  through the `WINDOW(record-format-name)` form). When any `ERRMSG`
  keyword in the record - record-level first, then fields in DDS
  source order - has its own conditioning indicators satisfied,
  `resolveWindowErrorMessageLine()` renders that message on the
  window's real last row (`window.line + window.height - 1`),
  truncated to the window's width. No message renders when
  `*NOMSGLIN` is set, when the record has no `WINDOW` keyword at all,
  or when no `ERRMSG` keyword is currently active. Wired into both
  `resolveScreen()` (single-record preview) and `resolveMultiScreen()`
  (compare mode) via the same `errorMessage`/`errorMessages` pattern
  the `window`/`windows` fields already use; rendered with a new
  `.dspf-window-msgline` CSS class.
- Covered by 9 new cases in `dspfEngine.test.js`: CNTFLD wrapping math,
  an unevenly-dividing length, the no-CNTFLD regression case, ERRMSG
  gated by its own conditioning indicator (on/off), message truncation
  to the window's width, `*NOMSGLIN` suppression, record-level ERRMSG,
  and a record with no `WINDOW` keyword never producing a message line.

## [0.9.33] - Unreleased

### Changed
- **True dimmed-overlay compare, replacing the old read-only side-by-side
  multi-select.** The record currently being edited now stays exactly as
  normal - full opacity, fully interactive, click/drag/rename/copy/delete
  all still work - while "Show other record(s) dimmed behind" (renamed
  from "Compare multiple formats (read-only)") adds a second, read-only,
  non-interactive layer showing any number of OTHER records rendered
  dimmed behind it for visual alignment reference. Reuses
  `DspfEngine.resolveMultiScreen`/`renderScreenHtml` (unchanged) purely
  as a convenient way to combine several backdrop records into one
  rendered layer - nothing about them is read-only-specific anymore;
  the read-only-ness now comes entirely from `pointer-events: none` and
  no event wiring on that one layer, not from disabling the rest of the
  UI. The backdrop checklist excludes whichever record is currently
  being edited (it's already shown normally, in the primary layer, so
  listing it again as an "other" option would be redundant); switching
  the primary record while a backdrop is active drops it from the
  backdrop the moment it becomes primary, rather than briefly rendering
  behind itself.
- Every field/menubar-choice/window-title/window-move-resize wiring
  loop in `buildWebviewTemplate.js`'s `render()` was previously scoped
  to the whole `screenOutput` subtree; now scoped to `primaryScreenEl`
  (the primary's own `.dspf-screen`, always first in the DOM) so none
  of that interactivity can ever attach itself to the new backdrop
  layer's structurally-identical divs.
- Covered by a new `runDimmedCompareScenario` in `dspfWebview.test.js`:
  toggle behavior, checklist filtering, the backdrop appearing/
  disappearing as records are checked/unchecked, the primary staying
  clickable, and the backdrop itself staying genuinely inert (a
  regression test for the scoping fix above - it would have failed
  before that fix).

## [0.9.32] - Unreleased

### Fixed
- **Menu designer: options from one record could shadow or hide another
  record's options with the same number.** `extractMenuOptions()` scanned
  *every* record format in the file and de-duplicated the result by
  option number alone. That was invisible while the menu designer only
  ever supported a single record format, but the whole-record
  create/copy/delete feature (0.9.27) makes multi-record files a normal
  case - e.g. `Copy record` on a record that already has an "option 1"
  produces exactly that situation. Concretely, this meant: switching the
  record picker to a second record could show the *first* record's
  option 1 instead of the second's own (or nothing at all if the second
  record's option happened to lose the de-dupe), and editing what looked
  like "this record's option 1" could silently edit a different record's
  constant, or fail to find one that was actually there.
  `extractMenuOptions()`, `findOption()`, `updateOptionLabel()`,
  `updateOptionConditions()`, `deleteOption()`, `copyOption()`, and
  `swapOptions()` now all take the record name they're scoped to, and
  `renderOptions()`/`computeDefaultPlacement()` pass the currently
  selected record. Two call sites are deliberately left file-wide, since
  they match real MNUCMD semantics rather than being a per-record concern:
  `addNewOption`'s duplicate-number check and `copyOption`'s
  next-available-number search, since a MNUCMD command mapping has no
  per-record concept at all - two records sharing an option number are
  forced to share its command either way, so a new number has to be
  unique across the whole file, not just within one record.
  Regression test: `runCrossRecordOptionScopingScenario` in
  `menuWebview.test.js` (two records each declaring their own "option 1",
  verifying the panel shows the selected record's own option, editing one
  doesn't touch the other, and switching back shows the original
  untouched).

## [0.9.31] - Unreleased

### Added
- **Change Window Title by clicking it directly on the preview.**
  `WDWTITLE` was already read/rendered (`resolveWindowTitle`); this
  adds the edit side. `DspfWriter.getWindowTitleText`/
  `setWindowTitleText` are a plain-text get/set pair for `WDWTITLE`
  (same shape as `getErrorMessageText`/`setErrorMessageText`) -
  `setWindowTitleText` only swaps the quoted title portion when
  `WDWTITLE` already exists, preserving any other parameters (position
  modifiers like `*TOP`/`*BOTTOM`/`*LEFT`/`*CENTER`/`*RIGHT`, color,
  `DSPATR`) exactly as they were, adds a new bare-text `WDWTITLE` if
  none exists yet, and removes it entirely if the text is blank. A
  dedicated "Window title" field now shows in the record's Properties
  panel whenever the record carries its own `WINDOW` keyword; clicking
  the title on the preview navigates there and focuses the input
  rather than editing in place, since the rendered title text is
  actually a mix of the record name, the `WDWTITLE` text, and status
  hints (position-set-at-runtime, window-shared-with-X), not the raw
  `WDWTITLE` text alone.

## [0.9.30] - Unreleased

### Added
- **Window move/resize handles on the DSPF preview.** A window could
  previously only be dragged - now it can be resized too, and both
  operations are backed by a real writer primitive
  (`DspfWriter.setWindowGeometry`) rather than a preview-only visual
  effect. Handles all three real `WINDOW` forms: the explicit
  `row col height width` form (move and resize both work), the
  `*DFT height width` runtime-position form (resize only - there's no
  fixed row/col to drag, so no move handle renders for it), and the
  `WINDOW(record-format-name)` inheritance form (neither - that record
  doesn't own its own geometry to rewrite; edit the record it inherits
  from instead). Disabled, same as every other record-level edit, when
  the record's own conditioning is too complex to safely reserialize
  (`DspfWriter.isEditable`). Resize is corner-anchored (bottom-right
  only) - row/col never move during a resize, only height/width grow or
  shrink toward or away from that fixed corner.
- Covered by 5 new cases in `dspfWriter.test.js` for the writer
  primitive itself (move, resize, move+resize together, each of the
  three WINDOW forms' own constraints) and a new
  `runWindowMoveResizeScenario` in `dspfWebview.test.js` simulating an
  actual mouse drag on both handles.

### Verified
- **A subfile inside a window** (a record carrying both `WINDOW` and
  `SFLCTL`/`SFL`) - a common, ordinary real-DDS pattern - was already
  architecturally supported (the window's own line/col offset was
  already threaded through to the subfile preview's own resolution) but
  had no dedicated test proving it. Added 2 new cases to
  `dspfEngine.test.js` confirming both the SFLCTL-side preview and the
  SFL-side (template) preview correctly offset every subfile row by the
  window's own origin, not the raw screen origin - no engine changes
  were needed; this was purely closing a testing gap the README had
  flagged as worth checking.

## [0.9.29] - Unreleased

### Added
- **DSPF designer: "+ Field" / "+ Constant" click-to-place buttons** on
  the preview canvas. `DspfWriter.insertField` already existed and was
  used by the menu designer's "+ Add option"; this adds the DSPF
  designer's own entry point. Clicking either button arms a crosshair
  placement mode (Esc cancels); the next click on the screen preview
  converts its pixel position into a line/column via the same
  `gridMetrics()` conversion drag already uses, then opens a small
  placement form in the Properties panel pre-filled with that position
  (still editable) plus - for a field - Name/Length/Decimals/Data
  type/Usage, or - for a constant - just Text. Name validation reuses
  the same `isValidDdsName`/duplicate-name checks "+ Add record" uses.
  Committing calls `insertField` (always appends at the bottom of the
  record's field list, same placement rule as Copy field/constant) and
  selects the new field, ready to drag into its exact final spot.

## [0.9.28] - Unreleased

### Added
- **Menu designer: whole-record create/copy/delete UI.** The last
  remaining "Common" item from the Aug 2026 parity audit - the writer
  primitives (`DspfWriter.insertRecord`/`copyRecord`/`deleteRecord`) and
  the DSPF designer's own UI for them already existed; this adds the
  menu designer's equivalent entry point in its sidebar: a "+ Add
  record" form (same empty-name/duplicate-name validation as the DSPF
  designer's), and "Copy record"/"Delete record" buttons acting on
  whichever record `recordSelect` currently has selected. Copy record
  disables itself (mirroring the DSPF designer) when the record's own
  conditioning is too complex to safely reserialize
  (`DspfWriter.isEditable`); Delete only warns about other keywords that
  might still reference the deleted record by name (`SFLCTL`/`WINDOW`/
  `MNUBARCHC`), using the same advisory scan Rename already relies on.
  After create/copy, the new/copied record is explicitly selected only
  after `renderAll()` has rebuilt the `<select>`'s own `<option>` list -
  the same fix the DSPF designer's own record-selection bug required,
  applied here from the start rather than as a follow-up patch.
- Covered by a new `runMenuRecordCrudScenario` in `menuWebview.test.js`
  (empty/duplicate name rejection, create + auto-select, copy + carries
  over the option's own constant, delete + every other record survives).

With this, every item from the "Common" bucket of the Aug 2026 parity
audit is done in both designers - see README "Known limitations",
whose Common section is now empty.
- **Dedicated colors/attributes editor (`COLOR`/`DSPATR`).** A color
  `<select>` plus per-attribute checkboxes (HI, RI, UL, BL, ND, PC, MDT)
  on the field/constant Properties panel - `DspfWriter.getColorAttr`/
  `setColorAttr` read/replace both keywords together, joining every
  checked attribute into one `DSPATR(...)` keyword the way real DDS
  allows (e.g. `DSPATR(HI UL)`). Commits immediately on change, same
  convention as the keyword-chip editor's own add/remove.
- **Dedicated validity-check / edit-code-or-word / error-message
  helpers (`RANGE`/`COMP`/`VALUES`, `EDTCDE`/`EDTWRD`, `ERRMSG`).** A
  new "Validity check" + "Edit code / word" + "Error message" section
  on the field Properties panel (named fields only - these don't apply
  to constants). `setValidityCheck`/`setEditKeyword` each enforce their
  keyword's own one-at-a-time DDS rule (a field can't carry both
  `EDTCDE` and `EDTWRD`, or more than one of `RANGE`/`COMP`/`VALUES`) by
  removing the sibling keywords before adding the new one.
  `setErrorMessageText` takes plain unquoted text and handles DDS
  single-quote literal escaping itself, unlike the generic keyword box
  where the user has to type the quotes and escape them by hand.
- **Center field/constant on screen.** A "Center on screen" button next
  to the field Properties panel's Column input, computing the column
  that centers the field/constant's current width within the record's
  resolved screen width (tracked in a new `lastScreen` client-side
  variable, set every `render()`). Populates the Column input rather
  than committing on its own, so centering and any other edit made in
  the same visit (text, length, position) commit together via the
  existing Apply changes button.
- **Fill constant with characters.** A fill-character + fill-length pair
  of inputs and a Fill button on the constant Properties panel,
  populating the Text input with the character repeated to the chosen
  length (e.g. a row of dashes as a visual divider) - same
  populate-then-Apply pattern as Center above, for the same reason.

## [0.9.26] - Unreleased

### Added
- **Per-keyword indicator conditioning.** Every keyword chip (field,
  record, file-attribute, and help-entry panels) now gets its own
  "Conditioning" toggle mounting the same `conditionsEditorHtml`/
  `wireConditionsEditor` pair the entity-level case already used, but
  scoped to that ONE keyword - e.g. conditioning just a field's `DSPATR`
  while its `COLOR` (and the field itself) stay unconditional. The
  parser/writer already round-tripped `keyword.conditions` correctly;
  this was purely the missing second mount point. `keywordEditorHtml`/
  `wireKeywordEditor` moved from `buildWebviewTemplate.js` into the
  shared `webviewClientHelpers.js` to carry this - same functions now
  back all four DSPF-designer panels (field/record/file/help) plus the
  menu designer's new file-attributes panel below. Toggle-expanded state
  survives re-renders via a caller-owned `Set`, same convention the menu
  designer's own per-option conditioning toggle already used.
- **Menu designer: File attributes panel.** A collapsible "File
  attributes" section in the sidebar (matching this designer's own
  toggle convention rather than the DSPF designer's separate
  properties-panel view, since there's no "click something, panel
  swaps" mechanism here) exposing the file's `fileKeywords` (`DSPSIZ`,
  `REF`, `PRINT`, etc.) via the same shared keyword-chip editor as
  above - nothing menu-specific about these keywords, so no separate
  primitive was needed.
- **Menu designer: Copy option.** Each option row gets a Copy button
  duplicating its underlying constant(s) via `DspfWriter.copyField` -
  the exact primitive the DSPF designer's own field/constant Copy button
  already used. Handles both option forms: a combined `"N. label"`
  single constant, and the split form (separate number-marker and label
  constants), copying and re-aligning both onto the same new row for the
  split case. Since two options can't share a number the way two
  arbitrary duplicated constants could, the copy's number is rewritten
  afterward to (current highest option number) + 1 - copyField itself
  doesn't need to know about that; it stays exactly what it already was.
- **Whole record format create/copy/delete** - the README's own "Common
  backlog" item #1: `dspfWriter.js` previously had no way to insert or
  remove a whole record format, only `applyRecordUpdate`/`renameRecordFormat`
  for an *existing* record's own keywords/name. Adds `insertRecord` (a
  brand-new, empty record, always appended after the last existing one -
  or after the file-level keyword block, or at the very top of a genuinely
  empty file), `copyRecord` (duplicates a record's own conditions/keywords
  AND every field/constant/help entry it owns, verbatim, under a fresh
  auto-generated name, inserted directly after the original), and
  `deleteRecord` (removes a record's entire physical footprint - its own
  header/keyword lines plus every field/constant/help line it contains).
  `getFullRecordLineRange` and `nextAvailableRecordName` are the two new
  supporting primitives (mirroring `nextAvailableFieldName`'s existing
  10-char-DDS-name-limit convention, just scoped file-wide instead of
  per-record). Covered by a new block of cases in `dspfWriter.test.js`
  (empty files, last-record edge cases, name collisions/truncation) plus a
  full jsdom scenario in `dspfWebview.test.js`.
- **DSPF designer UI**: a "+ Add record" inline form next to the record
  picker, and "Copy record"/"Delete record" buttons in the record
  Properties panel, wired to the primitives above. Copy record is disabled
  (same as every other record-editing action) when the record's own
  conditioning is too complex to safely reserialize
  (`DspfWriter.isEditable`); Delete record isn't, since it only slices out
  a line range rather than regenerating anything. Neither auto-fixes
  cross-references elsewhere in the file (`SFLCTL`/`WINDOW`/`MNUBARCHC`) -
  Delete only warns, using the same advisory scan Delete field already
  relies on.

### Fixed
- A handful of existing tests (`dspfWebview.test.js`) referenced the
  keyword editor's old, un-namespaced element ids (`p-keywords`,
  `p-add-kw`, etc.), which the shared-editor move above renamed to
  `ownerKey`-scoped ones; updated to match.
- **Selecting a record right after creating/copying/renaming it silently
  picked the wrong one** whenever the file had more than one record format.
  `recordSelect.value = someNewName` is a silent no-op when that `<option>`
  doesn't exist in the DOM yet (rather than clearing the selection or
  erroring) - and the code was setting it inside `commitSourceChange`'s
  `afterReparse` callback, which runs *before* that same call's own
  `render()` has rebuilt the dropdown's actual `<option>` list. In a
  single-record file this went unnoticed (a freshly-rebuilt `<select>`
  with exactly one `<option>` auto-selects it regardless of what `.value`
  was set to beforehand), which is exactly why the existing rename test
  never caught it. Fixed in all three places (`renameRecordFormat`'s
  commit function - the pre-existing case - plus the two new
  copy/create-record handlers above) by moving the `.value` assignment to
  after `commitSourceChange` returns (when the option genuinely exists)
  and re-rendering once more. Added a regression test using a genuine
  multi-record file, which fails without the fix.

## [0.9.24] - Unreleased

### Changed
- **README's "Known limitations" section pruned to pending items only.**
  Reviewed every entry against the actual code (command keys, the
  function-key legend, indicator conditioning, `copyField`,
  `addDisplaySize`, the file-attributes panel, and `reorderFields` all
  verified as genuinely implemented and wired into the UI - not just
  claimed) and removed the completed ones rather than leaving them
  struck through; that history now lives only in CHANGELOG.md, where it
  was already recorded in full. What remains in the README: whole-record
  create/copy/delete, per-keyword indicator conditioning, the menu
  designer's still-missing file-attributes/copy-field panels, and the
  unchanged DSPF/menu-designer-only lists (window resize handles,
  `CNTFLD(n)` wrapping, "Create New Menu", etc.) - all re-checked against
  the code and still accurate as of this version.

## [0.9.23] - Unreleased

### Added
- **`DspfWriter.addDisplaySize()`** - the writer action called out in the
  README's known limitations: the size picker could only switch BETWEEN
  sizes a file already declared via `DSPSIZ`, with no way to add a second
  one to a single-size (or no-`DSPSIZ`) file. Shared between the DSPF and
  Menu designers (both already call into `dspfWriter.js`), since DDS's
  `DSPSIZ` keyword works identically in either file type and supports at
  most two sizes. Replaces an existing single-size `DSPSIZ` line in place;
  writes a brand-new one (anchored before the first record) when the file
  declares none at all; names a previously-unqualified single size `*DS3`
  so both sizes stay addressable (DDS requires a name once there's more
  than one); and throws rather than writing an invalid third size. Covered
  by 5 new cases in `dspfWriter.test.js`. UI wiring (an "Add size" action
  in the size-picker row) is not included yet - this is the backend
  primitive the README specifically flagged as missing.
- **Menu designer's Commands panel now works for IFS streamfiles**, not
  just remote source members and local files. A MNUDDS opened as an IFS
  streamfile through Code for i (`streamfile:` scheme) previously reported
  `"unsupported"` and disabled option editing entirely, even though a
  streamfile is just a real file with a real path - no different in shape
  from the local `file:` scheme case already supported since 0.9.15. Reuses
  that same sibling-file convention (`<basename>QQ.mnucmd` next to the
  `.mnudds` streamfile, in the same IFS directory), routed through
  `vscode.workspace.fs` so reads/writes go through Code for i's own
  FileSystemProvider for that scheme - no new I/O path needed. The
  remaining genuinely-unsupported case is a scheme with no sensible place
  to derive a companion file at all (e.g. `untitled:` - an unsaved buffer
  has no directory).
- `menu.test.js` extended: an IFS streamfile with no companion sibling yet
  reports `'missing'` (not `'unsupported'`) and derives the right filename;
  editing an option writes the sibling file to the correct IFS path;
  an existing sibling is picked up and reports `'loaded'`; and the
  remaining-unsupported case is re-verified against `untitled:` instead of
  `streamfile:`, since the latter is now a supported scheme.
- **Copy field/constant**, from the Aug 2026 SDA-parity audit's Common
  backlog (item 1 - "build once, both webviews benefit"). New
  `DspfWriter.copyField(record, sourceLines, field, options)` primitive:
  duplicates a field or constant with its length/type/decimals/usage/
  keywords/conditions intact, via the existing `insertField` placement
  rule (appended at the bottom of the record's field list). A named
  `FIELD` needs a distinct name - DDS doesn't allow two same-named fields
  in one record format - so a new `nextAvailableFieldName(record,
  baseName)` helper generates one (`CUSTNAME` -> `CUSTNAME2` ->
  `CUSTNAME3`, truncating to stay within the 10-char DDS name limit); a
  `CONSTANT` copies straight across since it has no name to collide on.
  `options.name`/`options.location` let a caller override either; the
  default location is one row below the original, same column - a
  starting point to drag from, not a placement guarantee (no collision/
  bounds checking, consistent with `insertField` itself).
  Wired into the DSPF designer's Properties panel: a "Copy field"/"Copy
  constant" button next to Apply changes, plus a Ctrl+D (Cmd+D on macOS)
  keyboard shortcut alongside the existing Delete/Backspace handler (same
  guards: not while typing in a props-panel input, not mid-drag). The
  copy is selected immediately after so it can be dragged into place. The
  menu designer doesn't consume this yet (duplicating an option means
  copying its number-marker *and* label constants together with a fresh
  option number, not a single field/constant copy) - left as future work,
  noted in the backlog.
  Tests: `dspfWriter.test.js` covers `copyField` directly (named-field
  auto-naming, explicit name/location overrides, back-to-back copies not
  colliding with each other, constant copying, and
  `nextAvailableFieldName`'s truncation); `dspfWebview.test.js` runs the
  actual generated client-side script in jsdom to cover the Copy button,
  the Ctrl+D shortcut, and the input-guard against firing while typing.

### Fixed
Investigated 5 issues reported against a real production DDS file,
reproducing each empirically before changing anything.

- **A bare `CONSTANT`'s resolved width was clamped to a 1-character
  placeholder instead of its real text length.** This wasn't just a
  rendering-width nuance - the same value drives the column position of
  any LATER field on the same line using relative-column syntax, so an
  under-counted constant could silently shift where a subsequent field
  actually lands. Root-caused and fixed in `resolveRecordFields` directly
  (removed the narrower workaround added in 0.9.12 only for
  `validateSizeBounds`, no longer needed there). This is what actually
  caused "two indicator-conditioned fields at the same screen position,
  neither one renders" - the underlying condition-evaluation logic was
  already correct once tested with correctly-typed indicator values.
- **Subfile preview rows spaced far apart instead of stacking
  immediately below one another.** Hidden/program-to-system fields
  (`usage(H)`/`usage(P)`) with no explicit position - a common real
  pattern, e.g. helper fields declared before a row's visible fields -
  fell back to "line 1" in the row-height calculation, badly inflating
  it. Reproduced directly against a real SFLCTL/SFL pair: rows landed 9
  lines apart instead of 1. Fixed in both places this row-height logic
  was duplicated (the SFLCTL-side preview and the SFL-side "Preview
  SFLPAG rows" mode).
- **The DSPF designer's Properties panel had no way to edit a
  constant's literal text at all** - only its position, via drag. The
  writer already fully supported it (`DspfWriter.applyFieldUpdate`'s
  `constantValue` handling); only the UI input was missing. Added a
  Text field for constants, replacing the Name/Length/Data type/Usage
  inputs that don't apply to one.
- **Menu options could be placed below the "Selection or command"
  prompt.** DDS has no keyword that specifically marks that prompt, so
  this uses the structural signal a real menu always has instead: the
  record's own lowest input-capable field (`usage(I)`/`usage(B)`) -
  virtually always the command-line input itself. New-option placement
  (both the auto-computed default AND a manually-typed row override) is
  now capped above that row, not just the raw `DSPSIZ` bound.
- Confirmed the reported "option text gets truncated in the sidebar" is
  **not a data bug** - the input's underlying value was always the full,
  correct text; only the visible box was too narrow for long labels.
  Added a `title` attribute so hovering reveals the full text.

15 new/updated tests across `dspfEngine.test.js`, `dspfWebview.test.js`,
and `menuWebview.test.js`. 309 assertions total, 0 failures.

### Added
- **Indicators & CAxx/CFxx pass**: command-key assignment (`CAxx`/`CFxx`)
  at both file level and per-record, with cross-scope exclusion (a key
  number claimed at one level is greyed out at the other, and switching a
  key's type CA&harr;CF never leaves a duplicate) via new
  `DspfWriter.setCommandKey`/`removeCommandKey`/`availableCommandKeyNumbers`,
  with a matching panel in both the DSPF and menu designer sidebars.
  `DspfEngine.resolveFunctionKeyLegend` merges file-level + record-level
  keys (record wins on a shared number) into an F-key legend strip above
  the preview in both designers, active/inactive styling driven by
  whichever indicators are currently simulated. New
  `getFileKeywordsLineRange`/`applyFileKeywordsUpdate` writer primitives
  give `dspfWriter.js` its first general way to rewrite the file's own
  keyword block at all (previously only surfaced through the Command keys
  panel - see the File-level attributes panel entry below for the
  general-purpose editor). Field/constant/record indicator conditioning
  (`field.conditions`/`record.conditions`) - previously silently ignored
  by `applyFieldUpdate`/`applyRecordUpdate` even though the parser/writer
  round-tripped it correctly - now has a shared editor (add/remove OR'd
  groups, AND'd indicators up to DDS's 9-per-entity limit, NOT flag per
  indicator) wired into the DSPF designer's field and record Properties
  panels, and into the menu designer's option rows (a menu option is a
  DDS constant under the hood, so it conditions the same way; applied to
  both the option's number marker and its label text together). This
  pass conditions the entity itself, not an individual keyword on it -
  that per-keyword case is still open (see README backlog).
- **File-level attributes panel** (DSPF designer). A new "File
  attributes" button in the sidebar opens a file-level keyword view in
  the Properties panel, reusing the same keyword-chip editor every other
  panel already has (add/remove commits immediately, no separate Apply
  button - same pattern the Record and Help-entry panels use), built on
  the `getFileKeywordsLineRange`/`applyFileKeywordsUpdate` primitives
  above. `fileKeywords` (`DSPSIZ`, `REF`, `PRINT`, etc.) were already
  parsed but had no general-purpose UI until now; `CAxx`/`CFxx` stay on
  their own dedicated Command keys panel, which has purpose-built
  add/remove controls the generic keyword editor doesn't. The menu
  designer's sidebar doesn't get this view yet - noted as remaining work
  in the README, same as Copy field/constant's menu-designer gap.
- **Sort elements within a record** (DSPF designer): a record's
  fields/constants can now be reordered in the DDS *source* (top-to-bottom
  file order - not their on-screen row/col, which this never touches).
  New `DspfWriter.reorderFields(record, sourceLines, orderedSourceLines)`
  primitive moves each field's own physical lines as a whole verbatim
  chunk (never regenerates them, so nothing about an individual field's
  content changes) into the requested order; throws rather than silently
  dropping a field if the given order isn't exactly a permutation of the
  record's current fields. Any `HELP` entries interleaved among the
  fields keep their own relative slot in the sequence rather than being
  reordered themselves - a caller reordering fields has no reason to
  expect help entries to move too. The "stable sort key convention" the
  backlog note asked for: explicit source order, changed one swap at a
  time via new Up/Down buttons in a "Field order (source)" list in the
  Record properties panel - deliberately simpler than drag-and-drop for a
  feature already flagged low-priority/UI-only.
  Tests: `dspfWriter.test.js` covers `reorderFields` directly (basic
  swap, HELP-entry interleaving, rejecting a bad permutation);
  `dspfWebview.test.js` runs the actual generated client-side script in
  jsdom to cover the File attributes button/panel/Back-to-record flow and
  the Field order Up/Down buttons reordering the real DDS source text.

## [0.9.19] - Unreleased

### Added
- **"+ Add option" now lets you choose where a new option lands**, instead
  of only ever computing its own position. Two new Row/Col fields sit below
  the option number and text - pre-filled with the same smart default the
  auto-placement logic already computed (unchanged if you leave them as-is),
  editable if you want it somewhere else. Choosing an occupied row or one
  past the screen's own `DSPSIZ` size is rejected with a specific reason
  (which row, and why) rather than a generic "no room" message, reusing the
  same bounds-checking `findSafeOptionRow`/`screenLinesForRecord` already
  relies on - no new placement logic, just a new front door to the existing
  validation.
- `menuWebview.test.js` extended: the Row/Col fields pre-fill correctly,
  leaving them untouched still places the option the same way as before,
  an explicit override is honored exactly, and both rejection cases (an
  occupied row, a row past the screen size) show the right specific error
  and post no edit.

## [0.9.18] - Unreleased

### Fixed
- **"+ Add option" now picks a smarter starting row for the FIRST option
  in a record.** Previously the first option always started its
  free-row search at a fixed row 6, regardless of what the record
  already contained - a taller title/header block (a common real layout:
  a title, a couple of info lines, a divider) could push the actual
  first free row well past 6, or the search would simply skip forward
  over occupied rows to find one that worked, landing wherever that
  happened to be rather than naturally right after the existing content.
  Now starts the search right after the record's own highest occupied
  row (falling back to the original row 6 only for a genuinely empty
  record, unchanged from before). The existing forward-search-for-a-
  free-row and DSPSIZ-bounds behavior (added in 0.9.5/0.9.9) already
  meant this was never a correctness bug - a field was never actually
  overwritten - just a worse starting guess than necessary.

## [0.9.17] - Unreleased

### Fixed
- **Date (`L`) field width now also honors record- and file-level
  `DATFMT`**, not just a `DATFMT` keyword on the field itself - closing
  the gap explicitly flagged as remaining when field-level `DATFMT`
  support was added (0.9.13). Follows real DDS precedence: field keyword,
  then record keyword, then file keyword, then the `*ISO` default if none
  is specified anywhere. Required threading `dspfFile` through
  `resolveRecordFields()` (5 call sites, all already had it in scope) so
  `displayLength()` could check all three levels.

## [0.9.16] - Unreleased

### Fixed
- **Multiple runtime-positioned `WINDOW`s (`*DFT`, or a program-to-system
  field name) no longer render exactly on top of each other in compare
  mode.** The actual runtime position genuinely can't be known at design
  time - that's not fixable - but every such window previously fell back
  to the identical fixed placeholder spot, so comparing two or more of
  them together made them visually indistinguishable, stacked precisely
  on top of one another. Each is now staggered from the others when more
  than one shows at once. Single-record preview (only one window ever on
  screen there) is completely unchanged - verified only the compare-mode
  code path was touched. Confirmed by tracing the actual drag/edit
  coordinate math (a delta-based commit that cancels out the window
  offset) before making any change - editing fields inside a
  placeholder-positioned window was already correct and untouched by this.

## [0.9.15] - Unreleased

### Added
- **Local `.mnudds` files now support the options panel**, not just remote
  IBM i members via Code for i. Previously opening a local `.mnudds` file
  showed the screen preview but the options panel reported "unsupported" -
  there was no local equivalent of the `<name>QQ` remote member
  convention. Now derives a local companion file the same way: a sibling
  file in the same directory named `<basename>QQ.mnucmd` (lowercase,
  matching how `.mnudds` itself is used locally) - e.g. `MYMENU.mnudds`
  pairs with `MYMENUQQ.mnucmd` next to it. Every existing options-panel
  code path (read, edit, external-edit echo, create-on-first-write) was
  already gated purely on whether a companion URI could be derived at
  all, with no other scheme-specific logic anywhere else - so deriving a
  valid local URI was the entire fix; nothing else needed to change.
  `dspfDesigner.compileMenu` deliberately stays remote-only (compiling
  genuinely requires a live IBM i connection) and is unaffected.
- `menu.test.js` extended: a local file with no companion sibling yet
  (reports "missing", not "unsupported"), editing an option writes the
  correct sibling path, a local file with an existing companion sibling
  loads its content, and a scheme with no known companion convention at
  all (e.g. a Code for i streamfile) still correctly reports "unsupported".

## [0.9.14] - Unreleased

### Fixed
- **"Compile Menu" no longer destructively rebuilds the message file on
  every compile.** Picked as the highest-priority remaining menu-designer
  gap - a real data-loss risk in the core compile workflow: any message ID
  added to the `QQ`-derived `*MSGF` by hand outside iSDA (or by another
  tool) was silently wiped on the next compile, since the previous
  implementation deleted and recreated the file from scratch every time.
  Now creates the message file only if it doesn't exist yet (tolerating an
  "already exists" failure rather than treating it as fatal), and updates
  each option's message in place - `ADDMSGD` first, falling back to
  `CHGMSGD` when that message ID is already there from a previous compile.
  Nothing outside the `USRnnnn` IDs iSDA actually writes is ever touched; a
  stale ID left behind after an option is deleted in the designer stays in
  the file, unused but harmless, rather than the whole file being wiped to
  remove it.
- `compileMenu.test.js` updated for the shorter, non-destructive command
  sequence, plus new coverage: `CRTMSGF` "already exists" is tolerated
  rather than fatal, and a failing `ADDMSGD` correctly falls back to
  `CHGMSGD` without failing the whole compile.

## [0.9.13] - Unreleased

### Fixed
- **Date (`L`) field display width now honors the field's own `DATFMT`
  keyword**, instead of always assuming 10 characters (correct for the
  `*ISO`/`*USA`/`*EUR`/`*JIS`/`*JOB` formats, but wrong for `*MDY`/`*DMY`/
  `*YMD` at 8 characters and `*JUL` at 6 - verified against IBM's own DDS/
  RPG/CL date-format references before implementing). This directly feeds
  the size-bounds validation added in 0.9.12 - a misjudged date field
  width could previously produce a wrong bounds warning (or miss a real
  one). Record- and file-level `DATFMT` inheritance isn't read yet, only
  a `DATFMT` keyword on the field itself.
- The decimal-point width rule for numeric fields (an extra position for
  a keyable decimal point) now also covers `usage(B)` fields, not just
  `usage(I)` - both are keyable, only `usage(O)` (output-only) isn't.

## [0.9.12] - Unreleased

### Added
- **Remote member creation for "Create New Display File"** - the command
  that could previously only write to local workspace folders now offers a
  destination choice (local workspace / connected IBM i system) whenever
  Code for i is installed and connected. The remote path prompts for
  library (blank uses the library list, `*LIBL`) and source physical file,
  runs `ADDPFM FILE(lib/file) MBR(member) SRCTYPE(DSPF)` via Code for i's
  `instance.getConnection().runCommand()`, then writes the generated
  boilerplate into the new member via its `member:` scheme URI and opens it
  straight into the designer - reusing the exact same `openDesigner()` path
  as local files, since the `CustomTextEditorProvider` doesn't care whether
  the underlying URI is `file:` or `member:`.
  - Deliberately scoped to **not** auto-create the source physical file
    (`CRTSRCPF`) if it doesn't exist - `ADDPFM` requires it to already
    exist, confirmed against IBM's own command reference before
    implementing rather than guessing, and inventing `CRTSRCPF` parameters
    (record length, etc.) I hadn't verified felt like the wrong kind of
    risk for a command that writes to a real, sometimes-shared IBM i
    system. `ADDPFM`'s real failure message is surfaced verbatim instead.
  - Access to Code for i's extension API (`vscode.extensions.getExtension('halcyontechltd.code-for-ibmi')`)
    is deliberately loosely-typed rather than taking a hard dependency on
    `@halcyontech/vscode-ibmi-types`, so the feature degrades gracefully
    (falls straight through to local creation, no behavior change) when
    Code for i isn't installed or isn't connected - verified via a new
    test file, `src/test/createNewDspf.test.js` (20 checks): the
    no-Code-for-i fallback, ADDPFM command construction (with and without
    an explicit library), the `member:` URI shape, ADDPFM failure handling
    (real CPF error surfaced, nothing written), and respecting an explicit
    "local" choice even when Code for i is connected.
- **Warns when an unconditioned field won't fit every declared `DSPSIZ`
  size.** Real DDS: a field's position is absolute and shared across every
  declared size unless it's explicitly display-size-conditioned, so a
  layout that compiles/renders fine at one size can silently fail to
  compile (or misrender) at the other - nothing in iSDA warned about this
  until now. The DSPF designer shows a warning banner under the
  screen-size picker (only for files that declare more than one size),
  checked against ALL declared sizes regardless of which one is currently
  being viewed, via a new `DspfEngine.validateSizeBounds()` that reuses
  `resolveScreen`'s own field-position resolution rather than re-deriving
  it - a field explicitly conditioned to one size only is naturally
  excluded from sizes it never renders at. Along the way, fixed a related
  latent inaccuracy this surfaced: the resolved field object's `.length`
  is a placeholder (clamped to 1) for a bare `CONSTANT`, since constants
  have no declared DDS `LENGTH` column - `validateSizeBounds` now uses the
  real rendered text length for those.

## [0.9.11] - Unreleased

### Added
- Deleting a named field now warns if something elsewhere looks like it
  still references it by name (e.g. `REFFLD(name)`) - same advisory scan
  rename already used, applied on delete. No auto-fix (there's nothing
  sensible to rewrite a deleted field's reference TO), just a heads-up.
  Doesn't apply to menu options - those are always unnamed constants, so
  there's nothing to search for.

## [0.9.10] - Unreleased

### Added
- **Record rename now auto-rewrites the cross-references it can safely
  identify**, instead of only warning about them. `SFLCTL(name)`,
  `WINDOW(record-format-name)`, and `MNUBARCHC(id record-name 'text')` are
  rewritten to the new name automatically - using the same structural
  parsing logic `dspfEngine.js` already relies on to resolve these
  keywords at render time, not a heuristic text scan, so it can't misfire
  on a comment or a constant's display text that happens to share the same
  characters. Anything outside those three shapes still gets the existing
  advisory warning, now shown only for what's genuinely left over after
  the auto-fix. New `DspfWriter.renameRecordReferences()`, wired into both
  designers' rename flow.

## [0.9.9] - Unreleased

### Fixed
- **Display-size condition names (`*DS3`/`*DS4`, or a user-defined name like
  `*LARGE`) were silently misparsed into garbage indicators, making any
  field conditioned this way invisible in the preview regardless of which
  screen size was selected.** Per IBM's own DDS reference, a display-size
  condition name occupies the SAME columns as regular indicator
  conditioning (positions 8-16) - a different interpretation of that
  space, not a separate column range - and the parser only ever understood
  the indicator interpretation. A field conditioned like:
  ```
       A  *DS4                            2 90'WIDE SCREEN ONLY'
  ```
  got read as two bogus pseudo-indicators (`"*D"` and `"04"`) instead of a
  display-size condition, which - since no real indicator is ever literally
  named `"*D"` - meant the field's condition could never be satisfied, in
  either screen size. Verified directly against the parser before fixing.
  Now recognized (detected by position 9 being `*`) and threaded through
  the whole rendering pipeline: `resolveScreen`/`resolveMultiScreen` pass
  the currently-selected size's own name (already exposed as `screen.sizeName`
  from the 0.9.6 dual-`DSPSIZ` work) down through `conditionsSatisfied` and
  `styleFromKeywords`, so a size-conditioned field or keyword now correctly
  shows only when its screen size is the active one - independent of, and
  alongside, ordinary indicator conditioning. Writer round-trips it
  correctly too (editing/dragging a size-conditioned field preserves its
  condition exactly, verified with a real edit-and-reparse test).
  - Handles the `N*DS4` (NOT) form and user-defined condition names
    (`*LARGE`/`*NORMAL`-style), not just the built-in `*DS3`/`*DS4`.
  - **Not yet covered**: boundary validation - IBM's guidance that an
    *unconditioned* field's position must fit within the smaller of the
    declared sizes (24x80 is the universal minimum) isn't checked or
    warned about; an oversized unconditioned field just renders wherever
    its coordinates say, same as before this fix. This would need webview
    UI work (a warning surfaced somewhere in the screen designer) that
    felt like a separate, smaller follow-up rather than bundling it into
    this fix, especially since that file is shared with active work from
    another session.
- `src/test/dspfParser.test.js` (new): direct parser coverage - the exact
  bug case (constant text unaffected, condition correctly recognized as
  `displaySizeCondition` not indicators), the NOT form, a user-defined
  name, confirms regular indicator conditioning is unaffected, and a
  writer round-trip through an edit.
- `dspfEngine.test.js` extended: a field/keyword shown only in one of two
  declared sizes renders correctly in both directions (present in one,
  absent in the other, and vice versa for an `N*DS4`-conditioned one), and
  a `DSPATR` keyword conditioned by size applies its style only when active.
- `src/fixtures/lineBuilder.js` extended with a `sizeCondition` option
  (e.g. `sizeCondition: '*DS4'` or `'N*DS4'`) for building test fixture
  lines - purely additive, existing `ind1`/`ind2`/`ind3` usage unchanged.

## [0.9.8] - Unreleased

### Added
- Record format rename in the DSPF/screen designer (Properties panel) -
  previously menu-designer only. Validates the name, checks for collisions,
  and warns (without rewriting) if other lines look like they reference the
  old name (`SFLCTL`, `WINDOW`, `MNUBARCHC`, etc.).
- Delete a field/constant in the DSPF designer via Delete/Backspace on the
  current selection.
- Delete a menu option via a × button per row - removes its DDS constant(s)
  and MNUCMD command mapping together.
- No confirmation prompts for delete - like every edit here, it's a
  `WorkspaceEdit`, so Ctrl+Z undoes it.

### Fixed
- Editing a wrapped multi-line constant (e.g. a long menu label) left
  orphaned duplicate lines behind instead of removing the old ones - the
  model didn't track a bare literal's continuation lines. Fixed via
  `entrySourceLines` on `DdsFieldBase`; found while building delete above,
  since deleting on the same bug would have corrupted files too.
- De-duplicated the menu designer's rename validation/cross-reference scan
  into `webviewClientHelpers.js`, shared by both designers now.
- De-duplicated four near-identical "apply this DDS edit" functions in the
  DSPF designer into one `commitSourceChange` helper.

## [0.9.7] - Unreleased

### Changed
- Redesigned the menu designer's options panel: card layout, number badges,
  persistent field labels (`Option text` / `CMD>`), drag-handle glyph,
  option count header. Purely visual - read/write logic unchanged; tests
  updated for the renamed `.option-num` → `.option-num-badge` selector.

## [0.9.6] - Unreleased

### Added
- Screen-size picker for display files that declare two `DSPSIZ` sizes
  (e.g. `DSPSIZ(24 80 *DS3 27 132 *DS4)`) - previously only the first was
  read. Hidden when a file declares only one size (the common case).
  Changes the visible working area only - field positions stay absolute.

### Fixed
- A large `SFLPAG` (or a `SFLSIZ(9999)`-style "unlimited" pattern) could
  render subfile rows past the bottom of the screen - now capped to the
  working area, with the status hint noting when capping occurs.
- The menu designer's "+ Add option" screen-space bound (0.9.5) never
  actually read `DSPSIZ` - a doubly-escaped regex (`/\\d+/g`) never matched
  a digit, so it silently used a 24-row fallback for every file. Now shares
  the same tested `DSPSIZ` parser as the screen-size picker.
- De-duplicated `rebuildRecordSelect` and HTML-escaping between the two
  webviews into `webviewClientHelpers.js` / `DspfEngine.escapeHtml`.

## [0.9.5] - Unreleased

### Fixed
- **Split-constant option text wasn't recognized, and editing it overwrote
  the number marker instead.** A real SDA layout pattern lays out a menu
  option's number and its label text as two SEPARATE DDS constants on the
  same line (e.g. `1.` at column 7, the label text at column 10 - for
  consistent column alignment across every option), not always as one
  combined `1. Label` constant. `extractMenuOptions()` only ever recognized
  the combined form; a split-form option's number marker matched with an
  empty captured label, so its real label text (sitting in the other
  constant) never showed up in the options panel, and editing the
  (apparently blank) label field overwrote the NUMBER marker's text
  instead of the actual label - silent data corruption on save. Now
  detects both forms: a number-only constant (`1.` with nothing else on
  it) is paired with the next constant to its right on the same source
  line, if one exists. Reading, editing, swapping, and the record-rename
  scan all go through the same option model either way, so every editing
  path in the designer treats both forms identically and correctly - only
  the exact constant that actually holds the label text ever gets
  rewritten. (A number marker with genuinely no paired constant yet - just
  `1.` with nothing to its right anywhere on the line - now inserts a new
  label constant next to it on first edit, rather than having nowhere to
  write the label at all.)
- **"+ Add option" could push a new option past the screen size, or land it
  directly on top of an existing field.** Previously it always placed a new
  option exactly one row below the last existing one, with no check against
  the screen's own `DSPSIZ` row limit or whether that row was already used
  by something else (a "Selection or command" prompt, function-key text,
  another field placed there for any reason) - silently producing an
  off-screen field or two DDS entries overlapping the same row/column
  either way. Now scans forward from that starting row for the first
  actually-free row, bounded by `DSPSIZ`'s row count (record-level keyword
  first, then file-level, defaulting to 24 if neither is present or
  parseable) - and if there's genuinely no room left before hitting that
  limit, shows an inline error explaining why and adds nothing, rather
  than corrupting the layout.
- Along the way, found (and ruled out as a false alarm after empirical
  verification) a suspected third instance of the recurring
  hand-typed-regex-escaping bug class - see 0.9.4's entry for the real
  one. Worth calling out because the investigation is a good example of
  why this project trusts test output and direct runtime verification
  over reasoning about the build pipeline's multiple re-parsing stages
  from first principles.
- `menuWebview.test.js` extended with dedicated fixtures for both: a
  split-constant menu (finds both options, edits the correct constant,
  leaves the number marker untouched) and a screen-space scenario (skips
  an occupied row and lands on the next free one; refuses outright, with
  no `applyEdit`, when there's genuinely no room left).

## [0.9.4] - Unreleased

### Added
- **Editable option label text**: the options panel's label field (previously
  read-only display text) is now an input - editing it rewrites the DDS
  constant's text in place via `DspfWriter.applyFieldUpdate({ constantValue })`,
  which already supported this (no new writer code needed - only the UI was
  missing). The option number stays fixed; only the label portion changes.
- **Drag-to-swap options**: drag one option row onto another to swap what's
  shown at each option NUMBER - label text and command together. Numbers
  stay put at their own screen position (so the options panel, which always
  lists by number, visibly shows the swap); MNUCMD is updated too, since the
  command is meant to follow its label. Dropping a row onto itself is a
  no-op. (An earlier version of this swapped which screen position held
  which number instead - technically well-defined, but invisible in a list
  that's always sorted by number, so not what "drag to reorder" should feel
  like; reworked before shipping.)
- **Rename a record format** (the menu's own name, which `CRTMNU
  TYPE(*DSPF)` requires to match the member name - see 0.9.3's compile
  guard): a new "Rename" control next to the record picker, backed by a new
  `DspfWriter.renameRecordFormat()`. Deliberately a SEPARATE function from
  the existing `applyRecordUpdate` rather than extending it - that function
  explicitly treats renaming as unsupported (see its own comment) because
  other parts of a file can reference a record by name (`SFLCTL(name)`,
  `WINDOW(... name ...)`, `MNUBARCHC(id name text)`) and wouldn't be
  updated by a blind rename. This still doesn't rewrite those references,
  but now scans the rest of the source for anything that looks like one and
  warns with the specific line numbers before proceeding, rather than
  silently leaving them dangling. Validates the new name is well-formed DDS
  (1-10 chars, starts with a letter or `$#@`) and not already in use.
- `src/test/dspfWriter.test.js` extended: `renameRecordFormat()` - renames
  correctly, preserves column alignment and every other line untouched.
- `menuWebview.test.js` extended: editable label (DOM round-trip + DDS
  output), drag-to-swap (both `applyEdit` and `applyMenuCmdEdit` fire, the
  right content ends up at the right number, self-drop is a no-op), record
  rename (happy path + validation), and a dedicated second-fixture scenario
  proving the cross-reference warning actually fires for a real `SFLCTL`
  reference and still applies the rename anyway (advisory, not a block).
- In the course of building this, found and fixed a genuine escaping bug in
  a dynamically-built regex (`name.replace(/\$/g, ...)` silently lost its
  backslashes when hand-typed inside the outer build-script template
  literal - the same class of bug hit twice earlier in this project, this
  time for `\$`/`\b` rather than `\r`/`\n`). Fixed by removing the dynamic
  regex construction entirely in favor of a plain substring scan with a
  manual word-boundary check, rather than fighting the escaping further.

## [0.9.3] - Unreleased

### Added
- **"Compile Menu (CRTMNU)"** for the menu designer - a command
  (`dspfDesigner.compileMenu`, also a button in the designer's sidebar) that
  runs the real IBM i compile sequence via Code for i's
  `code-for-ibmi.runCommand` API (https://codefori.github.io/docs/dev/examples/#running-commands-with-the-user-library-list):
  `CRTDSPF`, then rebuilds the message file (`DLTMSGF`/`CRTMSGF` - deleted
  and recreated fresh each time rather than diffed against whatever message
  IDs already happen to exist, same reasoning as 0.9.1's DSPF constants),
  one `ADDMSGD` per option using the `USRnnnn` message-ID format that
  `TYPE(*DSPF)` menus expect (confirmed against an IBM support document -
  see README), then `CRTMNU`. Only `TYPE(*DSPF)` menus are handled - not
  `TYPE(*UIM)` menus, a different source format entirely.
  Guards before anything runs: requires the document to be a `member:`-scheme
  MNUDDS source, requires the Code for i extension to be installed, and
  requires the DDS record format to be named exactly the same as the menu
  member (a real `CRTMNU TYPE(*DSPF)` requirement) - with an actionable
  error naming what it found instead of a cryptic IBM failure three steps
  in. Saves any dirty buffers (the MNUDDS document, and the companion
  MNUCMD document if it's open) before compiling, since the compile reads
  from the saved server-side member, not the live editor buffer. Stops at
  the first failing step and surfaces the real IBM i error text verbatim
  rather than a generic "compile failed." Warns (with a "Compile Anyway" /
  "Cancel" prompt) if there are no option-to-command mappings yet, since
  every option would show "not correct" when selected.
- `src/test/compileMenu.test.js`: covers every guard condition, the exact
  CL command sequence and parameter values for a full compile, the
  no-mappings warning's cancel/proceed paths, and stopping at the first
  failing step with the real error text preserved. In the course of writing
  it, caught two real bugs the manual testing so far had missed: the
  compiled `dist/extension.js` couldn't find `mnuCmdEngine.js` at runtime
  (the build script now copies it into `dist/` alongside the compiled
  output), and the registered command handler wasn't returning its promise,
  so nothing - including this test - could actually await compilation
  finishing before checking the result.
- `vscode` test mock extended: `extensions.getExtension`, a configurable
  `code-for-ibmi.runCommand` handler via `commands.executeCommand`,
  `window.withProgress`/`ProgressLocation`, `showInformationMessage`, a
  configurable `showWarningMessage` response (for the Compile Anyway/Cancel
  prompt), and `TextDocument.isDirty`/`.save()`.

## [0.9.2] - Unreleased

### Added
- **Companion MNUCMD member kept in sync when it's already open elsewhere**:
  previously, saving option-command edits always wrote the `QQ` member
  directly to disk via `workspace.fs`, which meant an already-open editor
  tab for that same member wouldn't reflect the change (or worse, could
  overwrite it back on save) - a limitation called out in 0.9.0. Now, if
  that document is open, edits go through a normal `WorkspaceEdit` against
  it instead (correct dirty-dot/undo/save behavior), and edits made to it
  from elsewhere (that tab, another tool) are echoed back into the options
  panel the same way external edits to the MNUDDS document already were.
- `menu.test.js` extended to cover the open-companion-document sync path:
  edits routed through `WorkspaceEdit` instead of `writeFile` when that
  document is open, and external changes to it echoed back to the webview
  (the `vscode` mock's `workspace.onDidChangeTextDocument` now supports
  multiple concurrent listeners and a `workspace.textDocuments` list,
  since it previously only ever tracked one subscriber).
- `menuWebview.test.js` extended to cover `externalCommandUpdate` re-rendering
  the options panel in a real DOM without touching the screen preview.

## [0.9.1] - Unreleased

### Added
- **"+ Add option" in the menu designer**: previously the options panel could
  only edit or clear the command for a numbered option that already existed
  as a constant on the screen. Now you can add a brand-new option directly -
  enter a number and label text, and it inserts a correctly-formatted DDS
  constant onto the screen (`DspfWriter.insertField()`, a new writer
  primitive: builds a field entry from scratch and splices it in, unlike
  `applyFieldUpdate` which only repositions/edits an existing one - handles
  column alignment and long-label line-continuation the same way the rest of
  the writer does) at a sensible default position (one row below the last
  option in that record, same column - or row 6/col 5 as a documented guess
  if the record has no options yet to anchor on). This closes the "adding a
  brand-new option ... isn't supported yet" limitation called out in 0.9.0 -
  reposition afterward with the screen designer if the guessed spot doesn't
  fit your layout. Duplicate option numbers are rejected with an inline
  message rather than silently overwritten.
- `src/test/dspfWriter.test.js`: direct coverage for `insertField()` -
  column formatting, placement with/without existing fields, long-label
  continuation wrapping and round-trip fidelity.
- `menuWebview.test.js` extended to exercise the "+ Add option" form
  end-to-end in jsdom: validation (missing number, duplicate option),
  the happy path, and the resulting DOM/postMessage output.

## [0.9.0] - Unreleased

### Changed
- **Subfile editing redesigned to match real SDA behavior.** Previously,
  selecting the `SFLCTL` record automatically merged in the paired `SFL`
  record's rows (repeated `SFLPAG` times) as editable content, and dragging
  any field in a rendered row moved every named field of that row together
  via a batched "whole-row drag" - regardless of which record you'd
  actually selected. This conflated two independently-defined record
  formats into one editable view: an edit made while "in" `SFLCTL` could
  actually write to the other record, which was both surprising and
  inconsistent with how every other field/record edits (independently).
  - Selecting `SFL` directly now renders it once (not repeated) by default,
    as a normal, independently-editable record.
  - Selecting `SFLCTL` shows the subfile detail area for visual reference
    (repeated `SFLPAG` times, correctly positioned) as a **protected,
    non-interactive overlay** - matching real SDA, where the control
    record's design view shows the subfile area but doesn't let you edit
    individual row fields from there. Only the control record's own fields
    (headers, footers, its own keywords) are editable in that view.

### Added
- **"Preview SFLPAG rows" toggle**: when viewing the `SFL` record directly,
  an opt-in toggle repeats it `SFLPAG` times (resolved from the paired
  `SFLCTL` record) for a realistic multi-row preview *while still editing
  the template*. Unlike the `SFLCTL`-side protected overlay, these rows
  ARE the template - dragging any field in any row instance moves every
  field of that row together (group-drag, reinstated specifically for this
  opt-in case), since every visible row instance corresponds to the one
  template that actually exists in the DDS source. Off by default (single
  row, ordinary independent per-field editing - see "Changed" above).
- **Compare mode**: a separate opt-in, explicitly read-only way to preview
  *several* record formats together at once (not just automatic subfile
  pairing) - check any combination of record formats to see them layered
  on the same grid, each field tagged with its source record. No
  click/drag/select wiring at all in this mode, by design: editing an
  arbitrary combination of independently-defined records is ambiguous
  (which record would an edit belong to?). Switch off "Compare" to return
  to normal single-record editing.
- `DspfEngine.resolveMultiScreen()`: the engine-level primitive behind
  compare mode - resolves several records' fields (respecting each one's
  own `WINDOW`/subfile-preview) without the single-record overlap
  resolution, since comparison mode is for eyeballing multiple formats,
  not simulating one specific runtime state.
- **Menu design tool (MNUDDS)**, a first minimal vertical slice: a new
  `dspfDesigner.menuEditor` custom editor (opened via **"iSDA: Open Menu
  Design Preview"** or a CodeLens that appears on menu-shaped source)
  previews an IBM i SDA-style menu's screen layout - reusing the existing
  `dspfParser.ts`/`dspfEngine.js` as-is, since a MNUDDS member is plain DDS -
  and lets you edit which command each numbered option runs. Confirmed
  against IBM i documentation/community sources that a menu is really two
  source members (MNUDDS for layout, a companion "MNUCMD" member
  conventionally named `<menu>QQ` mapping option numbers to commands, see
  https://wiki.midrange.com/index.php/Create_Menu_Message_FIle_(UTMNUMSGF));
  a new `src/mnuCmdEngine.js` (plain dependency-free JS, same UMD style as
  `dspfEngine.js`/`dspfWriter.js` so the identical code runs in Node and the
  webview) parses and round-trips that member. Only works for a MNUDDS
  member opened as a remote IBM i source member via Code for i - see README
  "Known limitations" for this and what's intentionally out of scope for v0
  (adding brand-new options on the screen itself, live sync back into an
  already-open `QQ` editor tab, `CRTMNU` compile integration).
- `src/test/menu.test.js`: exercises `mnuCmdEngine.js`'s parse/write logic
  directly, then `MenuDesignerEditorProvider` against the `vscode` mock
  (extended with `workspace.fs.readFile` and per-viewType custom editor
  provider tracking, since the mock previously only ever dealt with one).
- `src/test/menuWebview.test.js`: an end-to-end check that actually
  *executes* the generated menu webview's client-side script in jsdom,
  rather than only asserting on the HTML string - catches bugs in the
  option-extraction regex, DOM wiring, or the `postMessage` payload shape
  that string-contains checks can't.

Verified via jsdom: `SFL` viewed directly renders once and drags fields
independently by default (confirmed `ROWAMT` stays put while dragging
`ROWNAME`); enabling "Preview SFLPAG rows" correctly resolves the row count
from the paired `SFLCTL` even though `SFLCTL` isn't the record being
viewed, renders all 4 rows editable, and correctly group-drags both
`ROWNAME` and `ROWAMT` together by the identical delta; `SFLCTL` viewed
directly shows its own fields as editable plus an 8-field protected
overlay (4 rows × 2 fields) that correctly rejects a drag attempt (zero
messages posted); the preview-rows toggle correctly hides for non-SFL
records, resets when switching records, and stays hidden in compare mode;
compare mode correctly disables the record picker, combines multiple
records' fields, and rejects field interaction; toggling compare mode back
off correctly restores normal single-record editing. Full regression suite
across every fixture re-run clean.

## [0.8.1] - Unreleased

### Added
- Migrated from a plain `WebviewPanel` to `CustomTextEditorProvider`
  (`dspfDesigner.editor`, registered with `priority: "option"` so it doesn't
  replace normal text editing by default). The designer's webview tab is now
  a real editor from VS Code's perspective: its own dirty dot, a proper
  "save changes before closing?" prompt, and `Ctrl+Z`/`Ctrl+Y` routed to it
  when focused - none of which a plain `WebviewPanel` gets for free, even
  though document-content undo/redo already worked either way (that's a
  property of editing via `WorkspaceEdit`, not of the panel type).
  `dspfDesigner.openPreview` now opens it via the standard `vscode.openWith`
  command instead of manually managing a `Map` of open panels -
  `supportsMultipleEditorsPerDocument: false` gives the same
  reveal-existing-instance behavior for free.
- A real regression test for the extension host (`src/test/extension.test.js`,
  run via `npm test`): exercises `activate()` and
  `resolveCustomTextEditor()` - including the echo-suppression logic that
  prevents infinite webview↔document sync loops - against a minimal mock of
  the `vscode` module (`src/test/vscode-mock.js`), since there's no real VS
  Code instance available in this environment. Verified all three cases:
  our own in-flight edit is correctly suppressed, a genuinely external
  change after it settles correctly propagates, and changes to unrelated
  documents are correctly ignored.

## [0.7.0] - Unreleased

### Added
- **"Create New Display File" command** (`dspfDesigner.createNewDspf`):
  prompts for a filename, primary record format name, and screen title, then
  writes a minimal, verified-correct DDS boilerplate (`DSPSIZ`, one record
  format, a title constant, one sample output field) and opens it straight
  into the designer. Available from the command palette and from
  right-clicking a folder in the Explorer. The generated source is parsed
  with iSDA's own parser *before* being written, as a safety net against
  any bug in the boilerplate itself.
- Remote IBM i source members and IFS streamfiles (opened via the Code for i
  extension's `member:`/`streamfile:` URI schemes) are now recognized for
  the editor-title preview button and the CodeLens, not just local `.dspf`
  files. Verified the actual scheme names and the `dds.dspf` language ID
  (assigned by the optional companion "IBMi Languages" extension
  specifically to display-file source - `.pf`/`.dds` map to `dds.pf`,
  physical files, which is a different thing) against their real
  `package.json` before wiring this up, rather than assuming.

### Fixed
- The editor-title button's `when` clause previously also matched `.pf`/`.PF`
  (physical file DDS - database field definitions, not screen layouts) -
  narrowed to just display-file extensions (`.dspf`/`.DSPF`/`.dspf38`).
- Dropped the `workspaceContains:**/*.dspf` activation event (forces a full
  workspace file-tree scan on startup) in favor of `onLanguage:dds.dspf` -
  command-based activation is automatic in modern VS Code and didn't need
  an explicit activation event at all.

### Reviewed, already correct
- The CSP (`script-src 'nonce-...'`) is already the right pattern for this
  extension's architecture: the webview inlines `dspfEngine.js`,
  `dspfWriter.js`, and the bundled parser directly as `<script nonce="...">`
  content rather than loading external files, so there's nothing to grant
  `asWebviewUri()` permissions for.
- `jsdom` is a devDependency used only by this project's own verification
  scripts (never imported by anything under `dist/` or embedded into the
  generated webview) - confirmed via a repo-wide search before writing this
  down rather than just asserting it.

## [0.6.0] - Unreleased

### Added
- Full multi-group and >3-indicator conditioning is now editable, at every
  level (field, record, help entry, *and* individual keyword) - the
  "locked, edit the source directly" restriction is gone entirely.
  `buildConditionChunks` splits an arbitrary conditions array (any number of
  OR'd groups, each with any number of indicators) into the right sequence
  of indicator-only prefix lines plus a final line carrying the last chunk's
  indicator columns together with the actual content.

### Fixed
- **Real, silent data-loss bug**: editing any field that had a *keyword*
  with its own conditioning (e.g. a conditionally-applied `DSPATR(HI)`) -
  even when the field itself had no field-level conditions and so wasn't
  locked - would regenerate that keyword as unconditional, discarding its
  indicators with no warning. Per-keyword conditioning is now correctly
  preserved and independently editable; keywords are grouped by identical
  conditions and each group gets its own line(s), matching real DDS layout.
- **Real bug in line-range detection**: pure indicator-only lines that
  *precede* a field/record's own content line (needed whenever conditioning
  spans more than one line) were never included in
  `getFieldLineRange`/`getRecordLineRange`, since neither `field.sourceLine`
  nor any keyword's `sourceLines` captured them. An edit would regenerate a
  correct new prefix line while leaving the stale original one untouched,
  and re-parsing would then merge the two into one group with duplicated
  indicators. Fixed by tracking `sourceLines` on `DdsCondition` itself
  (parser change) and including those in the range calculation (writer
  change). Caught via round-trip testing before it shipped.
- Sequence numbers on lines that don't otherwise change are now preserved
  from the original source instead of being overwritten with the entry's
  first line's prefix - keeps diffs minimal (a length-only edit on a
  multi-line conditioned field/keyword now touches exactly one line, not
  every line the entry spans).

## [0.5.0] - Unreleased

### Added
- `WINDOW(record-format-name)` resolution: a record can now correctly
  inherit its window geometry from another record's `WINDOW` keyword,
  including transitively through chains and through a referenced record
  that itself uses `*DFT` or a field-name position.
- `WINDOW(*DFT height width)` and field-name-based dynamic positioning
  (`WINDOW(&line &col height width)`) now render at a placeholder origin
  with a dashed border and a "position set at runtime" label, instead of
  not rendering at all.

### Fixed
- Corrected a wrong assumption from earlier docs research: there is no
  `WDWDEFINE`/`WINDOW(*DEFINE...)` keyword in DDS. The real named-reference
  mechanism is `WINDOW(record-format-name)`, verified against IBM's actual
  WINDOW keyword reference before implementing, to avoid building against
  a keyword that doesn't exist.

## [0.4.0] - Unreleased

### Added
- Record-level property editing: the properties panel now shows the current
  record's keywords (add/remove) whenever no field is selected, instead of
  just a placeholder. Deselect a field by clicking the screen background to
  get back to it.
- Help entry (`H` specification) editing: each record's help entries are
  listed and clickable from the record view, opening a keyword editor for
  that specific entry (`HLPARA`, `HLPRCD`, `HLPTXT`, etc.).
- Fixed a real gap in the writer: `HELP`-type entries previously couldn't be
  serialized at all (`col 17` was hardcoded blank instead of `H`), so any
  edit to a field would have silently corrupted help specifications
  elsewhere in the file the next time the source was regenerated near them.
  This is now correct.
- Multiple record formats in one display file were already fully supported
  (the record picker has always listed every format) - confirmed still
  correct across the subfile/window/menu-bar fixtures, which all define
  several record formats at once.

### Known limitations
- Record renaming isn't supported (see README).
- Help-entry re-selection after an edit isn't preserved (help entries have
  no stable name to re-find by, unlike fields) - editing one returns you to
  the record view rather than keeping it open.

## [0.3.0] - Unreleased

### Added
- Menu-bar (`MNUBAR`) rendering: a field with `MNUBARCHC` keywords now
  renders as a horizontal row of clickable choices (in ascending numeric
  order, per DDS semantics), instead of a single plain-text field.
- Simulated menu-bar trigger: clicking a menu choice opens its linked
  `PULLDOWN` record as an overlay anchored just below the choice, with an
  auto-sized border (matching the real "system calculates the dimensions"
  behavior). Clicking the open choice again, clicking a different choice, or
  clicking elsewhere on the screen all close/switch it correctly.
- The pulldown overlay renders as a separate layer on top of the base
  screen rather than competing for grid cells with it, matching how a real
  pulldown visually covers whatever is underneath.
- Whole-row subfile drag: dragging any field within a rendered subfile row
  now moves every named field of that row's template together - visually
  during the drag and as one batched source edit - instead of moving just
  the one field grabbed. Unnamed constants in the row template are left in
  place (see README known limitations).

### Fixed
- The previous single-field-only subfile drag would silently leave sibling
  row fields behind, making a dragged row look consistent on screen but
  actually misaligned in the underlying DDS source relative to other fields
  in the same row.

### Known limitations
- Pulldown-overlay fields are preview-only (not draggable/editable) - edit
  the `PULLDOWN` record directly via the record picker instead.
- `CHCCTL` (per-choice runtime logic) has no visual representation.

## [0.2.0] - Unreleased

### Added
- Subfile (`SFL`/`SFLCTL`) rendering: the paired subfile record's row template
  is repeated `SFLPAG` times with correct vertical spacing, resolved from
  either side of the pairing (previewing the control record or the subfile
  record itself both work).
- `WINDOW` rendering: field positions are correctly interpreted as relative
  to the window's own origin (not absolute screen coordinates), with a
  bordered box drawn at the declared size and an optional `WDWTITLE` label.
- GUI-style widget rendering: `SNGCHCFLD`/`MLTCHCFLD` fields with `CHOICE`
  entries render as radio/checkbox groups; `PSHBTNFLD` fields render as
  buttons.
- Dragging now uses delta-based coordinate math instead of writing the
  absolute rendered position, so moving a windowed field correctly updates
  only its window-relative position (the `WINDOW` keyword itself is
  untouched), and moving any visible subfile row instance correctly moves
  the one template row that actually exists in the DDS source.
- Field selection/editing now resolves across all record formats, since a
  subfile row's fields belong to the paired `SFL` record rather than the
  currently-previewed `SFLCTL` record.

### Known limitations
- `WINDOW(*DEFINE ...)` named-window references aren't resolved.
- Menu-bar (`MNUBAR`/`MNUBARCHC`) cascading pulldown interaction isn't
  implemented - `PULLDOWN` records render their choice fields but there's no
  simulated menu-bar trigger.
- Dragging a subfile row moves one field at a time; there's no "drag the
  whole row" multi-field selection yet.

## [0.1.0] - Unreleased

### Added
- DDS display-file parser (`dspfParser.ts`): fixed-column format, multi-line
  AND/OR indicator conditioning, `+`/`-` keyword continuation, constants,
  file/record/field-level keywords.
- Screen resolver and HTML renderer (`dspfEngine.js`): indicator-conditioned
  visibility, relative (`+n`) column offsets, `COLOR`/`DSPATR` styling,
  position-sequence overlap resolution.
- Source write-back (`dspfWriter.js`): regenerates only the affected field's
  source line(s) and splices them back in, leaving everything else
  byte-identical.
- Interactive webview editor: click to select, drag to move, edit
  name/length/type/decimals/usage/keywords, with changes applied to the
  real document via `WorkspaceEdit`.
- Bidirectional sync between the visual editor and the text editor.
