import { useEffect, useRef, useState } from 'react';
import { ChannelProvider, SyncMode, useChannel } from '@yorkie-js/react';

type Props = {
  channelKey: string;
  syncMode: SyncMode;
  channelHeartbeatInterval: number;
};

export default function ChannelPanel(props: Props) {
  return (
    <div className="panel">
      <h2>Channel</h2>
      <div className="meta">
        Mode: <strong>{props.syncMode}</strong> &middot; heartbeat{' '}
        {props.channelHeartbeatInterval}ms
      </div>
      <ChannelProvider
        key={`${props.channelKey}-${props.syncMode}-${props.channelHeartbeatInterval}`}
        channelKey={props.channelKey}
        syncMode={props.syncMode}
        channelHeartbeatInterval={props.channelHeartbeatInterval}
      >
        <ChannelView />
      </ChannelProvider>
    </div>
  );
}

function ChannelView() {
  const { sessionCount, loading, error } = useChannel();
  const [log, setLog] = useState<Array<string>>([]);
  const prevCount = useRef<number | null>(null);

  useEffect(() => {
    if (loading) return;
    const ts = new Date().toISOString().substring(11, 23);
    if (prevCount.current === null) {
      setLog((l) => [`${ts}  attached, sessionCount=${sessionCount}`, ...l]);
    } else if (prevCount.current !== sessionCount) {
      setLog((l) => [
        `${ts}  sessionCount: ${prevCount.current} → ${sessionCount}`,
        ...l,
      ]);
    }
    prevCount.current = sessionCount;
  }, [sessionCount, loading]);

  if (loading) return <div>Loading channel…</div>;
  if (error) return <div>Channel error: {error.message}</div>;

  return (
    <>
      <div className="stat">{sessionCount}</div>
      <div className="stat-label">sessionCount (active sessions)</div>
      <div className="log">
        {log.length === 0 && (
          <div className="line">
            <span className="ts">—</span> waiting for first tick…
          </div>
        )}
        {log.map((line, i) => (
          <div className="line" key={i}>
            {line}
          </div>
        ))}
      </div>
    </>
  );
}
