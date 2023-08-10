import { useState } from 'react';

const CursorSelections = ({ handleCursorShapeSelect, clientsLength }) => {
  const [selectedCursorShape, setSelectedCursorShape] = useState('cursor');

  const cursorShapes = ['heart', 'thumbs', 'pen', 'cursor'];

  return (
    <div className="cursor-selector-container">
      <div className="cursor-selections-container">
        {cursorShapes.map((shape) => (
          <img
            key={shape}
            onClick={() => {
              handleCursorShapeSelect(shape);
              setSelectedCursorShape(shape);
            }}
            className={`${
              selectedCursorShape === shape
                ? 'cursor-shape-selected'
                : 'cursor-shape-not-selected'
            }`}
            src={`src/assets/icons/icon_${shape}.svg`}
          />
        ))}
      </div>

      <div className="num-users-container">
        <p>
          {clientsLength !== 1
            ? `${clientsLength} users are here`
            : '1 user here'}
        </p>
      </div>
    </div>
  );
};

export default CursorSelections;
