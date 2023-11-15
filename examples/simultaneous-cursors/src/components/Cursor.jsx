import PenCursor from './PenCursor';
import FullAnimation from './FullAnimation';

const Cursor = ({ selectedCursorShape, x, y, pointerDown }) => {
  return (
    <>
      <img
        src={`./icons/icon_${selectedCursorShape}.svg`}
        className={`${selectedCursorShape}-cursor`}
        style={{ transform: `translate3d(${x}px, ${y}px, 0)` }}
      />
      {(selectedCursorShape === 'heart' ||
        selectedCursorShape === 'thumbs') && (
        <FullAnimation
          pointerDown={pointerDown}
          xPos={x}
          yPos={y}
          selectedCursorShape={selectedCursorShape}
        />
      )}
      {selectedCursorShape === 'pen' && pointerDown && (
        <PenCursor xPos={x} yPos={y} />
      )}
    </>
  );
};

export default Cursor;
