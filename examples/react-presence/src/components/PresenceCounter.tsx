import { usePresence, usePresenceCount } from '@yorkie-js/react';
import { useEffect, useState } from 'react';
import './PresenceCounter.css';

function PresenceCounter() {
  const { count, loading, error } = usePresence();
  const [prevCount, setPrevCount] = useState(0);
  const [isIncreasing, setIsIncreasing] = useState<boolean | null>(null);

  useEffect(() => {
    if (!loading && count !== prevCount) {
      setIsIncreasing(count > prevCount);
      setPrevCount(count);

      // Clear the animation state after animation completes
      const timer = setTimeout(() => {
        setIsIncreasing(null);
      }, 600);

      return () => clearTimeout(timer);
    }
  }, [count, loading, prevCount]);

  if (loading) {
    return (
      <div className="presence-counter loading">
        <div className="spinner"></div>
        <p>Connecting to room...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="presence-counter error">
        <span className="error-icon">⚠️</span>
        <p>Error: {error.message}</p>
      </div>
    );
  }

  return (
    <div className="presence-counter">
      <div className="presence-status">
        <span className="status-indicator online"></span>
        <span className="status-text">Live</span>
      </div>

      <div
        className={`presence-count ${isIncreasing === true ? 'increase' : ''} ${
          isIncreasing === false ? 'decrease' : ''
        }`}
      >
        <div className="count-value">{count}</div>
        <div className="count-label">
          {count === 1 ? 'user online' : 'users online'}
        </div>
      </div>

      {isIncreasing !== null && (
        <div className="presence-change">
          {isIncreasing ? (
            <span className="change-badge join">👋 Someone joined!</span>
          ) : (
            <span className="change-badge leave">👋 Someone left</span>
          )}
        </div>
      )}
    </div>
  );
}

// Alternative simpler component using only usePresenceCount hook
export function SimplePresenceCounter() {
  const count = usePresenceCount();

  return (
    <div className="simple-counter">
      <span className="online-dot"></span>
      <span>{count} online</span>
    </div>
  );
}

export default PresenceCounter;
