'use client';

import { usePresences } from '@yorkie-js/react';

const Participants = () => {
  const presences = usePresences();

  return (
    <div className="flex items-center gap-2">
      <span>Participants:</span>
      <div className="flex items-center gap-2">
        {presences && presences.length > 0 ? (
          <span className="text-sm text-gray-600">
            {presences.length === 1 ? 'Just you' : `${presences.length} users`}
          </span>
        ) : (
          <span className="text-sm text-gray-400">No participants</span>
        )}
      </div>
    </div>
  );
};

export default Participants;
