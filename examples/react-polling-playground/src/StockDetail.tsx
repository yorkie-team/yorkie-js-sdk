import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ChannelProvider,
  SyncMode,
  useChannel,
  usePeekChannel,
} from '@yorkie-js/react';
import type { Stock } from './stocks';

export type SubView = 'overview' | 'activity';
export type ProviderPosition = 'inside' | 'outside';

type AttachState = 'attaching' | 'ok' | 'error';

type LogEntry = {
  t: number;
  n: number;
  state: AttachState;
  source: SubView;
  err?: string;
};

type Props = {
  stock: Stock;
  syncMode: SyncMode;
  heartbeatInterval: number;
  channelKey: string;
  writersChannelKey: string;
  subView: SubView;
  providerPosition: ProviderPosition;
  onChangeSubView: (view: SubView) => void;
  onBack: () => void;
  onCompose: () => void;
};

const TABS: ReadonlyArray<SubView> = ['overview', 'activity'];

export default function StockDetail({
  stock,
  syncMode,
  heartbeatInterval,
  channelKey,
  writersChannelKey,
  subView,
  providerPosition,
  onChangeSubView,
  onBack,
  onCompose,
}: Props) {
  const providerKey = `${channelKey}-${syncMode}-${heartbeatInterval}`;
  const providerProps = {
    channelKey,
    syncMode,
    channelHeartbeatInterval: heartbeatInterval,
  };

  const [log, setLog] = useState<Array<LogEntry>>([]);
  const handleSessionEvent = useCallback(
    (n: number, state: AttachState, source: SubView, err?: string) => {
      setLog((prev) => {
        const next = [...prev, { t: Date.now(), n, state, source, err }];
        return next.length > 24 ? next.slice(-24) : next;
      });
    },
    [],
  );

  const tabHeader = (
    <div className="tab-bar">
      {TABS.map((view) => (
        <button
          key={view}
          className={`tab ${subView === view ? 'tab-active' : ''}`}
          onClick={() => onChangeSubView(view)}
        >
          /{view}
        </button>
      ))}
    </div>
  );

  return (
    <div className="detail">
      <button className="back" onClick={onBack}>
        ← Back to leaderboard
      </button>

      {providerPosition === 'outside' ? (
        // Shared layout owns the ChannelProvider. Sub-routes only swap
        // children → channel stays attached across path changes.
        <ChannelProvider key={providerKey} {...providerProps}>
          {tabHeader}
          {subView === 'overview' ? (
            <OverviewBody stock={stock} onSession={handleSessionEvent} />
          ) : (
            <ActivityBody stock={stock} onSession={handleSessionEvent} />
          )}
        </ChannelProvider>
      ) : (
        // Each sub-route mounts its own ChannelProvider. Switching paths
        // unmounts one provider and mounts another → detach/attach cycle.
        <>
          {tabHeader}
          {subView === 'overview' ? (
            <ChannelProvider
              key={`${providerKey}-overview`}
              {...providerProps}
            >
              <OverviewBody stock={stock} onSession={handleSessionEvent} />
            </ChannelProvider>
          ) : (
            <ChannelProvider
              key={`${providerKey}-activity`}
              {...providerProps}
            >
              <ActivityBody stock={stock} onSession={handleSessionEvent} />
            </ChannelProvider>
          )}
        </>
      )}

      {/* PeekChannel-based CTA: reads the writers channel count once at
          page entry without attaching, displays the snapshot for 3 seconds,
          then hides it. The viewer never becomes a member of the channel —
          even at high concurrency this stays O(1 RPC per page view). */}
      <WritersPeekCTA
        channelKey={writersChannelKey}
        onCompose={onCompose}
      />

      <SessionLogPanel log={log} onClear={() => setLog([])} />
    </div>
  );
}

const PEEK_SHOW_MS = 3000;

function WritersPeekCTA({
  channelKey,
  onCompose,
}: {
  channelKey: string;
  onCompose: () => void;
}) {
  // One-shot peek by default: fetches once on mount, never polls.
  const { sessionCount, loading, error } = usePeekChannel(channelKey);
  const [visible, setVisible] = useState(true);

  // Hide the count badge 3 seconds after the first successful fetch.
  useEffect(() => {
    if (loading || error) return;
    const timer = setTimeout(() => setVisible(false), PEEK_SHOW_MS);
    return () => clearTimeout(timer);
  }, [loading, error]);

  const showCount = visible && !loading && !error;
  return (
    <button className="writer-cta" onClick={onCompose}>
      <span className="writer-cta-icon">✏️</span>
      <span className="writer-cta-label">Write a post</span>
      {showCount && (
        <span className="writer-cta-count" title="people writing at page entry">
          {sessionCount.toLocaleString()} writing
        </span>
      )}
    </button>
  );
}

type CardProps = {
  stock: Stock;
  onSession: (
    n: number,
    state: AttachState,
    source: SubView,
    err?: string,
  ) => void;
};

function OverviewBody({ stock, onSession }: CardProps) {
  return (
    <SessionCountCard stock={stock} subLabel="overview" onSession={onSession} />
  );
}

function ActivityBody({ stock, onSession }: CardProps) {
  return (
    <SessionCountCard stock={stock} subLabel="activity" onSession={onSession} />
  );
}

function SessionCountCard({
  stock,
  subLabel,
  onSession,
}: {
  stock: Stock;
  subLabel: SubView;
  onSession: CardProps['onSession'];
}) {
  const { sessionCount, loading, error } = useChannel();
  const flag = stock.market === 'KR' ? '🇰🇷' : '🇺🇸';
  const state: AttachState = error ? 'error' : loading ? 'attaching' : 'ok';

  const lastRef = useRef<{ n: number; state: AttachState } | null>(null);
  useEffect(() => {
    const cur = { n: sessionCount, state };
    const last = lastRef.current;
    if (!last || last.n !== cur.n || last.state !== cur.state) {
      lastRef.current = cur;
      onSession(sessionCount, state, subLabel, error?.message);
    }
  }, [sessionCount, state, error, subLabel, onSession]);

  return (
    <div className="detail-card">
      <div className="detail-meta">
        <span className="detail-flag">{flag}</span>
        <span className="detail-name">{stock.name}</span>
        <span className="detail-sub">/ {subLabel}</span>
      </div>
      <div className="detail-ticker">{stock.ticker}</div>
      <div className="detail-count">
        <span className="big-num">{sessionCount.toLocaleString()}</span>
        <span className="big-label">
          people watching{' '}
          <span className={`state-badge state-${state}`}>{state}</span>
        </span>
      </div>
      {error && <p className="detail-hint">error: {error.message}</p>}
    </div>
  );
}

function SessionLogPanel({
  log,
  onClear,
}: {
  log: Array<LogEntry>;
  onClear: () => void;
}) {
  return (
    <div className="session-log">
      <div className="session-log-header">
        <span className="session-log-title">session count log</span>
        <button className="log-clear" onClick={onClear}>
          clear
        </button>
      </div>
      {log.length === 0 ? (
        <div className="muted">no events yet</div>
      ) : (
        <ul>
          {log.map((entry, i) => (
            <li key={i}>
              <code>
                {new Date(entry.t).toISOString().substring(11, 23)}
              </code>{' '}
              <span className="log-source">/{entry.source}</span>{' '}
              <span className={`state-badge state-${entry.state}`}>
                {entry.state}
              </span>{' '}
              → <strong>{entry.n}</strong>
              {entry.err && <span className="muted"> · {entry.err}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
