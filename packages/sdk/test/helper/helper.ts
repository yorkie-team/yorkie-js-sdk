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

import { assert } from 'vitest';
import { fromBinary } from '@bufbuild/protobuf';

import yorkie, {
  Tree,
  ElementNode,
  Indexable,
} from '@yorkie-js/sdk/src/yorkie';
import { IndexTree } from '@yorkie-js/sdk/src/util/index_tree';
import {
  CRDTTreeNode,
  CRDTTreeNodeID,
} from '@yorkie-js/sdk/src/document/crdt/tree';
import {
  OpInfo,
  Operation,
} from '@yorkie-js/sdk/src/document/operation/operation';
import {
  InitialTimeTicket as ITT,
  MaxLamport,
  TimeTicket,
} from '@yorkie-js/sdk/src/document/time/ticket';
import { HistoryOperation } from '@yorkie-js/sdk/src/document/history';
import { ChangeContext } from '@yorkie-js/sdk/src/document/change/context';
import { InitialChangeID } from '@yorkie-js/sdk/src/document/change/change_id';
import { CRDTRoot } from '@yorkie-js/sdk/src/document/crdt/root';
import { CRDTObject } from '@yorkie-js/sdk/src/document/crdt/object';
import { ElementRHT } from '@yorkie-js/sdk/src/document/crdt/element_rht';
import { Code, YorkieError } from '@yorkie-js/sdk/src/util/error';
import { InitialActorID } from '@yorkie-js/sdk/src/document/time/actor_id';
import { VersionVector } from '@yorkie-js/sdk/src/document/time/version_vector';
import { converter } from '@yorkie-js/sdk/src/api/converter';
import {
  JSONElementSchema as PbJSONElementSchema,
  ValueType as PbValueType,
} from '@yorkie-js/sdk/src/api/yorkie/v1/resources_pb';

export const DefaultSnapshotThreshold = 500;

/**
 * EventCollector provides a utility to collect and manage events.
 * It can be used in tests to wait for events to be collected.
 */
export class EventCollector<E = string> {
  private events: Array<E>;

  constructor() {
    this.events = [];
  }

  public add(event: E) {
    this.events.push(event);
  }

  /**
   * `waitAndVerifyNthEvent` waits for the nth event to occur and then
   * verifies whether the event matches the expected event.
   */
  public waitAndVerifyNthEvent(count: number, event: E) {
    return new Promise<void>((resolve, reject) => {
      const doLoop = () => {
        if (this.events.length >= count) {
          if (deepEqual(this.events[count - 1], event)) {
            resolve();
          } else {
            reject(
              new YorkieError(
                Code.ErrInvalidArgument,
                `event is not equal  ${count}-
              expected: ${JSON.stringify(event)},
              actual: ${JSON.stringify(this.events[count - 1])}`,
              ),
            );
          }
          return;
        }
        setTimeout(doLoop, 100);
      };
      doLoop();
    });
  }

  /**
   * `waitFor` waits for the specified event to be collected.
   *
   * Note(chacha912): Before calling `waitFor`, it's recommended to use `reset` to clear the events array.
   * If the event was previously present in the events array, it may not be accurately detected.
   */
  public waitFor(event: E) {
    return new Promise<void>((resolve) => {
      const doLoop = () => {
        if (this.events.some((e) => deepEqual(e, event))) {
          resolve();
          return;
        }
        setTimeout(doLoop, 100);
      };
      doLoop();
    });
  }

  public reset() {
    this.events = [];
  }

  public getLength() {
    return this.events.length;
  }
}

export function deepSort(target: any): any {
  if (Array.isArray(target)) {
    return target.map(deepSort).sort(compareFunction);
  }
  if (typeof target === 'object') {
    return Object.keys(target)
      .sort()
      .reduce(
        (result, key) => {
          result[key] = deepSort(target[key]);
          return result;
        },
        {} as Record<string, any>,
      );
  }
  return target;
}

function deepEqual(actual: any, expected: any) {
  if (actual === expected) {
    return true;
  }

  if (
    typeof actual !== 'object' ||
    actual === null ||
    typeof expected !== 'object' ||
    expected === null
  ) {
    return false;
  }

  const keysA = Object.keys(actual);
  const keysB = Object.keys(expected);

  if (keysA.length !== keysB.length) {
    return false;
  }

  for (const key of keysA) {
    if (!keysB.includes(key) || !deepEqual(actual[key], expected[key])) {
      return false;
    }
  }

  return true;
}

function compareFunction(a: any, b: any): number {
  if (
    typeof a === 'object' &&
    typeof b === 'object' &&
    a !== null &&
    b !== null
  ) {
    const aKeys = Object.keys(a).sort();
    const bKeys = Object.keys(b).sort();
    const len = Math.min(aKeys.length, bKeys.length);
    for (let i = 0; i < len; i++) {
      const key = aKeys[i];
      const result = compareFunction(a[key], b[key]);
      if (result !== 0) {
        return result;
      }
    }
    return aKeys.length - bKeys.length;
  }
  return a < b ? -1 : a > b ? 1 : 0;
}

export async function assertThrowsAsync(
  fn: any,
  errType: any,
  message?: RegExp | string,
) {
  let errFn = () => {};
  try {
    await fn();
  } catch (e) {
    errFn = () => {
      throw e;
    };
  } finally {
    assert.throws(errFn, errType, message);
  }
}

/**
 * TextView emulates an external editor like CodeMirror to test whether change
 * events are delivered properly.
 */
export class TextView {
  private value: string;

  constructor() {
    this.value = '';
  }

  public applyOperations(operations: Array<OpInfo>, enableLog = false): void {
    const oldValue = this.value;
    const changeLogs = [];
    for (const op of operations) {
      if (op.type === 'edit') {
        this.value = [
          this.value.substring(0, op.from),
          op.value?.content,
          this.value.substring(op.to),
        ].join('');
        changeLogs.push(
          `{f:${op.from}, t:${op.to}, c:${op.value?.content || ''}}`,
        );
      }
    }

    if (enableLog) {
      console.log(
        `apply: ${oldValue}->${this.value} [${changeLogs.join(',')}]`,
      );
    }
  }

  public toString(): string {
    return this.value;
  }
}

/**
 * `buildIndexTree` builds an index tree from the given element node.
 */
export function buildIndexTree(node: ElementNode): IndexTree<CRDTTreeNode> {
  const doc = new yorkie.Document<{ t: Tree }>('test');
  doc.update((root) => {
    root.t = new Tree(node);
  });
  return doc.getRoot().t.getIndexTree();
}

export function toStringHistoryOp<P extends Indexable>(
  op: HistoryOperation<P>,
): string {
  return op instanceof Operation ? op.toTestString() : JSON.stringify(op);
}

/**
 * `idT` is a dummy CRDTTreeNodeID for testing.
 */
export const idT = CRDTTreeNodeID.of(ITT, 0);

/**
 * `dummyContext` is a helper context that is used for testing.
 */
export const dummyContext = ChangeContext.create(
  InitialChangeID,
  new CRDTRoot(new CRDTObject(ITT, ElementRHT.create())),
  {},
);

/**
 * `posT` is a helper function that issues a new CRDTTreeNodeID.
 */
export function posT(offset = 0): CRDTTreeNodeID {
  return CRDTTreeNodeID.of(dummyContext.issueTimeTicket(), offset);
}

/**
 * `timeT` is a helper function that issues a new TimeTicket.
 */
export function timeT(): TimeTicket {
  return dummyContext.issueTimeTicket();
}

/**
 * `maxVectorOf` creates a VersionVector with the maximum lamport value for the given actors.
 */
export function maxVectorOf(actors: Array<string>) {
  if (!actors.length) {
    actors = [InitialActorID];
  }

  const vector = new Map<string, bigint>();

  actors.forEach((actor) => {
    vector.set(actor, MaxLamport);
  });

  return new VersionVector(vector);
}

/**
 * `vectorOf` creates a VersionVector from an array of actor and lamport pairs.
 */
export function vectorOf(
  actors: Array<{ c: string; l: bigint }>,
): VersionVector {
  const vector = new Map<string, bigint>();
  actors.forEach(({ c: actor, l: lamport }) => {
    vector.set(actor, lamport);
  });
  return new VersionVector(vector);
}

/**
 * `ticketsOf` collects every TimeTicket reachable from the given protobuf
 * message as `[actor, lamport]`, decoding the element bytes a Set/Add/
 * ArraySet value carries. It walks the plain message objects on purpose, so
 * it does not share code with the walk under test in `api/reissue.ts`.
 */
export function ticketsOf(
  value: unknown,
  out: Array<[string, bigint]> = [],
): Array<[string, bigint]> {
  if (value === null || typeof value !== 'object') return out;
  if (value instanceof Uint8Array) return out;
  if (Array.isArray(value)) {
    for (const v of value) ticketsOf(v, out);
    return out;
  }

  const msg = value as Record<string, unknown>;
  if (msg.$typeName === 'yorkie.v1.TimeTicket') {
    out.push([
      converter.toHexString(msg.actorId as Uint8Array),
      BigInt(msg.lamport as bigint),
    ]);
    return out;
  }
  if (msg.$typeName === 'yorkie.v1.JSONElementSimple') {
    const type = msg.type as PbValueType;
    const bytes = msg.value as Uint8Array;
    if (
      bytes.length > 0 &&
      (type === PbValueType.JSON_OBJECT ||
        type === PbValueType.JSON_ARRAY ||
        type === PbValueType.TREE)
    ) {
      ticketsOf(fromBinary(PbJSONElementSchema, bytes), out);
    }
  }
  for (const [k, v] of Object.entries(msg)) {
    if (k !== '$typeName') ticketsOf(v, out);
  }
  return out;
}

/**
 * `countActors` counts, per actor, the given tickets whose lamport is not 0.
 * The lamport-0 ticket is the root's and every sentinel's identity, shared by
 * all replicas.
 */
export function countActors(
  tickets: Array<[string, bigint]>,
): Map<string, number> {
  const actors = new Map<string, number>();
  for (const [actor, lamport] of tickets) {
    if (lamport === 0n) continue;
    actors.set(actor, (actors.get(actor) ?? 0) + 1);
  }
  return actors;
}
