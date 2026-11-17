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
  readMessages,
  toggleReaction,
} from './model';
import ThreadSheet from './ThreadSheet';

type Props = {
  channel: ChannelInfo;
  me: ChatPresence;
  people: Array<ChatPresence>;
  offline: boolean;
  /** Going on or offline: hold the box so nothing lands mid-switch. */
  switching: boolean;
  /** Take focus on the channel button: the rail it was opened from closed. */
  focusSwitch: boolean;
  pendingIds: Set<string>;
  setTyping: (typing: boolean) => void;
  /** Called with each id this pane writes, so it can be marked while offline. */
  onWrite: (id: string) => void;
  /** Hands the channel document up once attached, for the offline switch. */
  onDoc: (doc: Document<ChannelRoot> | undefined) => void;
  onShowChannels: (trigger: HTMLButtonElement) => void;
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
  offline,
  switching,
  focusSwitch,
  pendingIds,
  setTyping,
  onWrite,
  onDoc,
  onShowChannels,
}: Props) {
  const { doc, root, update, loading, error } = useDocument<ChannelRoot>();
  const [threadId, setThreadId] = useState<string | undefined>(undefined);
  const threadTrigger = useRef<HTMLButtonElement | undefined>(undefined);
  const switchButton = useRef<HTMLButtonElement>(null);
  const ready = !!doc && !loading && !error;

  useEffect(() => {
    onDoc(ready ? doc : undefined);
    return () => onDoc(undefined);
  }, [ready, doc, onDoc]);

  useEffect(() => {
    if (focusSwitch) switchButton.current?.focus();
    // Only on mount: this view is keyed by channel.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const here = people.filter((p) => p.channelId === channel.id);
  const typers = here.filter((p) => p.typing && p.userId !== me.userId);
  // Read through `readMessages`: in a public room `messages` itself may be
  // anything, not only the messages in it.
  const messages = readMessages(root.messages);
  const thread = threadId ? messages.find((m) => m.id === threadId) : undefined;

  // If the thread's message goes away under it (trimmed past the cap by
  // someone else), `thread` is undefined and the sheet simply closes.

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
          ref={switchButton}
          type="button"
          className="channel__switch"
          aria-label={`#${channel.name}, show channels`}
          onClick={(e) => onShowChannels(e.currentTarget)}
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
        <p className="channel__here">
          {offline ? 'Offline' : `${here.length} here now`}
        </p>
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
        {typers.length > 0 && (
          <>
            <span className="typing__dots" aria-hidden="true">
              {typers.slice(0, 3).map((p) => (
                <span key={p.userId} className="dot" data-color={p.color} />
              ))}
            </span>
            {typingLine(typers.map((p) => p.name))}
          </>
        )}
      </p>
      <Composer
        label={`Message #${channel.name}`}
        placeholder={
          ready ? `Message #${channel.name}` : `Opening #${channel.name}…`
        }
        onSend={send}
        onTyping={setTyping}
        disabled={!ready || switching}
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
