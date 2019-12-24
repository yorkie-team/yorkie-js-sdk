import { HeapNode, Heap } from '../../util/heap';
import { TicketComparator, TimeTicket } from '../time/ticket';
import { JSONElement } from './element';

class RHTNode extends HeapNode<TimeTicket, JSONElement> {
  private strKey: string;
  private removed: boolean;

  constructor(strKey: string, value: JSONElement) {
    super(value.getCreatedAt(), value);
    this.strKey = strKey;
    this.removed = false;
  }

  public static of(strKey: string, value: JSONElement): RHTNode {
    return new RHTNode(strKey, value);
  }

  public isRemoved(): boolean {
    return this.removed;
  }

  public getStrKey(): string {
    return this.strKey;
  }

  public remove(): void {
    this.removed =true;
  }
}

/**
 * RHT is replicated hash table.
 */
export class RHT {
  private elementMapByKey: Map<string, Heap<TimeTicket, JSONElement>>;
  private nodeMapByCreatedAt: Map<string, RHTNode>;

  constructor() {
    this.elementMapByKey = new Map();
    this.nodeMapByCreatedAt = new Map();
  }

  public static create(): RHT {
    return new RHT()
  }

  public set(key: string, value: JSONElement): void {
    if (!this.elementMapByKey.has(key)) {
      this.elementMapByKey.set(key, new Heap(TicketComparator));
    }

    const node = RHTNode.of(key, value);
    this.elementMapByKey.get(key).push(node);
    this.nodeMapByCreatedAt.set(value.getCreatedAt().toIDString(), node);
  }

  public remove(createdAt: TimeTicket, executedAt: TimeTicket): JSONElement {
    if (!this.nodeMapByCreatedAt.has(createdAt.toIDString())) {
      return null;
    }

    this.nodeMapByCreatedAt.get(createdAt.toIDString()).remove();
  }

  public removeByKey(key: string): JSONElement {
    if (!this.elementMapByKey.has(key)) {
      return null;
    }

    const node = this.elementMapByKey.get(key).peek() as RHTNode;
    node.remove();
    return node.getValue();
  }

  public get(key: string): JSONElement {
    if (!this.elementMapByKey.has(key)) {
      return null;
    }

    const node = this.elementMapByKey.get(key).peek();
    if (!node) {
      return null;
    }

    return node.getValue();
  }

  public getMembers(): Map<string, JSONElement> {
    const members = new Map<string, JSONElement>();
    for (const [key, value] of this.elementMapByKey) {
      const node = value.peek() as RHTNode;
      if (node && !node.isRemoved()) {
        members.set(node.getStrKey(), node.getValue());
      }
    }

    return members;
  }
}
