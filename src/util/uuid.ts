export type UUID = string;

// http://www.ietf.org/rfc/rfc4122.txt
export function uuid(): UUID {
  return 'xxxxxxxx-xxxx-4xxxy-xxxx-xxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}
