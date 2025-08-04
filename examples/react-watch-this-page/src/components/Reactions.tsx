import React, { useState, useEffect } from 'react';
import { useDocument } from '@yorkie-js/react';

interface Reaction {
  id: string;
  emoji: string;
  label: string;
  color: string;
}

const reactions: Reaction[] = [
  { id: 'likes', emoji: '👍', label: 'Like', color: '#1976d2' },
  { id: 'hearts', emoji: '❤️', label: 'Love', color: '#e91e63' },
  { id: 'thinking', emoji: '🤔', label: 'Curious', color: '#ff9800' }
];

function Reactions() {
  const doc = useDocument();
  const [isAnimating, setIsAnimating] = useState<string | null>(null);
  const [animationVariants, setAnimationVariants] = useState<{[key: string]: {goUp: number, leftRight: number}}>({});

  // Detect animation state in real-time
  useEffect(() => {
    if (!doc) return;

    const currentAnimation = (doc.root as any).lastAnimation;
    if (currentAnimation) {
      // Generate animation variant
      const goUpVariant = Math.floor(Math.random() * 3);
      setAnimationVariants(prev => ({
        ...prev,
        [currentAnimation]: { goUp: goUpVariant, leftRight: 0 }
      }));
      
      setIsAnimating(currentAnimation);
      setTimeout(() => {
        setIsAnimating(null);
        // Reset animation state
        doc.update((root: any) => {
          root.lastAnimation = null;
        });
      }, 1500);
    }
  }, [doc?.root]);

  const handleReaction = (reactionId: string) => {
    if (!doc) {
      console.warn('Document not available');
      return;
    }

    try {
      // Get current count
      const currentCount = (doc.root as any)[reactionId] || 0;
      
      console.log(`Updating ${reactionId} from ${currentCount} to ${currentCount + 1}`);
      
      // Increment count and update animation state
      doc.update((root: any) => {
        root[reactionId] = currentCount + 1;
        root.lastAnimation = reactionId; // Trigger animation on all clients
      });
      
    } catch (error) {
      console.error('Failed to update reaction:', error);
    }
  };

  const getReactionCount = (reactionId: string): number => {
    if (!doc) return 0;
    return (doc.root as any)[reactionId] || 0;
  };

  return (
    <div className="inline-reactions">
      <div className="reactions-buttons">
        {reactions.map((reaction) => {
          const count = getReactionCount(reaction.id);
          const isAnimatingThis = isAnimating === reaction.id;
          
          return (
            <button
              key={reaction.id}
              className={`inline-reaction-btn ${isAnimatingThis ? 'animating' : ''} ${count > 0 ? 'active' : ''}`}
              onClick={() => handleReaction(reaction.id)}
              title={`${reaction.label} (${count})`}
            >
              <span className="reaction-emoji">{reaction.emoji}</span>
              {count > 0 && (
                <span className="reaction-count" style={{ color: reaction.color }}>
                  {count}
                </span>
              )}
              {isAnimatingThis && (
                <div className={`inline-reaction-animation goUp${animationVariants[reaction.id]?.goUp || 0}`}>
                  <span style={{ 
                    display: 'inline-block',
                    animation: 'bounceIn 0.3s ease-out',
                    fontSize: '1.2rem'
                  }}>
                    {reaction.emoji}
                  </span>
                </div>
              )}
            </button>
          );
        })}
      </div>
      <span className="reactions-hint">👆 Synchronizes in real-time!</span>
    </div>
  );
}

export default Reactions;