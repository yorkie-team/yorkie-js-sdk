import { useCallback, useEffect, useMemo, useState } from 'react';
import { YorkieProvider, SyncMode } from '@yorkie-js/react';
import Leaderboard from './Leaderboard';
import StockDetail from './StockDetail';
import { STOCKS } from './stocks';

const initialParams = new URLSearchParams(window.location.search);
const sessionKey =
  initialParams.get('key') ||
  `trending-${new Date()
    .toISOString()
    .substring(0, 10)
    .replace(/-/g, '')}`;

function readSelectedStock(): string | null {
  const params = new URLSearchParams(window.location.search);
  const ticker = params.get('stock');
  if (!ticker) return null;
  return STOCKS.some((s) => s.ticker === ticker) ? ticker : null;
}

export default function App() {
  const [syncMode, setSyncMode] = useState<SyncMode>(SyncMode.Polling);
  const [heartbeat, setHeartbeat] = useState<number>(2000);
  const [selectedTicker, setSelectedTicker] = useState<string | null>(
    readSelectedStock,
  );

  useEffect(() => {
    const onPop = () => setSelectedTicker(readSelectedStock());
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const navigate = useCallback((ticker: string | null) => {
    const params = new URLSearchParams(window.location.search);
    if (ticker) params.set('stock', ticker);
    else params.delete('stock');
    const next = `${window.location.pathname}?${params.toString()}`;
    window.history.pushState({}, '', next);
    setSelectedTicker(ticker);
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
          Each stock is its own room (Yorkie Channel). Click a ticker to enter
          and see how many people are watching it right now via{' '}
          <code>SyncMode.Polling</code>. Open another tab on the same stock to
          watch the count rise; pick a different stock to see the previous
          room's count drop.
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
            min={500}
            step={500}
            value={heartbeat}
            onChange={(e) => setHeartbeat(Number(e.target.value))}
          />
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
            onBack={() => navigate(null)}
          />
        ) : (
          <Leaderboard onSelect={(ticker) => navigate(ticker)} />
        )}
      </YorkieProvider>

      <footer>
        Tip: open this URL in two tabs with the same <code>?key=</code>. Send
        them into the same stock to see <code>2 watching</code>; send them into
        different stocks to see each room hold <code>1</code>. The list itself
        attaches no channels — counts only exist inside a stock room.
      </footer>
    </div>
  );
}
