import React, { useState } from 'react';
import classnames from 'classnames';
import { Todo } from './model';
import TodoTextInput from './TodoTextInput';

interface TodoItemProps {
  todo: Todo;
  editTodo: Function;
  deleteTodo: Function;
  completeTodo: Function;
}

export default function TodoItem(props: TodoItemProps) {
  const [editing, setEditing] = useState(false);
  const { todo, completeTodo, editTodo, deleteTodo } = props;
 
  return (
    <li
      className={classnames({
        completed: todo.completed,
        editing,
      })}
    >
      {editing ? (
        <TodoTextInput
          text={todo.text}
          editing={editing}
          onSave={(text: string) => {
            if (text.length === 0) {
              deleteTodo(todo.id);
            } else {
              editTodo(todo.id, text);
            }
            setEditing(false);
          }}
        />
      ) : (
        <div className="view">
          <input
            id={`item-input-${todo.id}`}
            className="toggle"
            type="checkbox"
            checked={todo.completed}
            onChange={() => completeTodo(todo.id)}
          />
          <label htmlFor={`item-input-${todo.id}`} onDoubleClick={() => setEditing(true)}>{todo.text}</label>
          <button type="button" aria-label="Delete" className="destroy" onClick={() => deleteTodo(todo.id)} />
        </div>
      )}
    </li>
  );
}
