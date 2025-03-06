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
  const { root, update, loading, error } = useDocument<{
    todos: JSONArray<Todo>;
  }>();

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

  useEffect(() => {
    const client = new yorkie.Client(import.meta.env.VITE_YORKIE_API_ADDR, {
      apiKey: import.meta.env.VITE_YORKIE_API_KEY,
    });

    window.addEventListener('beforeunload', () => {
      client.deactivate({ keepalive: true });
    });

    /**
     * `attachDoc` is a helper function to attach the document into the client.
     */
    async function attachDoc(
      doc: Document<{ todos: JSONArray<Todo> }>,
      callback: (todos: any) => void,
    ) {
      // 01. create client with RPCAddr then activate it.
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
      <MainSection todos={root.todos} actions={actions} />
    </div>
  );
}
