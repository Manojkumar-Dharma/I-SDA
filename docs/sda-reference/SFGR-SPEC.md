# SFGR source specification (`DSPF36` members)

Working specification for System/36 screen format generator (`$SFGR`) source, the format of a `DSPF36` source
member and of `.dspf36` files. It is the deliverable of **E11a** in [`FEATURE-ROADMAP.md`](FEATURE-ROADMAP.md#e11)
and the input for E11c (parser), E11d (writer), E11e (model), E11g (panels) and E11j (diagnostics).

**Sources.** `source/sc414730.pdf`, *OS/400 System/36 Environment Programming* V3R6: Appendix B "$SFGR
Specification Forms" (pages B-1 to B-26, PDF pages 333 - 358) and chapter 14 "Differences between System/36 SFGR and
AS/400 DDS" (14-24 to 14-27). `source/sc414731.pdf` (*System/36 Environment Reference*) for the `FORMAT` procedure and
the `$SFGR` utility. Checked against `source/stipfm.dspf36`. Section numbers in this file are ours; "B-n" means a page
of Appendix B. Where this file says **Verified**, the layout was checked on the sample; **Not in sample** means it comes
from the manual only.

---

## 1. File shape

| Item | Rule | Source |
|------|------|--------|
| Record | One specification per line, fixed columns 1 - 80. Only the first 80 characters are used. | B-1 |
| Line length | Lines in the sample are **right-trimmed**, not padded to 80 (lengths 6 to 80). A reader must treat missing columns as blanks, and a writer must not add trailing blanks to a line it did not change. | Verified |
| Line ends | The sample is UTF-8 with CRLF. Both CRLF and LF must be read and written back as found. The last line has no terminator. | Verified |
| Sequence (cols 1 - 5) | Not processed by the `FORMAT` procedure; the sample has five blanks. Keep as found. | B-1, Verified |
| Specification type (col 6) | `S`, `H` or `D`. Required. The sample has only `S` (7 lines) and `D` (542 lines). | B-1, Verified |
| Comment | `*` in column 7 makes the line a comment (all three spec types). A comment cannot follow a D line that has `X` in column 80. | B-1, B-14, B-27 |
| `*DDS` line | Sequence number `*DDS` **and** `*` in column 7: user DDS, copied into the generated DDS with column 6 replaced by `A` and column 7 by a blank; the rest is unchanged; only the first 80 characters are used. Warning SYX5328 is issued at compile and the line is treated as a comment on System/36. Meant for `FRCDTA` (col 45) after an S spec. Not in sample. | B-1 |
| Order | One S spec first for each format, then optional H specs, then the D specs. | B-1, B-8, B-13 |
| Several formats | A member holds several formats one after another; each starts at its own S spec. | B-1, Verified |

Encoding note: the sample contains `¦` (a broken bar, the usual conversion of the System/36 vertical bar) and accented
French text. Column positions are counted in **characters**, not bytes.

## 2. S specification (display control)

One per format, first record of the format. Applies to the whole format.

| Cols | Entry | Values | Notes |
|------|-------|--------|-------|
| 7 - 14 | Display format name | Up to 8 characters, first A - Z, `#`, `$` or `@`; no comma, single quote or blank; left-justified; unique in the member | B-1; names that DDS rejects get an `ALTNAME` (14-24) |
| 17 - 18 | Start line | blank = 1; 1 - 24 (27 for 132 columns), right-adjusted; `V` = set by the program (1 if unset) | B-2. Sample: blank and `18` |
| 19 - 20 | Lines to clear | blank = clear all; 0 - 24 (27), right-adjusted | B-2. Sample: ` 0`/`00` and `24` |
| 21 | Lowercase (format default) | blank/`N` = uppercase only; `Y` = lowercase allowed | B-3; D col 51 wins |
| 22 | Return input | `Y`/blank = always return; `N` = return only if data typed | B-3 |
| 25 - 26 | Sound alarm | blank/`N`, `Y`, or indicator 01 - 99 | B-3. Sample: `64` |
| 27 | Enable function keys | blank = all; `Y` = only those in the key mask; `N` = all except those in the mask; `R` = retain | B-3 |
| 28 | Enable command keys | same values as column 27, for the letters in the mask | B-4. Sample: `Y` throughout |
| 29 - 30 | Blink cursor | blank/`N`, `Y`, indicator | B-4 |
| 31 - 32 | Erase input fields | blank/`N`, `Y`, indicator | B-5 |
| 33 - 34 | Override fields | blank/`N`, `Y`, indicator | B-5 |
| 35 - 36 | Suppress input | blank/`N`, `Y`, indicator | B-6. `Y` on a help format acts as `N` |
| 37 - 38 | Null fill | blank/`N`, `Y`, indicator. Syntax-checked only; no effect on AS/400 | B-7 |
| 39 | 132-column format | blank/`N` = 80 columns, `Y` = 132 columns | B-7 |
| 40 | Right-to-left display | blank/`N`, `Y`. Only the first format's value counts for the whole file (`CHECK(RLTB)` is file-level) | B-7, 14-24 |
| 41 - 63 | Reserved | blank | B-7 |
| 64 - 79 | Key mask | Function key digits and command key letters, any order, no embedded blanks | B-7, B-8. Sample: `CV`, `C`, `BE`, `ACEIJ` |

Columns 23 - 24 and 80 are not described for the S spec (the form shows WSU-only entries there); treat them as
reserved and keep them as found. The form's WSU-only entries (enter mode sequence, format ID, insert and review mode
indicators, priority, reset keyboard) are outside this epic.

**Key mask tables (B-8).** Function keys: `1` Print, `2` Page Down (Roll Up), `3` Page Up (Roll Down), `4` Clear,
`5` Help, `6` Home. Command keys: `A`..`L` = 1..12, `M`, `N`, `P`..`Y` = 13..24 (there is no `O`).
**Discrepancy in the manual:** the worked example on B-8 says `2` is Page Up and `3` is Page Down, the opposite of the
table directly above it; the table is used here and the question goes to E11a's decision list.
Semantics: with `Y` the listed keys are the only ones enabled (an empty list disables all); with `N` the listed keys
are the only ones disabled (an empty list disables none); blank enables everything and ignores the mask; `R` keeps the
previous state and ignores the mask. The Print key, when disabled, prints the screen; the Help key must not be enabled
if help formats are to appear.

**Stacking formats (Figure B-2, B-3).** A format with a start line and a lines-to-clear count is drawn over the
previous format: it clears that many lines from the start line, and input fields of the covered format stay usable.
Actual row of a field = start line + field line - 1.

## 3. H specification (help area)

Optional, after the S spec and before the first D spec. Not in the sample.

| Cols | Entry | Values |
|------|-------|--------|
| 7 - 14 | Help format name, or help text label (online document) | Format name is exactly 8 characters `axxxxxnn`: `a` A - Z, `xxxxx` five characters, `nn` 00 - 99 (up to 100 formats per area, same first 6 characters). Label: 1 - 8 characters, A - Z `#` `$` `@` first, no comma, quote or blank. `*` in col 7 = comment. |
| 16 - 23 | Help display file name, or online document name | Left-justified. Blank = the file in use. Document name: 1 - 8 characters, none of `? ' / . - = > , *` or blank; not `ALL`, `SYSTEM`, `NEW`, `DIR` |
| 25 - 32 | Help library name, or folder name | Library only with a file name. Folder: not `ALL`, `#LIBRARY`, `F1`, `READER`, `PRINT`, `DISK` |
| 34 - 37 | Upper left corner `rrcc` | Row right-justified in 34 - 35, column in 36 - 37; columns above 99 as `A0` (100) .. `D2` (132) |
| 39 - 42 | Lower right corner `rrcc` | Same rules; both corners blank = null help area (reachable by Page Down/Up only) |
| 44 - 45 | Suppress selection indicator | blank, or indicator 01 - 99 (`Y`/`N` give an error) |
| 47 - 48 | Restore display format | `Y`/blank, `N`, indicator. Syntax-checked, ignored on AS/400 |
| 50 - 51 | Boundary indicator | `N`/blank, `Y`, indicator |
| 53 | Online document | `Y` = document H spec; blank/`N` = display format H spec |
| 15, 24, 33, 38, 43, 46, 49, 52, 54 - 80 | Reserved | blank |

Rows are relative to the S spec start line (actual row = start line + row - 1); a start line that pushes the corner past
the screen is a compile error (numeric start line) or ignores the H spec (`V`).

## 4. D specification (field or constant)

One per field. A constant that needs more than 23 characters continues on the next D line (section 5).

| Cols | Entry | Values | Notes |
|------|-------|--------|-------|
| 7 - 14 | Field name | Up to 8 characters; reference only. First 6 should be unique for RPG | B-14. Verified (`FA0001`, `FL0001`) |
| 15 - 18 | Field length | 1 - 1919 (1 - 3563 on 132 columns), right-justified. Self-check max 32; at least 6 for a message field. Signed numeric input 2 - 16 | B-14. Verified |
| 19 - 20 | Line | Relative to the start line, right-justified | B-15. Verified |
| 21 - 22 | Column | 1 - 80, or 1 - 132 as `A0` .. `D2`. Row 1 column 1 is never usable; leave one blank before each field for its attribute byte | B-15. Verified |
| 23 - 24 | Output data | blank/`N` = not output; `Y` = output; indicator 01 - 99 = output when on. With input allowed = input/output | B-15. Verified (`Y`, `99`) |
| 25 | (WSU edit code) | blank | form only |
| 26 | Input allowed | blank/`N`, `Y` | B-17. Verified |
| 27 | Data type | blank/`B` any, `A` alphabetic, `M` alphabetic with numeric shift, `N` numeric, `S` signed numeric, `R` magnetic stripe, `Z` right-to-left, `D` digits only, `K` Katakana, `E`, `F`, `O`, `X` (DBCS only) | B-17. Verified (`D`) |
| 28 | Mandatory fill | blank/`N`, `Y` | B-18 |
| 29 | Mandatory entry | blank/`N`, `Y` | B-18 |
| 30 | Self-check | blank, `T` modulus 10, `E` modulus 11 | B-19 |
| 31 | Adjust/fill | blank, `Z` right-justify zero fill, `B` right-justify blank fill. Implies controlled field exit; not with mandatory fill | B-19. Verified (`B`) |
| 32 - 33 | Position cursor | blank/`N`, `Y` (one field only), indicator | B-19. Verified (`37`) |
| 34 | Enable Dup key | blank/`N`, `Y` | B-20 |
| 35 | Controlled field exit | blank/`N`, `Y` | B-20 |
| 36 | Automatic record advance | blank/`N`, `Y` | B-20 |
| 37 - 38 | Protect field | blank/`N`, `Y`, indicator. Input fields only | B-21. Verified (`Y`, `37`, `60` - `62`) |
| 39 - 40 | High intensity | blank/`N`, `Y`, indicator | B-21. Verified |
| 41 - 42 | Blink field | blank/`N`, `Y`, indicator | B-21. Verified |
| 43 - 44 | Nondisplay | blank/`N`, `Y`, indicator | B-22. Verified |
| 45 - 46 | Reverse image | blank/`N`, `Y`, indicator | B-22. Verified |
| 47 - 48 | Underline | blank/`N`, `Y`, indicator | B-22. Verified |
| 49 | Column separators | blank/`N`, `Y` | B-22. Verified |
| 50 | Reserved | blank | B-24 |
| 51 | Lowercase | blank/`N`, `Y`. Input fields only, not numeric; wins over S col 21 (Figure B-10) | B-24 |
| 52 - 55 | Reserved | blank | B-24 |
| 56 | Constant type | blank, `C` constant, `M` message | B-24. Verified (`C`) |
| 57 - 79 | Constant data | Up to 23 characters. With `M`: 57 - 60 message id (MIC), 61 - 62 member identifier `U1` (blank), `U2`, `P1`, `P2`, `M1`, `M2` | B-25. Verified |
| 80 | Continuation | `X` = the next D line continues the constant | B-26. Verified (46 lines) |

**Combinations the manual states.** High intensity + reverse image + underline together draw the field as nondisplay;
nondisplay with high intensity, reverse image or underline is nondisplay only. A field that is both output and has a
constant: with output `Y` and constant, the constant shows; with an indicator and constant, the program's data shows
when the indicator is on, the constant when off (Figure B-7, B-8). Color mapping for 5292 terminals is in Figure B-9
(page B-23) and is kept for E11f.

**Data type mapping to DDS (B-18).** blank to blank, `B` to `A`, `A` to `X`, `M` to `N`, `N` to `M`, `S` to `S`, `R` to
`I`, `Z` to `A`, `D` to `D`, `K` to `W`, `E` and `F` to `E`, `O` to `O`, `X` to `J`. Without a DBCS system `E`, `F`, `O`,
`X` become `B`.

## 5. Continuation

A D line with `X` in column 80 continues its constant on the **next** line, which is a D line whose columns 7 - 79
hold the rest of the constant text (the continuation line's own column 7 - 79 are text, not a field definition). In the
sample, line 3 ends in `X` and line 4 is `     D` followed by blanks, meaning a blank run continues the constant.
Findings from the sample that the parser must follow:
- 46 lines have `X`, so 46 of the 542 D lines are continuation lines, not fields; a reader that parses every D line as
  a field reads their text as column values (length, line, attributes), which is why the DDS parser reports false
  fields on this file today.
- Continuation text starts at column 7, so it can begin with letters directly after the `D` (`     Dté cochés dans`).
- Trailing blanks of a continuation line are trimmed like any other line, so joining must pad to column 79 before
  appending the next piece, or constants lose their internal blanks.
- A comment line cannot follow a line with `X`.
- With DBCS, a shift-in/shift-out pair at the join is deleted (B-27); out of scope until E11a decides on DBCS.

## 6. What the sample covers

The sample has no H specs, comment lines or `*DDS` lines, so those three parts rest on the manual alone and need a
test fixture of their own (E11c). Counts in the sample: 7 S specs (start line blank except one `18`, lines to clear `24`
or `00`, alarm indicator `64` twice, enable command keys `Y` with masks `CV`, `C`, `BE`, `ACEIJ`), 496 D lines that
start a field or constant, 46 continuation lines, constant type `C` on 286 of them.

## 7. Open points for E11a (to settle with Manojkumar)

1. **Model.** The manuals give no complete SFGR-to-DDS keyword table (chapter 14 lists differences only), so the
   mapping to the existing record and field model is ours to define in E11e, not a copy of `$SFGR`'s output.
2. **Detection.** By extension and member source type (`DSPF36`), with a content check as the fallback (column 6 holds
   only `S`/`D`/`H`/`*` on every non-blank line, and DDS lines have `A` there).
3. **`*DDS` lines.** Opaque, preserved in place, shown as a locked item in the designer, versus parsed as DDS.
4. **Key mask table.** Use the table (2 = Page Down, 3 = Page Up) and note the example's contradiction.
5. **DBCS** data types (`E F O X`) and the WSU-only entries: read and kept as found, no designer support in E11.
6. **Convert to DDS.** Out of scope for E11 unless asked for.
