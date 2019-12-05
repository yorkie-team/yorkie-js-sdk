import { logger } from '../../util/logger';
import { TimeTicket } from '../time/ticket';
import { JSONElement } from './element';
import { RHT } from './rht';

export class JSONObject extends JSONElement {
  private members: RHT;
  private elementMapByCreatedAt: Map<string, JSONElement>;

  constructor(createdAt: TimeTicket, members: RHT) {
    super(createdAt);
    this.members = members;
  }

  public static create(createdAt: TimeTicket): JSONObject {
    return new JSONObject(createdAt, RHT.create());
  }

  public set(key: string, value: JSONElement): void {
    this.members.set(key, value);
  }

  public get(key: string): JSONElement {
    return this.members.get(key);
  }

  public toJSON(): string {
    const json = []
    for (var [k, v] of this.members.getMembers()) {
      json.push(`"${k}":${v.toJSON()}`);
    }
    return `{${json.join(',')}}`;
  }

  public deepcopy(): JSONObject {
    const copy = JSONObject.create(this.getCreatedAt());
    for (var [k, v] of this.members.getMembers()) {
      copy.set(k, v.deepcopy());
    }
    return copy;
  }
}
