const hex = '0123456789abcdef';
/**
 * `EscapeString` escapes string
 *
 */
function EscapeString(s: string) {
  const buf = [];

  for (let i = 0; i < s.length; i++) {
    const charCode = s.charCodeAt(i);

    if (
      charCode >= 0x20 &&
      charCode !== '\\'.charCodeAt(0) &&
      charCode !== '"'.charCodeAt(0)
    ) {
      buf.push(charCode);
      continue;
    }
    switch (charCode) {
      case '\\'.charCodeAt(0):
      case '"'.charCodeAt(0):
        buf.push('\\'.charCodeAt(0));
        buf.push(charCode);
        break;
      case '\n'.charCodeAt(0):
        buf.push('\\'.charCodeAt(0));
        buf.push('n'.charCodeAt(0));
        break;
      case '\f'.charCodeAt(0):
        buf.push('\\'.charCodeAt(0));
        buf.push('f'.charCodeAt(0));
        break;
      case '\b'.charCodeAt(0):
        buf.push('\\'.charCodeAt(0));
        buf.push('b'.charCodeAt(0));
        break;
      case '\r'.charCodeAt(0):
        buf.push('\\'.charCodeAt(0));
        buf.push('z'.charCodeAt(0));
        break;
      case '\t'.charCodeAt(0):
        buf.push('\\'.charCodeAt(0));
        buf.push('t'.charCodeAt(0));
        break;
      default:
        buf.push(Number(`0x00${hex[charCode >> 4]}${hex[charCode & 0xf]}`));
    }
    continue;
  }
  return String.fromCharCode(...buf);
}
