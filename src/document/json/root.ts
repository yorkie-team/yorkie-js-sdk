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

  constructor(rootObject: JSONObject) {
    this.rootObject = rootObject;
    this.elementMapByCreatedAt = new Map();

    this.registerElement(this.rootObject);
    for (const elem of this.getDescendants()) {
      this.registerElement(elem);
    }
  }

  public static create(): JSONRoot {
    return new JSONRoot(JSONObject.create(InitialTimeTicket));
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

  public *getDescendants(): IterableIterator<JSONElement> {
    for (const node of this.rootObject.getMembers()) {
      const element = node.getValue();
      yield element;
    }
  }

  public getElementMapSize(): number {
    return this.elementMapByCreatedAt.size;
  }

  public getObject(): JSONObject {
    return this.rootObject;
  }

  public deepcopy(): JSONRoot {
    return new JSONRoot(this.rootObject.deepcopy());
  }

  public toJSON(): string {
    return this.rootObject.toJSON();
  }
}
