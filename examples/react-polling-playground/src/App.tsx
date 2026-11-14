import { useCallback, useEffect, useMemo, useState } from 'react';
import { YorkieProvider, SyncMode } from '@yorkie-js/react';
import Leaderboard from './Leaderboard';
import StockDetail, {
  type SubView,
  type ProviderPosition,
} from './StockDetail';
import WritePostPage from './WritePostPage';
import { STOCKS } from './stocks';

type View = 'leaderboard' | 'stock' | 'write';
// `idle` means not in a room: on the stock list, or after leaving a room.
export type RoomStatus = 'idle' | 'connecting' | 'connected' | 'error';

const statusLabels: Record<RoomStatus, string> = {
  idle: 'Not in a room',
  connecting: 'Connecting…',
  connected: 'Connected',
  error: 'Error',
};

const sessionKey =
  new URLSearchParams(window.location.search).get('key') ||
  `trending-${new Date().toISOString().substring(0, 10).replace(/-/g, '')}`;

// The whole view state lives in the query string (`?stock=NVDA&view=write`),
// so reloads and deep links work wherever the example is hosted.
function readState(): { ticker: string | null; view: View; sub: SubView } {
  const params = new URLSearchParams(window.location.search);
  const stock = params.get('stock');
  const ticker = STOCKS.some((s) => s.ticker === stock) ? stock : null;
  const v = params.get('view');
  return {
    ticker,
    view: !ticker ? 'leaderboard' : v === 'write' ? 'write' : 'stock',
    sub: v === 'activity' ? 'activity' : 'overview',
  };
}

function pushQuery(changes: Record<string, string | null>) {
  const params = new URLSearchParams(window.location.search);
  for (const [name, value] of Object.entries(changes)) {
    if (value === null) params.delete(name);
    else params.set(name, value);
  }
  const query = params.toString();
  // A query-only URL keeps the current path, so sub-path deploys keep working.
  window.history.pushState(
    {},
    '',
    query ? `?${query}` : window.location.pathname,
  );
}

const MIN_HEARTBEAT_MS = 500;
const DEFAULT_HEARTBEAT_MS = 2000;

export default function App() {
  const [syncMode, setSyncMode] = useState<SyncMode>(SyncMode.Polling);
  const [heartbeat, setHeartbeat] = useState<number>(DEFAULT_HEARTBEAT_MS);
  const [heartbeatDraft, setHeartbeatDraft] = useState<string>(
    String(DEFAULT_HEARTBEAT_MS),
  );
  const [route, setRoute] = useState(readState);
  const [providerPosition, setProviderPosition] =
    useState<ProviderPosition>('inside');
  const [roomStatus, setRoomStatus] = useState<RoomStatus>('connecting');

  const commitHeartbeat = useCallback(() => {
    const next = Number(heartbeatDraft);
    if (Number.isFinite(next) && next >= MIN_HEARTBEAT_MS) {
      setHeartbeat(next);
      setHeartbeatDraft(String(next));
    } else {
      setHeartbeatDraft(String(heartbeat));
    }
  }, [heartbeatDraft, heartbeat]);

  useEffect(() => {
    const onPop = () => setRoute(readState());
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const navigate = useCallback((changes: Record<string, string | null>) => {
    pushQuery(changes);
    setRoute(readState());
  }, []);

  const apiKey = import.meta.env.VITE_YORKIE_API_KEY ?? '';
  const rpcAddr =
    import.meta.env.VITE_YORKIE_API_ADDR ?? 'http://localhost:8080';
  const yorkieOpts = useMemo(() => ({ apiKey, rpcAddr }), [apiKey, rpcAddr]);

  const selectedStock = STOCKS.find((s) => s.ticker === route.ticker) ?? null;
  const writersChannelKey = `${sessionKey}-writers`;
  const status = route.view === 'leaderboard' ? 'idle' : roomStatus;

  return (
    <>
      <header className="example-header">
        <div className="example-header__intro">
          <p className="example-header__title">Live Stock Rooms</p>
          <p className="example-header__hint">
            Watch together — open this page in{' '}
            <a href={window.location.href} target="_blank" rel="noreferrer">
              another tab
            </a>{' '}
            and enter the same stock to see the count rise.
          </p>
        </div>
        <span className="status" data-status={status}>
          <span className="status__dot" aria-hidden="true" />
          {statusLabels[status]}
        </span>
      </header>

      <main className="page">
        <div className="controls">
          <label>
            <span className="control-label">Sync mode</span>
            <select
              value={syncMode}
              onChange={(e) => setSyncMode(e.target.value as SyncMode)}
            >
              <option value={SyncMode.Polling}>Polling</option>
              <option value={SyncMode.Realtime}>Realtime</option>
            </select>
          </label>
          <label>
            <span className="control-label">Heartbeat (ms)</span>
            <input
              type="number"
              min={MIN_HEARTBEAT_MS}
              step={500}
              value={heartbeatDraft}
              onChange={(e) => setHeartbeatDraft(e.target.value)}
              onBlur={commitHeartbeat}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitHeartbeat();
              }}
            />
          </label>
          <label>
            <span className="control-label">Switching tabs</span>
            <select
              value={providerPosition}
              onChange={(e) =>
                setProviderPosition(e.target.value as ProviderPosition)
              }
            >
              <option value="inside">Rejoins the room</option>
              <option value="outside">Stays in the room</option>
            </select>
          </label>
          <p className="session-tag">
            Session <code>{sessionKey}</code>
          </p>
        </div>

        {/* This playground only attaches Channels (no Documents), so the
            client is not activated up front; the SDK activates it when the
            first channel attaches. */}
        <YorkieProvider {...yorkieOpts} activate={false}>
          {route.view === 'write' && selectedStock ? (
            <WritePostPage
              stock={selectedStock}
              writersChannelKey={writersChannelKey}
              syncMode={syncMode}
              heartbeatInterval={heartbeat}
              onStatus={setRoomStatus}
              onBack={() => navigate({ view: null })}
            />
          ) : selectedStock ? (
            <StockDetail
              stock={selectedStock}
              syncMode={syncMode}
              heartbeatInterval={heartbeat}
              channelKey={`${sessionKey}-${selectedStock.ticker}`}
              writersChannelKey={writersChannelKey}
              subView={route.sub}
              providerPosition={providerPosition}
              onStatus={setRoomStatus}
              onChangeSubView={(sub) =>
                navigate({ view: sub === 'activity' ? 'activity' : null })
              }
              onBack={() => navigate({ stock: null, view: null })}
              onCompose={() => navigate({ view: 'write' })}
            />
          ) : (
            <Leaderboard
              onSelect={(ticker) => navigate({ stock: ticker, view: null })}
            />
          )}
        </YorkieProvider>

        <p className="tip">
          Try it: enter the same stock in two tabs to see two watchers. Then
          click “Write a post” in one tab; a stock page opened after that shows
          one more person writing.
        </p>
      </main>
    </>
  );
}
