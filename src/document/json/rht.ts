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
  private elementQueueMapByKey: Map<string, Heap<TimeTicket, JSONElement>>;
  private nodeMapByCreatedAt: Map<string, RHTNode>;

  constructor() {
    this.elementQueueMapByKey = new Map();
    this.nodeMapByCreatedAt = new Map();
  }

  public static create(): RHT {
    return new RHT()
  }

  public set(key: string, value: JSONElement): void {
    if (!this.elementQueueMapByKey.has(key)) {
      this.elementQueueMapByKey.set(key, new Heap(TicketComparator));
    }

    const node = RHTNode.of(key, value);
    this.elementQueueMapByKey.get(key).push(node);
    this.nodeMapByCreatedAt.set(value.getCreatedAt().toIDString(), node);
  }

  public remove(createdAt: TimeTicket, executedAt: TimeTicket): JSONElement {
    if (!this.nodeMapByCreatedAt.has(createdAt.toIDString())) {
      return null;
    }

    this.nodeMapByCreatedAt.get(createdAt.toIDString()).remove();
  }

  public removeByKey(key: string): JSONElement {
    if (!this.elementQueueMapByKey.has(key)) {
      return null;
    }

    const node = this.elementQueueMapByKey.get(key).peek() as RHTNode;
    node.remove();
    return node.getValue();
  }

  public has(key: string): boolean {
    if (!this.elementQueueMapByKey.has(key)) {
      return false;
    }

    const node = this.elementQueueMapByKey.get(key).peek() as RHTNode;
    return !node.isRemoved();
  }

  public get(key: string): JSONElement {
    if (!this.elementQueueMapByKey.has(key)) {
      return null;
    }

    return this.elementQueueMapByKey.get(key).peek().getValue();
  }

  public *[Symbol.iterator](): IterableIterator<[string, JSONElement]> {
    for (const [key, value] of this.elementQueueMapByKey) {
      const node = value.peek() as RHTNode;
      if (node && !node.isRemoved()) {
        yield [node.getStrKey(), node.getValue()];
      }
    }
  }
}
