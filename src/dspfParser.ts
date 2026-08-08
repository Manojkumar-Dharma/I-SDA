/**
 * dspfParser.ts
 *
 * Parses fixed-column DDS source for IBM i Display Files (DSPF) into the
 * structured model defined in dspfModel.ts.
 *
 * Column reference (IBM i 7.x "DDS for Display files"):
 *   1-5    Sequence number
 *   6      Form type ('A')
 *   7      Comment ('*') / AND-OR continuation ('A'/'O'/blank)
 *   8      NOT flag for indicator #1
 *   9-10   Indicator #1 number
 *   11     NOT flag for indicator #2
 *   12-13  Indicator #2 number
 *   14     NOT flag for indicator #3
 *   15-16  Indicator #3 number
 *   17     Name type: R=record, H=help, blank=field/constant
 *   18     Reserved
 *   19-28  Record/field name
 *   29     Reference ('R')
 *   30-34  Length
 *   35     Data type / keyboard shift
 *   36-37  Decimal positions
 *   38     Usage (O/I/B/H/M/P)
 *   39-41  Line
 *   42-44  Column (or +n relative offset)
 *   45-80  Keyword / constant text ("function area"), continues via +/- in col 80
 *
 * DDS has no free-format variant (unlike RPG), so this parser only needs to
 * handle the fixed-column layout above.
 */

import {
  DdsCondition,
  DdsFieldBase,
  DdsIndicator,
  DdsKeyword,
  DdsLocation,
  DdsNameType,
  DdsParseError,
  DdsRecordFormat,
  DdsUsage,
  DspfFile,
} from './dspfModel';

const LINE_WIDTH = 80;
const FUNCTION_AREA_START = 45; // 1-based

/** Extracts a 1-based inclusive column range from a line, padding with spaces as needed. */
function col(line: string, start: number, end: number): string {
  const padded = line.length < LINE_WIDTH ? line.padEnd(LINE_WIDTH, ' ') : line;
  return padded.substring(start - 1, end);
}

function isBlank(s: string): boolean {
  return s.trim().length === 0;
}

/** Parses positions 7-16 into a single DdsCondition (one AND-group). Returns null if no indicators present. */
function parseConditionGroup(line: string): DdsCondition | null {
  const relationChar = col(line, 7, 7);
  const relation: 'AND' | 'OR' = relationChar.toUpperCase() === 'O' ? 'OR' : 'AND';

  const slots: Array<[number, number, number]> = [
    [8, 9, 10],
    [11, 12, 13],
    [14, 15, 16],
  ];

  const indicators: DdsIndicator[] = [];
  for (const [notPos, startDigit, endDigit] of slots) {
    const notFlag = col(line, notPos, notPos).toUpperCase() === 'N';
    const number = col(line, startDigit, endDigit).trim();
    if (number.length > 0) {
      indicators.push({ number: number.padStart(2, '0'), not: notFlag });
    }
  }

  return indicators.length > 0 ? { relation, indicators } : null;
}

/** Parses a numeric-or-blank-or-signed-override positional field, e.g. length, decimal positions. */
function parseNumericField(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return null;
  // +n / -n override relative to a referenced field; keep as signed number.
  const parsed = parseInt(trimmed, 10);
  return Number.isNaN(parsed) ? null : parsed;
}

function parseUsage(raw: string): DdsUsage | null {
  const t = raw.trim().toUpperCase();
  if (t === '') return null;
  if (['O', 'I', 'B', 'H', 'M', 'P'].includes(t)) return t as DdsUsage;
  return null;
}

function parseLocation(line: string): DdsLocation {
  const lineRaw = col(line, 39, 41).trim();
  const colRaw = col(line, 42, 44).trim();

  const location: DdsLocation = { line: null, column: null, relativeColumnOffset: null };

  if (lineRaw.length > 0) {
    const n = parseInt(lineRaw, 10);
    if (!Number.isNaN(n)) location.line = n;
  }

  if (colRaw.length > 0) {
    if (colRaw.startsWith('+')) {
      const n = parseInt(colRaw.substring(1), 10);
      if (!Number.isNaN(n)) location.relativeColumnOffset = n;
    } else {
      const n = parseInt(colRaw, 10);
      if (!Number.isNaN(n)) location.column = n;
    }
  }

  return location;
}

/**
 * Splits accumulated function-area text (already continuation-joined) into individual
 * keyword tokens. Handles quoted strings (single quotes, doubled '' as escaped quote)
 * and nested/balanced parentheses so commas or spaces inside e.g. DSPATR(HI RI) or
 * TEXT('a (b) c') don't break tokenization.
 */
function tokenizeKeywords(text: string): string[] {
  const tokens: string[] = [];
  let i = 0;
  const n = text.length;

  while (i < n) {
    // Skip whitespace between tokens
    while (i < n && /\s/.test(text[i])) i++;
    if (i >= n) break;

    const start = i;
    let depth = 0;
    let inQuote = false;

    while (i < n) {
      const c = text[i];
      if (inQuote) {
        if (c === "'") {
          // doubled quote = escaped literal quote, not end of string
          if (text[i + 1] === "'") {
            i += 2;
            continue;
          }
          inQuote = false;
        }
        i++;
        continue;
      }
      if (c === "'") {
        inQuote = true;
        i++;
        continue;
      }
      if (c === '(') {
        depth++;
        i++;
        continue;
      }
      if (c === ')') {
        depth--;
        i++;
        continue;
      }
      if (/\s/.test(c) && depth === 0) {
        break;
      }
      i++;
    }

    tokens.push(text.substring(start, i).trim());
  }

  return tokens.filter((t) => t.length > 0);
}

/** Parses a single keyword token like DSPATR(HI RI) or TEXT('Hello') or ALARM into a DdsKeyword. */
function parseKeywordToken(token: string, sourceLines: number[]): DdsKeyword {
  const parenIndex = token.indexOf('(');
  if (parenIndex === -1) {
    return { name: token.toUpperCase(), parameters: '', conditions: [], raw: token, sourceLines };
  }
  const name = token.substring(0, parenIndex).toUpperCase();
  const closeIndex = token.lastIndexOf(')');
  const parameters = closeIndex > parenIndex ? token.substring(parenIndex + 1, closeIndex) : token.substring(parenIndex + 1);
  return { name, parameters: parameters.trim(), conditions: [], raw: token, sourceLines };
}

/** A "logical entry": one positional-entry line plus any continuation lines merged into its function area text. */
interface LogicalEntry {
  /** The line that carries the positional (cols 1-44) data */
  positionalLine: string;
  /** 1-based source line number of the positional line */
  sourceLine: number;
  /** Combined function-area (keyword/constant) text across all continuation lines */
  functionText: string;
  /** All source line numbers contributing function-area text (including the positional line) */
  functionSourceLines: number[];
}

/**
 * Pass 1: turns raw source lines into comments + logical entries, resolving
 * +/- continuation in the function area (positions 45-80).
 */
function buildLogicalEntries(lines: string[]): {
  entries: LogicalEntry[];
  comments: { line: number; text: string }[];
  errors: DdsParseError[];
} {
  const entries: LogicalEntry[] = [];
  const comments: { line: number; text: string }[] = [];
  const errors: DdsParseError[] = [];

  let current: LogicalEntry | null = null;
  let pendingContinuation = false; // true if previous function-area chunk ended in +/-
  let pendingJoiner: '' | ' ' = ''; // '' for '+', ' ' for '-'

  for (let idx = 0; idx < lines.length; idx++) {
    const rawLine = lines[idx];
    const sourceLine = idx + 1;
    const padded = rawLine.length < LINE_WIDTH ? rawLine.padEnd(LINE_WIDTH, ' ') : rawLine;

    const commentFlag = col(padded, 7, 7);
    const restBlank = isBlank(col(padded, 7, LINE_WIDTH));

    if (pendingContinuation) {
      // This line is expected to be a pure continuation: positions 7-44 must be blank.
      const positionalBlank = isBlank(col(padded, 7, 44));
      if (positionalBlank && current) {
        const chunk = col(padded, FUNCTION_AREA_START, LINE_WIDTH);
        const endsWithContinuation = chunk.length > 0 && (chunk.trimEnd().endsWith('+') || chunk.trimEnd().endsWith('-'));
        const trimmedChunk = chunk.replace(/[+-]\s*$/, '');
        current.functionText += pendingJoiner + trimmedChunk;
        current.functionSourceLines.push(sourceLine);

        if (endsWithContinuation) {
          pendingJoiner = chunk.trimEnd().endsWith('+') ? '' : ' ';
          continue; // still pending
        } else {
          pendingContinuation = false;
          continue;
        }
      } else {
        // Malformed continuation (positions 7-44 not blank) - stop treating as continuation
        // and fall through to normal processing below.
        pendingContinuation = false;
      }
    }

    if (commentFlag === '*') {
      comments.push({ line: sourceLine, text: col(padded, 8, LINE_WIDTH).trimEnd() });
      continue;
    }
    if (restBlank) {
      comments.push({ line: sourceLine, text: '' });
      continue;
    }

    // New logical entry
    const funcChunk = col(padded, FUNCTION_AREA_START, LINE_WIDTH);
    const endsWithContinuation = funcChunk.length > 0 && (funcChunk.trimEnd().endsWith('+') || funcChunk.trimEnd().endsWith('-'));
    const trimmedChunk = funcChunk.replace(/[+-]\s*$/, '');

    current = {
      positionalLine: padded,
      sourceLine,
      functionText: trimmedChunk,
      functionSourceLines: [sourceLine],
    };
    entries.push(current);

    if (endsWithContinuation) {
      pendingContinuation = true;
      pendingJoiner = funcChunk.trimEnd().endsWith('+') ? '' : ' ';
    }
  }

  if (pendingContinuation) {
    errors.push({ line: lines.length, message: 'Source ends with an unresolved keyword continuation (+/-).', raw: '' });
  }

  return { entries, comments, errors };
}

/** Parses the function-area text of a logical entry into individual DdsKeyword objects. */
function parseKeywords(entry: LogicalEntry): DdsKeyword[] {
  const tokens = tokenizeKeywords(entry.functionText);
  return tokens.map((t) => parseKeywordToken(t, entry.functionSourceLines));
}

function nameTypeFor(entry: LogicalEntry): DdsNameType {
  const typeChar = col(entry.positionalLine, 17, 17).toUpperCase();
  if (typeChar === 'R') return 'RECORD';
  if (typeChar === 'H') return 'HELP';
  const name = col(entry.positionalLine, 19, 28).trim();
  return name.length > 0 ? 'FIELD' : 'CONSTANT';
}

/**
 * Determines whether a bare (non-parenthesized) token is the implicit-DFT literal for a
 * constant, e.g. the token `'Constant'` produced by tokenizing `9  2'Constant'`.
 */
function isBareLiteralToken(token: string): boolean {
  return token.startsWith("'") && token.endsWith("'") && token.length >= 2;
}

function buildFieldBase(entry: LogicalEntry, nameType: DdsNameType, conditions: DdsCondition[]): DdsFieldBase {
  const name = col(entry.positionalLine, 19, 28).trim();
  const isReference = col(entry.positionalLine, 29, 29).trim().toUpperCase() === 'R';
  const lengthRaw = col(entry.positionalLine, 30, 34);
  const dataTypeRaw = col(entry.positionalLine, 35, 35);
  const decimalRaw = col(entry.positionalLine, 36, 37);
  const usageRaw = col(entry.positionalLine, 38, 38);
  const location = parseLocation(entry.positionalLine);
  let keywords = parseKeywords(entry);

  let constantValue: string | null = null;
  if (nameType === 'CONSTANT') {
    // Implicit DFT: a bare quoted string with no keyword name, e.g. 9 2'Constant'
    const implicitMatch = entry.functionText.trim().match(/^'((?:[^']|'')*)'/);
    if (implicitMatch) {
      constantValue = implicitMatch[1].replace(/''/g, "'");
      // Don't let the bare literal also show up as a pseudo-keyword.
      keywords = keywords.filter((k) => !isBareLiteralToken(k.raw));
    } else {
      const dft = keywords.find((k) => k.name === 'DFT');
      if (dft) {
        const m = dft.parameters.match(/^'((?:[^']|'')*)'/);
        constantValue = m ? m[1].replace(/''/g, "'") : dft.parameters;
      }
    }
  }

  return {
    nameType,
    name,
    isReference,
    lengthRaw: isBlank(lengthRaw) ? null : lengthRaw.trim(),
    length: parseNumericField(lengthRaw),
    dataType: isBlank(dataTypeRaw) ? null : dataTypeRaw,
    decimalPositionsRaw: isBlank(decimalRaw) ? null : decimalRaw.trim(),
    decimalPositions: parseNumericField(decimalRaw),
    usage: nameType === 'FIELD' ? parseUsage(usageRaw) || 'O' : null,
    location,
    conditions,
    keywords,
    constantValue,
    sourceLine: entry.sourceLine,
  };
}

/**
 * Main entry point: parses full DDS source text for a display file into a DspfFile model.
 */
export function parseDspf(source: string): DspfFile {
  const lines = source.split(/\r\n|\r|\n/);
  const { entries, comments, errors } = buildLogicalEntries(lines);

  const fileKeywords: DdsKeyword[] = [];
  const records: DdsRecordFormat[] = [];

  let currentRecord: DdsRecordFormat | null = null;
  // Tracks the most recently defined field/constant/help entry within the current record, so
  // that "keyword-only" conditioned lines (no name, no location) attach to it rather than the record.
  let currentField: DdsFieldBase | null = null;

  // Conditioning indicators accumulate across lines: a line whose position 7 is blank/'A'
  // continues (adds indicators to) the current AND-group; a line with 'O' starts a new
  // AND-group that is OR'd with the previous one(s). The accumulated group list is only
  // "consumed" (attached) once a line with actual content (a name, a location, or keyword
  // text) is reached - which may be the very same line that carries the last indicators.
  let pendingConditions: DdsCondition[] = [];

  const accumulateConditions = (entry: LogicalEntry): void => {
    const group = parseConditionGroup(entry.positionalLine);
    if (!group) return;
    if (group.relation === 'AND' && pendingConditions.length > 0) {
      pendingConditions[pendingConditions.length - 1].indicators.push(...group.indicators);
    } else {
      pendingConditions.push({ relation: pendingConditions.length === 0 ? 'AND' : group.relation, indicators: group.indicators });
    }
  };

  const consumeConditions = (): DdsCondition[] => {
    const result = pendingConditions;
    pendingConditions = [];
    return result;
  };

  for (const entry of entries) {
    accumulateConditions(entry);
    const nameType = nameTypeFor(entry);

    if (nameType === 'RECORD') {
      const name = col(entry.positionalLine, 19, 28).trim();
      currentRecord = {
        name,
        conditions: consumeConditions(),
        keywords: parseKeywords(entry),
        helpEntries: [],
        fields: [],
        sourceLine: entry.sourceLine,
      };
      records.push(currentRecord);
      currentField = null;
      continue;
    }

    if (nameType === 'HELP') {
      const field = buildFieldBase(entry, 'HELP', consumeConditions());
      if (currentRecord) {
        currentRecord.helpEntries.push(field);
        currentField = field;
      } else {
        errors.push({ line: entry.sourceLine, message: 'HELP entry found before any record format.', raw: entry.positionalLine });
      }
      continue;
    }

    if (nameType === 'FIELD') {
      const field = buildFieldBase(entry, 'FIELD', consumeConditions());
      if (currentRecord) {
        currentRecord.fields.push(field);
        currentField = field;
      } else {
        errors.push({ line: entry.sourceLine, message: 'Field found before any record format.', raw: entry.positionalLine });
      }
      continue;
    }

    // CONSTANT or keyword-only conditioned line
    const location = parseLocation(entry.positionalLine);
    const hasLocation = location.line !== null || location.column !== null || location.relativeColumnOffset !== null;

    if (hasLocation) {
      // A genuine constant field.
      const field = buildFieldBase(entry, 'CONSTANT', consumeConditions());
      if (currentRecord) {
        currentRecord.fields.push(field);
        currentField = field;
      } else {
        fileKeywords.push(...parseKeywords(entry)); // defensive: shouldn't normally occur at file level
      }
      continue;
    }

    if (entry.functionText.trim().length === 0) {
      // Pure indicator-continuation line: nothing to attach yet, keep accumulating.
      continue;
    }

    // No name, no location, but has keyword text => this line conditions keyword(s) for
    // the current context (the most recently defined field/help entry, the current record,
    // or the file itself).
    const conditions = consumeConditions();
    const keywords = parseKeywords(entry);
    if (conditions.length > 0) {
      keywords.forEach((k) => k.conditions.push(...conditions));
    }

    if (currentField) {
      currentField.keywords.push(...keywords);
    } else if (currentRecord) {
      currentRecord.keywords.push(...keywords);
    } else {
      fileKeywords.push(...keywords);
    }
  }

  return { fileKeywords, records, comments, errors };
}
