import { useState } from 'react';

const CursorSelections = ({ handleCursorShapeSelect, clientsLength }) => {
  const [selectedCursorShape, setSelectedCursorShape] = useState('cursor');
  return (
    <div className="cursor-selector-container">
      <div className="cursor-selections-container">
        <img
          onClick={() => {
            handleCursorShapeSelect('heart');
            setSelectedCursorShape('heart');
          }}
          className={
            selectedCursorShape === 'heart'
              ? 'cursor-shape-selected'
              : 'cursor-shape-not-selected'
          }
          src="src/assets/icons/icon_heart.svg"
        />
        <img
          onClick={() => {
            handleCursorShapeSelect('thumbs');
            setSelectedCursorShape('thumbs');
          }}
          className={
            selectedCursorShape === 'thumbs'
              ? 'cursor-shape-selected'
              : 'cursor-shape-not-selected'
          }
          src="src/assets/icons/icon_thumbs.svg"
        />
        <img
          onClick={() => {
            handleCursorShapeSelect('pen');
            setSelectedCursorShape('pen');
          }}
          className={
            selectedCursorShape === 'pen'
              ? 'cursor-shape-selected'
              : 'cursor-shape-not-selected'
          }
          src="src/assets/icons/icon_pen.svg"
        />
        <img
          onClick={() => {
            handleCursorShapeSelect('cursor');
            selectedCursorShape('cursor');
          }}
          className={
            selectedCursorShape === 'cursor'
              ? 'cursor-shape-selected'
              : 'cursor-shape-not-selected'
          }
          src="src/assets/icons/icon_cursor.svg"
        />
      </div>

      <div className="num-users-container">
        {clientsLength !== 1 ? (
          <p>{clientsLength} users are here</p>
        ) : (
          <p> 1 user here </p>
        )}
      </div>
    </div>
  );
};

export default CursorSelections;
