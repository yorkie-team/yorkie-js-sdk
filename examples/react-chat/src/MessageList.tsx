import { useLayoutEffect, useRef, useState } from 'react';
import { ReactIcon } from './icons';
import {
  type ChatPresence,
  emojis,
  type Message,
  reactionCount,
  type Reply,
} from './model';

// A message from the same person within this long of the one before it is
// drawn without its avatar and name, as chat apps do.
const groupMs = 5 * 60 * 1000;

const time = (at: string) =>
  at
    ? new Date(at).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      })
    : '';

export function Avatar({ person }: { person: Pick<Reply, 'name' | 'color'> }) {
  return (
    <span className="avatar" data-color={person.color} aria-hidden="true">
      {[...person.name][0]}
    </span>
  );
}

/** `MessageBody` is a message's name line and text, shared with the thread. */
export function MessageBody({
  message,
  pending,
  compact = false,
}: {
  message: Reply;
  pending: boolean;
  compact?: boolean;
}) {
  return (
    <>
      {!compact && (
        <p className="message__meta">
          <span className="message__name">{message.name}</span>
          {message.at && (
            <time className="message__time" dateTime={message.at}>
              {time(message.at)}
            </time>
          )}
        </p>
      )}
      <p className="message__text">{message.text}</p>
      {pending && <p className="message__pending">Not sent yet</p>}
    </>
  );
}

type Props = {
  /** Already read through `readMessages`. */
  messages: Array<Message>;
  me: ChatPresence;
  pendingIds: Set<string>;
  onReact: (messageId: string, emoji: string) => void;
  onOpenThread: (messageId: string, trigger: HTMLButtonElement) => void;
};

/**
 * `MessageList` draws the channel's messages, keeping the view pinned to the
 * newest one unless the reader has scrolled up.
 */
export default function MessageList({
  messages,
  me,
  pendingIds,
  onReact,
  onOpenThread,
}: Props) {
  const list = useRef<HTMLOListElement>(null);
  const pinned = useRef(true);
  const pickerTrigger = useRef<HTMLButtonElement | undefined>(undefined);
  const [pickerFor, setPickerFor] = useState<string | undefined>(undefined);
  useLayoutEffect(() => {
    const el = list.current;
    if (el && pinned.current) el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  const closePicker = () => {
    setPickerFor(undefined);
    pickerTrigger.current?.focus();
  };

  return (
    <ol
      ref={list}
      className="messages"
      aria-label="Messages"
      onScroll={(e) => {
        const el = e.currentTarget;
        pinned.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
      }}
    >
      {messages.map((m, i) => {
        const prev = i > 0 ? messages[i - 1] : undefined;
        const compact =
          !!prev &&
          prev.userId === m.userId &&
          !!m.at &&
          !!prev.at &&
          Date.parse(m.at) - Date.parse(prev.at) < groupMs;
        const used = Object.keys(m.reactions).filter(
          (emoji) => reactionCount(m.reactions[emoji]) > 0,
        );
        const replies = m.replies.length;
        return (
          <li
            key={m.id}
            className="message"
            data-compact={compact || undefined}
          >
            {compact ? <span className="avatar-gap" /> : <Avatar person={m} />}
            <div className="message__main">
              <MessageBody
                message={m}
                pending={pendingIds.has(m.id)}
                compact={compact}
              />
              {(used.length > 0 || replies > 0) && (
                <div className="message__extras">
                  {used.map((emoji) => {
                    const people = m.reactions[emoji];
                    const mine = !!people[me.userId];
                    const count = reactionCount(people);
                    return (
                      <button
                        key={emoji}
                        type="button"
                        className="reaction"
                        data-color={mine ? me.color : undefined}
                        aria-pressed={mine}
                        aria-label={`${emoji} ${count} ${count === 1 ? 'person' : 'people'}${mine ? ', including you' : ''}`}
                        onClick={() => onReact(m.id, emoji)}
                      >
                        <span aria-hidden="true">{emoji}</span>
                        <span className="reaction__count">{count}</span>
                      </button>
                    );
                  })}
                  {replies > 0 && (
                    <button
                      type="button"
                      className="message__replies"
                      onClick={(e) => onOpenThread(m.id, e.currentTarget)}
                    >
                      {replies} {replies === 1 ? 'reply' : 'replies'}
                    </button>
                  )}
                </div>
              )}
              {pickerFor === m.id && (
                <div
                  className="picker"
                  role="group"
                  aria-label="Add a reaction"
                  onKeyDown={(e) => e.key === 'Escape' && closePicker()}
                >
                  {emojis.map((emoji, j) => (
                    <button
                      key={emoji}
                      type="button"
                      className="picker__emoji"
                      autoFocus={j === 0}
                      aria-label={`React with ${emoji}`}
                      onClick={() => {
                        onReact(m.id, emoji);
                        closePicker();
                      }}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="message__actions">
              <button
                type="button"
                className="icon-button"
                aria-label="Add a reaction"
                aria-expanded={pickerFor === m.id}
                title="Add a reaction"
                onClick={(e) => {
                  pickerTrigger.current = e.currentTarget;
                  setPickerFor(pickerFor === m.id ? undefined : m.id);
                }}
              >
                <ReactIcon />
              </button>
              <button
                type="button"
                className="text-button"
                onClick={(e) => onOpenThread(m.id, e.currentTarget)}
              >
                Reply
              </button>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
