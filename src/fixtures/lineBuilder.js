/**
 * Builds a single 80-column DDS source line by placing values at their exact
 * 1-based column positions. This avoids the classic hand-spacing mistakes
 * that fixed-column DDS is notorious for.
 */
function buildLine(spec) {
  const chars = new Array(80).fill(' ');
  const put = (startCol, text) => {
    text = String(text ?? '');
    for (let i = 0; i < text.length; i++) {
      const idx = startCol - 1 + i;
      if (idx < 80) chars[idx] = text[i];
    }
  };

  put(1, (spec.seq ?? '').padEnd(5, ' ').slice(0, 5));
  put(6, spec.form ?? 'A');
  if (spec.comment) {
    put(7, '*');
    put(8, spec.comment);
    return chars.join('').replace(/\s+$/, '');
  }
  put(7, spec.relation === 'OR' ? 'O' : ' ');
  const putIndicator = (notCol, digitCol, value) => {
    if (!value) return;
    if (value.startsWith('N')) {
      put(notCol, 'N');
      put(digitCol, value.slice(1));
    } else {
      put(digitCol, value);
    }
  };
  putIndicator(8, 9, spec.ind1); // e.g. "N01" -> N at 8, 01 at 9-10; "01" -> 01 at 9-10
  putIndicator(11, 12, spec.ind2);
  putIndicator(14, 15, spec.ind3);
  put(17, spec.nameType ?? ' '); // R / H / blank
  put(19, spec.name ?? '');
  put(29, spec.ref ?? '');
  put(30, (spec.length ?? '').toString().padStart(5, ' ').slice(-5));
  put(35, spec.dataType ?? '');
  put(36, (spec.decimals ?? '').toString().padStart(2, ' ').slice(-2));
  put(38, spec.usage ?? '');
  put(39, (spec.line ?? '').toString().padStart(3, ' ').slice(-3));
  put(42, (spec.col ?? '').toString().padStart(3, ' ').slice(-3));
  put(45, spec.func ?? '');

  return chars.join('').replace(/\s+$/, '');
}

module.exports = { buildLine };
