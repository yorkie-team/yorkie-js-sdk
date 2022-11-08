import React, { useState } from 'react';
import classnames from 'classnames';

interface TodoInputProps {
  onSave: Function;
  placeholder?: string;
  editing?: boolean;
  text?: string;
  newTodo?: boolean;
}

export default function TodoTextInput(props: TodoInputProps) {
  const [text, setText] = useState(props.text || '');

  return (
    <input
      className={classnames({
        edit: props.editing,
        'new-todo': props.newTodo,
      })}
      type="text"
      placeholder={props.placeholder}
      value={text}
      onBlur={(e: React.FocusEvent<HTMLInputElement>) => {
        if (!props.newTodo) {
          props.onSave(e.target.value);
        }
      }}
      onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
        setText(e.target.value);
      }}
      onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
        const target = e.target as HTMLInputElement;
        if (e.which === 13) {
          props.onSave(target.value.trim());
          if (props.newTodo) {
            setText('');
          }
        }
      }}
    />
  );
}
