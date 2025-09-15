import Header from './components/Header';
import MainSection from './components/MainSection';
import './App.css';

import 'todomvc-app-css/index.css';
import { useTodoReducer } from './useTodoReducer';
import { JSONArray } from '@yorkie-js/react';
import { Todo } from './model';

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
  const { root, dispatch, loading, error } = useTodoReducer(initialRoot);

  if (loading) return <div>Loading...</div>;
  if (error) return <div>Error: {error.message}</div>;

  return (
    <div className="App">
      <Header dispatch={dispatch} />
      <MainSection todos={root.todos} dispatch={dispatch} />
    </div>
  );
}
