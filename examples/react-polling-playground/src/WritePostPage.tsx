import { ChannelProvider, SyncMode, useChannel } from '@yorkie-js/react';
import type { Stock } from './stocks';

type Props = {
  stock: Stock;
  writersChannelKey: string;
  syncMode: SyncMode;
  heartbeatInterval: number;
  onBack: () => void;
};

export default function WritePostPage({
  stock,
  writersChannelKey,
  syncMode,
  heartbeatInterval,
  onBack,
}: Props) {
  return (
    <div className="detail">
      <button className="back" onClick={onBack}>
        ← Cancel and go back to {stock.ticker}
      </button>
      <ChannelProvider
        key={`${writersChannelKey}-${syncMode}-${heartbeatInterval}-writer`}
        channelKey={writersChannelKey}
        syncMode={syncMode}
        channelHeartbeatInterval={heartbeatInterval}
      >
        <WriterBody stock={stock} />
      </ChannelProvider>
    </div>
  );
}

function WriterBody({ stock }: { stock: Stock }) {
  const { sessionCount, loading, error } = useChannel();
  return (
    <div className="detail-card">
      <div className="detail-meta">
        <span className="detail-flag">✏️</span>
        <span className="detail-name">Compose a post about {stock.name}</span>
      </div>
      <div className="detail-ticker">{stock.ticker}</div>
      <div className="detail-count">
        {loading ? (
          <span className="muted">joining writers…</span>
        ) : error ? (
          <span className="muted">error: {error.message}</span>
        ) : (
          <>
            <span className="big-num">{sessionCount.toLocaleString()}</span>
            <span className="big-label">writing right now (you're one of them)</span>
          </>
        )}
      </div>
      <textarea
        className="writer-textarea"
        rows={5}
        placeholder="Drafting a post… (not actually persisted — this is just to demo channel attach)"
      />
      <p className="detail-hint">
        Open another tab on a stock page, then open the composer here. The
        other tab's <code>Writers</code> count rises by one for each composer
        open, and falls when you close.
      </p>
    </div>
  );
}
