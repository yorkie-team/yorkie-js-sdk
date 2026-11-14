import React, { useRef, useState } from 'react';

interface TodoInputProps {
  onSave: (text: string) => void;
  onCancel?: () => void;
  text?: string;
  placeholder?: string;
  editing?: boolean;
}

/**
 * `TodoTextInput` is the input for a new todo, or for editing an existing one
 * when `editing` is set: it saves on Enter or blur and cancels on Escape.
 */
export default function TodoTextInput({
  onSave,
  onCancel,
  text: initialText = '',
  placeholder,
  editing = false,
}: TodoInputProps) {
  const [text, setText] = useState(initialText);
  // Leaving edit mode unmounts the input, which can also fire a blur. This
  // makes sure an edit is saved or cancelled only once.
  const finished = useRef(false);

  const finishEditing = (save: boolean) => {
    if (finished.current) return;
    finished.current = true;
    if (save) {
      onSave(text.trim());
    } else {
      onCancel?.();
    }
  };

  return (
    <input
      className={editing ? 'edit' : 'new-todo'}
      type="text"
      placeholder={placeholder}
      aria-label={editing ? 'Edit todo' : placeholder}
      autoFocus
      value={text}
      onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
        setText(e.target.value);
      }}
      onBlur={() => {
        if (editing) finishEditing(true);
      }}
      onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
          if (editing) {
            finishEditing(true);
          } else {
            onSave(text.trim());
            setText('');
          }
        } else if (e.key === 'Escape' && editing) {
          finishEditing(false);
        }
      }}
    />
  );
}
