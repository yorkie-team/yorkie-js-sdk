import { TimeTicket } from '../time/ticket';
import { JSONElement } from './element';

/**
 * Primitive represents JSON primitive data type including logical lock.
 * This is immutable.
 */
export class JSONPrimitive extends JSONElement {
  private value: string;

  constructor(value: string, createdAt: TimeTicket) {
    super(createdAt);
    this.value = value;
  }

  public static of(value: string, createdAt: TimeTicket): JSONPrimitive {
    return new JSONPrimitive(value, createdAt);
  }

  public static valueFromBytes(bytes: Uint8Array): string {
    const encoded = String.fromCharCode.apply(null, bytes);
    return decodeURIComponent(escape(atob(encoded)));
  }

  public toJSON(): string {
    return `"${this.value}"`;
  }

  public deepcopy(): JSONPrimitive {
    // primitivie is immutable.
    return this;
  }

  public static isSupport(value: string): boolean {
    return typeof value === 'string';
  }

  public getValue(): string {
    return this.value;
  }

  public toBytes(): Uint8Array {
    const bytes = [];
    const value = btoa(unescape(encodeURIComponent(this.value)));
    for (const ch of value) {
        bytes.push(ch.charCodeAt(0));
    }
    return new Uint8Array(bytes);
  }
}
