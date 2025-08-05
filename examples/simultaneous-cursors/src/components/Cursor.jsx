import PenCursor from './PenCursor';
import FullAnimation from './FullAnimation';
//import React, {useEffect, useRef} from 'react';


const Cursor = ({ selectedCursorShape, x, y, pointerDown, fadeEnabled, color}) => {
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

//alt={`${selectedCursorShape} cursor`}

//chooses the right icon, makes the path
/*const Cursor = ({
  selectedCursorShape,
  x,
  y,
  pointerDown,
  strokePoint,
  fadeEnabled,
  color,
  lineWidth = 6,
  maxTrail   = 128,
  rdpEpsilon = 2,
}) => {

  const tool = (() => {
    if (selectedCursorShape === 'eraser')     return 'eraser';
    if (selectedCursorShape === 'highlighter') return 'highlighter';
    if (selectedCursorShape === 'pen')         return fadeEnabled ? 'fading' : 'normal';
    if (selectedCursorShape === 'pencil')      return 'normal';
    return null;
  })();


  const remotePointsRef = useRef([]);
  useEffect(() => {
    if (pointerDown && strokePoint && tool) {
      if (typeof strokePoint.x !== 'number' || typeof strokePoint.y !== 'number') {
        console.error('Bad strokePoint!', strokePoint);
        return;
      }
      const p = new Point(strokePoint.x, strokePoint.y);
      if (tool === 'eraser') p.erase = true;
      remotePointsRef.current.push(p);
      if (remotePointsRef.current.length > maxTrail) {
        remotePointsRef.current.splice(
          0,
          remotePointsRef.current.length - maxTrail
        );
      }
    }
  }, [strokePoint, pointerDown, tool, maxTrail]);

  return (
    <>
      {tool && pointerDown && (
        <PenCursor
          xPos={x}
          yPos={y}
          tool={tool}
          color={color}
          lineWidth={lineWidth}
          maxTrail={maxTrail}
          rdpEpsilon={rdpEpsilon}
          resetTrail={false}
          initialPoints={remotePointsRef.current}
        />
      )}
      <img
        src={`./icons/icon_${selectedCursorShape}.svg`}
        className={`${selectedCursorShape}-cursor`}
        style={{
          transform: `translate3d(${x}px, ${y}px, 0)`,
          pointerEvents: 'none',
        }}
      />
      {(selectedCursorShape === 'heart' || selectedCursorShape === 'thumbs') && (
        <FullAnimation
          pointerDown={pointerDown}
          xPos={x}
          yPos={y}
          selectedCursorShape={selectedCursorShape}
        />
      )}
    </>
  );
};

export default Cursor;*/
