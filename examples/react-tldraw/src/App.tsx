import { Tldraw, useFileSystem } from '@tldraw/tldraw';
import { useMultiplayerState } from './hooks/useMultiplayerState';
import Avatars from './Avatars';
import CustomCursor from './CustomCursor';
import ExampleHeader from './ExampleHeader';
import './App.css';

/*
This demo shows how to integrate TLDraw with a multiplayer room
via Yorkie.

Warning: Keeping images enabled for multiplayer applications
without providing a storage bucket based solution will cause
massive base64 string to be written to the multiplayer storage.
It's recommended to use a storage bucket based solution, such as
Amazon AWS S3.
*/

// Use `?key=<name>` for a separate canvas, or today's shared one by default.
const roomId =
  new URLSearchParams(window.location.search).get('key') ||
  `tldraw-${new Date().toISOString().substring(0, 10).replace(/-/g, '')}`;

const components = { Cursor: CustomCursor };

export default function App() {
  const fileSystemEvents = useFileSystem();
  const { status, peers, ...events } = useMultiplayerState(roomId);

  return (
    <div className="tldraw">
      <ExampleHeader
        title="React tldraw"
        status={status}
        className="example-header--overlay"
      >
        <Avatars peers={peers} />
      </ExampleHeader>
      <Tldraw
        components={components}
        autofocus
        disableAssets={true}
        showPages={false}
        {...fileSystemEvents}
        {...events}
      />
      {status === 'error' && (
        <p className="error-message" role="alert">
          Couldn't reach the Yorkie server at{' '}
          {import.meta.env.VITE_YORKIE_API_ADDR}. Check that it's running, then
          reload.
        </p>
      )}
    </div>
  );
}
