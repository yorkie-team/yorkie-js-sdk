import React, { useState } from 'react';
import classnames from 'classnames';
import { Todo } from '../model';
import TodoTextInput from './TodoTextInput';
import { TodoAction } from '../todoReducer';

interface TodoItemProps {
  todo: Todo;
  dispatch: (action: TodoAction) => void;
}

export default function TodoItem({todo, dispatch}: TodoItemProps) {
  const [editing, setEditing] = useState(false);

  const deleteTodo = (id: number) => {
    dispatch({ type: 'DELETED_TODO', payload: { id } });
  };

  const editTodo = (id: number, text: string) => {
    dispatch({ type: 'EDITED_TODO', payload: { id, text } });
  };

  const completeTodo = (id: number) => {
    dispatch({ type: 'COMPLETED_TODO', payload: { id } });
  };

  return (
    <li
      className={classnames({
        completed: todo.completed,
        editing,
      })}
    >
      {editing ? (
        <TodoTextInput
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
          <label
            htmlFor={`item-input-${todo.id}`}
            onDoubleClick={() => setEditing(true)}
          >
            {todo.text}
          </label>
          <button
            type="button"
            aria-label="Delete"
            className="destroy"
            onClick={() => deleteTodo(todo.id)}
          />
        </div>
      )}
    </li>
  );
}
