import { useMemo, useState } from 'react';
import { YorkieProvider, SyncMode } from '@yorkie-js/react';
import ChannelPanel from './ChannelPanel';
import DocumentPanel from './DocumentPanel';

const urlParams = new URLSearchParams(window.location.search);
const sessionKey =
  urlParams.get('key') ||
  `polling-playground-${new Date()
    .toISOString()
    .substring(0, 10)
    .replace(/-/g, '')}`;

export default function App() {
  const [channelMode, setChannelMode] = useState<SyncMode>(SyncMode.Polling);
  const [documentMode, setDocumentMode] = useState<SyncMode>(SyncMode.Polling);
  const [channelInterval, setChannelInterval] = useState<number>(2000);
  const [documentInterval, setDocumentInterval] = useState<number>(2000);

  const apiKey = import.meta.env.VITE_YORKIE_API_KEY ?? '';
  const rpcAddr =
    import.meta.env.VITE_YORKIE_API_ADDR ?? 'http://localhost:8080';

  const yorkieOpts = useMemo(() => ({ apiKey, rpcAddr }), [apiKey, rpcAddr]);

  return (
    <div className="app">
      <h1>Yorkie Polling Playground</h1>
      <p className="lede">
        Verifies <code>SyncMode.Polling</code> works through the React SDK
        for both Channel and Document. Open a second tab with the same{' '}
        <code>?key=…</code> to see remote changes flow in.
      </p>

      <div className="callout">
        Session key: <strong>{sessionKey}</strong> &middot; rpcAddr:{' '}
        <code>{rpcAddr}</code>
      </div>

      <div className="controls">
        <fieldset>
          <legend>Channel</legend>
          <label>
            syncMode
            <select
              value={channelMode}
              onChange={(e) => setChannelMode(e.target.value as SyncMode)}
            >
              <option value={SyncMode.Realtime}>Realtime</option>
              <option value={SyncMode.Polling}>Polling</option>
              <option value={SyncMode.Manual}>Manual</option>
            </select>
          </label>
          <label>
            heartbeat (ms)
            <input
              type="number"
              min={500}
              step={500}
              value={channelInterval}
              onChange={(e) => setChannelInterval(Number(e.target.value))}
            />
          </label>
        </fieldset>
        <fieldset>
          <legend>Document</legend>
          <label>
            syncMode
            <select
              value={documentMode}
              onChange={(e) => setDocumentMode(e.target.value as SyncMode)}
            >
              <option value={SyncMode.Realtime}>Realtime</option>
              <option value={SyncMode.Polling}>Polling</option>
              <option value={SyncMode.Manual}>Manual</option>
            </select>
          </label>
          <label>
            pollInterval (ms)
            <input
              type="number"
              min={500}
              step={500}
              value={documentInterval}
              onChange={(e) => setDocumentInterval(Number(e.target.value))}
            />
          </label>
        </fieldset>
      </div>

      <YorkieProvider {...yorkieOpts}>
        <div className="panels">
          <ChannelPanel
            channelKey={sessionKey}
            syncMode={channelMode}
            channelHeartbeatInterval={channelInterval}
          />
          <DocumentPanel
            docKey={sessionKey}
            syncMode={documentMode}
            documentPollInterval={documentInterval}
          />
        </div>
      </YorkieProvider>
    </div>
  );
}
