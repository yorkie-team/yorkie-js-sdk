const hex = '0123456789abcdef';

/**
 * `EscapeString` escapes string
 *
 */
export function escapeString(string: string): string {
  return ('' + string).replace(
    /["'\\\n\r\f\b\t\u2028\u2029]/g,
    function (character) {
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
          return `\\u00${hex[character.charCodeAt(0) >> 4]}${
            hex[character.charCodeAt(0) & 0xf]
          }`;
      }
    },
  );
}
