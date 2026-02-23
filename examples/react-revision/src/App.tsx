import { YorkieProvider, DocumentProvider, useDocument } from '@yorkie-js/react';
import RevisionPanel from './RevisionPanel';
import './App.css';

const DOC_KEY = `react-revision-${new Date().toISOString().slice(0, 10)}`;

interface DocType {
  content: string;
}

function NoteEditor() {
  const { root, update, loading, error } = useDocument<DocType>();

  if (loading) return <div className="loading">Loading...</div>;
  if (error) return <div className="error">Error: {error.message}</div>;

  return (
    <div className="app">
      <h1>Note with Revisions</h1>
      <div className="editor-container">
        <div className="editor-section">
          <h2>Editor</h2>
          <textarea
            className="editor"
            value={root.content}
            onChange={(e) =>
              update((root) => {
                root.content = e.target.value;
              })
            }
            placeholder="Start typing your note..."
          />
        </div>
        <div className="revision-section">
          <RevisionPanel />
        </div>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <YorkieProvider
      apiKey={import.meta.env.VITE_YORKIE_API_KEY}
      rpcAddr={import.meta.env.VITE_YORKIE_API_ADDR}
    >
      <DocumentProvider docKey={DOC_KEY} initialRoot={{ content: '' }}>
        <NoteEditor />
      </DocumentProvider>
    </YorkieProvider>
  );
}
