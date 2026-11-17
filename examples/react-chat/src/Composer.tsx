import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { SendIcon } from './icons';
import { normalizeText, textMax, toSendable } from './model';

const idleMs = 3000;
const counterFrom = textMax - 50;

type Props = {
  label: string;
  placeholder: string;
  onSend: (text: string) => void;
  /** Called with `true` while there is text being written, `false` after. */
  onTyping?: (typing: boolean) => void;
  autoFocus?: boolean;
  /** Off until the document is attached: a write before that goes nowhere. */
  disabled?: boolean;
};

/**
 * `Composer` is the message box. Enter sends, Shift+Enter starts a new line,
 * and an Enter that ends an IME composition (Korean, Japanese, …) is left to
 * the IME.
 */
export default function Composer({
  label,
  placeholder,
  onSend,
  onTyping,
  autoFocus,
  disabled = false,
}: Props) {
  const [text, setText] = useState('');
  const idle = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const box = useRef<HTMLTextAreaElement>(null);
  // Count what would be sent, so pasted blanks do not block a message.
  const normalized = normalizeText(text);
  const clean = toSendable(normalized);
  const length = [...normalized].length;
  const tooLong = length > textMax;

  const stopTyping = () => {
    clearTimeout(idle.current);
    onTyping?.(false);
  };

  useEffect(() => () => clearTimeout(idle.current), []);

  // Grow with the text up to four lines, then scroll.
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 22 * 4 + 16)}px`;
  }, [text]);

  const change = (value: string) => {
    setText(value);
    if (!onTyping) return;
    clearTimeout(idle.current);
    if (normalizeText(value)) {
      onTyping(true);
      idle.current = setTimeout(() => onTyping(false), idleMs);
    } else {
      onTyping(false);
    }
  };

  const send = () => {
    if (!clean || tooLong || disabled) return;
    onSend(clean);
    setText('');
    stopTyping();
  };

  const keyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key !== 'Enter' || e.shiftKey) return;
    if (e.nativeEvent.isComposing || e.keyCode === 229) return;
    e.preventDefault();
    send();
  };

  return (
    <form
      className="composer"
      onSubmit={(e) => {
        e.preventDefault();
        send();
      }}
    >
      <textarea
        ref={box}
        className="composer__input"
        rows={1}
        aria-label={label}
        placeholder={placeholder}
        value={text}
        autoFocus={autoFocus}
        disabled={disabled}
        onChange={(e) => change(e.target.value)}
        onKeyDown={keyDown}
        onBlur={onTyping ? stopTyping : undefined}
      />
      {length >= counterFrom && (
        <span
          className="composer__count"
          data-over={tooLong || undefined}
          aria-live="polite"
        >
          {length}/{textMax}
        </span>
      )}
      <button
        type="submit"
        className="composer__send"
        aria-label="Send"
        disabled={!clean || tooLong || disabled}
      >
        <SendIcon />
      </button>
    </form>
  );
}
