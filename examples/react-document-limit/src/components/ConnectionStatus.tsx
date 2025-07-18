import { useConnection } from '@yorkie-js/react';
import { StreamConnectionStatus } from '@yorkie-js/sdk';
import { memo } from 'react';

export const ConnectionStatus = memo(function ConnectionStatus() {
  const connection = useConnection();
  return (
    <div id="connection-status">
      Connection Status:{' '}
      {connection === StreamConnectionStatus.Connected ? (
        <span className="green"> </span>
      ) : (
        <span className="red"> </span>
      )}
    </div>
  );
});
