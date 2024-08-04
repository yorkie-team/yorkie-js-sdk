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
}
