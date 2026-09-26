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

import {
  TimeTicket,
  TimeTicketSize,
} from '@yorkie-js/sdk/src/document/time/ticket';
import { escapeString } from '@yorkie-js/sdk/src/document/json/strings';
import { GCChild } from '@yorkie-js/sdk/src/document/crdt/gc';
import { DataSize, utf8Length } from '@yorkie-js/sdk/src/util/resource';

/**
 * `RHTNode` is a node of RHT(Replicated Hashtable).
 */
/**
 * `RHTWrite` is what an `RHT.set` reports back. See `RHT.set`.
 */
export type RHTWrite = {
  /**
   * `installed` is the node this write put in the map, absent when the write
   * lost LWW and changed nothing. Its size is what enters docSize.live.
   */
  installed?: RHTNode;

  /**
   * `revived` is a tombstone this write replaced. It was registered as garbage
   * when it was removed, so the caller re-registers the pair to cancel that
   * registration: it is no longer collectable, it is simply gone.
   */
  revived?: RHTNode;

  /**
   * `superseded` is a LIVE node this write replaced. RHT overrides immutably,
   * so the old node is dropped with no tombstone and nothing to collect, but
   * its bytes were counted in docSize.live and have to leave it.
   */
  superseded?: RHTNode;
};

/**
 * `RHTNode` is a node of RHT(Replicated Hashtable).
 */
/**
 * `logicalValue` returns the attribute value as a peer storing values raw
 * would hold it: a JSON-encoded string yields the string itself, anything else
 * yields the stored text unchanged. A value written by such a peer does not
 * parse at all and is already raw, so it passes straight through.
 */
function logicalValue(stored: string): string {
  try {
    const parsed = JSON.parse(stored);
    return typeof parsed === 'string' ? parsed : stored;
  } catch {
    return stored;
  }
}

/**
 * `valueSize` returns the `DataSize.data` bytes an attribute value of the
 * given stored form contributes, on the same terms as `RHTNode.getDataSize`.
 */
function valueSize(stored: string): number {
  return utf8Length(logicalValue(stored)) * 2;
}

/**
 * `RHTRemoval` is what an `RHT.remove` reports back.
 */
export type RHTRemoval = {
  /**
   * `gcNodes` are the tombstones this removal made collectable.
   */
  gcNodes: Array<RHTNode>;

  /**
   * `valueDropped` is the size of the value the removal stopped charging for,
   * which no node's `getDataSize` accounts for any more. The caller subtracts
   * it from whichever side of the ledger was holding it: `live` for an
   * attribute that was live on a live node, `gc` for one on a node that is
   * itself a tombstone. Zero when the attribute was already a tombstone, since
   * a tombstone's value was not being charged in the first place.
   */
  valueDropped: DataSize;
};

/**
 * `RHTNode` is a node of RHT(Replicated Hashtable).
 */
export class RHTNode implements GCChild {
  private key: string;
  private value: string;
  private updatedAt: TimeTicket;
  private _isRemoved: boolean;

  constructor(
    key: string,
    value: string,
    updatedAt: TimeTicket,
    isRemoved: boolean,
  ) {
    this.key = key;
    this.value = value;
    this.updatedAt = updatedAt;
    this._isRemoved = isRemoved;
  }

  /**
   * `of` creates a new instance of RHTNode.
   */
  public static of(
    key: string,
    value: string,
    createdAt: TimeTicket,
    isRemoved: boolean,
  ): RHTNode {
    return new RHTNode(key, value, createdAt, isRemoved);
  }

  /**
   * `getKey` returns a key of node.
   */
  public getKey(): string {
    return this.key;
  }

  /**
   * `getValue` returns a value of node.
   */
  public getValue(): string {
    return this.value;
  }

  /**
   * `getUpdatedAt` returns updated time of node.
   */
  public getUpdatedAt(): TimeTicket {
    return this.updatedAt;
  }

  /**
   * `isRemoved` returns whether the node has been removed or not.
   */
  public isRemoved(): boolean {
    return this._isRemoved;
  }

  /**
   * `toIDString` returns the IDString of this node.
   */
  public toIDString(): string {
    return `${this.updatedAt.toIDString()}:${this.key}`;
  }

  /**
   * `getRemovedAt` returns the time when this node was removed.
   */
  public getRemovedAt(): TimeTicket | undefined {
    if (this._isRemoved) {
      return this.updatedAt;
    }

    return undefined;
  }

  /**
   * `getDataSize` returns the size of this node.
   *
   * A tombstone charges its key only. The value it still carries is dead
   * weight: nothing reads it -- `has`, `toJSON` and `toObject` all gate on
   * `isRemoved` -- and charging it made the running `docSize` disagree with a
   * rebuild of the same document, which replays the same removals. The value
   * is left on the node rather than cleared so that what this SDK stores and
   * serializes for a tombstone is byte-for-byte what it was, and what a peer
   * sends us is kept verbatim: the convergence fix belongs in the accounting,
   * not in the wire format.
   */
  public getDataSize(): DataSize {
    // Charge the LOGICAL value in UTF-8 bytes, which is what the Go SDK
    // stores and charges.
    //
    // Two things diverged. This SDK JSON-encodes values, so `color="red"` is
    // stored as the five characters `"red"` where Go stores three. And
    // `.length` counts UTF-16 units where Go's `len()` counts UTF-8 bytes, so
    // the gap did not even have a consistent sign: measured, `color="red"`
    // made JS 4 bytes heavier and `color="빨강"` made it 4 bytes LIGHTER.
    // The document size limit is enforced client-side against each SDK's own
    // accounting, so the same document had a different allowance per SDK.
    //
    // Sizing the logical value converges both without touching what is
    // stored, what is sent, or how a value reads back -- storing strings raw
    // would converge too, but it makes a JS caller's string '1' read back as
    // the number 1.
    return {
      data:
        utf8Length(this.key) * 2 +
        (this._isRemoved ? 0 : valueSize(this.value)),
      meta: TimeTicketSize,
    };
  }
}

/**
 * RHT is replicated hash table by creation time.
 * For more details about RHT: @see http://csl.skku.edu/papers/jpdc11.pdf
 */
export class RHT {
  private nodeMapByKey: Map<string, RHTNode>;
  private numberOfRemovedElement: number;

  constructor() {
    this.nodeMapByKey = new Map();
    this.numberOfRemovedElement = 0;
  }

  /**
   * `create` creates a new instance of RHT.
   */
  public static create(): RHT {
    return new RHT();
  }

  /**
   * `getNodeMapByKey` returns the hashtable of RHT.
   */
  public getNodeMapByKey(): Map<string, RHTNode> {
    return this.nodeMapByKey;
  }

  /**
   * `set` sets the value of the given key.
   */
  /**
   * `RHTWrite` reports what a `set` did, so the caller can keep docSize honest
   * without inspecting the map afterwards. Reading the map cannot tell a write
   * that installed a node from one that lost LWW and left the incumbent in
   * place, and charging live for the latter makes the running size depend on
   * delivery order.
   */
  public set(key: string, value: string, executedAt: TimeTicket): RHTWrite {
    const prev = this.nodeMapByKey.get(key);

    if (prev !== undefined && !executedAt.after(prev.getUpdatedAt())) {
      return {};
    }

    if (prev !== undefined && prev.isRemoved()) {
      this.numberOfRemovedElement -= 1;
    }

    const installed = RHTNode.of(key, value, executedAt, false);
    this.nodeMapByKey.set(key, installed);

    if (prev === undefined) {
      return { installed };
    }
    if (prev.isRemoved()) {
      return { installed, revived: prev };
    }

    return { installed, superseded: prev };
  }

  /**
   * SetInternal sets the value of the given key internally.
   *
   * This is the route a snapshot and a `deepcopy` both take, and it keeps what
   * it is given verbatim, tombstones included: a peer's bytes are not this
   * SDK's to rewrite, and a tombstone's value costs nothing either way because
   * `RHTNode.getDataSize` does not charge it.
   */
  public setInternal(
    key: string,
    value: string,
    executedAt: TimeTicket,
    removed: boolean,
  ) {
    const node = RHTNode.of(key, value, executedAt, removed);
    this.nodeMapByKey.set(key, node);

    if (removed) {
      this.numberOfRemovedElement++;
    }
  }

  /**
   * `remove` removes the Element of the given key.
   *
   * The tombstone still STORES the value -- what goes on the wire is unchanged
   * -- but stops being CHARGED for it, because `RHTNode.getDataSize` skips a
   * removed node's value. `valueDropped` is what the caller has to take back
   * out of whichever side of the ledger was holding those bytes; see
   * `attrGCPair` for which side that is.
   */
  public remove(key: string, executedAt: TimeTicket): RHTRemoval {
    const prev = this.nodeMapByKey.get(key);

    const gcNodes: Array<RHTNode> = [];
    const valueDropped: DataSize = { data: 0, meta: 0 };
    if (prev === undefined || executedAt.after(prev.getUpdatedAt())) {
      if (prev === undefined) {
        this.numberOfRemovedElement += 1;
        const node = RHTNode.of(key, '', executedAt, true);
        this.nodeMapByKey.set(key, node);

        gcNodes.push(node);
        return { gcNodes, valueDropped };
      }

      const alreadyRemoved = prev.isRemoved();
      if (!alreadyRemoved) {
        this.numberOfRemovedElement += 1;
        valueDropped.data = valueSize(prev.getValue());
      }

      if (alreadyRemoved) {
        gcNodes.push(prev);
      }

      const node = RHTNode.of(key, prev.getValue(), executedAt, true);
      this.nodeMapByKey.set(key, node);
      gcNodes.push(node);

      return { gcNodes, valueDropped };
    }

    return { gcNodes, valueDropped };
  }

  /**
   * `has` returns whether the element exists of the given key or not.
   */
  public has(key: string): boolean {
    if (this.nodeMapByKey.has(key)) {
      const node = this.nodeMapByKey.get(key);
      return node !== undefined && !node.isRemoved();
    }
    return false;
  }

  /**
   * `get` returns the value of the given key.
   */
  public get(key: string): string | undefined {
    if (!this.nodeMapByKey.has(key)) {
      return;
    }

    return this.nodeMapByKey.get(key)!.getValue();
  }

  /**
   * `deepcopy` copies itself deeply.
   */
  public deepcopy(): RHT {
    const rht = new RHT();
    for (const [, node] of this.nodeMapByKey) {
      rht.setInternal(
        node.getKey(),
        node.getValue(),
        node.getUpdatedAt(),
        node.isRemoved(),
      );
    }
    return rht;
  }

  /**
   * `toJSON` returns the JSON encoding of this hashtable.
   */
  public toJSON(): string {
    if (!this.size()) {
      return '{}';
    }

    const items = [];
    for (const [key, node] of this.nodeMapByKey) {
      if (!node.isRemoved()) {
        items.push(`"${escapeString(key)}":"${escapeString(node.getValue())}"`);
      }
    }
    return `{${items.join(',')}}`;
  }

  /**
   * `size` returns the size of RHT
   */
  public size(): number {
    return this.nodeMapByKey.size - this.numberOfRemovedElement;
  }

  /**
   * `toObject` returns the object of this hashtable.
   */
  public toObject(): Record<string, string> {
    const obj: Record<string, string> = {};
    for (const [key, node] of this.nodeMapByKey) {
      if (!node.isRemoved()) {
        obj[key] = node.getValue();
      }
    }

    return obj;
  }

  // eslint-disable-next-line jsdoc/require-jsdoc
  public *[Symbol.iterator](): IterableIterator<RHTNode> {
    for (const [, node] of this.nodeMapByKey) {
      yield node as RHTNode;
    }
  }

  /**
   * `purge` purges the given child node.
   */
  public purge(child: RHTNode) {
    const node = this.nodeMapByKey.get(child.getKey());
    if (node == undefined || node.toIDString() != child.toIDString()) {
      // TODO(hackerwins): Should we return an error when the child is not found?
      return;
    }

    this.nodeMapByKey.delete(child.getKey());
    this.numberOfRemovedElement--;
  }
}
