
const Cursor = ({ cursorShape, x, y }) => {

    return (
        <img src={
            cursorShape === 'heart' ? "src/assets/icons/icon_heart.svg" : 
            cursorShape === 'thumbs' ? "src/assets/icons/icon_thumbs.svg" : 
            cursorShape === "pen" ? "src/assets/icons/icon_pen.svg" : 
            cursorShape === "cursor" ? "src/assets/icons/icon_cursor.svg" : 
            "src/assets/icons/icon_cursor.svg"
          }
          className="cursor" style={{ transform: `translate3d(${x}px, ${y}px, 0)` }} />
    );
}
 
export default Cursor;




    //   {/* {selectedCursorShape === 'heart' && <img src="src/assets/icons/icon_heart.svg" className="cursor" style={{ transform: `translate3d(${mousePos.x}px, ${mousePos.y}px, 0)` }} />}
    //   {selectedCursorShape === 'thumbs' && <img src="src/assets/icons/icon_thumbs.svg" className="cursor" style={{ transform: `translate3d(${mousePos.x}px, ${mousePos.y}px, 0)` }} />}
    //   {selectedCursorShape === 'pen' && <img src="src/assets/icons/icon_pen.svg" className="cursor" style={{ transform: `translate3d(${mousePos.x}px, ${mousePos.y}px, 0)` }} />}
    //   {selectedCursorShape === 'cursor' && <img src="src/assets/icons/icon_cursor.svg" className="cursor" style={{ transform: `translate3d(${mousePos.x}px, ${mousePos.y}px, 0)` }} />} */}

