/**
 * `EscapeString` escapes the given string.
 */
export function escapeString(str: string): string {
  return str.replace(/["'\\\n\r\f\b\t\u2028\u2029]/g, function (character) {
    switch (character) {
      case '"':
      case "'":
      case '\\':
        return '\\' + character;
      case '\n':
        return '\\n';
      case '\r':
        return '\\r';
      case '\f':
        return '\\f';
      case '\b':
        return '\\b';
      case '\t':
        return '\\t';
      case '\u2028':
        return '\\u2028';
      case '\u2029':
        return '\\u2029';
      default:
        return character;
    }
  });
}
