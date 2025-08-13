import { useState, useRef, useEffect } from 'react';


const CursorSelections = ({
  handleCursorShapeSelect,
  clientsLength,
  fadeEnabled,
  onFadeSet,
  color,
  onColorChange,
  width,
  onWidthChange,
  opacity,
  onOpacityChange,
  lineEraseMode,
  onLineEraseModeChange,
  lastDrawingTool,
  lastPenFading,
  lastEraserLine,
  onSetLastDrawingTool,
  onSetLastPenFading,
  onSetLastEraserLine,
  onRestoreLastTool,
  showDrawing,
  onToggleDrawing,
  onClearDrawing,
}) => {
  const [selectedCursorShape, setSelectedCursorShape] = useState('cursor');
  const [showPenOptions, setShowPenOptions]           = useState(false);
  const [showSizeSlider, setShowSizeSlider]           = useState(false);
  const [showColorOptions, setShowColorOptions]       = useState(false);
  const [showEraserPopup, setShowEraserPopup] = useState(false);
  const eraserWrapperRef = useRef(null);
  const cursorShapes = ['heart', 'thumbs', 'pen', 'cursor'];

  const onNavSelect = (shape) => {
    if (shape === 'pen') {
      onRestoreLastTool();
      setSelectedCursorShape(lastDrawingTool);
      setShowPenOptions(prev => !prev);
      setShowEraserPopup(false);
      setShowColorOptions(false);
      setShowSizeSlider(false);
      return;
    }
    setSelectedCursorShape(shape);
    handleCursorShapeSelect(shape);
    setShowEraserPopup(false);
  };

  const onPanelSelect = (shape) => {
    setSelectedCursorShape(shape);
    handleCursorShapeSelect(shape);
  };

  return (
    <>
      {showPenOptions && (
        <div
          style={{
            position: 'fixed',
            top: 10,
            left: '50%',
            transform: 'translateX(-50%)',
            background: '#f0f0f0',
            padding: '6px 10px',
            borderRadius: 10,
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            boxShadow: '0 1px 4px rgba(0,0,0,0.2)',
            zIndex: 10000,
            pointerEvents: 'auto',
          }}
          onMouseDown={(e) => e.stopPropagation()}
          onMouseUp={(e) => e.stopPropagation()}
        >
          <button
            onClick={() => {
              setShowPenOptions(false);
              setShowEraserPopup(false);
            }}
            style={{
              border: 'none',
              background: '#fff',
              borderRadius: 8,
              width: 24,
              height: 24,
              lineHeight: '24px',
              textAlign: 'center',
              cursor: 'pointer',
              boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.06)',
            }}
            title="Close"
          >
            ×
          </button>

          <img
            src="/icons/icon_pen.svg"
            alt="Pen"
            width={24}
            height={24}
            style={{
              cursor: 'pointer',
              filter: (selectedCursorShape === 'pen' && !fadeEnabled) ? 'none' : 'grayscale(1)',
            }}
            onClick={() => {
              setShowEraserPopup(false);
              onFadeSet(false);
              onSetLastPenFading(false);
              onSetLastDrawingTool('pen');
              onPanelSelect('pen');
            }}
            title="Pen"
          />
          <img
            src="/icons/icon_fading.svg"
            alt="Fading Pen"
            width={24}
            height={24}
            style={{
              cursor: 'pointer',
              filter: (selectedCursorShape === 'pen' && fadeEnabled) ? 'none' : 'grayscale(1)',
            }}
            onClick={() => {
              setShowEraserPopup(false);
              onFadeSet(true);
              onSetLastPenFading(true);
              onSetLastDrawingTool('pen');
              onPanelSelect('pen');
            }}
            title="Fading Pen"
          />
          <img
            src="/icons/icon_pencil.svg"
            alt="Pencil"
            width={24}
            height={24}
            style={{ cursor: 'pointer', filter: selectedCursorShape==='pencil' ? 'none' : 'grayscale(1)' }}
            onClick={() => {
              setShowEraserPopup(false);
              onFadeSet(false);
              onSetLastDrawingTool('pencil');
              onPanelSelect('pencil');
            }}
            title="Pencil"
          />
          <img
            src="/icons/icon_highlighter.svg"
            alt="Highlighter"
            width={24}
            height={24}
            style={{ cursor: 'pointer', filter: selectedCursorShape==='highlighter' ? 'none' : 'grayscale(1)' }}
            onClick={() => {
              setShowEraserPopup(false);
              onFadeSet(false);
              onSetLastDrawingTool('highlighter');
              onPanelSelect('highlighter');
            }}
            title="Highlighter"
          />
          <div
            ref={eraserWrapperRef}
            style={{ position: 'relative', display: 'inline-flex' }}
          >
            <img
              src="/icons/icon_eraser.svg"
              alt="Eraser"
              width={24}
              height={24}
              style={{
                cursor: 'pointer',
                filter: (selectedCursorShape==='eraser') ? 'none' : 'grayscale(1)',
              }}
              onClick={() => {
                onSetLastDrawingTool('eraser');
                onPanelSelect('eraser');
                setShowEraserPopup(v => !v);
                setShowColorOptions(false);
                setShowSizeSlider(false);
              }}
              title="Eraser"
            />

            {showEraserPopup && (
              <div
                style={{
                  position: 'absolute',
                  top: 32,
                  left: -12,
                  background: '#ffffff',
                  borderRadius: 8,
                  padding: '8px 10px',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  zIndex: 10002,
                  whiteSpace: 'nowrap',
                }}
                onMouseDown={(e) => e.stopPropagation()}
                onMouseUp={(e) => e.stopPropagation()}
              >
                <span style={{ fontSize: 12, color: '#333' }}>Line erase</span>
                <input
                  type="checkbox"
                  checked={lineEraseMode}
                  onChange={(e) => {
                    const on = e.target.checked;
                    onSetLastEraserLine(on);
                    onLineEraseModeChange(on);
                    onPanelSelect('eraser');
                  }}
                  style={{ cursor: 'pointer' }}
                />
              </div>
            )}
          </div>
          <div
            onClick={() => {
              setShowColorOptions(v => !v);
              setShowEraserPopup(false);
            }}
            style={{
              width: 24,
              height: 24,
              background: color,
              border: '2px solid #fff',
              boxShadow: '0 0 0 1px rgba(0,0,0,0.2)',
              cursor: 'pointer',
              userSelect: 'none',
            }}
            title="Color & Opacity"
          />
          {showColorOptions && (
            <div
              style={{
                position: 'absolute',
                top: 42,
                left: '50%',
                transform: 'translateX(-50%)',
                background: '#fff',
                padding: '8px',
                borderRadius: 8,
                boxShadow: '0 2px 6px rgba(0,0,0,0.2)',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 8,
                pointerEvents: 'auto',
                zIndex: 10001,
              }}
              onMouseDown={(e) => e.stopPropagation()}
              onMouseUp={(e) => e.stopPropagation()}
            >
              <input
                type="color"
                value={color}
                style={{ width: 32, height: 32, padding: 0, border: 'none' }}
                onChange={(e) => onColorChange(e.target.value)}
              />
              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  fontSize: 12,
                  userSelect: 'none'
                }}
              >
                Opacity
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={1}
                  value={Math.round(opacity * 100)}
                  onChange={(e) => onOpacityChange(Number(e.target.value) / 100)}
                  style={{ cursor: 'pointer' }}
                />
                <span style={{ width: 36, textAlign: 'right' }}>
                  {Math.round(opacity * 100)}%
                </span>
              </label>
            </div>
          )}
          <div
            onClick={() => {
              setShowSizeSlider(s => !s);
              setShowEraserPopup(false);
            }}
            style={{
              width: 48,
              height: 28,
              borderRadius: 14,
              background: '#4a4a4a',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              color: '#fff',
              fontSize: 12,
              userSelect: 'none',
            }}
            title="Brush Size"
          >
            {width}px
          </div>
          {showSizeSlider && (
            <input
              type="range"
              min={1}
              max={70}
              step={1}
              value={width}
              onChange={(e) => onWidthChange(Number(e.target.value))}
              style={{ cursor: 'pointer' }}
            />
          )}
        </div>
      )}
      <div
        style={{
          position: 'fixed',
          bottom: 50,
          right: 20,
          display: 'flex',
          gap: 16,
          zIndex: 10000,
          pointerEvents: 'auto',
        }}
      >
        {cursorShapes.map((shape) => {
          const isSelected =
            shape === 'pen'
              ? ['pen','pencil','highlighter','eraser'].includes(selectedCursorShape)
              : selectedCursorShape === shape;

          return (
            <div
              key={shape}
              onClick={() => onNavSelect(shape)}
              style={{
                width: 40,
                height: 40,
                background: isSelected ? '#4a4a4a' : '#c0c0c0',
                borderRadius: 8,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                transition: 'background 0.2s',
              }}
              title={shape}
            >
              <img
                src={`/icons/icon_${shape}.svg`}
                alt={`${shape} cursor`}
                width={20}
                height={20}
                style={{ filter: isSelected ? 'brightness(0) invert(1)' : 'none' }}
              />
            </div>
          );
        })}
      </div>
      <div
        style={{
          position: 'fixed',
          bottom: 10,
          right: 20,
          zIndex: 10000,
          pointerEvents: 'auto',
          display: 'flex',
          gap: 8,
          alignItems: 'center',
        }}
      >
        <div
          style={{
            background: '#4a4a4a',
            color: '#fff',
            padding: '10px 20px',
            borderRadius: 12,
            fontSize: 14,
            fontFamily: 'Lato, sans-serif',
          }}
        >
          {clientsLength !== 1 ? `${clientsLength} users are here` : '1 user here'}
        </div>
        <button
          onClick={onToggleDrawing}
          style={{
            background: showDrawing ? '#9242aaff' : '#bd6fd2ff',
            color: '#fff',
            border: 'none',
            padding: '10px 12px',
            borderRadius: 12,
            cursor: 'pointer',
            fontSize: 14,
          }}
          title={showDrawing ? 'Hide drawing' : 'Show drawing'}
        >
          {showDrawing ? 'hide drawing' : 'show drawing'}
        </button>

        <button
          onClick={onClearDrawing}
          style={{
            background: '#9242aaff',
            color: '#fff',
            border: 'none',
            padding: '10px 12px',
            borderRadius: 12,
            cursor: 'pointer',
            fontSize: 14,
          }}
          title="Clear Drawing"
        >
          clear drawing
        </button>
      </div>
    </>
  );
};

export default CursorSelections;
