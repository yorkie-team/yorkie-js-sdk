import React from 'react';
import TodoTextInput from './TodoTextInput';

interface HeaderProps {
  addTodo: Function
}

export default function Header(props: HeaderProps) {
  return (
    <header className="header">
      <h1>todos</h1>
      <TodoTextInput
        newTodo
        onSave={(text: string) => {
          if (text.length !== 0) {
            props.addTodo(text);
          }
        }}
        placeholder="What needs to be done?"
      />
    </header>
  );
}
