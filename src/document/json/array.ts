import { logger } from '../../util/logger';
import { TimeTicket } from '../time/ticket';
import { JSONElement } from './element';

export class JSONArray extends JSONElement {
  private elements: JSONElement[];

  constructor(createdAt: TimeTicket, elements: JSONElement[]) {
    super(createdAt);
    this.elements = elements;
  }

  public static create(createdAt: TimeTicket): JSONArray {
    return new JSONArray(createdAt, []);
  }

  public append(value: JSONElement): void {
    this.elements.push(value);
  }

  public toJSON(): string {
    const json = []
    for (var v of this.elements) {
      json.push(v.toJSON());
    }
    return `[${json.join(',')}]`;
  }

  public deepcopy(): JSONArray {
    const copy = JSONArray.create(this.getCreatedAt());
    for (var v of this.elements) {
      copy.append(v.deepcopy());
    }
    return copy;
  }
}
