import { Operation } from '@yorkie-js-sdk/src/document/operation/operation';

/**
 * `History` manages undo and redo of document.
 *
 * @public
 */
export class History {
  private undoStack: Array<Array<Operation>>;
  private redoStack: Array<Array<Operation>>;

  constructor() {
    this.undoStack = [];
    this.redoStack = [];
  }

  /**
   * `canUndo` returns whether there are any operations to undo.
   */
  public canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  /**
   * `canRedo` returns whether there are any operations to redo.
   */
  public canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  /**
   * `pushUndo` pushes new undo operations of a change to undo stack.
   */
  public pushUndo(undoOps: Array<Operation>): void {
    this.undoStack.push(undoOps);
  }

  /**
   * `pushRedo` pushes new redo operations of a change to redo stack.
   */
  public pushRedo(redoOps: Array<Operation>): void {
    this.redoStack.push(redoOps);
  }

  /**
   * `resetRedo` flushes remaining redo operations.
   */
  public resetRedo(): void {
    this.redoStack = [];
  }

  /**
   * `undo` undoes the last operation executed by the current client.
   * It does not impact operations made by other clients.
   */
  public undo(): void {
    return;
  }

  /**
   * `redo` redoes the last operation executed by the current client.
   * It does not impact operations made by other clients.
   */
  public redo(): void {
    return;
  }
}
