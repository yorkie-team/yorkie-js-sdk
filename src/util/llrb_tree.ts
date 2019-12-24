import { Comparator, DefaultComparator } from './comparator';

interface Entry<K, V> {
  key: K;
  value: V;
}

class LLRBNode<K, V> {
  public key: K;
  public value: V;
  public parent: LLRBNode<K, V>;
  public left: LLRBNode<K, V>;
  public right: LLRBNode<K, V>;
  public isRed: boolean;

  constructor(key: K, value: V, isRed: boolean) {
    this.key = key;
    this.value = value;
    this.isRed = isRed;
    this.left;
    this.right;
  }
}

export class SortedMapIterator<K, V> {
  public stack: Array<Entry<K, V>>;

  constructor(root: LLRBNode<K, V>) {
    this.stack = [];
    this.traverseInorder(root);
  }

  // TODO: Replace with iterative approach, if we encounter performance problem.
  private traverseInorder(node: LLRBNode<K, V>): void {
    if (!node) {
      return;
    }

    this.traverseInorder(node.left);
    this.stack.push({
      key: node.key,
      value: node.value
    });
    this.traverseInorder(node.right);
  }
}

/**
 * LLRBTree is an implementation of Left-learning Red-Black Tree.
 *
 * Original paper on Left-leaning Red-Black Trees:
 * - http://www.cs.princeton.edu/~rs/talks/LLRB/LLRB.pdf
 *
 * Invariant 1: No red node has a red child
 * Invariant 2: Every leaf path has the same number of black nodes
 * Invariant 3: Only the left child can be red (left leaning)
 */
export class LLRBTree<K, V> {
  private root: LLRBNode<K, V>;
  private comparator: Comparator<K>;
  private counter: number;

  constructor(comparator?: Comparator<K>) {
    this.root = null;
    this.comparator = typeof comparator !== 'undefined' ? comparator : DefaultComparator;
    this.counter = 0;
  }

  public put(key: K, value: V): V {
    this.root = this.putInternal(this.root, key, value);
    this.root.isRed = false;
    return value;
  }

  public get(key: K): V {
    const node = this.getInternal(this.root, key);
    return node ? node.value : null;
  }

  public remove(key: K): void {
    if (!this.isRed(this.root.left) && !this.isRed(this.root.right)) {
      this.root.isRed = true;
    }

    this.root = this.removeInternal(this.root, key);
    if (this.root) {
      this.root.isRed = false;
    }
  }

  public getIterator(): SortedMapIterator<K, V> {
    return new SortedMapIterator(this.root);
  }

  public values(): Array<V> {
    const values = [];
    for (const entry of this.getIterator().stack) {
      values.push(entry.value);
    }
    return values;
  }

  public floorEntry(key: K): Entry<K, V> {
    let node = this.root;
    while (node) {
      const compare = this.comparator(key, node.key);
      if (compare > 0) {
        if (node.right) {
          node.right.parent = node;
          node = node.right;
        } else {
          return node;
        }
      } else if (compare < 0) {
        if (node.left) {
          node.left.parent = node;
          node = node.left;
        } else {
          let parent = node.parent;
          let childNode = node;
          while (parent && childNode === parent.left) {
            childNode = parent;
            parent = parent.parent;
          }
          return parent;
        }
      } else {
        return node;
      }
    }
    return null;
  }

  public lastEntry(): Entry<K, V> {
    if (!this.root) {
      return this.root;
    }

    let node = this.root;
    while (node.right) {
      node = node.right;
    }
    return node;
  }

  public size(): number {
    return this.counter;
  }

  public isEmpty(): boolean {
    return this.counter === 0;
  }

  private getInternal(node: LLRBNode<K, V>, key: K): LLRBNode<K, V> {
    while (node) {
      const compare = this.comparator(key, node.key);
      if (compare === 0) {
        return node;
      } else if (compare < 0) {
        node = node.left;
      } else if (compare > 0) {
        node = node.right;
      }
    }

    return null;
  }

  private putInternal(node: LLRBNode<K, V>, key: K, value: V): LLRBNode<K, V> {
    if (!node) {
      this.counter += 1;
      return new LLRBNode(key, value, true);
    }

    const compare = this.comparator(key, node.key);
    if (compare < 0) {
      node.left = this.putInternal(node.left, key, value);
    } else if (compare > 0) {
      node.right = this.putInternal(node.right, key, value);
    } else {
      node.value = value;
    }

    if (this.isRed(node.right) && !this.isRed(node.left)) {
      node = this.rotateLeft(node);
    }

    if (this.isRed(node.left) && this.isRed(node.left.left)) {
      node = this.rotateRight(node);
    }

    if (this.isRed(node.left) && this.isRed(node.right)) {
      this.flipColors(node);
    }

    return node;
  }

  private removeInternal(node: LLRBNode<K, V>, key: K): LLRBNode<K, V> {
    if (this.comparator(key, node.key) < 0) {
      if (!this.isRed(node.left) && !this.isRed(node.left.left)) {
        node = this.moveRedLeft(node);
      }
      node.left = this.removeInternal(node.left, key);
    } else {
      if (this.isRed(node.left)) {
        node = this.rotateRight(node);
      }

      if (this.comparator(key, node.key) === 0 && !node.right) {
        this.counter -= 1;
        return null;
      }

      if (!this.isRed(node.right) && !this.isRed(node.right.left)) {
        node = this.moveRedRight(node);
      }

      if (this.comparator(key, node.key) === 0) {
        this.counter -= 1;
        const smallest = this.min(node.right);
        node.value = smallest.value;
        node.key = smallest.key;
        node.right = this.removeMin(node.right);
      } else {
        node.right = this.removeInternal(node.right, key);
      }
    }

    return this.fixUp(node);
  }

  private min(node: LLRBNode<K, V>): LLRBNode<K, V> {
    if (!node.left) {
      return node;
    } else {
      return this.min(node.left);
    }
  }

  private removeMin(node: LLRBNode<K, V>): LLRBNode<K, V> {
    if (!node.left) {
      return null;
    }

    if (!this.isRed(node.left) && !this.isRed(node.left.left)) {
      node = this.moveRedLeft(node);
    }

    node.left = this.removeMin(node.left);
    return this.fixUp(node);
  }

  private fixUp(node: LLRBNode<K, V>): LLRBNode<K, V> {
    if (this.isRed(node.right)) {
      node = this.rotateLeft(node);
    }

    if (this.isRed(node.left) && this.isRed(node.left.left)) {
      node = this.rotateRight(node);
    }

    if (this.isRed(node.left) && this.isRed(node.right)) {
      this.flipColors(node);
    }

    return node;
  }

  private moveRedLeft(node: LLRBNode<K, V>): LLRBNode<K, V> {
    this.flipColors(node);
    if (this.isRed(node.right.left)) {
      node.right = this.rotateRight(node.right);
      node = this.rotateLeft(node);
      this.flipColors(node);
    }
    return node;
  }

  private moveRedRight(node: LLRBNode<K, V>): LLRBNode<K, V> {
    this.flipColors(node);
    if (this.isRed(node.left.left)) {
      node = this.rotateRight(node);
      this.flipColors(node);
    }
    return node;
  }

  private isRed(node: LLRBNode<K, V>): boolean {
    return node && node.isRed;
  }

  private rotateLeft(node: LLRBNode<K, V>): LLRBNode<K, V> {
    const x = node.right;
    node.right = x.left;
    x.left = node;
    x.isRed = x.left.isRed;
    x.left.isRed = true;
    return x;
  }

  private rotateRight(node: LLRBNode<K, V>): LLRBNode<K, V> {
    const x = node.left;
    node.left = x.right;
    x.right = node;
    x.isRed = x.right.isRed;
    x.right.isRed = true;
    return x;
  }

  private flipColors(node: LLRBNode<K, V>): void {
    node.isRed = !node.isRed;
    node.left.isRed = !node.left.isRed;
    node.right.isRed = !node.right.isRed;
  }
}
