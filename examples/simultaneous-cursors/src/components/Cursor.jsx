import PenCursor from './PenCursor';
import FullAnimation from './FullAnimation';



const Cursor = ({
  selectedCursorShape,
  x,
  y,
  pointerDown,
  fadeEnabled,
  color,
  width,
}) => {
  const drawingTools = ['pen', 'pencil', 'highlighter', 'eraser', 'fading'];
  const tool = fadeEnabled && selectedCursorShape === 'pen'
    ? 'fading'
    : selectedCursorShape;

  return (
    <>

      <img
        src={`/icons/icon_${selectedCursorShape}.svg`}
        className={`${selectedCursorShape}-cursor`}
        style={{
          position: 'fixed',
          left: `${x}px`,
          top: `${y}px`,
          transform: 'translate(-50%, -100%)',
          pointerEvents: 'none',
          zIndex: 9999,
        }}
        alt={selectedCursorShape}
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
          pointerDown={pointerDown}
        />
      )}
    </>
  );
};

export default Cursor;
