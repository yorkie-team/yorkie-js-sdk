import { useState, useRef } from 'react';
import './CursorSelections.css';

export default function CursorSelections({
  handleCursorShapeSelect,
  clientsLength,
  fadeEnabled,
  onFadeSet,
  color,
  onColorChange,
}) {
  const [selectedCursorShape, setSelectedCursorShape] = useState('cursor');
  const [showPenOptions, setShowPenOptions] = useState(false);
  const eraserWrapperRef = useRef(null);
  const cursorShapes = ['heart', 'thumbs', 'pen', 'cursor'];

  const onNavSelect = (shape) => {
    if (shape === 'pen') {
      onFadeSet(false);
      setSelectedCursorShape('pen');
      handleCursorShapeSelect('pen');
      setShowPenOptions(true);
      return;
    }
    setSelectedCursorShape(shape);
    handleCursorShapeSelect(shape);
    setShowPenOptions(false);
  };

  const onPanelSelect = (shape) => {
    setSelectedCursorShape(shape);
    handleCursorShapeSelect(shape);
  };

  return (
    <>
      {showPenOptions && (
        <div
          className="yc-panel yc-draw-tools yc-fade-in"
          onMouseDown={(e) => e.stopPropagation()}
          onMouseUp={(e) => e.stopPropagation()}
          data-native-cursor
        >
          <button
            className="yc-close-btn"
            onClick={() => {
              setShowPenOptions(false);
            }}
            title="Close"
            data-native-cursor
          >
            ×
          </button>
          {[
            { key: 'pen', icon: 'pen' },
            { key: 'fading', icon: 'fading' },
            { key: 'highlighter', icon: 'highlighter' },
          ].map((item) => {
            const isSelected =
              item.icon === 'pen'
                ? selectedCursorShape === 'pen' && !fadeEnabled
                : item.icon === 'fading'
                ? selectedCursorShape === 'pen' && fadeEnabled
                : selectedCursorShape === item.icon;
            return (
              <button
                key={item.key}
                className="yc-tool-icon"
                data-selected={isSelected}
                data-faded={!isSelected}
                data-native-cursor
                title={
                  item.icon === 'fading'
                    ? 'Fading Pen'
                    : item.icon.charAt(0).toUpperCase() + item.icon.slice(1)
                }
                onClick={() => {
                  if (item.icon === 'pen') {
                    onFadeSet(false);
                    onPanelSelect('pen');
                  } else if (item.icon === 'fading') {
                    onFadeSet(true);
                    onPanelSelect('pen');
                  } else {
                    onFadeSet(false);
                    onPanelSelect(item.icon);
                  }
                }}
              >
                <img src={`/icons/icon_${item.icon}.svg`} alt={item.icon} />
              </button>
            );
          })}
          <button
            ref={eraserWrapperRef}
            className="yc-tool-icon"
            data-selected={selectedCursorShape === 'eraser'}
            data-faded={selectedCursorShape !== 'eraser'}
            data-native-cursor
            title="Eraser (line erase)"
            onClick={() => {
              onFadeSet(false);
              onPanelSelect('eraser');
            }}
          >
            <img src="/icons/icon_eraser.svg" alt="Eraser" />
          </button>
          <input
            type="color"
            className="yc-color-chip"
            value={color}
            aria-label="Color"
            title="Color"
            onChange={(e) => onColorChange(e.target.value)}
            data-native-cursor
            onMouseDown={(e) => e.stopPropagation()}
            onMouseUp={(e) => e.stopPropagation()}
          />
        </div>
      )}
      <div className="yc-combined-bar" data-native-cursor>
        <div
          className="yc-combined-icons"
          role="toolbar"
          aria-label="Cursor selector"
          data-native-cursor
        >
          {cursorShapes.map((shape) => {
            const isSelected =
              shape === 'pen'
                ? ['pen', 'highlighter', 'eraser'].includes(selectedCursorShape)
                : selectedCursorShape === shape;
            return (
              <button
                key={shape}
                className="yc-nav-btn"
                data-selected={isSelected}
                onClick={() => onNavSelect(shape)}
                title={shape}
                aria-pressed={isSelected}
                data-native-cursor
              >
                <img
                  src={`/icons/icon_${shape}.svg`}
                  alt={`${shape} cursor`}
                  style={{
                    filter: isSelected ? 'brightness(0) invert(1)' : 'none',
                  }}
                />
              </button>
            );
          })}
        </div>
        <div className="yc-divider" aria-hidden="true" data-native-cursor />
        <div
          className="yc-count-pill"
          data-native-cursor
          title={`${clientsLength} user${
            clientsLength === 1 ? '' : 's'
          } online`}
          aria-label={`${clientsLength} user${
            clientsLength === 1 ? '' : 's'
          } online`}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            aria-hidden="true"
            focusable="false"
          >
            <path
              fill="currentColor"
              d="M12 12.75c2.899 0 5.25-2.351 5.25-5.25S14.899 2.25 12 2.25 6.75 4.601 6.75 7.5 9.101 12.75 12 12.75Zm0 1.5c-3.005 0-9 1.51-9 4.5v.75a.75.75 0 0 0 .75.75h16.5a.75.75 0 0 0 .75-.75v-.75c0-2.99-5.995-4.5-9-4.5Z"
            />
          </svg>
          <span>{clientsLength}</span>
        </div>
      </div>
    </>
  );
}
