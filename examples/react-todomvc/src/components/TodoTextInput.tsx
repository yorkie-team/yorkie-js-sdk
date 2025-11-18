import React, { useState } from 'react';

interface TodoInputProps {
  onSave: (text: string) => void;
  placeholder?: string;
  editing?: boolean;
}

/**
 * `TodoTextInput` is a component that allows the user to input a text.
 */
export default function TodoTextInput({ onSave, placeholder }: TodoInputProps) {
  const [text, setText] = useState('');

  return (
    <input
      className="new-todo"
      type="text"
      placeholder={placeholder}
      value={text}
      onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
        setText(e.target.value);
      }}
      onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
          onSave(text.trim());
          setText('');
        }
      }}
    />
  );
}
