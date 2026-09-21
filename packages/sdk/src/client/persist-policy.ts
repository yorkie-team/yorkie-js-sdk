/*
 * Copyright 2026 The Yorkie Authors. All rights reserved.
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
 * `MinLogBytes` is the floor below which a log never triggers compaction.
 * Without it the ratio alone would make the smallest documents the busiest: a
 * 500-byte document would compact after two changes.
 */
export const MinLogBytes = 64 * 1024;

/**
 * `LogRatio` is the share of the snapshot's size the log may reach before it
 * is worth re-snapshotting.
 */
export const LogRatio = 0.5;

/**
 * `MaxReplay` bounds how many changes a restore has to replay. This is a
 * latency budget rather than a storage one, which is why it is separate from
 * the byte rule.
 */
export const MaxReplay = 1000;

/**
 * `PersistState` is what the compaction decision is made from.
 */
export interface PersistState {
  /** Size of the stored snapshot the log is appended to. */
  snapshotBytes: number;
  /** Total size of the appended change log. */
  logBytes: number;
  /** Number of appended changes. */
  changeCount: number;
}

/**
 * `shouldCompact` decides whether the appended log has grown enough to be
 * worth replacing with a fresh snapshot.
 *
 * The threshold is **relative to the snapshot**, not a constant, because the
 * point at which appending stops paying is a function of what it is appended
 * to. Measured, an 8,000-cell sheet's log reaches its snapshot's size after
 * roughly 6,300 edits while a 5,000-character note's does after roughly 50 —
 * two orders of magnitude apart, so no single count or byte figure serves
 * both.
 *
 * Making it relative also removes the pathological case by construction. A
 * small document compacts often, which is harmless precisely because its
 * snapshot is small and serializes in about a millisecond; a large one
 * compacts rarely, so its expensive serialization is divided across thousands
 * of edits. Cost and threshold scale with the same quantity, so "compacts
 * frequently *and* expensively" is unreachable.
 */
export function shouldCompact(state: PersistState): boolean {
  if (state.changeCount > MaxReplay) {
    return true;
  }
  return state.logBytes > Math.max(MinLogBytes, state.snapshotBytes * LogRatio);
}
