import React, { memo } from 'react';
import { usePresences } from '@yorkie-js/react';

export const Peers = memo(function Peers() {
  const presences = usePresences();
  return (
    <div id="peers-container">
      <p>
        Peers:{' '}
        {presences.map((presence, index) => (
          <React.Fragment key={presence.clientID}>
            <span>{presence.clientID.slice(-2)}</span>
            {index < presences.length - 1 && <span>, </span>}
          </React.Fragment>
        ))}
      </p>
    </div>
  );
});
