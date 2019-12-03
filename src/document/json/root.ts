import { InitialTimeTicket, TimeTicket } from '../time/ticket';
import { JSONElement } from './element';
import { JSONObject } from './object';

export class JSONRoot {
  private rootObject: JSONObject;
  private elementMapByCreatedAt: Map<string, JSONElement>;

  constructor() {
    this.rootObject = JSONObject.create(InitialTimeTicket);
    this.elementMapByCreatedAt = new Map();
    this.registerElement(this.rootObject);
  }

  public static create(): JSONRoot {
    return new JSONRoot();
  }

  public findByCreatedAt(createdAt: TimeTicket): JSONElement {
    return this.elementMapByCreatedAt.get(createdAt.toIDString());
  }

  public registerElement(element: JSONElement): void {
    this.elementMapByCreatedAt.set(element.getCreatedAt().toIDString(), element);
  }

  public getObject(): JSONObject {
    return this.rootObject;
  }

  public toJSON(): string {
    return this.rootObject.toJSON();
  }
}
