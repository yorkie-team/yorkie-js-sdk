import { Comparator, DefaultComparator } from './comparator';

export class HeapNode<K, V> {
  private key: K;
  private value: V;

  constructor(key: K, value: V) {
    this.key = key;
    this.value = value;
  }

  public getKey(): K {
    return this.key;
  }

  public getValue(): V {
    return this.value;
  }
}

export class Heap<K, V> {
  private nodes: HeapNode<K, V>[];
  private comparator: Comparator<K>;

  constructor(comparator?: Comparator<K>) {
    this.comparator = comparator || DefaultComparator;
    this.nodes = [];
  }

  public peek(): HeapNode<K, V> {
    if (!this.nodes.length) {
      return null;
    }

    return this.nodes[0];
  }

  public push(node: HeapNode<K, V>): void {
    this.nodes.push(node);
    this.moveUp(this.nodes.length - 1);
  }

  public pop(): HeapNode<K, V> {
    const count = this.nodes.length;
    const head = this.nodes[0];
    if (count <= 0) {
      return undefined;
    } else if (count == 1) {
      // clear array
      this.nodes.length = 0;
    } else {
      this.nodes[0] = this.nodes.pop();
      this.moveDown(0);
    }

    return head;
  }

  private moveUp(index: number) {
    const node = this.nodes[index];

    while (index > 0) {
      const parentIndex = this.getParentIndex(index);
      if (this.comparator(this.nodes[parentIndex].getKey(), node.getKey()) < 0) {
        this.nodes[index] = this.nodes[parentIndex];
        index = parentIndex;
      } else {
        break;
      }
    }
    this.nodes[index] = node;
  }

  private moveDown(index: number): void {
    const count = this.nodes.length;

    const node = this.nodes[index];
    while (index < (count >> 1)) {
      const leftChildIndex = this.getLeftChildIndex(index);
      const rightChildIndex = this.getRightChildIndex(index);

      const smallerChildIndex = rightChildIndex < count &&
        this.comparator(this.nodes[leftChildIndex].getKey(), this.nodes[rightChildIndex].getKey()) < 0 ?
        rightChildIndex : leftChildIndex;

      if (this.comparator(this.nodes[smallerChildIndex].getKey(), node.getKey()) < 0) {
        break;
      }

      this.nodes[index] = this.nodes[smallerChildIndex];
      index = smallerChildIndex;
    }
    this.nodes[index] = node;
  }

  private getParentIndex(index: number): number {
    return (index - 1) >> 1;
  }

  private getLeftChildIndex(index: number): number {
    return index * 2 + 1;
  }

  private getRightChildIndex(index: number): number {
    return index * 2 + 2;
  }
}
