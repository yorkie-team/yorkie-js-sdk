import { useConnection } from "@yorkie-js/react";
import { StreamConnectionStatus } from '../../../../packages/sdk/src/yorkie';

export function ConnectionStatus() {
  const connection = useConnection();
  return (
    <div id="connection-status">
      Connection Status: {' '}
      {connection === StreamConnectionStatus.Connected ? (
        <span className="green"> </span>
      ) : (
        <span className="red"> </span>
      )}
    </div>
  );
}
