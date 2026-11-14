import { useState } from 'react';

const cursorTools = [
  { shape: 'cursor', label: 'Cursor' },
  { shape: 'heart', label: 'Send hearts' },
  { shape: 'thumbs', label: 'Send thumbs up' },
  { shape: 'pen', label: 'Draw' },
];
const drawingTools = [
  { shape: 'pen', fade: false, icon: 'pen', label: 'Pen' },
  { shape: 'pen', fade: true, icon: 'fading', label: 'Fading pen' },
  {
    shape: 'highlighter',
    fade: false,
    icon: 'highlighter',
    label: 'Highlighter',
  },
  {
    shape: 'eraser',
    fade: false,
    icon: 'eraser',
    label: 'Eraser',
  },
];
const drawingShapes = ['pen', 'highlighter', 'eraser'];

export default function CursorSelections({
  shape,
  fadeEnabled,
  canClear,
  onSelect,
  onClear,
}) {
  const [showDrawingTools, setShowDrawingTools] = useState(false);

  const selectTool = (next) => {
    onSelect(next);
    setShowDrawingTools(next === 'pen');
  };

  return (
    <div className="toolbar-dock" data-native-cursor>
      {showDrawingTools && (
        <div className="toolbar" role="toolbar" aria-label="Drawing tools">
          {drawingTools.map((tool) => {
            const selected = shape === tool.shape && fadeEnabled === tool.fade;
            return (
              <button
                key={tool.icon}
                type="button"
                className="tool-button"
                aria-pressed={selected}
                aria-label={tool.label}
                title={tool.label}
                onClick={() => onSelect(tool.shape, tool.fade)}
              >
                <img src={`./icons/icon_${tool.icon}.svg`} alt="" />
              </button>
            );
          })}
          <button
            type="button"
            className="tool-button"
            aria-label="Clear canvas for everyone"
            title="Clear canvas for everyone"
            disabled={!canClear}
            onClick={onClear}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
              <path
                d="M2.5 4h11M6 4V2.5h4V4M4 4l.7 9.5h6.6L12 4"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
          <span className="toolbar-divider" aria-hidden="true" />
          <button
            type="button"
            className="tool-button"
            aria-label="Close drawing tools"
            title="Close drawing tools"
            onClick={() => setShowDrawingTools(false)}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
              <path
                d="M4 4l8 8M12 4l-8 8"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>
      )}
      <div className="toolbar" role="toolbar" aria-label="Cursor">
        {cursorTools.map((tool) => {
          const selected =
            tool.shape === 'pen'
              ? drawingShapes.includes(shape)
              : shape === tool.shape;
          return (
            <button
              key={tool.shape}
              type="button"
              className="tool-button"
              aria-pressed={selected}
              aria-label={tool.label}
              title={tool.label}
              onClick={() => selectTool(tool.shape)}
            >
              <img src={`./icons/icon_${tool.shape}.svg`} alt="" />
            </button>
          );
        })}
      </div>
    </div>
  );
}
