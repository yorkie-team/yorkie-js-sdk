/*
 * Copyright 2025 The Yorkie Authors. All rights reserved.
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
 * GCLock
 *
 * A bidirectional lock registry to prevent premature GC of timeTicket–referenced
 * data while undo operations may still need it.
 *
 * Why this is needed:
 * In an undo/redo system, an UndoOperation can reference a timeTicket that
 * points to data which might be collected by GC before the actual undo `execute`
 * runs. If that happens, executing the undo would fail. This class lets you
 * "lock" GC for specific timeTickets as long as there are operations referencing
 * them. When the operations are done, you "unlock" and allow GC again.
 *
 * Design:
 * - forward index: Map<timeTicketKey: string, Set<operation>>
 * - reverse index: WeakMap<operation, Set<timeTicketKey: string>>
 *
 * We support multi-lock: a single operation may be locked
 * against multiple timeTickets simultaneously. `unlock(operation)` removes the
 * operation from all its associated timeTickets, deleting those keys if no
 * other operations remain.
 *
 * Notes:
 * - Uses a WeakMap for the reverse index so operations can be GC’d naturally
 *   when the outside world drops references to them.
 * - The caller must provide canonical `timeTicketKey` strings.
 */
export class GCLock<OP extends object> {
  private forward = new Map<string, Set<OP>>();
  private reverse = new WeakMap<OP, Set<string>>();

  /**
   * Lock GC for the given `timeTicketKey` on behalf of `operation`.
   * If the key does not exist yet, it will be created and initialized with `[operation]`.
   * If it exists, the operation is added to its Set (idempotent).
   *
   * @param timeTicketKey - stable string key of the resource to protect
   * @param operation     - the operation that requires the protection
   */
  lock(timeTicketKey: string, operation: OP): void {
    // forward
    let fset = this.forward.get(timeTicketKey);
    if (!fset) {
      fset = new Set<OP>();
      this.forward.set(timeTicketKey, fset);
    }
    if (!fset.has(operation)) fset.add(operation);

    // reverse
    let rset = this.reverse.get(operation);
    if (!rset) {
      rset = new Set<string>();
      this.reverse.set(operation, rset);
    }
    rset.add(timeTicketKey);
  }

  /**
   * Unlock GC for all timeTickets currently held by `operation`.
   * For each affected timeTicketKey:
   *  - If the Set contains only this operation, the key is deleted.
   *  - Otherwise, only this operation is removed from the Set.
   *
   * Returns the number of distinct timeTicketKeys that were affected
   * for this operation.
   *
   * @param operation - the operation to release from all locks
   * @returns number of timeTicketKeys touched by this unlock
   */
  unlock(operation: OP): number {
    const rset = this.reverse.get(operation);
    if (!rset || rset.size === 0) return 0;

    let touched = 0;
    for (const key of rset) {
      const fset = this.forward.get(key);
      if (!fset) continue;

      if (fset.delete(operation)) {
        touched++;
        if (fset.size === 0) this.forward.delete(key);
      }
    }

    // remove reverse mapping entirely for this operation
    this.reverse.delete(operation);
    return touched;
  }

  /**
   * Check if the given `timeTicketKey` currently has any active locks.
   *
   * @param timeTicketKey - the key to check
   * @returns true if locked, false otherwise
   */
  isLocked(timeTicketKey: string): boolean {
    return this.forward.has(timeTicketKey);
  }

  /**
   * Get number of operations locking the given `timeTicketKey`.
   * Useful for diagnostics/metrics.
   *
   * @param timeTicketKey - the key to inspect
   * @returns count of operations currently locking it
   */
  size(timeTicketKey: string): number {
    return this.forward.get(timeTicketKey)?.size ?? 0;
  }

  /**
   * Returns a human-readable snapshot of the current locks, e.g.:
   *   GCLock{ tt#1: [op#A, op#B], tt#2: [op#C] }
   *
   * Notes:
   * - Only the forward index (timeTicketKey -> Set<operation>) is included.
   * - The reverse index is a WeakMap and cannot be enumerated by design.
   *
   * @param opLabeler Optional function to stringify each operation.
   *                  Defaults to returning "[op]".
   */
  public toString(opLabeler?: (op: OP) => string): string {
    const label = opLabeler ?? (() => '[op]');
    const chunks: Array<string> = [];
    for (const [k, set] of this.forward) {
      const ops = [...set].map(label).join(', ');
      chunks.push(`${k}: [${ops}]`);
    }
    return `GCLock{ ${chunks.join(', ')} }`;
  }

  /**
   * Return a lightweight snapshot of lock counts per key
   * for debugging/telemetry (no operation identities are exposed).
   */
  debugSnapshot(): Record<string, number> {
    const out: Record<string, number> = {};
    for (const [k, set] of this.forward) out[k] = set.size;
    return out;
  }

  /**
   * Create a structural deep copy of this GCLock.
   *
   * Containers (Map/Set) are fully recreated so the returned instance is
   * independent of the original. Operation objects (OP) themselves are NOT
   * cloned; their references are preserved to keep identity semantics.
   *
   * Implementation detail:
   * - WeakMap cannot be enumerated, so we rebuild the reverse index from
   *   the forward Map during the copy.
   *
   * @returns a new GCLock whose forward/reverse indexes mirror the current state
   */
  deepcopy(): GCLock<OP> {
    const copy = new GCLock<OP>();

    // Rebuild forward map and reverse index from current forward map.
    for (const [key, set] of this.forward) {
      const newSet = new Set<OP>();
      for (const op of set) {
        newSet.add(op);

        // reconstruct reverse: op -> keys
        let rset = copy.reverse.get(op);
        if (!rset) {
          rset = new Set<string>();
          copy.reverse.set(op, rset);
        }
        rset.add(key);
      }
      copy.forward.set(key, newSet);
    }

    return copy;
  }
}
