'use client';

import { useChannel, useChannelSessionCount } from '@yorkie-js/react';
import { useEffect, useState } from 'react';
import './SessionCounter.css';

function SessionCounter() {
  const { sessionCount, loading, error } = useChannel();
  const [prevCount, setPrevCount] = useState(0);
  const [isIncreasing, setIsIncreasing] = useState<boolean | null>(null);

  useEffect(() => {
    if (!loading && sessionCount !== prevCount) {
      setTimeout(() => {
        setIsIncreasing(sessionCount > prevCount);
        setPrevCount(sessionCount);
      }, 0);

      // Clear the animation state after animation completes
      const timer = setTimeout(() => {
        setIsIncreasing(null);
      }, 600);

      return () => clearTimeout(timer);
    }
  }, [sessionCount, loading, prevCount]);

  if (loading) {
    return (
      <div className="session-counter loading">
        <div className="spinner"></div>
        <p>Connecting to room...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="session-counter error">
        <span className="error-icon">⚠️</span>
        <p>Error: {error.message}</p>
      </div>
    );
  }

  return (
    <div className="session-counter">
      <div className="session-status">
        <span className="status-indicator online"></span>
        <span className="status-text">Live</span>
      </div>

      <div
        className={`session-count ${isIncreasing === true ? 'increase' : ''} ${
          isIncreasing === false ? 'decrease' : ''
        }`}
      >
        <div className="count-value">{sessionCount}</div>
        <div className="count-label">
          {sessionCount === 1 ? 'user online' : 'users online'}
        </div>
      </div>

      {isIncreasing !== null && (
        <div className="session-change">
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

// Alternative simpler component using only useChannel hook
export function SimpleSessionCounter() {
  const sessionCount = useChannelSessionCount();

  return (
    <div className="simple-counter">
      <span className="online-dot"></span>
      <span>{sessionCount} online</span>
    </div>
  );
}

export default SessionCounter;
