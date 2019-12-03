import { logger } from '../../util/logger';
import { TimeTicket } from '../time/ticket';
import { JSONElement } from './element';

export class JSONObject extends JSONElement {
  private members: Map<string, JSONElement>;

  constructor(createdAt: TimeTicket, members: Map<string, JSONElement>) {
    super(createdAt);
    this.members = members;
  }

  public static create(createdAt: TimeTicket): JSONObject {
    return new JSONObject(createdAt, new Map());
  }

  public set(key: string, value: JSONElement): void {
    this.members.set(key, value);
  }

  public get(key: string): JSONElement {
    return this.members.get(key);
  }

  public toJSON(): string {
    const json = []
    for (var [k, v] of this.members) {
      json.push(`"${k}":${v.toJSON()}`);
    }
    return `{${json.join(',')}}`;
  }

  public deepcopy(): JSONObject {
    const copy = JSONObject.create(this.getCreatedAt());
    for (var [k, v] of this.members) {
      copy.set(k, v.deepcopy());
    }
    return copy;
  }
}
