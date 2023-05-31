import React, { useState, useEffect } from 'react';
import yorkie, { Document, JSONArray } from 'yorkie-js-sdk';
import 'todomvc-app-css/index.css';

import Header from './Header';
import MainSection from './MainSection';
import { Todo } from './model';
import './App.css';

const initialState = [
  {
    id: 0,
    text: 'Yorkie JS SDK',
    completed: false,
  },
  {
    id: 1,
    text: 'Garbage collection',
    completed: false,
  },
  {
    id: 2,
    text: 'RichText datatype',
    completed: false,
  },
] as Array<Todo>;

/**
 * `App` is the root component of the application.
 */
export default function App() {
  const [doc] = useState<Document<{ todos: JSONArray<Todo> }>>(
    () =>
      new yorkie.Document<{ todos: JSONArray<Todo> }>(
        `react-todomvc-${new Date()
          .toISOString()
          .substring(0, 10)
          .replace(/-/g, '')}`,
      ),
  );
  const [todos, setTodos] = useState<Array<Todo>>([]);

  const actions = {
    addTodo: (text: string) => {
      doc?.update((root) => {
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
      doc?.update((root) => {
        let target;
        for (const todo of root.todos) {
          if (todo.id === id) {
            target = todo as any;
            break;
          }
        }
        if (target) {
          root.todos.deleteByID!(target.getID());
        }
      });
    },
    editTodo: (id: number, text: string) => {
      doc?.update((root) => {
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
      doc?.update((root) => {
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
      doc?.update((root) => {
        for (const todo of root.todos) {
          if (todo.completed) {
            const t = todo as any;
            root.todos.deleteByID!(t.getID());
          }
        }
      }, '');
    },
  };

  useEffect(() => {
    const client = new yorkie.Client(import.meta.env.VITE_YORKIE_API_ADDR, {
      apiKey: import.meta.env.VITE_YORKIE_API_KEY,
    });

    /**
     * `attachDoc` is a helper function to attach the document into the client.
     */
    async function attachDoc(
      doc: Document<{ todos: JSONArray<Todo> }>,
      callback: (todos: any) => void,
    ) {
      // 01. create client with RPCAddr(envoy) then activate it.
      await client.activate();

      // 02. attach the document into the client.
      await client.attach(doc);

      // 03. create default todos if not exists.
      doc.update((root) => {
        if (!root.todos) {
          root.todos = initialState;
        }
      }, 'create default todos if not exists');

      // 04. subscribe change event from local and remote.
      doc.subscribe((event) => {
        callback(doc.getRoot().todos);
      });

      // 05. set todos  the attached document.
      callback(doc.getRoot().todos);
    }

    attachDoc(doc, (todos) => {
      setTodos(todos);
    });
  }, []);

  return (
    <div className="App">
      <Header addTodo={actions.addTodo} />
      <MainSection todos={todos} actions={actions} />
    </div>
  );
}
