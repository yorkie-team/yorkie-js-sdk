import 'todomvc-app-css/index.css';
import './App.css';

import { JSONArray } from '@yorkie-js/react';
import ExampleHeader, { type Status } from './ExampleHeader';
import Header from './components/Header';
import MainSection from './components/MainSection';
import { Todo } from './model';
import { useTodoReducer } from './useTodoReducer';

const initialRoot = {
  todos: [
    { id: crypto.randomUUID(), text: 'Yorkie JS SDK', completed: false },
    { id: crypto.randomUUID(), text: 'Garbage collection', completed: false },
    { id: crypto.randomUUID(), text: 'RichText datatype', completed: false },
  ],
} as { todos: JSONArray<Todo> };

/**
 * `App` is the root component of the application.
 */
export default function App() {
  const { root, dispatch, connection, loading, error } =
    useTodoReducer(initialRoot);

  let status: Status = 'offline';
  if (error) status = 'error';
  else if (loading) status = 'connecting';
  else if (connection === 'connected') status = 'connected';

  return (
    <>
      <ExampleHeader title="React TodoMVC" status={status} />
      <main className="page">
        {error ? (
          <p className="state-message" role="alert">
            Couldn't reach the Yorkie server at{' '}
            {import.meta.env.VITE_YORKIE_API_ADDR}. Check that it's running,
            then reload.
          </p>
        ) : loading ? (
          <p className="state-message">Loading the shared todo list…</p>
        ) : (
          <>
            <section className="todoapp">
              <Header dispatch={dispatch} />
              <MainSection todos={root.todos} dispatch={dispatch} />
            </section>
            <footer className="info">
              <p>Double-click to edit a todo</p>
            </footer>
          </>
        )}
      </main>
    </>
  );
}
