import { TimeTicket } from '../time/ticket';
import { JSONElement } from './element';

class RHTNode {
  private key: string;
  private value: JSONElement;

  constructor(key: string, value: JSONElement) {
    this.key = key;
    this.value = value;
  }

  public static of(key: string, value: JSONElement): RHTNode {
    return new RHTNode(key, value);
  }

  public getKey(): string {
    return this.key;
  }

  public getValue(): JSONElement {
    return this.value;
  }
}

export class RHT {
  // TODO introduce priority queue
  private elementMapByKey: Map<string, JSONElement>
  private nodeMapByCreatedAt: Map<string, RHTNode>;

  constructor() {
    this.elementMapByKey = new Map();
    this.nodeMapByCreatedAt = new Map();
  }

  public static create(): RHT {
    return new RHT()
  }

  public set(key: string, value: JSONElement): void {
    const prev = this.elementMapByKey.get(key);
    if (!prev || value.getCreatedAt().after(prev.getCreatedAt())) {
      this.elementMapByKey.set(key, value)
      this.nodeMapByCreatedAt.set(value.getCreatedAt().toIDString(), RHTNode.of(key, value));
    }
  }

  public remove(createdAt: TimeTicket, executedAt: TimeTicket): JSONElement {
    const prev = this.nodeMapByCreatedAt.get(createdAt.toIDString());
    if (!prev || executedAt.after(prev.getValue().getCreatedAt())) {
      this.elementMapByKey.delete(prev.getKey());
      return prev.getValue();
    }

    return null;
  }

  public removeByKey(key: string): JSONElement {
    const value = this.elementMapByKey.get(key);
    this.elementMapByKey.delete(key)
    return value;
  }

  public get(key: string): JSONElement {
    return this.elementMapByKey.get(key);
  }

  public getMembers(): Map<string, JSONElement> {
    return this.elementMapByKey;
  }
}
