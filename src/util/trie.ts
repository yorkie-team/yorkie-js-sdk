/*
 * Copyright 2020 The Yorkie Authors. All rights reserved.
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
export class TrieNode<V> {
  public key: V;
  public children: { [key: string]: TrieNode<V> };
  public parent?: TrieNode<V>;
  public isLeaf: boolean;
  public path: Array<V>;

  constructor(key: V, parent?: TrieNode<V>) {
    this.key = key;
    this.children = {};
    this.isLeaf = false;
    if (parent) {
      this.path = parent.path.concat(key);
    } else {
      this.path = [key];
    }
  }
}

/**
 * Trie is a type of k-ary search tree for locating specific keys or common prefixes
 */
export class Trie<V> {
  private root: TrieNode<V>;

  constructor(key: V) {
    this.root = new TrieNode<V>(key);
  }

  /**
   * `insert` inserts the key to the Trie
   * @param keys - keys array
   * @returns Array of find result
   */
  public insert(keys: Array<V>): void {
    let node = this.root;
    for (const key of keys) {
      if (!node.children[String(key)]) {
        node.children[String(key)] = new TrieNode(key, node);
      }
      node = node.children[String(key)];
    }
    node.isLeaf = true;
  }

  /**
   * `find` finds all words that have the prefix in the Trie
   * @param prefix - prefix array
   */
  public find(prefix: Array<V>): Array<Array<V>> {
    let node = this.root;
    const output: Array<Array<V>> = [];
    for (const key of prefix) {
      if (node.children[String(key)]) {
        node = node.children[String(key)];
      } else {
        return output;
      }
    }
    this.traverseFind(node, output);
    return output;
  }

  /**
   * `traverseFind` is a recursive function for find method. See also {@link find}
   * @param node - node of the Trie
   * @param output - output of the find result
   */
  private traverseFind(node: TrieNode<V>, output: Array<Array<V>>): void {
    if (node.isLeaf) {
      output.unshift(node.path);
    }
    for (const key in node.children) {
      this.traverseFind(node.children[key], output);
    }
  }

  /**
   * `findPrefixes` finds prefixes if any prefix has been added already
   * @returns Array of Prefixes
   */
  public findPrefixes(): Array<Array<V>> {
    const prefixes: Array<Array<V>> = [];
    this.traverseFindPrefixes(this.root, prefixes);
    return prefixes;
  }

  /**
   * `traverseFindPrefixes` is a recursive function for findPrefixes method. See also {@link findPrefixes}
   * @param node - node of the Trie
   * @param output - output of the find prefixes result
   */
  private traverseFindPrefixes(
    node: TrieNode<V>,
    output: Array<Array<V>>,
  ): void {
    for (const key in node.children) {
      const child = node.children[key];
      if (child.isLeaf) {
        output.push(child.path);
      } else {
        this.traverseFindPrefixes(child, output);
      }
    }
  }
}
