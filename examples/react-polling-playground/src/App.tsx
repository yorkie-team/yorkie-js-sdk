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

function readView(): View {
  const seg = window.location.pathname.split('/').filter(Boolean).pop() ?? '';
  if (seg === 'write') return 'write';
  return readSelectedStock() ? 'stock' : 'leaderboard';
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
  const [view, setView] = useState<View>(readView);
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
      setView(readView());
      setSubView(readSubView());
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const goLeaderboard = useCallback(() => {
    const params = new URLSearchParams(window.location.search);
    params.delete('stock');
    const query = params.toString();
    window.history.pushState({}, '', query ? `/?${query}` : '/');
    setSelectedTicker(null);
    setView('leaderboard');
    setSubView('overview');
  }, []);

  const goStock = useCallback((ticker: string) => {
    const params = new URLSearchParams(window.location.search);
    params.set('stock', ticker);
    const query = params.toString();
    window.history.pushState({}, '', `/overview?${query}`);
    setSelectedTicker(ticker);
    setView('stock');
    setSubView('overview');
  }, []);

  const navigateSubView = useCallback((next: SubView) => {
    const params = new URLSearchParams(window.location.search);
    const query = params.toString();
    window.history.pushState({}, '', `/${next}${query ? `?${query}` : ''}`);
    setSubView(next);
  }, []);

  const goWrite = useCallback(() => {
    const params = new URLSearchParams(window.location.search);
    window.history.pushState({}, '', `/write?${params.toString()}`);
    setView('write');
  }, []);

  const backFromWrite = useCallback(() => {
    const params = new URLSearchParams(window.location.search);
    const query = params.toString();
    window.history.pushState({}, '', `/${subView}${query ? `?${query}` : ''}`);
    setView('stock');
  }, [subView]);

  const apiKey = import.meta.env.VITE_YORKIE_API_KEY ?? '';
  const rpcAddr =
    import.meta.env.VITE_YORKIE_API_ADDR ?? 'http://localhost:8080';
  const yorkieOpts = useMemo(() => ({ apiKey, rpcAddr }), [apiKey, rpcAddr]);

  const selectedStock = selectedTicker
    ? (STOCKS.find((s) => s.ticker === selectedTicker) ?? null)
    : null;

  const writersChannelKey = `${sessionKey}-writers`;

  return (
    <div className="app">
      <header>
        <h1>📈 Live Stock Rooms</h1>
        <p className="lede">
          Each stock is its own room (Yorkie Channel). Inside a room, navigate
          between sub-paths (<code>/overview</code> ↔ <code>/activity</code>)
          to test <code>ChannelProvider</code> position behavior. The "Write a
          post" badge reads a separate global <code>writers</code> channel via{' '}
          <code>usePeekChannel</code> — one RPC at page entry, no attach.
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
        {view === 'write' && selectedStock ? (
          <WritePostPage
            stock={selectedStock}
            writersChannelKey={writersChannelKey}
            syncMode={syncMode}
            heartbeatInterval={heartbeat}
            onBack={backFromWrite}
          />
        ) : selectedStock ? (
          <StockDetail
            stock={selectedStock}
            syncMode={syncMode}
            heartbeatInterval={heartbeat}
            channelKey={`${sessionKey}-${selectedStock.ticker}`}
            writersChannelKey={writersChannelKey}
            subView={subView}
            providerPosition={providerPosition}
            onChangeSubView={navigateSubView}
            onBack={goLeaderboard}
            onCompose={goWrite}
          />
        ) : (
          <Leaderboard onSelect={(ticker) => goStock(ticker)} />
        )}
      </YorkieProvider>

      <footer>
        Tip: open one tab on a stock page, another tab → /write. The stock tab
        peeks the writers channel once on entry; the count badge shows for 3
        seconds, then hides. Click "Write a post" on the stock tab to enter
        the composer — that tab attaches to the writers channel as a
        participant. Other stock pages opened *after* will see the higher
        count on their initial peek.
      </footer>
    </div>
  );
}
