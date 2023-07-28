import PenCursor from './PenCursor';

import './Cursor.css';

const Cursor = ({ selectedCursorShape, x, y }) => {
  return (
    <>
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

      {/* default 어케 set 할건데  like before */}
      {/* 
            <img src={
                cursorShape === 'heart' ? "src/assets/icons/icon_heart.svg" : 
                cursorShape === 'thumbs' ? "src/assets/icons/icon_thumbs.svg" : 
                cursorShape === "pen" ? "src/assets/icons/icon_pen.svg" : 
                cursorShape === "cursor" ? "src/assets/icons/icon_cursor.svg" : 
                "src/assets/icons/icon_cursor.svg"
            }
            className="cursor" style={{ transform: `translate3d(${x}px, ${y}px, 0)` }} />        */}

      {/* <PenCursor></PenCursor>  */}
    </>
  );
};

export default Cursor;
