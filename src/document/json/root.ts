import { InitialTimeTicket, TimeTicket } from '../time/ticket';
import { JSONElement } from './element';
import { JSONObject } from './object';
import { PlainText } from './text';

/**
 * JSONRoot is a structure represents the root of JSON. It has a hash table of
 * all JSON elements to find a specific element when appling remote changes
 * received from agent.
 *
 * Every element has a unique time ticket at creation, which allows us to find
 * a particular element.
 */
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

  /**
   * findByCreatedAt returns the element of given creation time.
   */
  public findByCreatedAt(createdAt: TimeTicket): JSONElement {
    return this.elementMapByCreatedAt.get(createdAt.toIDString());
  }

  /**
   * registerElement registers the given element to hash table.
   */
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
