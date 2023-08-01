import PenCursor from './PenCursor';
import FullAnimation from './FullAnimation';

const Cursor = ({ selectedCursorShape, x, y, pointerDown, pointerUp }) => {
  return (
    <>
      <FullAnimation
        pointerDown={pointerDown}
        pointerUp={pointerUp}
        xPos={x}
        yPos={y}
        selectedCursorShape={selectedCursorShape}
      />

      {selectedCursorShape === 'heart' ? (
        <>
          <img
            src={'src/assets/icons/icon_heart.svg'}
            className="heart-cursor"
            style={{ transform: `translate3d(${x}px, ${y}px, 0)` }}
          />
        </>
      ) : (
        <></>
      )}
      {selectedCursorShape === 'thumbs' ? (
        <>
          <img
            src={'src/assets/icons/icon_thumbs.svg'}
            className="thumbs-cursor"
            style={{ transform: `translate3d(${x}px, ${y}px, 0)` }}
          />
        </>
      ) : (
        <></>
      )}
      {selectedCursorShape === 'pen' ? (
        <>
          <img
            src={'src/assets/icons/icon_pen.svg'}
            className="pen-cursor"
            style={{ transform: `translate3d(${x}px, ${y}px, 0)` }}
          />
          <PenCursor xPos={x} yPos={y} />
        </>
      ) : (
        <></>
      )}
      {selectedCursorShape === 'cursor' ? (
        <>
          <img
            src={'src/assets/icons/icon_cursor.svg'}
            className="cursor-cursor"
            style={{ transform: `translate3d(${x}px, ${y}px, 0)` }}
          />
        </>
      ) : (
        <></>
      )}
    </>
  );
};

export default Cursor;
