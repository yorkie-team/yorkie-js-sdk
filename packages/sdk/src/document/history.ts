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
import { Operation } from './operation/operation';
import { Indexable } from './document';
import { ArraySetOperation } from './operation/array_set_operation';
import { RemoveOperation } from './operation/remove_operation';
import { MoveOperation } from './operation/move_operation';
import { AddOperation } from './operation/add_operation';
import { TimeTicket } from '../yorkie';
import { EditOperation } from './operation/edit_operation';

/**
 * `HistoryOperation` is a type of history operation.
 */
export type HistoryOperation<P extends Indexable> =
  | Operation
  | {
      type: 'presence';
      value: Partial<P>;
    };

/**
 * `MaxUndoRedoStackDepth` is the maximum depth of undo/redo stack.
 */
export const MaxUndoRedoStackDepth = 50;

/**
 * `History` is a class that stores the history of the document.
 */
export class History<P extends Indexable> {
  private undoStack: Array<Array<HistoryOperation<P>>> = [];
  private redoStack: Array<Array<HistoryOperation<P>>> = [];

  /**
   * `hasUndo` returns true if there are undo operations.
   */
  public hasUndo(): boolean {
    return this.undoStack.length > 0;
  }

  /**
   * `hasRedo` returns true if there are redo operations.
   */
  public hasRedo(): boolean {
    return this.redoStack.length > 0;
  }

  /**
   * `pushUndo` pushes new undo operations of a change to undo stack.
   */
  public pushUndo(undoOps: Array<HistoryOperation<P>>): void {
    if (this.undoStack.length >= MaxUndoRedoStackDepth) {
      this.undoStack.shift();
    }
    this.undoStack.push(undoOps);
  }

  /**
   * `popUndo` pops the last undo operations of a change from undo stack.
   */
  public popUndo(): Array<HistoryOperation<P>> | undefined {
    return this.undoStack.pop();
  }

  /**
   * `pushRedo` pushes new redo operations of a change to redo stack.
   */
  public pushRedo(redoOps: Array<HistoryOperation<P>>): void {
    if (this.redoStack.length >= MaxUndoRedoStackDepth) {
      this.redoStack.shift();
    }
    this.redoStack.push(redoOps);
  }

  /**
   * `popRedo` pops the last redo operations of a change from redo stack.
   */
  public popRedo(): Array<HistoryOperation<P>> | undefined {
    return this.redoStack.pop();
  }

  /**
   * `clearRedo` flushes remaining redo operations.
   */
  public clearRedo(): void {
    this.redoStack = [];
  }

  /**
   * `clearUndo` flushes remaining undo operations.
   */
  public clearUndo(): void {
    this.undoStack = [];
  }

  /**
   * `getUndoStackForTest` returns the undo stack for test.
   */
  public getUndoStackForTest(): Array<Array<HistoryOperation<P>>> {
    return this.undoStack;
  }

  /**
   * `getRedoStackForTest` returns the redo stack for test.
   */
  public getRedoStackForTest(): Array<Array<HistoryOperation<P>>> {
    return this.redoStack;
  }

  /**
   * `reconcileCreatedAt` updates the createdAt and prevCreatedAt fields.
   *
   * When an element is replaced(e.g., UndoRemove as Add, or Set),
   * it receives a new createdAt(executedAt). However, existing history
   * operations may still reference the old createdAt or prevCreatedAt.
   *
   * This method scans both undo/redo stacks and replaces any matching
   * createdAt/prevCreatedAt with the new one, ensuring consistency.
   */
  public reconcileCreatedAt(
    prevCreatedAt: TimeTicket,
    currCreatedAt: TimeTicket,
  ): void {
    const replace = (stack: Array<Array<HistoryOperation<P>>>) => {
      for (const ops of stack) {
        for (const op of ops) {
          if (
            (op instanceof ArraySetOperation ||
              op instanceof RemoveOperation ||
              op instanceof MoveOperation) &&
            op.getCreatedAt() === prevCreatedAt
          ) {
            op.setCreatedAt(currCreatedAt);
          }

          if (
            (op instanceof AddOperation || op instanceof MoveOperation) &&
            op.getPrevCreatedAt() === prevCreatedAt
          ) {
            op.setPrevCreatedAt(currCreatedAt);
          }
        }
      }
    };
    replace(this.undoStack);
    replace(this.redoStack);
  }

  /**
   * `reconcileTextEdit` reconciles the text edit operation.
   * Scan both undo/redo stacks and replace the edit operation with the new position.
   */
  public reconcileTextEdit(
    parentCreatedAt: TimeTicket,
    rangeFrom: number,
    rangeTo: number,
    contentLength: number,
  ): void {
    const replace = (stack: Array<Array<HistoryOperation<P>>>) => {
      for (const ops of stack) {
        for (const op of ops) {
          if (
            op instanceof EditOperation &&
            op.getParentCreatedAt().compare(parentCreatedAt) === 0
          ) {
            op.reconcileOperation(rangeFrom, rangeTo, contentLength);
          }
        }
      }
    };
    replace(this.undoStack);
    replace(this.redoStack);
  }
}
