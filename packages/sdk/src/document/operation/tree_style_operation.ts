/*
 * Copyright 2023 The Yorkie Authors. All rights reserved.
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

import { TimeTicket } from '@yorkie-js/sdk/src/document/time/ticket';
import { VersionVector } from '@yorkie-js/sdk/src/document/time/version_vector';
import { CRDTRoot } from '@yorkie-js/sdk/src/document/crdt/root';
import {
  CRDTTree,
  CRDTTreeNode,
  CRDTTreeNodeID,
  CRDTTreePos,
  TreeChange,
  TreeStyleReverse,
} from '@yorkie-js/sdk/src/document/crdt/tree';
import {
  Operation,
  OpInfo,
  ExecutionResult,
  OpSource,
} from '@yorkie-js/sdk/src/document/operation/operation';
import { GCPair } from '@yorkie-js/sdk/src/document/crdt/gc';
import { Code, YorkieError } from '@yorkie-js/sdk/src/util/error';
import { addDataSizes } from '@yorkie-js/sdk/src/util/resource';

/**
 * `TreeStyleOperation` represents an operation that modifies the style of the
 * node in the Tree.
 */
export class TreeStyleOperation extends Operation {
  private fromPos: CRDTTreePos;
  private toPos: CRDTTreePos;
  private attributes: Map<string, string>;
  private attributesToRemove: Array<string>;

  constructor(
    parentCreatedAt: TimeTicket,
    fromPos: CRDTTreePos,
    toPos: CRDTTreePos,
    attributes: Map<string, string>,
    attributesToRemove: Array<string>,
    executedAt: TimeTicket,
  ) {
    super(parentCreatedAt, executedAt);
    this.fromPos = fromPos;
    this.toPos = toPos;
    this.attributes = attributes;
    this.attributesToRemove = attributesToRemove;
  }

  /**
   * `create` creates a new instance of TreeStyleOperation.
   */
  public static create(
    parentCreatedAt: TimeTicket,
    fromPos: CRDTTreePos,
    toPos: CRDTTreePos,
    attributes: Map<string, string>,
    executedAt: TimeTicket,
  ): TreeStyleOperation {
    return new TreeStyleOperation(
      parentCreatedAt,
      fromPos,
      toPos,
      attributes,
      [],
      executedAt,
    );
  }

  /**
   * `createTreeRemoveStyleOperation` creates a new instance of TreeStyleOperation for style deletion.
   */
  public static createTreeRemoveStyleOperation(
    parentCreatedAt: TimeTicket,
    fromPos: CRDTTreePos,
    toPos: CRDTTreePos,
    attributesToRemove: Array<string>,
    executedAt: TimeTicket,
  ): TreeStyleOperation {
    return new TreeStyleOperation(
      parentCreatedAt,
      fromPos,
      toPos,
      new Map(),
      attributesToRemove,
      executedAt,
    );
  }

  /**
   * `execute` executes this operation on the given `CRDTRoot`.
   */
  public execute(
    root: CRDTRoot,
    _: OpSource,
    versionVector: VersionVector,
  ): ExecutionResult {
    const parentObject = root.findByCreatedAt(this.getParentCreatedAt());
    if (!parentObject) {
      throw new YorkieError(
        Code.ErrInvalidArgument,
        `fail to find ${this.getParentCreatedAt()}`,
      );
    }
    if (!(parentObject instanceof CRDTTree)) {
      throw new YorkieError(
        Code.ErrInvalidArgument,
        `fail to execute, only Tree can execute edit`,
      );
    }
    const tree = parentObject as CRDTTree;
    // An operation that carries both halves -- the reverse of a style that
    // overwrote some attributes and added others -- runs each of them, so
    // neither excludes the other, and accumulates across the two.
    const allPairs: Array<GCPair> = [];
    const allChanges: Array<{ change: TreeChange; isRemove: boolean }> = [];
    const allSize = { live: { data: 0, meta: 0 }, gc: { data: 0, meta: 0 } };

    // What each styled node held before this operation, merged across the two
    // halves and kept per node: the nodes in one range can hold different
    // previous values, and one reverse built from one of them would stamp
    // that node's values onto all the others.
    const reverses = new Map<
      CRDTTreeNode,
      { prevAttributes: Map<string, string>; newAttrKeys: Array<string> }
    >();
    const merge = (records: Array<TreeStyleReverse>) => {
      for (const { node, prevAttributes, newAttrKeys } of records) {
        let entry = reverses.get(node);
        if (!entry) {
          entry = { prevAttributes: new Map(), newAttrKeys: [] };
          reverses.set(node, entry);
        }
        // The remove half runs first, so it is the one that saw the original
        // value of a key both halves touch; the set half must not overwrite it.
        for (const [key, value] of prevAttributes) {
          if (!entry.prevAttributes.has(key)) {
            entry.prevAttributes.set(key, value);
          }
        }
        for (const key of newAttrKeys) {
          if (!entry.newAttrKeys.includes(key)) {
            entry.newAttrKeys.push(key);
          }
        }
      }
    };

    // 01. Handle attributesToRemove (remove style attributes)
    // An operation that carries neither half still runs this one, with nothing
    // to remove: `removeStyle` splits the text at the range's ends through
    // `styleTargets`, and `json/tree.ts` has already done that to the clone
    // for the same call. Skipping it here would leave the clone holding nodes
    // the root does not have.
    if (this.attributesToRemove.length > 0 || this.attributes.size === 0) {
      const [pairs, changes, size, records] = tree.removeStyle(
        [this.fromPos, this.toPos],
        this.attributesToRemove,
        this.getExecutedAt(),
        versionVector,
      );

      addDataSizes(allSize.live, size.live);
      addDataSizes(allSize.gc, size.gc);
      allPairs.push(...pairs);
      allChanges.push(...changes.map((change) => ({ change, isRemove: true })));
      merge(records);
    }

    // 02. Handle attributes (set style attributes)
    if (this.attributes.size > 0) {
      const attributes: { [key: string]: any } = {};
      [...this.attributes].forEach(([key, value]) => (attributes[key] = value));

      const [pairs, changes, size, records] = tree.style(
        [this.fromPos, this.toPos],
        attributes,
        this.getExecutedAt(),
        versionVector,
      );

      addDataSizes(allSize.live, size.live);
      addDataSizes(allSize.gc, size.gc);
      allPairs.push(...pairs);
      allChanges.push(
        ...changes.map((change) => ({ change, isRemove: false })),
      );
      merge(records);
    }

    root.acc(allSize.live);
    root.accGC(allSize.gc);

    for (const pair of allPairs) {
      root.registerGCPair(pair);
    }

    // A key the remove half took off and the set half put back has a previous
    // value to restore, so it is not one of the keys the reverse drops.
    for (const entry of reverses.values()) {
      entry.newAttrKeys = entry.newAttrKeys.filter(
        (key) => !entry.prevAttributes.has(key),
      );
    }

    return {
      reverseOps: this.buildReverseOps(tree, reverses),
      opInfos: allChanges.map(
        ({ change: { from, to, value, fromPath, toPath }, isRemove }) => {
          return {
            type: 'tree-style',
            from,
            to,
            value: isRemove
              ? { attributesToRemove: value }
              : { attributes: value },
            fromPath,
            toPath,
            path: root.createPath(this.getParentCreatedAt()),
          } as OpInfo;
        },
      ),
    };
  }

  /**
   * `buildReverseOps` turns what each styled node held before this operation
   * into the operations that put it back.
   *
   * Each reverse is split in two -- the keys to drop, then the values to
   * restore -- rather than one operation carrying both halves. Both halves
   * survive either way, but two single-purpose operations are the shape every
   * released SDK and the server already decode, and they take separate
   * tickets, so a key that appears in both halves is dropped and then set
   * again instead of losing the set to RHT's same-ticket rule.
   *
   * The whole styled range is reversed by one pair of operations as long as
   * every target held the same thing. When the targets differ, each gets its
   * own pair over its own range, because one range-wide reverse can only
   * carry one set of values.
   */
  private buildReverseOps(
    tree: CRDTTree,
    reverses: Map<
      CRDTTreeNode,
      { prevAttributes: Map<string, string>; newAttrKeys: Array<string> }
    >,
  ): Array<Operation> | undefined {
    const entries = [...reverses.entries()];
    if (!entries.length) {
      return undefined;
    }

    const opsFor = (
      from: CRDTTreePos,
      to: CRDTTreePos,
      entry: {
        prevAttributes: Map<string, string>;
        newAttrKeys: Array<string>;
      },
    ): Array<Operation> => {
      const ops: Array<Operation> = [];
      if (entry.newAttrKeys.length > 0) {
        ops.push(
          TreeStyleOperation.createTreeRemoveStyleOperation(
            this.getParentCreatedAt(),
            from,
            to,
            entry.newAttrKeys,
            undefined!,
          ),
        );
      }
      if (entry.prevAttributes.size > 0) {
        ops.push(
          TreeStyleOperation.create(
            this.getParentCreatedAt(),
            from,
            to,
            entry.prevAttributes,
            undefined!,
          ),
        );
      }
      return ops;
    };

    const signature = (entry: {
      prevAttributes: Map<string, string>;
      newAttrKeys: Array<string>;
    }) =>
      JSON.stringify([
        [...entry.prevAttributes].sort(),
        [...entry.newAttrKeys].sort(),
      ]);
    const uniform = entries.every(
      ([, entry]) => signature(entry) === signature(entries[0][1]),
    );

    const ops: Array<Operation> = [];
    if (uniform) {
      ops.push(...opsFor(this.fromPos, this.toPos, entries[0][1]));
    } else {
      for (const [node, entry] of entries) {
        if (!entry.prevAttributes.size && !entry.newAttrKeys.length) {
          continue;
        }
        // A target detached from the document has no range that reaches it
        // alone, and no place in the rendered document to restore either.
        const range = tree.posRangeOfNode(node);
        if (!range) {
          continue;
        }
        ops.push(...opsFor(range[0], range[1], entry));
      }
    }

    return ops.length ? ops : undefined;
  }

  /**
   * `getEffectedCreatedAt` returns the creation time of the effected element.
   */
  public getEffectedCreatedAt(): TimeTicket {
    return this.getParentCreatedAt();
  }

  /**
   * `toTestString` returns a string containing the meta data.
   */
  public toTestString(): string {
    const parent = this.getParentCreatedAt().toTestString();
    const fromPos = `${this.fromPos
      .getLeftSiblingID()
      .getCreatedAt()
      .toTestString()}:${this.fromPos.getLeftSiblingID().getOffset()}`;
    const toPos = `${this.toPos
      .getLeftSiblingID()
      .getCreatedAt()
      .toTestString()}:${this.toPos.getLeftSiblingID().getOffset()}`;

    return `${parent}.STYLE(${fromPos},${toPos},${Object.entries(
      this.attributes || {},
    )
      .map(([k, v]) => `${k}:"${v}"`)
      .join(' ')})`;
  }

  /**
   * `reconcileNodeID` points this operation at `curr` wherever it named
   * `prev`. An undo or redo that re-splits an element mints the element under
   * a new id; an operation that was recorded against the old one would
   * otherwise address a node that may no longer exist.
   */
  public reconcileNodeID(prev: CRDTTreeNodeID, curr: CRDTTreeNodeID): void {
    this.fromPos = this.fromPos.replaceNodeID(prev, curr);
    this.toPos = this.toPos.replaceNodeID(prev, curr);
  }

  /**
   * `getFromPos` returns the start point of the editing range.
   */
  public getFromPos(): CRDTTreePos {
    return this.fromPos;
  }

  /**
   * `getToPos` returns the end point of the editing range.
   */
  public getToPos(): CRDTTreePos {
    return this.toPos;
  }

  /**
   * `getAttributes` returns the attributes of Style.
   */
  public getAttributes(): Map<string, string> {
    return this.attributes;
  }

  /**
   * `getAttributesToRemove` returns the attributes of Style to remove.
   */
  public getAttributesToRemove(): Array<string> {
    return this.attributesToRemove;
  }
}
