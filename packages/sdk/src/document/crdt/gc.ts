/*
 * Copyright 2024 The Yorkie Authors. All rights reserved.
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
import { DataSize } from '@yorkie-js/sdk/src/util/resource';

/**
 * `GCPair` is a structure that represents a pair of parent and child for garbage
 * collection.
 */
export type GCPair = {
  parent: GCParent;
  child: GCChild;

  /**
   * `gcOnlySize` is set when the child's size was never counted in
   * `docSize.live`: a piece born removed by splitting an already-tombstoned
   * node, or a tombstone registered by the full scan when a root is built
   * from a snapshot (live only counts visible nodes there). When present,
   * `registerGCPair` adds this size to `docSize.gc` and leaves
   * `docSize.live` untouched, instead of moving the child's size from live
   * to gc.
   */
  gcOnlySize?: DataSize;
};

/**
 * `GCParent` is an interface for the parent of the garbage collection target.
 */
export interface GCParent {
  purge(node: GCChild): void;
}

/**
 * `GCChild` is an interface for the child of the garbage collection target.
 */
export interface GCChild {
  toIDString(): string;
  getRemovedAt(): TimeTicket | undefined;
  getDataSize(): DataSize;
}
