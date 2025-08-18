import React, { useEffect, useState } from 'react';
import {
  YorkieProvider,
  DocumentProvider,
  useDocument,
} from '@yorkie-js/react';
import Cursor from './components/Cursor';
import CursorSelections from './components/CursorSelections';
import './App.css';

// Initial presence used when attaching the document
const initialPresence = {
  cursorShape: 'cursor',
  cursor: { xPos: 0, yPos: 0 },
  pointerDown: false,
  color: '#000000',
  width: 6,
  opacity: 1,
  fadeEnabled: false,
  lineEraseMode: false,
  lastDrawingTool: 'pen',
  lastPenFading: false,
  lastEraserLine: false,
  showDrawing: true,
  clearNonce: 0,
};

function CursorsCanvas() {
  const { doc, presences, update, loading, error } = useDocument();
  // Local UI mirrors presence values of "my" presence
  const [fadeEnabled, setFadeEnabled] = useState(false);
  const [color, setColor] = useState('#000000');
  const [width, setWidth] = useState(6);
  const [opacity, setOpacity] = useState(1);
  const [lineEraseMode, setLineEraseMode] = useState(false);
  const [lastDrawingTool, setLastDrawingTool] = useState('pen');
  const [lastPenFading, setLastPenFading] = useState(false);
  const [lastEraserLine, setLastEraserLine] = useState(false);
  const [showDrawing, setShowDrawing] = useState(true);

  const handleCursorShapeSelect = (cursorShape) => {
    update((_, p) => p.set({ cursorShape }));
  };

  const handleFadeSet = (next) => {
    setFadeEnabled(next);
    update((_, p) => p.set({ fadeEnabled: next }));
  };
  const handleColorChange = (newColor) => {
    setColor(newColor);
    update((_, p) => p.set({ color: newColor }));
  };
  const handleWidthChange = (newW) => {
    setWidth(newW);
    update((_, p) => p.set({ width: newW }));
  };
  const handleOpacityChange = (newO) => {
    setOpacity(newO);
    update((_, p) => p.set({ opacity: newO }));
  };

  const handleLineEraseModeChange = (val) => {
    setLineEraseMode(val);
    update((_, p) => p.set({ lineEraseMode: val }));
  };

  const handleSetLastDrawingTool = (tool) => {
    setLastDrawingTool(tool);
    update((_, p) => p.set({ lastDrawingTool: tool }));
  };
  const handleSetLastPenFading = (val) => {
    setLastPenFading(val);
    update((_, p) => p.set({ lastPenFading: val }));
  };
  const handleSetLastEraserLine = (val) => {
    setLastEraserLine(val);
    update((_, p) => p.set({ lastEraserLine: val }));
  };

  const handleRestoreLastTool = () => {
    update((_, p) => p.set({ cursorShape: lastDrawingTool }));
    const nextFade = lastDrawingTool === 'pen' ? lastPenFading : false;
    const nextLineEr = lastDrawingTool === 'eraser' ? lastEraserLine : false;
    setFadeEnabled(nextFade);
    setLineEraseMode(nextLineEr);
    update((_, p) =>
      p.set({ fadeEnabled: nextFade, lineEraseMode: nextLineEr }),
    );
  };

  const handleToggleDrawing = () => {
    setShowDrawing((v) => {
      const nv = !v;
      update((_, p) => p.set({ showDrawing: nv }));
      return nv;
    });
  };

  const handleClearDrawing = () => {
    update((_, p) => {
      const prev = p.get('clearNonce') ?? 0;
      p.set({ clearNonce: prev + 1 });
    });
  };

  useEffect(() => {
    if (loading || error) return;

    const onDown = () => update((_, p) => p.set({ pointerDown: true }));
    const onUp = () => update((_, p) => p.set({ pointerDown: false }));
    const onMove = (e) =>
      update((_, p) => p.set({ cursor: { xPos: e.clientX, yPos: e.clientY } }));

    window.addEventListener('mousedown', onDown);
    window.addEventListener('mouseup', onUp);
    window.addEventListener('mousemove', onMove);
    return () => {
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('mouseup', onUp);
      window.removeEventListener('mousemove', onMove);
    };
  }, [loading, error, update]);

  // Sync local UI state with my presence whenever presences change
  useEffect(() => {
    if (!doc) return;
    const my = doc.getMyPresence?.();
    if (my) {
      setShowDrawing(my.showDrawing ?? true);
      setFadeEnabled(my.fadeEnabled ?? false);
      setColor(my.color ?? '#000000');
      setWidth(my.width ?? 6);
      setOpacity(my.opacity ?? 1);
      setLineEraseMode(my.lineEraseMode ?? false);
      setLastDrawingTool(my.lastDrawingTool ?? 'pen');
      setLastPenFading(my.lastPenFading ?? false);
      setLastEraserLine(my.lastEraserLine ?? false);
    }
  }, [presences, doc]);

  if (loading) return <div className="general-container">Loading...</div>;
  if (error)
    return <div className="general-container">Error: {error.message}</div>;

  return (
    <div
      className="general-container"
      onMouseDown={(e) => {
        const tag = e.target.tagName;
        if (['INPUT', 'SELECT', 'TEXTAREA', 'BUTTON'].includes(tag)) return;
        e.preventDefault();
      }}
    >
      {presences.map(({ clientID, presence }) => {
        const {
          cursorShape,
          cursor,
          pointerDown,
          color: presColor = '#000000',
          width: presWidth = 6,
          opacity: presOpacity = 1,
          fadeEnabled: presFade = false,
          lineEraseMode: presLineErase = false,
          showDrawing: presShow = true,
          clearNonce: presClearNonce = 0,
        } = presence;

        return (
          cursor && (
            <Cursor
              key={clientID}
              selectedCursorShape={cursorShape}
              x={cursor.xPos}
              y={cursor.yPos}
              pointerDown={pointerDown}
              fadeEnabled={presFade}
              color={presColor}
              width={presWidth}
              opacity={presOpacity}
              lineEraseMode={presLineErase}
              visible={presShow}
              resetNonce={presClearNonce}
            />
          )
        );
      })}

      <CursorSelections
        handleCursorShapeSelect={handleCursorShapeSelect}
        clientsLength={presences.length}
        fadeEnabled={fadeEnabled}
        onFadeSet={handleFadeSet}
        color={color}
        onColorChange={handleColorChange}
        width={width}
        onWidthChange={handleWidthChange}
        opacity={opacity}
        onOpacityChange={handleOpacityChange}
        lineEraseMode={lineEraseMode}
        onLineEraseModeChange={handleLineEraseModeChange}
        lastDrawingTool={lastDrawingTool}
        lastPenFading={lastPenFading}
        lastEraserLine={lastEraserLine}
        onSetLastDrawingTool={handleSetLastDrawingTool}
        onSetLastPenFading={handleSetLastPenFading}
        onSetLastEraserLine={handleSetLastEraserLine}
        onRestoreLastTool={handleRestoreLastTool}
        showDrawing={showDrawing}
        onToggleDrawing={handleToggleDrawing}
        onClearDrawing={handleClearDrawing}
      />
    </div>
  );
}

export default function App() {
  return (
    <YorkieProvider
      apiKey={import.meta.env.VITE_YORKIE_API_KEY}
      rpcAddr={import.meta.env.VITE_YORKIE_API_ADDR}
    >
      <DocumentProvider
        docKey="simultaneous-cursors"
        initialPresence={initialPresence}
      >
        <CursorsCanvas />
      </DocumentProvider>
    </YorkieProvider>
  );
}
