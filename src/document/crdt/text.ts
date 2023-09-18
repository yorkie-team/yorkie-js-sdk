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
  InitialTimeTicket,
  MaxTimeTicket,
  TimeTicket,
} from '@yorkie-js-sdk/src/document/time/ticket';
import { Indexable } from '@yorkie-js-sdk/src/document/document';
import { RHT } from '@yorkie-js-sdk/src/document/crdt/rht';
import { CRDTGCElement } from '@yorkie-js-sdk/src/document/crdt/element';
import {
  BoundaryType,
  RGATreeSplit,
  RGATreeSplitBoundary,
  RGATreeSplitBoundaryRange,
  RGATreeSplitNode,
  RGATreeSplitPos,
  RGATreeSplitPosRange,
  StyleOperation,
  ValueChange,
} from '@yorkie-js-sdk/src/document/crdt/rga_tree_split';
import { escapeString } from '@yorkie-js-sdk/src/document/json/strings';
import { parseObjectValues } from '@yorkie-js-sdk/src/util/object';

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

export type MarkName = string;

export type AttributeSpec = {
  default?: any;
  required?: boolean;
};

export type MarkSpec = {
  expand: 'before' | 'after' | 'both' | 'none';
  allowMultiple: boolean;
  excludes?: Array<string>;
  attributes?: { [key: string]: AttributeSpec };
};

export type MarkTypes = Map<MarkName, MarkSpec>;

/**
 * `CRDTTextValue` is a value of Text
 * which has a attributes that expresses the text style.
 * Attributes are represented by RHT.
 *
 */
export class CRDTTextValue {
  private attributes: RHT;
  private content: string;

  /** @hideconstructor */
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
   * `setAttr` sets attribute of the given key, updated time and value.
   */
  public setAttr(key: string, content: string, updatedAt: TimeTicket): void {
    this.attributes.set(key, content, updatedAt);
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
   * `toJSON` returns the JSON encoding of this value.
   */
  public toJSON(markAttrs?: Map<string, string>): string {
    const content = escapeString(this.content);
    const attrsObj = this.attributes.toObject();

    // Merge existing attrsObj and markAttrs
    if (markAttrs) {
      for (const [key, value] of markAttrs.entries()) {
        attrsObj[key] = value;
      }
    }

    const attrs = [];
    for (const [key, v] of Object.entries(attrsObj)) {
      const value = JSON.parse(v);
      const item =
        typeof value === 'string'
          ? `"${key}":"${escapeString(value)}"`
          : `"${key}":${String(value)}`;
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
}

/**
 *  `CRDTText` is a custom CRDT data type to represent the contents of text editors.
 *
 */
export class CRDTText<A extends Indexable = Indexable> extends CRDTGCElement {
  private rgaTreeSplit: RGATreeSplit<CRDTTextValue>;
  // NOTE(MoonGyu1): This anchor can be relocated to better place
  private lastAnchor?: Set<StyleOperation> | undefined;

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
   *
   * @internal
   */
  public edit(
    range: RGATreeSplitPosRange,
    content: string,
    editedAt: TimeTicket,
    attributes?: Record<string, string>,
    latestCreatedAtMapByActor?: Map<string, TimeTicket>,
  ): [Map<string, TimeTicket>, Array<TextChange<A>>, RGATreeSplitPosRange] {
    const crdtTextValue = content ? CRDTTextValue.create(content) : undefined;
    if (crdtTextValue && attributes) {
      for (const [k, v] of Object.entries(attributes)) {
        crdtTextValue.setAttr(k, v, editedAt);
      }
    }

    const [caretPos, latestCreatedAtMap, valueChanges] = this.rgaTreeSplit.edit(
      range,
      editedAt,
      crdtTextValue,
      latestCreatedAtMapByActor,
    );

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

    return [latestCreatedAtMap, changes, [caretPos, caretPos]];
  }

  /**
   * `setStyle` applies the style of the given range.
   * 01. split nodes with from and to
   * 02. style nodes between from and to
   *
   * @param range - range of RGATreeSplitNode
   * @param attributes - style attributes
   * @param editedAt - edited time
   * @internal
   */
  public setStyle(
    range: RGATreeSplitBoundaryRange,
    attributes: Record<string, string>,
    editedAt: TimeTicket,
    latestCreatedAtMapByActor?: Map<string, TimeTicket>,
  ): [Map<string, TimeTicket>, Array<TextChange<A>>] {
    const fromBoundary = range[0];
    const toBoundary = range[1];

    // 01. Split nodes with boundaryRange if it is a remote operation
    const isRemote = !!latestCreatedAtMapByActor;
    if (isRemote) {
      this.rgaTreeSplit.splitNodeByBoundary(toBoundary);
      this.rgaTreeSplit.splitNodeByBoundary(fromBoundary);
    }

    // Get fromNode and toNode from boundary
    const fromNode = this.rgaTreeSplit.findNode(fromBoundary.getID()!);
    const toNode = toBoundary?.getID()?.getCreatedAt()
      ? this.rgaTreeSplit.findNode(toBoundary.getID()!)
      : undefined;

    const changes: Array<TextChange<A>> = [];
    const toBeStyleds: Array<RGATreeSplitNode<CRDTTextValue>> = [];
    const createdAtMapByActor = new Map<string, TimeTicket>();

    // 02. style nodes between from and to
    const fromBoundaryType = fromBoundary.getType();
    const toBoundaryType = toBoundary.getType();
    const isMarkType =
      fromBoundaryType != BoundaryType.None &&
      toBoundaryType != BoundaryType.None;

    // 02-1. Update styleOpsBefore and styleOpsAfter if it is a bold type
    if (isMarkType) {
      // Define new StyleOperation
      const newOp: StyleOperation = {
        fromBoundary,
        toBoundary,
        attributes,
      };

      // Get underlying OpSet of fromBoundary and toBoundary
      const fromOpSet = this.rgaTreeSplit.findOpsetPreferToLeft(
        fromNode,
        fromBoundaryType,
      );

      const toOpSet = toNode
        ? this.rgaTreeSplit.findOpsetPreferToLeft(toNode, toBoundaryType)
        : this.lastAnchor;

      // Update styleOpsBefore or styleOpsAfter of fromNode
      fromOpSet.add(newOp);

      if (fromBoundaryType === BoundaryType.Before) {
        fromNode.setStyleOpsBefore(fromOpSet);
        toBeStyleds.push(fromNode);
      } else if (fromBoundaryType === BoundaryType.After) {
        fromNode.setStyleOpsAfter(fromOpSet);
      }

      // Add a new StyleOperation to between nodes if it has an opSet
      let betweenNode = fromNode.getNext();
      while (
        betweenNode &&
        betweenNode !== toNode &&
        !betweenNode.isRemoved()
      ) {
        toBeStyleds.push(betweenNode);
        const styleOpsBefore = betweenNode.getStyleOpsBefore();
        const styleOpsAfter = betweenNode.getStyleOpsAfter();
        if (styleOpsBefore) {
          styleOpsBefore.add(newOp);
          betweenNode.setStyleOpsBefore(styleOpsBefore);
        }
        if (styleOpsAfter) {
          styleOpsAfter.add(newOp);
          betweenNode.setStyleOpsAfter(styleOpsAfter);
        }
        betweenNode = betweenNode.getNext();
      }

      // Update styleOpsBefore or styleOpsAfter of toNode
      if (toBoundaryType === BoundaryType.Before) {
        toNode!.setStyleOpsBefore(toOpSet!);
      } else if (toBoundaryType === BoundaryType.After) {
        toBeStyleds.push(toNode!);
        toNode!.setStyleOpsAfter(toOpSet!);
      } else if (toBoundaryType === BoundaryType.End) {
        if (!toOpSet) this.lastAnchor = new Set<StyleOperation>();
      }
    }
    // 02-2. Apply the existing logic to style nodes if they are not of a bold type
    else {
      const nodes = this.rgaTreeSplit.findBetween(fromNode, toNode);

      for (const node of nodes) {
        const actorID = node.getCreatedAt().getActorID()!;
        const latestCreatedAt = latestCreatedAtMapByActor?.size
          ? latestCreatedAtMapByActor!.has(actorID!)
            ? latestCreatedAtMapByActor!.get(actorID!)!
            : InitialTimeTicket
          : MaxTimeTicket;

        if (node.canStyle(editedAt, latestCreatedAt)) {
          const latestCreatedAt = createdAtMapByActor.get(actorID);
          const createdAt = node.getCreatedAt();
          if (!latestCreatedAt || createdAt.after(latestCreatedAt)) {
            createdAtMapByActor.set(actorID, createdAt);
          }
          toBeStyleds.push(node);
        }
      }
    }

    for (const node of toBeStyleds) {
      if (node.isRemoved()) {
        continue;
      }

      const [fromIdx, toIdx] = this.rgaTreeSplit.findIndexesFromRange(
        node.createPosRange(),
      );
      changes.push({
        type: TextChangeType.Style,
        actor: editedAt.getActorID()!,
        from: fromIdx,
        to: toIdx,
        value: {
          attributes: parseObjectValues(attributes) as A,
        },
      });

      if (!isMarkType) {
        for (const [key, value] of Object.entries(attributes)) {
          node.getValue().setAttr(key, value, editedAt);
        }
      }
    }

    return [createdAtMapByActor, changes];
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
   * `posRangeToBoundaryRange` returns the boundary range of the given position range.
   */
  public posRangeToBoundaryRange(
    fromPos: RGATreeSplitPos,
    toPos: RGATreeSplitPos,
    editedAt: TimeTicket,
    expand?: 'before' | 'after' | 'both' | 'none',
  ): RGATreeSplitBoundaryRange {
    // Make a RGATreeSplitBoundary if it is a mark type
    if (expand) {
      const [, toRight] = this.rgaTreeSplit.findNodeWithSplit(toPos, editedAt);
      const [, fromRight] = this.rgaTreeSplit.findNodeWithSplit(
        fromPos,
        editedAt,
      );

      let fromNode: RGATreeSplitNode<CRDTTextValue> | undefined = fromRight;
      let toNode: RGATreeSplitNode<CRDTTextValue> | undefined = toRight;

      if (expand === 'after') {
        while (fromNode && fromNode.isRemoved() && fromNode != toNode) {
          fromNode = fromNode.getNext();
        }

        while (toNode && toNode.isRemoved()) {
          toNode = toNode.getNext();
        }

        const fromNodeID = fromNode?.getID();
        const toNodeID = toNode?.getID();

        // NOTE(MoonGyu1): Need to check if fromNode does not exist
        const fromBoundaryType = fromNodeID
          ? BoundaryType.Before
          : BoundaryType.Start;
        const toBoundaryType = toNodeID
          ? BoundaryType.Before
          : BoundaryType.End;

        return [
          RGATreeSplitBoundary.of(fromBoundaryType, fromNodeID),
          RGATreeSplitBoundary.of(toBoundaryType, toNodeID),
        ];
      }
    }

    // Make a RGATreeSplitBoundary without BoundaryType if it is not a mark type
    const [, toRight] = this.rgaTreeSplit.findNodeWithSplit(toPos, editedAt);
    const [, fromRight] = this.rgaTreeSplit.findNodeWithSplit(
      fromPos,
      editedAt,
    );

    return [
      RGATreeSplitBoundary.of(BoundaryType.None, fromRight.getID()),
      RGATreeSplitBoundary.of(BoundaryType.None, toRight?.getID()),
    ];
  }

  /**
   * `length` returns size of RGATreeList.
   */
  public get length(): number {
    return this.rgaTreeSplit.length;
  }

  /**
   * `checkWeight` returns false when there is an incorrect weight node.
   * for debugging purpose.
   */
  public checkWeight(): boolean {
    return this.rgaTreeSplit.checkWeight();
  }

  /**
   * `toJSON` returns the JSON encoding of this text.
   */
  public toJSON(): string {
    const json = [];

    // Keep current attributes info for applying to current node
    let currentAttr = new Map<string, string>();

    for (const node of this.rgaTreeSplit) {
      const beforeAnchor = node.getStyleOpsBefore();
      const afterAnchor = node.getStyleOpsAfter();

      // Update currentAttr by before anchor of node
      if (beforeAnchor) {
        currentAttr = this.rgaTreeSplit.getAttrsFromAnchor(beforeAnchor);
      }

      // Apply currentAttr if node is not removed
      if (!node.isRemoved()) {
        json.push(node.getValue().toJSON(currentAttr));
      }

      // Update currentAttr by after anchor of node
      if (afterAnchor) {
        currentAttr = this.rgaTreeSplit.getAttrsFromAnchor(afterAnchor);
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
   *
   * @internal
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
   * `getRemovedNodesLen` returns length of removed nodes
   */
  public getRemovedNodesLen(): number {
    return this.rgaTreeSplit.getRemovedNodesLen();
  }

  /**
   * `purgeRemovedNodesBefore` purges removed nodes before the given time.
   *
   * @internal
   */
  public purgeRemovedNodesBefore(ticket: TimeTicket): number {
    return this.rgaTreeSplit.purgeRemovedNodesBefore(ticket);
  }

  /**
   * `deepcopy` copies itself deeply.
   */
  public deepcopy(): CRDTText<A> {
    const text = new CRDTText<A>(
      this.rgaTreeSplit.deepcopy(),
      this.getCreatedAt(),
    );
    text.remove(this.getRemovedAt());
    return text;
  }

  /**
   * `findIndexesFromRange` returns pair of integer offsets of the given range.
   */
  public findIndexesFromRange(range: RGATreeSplitPosRange): [number, number] {
    return this.rgaTreeSplit.findIndexesFromRange(range);
  }
}
