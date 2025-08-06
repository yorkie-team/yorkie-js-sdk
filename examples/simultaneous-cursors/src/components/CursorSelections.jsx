import { useState } from 'react';


const CursorSelections = ({
  handleCursorShapeSelect,
  clientsLength,
  fadeEnabled,
  onFadeToggle,
  color,
  onColorChange,
  width,
  onWidthChange,
}) => {
  const [selectedCursorShape, setSelectedCursorShape] = useState('cursor');
  const [showPenOptions, setShowPenOptions]           = useState(false);
  const cursorShapes = ['heart', 'thumbs', 'pen', 'cursor'];

  const onSelect = (shape) => {
    setSelectedCursorShape(shape);
    handleCursorShapeSelect(shape);
    setShowPenOptions(shape === 'pen');
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
            padding: '4px 8px',
            borderRadius: 8,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            boxShadow: '0 1px 4px rgba(0,0,0,0.2)',
            zIndex: 10000,
            pointerEvents: 'auto',
          }}

          onMouseDown={(e) => e.stopPropagation()}
          onMouseUp={(e)   => e.stopPropagation()}
        >

          <img
            src="/icons/icon_pen.svg" alt="Pen" width={24} height={24}
            style={{ cursor: 'pointer' }}
            onClick={() => onSelect('pen')}
          />
          <img
            src="/icons/icon_fading.svg" alt="Fading Pen" width={24} height={24}
            style={{ cursor: 'pointer', filter: fadeEnabled ? 'none' : 'grayscale(1)' }}
            onClick={() => {
              onFadeToggle();
              handleCursorShapeSelect('fading');
              setSelectedCursorShape('fading');
            }}
          />
          <img
            src="/icons/icon_pencil.svg" alt="Pencil" width={24} height={24}
            style={{ cursor: 'pointer' }}
            onClick={() => onSelect('pencil')}
          />
          <img
            src="/icons/icon_highlighter.svg" alt="Highlighter" width={24} height={24}
            style={{ cursor: 'pointer' }}
            onClick={() => onSelect('highlighter')}
          />
          <img
            src="/icons/icon_eraser.svg" alt="Eraser" width={24} height={24}
            style={{ cursor: 'pointer' }}
            onClick={() => onSelect('eraser')}
          />


          <input
            type="color" value={color}
            style={{ width:24, height:24, padding:0, border:'none', background:'transparent', cursor:'pointer' }}
            onChange={e => {
              onColorChange(e.target.value);
              setSelectedCursorShape('pen');
              handleCursorShapeSelect('pen');
            }}
          />


          <label style={{ display:'flex', alignItems:'center', gap:4, userSelect:'none' }}>
            Size:
            <input
              type="range"
              min={2} max={20} step={1}
              value={width}
              style={{ cursor:'pointer' }}
              onChange={e => onWidthChange(Number(e.target.value))}
            />
          </label>
        </div>
      )}


      <div style={{ position:'fixed', bottom:50, right:20, display:'flex', gap:16, zIndex:10000, pointerEvents:'auto' }}>
        {cursorShapes.map(shape => {
          const sel = selectedCursorShape === shape;
          return (
            <div
              key={shape}
              onClick={() => onSelect(shape)}
              style={{
                width:40, height:40,
                background: sel?'#4a4a4a':'#c0c0c0',
                borderRadius:8, display:'flex',
                alignItems:'center', justifyContent:'center',
                cursor:'pointer', transition:'background .2s'
              }}
            >
              <img
                src={`/icons/icon_${shape}.svg`}
                alt={shape} width={20} height={20}
                style={{ filter: sel?'brightness(0) invert(1)':'none' }}
              />
            </div>
          );
        })}
      </div>

      <div style={{ position:'fixed', bottom:10, right:20, zIndex:10000, pointerEvents:'auto' }}>
        <div style={{
          background:'#4a4a4a', color:'#fff',
          padding:'10px 20px', borderRadius:12,
          fontSize:14, fontFamily:'sans-serif'
        }}>
          {clientsLength !== 1 ? `${clientsLength} users are here` : '1 user here'}
        </div>
      </div>
    </>
  );
};

export default CursorSelections;
