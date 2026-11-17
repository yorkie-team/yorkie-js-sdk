import { useEffect, useRef, useState } from 'react';
import { type Document, useDocument } from '@yorkie-js/react';
import Composer from './Composer';
import { ChevronIcon } from './icons';
import MessageList from './MessageList';
import {
  addMessage,
  addReply,
  type ChannelInfo,
  type ChannelRoot,
  type ChatPresence,
  emptyReactions,
  type Message,
  newId,
  toggleReaction,
} from './model';
import ThreadSheet from './ThreadSheet';

type Props = {
  channel: ChannelInfo;
  me: ChatPresence;
  people: Array<ChatPresence>;
  pendingIds: Set<string>;
  setTyping: (typing: boolean) => void;
  /** Called with each id this pane writes, so it can be marked while offline. */
  onWrite: (id: string) => void;
  /** Hands the channel document up, for the offline switch. */
  onDoc: (doc: Document<ChannelRoot> | undefined) => void;
  onShowChannels: () => void;
};

function typingLine(names: Array<string>): string {
  if (names.length === 1) return `${names[0]} is typing…`;
  if (names.length === 2) return `${names[0]} and ${names[1]} are typing…`;
  return 'Several people are typing…';
}

/**
 * `ChannelView` is the open channel: its document's messages, the typing
 * line from the workspace presence, the message box and the thread sheet.
 */
export default function ChannelView({
  channel,
  me,
  people,
  pendingIds,
  setTyping,
  onWrite,
  onDoc,
  onShowChannels,
}: Props) {
  const { doc, root, update, loading, error } = useDocument<ChannelRoot>();
  const [threadId, setThreadId] = useState<string | undefined>(undefined);
  const threadTrigger = useRef<HTMLButtonElement | undefined>(undefined);

  useEffect(() => {
    onDoc(doc);
    return () => onDoc(undefined);
  }, [doc, onDoc]);

  const here = people.filter((p) => p.channelId === channel.id);
  const typers = here
    .filter((p) => p.typing && p.userId !== me.userId)
    .map((p) => p.name);
  const messages = root.messages ?? [];
  const thread = threadId ? messages.find((m) => m.id === threadId) : undefined;

  const author = () => ({
    id: newId(),
    userId: me.userId,
    name: me.name,
    color: me.color,
    at: new Date().toISOString(),
  });

  const send = (text: string) => {
    const m: Message = {
      ...author(),
      text,
      reactions: emptyReactions(),
      replies: [],
    };
    update((root) => addMessage(root, m));
    onWrite(m.id);
  };

  const reply = (text: string) => {
    if (!threadId) return;
    const r = { ...author(), text };
    update((root) => addReply(root, threadId, r));
    onWrite(r.id);
  };

  const closeThread = () => {
    setThreadId(undefined);
    threadTrigger.current?.focus();
  };

  return (
    <main className="channel" aria-label={`#${channel.name}`}>
      <div className="channel__head">
        <button
          type="button"
          className="channel__switch"
          aria-label={`#${channel.name}, show channels`}
          onClick={onShowChannels}
        >
          <span className="rail__hash" aria-hidden="true">
            #
          </span>
          {channel.name}
          <ChevronIcon />
        </button>
        <h2 className="channel__title">
          <span className="rail__hash" aria-hidden="true">
            #
          </span>
          {channel.name}
        </h2>
        <p className="channel__here">{here.length} here now</p>
      </div>

      {error ? (
        <p className="state-message" role="alert">
          Couldn&rsquo;t open #{channel.name}. Reload to try again.
        </p>
      ) : loading ? (
        <p className="state-message">Opening #{channel.name}…</p>
      ) : messages.length === 0 ? (
        <p className="state-message">No messages yet. Say hello.</p>
      ) : (
        <MessageList
          messages={messages}
          me={me}
          pendingIds={pendingIds}
          onReact={(id, emoji) =>
            update((root) => toggleReaction(root, id, emoji, me.userId))
          }
          onOpenThread={(id, trigger) => {
            threadTrigger.current = trigger;
            setThreadId(id);
          }}
        />
      )}

      <p className="typing" aria-live="polite">
        {typers.length > 0 && typingLine(typers)}
      </p>
      <Composer
        label={`Message #${channel.name}`}
        placeholder={`Message #${channel.name}`}
        onSend={send}
        onTyping={setTyping}
      />

      {thread && (
        <ThreadSheet
          key={thread.id}
          message={thread}
          pendingIds={pendingIds}
          onReply={reply}
          onClose={closeThread}
        />
      )}
    </main>
  );
}
