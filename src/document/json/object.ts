import { logger } from '../../util/logger';
import { TimeTicket } from '../time/ticket';
import { JSONContainer, JSONElement } from './element';
import { RHT, RHTNode } from './rht';
import { PlainText } from './text';

/**
 * JSONObject represents a JSON object, but unlike regular JSON, it has time
 * tickets which is created by logical clock.
 */
export class JSONObject extends JSONContainer {
  private memberNodes: RHT;

  constructor(createdAt: TimeTicket, memberNodes: RHT) {
    super(createdAt);
    this.memberNodes = memberNodes;
  }

  public static create(createdAt: TimeTicket): JSONObject {
    return new JSONObject(createdAt, RHT.create());
  }

  public getOrCreateText(key: string): PlainText {
    logger.fatal('unsupported: this method should be called by proxy');
    return null;
  }

  public getText(key: string): PlainText {
    logger.fatal('unsupported: this method should be called by proxy');
    return null;
  }

  public set(key: string, value: JSONElement): void {
    this.memberNodes.set(key, value);
  }

  public remove(createdAt: TimeTicket, executedAt: TimeTicket): JSONElement {
    return this.memberNodes.remove(createdAt, executedAt);
  }

  public removeByKey(key: string): JSONElement {
    return this.memberNodes.removeByKey(key);
  }

  public get(key: string): JSONElement {
    return this.memberNodes.get(key);
  }

  public has(key: string): boolean {
    return this.memberNodes.has(key);
  }

  public *[Symbol.iterator](): IterableIterator<[string, JSONElement]> {
    const keySet = new Set<string>();
    for (const node of this.memberNodes) {
      if (!keySet.has(node.getStrKey())) {
        keySet.add(node.getStrKey());
        if (!node.isRemoved()) {
          yield [node.getStrKey(), node.getValue()];
        }
      }
    }
  }

  public toJSON(): string {
    const json = []
    for (const [key, value] of this) {
      json.push(`"${key}":${value.toJSON()}`);
    }
    return `{${json.join(',')}}`;
  }

  public getMembers(): RHT {
    return this.memberNodes;
  }

  public deepcopy(): JSONObject {
    const clone = JSONObject.create(this.getCreatedAt());
    for (const node of this.memberNodes) {
      clone.memberNodes.set(
        node.getStrKey(),
        node.getValue().deepcopy(),
        node.isRemoved()
      );
    }
    return clone;
  }

  public *getDescendants(): IterableIterator<JSONElement> {
    for (const node of this.getMembers()) {
      const element = node.getValue();
      if (element instanceof JSONContainer) {
        for (const descendant of element.getDescendants()) {
          yield descendant;
        }
      } 

      yield element;
    }
  }
}
