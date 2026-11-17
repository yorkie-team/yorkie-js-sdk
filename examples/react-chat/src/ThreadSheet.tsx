import { useEffect, useRef } from 'react';
import Composer from './Composer';
import { CloseIcon } from './icons';
import { Avatar, MessageBody } from './MessageList';
import type { Message } from './model';

type Props = {
  message: Message;
  pendingIds: Set<string>;
  onReply: (text: string) => void;
  onClose: () => void;
};

/**
 * `ThreadSheet` is a message's thread, over the message column: the message
 * on top, its replies, and a reply box.
 */
export default function ThreadSheet({
  message,
  pendingIds,
  onReply,
  onClose,
}: Props) {
  const list = useRef<HTMLOListElement>(null);

  useEffect(() => {
    const el = list.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [message.replies.length]);

  return (
    <aside
      className="thread"
      aria-label={`Thread on ${message.name}'s message`}
      onKeyDown={(e) => e.key === 'Escape' && onClose()}
    >
      <div className="thread__head">
        <h2 className="thread__title">Thread</h2>
        <button
          type="button"
          className="icon-button"
          aria-label="Close thread"
          onClick={onClose}
        >
          <CloseIcon />
        </button>
      </div>
      <ol ref={list} className="messages thread__messages">
        <li className="message thread__parent">
          <Avatar person={message} />
          <div className="message__main">
            <MessageBody
              message={message}
              pending={pendingIds.has(message.id)}
            />
          </div>
        </li>
        <li className="thread__count">
          {message.replies.length === 0
            ? 'No replies yet'
            : `${message.replies.length} ${message.replies.length === 1 ? 'reply' : 'replies'}`}
        </li>
        {message.replies.map((r) => (
          <li key={r.id} className="message">
            <Avatar person={r} />
            <div className="message__main">
              <MessageBody message={r} pending={pendingIds.has(r.id)} />
            </div>
          </li>
        ))}
      </ol>
      <Composer label="Reply" placeholder="Reply…" onSend={onReply} autoFocus />
    </aside>
  );
}
