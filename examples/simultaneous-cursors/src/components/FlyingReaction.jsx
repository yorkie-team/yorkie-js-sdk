import styles from './FlyingReaction.module.css';
import '../index.css';

export default function FlyingReaction({
  x,
  y,
  timestamp,
  selectedCursorShape,
}) {
  console.log('selectedCursorShape ppppppppppppp ', selectedCursorShape);

  return (
    <div className="reactions-container">
      <div
        className={`absolute select-none pointer-events-none ${
          styles.disappear
        } text-${(timestamp % 5) + 2}xl ${styles['goUp' + (timestamp % 3)]}`}
        style={{ left: x, top: y }}
      >
        <div className={styles['leftRight' + (timestamp % 3)]}>
          <div className="transform -translate-x-1/2 -translate-y-1/2">
            <img
              src={
                selectedCursorShape === 'heart'
                  ? 'src/assets/icons/icon_heart.svg'
                  : selectedCursorShape === 'thumbs'
                  ? 'src/assets/icons/icon_thumbs.svg'
                  : selectedCursorShape === 'pen'
                  ? 'src/assets/icons/icon_pen.svg'
                  : selectedCursorShape === 'cursor'
                  ? 'src/assets/icons/icon_cursor.svg'
                  : 'src/assets/icons/icon_cursor.svg'
              }
            />
          </div>
        </div>
      </div>
    </div>
  );
}
