import { useDocument, JSONArray, JSONObject } from '@yorkie-js/react';
import 'todomvc-app-css/index.css';

import Header from './Header';
import MainSection from './MainSection';
import { Todo } from './model';
import './App.css';

/**
 * `App` is the root component of the application.
 */
export default function App() {
  const { root, update, loading, error } = useDocument<{
    todos: JSONArray<Todo>;
  }>(
    import.meta.env.VITE_YORKIE_API_KEY,
    `react-todomvc-${new Date().toISOString().substring(0, 10).replace(/-/g, '')}`,
    {
      todos: [
        { id: 0, text: 'Yorkie JS SDK', completed: false },
        { id: 1, text: 'Garbage collection', completed: false },
        { id: 2, text: 'RichText datatype', completed: false },
      ],
    },
    {
      rpcAddr: import.meta.env.VITE_YORKIE_API_ADDR,
    },
  );

  if (loading) {
    return <div>Loading...</div>;
  }

  if (error) {
    return <div>Error: {error.message}</div>;
  }

  const actions = {
    addTodo: (text: string) => {
      update((root) => {
        root.todos.push({
          id:
            root.todos.reduce((maxId, todo) => Math.max(todo.id, maxId), -1) +
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
