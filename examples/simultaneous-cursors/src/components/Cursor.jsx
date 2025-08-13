import PenCursor from './PenCursor';
import FullAnimation from './FullAnimation';

const Cursor = ({
  selectedCursorShape,
  x, y,
  pointerDown,
  fadeEnabled,
  color,
  width,
  opacity,
  lineEraseMode,
  visible = true,
  resetNonce = 0,
}) => {
  const baseTool = selectedCursorShape;
  const tool = (fadeEnabled && baseTool === 'pen') ? 'fading' : baseTool;

  const iconBase =
    (selectedCursorShape === 'pen' && fadeEnabled)
      ? 'fading'
      : (selectedCursorShape === 'eraser' && lineEraseMode)
        ? 'line'
        : selectedCursorShape;

  const drawingTools = ['pen','pencil','highlighter','eraser','fading'];

  return (
    <>
      <img
        src={`/icons/icon_${iconBase}.svg`}
        className={`${selectedCursorShape}-cursor`}
        style={{
          position: 'fixed',
          left: `${x}px`,
          top: `${y}px`,
          transform: 'translate(-50%, -100%)',
          pointerEvents: 'none',
          zIndex: 10001,
        }}
        alt={iconBase}
      />

      {(selectedCursorShape === 'heart' || selectedCursorShape === 'thumbs') && (
        <FullAnimation
          pointerDown={pointerDown}
          xPos={x}
          yPos={y}
          selectedCursorShape={selectedCursorShape}
        />
      )}

      {drawingTools.includes(tool) && (
        <PenCursor
          xPos={x}
          yPos={y}
          tool={tool}
          color={color}
          lineWidth={width}
          opacity={opacity}
          lineEraseMode={lineEraseMode}
          pointerDown={pointerDown}
          visible={visible}
          resetNonce={resetNonce}
        />
      )}
    </>
  );
};

export default Cursor;
