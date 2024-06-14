import type { CommandType, HistoryType } from './types';

const history: HistoryType = {
  undoStack: [],
  redoStack: [],
};

const useUndoRedo = () => {
  const { undoStack, redoStack } = history;

  const push = (command: CommandType) => {
    undoStack.push(command);
    redoStack.length = 0;
  };

  const undo = () => {
    if (undoStack.length === 0) return;
    const command: CommandType | undefined = undoStack.pop();
    if (command) {
      command.undo();
      redoStack.push(command);
    }
  };

  const redo = () => {
    if (redoStack.length === 0) return;
    const command: CommandType | undefined = redoStack.pop();
    if (command) {
      command.redo();
      undoStack.push(command);
    }
  };

  return { push, undo, redo };
};

export default useUndoRedo;
