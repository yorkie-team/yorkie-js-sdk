import React, { useEffect, useState, useRef} from 'react';
import yorkie from '@yorkie-js/sdk';
import Cursor from './components/Cursor';
import CursorSelections from './components/CursorSelections';
import './App.css';


const client = new yorkie.Client({
  rpcAddr: import.meta.env.VITE_YORKIE_API_ADDR,
  apiKey: import.meta.env.VITE_YORKIE_API_KEY,
});

const doc = new yorkie.Document('simultaneous-cursors', {
  enableDevtools: true,
});


export default function App() {
  const [clients, setClients] = useState([]);
  const [fadeEnabled,   setFadeEnabled]   = useState(false);
  const [color,         setColor]         = useState('#000000');
  const [width,         setWidth]         = useState(6);
  const [opacity,       setOpacity]       = useState(1);
  const [lineEraseMode, setLineEraseMode] = useState(false);
  const [lastDrawingTool, setLastDrawingTool] = useState('pen');
  const [lastPenFading,   setLastPenFading]   = useState(false);
  const [lastEraserLine,  setLastEraserLine]  = useState(false);
  const [showDrawing, setShowDrawing] = useState(true);

  const handleCursorShapeSelect = (cursorShape) => {
    doc.update((_, p) => p.set({ cursorShape }));
  };

  const handleFadeSet = (next) => {
    setFadeEnabled(next);
    doc.update((_, p) => p.set({ fadeEnabled: next }));
  };
  const handleColorChange = (newColor) => {
    setColor(newColor);
    doc.update((_, p) => p.set({ color: newColor }));
  };
  const handleWidthChange = (newW) => {
    setWidth(newW);
    doc.update((_, p) => p.set({ width: newW }));
  };
  const handleOpacityChange = (newO) => {
    setOpacity(newO);
    doc.update((_, p) => p.set({ opacity: newO }));
  };

  const handleLineEraseModeChange = (val) => {
    setLineEraseMode(val);
    doc.update((_, p) => p.set({ lineEraseMode: val }));
  };

  const handleSetLastDrawingTool = (tool) => {
    setLastDrawingTool(tool);
    doc.update((_, p) => p.set({ lastDrawingTool: tool }));
  };
  const handleSetLastPenFading = (val) => {
    setLastPenFading(val);
    doc.update((_, p) => p.set({ lastPenFading: val }));
  };
  const handleSetLastEraserLine = (val) => {
    setLastEraserLine(val);
    doc.update((_, p) => p.set({ lastEraserLine: val }));
  };

  const handleRestoreLastTool = () => {
    doc.update((_, p) => p.set({ cursorShape: lastDrawingTool }));
    const nextFade   = lastDrawingTool === 'pen'    ? lastPenFading  : false;
    const nextLineEr = lastDrawingTool === 'eraser' ? lastEraserLine : false;
    setFadeEnabled(nextFade);
    setLineEraseMode(nextLineEr);
    doc.update((_, p) => p.set({ fadeEnabled: nextFade, lineEraseMode: nextLineEr }));
  };


  const handleToggleDrawing = () => {
    setShowDrawing(v => {
      const nv = !v;
      doc.update((_, p) => p.set({ showDrawing: nv }));
      return nv;
    });
  };


  const handleClearDrawing = () => {
    doc.update((_, p) => {
      const prev = p.get('clearNonce') ?? 0;
      p.set({ clearNonce: prev + 1 });
    });
  };

  useEffect(() => {
    const onDown = () => doc.update((_, p) => p.set({ pointerDown: true }));
    const onUp   = () => doc.update((_, p) => p.set({ pointerDown: false }));
    const onMove = (e) => doc.update((_, p) =>
      p.set({ cursor: { xPos: e.clientX, yPos: e.clientY } })
    );

    async function setup() {
      await client.activate();
      await client.attach(doc, {
        initialPresence: {
          cursorShape:    'cursor',
          cursor:         { xPos: 0, yPos: 0 },
          pointerDown:    false,
          color:          '#000000',
          width:          6,
          opacity:        1,
          fadeEnabled:    false,
          lineEraseMode:  false,
          lastDrawingTool:'pen',
          lastPenFading:  false,
          lastEraserLine: false,
          showDrawing: true,
          clearNonce:  0,
        },
      });

      const unsubscribePresence = doc.subscribe('presence', () => {
        setClients(doc.getPresences());
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
      });

      window.addEventListener('mousedown', onDown);
      window.addEventListener('mouseup',   onUp);
      window.addEventListener('mousemove', onMove);

      return () => {
        unsubscribePresence?.();
      };
    }
    setup().catch(console.error);

    return () => {
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('mouseup',   onUp);
      window.removeEventListener('mousemove', onMove);
    };
  }, []);

  return (
    <div
      className="general-container"
      onMouseDown={(e) => {
        const tag = e.target.tagName;
        if (['INPUT','SELECT','TEXTAREA','BUTTON'].includes(tag)) return;
        e.preventDefault();
      }}
    >
      {clients.map(({ clientID, presence }) => {
        const {
          cursorShape,
          cursor,
          pointerDown,
          color:          presColor       = '#000000',
          width:          presWidth       = 6,
          opacity:        presOpacity     = 1,
          fadeEnabled:    presFade        = false,
          lineEraseMode:  presLineErase   = false,
          showDrawing:    presShow        = true,
          clearNonce:     presClearNonce  = 0,
        } = presence;

        return cursor && (
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
        );
      })}

      <CursorSelections
        handleCursorShapeSelect={handleCursorShapeSelect}
        clientsLength={clients.length}
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
