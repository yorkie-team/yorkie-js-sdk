import { JSONArray, JSONObject, useYorkieDoc } from '@yorkie-js/react';

import Header from './components/Header';
import MainSection from './MainSection';
import { Todo } from './model';
import './App.css';

import 'todomvc-app-css/index.css';
import { useTodoReducer } from './useTodoReducer';
import { useEffect } from 'react';

const initialRoot = {
  todos: [
    { id: 0, text: 'Yorkie JS SDK', completed: false },
    { id: 1, text: 'Garbage collection', completed: false },
    { id: 2, text: 'RichText datatype', completed: false },
  ],
};

/**
 * `App` is the root component of the application.
 */
export default function App() {
  const { root, dispatch, loading, error } = useTodoReducer(initialRoot);

  useEffect(() => {
    console.log(root.todos.toString());
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
