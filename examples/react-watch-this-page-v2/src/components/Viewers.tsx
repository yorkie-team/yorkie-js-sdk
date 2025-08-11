import React from 'react';
import { usePresences } from '@yorkie-js/react';

// User avatar color array
const avatarColors = [
  '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', 
  '#FFEAA7', '#DDA0DD', '#98D8C8', '#F7DC6F'
];

// Return unique color based on user ID
function getUserColor(userID: string): string {
  const hash = userID?.split('').reduce((a, b) => {
    a = ((a << 5) - a) + b.charCodeAt(0);
    return a & a;
  }, 0);
  return avatarColors[Math.abs(hash) % avatarColors.length];
}

// Individual user avatar component
function UserAvatar({ userID, isMe, currentWatchingContent }: { 
  userID: string; 
  isMe?: boolean;
  currentWatchingContent?: string | null;
}) {
  const color = getUserColor(userID);
  const displayName = userID?.slice(0, 3);
  
  return (
    <div 
      className={`user-avatar ${isMe ? 'me' : ''} ${currentWatchingContent ? 'watching-content' : ''}`}
      style={{ backgroundColor: color }}
      title={`${userID}${isMe ? ' (me)' : ''}${currentWatchingContent ? ` - Watching: ${currentWatchingContent}` : ''}`}
    >
      {displayName?.toUpperCase()}
      {currentWatchingContent && (
        <div className="watching-indicator">
          <span className="watching-dot"></span>
        </div>
      )}
    </div>
  );
}

function Viewers({ currentUser }: { currentUser: string }) {
  const presences = usePresences();
  const viewerCount = presences.length;
  
  // Maximum number of avatars to display
  const maxAvatars = 3;
  const visiblePresences = presences?.slice(0, maxAvatars);
  const remainingCount = Math.max(0, viewerCount - maxAvatars);
  
  return (
    <div className="viewers-container">
      <span className="viewer-avatars">
        {visiblePresences?.map((presence) => (
          <UserAvatar 
            key={presence.clientID} 
            userID={presence.presence.userID}
            isMe={presence.presence.userID === currentUser}
            currentWatchingContent={presence.presence.presence?.currentWatchingContent || null}
          />
        ))}
        {remainingCount > 0 && (
          <div className="more-viewers">
            +{remainingCount}
          </div>
        )}
        <span className="viewer-text">
          {remainingCount > 0 ? (
            <span> and {viewerCount} others are viewing</span>
          ) : (
            <span> is viewing</span>
          )}
        </span>
      </span>
      
      {/* Show current watching content for other users */}
      {visiblePresences?.some(presence => 
        presence.presence.userID !== currentUser && 
        presence.presence.presence?.currentWatchingContent
      ) && (
        <div className="other-users-watching">
          {visiblePresences
            .filter(presence => 
              presence.presence.userID !== currentUser && 
              presence.presence.presence?.currentWatchingContent
            )
            .map((presence) => (
              <div key={presence.clientID} className="user-watching-item">
                <span className="user-name">{presence.presence.userID.slice(0, 3)}</span>
                <span className="watching-content-name">
                  watching: {presence.presence.presence.currentWatchingContent}
                </span>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}

export default Viewers;