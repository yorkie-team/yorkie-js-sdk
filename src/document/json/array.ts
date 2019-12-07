import { logger } from '../../util/logger';
import { TimeTicket } from '../time/ticket';
import { JSONElement } from './element';
import { RGA } from './rga';

export class JSONArray extends JSONElement {
  private elements: RGA;

  constructor(createdAt: TimeTicket, elements: RGA) {
    super(createdAt);
    this.elements = elements;
  }

  public static create(createdAt: TimeTicket): JSONArray {
    return new JSONArray(createdAt, RGA.create());
  }

  public insertAfter(prevCreatedAt: TimeTicket, value: JSONElement): void {
    this.elements.insertAfter(prevCreatedAt, value);
  }

  public toJSON(): string {
    const json = []
    for (var v of this.elements.getElements()) {
      json.push(v.toJSON());
    }
    return `[${json.join(',')}]`;
  }

  public deepcopy(): JSONArray {
    const copy = JSONArray.create(this.getCreatedAt());
    for (var v of this.elements.getElements()) {
      copy.insertAfter(copy.getLastCreatedAt(), v.deepcopy());
    }
    return copy;
  }

  public getLastCreatedAt(): TimeTicket {
    return this.elements.getLastCreatedAt();
  }
}
