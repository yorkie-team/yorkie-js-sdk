// examples/react-todomvc/src/todoReducer.ts
import { JSONArray } from '@yorkie-js/react';
import { Todo } from './model';

export type TodoAction =
  | { type: 'ADDED_TODO'; payload: { text: string } }
  | { type: 'DELETED_TODO'; payload: { id: string } }
  | { type: 'EDITED_TODO'; payload: { id: string; text: string } }
  | { type: 'COMPLETED_TODO'; payload: { id: string } }
  | { type: 'CLEARED_COMPLETED' }
  | { type: 'TOGGLED_ALL' };

type TodoRoot = {
  todos: JSONArray<Todo>;
};

export function todoReducer(root: TodoRoot, action: TodoAction): void {
  switch (action.type) {
    case 'ADDED_TODO': {
      const { text } = action.payload;
      root.todos.push({
        id: crypto.randomUUID(),
        completed: false,
        text,
      });
      break;
    }

    case 'DELETED_TODO': {
      const { id } = action.payload;
      root.todos = root.todos.filter((todo) => todo.id !== id);
      break;
    }

    case 'EDITED_TODO': {
      const { id, text } = action.payload;
      root.todos.forEach((todo) => {
        if (todo.id === id) {
          todo.text = text;
        }
      });
      break;
    }

    case 'COMPLETED_TODO': {
      const { id } = action.payload;
      root.todos.forEach((todo) => {
        if (todo.id === id) {
          todo.completed = !todo.completed;
        }
      });
      break;
    }

    case 'CLEARED_COMPLETED': {
      root.todos = root.todos.filter((todo) => !todo.completed);
      break;
    }

    case 'TOGGLED_ALL': {
      const allCompleted = root.todos.every((todo) => todo.completed);
      root.todos.forEach((todo) => {
        todo.completed = !allCompleted;
      });
      break;
    }

    default:
      break;
  }
}
