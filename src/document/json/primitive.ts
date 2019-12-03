import { TimeTicket } from '../time/ticket';
import { JSONElement } from './element';

export class JSONPrimitive extends JSONElement {
  private value: string;

  constructor(value: string, createdAt: TimeTicket) {
    super(createdAt);
    this.value = value;
  }

  public static create(value: string, createdAt: TimeTicket): JSONPrimitive {
    return new JSONPrimitive(value, createdAt);
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
}
