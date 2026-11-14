import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ChannelProvider,
  SyncMode,
  useChannel,
  usePeekChannel,
} from '@yorkie-js/react';
import type { Stock } from './stocks';
import type { RoomStatus } from './App';
import { ChevronLeft, Pencil } from './icons';

export type SubView = 'overview' | 'activity';
export type ProviderPosition = 'inside' | 'outside';

type LogEntry = {
  t: number;
  n: number;
  status: RoomStatus;
  source: SubView;
};

type Props = {
  stock: Stock;
  syncMode: SyncMode;
  heartbeatInterval: number;
  channelKey: string;
  writersChannelKey: string;
  subView: SubView;
  providerPosition: ProviderPosition;
  onStatus: (status: RoomStatus) => void;
  onChangeSubView: (view: SubView) => void;
  onBack: () => void;
  onCompose: () => void;
};

const TABS: ReadonlyArray<{ view: SubView; label: string }> = [
  { view: 'overview', label: 'Overview' },
  { view: 'activity', label: 'Activity' },
];

export default function StockDetail({
  stock,
  syncMode,
  heartbeatInterval,
  channelKey,
  writersChannelKey,
  subView,
  providerPosition,
  onStatus,
  onChangeSubView,
  onBack,
  onCompose,
}: Props) {
  // Bumping `joinCount` remounts the provider, which attaches the room again.
  const [joinCount, setJoinCount] = useState(0);
  const providerKey = `${channelKey}-${syncMode}-${heartbeatInterval}-${joinCount}`;
  const providerProps = {
    channelKey,
    syncMode,
    channelHeartbeatInterval: heartbeatInterval,
  };

  const [log, setLog] = useState<Array<LogEntry>>([]);
  const handleSession = useCallback(
    (n: number, status: RoomStatus, source: SubView) => {
      onStatus(status);
      setLog((prev) =>
        [...prev, { t: Date.now(), n, status, source }].slice(-12),
      );
    },
    [onStatus],
  );

  const card = (
    <WatcherCard
      stock={stock}
      subView={subView}
      onSession={handleSession}
      onRejoin={() => setJoinCount((c) => c + 1)}
    />
  );

  return (
    <div className="detail">
      <button className="back" type="button" onClick={onBack}>
        <ChevronLeft /> All stocks
      </button>
      <h1 className="page-title">
        {stock.name} <span className="ticker">{stock.ticker}</span>
      </h1>

      <div className="tab-bar">
        {TABS.map(({ view, label }) => (
          <button
            key={view}
            type="button"
            aria-pressed={subView === view}
            className="tab"
            onClick={() => onChangeSubView(view)}
          >
            {label}
          </button>
        ))}
      </div>

      {providerPosition === 'outside' ? (
        // One provider above the tabs: switching tabs keeps the room attached.
        <ChannelProvider key={providerKey} {...providerProps}>
          {card}
        </ChannelProvider>
      ) : (
        // One provider per tab: switching tabs detaches and attaches again.
        <ChannelProvider key={`${providerKey}-${subView}`} {...providerProps}>
          {card}
        </ChannelProvider>
      )}

      <WritersButton channelKey={writersChannelKey} onCompose={onCompose} />
      <SessionLog log={log} onClear={() => setLog([])} />
    </div>
  );
}

/**
 * `WritersButton` peeks the writers channel once when the page opens: it reads
 * the count without joining the channel.
 */
function WritersButton({
  channelKey,
  onCompose,
}: {
  channelKey: string;
  onCompose: () => void;
}) {
  const { sessionCount, loading, error } = usePeekChannel(channelKey);

  return (
    <div className="writer-cta-wrap">
      <button className="button" type="button" onClick={onCompose}>
        <Pencil /> Write a post
      </button>
      <span className="writer-cta-count">
        {loading
          ? 'Checking who is writing…'
          : error
            ? `Couldn't check who is writing: ${error.message}`
            : `${sessionCount.toLocaleString()} writing when you opened this page`}
      </span>
    </div>
  );
}

function WatcherCard({
  stock,
  subView,
  onSession,
  onRejoin,
}: {
  stock: Stock;
  subView: SubView;
  onSession: (n: number, status: RoomStatus, source: SubView) => void;
  onRejoin: () => void;
}) {
  const { sessionCount, loading, error, detach } = useChannel();
  const status: RoomStatus = error
    ? 'error'
    : loading
      ? 'connecting'
      : 'connected';

  const lastRef = useRef<string>('');
  useEffect(() => {
    const cur = `${sessionCount}-${status}`;
    if (lastRef.current !== cur) {
      lastRef.current = cur;
      onSession(sessionCount, status, subView);
    }
  }, [sessionCount, status, subView, onSession]);

  const [left, setLeft] = useState(false);
  const leave = useCallback(async () => {
    await detach();
    setLeft(true);
  }, [detach]);

  return (
    <div className="detail-card">
      <p className="detail-sub">
        {stock.market} market ·{' '}
        {subView === 'overview' ? 'Overview' : 'Activity'}
      </p>
      <p className="detail-count">
        <span className="big-num">
          {status === 'connected' && !left
            ? sessionCount.toLocaleString()
            : '–'}
        </span>
        <span className="big-label">
          {left ? 'You left this room' : 'watching right now'}
        </span>
      </p>
      {error && (
        <p className="detail-error" role="alert">
          Couldn't join this room. Check that the Yorkie server at{' '}
          {import.meta.env.VITE_YORKIE_API_ADDR ?? 'http://localhost:8080'} is
          running, then reload.
        </p>
      )}
      <div className="detach-controls">
        {left ? (
          <button className="secondary" type="button" onClick={onRejoin}>
            Rejoin room
          </button>
        ) : (
          <button
            className="secondary"
            type="button"
            onClick={leave}
            disabled={status !== 'connected'}
          >
            Leave room
          </button>
        )}
        <small className="muted">
          Leaving stops the heartbeat; the server drops your seat shortly after.
        </small>
      </div>
    </div>
  );
}

function SessionLog({
  log,
  onClear,
}: {
  log: Array<LogEntry>;
  onClear: () => void;
}) {
  return (
    <section className="session-log" aria-labelledby="session-log-title">
      <div className="session-log-header">
        <h2 id="session-log-title">Watcher count history</h2>
        <button className="secondary" type="button" onClick={onClear}>
          Clear
        </button>
      </div>
      {log.length === 0 ? (
        <p className="muted">No changes yet.</p>
      ) : (
        <ol>
          {log.map((entry, i) => (
            <li key={i}>
              <code>{new Date(entry.t).toLocaleTimeString()}</code>{' '}
              {entry.source === 'overview' ? 'Overview' : 'Activity'} ·{' '}
              {entry.status === 'connected'
                ? `${entry.n} watching`
                : entry.status === 'connecting'
                  ? 'joining…'
                  : 'error'}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
