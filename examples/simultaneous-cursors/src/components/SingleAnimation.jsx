import styles from './SingleAnimation.module.css';

export default function SingleAnimation({
  x,
  y,
  timestamp,
  selectedCursorShape,
}) {
  return (
    <div className="single-animation-container">
      <div
        className={`absolute select-none pointer-events-none ${
          styles.disappear
        } text-${(timestamp % 5) + 2}xl ${styles['goUp' + (timestamp % 3)]}`}
        style={{ left: x, top: y }}
      >
        <div className={styles['leftRight' + (timestamp % 3)]}>
          <div className="transform -translate-x-1/2 -translate-y-full">
            <img src={`./icons/icon_${selectedCursorShape}.svg`} />
          </div>
        </div>
      </div>
    </div>
  );
}
