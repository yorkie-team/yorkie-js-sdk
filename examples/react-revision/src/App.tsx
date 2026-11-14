import {
  YorkieProvider,
  DocumentProvider,
  useDocument,
  useConnection,
  usePresences,
  Text,
} from '@yorkie-js/react';
import Header, { type Status } from './Header';
import NoteEditor from './NoteEditor';
import RevisionPanel from './RevisionPanel';
import './App.css';

const apiAddr = import.meta.env.VITE_YORKIE_API_ADDR;

// One note per day: everyone who opens the example today edits the same note.
const docKey = `react-revision-note-${new Date().toISOString().slice(0, 10)}`;

// A random name for this tab, shown to others in the header.
const names = ['Ali', 'Beatriz', 'Charles', 'Diya', 'Eric', 'Fatima'];
const myName = names[Math.floor(Math.random() * names.length)];

export interface DocType {
  // `Text` merges concurrent edits character by character, unlike a plain
  // string where the last writer would overwrite everyone else.
  content: Text;
}

export type PresenceType = {
  name: string;
};

function Note() {
  const { loading, error } = useDocument<DocType, PresenceType>();
  const connection = useConnection();
  const presences = usePresences<PresenceType>();

  let status: Status = 'connecting';
  if (error) status = 'error';
  else if (!loading)
    status = connection === 'connected' ? 'connected' : 'offline';

  return (
    <div className="app">
      <Header status={status} presences={presences} />
      {error ? (
        <p className="app-error" role="alert">
          Couldn&apos;t reach the Yorkie server at {apiAddr}. Check that
          it&apos;s running, then reload.
        </p>
      ) : loading ? (
        <p className="app-loading">Loading today&apos;s note…</p>
      ) : (
        <main className="workspace">
          <NoteEditor />
          <RevisionPanel />
        </main>
      )}
    </div>
  );
}

export default function App() {
  return (
    <YorkieProvider
      apiKey={import.meta.env.VITE_YORKIE_API_KEY}
      rpcAddr={apiAddr}
    >
      <DocumentProvider<DocType, PresenceType>
        docKey={docKey}
        initialRoot={{ content: new Text() }}
        initialPresence={{ name: myName }}
        enableDevtools={import.meta.env.DEV}
      >
        <Note />
      </DocumentProvider>
    </YorkieProvider>
  );
}
