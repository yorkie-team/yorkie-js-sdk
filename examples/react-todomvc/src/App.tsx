import Header from './components/Header';
import MainSection from './components/MainSection';
import './App.css';

import 'todomvc-app-css/index.css';
import { useTodoReducer } from './useTodoReducer';
import { useEffect } from 'react';

const initialRoot = {
  todos: [
    { id: crypto.randomUUID(), text: 'Yorkie JS SDK', completed: false },
    { id: crypto.randomUUID(), text: 'Garbage collection', completed: false },
    { id: crypto.randomUUID(), text: 'RichText datatype', completed: false },
  ],
};

/**
 * `App` is the root component of the application.
 */
export default function App() {
  const { root, dispatch, loading, error } = useTodoReducer(initialRoot);

  useEffect(() => {
    console.log(root.todos.join('\n'));
  }, [root.todos]);

  if (loading) return <div>Loading...</div>;
  if (error) return <div>Error: {error.message}</div>;

  return (
    <div className="App">
      <Header dispatch={dispatch} />
      <MainSection todos={root.todos} dispatch={dispatch} />
    </div>
  );
}
