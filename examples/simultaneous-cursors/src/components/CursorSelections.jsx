import React, { useState } from 'react';



const CursorSelections = ({ handleCursorShapeSelect, clientsLength }) => {
  const [selectedCursorShape, setSelectedCursorShape] = useState('cursor');

  const cursorShapes = ['heart', 'thumbs', 'pen', 'cursor'];

  return (
    <div className="cursor-selector-container">
      <div className="cursor-selections-container">
        {cursorShapes.map((shape) => (
          <img
            key={shape}
            onClick={() => {
              handleCursorShapeSelect(shape);
              setSelectedCursorShape(shape);
            }}
            className={`${
              selectedCursorShape === shape
                ? 'cursor-shape-selected'
                : 'cursor-shape-not-selected'
            }`}
            src={`./icons/icon_${shape}.svg`}
          />
        ))}
      </div>

      <div className="num-users-container">
        <p>
          {clientsLength !== 1
            ? `${clientsLength} users are here`
            : '1 user here'}
        </p>
      </div>
    </div>
  );
};

export default CursorSelections;



/*const CursorSelections = ({
  handleCursorShapeSelect,
  clientsLength,
  fadeEnabled,
  onFadeToggle,
  color,
  onColorChange,
}) => {
  const [selectedCursorShape, setSelectedCursorShape] = useState('cursor');
  const [showPenOptions, setShowPenOptions]     = useState(false);

  const cursorShapes = ['heart', 'thumbs', 'pen', 'cursor'];

  const onSelect = shape => {
    setSelectedCursorShape(shape);
    handleCursorShapeSelect(shape);
    setShowPenOptions(shape === 'pen' ? prev => !prev : false);
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
            gap: 10,
            boxShadow: '0 1px 4px rgba(0,0,0,0.2)',
            zIndex: 10000,
            pointerEvents: 'auto',
          }}
          onMouseDown={e => e.stopPropagation()}
          onMouseUp={e   => e.stopPropagation()}
        >
          <img
            src="/icons/icon_pen.svg"
            alt="Pen"
            width={24}
            height={24}
            style={{ cursor: 'pointer' }}
            onClick={() => onSelect('pen')}
          />

          <img
            src="/icons/icon_fading_pen.svg"
            alt="Fading Pen"
            width={24}
            height={24}
            style={{
              cursor: 'pointer',
              filter: fadeEnabled ? 'none' : 'grayscale(1)',
            }}
            onClick={onFadeToggle}
          />

          <img
            src="/icons/icon_pencil.svg"
            alt="Pencil"
            width={24}
            height={24}
            style={{ cursor: 'pointer' }}
            onClick={() => onSelect('pencil')}
          />

          <img
            src="/icons/icon_highlighter.svg"
            alt="Highlighter"
            width={24}
            height={24}
            style={{ cursor: 'pointer' }}
            onClick={() => onSelect('highlighter')}
          />

          <img
            src="/icons/icon_eraser.svg"
            alt="Eraser"
            width={24}
            height={24}
            style={{ cursor: 'pointer' }}
            onClick={() => onSelect('eraser')}
          />

          <input
            type="color"
            value={color}
            style={{
              width: 24,
              height: 24,
              padding: 0,
              border: 'none',
              background: 'transparent',
              cursor: 'pointer',
            }}
            onChange={e => {
              const newColor = e.target.value;
              onColorChange(newColor);
              setSelectedCursorShape('pen');
              handleCursorShapeSelect('pen');
            }}
            onBlur={() => setShowPenOptions(false)}
          />
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
        {cursorShapes.map(shape => {
          const isSelected = selectedCursorShape === shape;
          return (
            <div
              key={shape}
              onClick={() => onSelect(shape)}
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
                pointerEvents: 'auto',
              }}
            >
              <img
                src={`/icons/icon_${shape}.svg`}
                alt={`${shape} cursor`}
                width={20}
                height={20}
                style={{
                  filter: isSelected ? 'brightness(0) invert(1)' : 'none',
                }}
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
        }}
      >
        <div
          style={{
            background: '#4a4a4a',
            color: '#fff',
            padding: '10px 20px',
            borderRadius: 12,
            fontSize: 14,
            fontFamily: 'sans-serif',
          }}
        >
          {clientsLength !== 1
            ? `${clientsLength} users are here`
            : '1 user here'}
        </div>
      </div>
    </>
  );
};
export default CursorSelections;*/
