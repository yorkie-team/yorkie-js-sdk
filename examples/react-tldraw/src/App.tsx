import { Tldraw, useFileSystem } from '@tldraw/tldraw';
import { useMultiplayerState } from './hooks/useMultiplayerState';
import CustomCursor from './CustomCursor';
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

export default function App() {
  const fileSystemEvents = useFileSystem();
  const { ...events } = useMultiplayerState(
    `tldraw-${(new Date()).toISOString().substring(0, 10).replace(/-/g, '')}`
  );
  const component = { Cursor: CustomCursor };

  return (
    <div className="tldraw">
      <Tldraw
        components={component}
        autofocus
        disableAssets={true}
        showPages={false}
        {...fileSystemEvents}
        {...events}
      />
    </div>
  );
}
