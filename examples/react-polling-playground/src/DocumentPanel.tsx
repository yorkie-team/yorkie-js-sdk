import { useEffect, useRef, useState } from 'react';
import {
  DocumentProvider,
  SyncMode,
  useDocument,
  JSONObject,
} from '@yorkie-js/react';

type DocRoot = {
  counter?: number;
  text?: string;
};

type Props = {
  docKey: string;
  syncMode: SyncMode;
  documentPollInterval: number;
};

export default function DocumentPanel(props: Props) {
  return (
    <div className="panel">
      <h2>Document</h2>
      <div className="meta">
        Mode: <strong>{props.syncMode}</strong> &middot; pollInterval{' '}
        {props.documentPollInterval}ms
      </div>
      <DocumentProvider
        key={`${props.docKey}-${props.syncMode}-${props.documentPollInterval}`}
        docKey={props.docKey}
        initialRoot={{ counter: 0, text: '' }}
        syncMode={props.syncMode}
        documentPollInterval={props.documentPollInterval}
      >
        <DocumentView />
      </DocumentProvider>
    </div>
  );
}

function DocumentView() {
  const { root, update, loading, error } = useDocument<DocRoot>();
  const [log, setLog] = useState<Array<string>>([]);
  const prevSnapshot = useRef<string>('');

  useEffect(() => {
    if (loading) return;
    const snapshot = JSON.stringify({
      counter: root.counter ?? 0,
      text: root.text ?? '',
    });
    if (prevSnapshot.current === '') {
      const ts = new Date().toISOString().substring(11, 23);
      setLog((l) => [`${ts}  attached, ${snapshot}`, ...l]);
    } else if (prevSnapshot.current !== snapshot) {
      const ts = new Date().toISOString().substring(11, 23);
      setLog((l) => [`${ts}  remote change: ${snapshot}`, ...l]);
    }
    prevSnapshot.current = snapshot;
  }, [root, loading]);

  if (loading) return <div>Loading document…</div>;
  if (error) return <div>Document error: {error.message}</div>;

  const r = root as JSONObject<DocRoot>;

  return (
    <>
      <div className="stat">{r.counter ?? 0}</div>
      <div className="stat-label">root.counter</div>
      <div style={{ marginTop: 12 }}>
        <button
          onClick={() =>
            update((root) => {
              root.counter = (root.counter ?? 0) + 1;
            })
          }
        >
          Increment
        </button>
        <button
          className="secondary"
          onClick={() =>
            update((root) => {
              root.counter = 0;
              root.text = '';
            })
          }
        >
          Reset
        </button>
      </div>
      <div style={{ marginTop: 12 }}>
        <input
          className="kv-input"
          placeholder="root.text"
          value={r.text ?? ''}
          onChange={(e) =>
            update((root) => {
              root.text = e.target.value;
            })
          }
        />
      </div>
      <div className="log">
        {log.length === 0 && (
          <div className="line">
            <span className="ts">—</span> waiting for first sync…
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
