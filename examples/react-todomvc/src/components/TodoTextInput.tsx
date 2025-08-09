import React, { useState } from 'react';

interface TodoInputProps {
  onSave: (text: string) => void;
  placeholder?: string;
  editing?: boolean;
}

const sanitize = (text: string) => {
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#x27;',
    '/': '&#x2F;',
  };
  const reg = /[&<>"'/]/gi;
  return text.replace(reg, (match: string) => map[match as keyof typeof map]);
};

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
          onSave(sanitize(text.trim()));
          setText('');
        }
      }}
    />
  );
}
