import { useCallback, useEffect, useMemo, useState } from 'react';
import { YorkieProvider, SyncMode } from '@yorkie-js/react';
import Leaderboard from './Leaderboard';
import StockDetail, {
  type SubView,
  type ProviderPosition,
} from './StockDetail';
import { STOCKS } from './stocks';

const SUB_VIEWS: ReadonlyArray<SubView> = ['overview', 'activity'];

const initialParams = new URLSearchParams(window.location.search);
const sessionKey =
  initialParams.get('key') ||
  `trending-${new Date().toISOString().substring(0, 10).replace(/-/g, '')}`;

function readSelectedStock(): string | null {
  const params = new URLSearchParams(window.location.search);
  const ticker = params.get('stock');
  if (!ticker) return null;
  return STOCKS.some((s) => s.ticker === ticker) ? ticker : null;
}

function readSubView(): SubView {
  const seg = window.location.pathname.split('/').filter(Boolean).pop() ?? '';
  return (SUB_VIEWS as ReadonlyArray<string>).includes(seg)
    ? (seg as SubView)
    : 'overview';
}

const MIN_HEARTBEAT_MS = 500;
const DEFAULT_HEARTBEAT_MS = 2000;

export default function App() {
  const [syncMode, setSyncMode] = useState<SyncMode>(SyncMode.Polling);
  const [heartbeat, setHeartbeat] = useState<number>(DEFAULT_HEARTBEAT_MS);
  const [heartbeatDraft, setHeartbeatDraft] = useState<string>(
    String(DEFAULT_HEARTBEAT_MS),
  );
  const [selectedTicker, setSelectedTicker] = useState<string | null>(
    readSelectedStock,
  );
  const [subView, setSubView] = useState<SubView>(readSubView);
  const [providerPosition, setProviderPosition] =
    useState<ProviderPosition>('inside');

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
    const onPop = () => {
      setSelectedTicker(readSelectedStock());
      setSubView(readSubView());
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const navigateRoom = useCallback((ticker: string | null) => {
    const params = new URLSearchParams(window.location.search);
    if (ticker) params.set('stock', ticker);
    else params.delete('stock');
    const path = ticker ? '/overview' : '/';
    const query = params.toString();
    window.history.pushState({}, '', query ? `${path}?${query}` : path);
    setSelectedTicker(ticker);
    setSubView('overview');
  }, []);

  const navigateSubView = useCallback((view: SubView) => {
    const params = new URLSearchParams(window.location.search);
    const query = params.toString();
    const next = `/${view}${query ? `?${query}` : ''}`;
    window.history.pushState({}, '', next);
    setSubView(view);
  }, []);

  const apiKey = import.meta.env.VITE_YORKIE_API_KEY ?? '';
  const rpcAddr =
    import.meta.env.VITE_YORKIE_API_ADDR ?? 'http://localhost:8080';
  const yorkieOpts = useMemo(() => ({ apiKey, rpcAddr }), [apiKey, rpcAddr]);

  const selectedStock = selectedTicker
    ? (STOCKS.find((s) => s.ticker === selectedTicker) ?? null)
    : null;

  return (
    <div className="app">
      <header>
        <h1>📈 Live Stock Rooms</h1>
        <p className="lede">
          Each stock is its own room (Yorkie Channel). Inside a room, navigate
          between sub-paths (<code>/overview</code> ↔ <code>/activity</code>)
          and toggle the <code>ChannelProvider</code> position to see how its
          placement affects the session count.
        </p>
      </header>

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
          <span className="control-label">Provider position</span>
          <select
            value={providerPosition}
            onChange={(e) =>
              setProviderPosition(e.target.value as ProviderPosition)
            }
          >
            <option value="inside">Inside sub-route (flickers)</option>
            <option value="outside">Outside sub-route (stable)</option>
          </select>
        </label>
        <div className="session-tag">
          session <code>{sessionKey}</code>
        </div>
      </div>

      <YorkieProvider {...yorkieOpts}>
        {selectedStock ? (
          <StockDetail
            stock={selectedStock}
            syncMode={syncMode}
            heartbeatInterval={heartbeat}
            channelKey={`${sessionKey}-${selectedStock.ticker}`}
            subView={subView}
            providerPosition={providerPosition}
            onChangeSubView={navigateSubView}
            onBack={() => navigateRoom(null)}
          />
        ) : (
          <Leaderboard onSelect={(ticker) => navigateRoom(ticker)} />
        )}
      </YorkieProvider>

      <footer>
        Tip: open this URL in two tabs with the same <code>?key=</code>. Enter
        the same stock in both. In one tab, keep clicking between{' '}
        <code>/overview</code> and <code>/activity</code>. With{' '}
        <code>Provider position: inside</code> the other tab will see the count
        blink to <code>0</code> right after each navigation, then recover.
        Switch to <code>outside</code> and the blink disappears.
      </footer>
    </div>
  );
}
