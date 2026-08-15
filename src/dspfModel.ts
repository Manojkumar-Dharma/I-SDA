/**
 * dspfModel.ts
 *
 * Data model produced by the DDS parser for IBM i Display Files (DSPF).
 * This is intentionally decoupled from VS Code so it can be unit tested
 * and reused (e.g. in a webview) without pulling in the `vscode` module.
 */

/** A conditioning indicator reference, e.g. N01, 51, etc. */
export interface DdsIndicator {
  /** Indicator number as text, "01".."99" */
  number: string;
  /** True if this indicator must be OFF (N prefix) for the condition to be true */
  not: boolean;
}

/** A display-size condition name, e.g. *DS3/*DS4 or a user-defined name like *LARGE. */
export interface DdsDisplaySizeCondition {
  /** The name as written, e.g. "*DS4" or "*LARGE" - matched against the name a
   *  DSPSIZ size entry declares for itself (see dspfEngine.js's screenSizeFromFileKeywords). */
  name: string;
  /** True if this size must NOT be the active one (N prefix) for the condition to be true */
  not: boolean;
}

/**
 * One AND-group of up to 3 indicators (positions 8-16), OR - mutually exclusive
 * per DDS rules - a single display-size condition name occupying that same
 * column span. A condition line is one or the other, never both, and a
 * display-size condition can't be combined with anything else via AND/OR
 * continuation - see parseConditionGroup in dspfParser.ts.
 * Multiple groups on separate lines joined by 'O' in position 7 form an OR relationship.
 */
export interface DdsCondition {
  /** 'AND' (default / blank / 'A') or 'OR' ('O') relationship to the previous group */
  relation: 'AND' | 'OR';
  indicators: DdsIndicator[];
  /** Non-null when this group is a display-size condition instead of indicators - `indicators` is always empty in that case. */
  displaySizeCondition: DdsDisplaySizeCondition | null;
  /** Source line(s) that contributed to this group - a group can span multiple lines
   *  (indicator continuation via 'A' in position 7 when a group has more than 3 indicators).
   *  Needed so a write-back can find and replace ALL of a condition's lines, including
   *  ones that precede the field/record's own content line - see dspfWriter.js. */
  sourceLines: number[];
}

export type DdsNameType = 'RECORD' | 'HELP' | 'FIELD' | 'CONSTANT';

/** Position 38 usage codes */
export type DdsUsage = 'O' | 'I' | 'B' | 'H' | 'M' | 'P';

/** A single DDS keyword, e.g. DSPATR(HI), COLOR(BLU), TEXT('...') */
export interface DdsKeyword {
  /** Keyword name, upper-cased, e.g. "DSPATR" */
  name: string;
  /** Raw parameter text inside the parentheses, unparsed, e.g. "HI" or "*ISO" */
  parameters: string;
  /** Conditioning indicators that apply to this specific keyword (if conditioned on its own line) */
  conditions: DdsCondition[];
  /** Full raw text as it appeared in source, e.g. "DSPATR(HI)" */
  raw: string;
  /** Source line numbers (1-based, into the original file) this keyword's text spanned */
  sourceLines: number[];
}

/** Location on the 5250 screen */
export interface DdsLocation {
  /** Absolute line number, or null if relative/inherited */
  line: number | null;
  /** Absolute column, or null if relative */
  column: number | null;
  /** If the column was specified as +n (relative to the previous field), the offset */
  relativeColumnOffset: number | null;
}

export interface DdsFieldBase {
  nameType: DdsNameType;
  /** Field name; empty string for constants */
  name: string;
  /** True if position 29 had 'R' (reference to a previously defined/database field) */
  isReference: boolean;
  /** Raw length text from positions 30-34 (could be blank, numeric, or +n/-n override) */
  lengthRaw: string | null;
  length: number | null;
  /** Position 35 raw character */
  dataType: string | null;
  /** Position 36-37 raw text (could be blank, numeric, or +n/-n override) */
  decimalPositionsRaw: string | null;
  decimalPositions: number | null;
  /** Position 38, defaults to 'O' if blank and this is a named field */
  usage: DdsUsage | null;
  location: DdsLocation;
  conditions: DdsCondition[];
  keywords: DdsKeyword[];
  /** For constants: the literal text (from DFT keyword, implicit quoted string, DATE/TIME/etc.) */
  constantValue: string | null;
  /** 1-based line number(s) in the original source this entry's positional part came from */
  sourceLine: number;
  /**
   * Every physical source line this entry's own positional/function-area text spans,
   * including continuation lines (e.g. a long quoted constant that wraps with a
   * trailing '+'). For an implicit bare-literal constant, that literal text is folded
   * into `constantValue` rather than kept as a keyword, so its continuation lines
   * would otherwise be invisible to line-range logic (getFieldLineRange in
   * dspfWriter.js) that only walks keywords[].sourceLines - always includes at least
   * `sourceLine` itself.
   */
  entrySourceLines: number[];
}

export interface DdsRecordFormat {
  name: string;
  conditions: DdsCondition[];
  /** Record-level keywords (e.g. SFL, SFLCTL, WINDOW, ALARM) */
  keywords: DdsKeyword[];
  /** Help-level entries attached to this record (position 17 = 'H') */
  helpEntries: DdsFieldBase[];
  fields: DdsFieldBase[];
  sourceLine: number;
}

export interface DdsParseError {
  line: number;
  message: string;
  raw: string;
}

export interface DspfFile {
  /** File-level keywords, e.g. DSPSIZ, REF, CA03, INDARA */
  fileKeywords: DdsKeyword[];
  records: DdsRecordFormat[];
  /** Full text of comment lines, preserved for round-tripping, keyed by line number */
  comments: { line: number; text: string }[];
  errors: DdsParseError[];
}
