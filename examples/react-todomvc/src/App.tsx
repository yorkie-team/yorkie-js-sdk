import { JSONArray, JSONObject, useDocument } from '@yorkie-js/react';

import Header from './Header';
import MainSection from './MainSection';
import { Todo } from './model';
import './App.css';

import 'todomvc-app-css/index.css';

/**
 * `App` is the root component of the application.
 */
export default function App() {
  const { root, update, loading, error } = useDocument<
    { todos: JSONArray<Todo> },
    any
  >();

  if (loading) return <div>Loading...</div>;
  if (error) return <div>Error: {error.message}</div>;

  const actions = {
    addTodo: (text: string) => {
      update((root) => {
        root.todos.push({
          id:
            root.todos.reduce((maxID, todo) => Math.max(todo.id, maxID), -1) +
            1,
          completed: false,
          text,
        });
      });
    },
    deleteTodo: (id: number) => {
      update((root) => {
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
      });
    },
    editTodo: (id: number, text: string) => {
      update((root) => {
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
      });
    },
    completeTodo: (id: number) => {
      update((root) => {
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
      });
    },
    clearCompleted: () => {
      update((root) => {
        for (const todo of root.todos) {
          if (todo.completed) {
            const t = todo as Todo & JSONObject<Todo>;
            root.todos.deleteByID!(t.getID!());
          }
        }
      });
    },
  };

  return (
    <div className="App">
      <Header addTodo={actions.addTodo} />
      <MainSection todos={root.todos} actions={actions} />
    </div>
  );
}
