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
  MaxLamport,
  TimeTicket,
} from '@yorkie-js/sdk/src/document/time/ticket';
import { VersionVector } from '@yorkie-js/sdk/src/document/time/version_vector';
import { Indexable } from '@yorkie-js/sdk/src/document/document';
import { RHT, RHTNode, RHTWrite } from '@yorkie-js/sdk/src/document/crdt/rht';
import { CRDTElement } from '@yorkie-js/sdk/src/document/crdt/element';
import {
  RGATreeSplit,
  RGATreeSplitNode,
  RGATreeSplitNodeID,
  RGATreeSplitPos,
  RGATreeSplitPosRange,
  RestoreSpan,
  ValueChange,
} from '@yorkie-js/sdk/src/document/crdt/rga_tree_split';
import { escapeString } from '@yorkie-js/sdk/src/document/json/strings';
import {
  parseAttrValue,
  parseObjectValues,
} from '@yorkie-js/sdk/src/util/object';
import type * as Devtools from '@yorkie-js/sdk/src/devtools/types';
import { GCChild, GCPair } from '@yorkie-js/sdk/src/document/crdt/gc';
import {
  accAttrWrite,
  attrGCPair,
} from '@yorkie-js/sdk/src/document/crdt/tree';
import { SplayTree } from '@yorkie-js/sdk/src/util/splay_tree';
import { LLRBTree } from '@yorkie-js/sdk/src/util/llrb_tree';
import { DataSize, addDataSizes } from '@yorkie-js/sdk/src/util/resource';

/**
 * `TextChangeType` is the type of TextChange.
 *
 */
enum TextChangeType {
  Content = 'content',
  Style = 'style',
}

/**
 * `TextValueType` is a value of Text
 * which has a attributes that expresses the text style.
 */
export interface TextValueType<A> {
  attributes?: A;
  content?: string;
}

/**
 * `TextChange` represents the changes to the text
 * when executing the edit, setstyle methods.
 */
interface TextChange<A = Indexable> extends ValueChange<TextValueType<A>> {
  type: TextChangeType;
}

/**
 * `CRDTTextValue` is a value of Text
 * which has a attributes that expresses the text style.
 * Attributes are represented by RHT.
 *
 */
export class CRDTTextValue {
  private attributes: RHT;
  private content: string;

  constructor(content: string) {
    this.attributes = RHT.create();
    this.content = content;
  }

  /**
   * `create` creates a instance of CRDTTextValue.
   */
  public static create(content: string): CRDTTextValue {
    return new CRDTTextValue(content);
  }

  /**
   * `length` returns the length of value.
   */
  public get length(): number {
    return this.content.length;
  }

  /**
   * `substring` returns a sub-string value of the given range.
   */
  public substring(indexStart: number, indexEnd: number): CRDTTextValue {
    const value = new CRDTTextValue(
      this.content.substring(indexStart, indexEnd),
    );
    value.attributes = this.attributes.deepcopy();
    return value;
  }

  /**
   * `truncate` shortens this value in place, keeping the object identity so
   * that GC pairs registered against it are not orphaned. See
   * `RGATreeSplitValue.truncate`.
   */
  public truncate(offset: number): void {
    this.content = this.content.substring(0, offset);
  }

  /**
   * `setAttr` sets attribute of the given key, updated time and value.
   */
  public setAttr(
    key: string,
    content: string,
    updatedAt: TimeTicket,
  ): RHTWrite {
    return this.attributes.set(key, content, updatedAt);
  }

  /**
   * `getAttr` returns the attributes of this value.
   */
  public getAttrs(): RHT {
    return this.attributes;
  }

  /**
   * `toString` returns the string representation of this value.
   */
  public toString(): string {
    return this.content;
  }

  /**
   * `getDataSize` returns the data usage of this value.
   */
  public getDataSize(): DataSize {
    const dataSize = { data: 0, meta: 0 };
    dataSize.data += this.content.length * 2;

    for (const node of this.attributes) {
      // A removed attribute belongs to docSize.gc, not to live.
      // `CRDTTreeNode.getDataSize` makes the same exclusion; the two halves
      // have to answer this the same way or a document's size stops being a
      // function of its content.
      if (node.isRemoved()) {
        continue;
      }

      const size = node.getDataSize();
      dataSize.meta += size.meta;
      dataSize.data += size.data;
    }

    return dataSize;
  }

  /**
   * `toJSON` returns the JSON encoding of this value.
   */
  public toJSON(): string {
    const content = escapeString(this.content);
    const attrsObj = this.attributes.toObject();
    const attrs = [];
    for (const [key, v] of Object.entries(attrsObj)) {
      // See `parseAttrValue`: a peer that stores values raw writes ones this
      // cannot parse, and rendering must not throw on them.
      const value = parseAttrValue(v);
      const item =
        typeof value === 'string'
          ? `"${escapeString(key)}":"${escapeString(value)}"`
          : `"${escapeString(key)}":${String(value)}`;
      attrs.push(item);
    }
    attrs.sort();
    if (attrs.length === 0) {
      return `{"val":"${content}"}`;
    }
    return `{"attrs":{${attrs.join(',')}},"val":"${content}"}`;
  }

  /**
   * `getAttributes` returns the attributes of this value.
   */
  public getAttributes(): Record<string, string> {
    return this.attributes.toObject();
  }

  /**
   * `getContent` returns the internal content.
   */
  public getContent(): string {
    return this.content;
  }

  /**
   * `purge` purges the given child node.
   */
  public purge(node: GCChild): void {
    if (this.attributes && node instanceof RHTNode) {
      this.attributes.purge(node);
    }
  }

  /**
   * `getGCPairs` returns the pairs of GC.
   */
  /**
   * `getRemovedAttrs` reports the tombstoned attributes this value holds,
   * which a split has just duplicated from its source. The copy is new garbage
   * under a new parent with no registration of its own -- the original's pair
   * names the original's parent -- so without this it could never be
   * collected.
   */
  public getRemovedAttrs(): Array<RHTNode> {
    const removed: Array<RHTNode> = [];
    for (const node of this.attributes) {
      if (node.getRemovedAt()) {
        removed.push(node);
      }
    }

    return removed;
  }

  /**
   * `getGCPairs` returns the pairs of GC.
   */
  public getGCPairs(): Array<GCPair> {
    const pairs = [];

    for (const node of this.attributes) {
      if (node.getRemovedAt()) {
        // `getDataSize` skips removed attributes, so a tombstoned attribute
        // is not part of the live size this root was built with. Registering
        // it without `gcOnlySize` would debit live for bytes it never held.
        pairs.push({
          parent: this,
          child: node,
          gcOnlySize: node.getDataSize(),
        });
      }
    }

    return pairs;
  }
}

/**
 *  `CRDTText` is a custom CRDT data type to represent the contents of text editors.
 *
 */
export class CRDTText<A extends Indexable = Indexable> extends CRDTElement {
  private rgaTreeSplit: RGATreeSplit<CRDTTextValue>;

  constructor(
    rgaTreeSplit: RGATreeSplit<CRDTTextValue>,
    createdAt: TimeTicket,
  ) {
    super(createdAt);
    this.rgaTreeSplit = rgaTreeSplit;
  }

  /**
   * `create` a instance of Text.
   */
  public static create<A extends Indexable>(
    rgaTreeSplit: RGATreeSplit<CRDTTextValue>,
    createdAt: TimeTicket,
  ): CRDTText<A> {
    return new CRDTText<A>(rgaTreeSplit, createdAt);
  }

  /**
   * `edit` edits the given range with the given value and attributes.
   */
  public edit(
    range: RGATreeSplitPosRange,
    content: string,
    editedAt: TimeTicket,
    attributes?: Record<string, string>,
    versionVector?: VersionVector,
  ): [
    Array<TextChange<A>>,
    Array<GCPair>,
    DataSize,
    RGATreeSplitPosRange,
    Array<CRDTTextValue>,
    Array<RestoreSpan<CRDTTextValue>>,
  ] {
    const crdtTextValue = content ? CRDTTextValue.create(content) : undefined;
    if (crdtTextValue && attributes) {
      for (const [k, v] of Object.entries(attributes)) {
        crdtTextValue.setAttr(k, v, editedAt);
      }
    }

    const [caretPos, pairs, diff, valueChanges, removedValues, removedSpans] =
      this.rgaTreeSplit.edit(range, editedAt, crdtTextValue, versionVector);

    const changes: Array<TextChange<A>> = valueChanges.map((change) => ({
      ...change,
      value: change.value
        ? {
            attributes: parseObjectValues<A>(change.value.getAttributes()),
            content: change.value.getContent(),
          }
        : {
            attributes: undefined,
            content: '',
          },
      type: TextChangeType.Content,
    }));

    return [
      changes,
      pairs,
      diff,
      [caretPos, caretPos],
      removedValues,
      removedSpans,
    ];
  }

  /**
   * `restore` re-establishes removed characters under their original
   * identities (identity-preserving undo of a deletion).
   */
  public restore(
    spans: Array<RestoreSpan<CRDTTextValue>>,
    executedAt: TimeTicket,
    fallbackAnchor?: RGATreeSplitPos,
  ): [
    Array<RGATreeSplitNode<CRDTTextValue>>,
    Array<RGATreeSplitNode<CRDTTextValue>>,
    Array<TextChange<A>>,
    DataSize,
    Array<GCPair>,
  ] {
    const [untombstoned, recreated, valueChanges, liveDiff, pendingGCPairs] =
      this.rgaTreeSplit.restore(spans, executedAt, fallbackAnchor);
    return [
      untombstoned,
      recreated,
      this.toTextChanges(valueChanges),
      liveDiff,
      pendingGCPairs,
    ];
  }

  /**
   * `retombstone` re-deletes previously restored characters (redo).
   */
  public retombstone(
    spans: Array<RestoreSpan<CRDTTextValue>>,
    executedAt: TimeTicket,
  ): [Array<GCPair>, Array<TextChange<A>>, DataSize] {
    const [pairs, valueChanges, diff] = this.rgaTreeSplit.retombstone(
      spans,
      executedAt,
    );
    return [pairs, this.toTextChanges(valueChanges), diff];
  }

  /**
   * `toTextChanges` wraps raw RGATreeSplit value changes into `TextChange`s,
   * mirroring the mapping used by `edit`.
   */
  private toTextChanges(
    valueChanges: Array<ValueChange<CRDTTextValue>>,
  ): Array<TextChange<A>> {
    return valueChanges.map((change) => ({
      ...change,
      value: change.value
        ? {
            attributes: parseObjectValues<A>(change.value.getAttributes()),
            content: change.value.getContent(),
          }
        : {
            attributes: undefined,
            content: '',
          },
      type: TextChangeType.Content,
    }));
  }

  /**
   * `setStyle` applies the style of the given range.
   * 01. split nodes with from and to
   * 02. style nodes between from and to
   *
   * @param range - range of RGATreeSplitNode
   * @param attributes - style attributes
   * @param editedAt - edited time
   */
  public setStyle(
    range: RGATreeSplitPosRange,
    attributes: Record<string, string>,
    editedAt: TimeTicket,
    versionVector?: VersionVector,
  ): [
    Array<GCPair>,
    DataSize,
    Array<TextChange<A>>,
    Map<string, string>,
    Array<string>,
  ] {
    const diff = { data: 0, meta: 0 };

    // 01. split nodes with from and to
    const [, diffTo, toRight] = this.rgaTreeSplit.findNodeWithSplit(
      range[1],
      editedAt,
    );
    const [, diffFrom, fromRight] = this.rgaTreeSplit.findNodeWithSplit(
      range[0],
      editedAt,
    );

    addDataSizes(diff, diffTo, diffFrom);

    // 02. style nodes between from and to
    const changes: Array<TextChange<A>> = [];
    const nodes = this.rgaTreeSplit.findBetween(fromRight, toRight);
    const toBeStyleds: Array<RGATreeSplitNode<CRDTTextValue>> = [];

    for (const node of nodes) {
      const actorID = node.getCreatedAt().getActorID();
      let clientLamportAtChange = MaxLamport; // Local edit
      if (versionVector != undefined) {
        clientLamportAtChange = versionVector!.get(actorID)
          ? versionVector!.get(actorID)!
          : 0n;
      }

      if (node.canStyle(editedAt, clientLamportAtChange)) {
        toBeStyleds.push(node);
      }
    }

    // Capture previous attribute values from the first styled node for reverse op
    const prevAttributes = new Map<string, string>();
    const attributesToRemove: Array<string> = [];
    let capturedPrev = false;

    const pairs: Array<GCPair> = [];
    for (const node of toBeStyleds) {
      if (node.isRemoved()) {
        continue;
      }

      if (!capturedPrev) {
        for (const key of Object.keys(attributes)) {
          const attrs = node.getValue().getAttrs();
          if (attrs.has(key)) {
            prevAttributes.set(key, attrs.get(key)!);
          } else {
            attributesToRemove.push(key);
          }
        }
        capturedPrev = true;
      }

      const [fromIdx, toIdx] = this.rgaTreeSplit.findIndexesFromRange(
        node.createPosRange(),
      );
      changes.push({
        type: TextChangeType.Style,
        actor: editedAt.getActorID(),
        from: fromIdx,
        to: toIdx,
        value: {
          attributes: parseObjectValues(attributes) as A,
        },
      });

      for (const [key, value] of Object.entries(attributes)) {
        accAttrWrite(
          node.getValue().setAttr(key, value, editedAt),
          node.getValue(),
          pairs,
          diff,
        );
      }
    }

    pairs.push(...this.rgaTreeSplit.drainPendingGCPairs());

    return [pairs, diff, changes, prevAttributes, attributesToRemove];
  }

  /**
   * `removeStyle` removes the style attributes of the given range.
   * Returns previous attribute values (from first styled node) for reverse operation.
   */
  public removeStyle(
    range: RGATreeSplitPosRange,
    attributesToRemove: Array<string>,
    editedAt: TimeTicket,
    versionVector?: VersionVector,
  ): [Array<GCPair>, DataSize, Array<TextChange<A>>, Map<string, string>] {
    const diff = { data: 0, meta: 0 };

    // 01. split nodes with from and to
    const [, diffTo, toRight] = this.rgaTreeSplit.findNodeWithSplit(
      range[1],
      editedAt,
    );
    const [, diffFrom, fromRight] = this.rgaTreeSplit.findNodeWithSplit(
      range[0],
      editedAt,
    );

    addDataSizes(diff, diffTo, diffFrom);

    // 02. find nodes to remove style from
    const changes: Array<TextChange<A>> = [];
    const nodes = this.rgaTreeSplit.findBetween(fromRight, toRight);
    const toBeStyleds: Array<RGATreeSplitNode<CRDTTextValue>> = [];

    for (const node of nodes) {
      const actorID = node.getCreatedAt().getActorID();
      let clientLamportAtChange = MaxLamport;
      if (versionVector != undefined) {
        clientLamportAtChange = versionVector!.get(actorID)
          ? versionVector!.get(actorID)!
          : 0n;
      }

      if (node.canStyle(editedAt, clientLamportAtChange)) {
        toBeStyleds.push(node);
      }
    }

    // Capture previous attribute values from the first styled node for reverse op
    const prevAttributes = new Map<string, string>();
    let capturedPrev = false;

    const pairs: Array<GCPair> = [];
    for (const node of toBeStyleds) {
      if (node.isRemoved()) {
        continue;
      }

      if (!capturedPrev) {
        for (const key of attributesToRemove) {
          const attrs = node.getValue().getAttrs();
          if (attrs.has(key)) {
            prevAttributes.set(key, attrs.get(key)!);
          }
        }
        capturedPrev = true;
      }

      const [fromIdx, toIdx] = this.rgaTreeSplit.findIndexesFromRange(
        node.createPosRange(),
      );

      const removedAttributes: Record<string, any> = {};
      for (const key of attributesToRemove) {
        removedAttributes[key] = null; // null signals attribute removal to editors (e.g., Quill)
      }
      changes.push({
        type: TextChangeType.Style,
        actor: editedAt.getActorID(),
        from: fromIdx,
        to: toIdx,
        value: {
          attributes: removedAttributes as A,
        },
      });

      for (const key of attributesToRemove) {
        // The loop above skips removed nodes, so every node reaching here is
        // live and the only question is whether the ATTRIBUTE was. The Go
        // implementation has no such skip -- `canStyle` alone admits
        // tombstoned nodes there -- and so needs a third case this does not.
        //
        // That difference is a convergence divergence in its own right: on
        // the same history the restored text ends up styled here and unstyled
        // on the server. It is tracked separately; do not close the gap by
        // adding the third case back on this side, because the question is
        // which SDK is right about styling a tombstoned node at all.
        let attrWasLive = node.getValue().getAttrs().has(key);
        for (const rhtNode of node
          .getValue()
          .getAttrs()
          .remove(key, editedAt)) {
          pairs.push(attrGCPair(node.getValue(), rhtNode, attrWasLive));
          // Only the node that replaces the live value settles the live
          // value's bytes; a second one in the same call is the tombstone it
          // superseded, which was never in live.
          attrWasLive = false;
        }
      }
    }

    pairs.push(...this.rgaTreeSplit.drainPendingGCPairs());

    return [pairs, diff, changes, prevAttributes];
  }

  /**
   * `indexRangeToPosRange` returns the position range of the given index range.
   */
  public indexRangeToPosRange(
    fromIdx: number,
    toIdx: number,
  ): RGATreeSplitPosRange {
    const fromPos = this.rgaTreeSplit.indexToPos(fromIdx);
    if (fromIdx === toIdx) {
      return [fromPos, fromPos];
    }

    return [fromPos, this.rgaTreeSplit.indexToPos(toIdx)];
  }

  /**
   * `length` returns size of RGATreeList.
   */
  public get length(): number {
    return this.rgaTreeSplit.length;
  }

  /**
   * `getTreeByIndex` returns the tree by index for debugging.
   */
  public getTreeByIndex(): SplayTree<CRDTTextValue> {
    return this.rgaTreeSplit.getTreeByIndex();
  }

  /**
   * `getTreeByID` returns the tree by ID for debugging.
   */
  public getTreeByID(): LLRBTree<
    RGATreeSplitNodeID,
    RGATreeSplitNode<CRDTTextValue>
  > {
    return this.rgaTreeSplit.getTreeByID();
  }

  /**
   * `refinePos` refines the given RGATreeSplitPos.
   */
  public refinePos(pos: RGATreeSplitPos): RGATreeSplitPos {
    return this.rgaTreeSplit.refinePos(pos);
  }

  /**
   * `normalizePos` normalizes the given RGATreeSplitPos.
   */
  public normalizePos(pos: RGATreeSplitPos): RGATreeSplitPos {
    return this.rgaTreeSplit.normalizePos(pos);
  }

  /**
   * `getDataSize` returns the data usage of this element.
   */
  public getDataSize(): DataSize {
    const dataSize = { data: 0, meta: 0 };
    for (const node of this.rgaTreeSplit) {
      if (node.isRemoved()) {
        continue;
      }

      const size = node.getDataSize();
      dataSize.data += size.data;
      dataSize.meta += size.meta;
    }

    return {
      data: dataSize.data,
      meta: dataSize.meta + this.getMetaUsage(),
    };
  }

  /**
   * `toJSON` returns the JSON encoding of this text.
   */
  public toJSON(): string {
    const json = [];

    for (const node of this.rgaTreeSplit) {
      if (!node.isRemoved()) {
        json.push(node.getValue().toJSON());
      }
    }

    return `[${json.join(',')}]`;
  }

  /**
   * `toSortedJSON` returns the sorted JSON encoding of this text.
   */
  public toSortedJSON(): string {
    return this.toJSON();
  }

  /**
   * `toJSForTest` returns value with meta data for testing.
   */
  public toJSForTest(): Devtools.JSONElement {
    return {
      createdAt: this.getCreatedAt().toTestString(),
      value: JSON.parse(this.toJSON()),
      type: 'YORKIE_TEXT',
    };
  }

  /**
   * `toString` returns the string representation of this text.
   */
  public toString(): string {
    return this.rgaTreeSplit.toString();
  }

  /**
   * `values` returns the content-attributes pair array of this text.
   */
  public values(): Array<TextValueType<A>> {
    const values = [];

    for (const node of this.rgaTreeSplit) {
      if (!node.isRemoved()) {
        const value = node.getValue();
        values.push({
          attributes: parseObjectValues<A>(value.getAttributes()),
          content: value.getContent(),
        });
      }
    }

    return values;
  }

  /**
   * `getRGATreeSplit` returns rgaTreeSplit.
   */
  public getRGATreeSplit(): RGATreeSplit<CRDTTextValue> {
    return this.rgaTreeSplit;
  }

  /**
   * `toTestString` returns a String containing the meta data of this value
   * for debugging purpose.
   */
  public toTestString(): string {
    return this.rgaTreeSplit.toTestString();
  }

  /**
   * `deepcopy` copies itself deeply.
   */
  public deepcopy(): CRDTText<A> {
    const clone = new CRDTText<A>(
      this.rgaTreeSplit.deepcopy(),
      this.getCreatedAt(),
    );
    clone.setRemovedAt(this.getRemovedAt());
    clone.setMovedAt(this.getMovedAt());
    return clone;
  }

  /**
   * `findIndexesFromRange` returns pair of integer offsets of the given range.
   */
  public findIndexesFromRange(range: RGATreeSplitPosRange): [number, number] {
    return this.rgaTreeSplit.findIndexesFromRange(range);
  }

  /**
   * `posToIndex` converts the given position to index.
   */
  public posToIndex(
    pos: RGATreeSplitPos,
    preferToLeft: boolean = false,
  ): number {
    return this.rgaTreeSplit.posToIndex(pos, preferToLeft);
  }

  /**
   * `getGCPairs` returns the pairs of GC.
   */
  public getGCPairs(): Array<GCPair> {
    const pairs: Array<GCPair> = [];
    // NOTE: Only called when a root is built from a snapshot, where
    // docSize.live counted visible nodes only. Tombstoned nodes (and the
    // attribute tombstones inside them) were never part of live, so their
    // pairs carry `gcOnlySize`. So do the attribute tombstones of visible
    // nodes: `CRDTTextValue.getDataSize` skips removed attributes, matching
    // the tree half, so those bytes are not in live either.
    for (const node of this.rgaTreeSplit) {
      if (node.getRemovedAt()) {
        pairs.push({
          parent: this.rgaTreeSplit,
          child: node,
          gcOnlySize: node.getDataSize(),
        });
      }

      for (const p of node.getValue().getGCPairs()) {
        pairs.push(
          node.getRemovedAt() ? { ...p, gcOnlySize: p.child.getDataSize() } : p,
        );
      }
    }

    return pairs;
  }
}
