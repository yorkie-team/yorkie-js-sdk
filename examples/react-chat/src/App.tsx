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
  readChannels,
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

// "Open another tab" must land in this room even after midnight UTC, when a
// fresh load would pick the next day's key.
const roomUrl = (() => {
  const url = new URL(window.location.href);
  url.searchParams.set('key', prefix);
  return url.toString();
})();

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
  const [channelReady, setChannelReady] = useState(false);
  const [switchFailed, setSwitchFailed] = useState(false);
  const [focusSwitch, setFocusSwitch] = useState(false);
  const offlineRef = useRef(false);
  const typing = useRef(false);
  const channelDoc = useRef<Document<ChannelRoot> | undefined>(undefined);
  const railTrigger = useRef<HTMLButtonElement | undefined>(undefined);

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

  const closeRail = useCallback(() => {
    setRailOpen(false);
    railTrigger.current?.focus();
  }, []);

  const openChannel = useCallback(
    (channelId: string) => {
      if (channelId === openId) {
        closeRail();
        return;
      }
      // The trigger belongs to the channel view being replaced: the new one
      // takes focus on its own channel button instead.
      setFocusSwitch(railOpen);
      setRailOpen(false);
      setOpenId(channelId);
      typing.current = false;
      update((_, presence) => presence.set({ channelId, typing: false }));
    },
    [closeRail, openId, railOpen, update],
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
    setChannelReady(!!doc);
  }, []);

  // Back online, marks come off once the channel's changes are actually
  // pushed, which can be later than the switch when the server is slow.
  useEffect(() => {
    const ch = channelDoc.current;
    if (offline || pendingIds.size === 0 || !ch || !channelReady) return;
    return ch.subscribe('sync', (event) => {
      if (event.value === 'synced' && !ch.hasLocalChanges()) {
        setPendingIds(new Set());
      }
    });
  }, [offline, pendingIds, channelReady]);

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
    setSwitchFailed(false);
    if (!offlineRef.current) {
      // From here on, write as if offline: no typing flags, and what is sent
      // is marked until it is pushed.
      offlineRef.current = true;
      try {
        // Clear "is typing" first, while the others can still hear it.
        typing.current = false;
        update((_, presence) => presence.set({ typing: false }));
        await client.sync(ws);
        await client.changeSyncMode(ch, SyncMode.Manual);
        await client.changeSyncMode(ws, SyncMode.Manual);
        setOffline(true);
      } catch (err) {
        console.error('Could not go offline', err);
        offlineRef.current = false;
        setSwitchFailed(true);
        await Promise.allSettled([
          client.changeSyncMode(ch, SyncMode.Realtime),
          client.changeSyncMode(ws, SyncMode.Realtime),
        ]);
      }
    } else {
      try {
        await client.changeSyncMode(ch, SyncMode.Realtime);
        await client.changeSyncMode(ws, SyncMode.Realtime);
      } catch (err) {
        // Stay offline as a whole rather than half online.
        console.error('Could not go online', err);
        setSwitchFailed(true);
        await Promise.allSettled([
          client.changeSyncMode(ch, SyncMode.Manual),
          client.changeSyncMode(ws, SyncMode.Manual),
        ]);
        setSwitching(false);
        return;
      }
      offlineRef.current = false;
      setOffline(false);
      // Realtime pushes what waited; this sync only tells us when. If it
      // fails, the marks stay until a later sync succeeds (effect above).
      const [pushed] = await Promise.allSettled([
        client.sync(ch),
        client.sync(ws),
      ]);
      if (pushed.status === 'fulfilled' && !ch.hasLocalChanges()) {
        setPendingIds(new Set());
      }
    }
    setSwitching(false);
  };

  const channels = useMemo(() => readChannels(root.channels), [root.channels]);
  const channel = channels.find((c) => c.id === openId) ?? channels[0];
  const channelSeed = useMemo(
    () => seedRoot(channel.id, new Date()),
    [channel.id],
  );

  let status: Status = 'offline';
  if (error) status = 'error';
  else if (loading) status = 'connecting';
  else if (offline) status = 'offline';
  else if (connection === 'connected') status = 'connected';

  return (
    <div className="chat">
      <ExampleHeader title="React Chat" status={status} href={roomUrl}>
        {!loading && !error && (
          <button
            type="button"
            className="switch"
            data-online={!offline || undefined}
            disabled={switching || !channelReady}
            title={
              !channelReady && !switching
                ? 'Wait for the channel to open'
                : undefined
            }
            onClick={toggleOffline}
          >
            <span className="switch__track" aria-hidden="true">
              <span className="switch__thumb" />
            </span>
            {offline ? 'Go online' : 'Go offline'}
          </button>
        )}
        {switchFailed && (
          <span className="switch__error" role="alert">
            Couldn&rsquo;t switch. Try again.
          </span>
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
            channels={channels}
            people={people}
            me={me}
            openId={openId}
            onOpen={openChannel}
            offline={offline}
            busy={switching || !channelReady}
            open={railOpen}
            onClose={closeRail}
          />
          {railOpen && (
            <button
              type="button"
              className="scrim"
              aria-label="Close channels"
              tabIndex={-1}
              onClick={closeRail}
            />
          )}
          <DocumentProvider<ChannelRoot>
            key={channel.id}
            docKey={channelKey(prefix, channel.id)}
            initialRoot={channelSeed}
            disablePresence
          >
            <ChannelView
              channel={channel}
              me={me}
              people={people}
              offline={offline}
              switching={switching}
              focusSwitch={focusSwitch}
              pendingIds={pendingIds}
              setTyping={setTyping}
              onWrite={onWrite}
              onDoc={onDoc}
              onShowChannels={(trigger) => {
                railTrigger.current = trigger;
                setRailOpen(true);
              }}
            />
          </DocumentProvider>
        </div>
      )}
    </div>
  );
}
