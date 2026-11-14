import styles from './SingleAnimation.module.css';

// One floating icon. The timestamp picks one of three rise heights and
// sway widths, so a burst does not move in lockstep.
export default function SingleAnimation({ x, y, timestamp, shape }) {
  return (
    <div
      className={`${styles.bubble} ${styles['goUp' + (timestamp % 3)]}`}
      style={{ left: x, top: y }}
    >
      <div className={styles['leftRight' + (timestamp % 3)]}>
        <img src={`./icons/icon_${shape}.svg`} alt="" />
      </div>
    </div>
  );
}
