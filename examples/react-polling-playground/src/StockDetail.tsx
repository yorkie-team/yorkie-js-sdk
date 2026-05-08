import { ChannelProvider, SyncMode, useChannel } from '@yorkie-js/react';
import type { Stock } from './stocks';

type Props = {
  stock: Stock;
  syncMode: SyncMode;
  heartbeatInterval: number;
  channelKey: string;
  onBack: () => void;
};

export default function StockDetail({
  stock,
  syncMode,
  heartbeatInterval,
  channelKey,
  onBack,
}: Props) {
  return (
    <div className="detail">
      <button className="back" onClick={onBack}>
        ← Back to leaderboard
      </button>
      <ChannelProvider
        key={`${channelKey}-${syncMode}-${heartbeatInterval}`}
        channelKey={channelKey}
        syncMode={syncMode}
        channelHeartbeatInterval={heartbeatInterval}
      >
        <DetailBody stock={stock} />
      </ChannelProvider>
    </div>
  );
}

function DetailBody({ stock }: { stock: Stock }) {
  const { sessionCount, loading, error } = useChannel();
  const flag = stock.market === 'KR' ? '🇰🇷' : '🇺🇸';

  return (
    <div className="detail-card">
      <div className="detail-meta">
        <span className="detail-flag">{flag}</span>
        <span className="detail-name">{stock.name}</span>
      </div>
      <div className="detail-ticker">{stock.ticker}</div>
      <div className="detail-count">
        {loading ? (
          <span className="muted">connecting…</span>
        ) : error ? (
          <span className="muted">error: {error.message}</span>
        ) : (
          <>
            <span className="big-num">{sessionCount.toLocaleString()}</span>
            <span className="big-label">people watching right now</span>
          </>
        )}
      </div>
      <p className="detail-hint">
        You're one of them. Open another tab on this same stock to see the
        count tick up; switch one tab to a different stock to see this count
        drop.
      </p>
    </div>
  );
}
