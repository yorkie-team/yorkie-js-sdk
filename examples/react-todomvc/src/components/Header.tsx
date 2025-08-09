import React from 'react';
import TodoTextInput from './TodoTextInput';
import { TodoAction } from '../todoReducer';

interface HeaderProps {
  dispatch: (action: TodoAction) => void;
}

export default function Header({dispatch}: HeaderProps) {
  const addTodo = (text: string) => {
    dispatch({ type: 'ADDED_TODO', payload: { text } });
  };

  return (
    <header className="header">
      <h1>todos</h1>
      <TodoTextInput
        onSave={(text: string) => {
          if (text.length !== 0) {
            addTodo(text);
          }
        }}
        placeholder="What needs to be done?"
      />
    </header>
  );
}
