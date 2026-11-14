import { useState } from 'react';
import classnames from 'classnames';
import { Todo } from '../model';
import TodoTextInput from './TodoTextInput';
import { TodoAction } from '../todoReducer';

interface TodoItemProps {
  todo: Todo;
  dispatch: (action: TodoAction) => void;
}

export default function TodoItem({ todo, dispatch }: TodoItemProps) {
  const [editing, setEditing] = useState(false);

  const deleteTodo = (id: string) => {
    dispatch({ type: 'DELETED_TODO', payload: { id } });
  };

  const editTodo = (id: string, text: string) => {
    dispatch({ type: 'EDITED_TODO', payload: { id, text } });
  };

  const completeTodo = (id: string) => {
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
          editing
          text={todo.text}
          onSave={(text: string) => {
            // TodoMVC: saving an empty todo deletes it.
            if (text.length === 0) {
              deleteTodo(todo.id);
            } else if (text !== todo.text) {
              editTodo(todo.id, text);
            }
            setEditing(false);
          }}
          onCancel={() => setEditing(false)}
        />
      ) : (
        <div className="view">
          <input
            className="toggle"
            type="checkbox"
            aria-label={`Complete "${todo.text}"`}
            checked={todo.completed}
            onChange={() => completeTodo(todo.id)}
          />
          <label onDoubleClick={() => setEditing(true)}>{todo.text}</label>
          <button
            type="button"
            aria-label={`Delete "${todo.text}"`}
            className="destroy"
            onClick={() => deleteTodo(todo.id)}
          />
        </div>
      )}
    </li>
  );
}
