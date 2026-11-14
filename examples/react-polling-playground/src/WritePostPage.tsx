import { useEffect } from 'react';
import { ChannelProvider, SyncMode, useChannel } from '@yorkie-js/react';
import type { Stock } from './stocks';
import type { RoomStatus } from './App';
import { ChevronLeft } from './icons';

type Props = {
  stock: Stock;
  writersChannelKey: string;
  syncMode: SyncMode;
  heartbeatInterval: number;
  onStatus: (status: RoomStatus) => void;
  onBack: () => void;
};

export default function WritePostPage({
  stock,
  writersChannelKey,
  syncMode,
  heartbeatInterval,
  onStatus,
  onBack,
}: Props) {
  return (
    <div className="detail">
      <button className="back" type="button" onClick={onBack}>
        <ChevronLeft /> Cancel and go back to {stock.ticker}
      </button>
      <h1 className="page-title">Write about {stock.name}</h1>
      <ChannelProvider
        key={`${writersChannelKey}-${syncMode}-${heartbeatInterval}-writer`}
        channelKey={writersChannelKey}
        syncMode={syncMode}
        channelHeartbeatInterval={heartbeatInterval}
      >
        <WriterBody onStatus={onStatus} />
      </ChannelProvider>
    </div>
  );
}

function WriterBody({ onStatus }: { onStatus: Props['onStatus'] }) {
  // Opening the composer joins the writers channel, so this tab now counts.
  const { sessionCount, loading, error } = useChannel();
  const status: RoomStatus = error
    ? 'error'
    : loading
      ? 'connecting'
      : 'connected';
  useEffect(() => onStatus(status), [status, onStatus]);

  return (
    <div className="detail-card">
      <p className="detail-count">
        {status === 'connecting' ? (
          <span className="muted">Joining the writers…</span>
        ) : status === 'error' ? (
          <span className="detail-error">
            Couldn't join the writers. Check that the Yorkie server is running,
            then reload.
          </span>
        ) : (
          <>
            <span className="big-num">{sessionCount.toLocaleString()}</span>
            <span className="big-label">writing right now, including you</span>
          </>
        )}
      </p>
      <label className="control-label" htmlFor="draft">
        Your post (not saved; the composer only joins the channel)
      </label>
      <textarea id="draft" className="writer-textarea" rows={5} />
    </div>
  );
}
