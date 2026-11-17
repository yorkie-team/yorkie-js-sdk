import './App.css';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  type Document,
  DocumentProvider,
  SyncMode,
  useDocument,
  useYorkie,
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
  makeUser,
  resolveIdentity,
  roomPrefix,
  seedRoot,
  type WorkspaceRoot,
} from './model';

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
  const { client } = useYorkie();
  const {
    doc: workspaceDoc,
    root,
    presences,
    update,
    connection,
    loading,
    error,
  } = useDocument<WorkspaceRoot, ChatPresence>();
  const [openId, setOpenId] = useState(initialPresence.channelId);
  const [railOpen, setRailOpen] = useState(false);
  const [offline, setOffline] = useState(false);
  const [switching, setSwitching] = useState(false);
  const [pendingIds, setPendingIds] = useState<Set<string>>(() => new Set());
  const offlineRef = useRef(false);
  const typing = useRef(false);
  const channelDoc = useRef<Document<ChannelRoot> | undefined>(undefined);

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

  // Whenever someone arrives: if we clash with someone who joined earlier,
  // move to a free name and color. Panes opened together cannot see each
  // other when they pick, so this cannot be done only once.
  useEffect(() => {
    if (loading || offline) return;
    const others = people.filter((p) => p.userId !== me.userId);
    const next = resolveIdentity(me, others);
    if (next.name !== me.name || next.color !== me.color) {
      update((_, presence) => presence.set(next));
    }
  }, [loading, offline, people, me, update]);

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
  // flips, not on every keystroke, and not at all while offline, where it
  // would arrive late.
  const setTyping = useCallback(
    (next: boolean) => {
      if (offlineRef.current || typing.current === next) return;
      typing.current = next;
      update((_, presence) => presence.set({ typing: next }));
    },
    [update],
  );

  const onWrite = useCallback((id: string) => {
    if (offlineRef.current) setPendingIds((ids) => new Set(ids).add(id));
  }, []);

  const onDoc = useCallback((doc: Document<ChannelRoot> | undefined) => {
    channelDoc.current = doc;
  }, []);

  /**
   * Offline pauses both documents with `SyncMode.Manual`. That ends their
   * watch streams, so the others see this pane leave and it sees only itself;
   * what it writes meanwhile waits locally. Back online, both resume
   * `Realtime` and the waiting changes are pushed.
   */
  const toggleOffline = async () => {
    const ch = channelDoc.current;
    const ws = workspaceDoc;
    if (!client || !ch || !ws) return;
    setSwitching(true);
    try {
      if (!offlineRef.current) {
        // Clear "is typing" first, while the others can still hear it.
        typing.current = false;
        update((_, presence) => presence.set({ typing: false }));
        await client.sync(ws);
        await client.changeSyncMode(ch, SyncMode.Manual);
        await client.changeSyncMode(ws, SyncMode.Manual);
        offlineRef.current = true;
        setOffline(true);
      } else {
        await client.changeSyncMode(ch, SyncMode.Realtime);
        await client.changeSyncMode(ws, SyncMode.Realtime);
        offlineRef.current = false;
        setOffline(false);
        await client.sync(ch);
        await client.sync(ws);
        setPendingIds(new Set());
      }
    } finally {
      setSwitching(false);
    }
  };

  const channel =
    root.channels?.find((c) => c.id === openId) ?? defaultChannels[0];

  let status: Status = 'offline';
  if (error) status = 'error';
  else if (loading) status = 'connecting';
  else if (offline) status = 'offline';
  else if (connection === 'connected') status = 'connected';

  return (
    <div className="chat">
      <ExampleHeader title="React Chat" status={status}>
        {!loading && !error && (
          <button
            type="button"
            className="switch"
            data-online={!offline || undefined}
            disabled={switching}
            onClick={toggleOffline}
          >
            <span className="switch__track" aria-hidden="true">
              <span className="switch__thumb" />
            </span>
            {offline ? 'Go online' : 'Go offline'}
          </button>
        )}
      </ExampleHeader>
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
            offline={offline}
          />
          {railOpen && (
            <button
              type="button"
              className="scrim"
              aria-label="Close channels"
              onClick={() => setRailOpen(false)}
            />
          )}
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
              pendingIds={pendingIds}
              setTyping={setTyping}
              onWrite={onWrite}
              onDoc={onDoc}
              onShowChannels={() => setRailOpen(true)}
            />
          </DocumentProvider>
        </div>
      )}
    </div>
  );
}
