# Changelog

All notable changes to the I-SDA extension are documented here.
Format loosely follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

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
