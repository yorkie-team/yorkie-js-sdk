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
 * Operation Log (Oplog)
 *
 * Oplog manages the history of all operations applied to a document.
 * It is a core component for Operational Transformation (OT).
 */

import { VersionVector } from '../time/version_vector';
import { TreeNode } from '../crdt/tree';

/**
 * Represents the source of an operation.
 */
export type OperationSource = 'local' | 'remote';

/**
 * Represents an operation that can be applied to the document.
 */
export interface Operation {
  /**
   * Unique identifier of the operation (version vector)
   */
  id: VersionVector;

  /**
   * Parent operation identifiers (array of version vectors)
   */
  parents: Array<VersionVector>;

  /**
   * Type of operation
   */
  type: 'insert' | 'delete';

  /**
   * Starting position of the operation
   */
  from: number;

  /**
   * Ending position of the operation
   */
  to: number;

  /**
   * Content of the operation (TreeNode)
   */
  content: TreeNode;

  /**
   * Source of the operation
   */
  source: OperationSource;
}

/**
 * Represents a version in the operation history.
 * A version is a set of operations that have been applied.
 */
export interface Version {
  /**
   * The operations included in this version
   */
  operations: Set<VersionVector>;
}

/**
 * Oplog class provides functionality to manage and query operation history.
 */
export class Oplog {
  private operations: Array<Operation>;
  private head: VersionVector | undefined;
  /**
   * frontier represents the set of VersionVectors at the leading edge
   * (most recent operations) of the operation graph.
   */
  private frontier: Set<VersionVector>;

  constructor() {
    this.operations = [];
    this.head = undefined;
    this.frontier = new Set();
  }

  /**
   * Appends a new local operation to the Oplog.
   */
  public append(operation: Operation): void {
    const localOp: Operation = {
      ...operation,
      source: 'local' as OperationSource,
    };

    this.operations.push(localOp);
    this.head = operation.id;
    this.updateFrontier(localOp);
  }

  /**
   * Integrates a remote operation into the Oplog.
   */
  public integrate(remoteOp: Operation): void {
    const integratedOp: Operation = {
      ...remoteOp,
      source: 'remote' as OperationSource,
    };

    this.operations.push(integratedOp);
    this.updateFrontier(integratedOp);
  }

  /**
   * Updates the frontier.
   * When a new operation is added, its parents are removed from the frontier
   * and the new operation is added to the frontier.
   */
  private updateFrontier(operation: Operation): void {
    operation.parents.forEach((parentId) => {
      for (const frontierVector of this.frontier) {
        if (frontierVector.equals(parentId)) {
          this.frontier.delete(frontierVector);
          break;
        }
      }
    });

    this.frontier.add(operation.id);
  }

  /**
   * Returns all operations in the frontier.
   */
  public getFrontier(): Array<Operation> {
    return this.operations.filter((op) =>
      Array.from(this.frontier).some((frontierVector) =>
        frontierVector.equals(op.id),
      ),
    );
  }

  /**
   * Checks if an operation is in the frontier.
   */
  public isInFrontier(operationId: VersionVector): boolean {
    return Array.from(this.frontier).some((frontierVector) =>
      frontierVector.equals(operationId),
    );
  }

  /**
   * Returns the current head version vector.
   */
  public getHead(): VersionVector | undefined {
    return this.head;
  }

  /**
   * Finds the parent operation of a given operation.
   */
  public getParent(id: VersionVector): Operation | undefined {
    const operation = this.operations.find((op) => op.id.equals(id));
    if (!operation) return undefined;

    const parentId = operation.parents[0];
    return this.operations.find((op) => op.id.equals(parentId));
  }

  /**
   * Returns all operations.
   */
  public getOperations(): Array<Operation> {
    return [...this.operations];
  }

  /**
   * Returns all operations after the specified timestamp.
   */
  public getOperationsFrom(timestamp: number): Array<Operation> {
    return this.operations.filter((op) => {
      const maxLamport = op.id.maxLamport();

      return Number(maxLamport) >= timestamp;
    });
  }

  /**
   * Detects conflicts between two operations.
   * Returns true if the operations conflict with each other.
   */
  public detectConflict(op1: Operation, op2: Operation): boolean {
    // Check if operations overlap in position
    const positionOverlap = !(op1.to <= op2.from || op2.to <= op1.from);

    // Check if operations are concurrent (not causally related)
    const concurrent = !this.isCausallyRelated(op1, op2);

    return positionOverlap && concurrent;
  }

  /**
   * Checks if two operations are causally related.
   * Returns true if one operation is a descendant of the other.
   */
  private isCausallyRelated(op1: Operation, op2: Operation): boolean {
    // Check if op1 is ancestor of op2
    if (op2.parents.some((parentId) => parentId.equals(op1.id))) {
      return true;
    }

    // Check if op2 is ancestor of op1
    if (op1.parents.some((parentId) => parentId.equals(op2.id))) {
      return true;
    }

    return false;
  }

  /**
   * Returns all operations that conflict with the given operation.
   */
  public findConflictingOperations(operation: Operation): Array<Operation> {
    return this.operations.filter(
      (op) => op.id !== operation.id && this.detectConflict(op, operation),
    );
  }

  /**
   * Resolves conflicts between operations using a simple last-writer-wins strategy.
   * Returns the winning operation based on version vector comparison.
   */
  public resolveConflict(op1: Operation, op2: Operation): Operation {
    // Compare version vectors lexicographically
    const op1MaxLamport = op1.id.maxLamport();
    const op2MaxLamport = op2.id.maxLamport();

    if (op1MaxLamport > op2MaxLamport) {
      return op1;
    } else if (op2MaxLamport > op1MaxLamport) {
      return op2;
    }

    // If lamport values are equal, compare actor IDs
    const op1ActorId = Array.from(op1.id)[0][0];
    const op2ActorId = Array.from(op2.id)[0][0];

    return op1ActorId > op2ActorId ? op1 : op2;
  }
}
