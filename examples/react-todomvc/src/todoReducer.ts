// examples/react-todomvc/src/todoReducer.ts
import { JSONArray, JSONObject } from '@yorkie-js/react';
import { Todo } from './model';

export type TodoAction =
  | { type: 'ADDED_TODO'; payload: { text: string } }
  | { type: 'DELETED_TODO'; payload: { id: number } }
  | { type: 'EDITED_TODO'; payload: { id: number; text: string } }
  | { type: 'COMPLETED_TODO'; payload: { id: number } }
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
        id: Math.floor(Date.now() / 1000),
        completed: false,
        text,
      });
      break;
    }

    case 'DELETED_TODO': {
      const { id } = action.payload;
      let target: (Todo & JSONObject<Todo>) | undefined;
      for (const todo of root.todos) {
        if (todo.id === id) {
          target = todo as Todo & JSONObject<Todo>;
          break;
        }
      }
      if (target) {
        root.todos.deleteByID!(target.getID!());
      }
      break;
    }

    case 'EDITED_TODO': {
      const { id, text } = action.payload;
      let target;
      for (const todo of root.todos) {
        if (todo.id === id) {
          target = todo;
          break;
        }
      }
      if (target) {
        target.text = text;
      }
      break;
    }

    case 'COMPLETED_TODO': {
      const { id } = action.payload;
      let target;
      for (const todo of root.todos) {
        if (todo.id === id) {
          target = todo;
          break;
        }
      }
      if (target) {
        target.completed = !target.completed;
      }
      break;
    }

    case 'CLEARED_COMPLETED': {
      for (const todo of root.todos) {
        if (todo.completed) {
          const t = todo as Todo & JSONObject<Todo>;
          root.todos.deleteByID!(t.getID!());
        }
      }
      break;
    }

    case 'TOGGLED_ALL': {
      const allCompleted = root.todos.every((todo) => todo.completed);
      for (const todo of root.todos) {
        todo.completed = !allCompleted;
      }
      break;
    }

    default:
      break;
  }
}
