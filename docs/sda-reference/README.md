# SDA picker-screen reference

Source material for the **SDA-style picker screens for keywords, attributes,
and conditioning** planned enhancement (see the main [README](../../README.md#planned-enhancements)
and [PICKER-SCREENS-PLAN.md](./PICKER-SCREENS-PLAN.md)).

- `source/` — the original Word doc (`SDA-Issues-and-Enhancement-Screenshots.docx`)
  as supplied, with the raw "Issues" list and every screenshot in its
  original order. Treat this as the authoritative source if anything below
  looks miscategorized — screens were sorted into folders by eye and a
  couple of edge cases (duplicated/repeated frames, screens that changed
  mid-DDS-type) may be filed slightly off.
- `screens/` — the same screenshots (real `STRSDA` sessions), regrouped by
  **what they are** rather than by their order in the document, so a
  developer picking up one row of the plan can go straight to the relevant
  folder instead of hunting through 215 images. See folder layout below.

## Why regrouped

Real SDA reuses the *same* "Select/Define \_\_\_ Keywords" screen across many
record types — e.g. General/Indicator/Application Help/Help/Output/Input/
Overlay/Print keywords look and behave identically whether you're on a
plain `RECORD`, a `SFLCTL`, a `WINDOW`, or a `PULLDOWN` record. The plan
splits work by *screen*, not by *record type*, so each screen is built
once and wired to every record type that uses it. `screens/` mirrors that:

```
screens/
  file-level/                        # one record type — no variants
    00-menu, 01-general-keywords, 02-indicator-keywords, 03-print-keywords,
    04-help-keywords, 05-display-sizes, 06-dbcs-conversion,
    07-alternate-keywords, 08-window-border, 09-menu-bar-keywords

  record-level/
    base-record-keywords/            # THE reusable set — General, Indicator,
      general/ indicator/ application-help/ help/   Application Help, Help,
      output/ input/ overlay/ print/                Output, Input, Overlay,
                                                      Print. Shared by RECORD,
                                                      SFLCTL, SFLMSGCTL,
                                                      WINDOW, WNDSFCTL,
                                                      PULLDOWN, PDNSFLCTL,
                                                      MNUBAR (each uses all
                                                      or a subset — see plan).
    usrdfn/                          # USRDFN only uses General/AppHelp/Help/Print
                                      # from the base set (no Indicator/Output/
                                      # Input/Overlay) — no screens of its own.
    subfile-sfl/                     # SFL: Subfile keywords + General + Indicator
    subfile-control-sflctl/          # SFLCTL-only: Subfile Control menu,
                                      # General, Display Layout, Subfile Messages
    subfile-message-sflmsg/          # SFLMSG-only: Message Record, General, Indicator
    window/                          # WINDOW-only: Window Parameters
                                      # (size/roll), Border Parameters/Color/
                                      # Attributes/Characters
    window-subfile-wndsfl/           # WNDSFL-only additions (reuses subfile-sfl
                                      # General/Indicator + window/ border set)
    window-subfile-control-wndsfctl/ # WNDSFCTL-only additions (reuses
                                      # subfile-control-sflctl + window/ border set)
    pulldown-puldwn/                 # PULLDOWN-only additions (reuses window/
                                      # border set, no window-parameters)
    pulldown-subfile-puldwnsfl/      # PULDWNSFL-only additions (reuses subfile-sfl)
    pulldown-subfile-control-pdnsflctl/ # PDNSFLCTL-only additions (reuses
                                      # subfile-control-sflctl + border set)
    menu-bar-record-mnubar/          # MNUBAR-only: General, Menu-Bar Display Keywords

  field-level/
    character/                       # Usage B/I/O: Display Attrs, Colors,
                                      # Keying Options, Validity Check, Input,
                                      # General, Database Reference, Error
                                      # Messages, Message ID
    numeric/                         # same set as character + Editing
                                      # Keywords + Subfile Keywords
    constant/                        # Display Attrs, Colors, General,
                                      # Menu-Bar Keywords
    menu-bar-choice/                 # MNB.../MNUACT fields (pulldown/menu-bar
                                      # choice definitions): Choice Selection
                                      # Type, Choice Keywords, Choice Colors &
                                      # Attributes, Separator — same screen
                                      # repeated per choice number, not a new
                                      # design per choice

  menu-designer/
    option-field-attributes/         # Task M1: real SDA "Set Field Attributes"
                                      # screen (Color/DSPATR) for a menu option's
                                      # underlying CONSTANT — user-supplied photo,
                                      # not from the original source doc
```

Folders prefixed `_` (e.g. `_menu`, `_base-record-menu-example`) hold the
"Select ... Keywords" landing menu for that record type — useful for
context but not a new picker to build; it's the category checklist that
routes to the other folders.

## Cross-check against what's already built

Six keyword categories already have a dedicated `getX`/`setX` pair in
`src/dspfWriter.js` and a panel in `src/webviewClientHelpers.js`: Color &
attributes, Validity check (`RANGE`/`COMP`/`VALUES`), Edit code/word,
Command keys, Window title, Error message. Several SDA screens above map
onto these directly (e.g. field-level "Select Colors" + "Select Display
Attributes" together ≈ the existing Color & attributes panel, split by SDA
into two screens; "Define Error Messages" ≈ the existing error-message
panel). Check `src/dspfWriter.js` before adding a new `getX`/`setX` pair —
several of the screens below are UI-only work (new picker layout) over
existing read/write logic, not new keyword plumbing.

## Known issues (from the same document, not part of the picker-screen work)

See the **Issues** list at the top of the source doc for defects filed
separately from this enhancement — default view mode, panel
hide/minimize for small display sizes, and record-type-dependent-record
auto-creation (`SFL`/`SFLMSG`/`WDWSFL`/`PDNSFL` should auto-add their
paired `SFLCTL` record, per real SDA). These are tracked as regular
`Known limitations` / bug-fix items, not rows in the picker-screen plan.
