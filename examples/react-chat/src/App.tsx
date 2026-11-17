import './App.css';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  DocumentProvider,
  useDocument,
  YorkieProvider,
} from '@yorkie-js/react';
import ExampleHeader, { type Status } from './ExampleHeader';
import ChannelRail from './ChannelRail';
import ChannelView from './ChannelView';
import {
  channelKey,
  type ChannelRoot,
  type ChatPresence,
  defaultChannels,
  distinctFrom,
  makeUser,
  roomPrefix,
  seedRoot,
  type WorkspaceRoot,
} from './model';

const noop = () => {};

// One person per page load, made outside React so StrictMode's double render
// does not make two.
const prefix = roomPrefix(window.location.search, new Date());
const initialPresence: ChatPresence = {
  ...makeUser(),
  channelId: 'general',
  typing: false,
};

/**
 * `App` connects to Yorkie and attaches the workspace document, which stays
 * attached for the whole session: its root is the channel list and its
 * presence is who is in which channel and who is typing.
 */
export default function App() {
  return (
    <YorkieProvider
      apiKey={import.meta.env.VITE_YORKIE_API_KEY}
      rpcAddr={import.meta.env.VITE_YORKIE_API_ADDR}
    >
      <DocumentProvider<WorkspaceRoot, ChatPresence>
        docKey={prefix}
        initialRoot={{ channels: defaultChannels } as WorkspaceRoot}
        initialPresence={initialPresence}
      >
        <Workspace />
      </DocumentProvider>
    </YorkieProvider>
  );
}

function Workspace() {
  const { root, presences, update, connection, loading, error } = useDocument<
    WorkspaceRoot,
    ChatPresence
  >();
  const [openId, setOpenId] = useState(initialPresence.channelId);
  const settled = useRef(false);

  const people = useMemo(
    () => presences.map(({ presence }) => presence),
    [presences],
  );
  const me = useMemo<ChatPresence>(
    () =>
      people.find((p) => p.userId === initialPresence.userId) ?? {
        ...initialPresence,
        channelId: openId,
      },
    [people, openId],
  );

  // Once, on joining: move off a name or color someone here already has.
  useEffect(() => {
    if (loading || settled.current) return;
    settled.current = true;
    const others = people.filter((p) => p.userId !== me.userId);
    const next = distinctFrom(me, others);
    if (next.name !== me.name || next.color !== me.color) {
      update((_, presence) => presence.set(next));
    }
  }, [loading, people, me, update]);

  const [railOpen, setRailOpen] = useState(false);
  const typing = useRef(false);
  const noPending = useMemo(() => new Set<string>(), []);

  const openChannel = useCallback(
    (channelId: string) => {
      setOpenId(channelId);
      setRailOpen(false);
      typing.current = false;
      update((_, presence) => presence.set({ channelId, typing: false }));
    },
    [update],
  );

  // Presence changes go to everyone, so only send the typing flag when it
  // flips, not on every keystroke.
  const setTyping = useCallback(
    (next: boolean) => {
      if (typing.current === next) return;
      typing.current = next;
      update((_, presence) => presence.set({ typing: next }));
    },
    [update],
  );

  const channel =
    root.channels?.find((c) => c.id === openId) ?? defaultChannels[0];

  let status: Status = 'offline';
  if (error) status = 'error';
  else if (loading) status = 'connecting';
  else if (connection === 'connected') status = 'connected';

  return (
    <div className="chat">
      <ExampleHeader title="React Chat" status={status} />
      {error ? (
        <p className="state-message" role="alert">
          Couldn&rsquo;t reach the Yorkie server at{' '}
          {import.meta.env.VITE_YORKIE_API_ADDR}. Check that it&rsquo;s running,
          then reload.
        </p>
      ) : loading ? (
        <p className="state-message">Joining the workspace…</p>
      ) : (
        <div className="chat__body" data-rail-open={railOpen || undefined}>
          <ChannelRail
            channels={root.channels}
            people={people}
            me={me}
            openId={openId}
            onOpen={openChannel}
            disabled={false}
          />
          <DocumentProvider<ChannelRoot>
            key={channel.id}
            docKey={channelKey(prefix, channel.id)}
            initialRoot={seedRoot(channel.id, new Date())}
            disablePresence
          >
            <ChannelView
              channel={channel}
              me={me}
              people={people}
              pendingIds={noPending}
              setTyping={setTyping}
              onWrite={noop}
              onDoc={noop}
              onShowChannels={() => setRailOpen(true)}
            />
          </DocumentProvider>
        </div>
      )}
    </div>
  );
}
