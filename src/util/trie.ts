/*
 * Copyright 2022 The Yorkie Authors. All rights reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/**
 * `TrieNode` is node of Trie.
 */
export class TrieNode<V extends number | string | symbol> {
  public value: V;
  public children: Record<V, TrieNode<V>>;
  public parent?: TrieNode<V>;
  public isTerminal: boolean;

  constructor(value: V, parent?: TrieNode<V>) {
    this.value = value;
    this.children = {} as Record<V, TrieNode<V>>;
    this.isTerminal = false;
    this.parent = parent;
  }

  /**
   * `getPath` returns the path from the Trie root to this node
   * @returns array of path from Trie root to this node
   */
  public getPath(): Array<V> {
    const path: Array<V> = [];
    let node: TrieNode<V> | undefined = this;
    while (node) {
      path.unshift(node.value);
      node = node.parent;
    }
    return path;
  }
}

/**
 * Trie is a type of k-ary search tree for locating specific values or common prefixes
 */
export class Trie<V extends number | string | symbol> {
  private root: TrieNode<V>;

  constructor(value: V) {
    this.root = new TrieNode<V>(value);
  }

  /**
   * `insert` inserts the value to the Trie
   * @param values - values array
   * @returns array of find result
   */
  public insert(values: Array<V>): void {
    let node = this.root;
    for (const value of values) {
      if (!node.children[value]) {
        node.children[value] = new TrieNode(value, node);
      }
      node = node.children[value];
    }
    node.isTerminal = true;
  }

  /**
   * `find` finds all words that have the prefix in the Trie
   * @param prefix - prefix array
   */
  public find(prefix: Array<V>): Array<Array<V>> {
    let node = this.root;
    const output: Array<Array<V>> = [];
    for (const value of prefix) {
      if (node.children[value]) {
        node = node.children[value];
      } else {
        return output;
      }
    }
    this.traverse(node, true, output);
    return output;
  }

  /**
   * `traverse` does a depth first to push necessary elements to the output
   * @param node - node to start the depth first search
   * @param isLeafIncluded - whether to travserse till the leaf or not
   * @param output - the output array
   */
  public traverse(
    node: TrieNode<V>,
    isLeafIncluded: boolean,
    output: Array<Array<V>>,
  ): void {
    if (node.isTerminal) {
      output.push(node.getPath());
      if (!isLeafIncluded) {
        return;
      }
    }
    for (const [, value] of Object.entries(node.children)) {
      this.traverse(value as TrieNode<V>, isLeafIncluded, output);
    }
  }

  /**
   * `findPrefixes` finds the prefixes added to the Trie
   * @returns array of prefixes
   */
  public findPrefixes(): Array<Array<V>> {
    const prefixes: Array<Array<V>> = [];
    for (const [, value] of Object.entries(this.root.children)) {
      const child = value as TrieNode<V>;
      this.traverse(child, false, prefixes);
    }
    return prefixes;
  }
}
