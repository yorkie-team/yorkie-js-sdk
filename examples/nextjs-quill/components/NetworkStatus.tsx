'use client';

import { DocEvent, Document, StreamConnectionStatus } from '@yorkie-js/sdk';
import { useEffect, useState } from 'react';
import { cn } from '../lib/utils';

interface NetworkStatusProps {
  doc: Document<any>;
}

const NetworkStatus = ({ doc }: NetworkStatusProps) => {
  const [isOnline, setIsOnline] = useState(true);

  useEffect(() => {
    if (!doc) return;

    const handleStatusChange = (event: DocEvent) => {
      console.log(`Network status: ${event.value}`);
      if (event.value === StreamConnectionStatus.Disconnected) {
        setIsOnline(false);
      } else if (event.value === StreamConnectionStatus.Connected) {
        setIsOnline(true);
      }
    };

    // Subscribe to the yorkie document's connection status changes
    const unsubscribe = doc.subscribe('connection', handleStatusChange);

    return () => {
      unsubscribe();
    };
  }, [doc]);

  return (
    <div className="flex items-center gap-2">
      <span>Network Status:</span>
      <span className={cn("inline-block w-3 h-3 rounded-full",
        isOnline ? 'bg-green-500' : 'bg-red-500')}></span>
    </div>
  );
};

export default NetworkStatus;
