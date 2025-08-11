import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, Link, Navigate } from 'react-router-dom';
import { DocumentProvider, useDocument, usePresences } from '@yorkie-js/react';
import { sampleTopic } from '../App';
import PostViewerCount from './PostViewerCount';
import { yorkieApi } from '../services/yorkieApi';
import Viewers from './Viewers';

interface Post {
  id: number;
  key: string;
  title: string;
  subscribe: string;
  content: PostContent[];
}

interface PostContent {
  id: number;
  key: string;
  title: string;
  content: string;
}

interface YorkieDocument {
  id: string;
  key: string;
  project_name: string;
  created_at: string;
  updated_at: string;
  root: any;
  presences: any;
}

interface TopicPageProps {
  currentUser: string;
}

// Content item component with intersection observer
function ContentItem({
  content,
  onContentVisible,
  currentUser,
}: {
  content: PostContent;
  onContentVisible: (contentKey: string | null) => void;
  currentUser: string;
}) {
  const contentRef = useRef<HTMLDivElement>(null);
  const presences = usePresences();

  // Handle mouse enter/leave events
  const handleMouseEnter = useCallback(() => {
    onContentVisible(content.key);
  }, [content.key, onContentVisible]);

  const handleMouseLeave = useCallback(() => {
    onContentVisible(null);
  }, [onContentVisible]);

  // Filter users currently watching this content
  const usersWatchingThisContent = presences.filter(
    (user) => user.presence.currentWatchingContent === content.key,
  );

  console.log("ContentItem", "presences", presences);
  console.log("ContentItem", "usersWatchingThisContent", usersWatchingThisContent);

  return (
    <div 
      ref={contentRef} 
      key={content.id} 
      className="content-item"
      onMouseEnter={handleMouseEnter}
      // onMouseLeave={handleMouseLeave}
    >
      <div className="content-header">
        <h3 className="content-title">{content.title}</h3>
      </div>
      <div className="content-preview">
        {content.content.substring(0, 150)}...
      </div>
      
      {/* Current watching users indicator */}
      {usersWatchingThisContent.length > 0 && (
        <div className="content-watching-users">
          {usersWatchingThisContent.slice(0, 3).map((user, index) => (
            <div
              key={user.presence.userID}
              className={`user-avatar ${user.presence.userID === currentUser ? 'me' : ''} ${user.presence.currentWatchingContent ? 'watching-content' : ''}`}
              style={{
                backgroundColor: getUserColor(user.presence.userID),
                zIndex: usersWatchingThisContent.length - index,
              }}
              title={`${user.presence.userID}${user.presence.userID === currentUser ? ' (me)' : ''} is watching this content`}
            >
              {user.presence.userID?.slice(0, 3).toUpperCase()}
              {user.presence.currentWatchingContent && (
                <div className="watching-indicator">
                  <span className="watching-dot"></span>
                </div>
              )}
            </div>
          ))}
          {usersWatchingThisContent.length > 3 && (
            <div className="more-viewers" title={`${usersWatchingThisContent.length - 3} more users watching`}>
              +{usersWatchingThisContent.length - 3}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Helper function to get user color (moved from Viewers component)
function getUserColor(userID: string): string {
  const avatarColors = [
    '#FF6B6B',
    '#4ECDC4',
    '#45B7D1',
    '#96CEB4',
    '#FFEAA7',
    '#DDA0DD',
    '#98D8C8',
    '#F7DC6F',
  ];
  const hash = userID?.split('').reduce((a, b) => {
    a = (a << 5) - a + b.charCodeAt(0);
    return a & a;
  }, 0);
  return avatarColors[Math.abs(hash) % avatarColors.length];
}

// Main topic page component
function TopicPageContent({
  currentUser,
  topic,
  yorkieDocuments,
}: {
  currentUser: string;
  topic: Post;
  yorkieDocuments: YorkieDocument[];
}) {
  const doc = useDocument();
  const presences = usePresences();
  const [currentWatchingContent, setCurrentWatchingContent] = useState<
    string | null
  >(null);
  const prevWatchingContentRef = useRef<string | null>(null);

  // Update presence when currentWatchingContent changes
  useEffect(() => {
    if (doc && currentWatchingContent !== prevWatchingContentRef.current) {
      prevWatchingContentRef.current = currentWatchingContent;
      // Update the presence using Yorkie's update method
      console.log("TopicPageContent", "currentWatchingContent", currentWatchingContent);
      doc.update((root, presence) => {
        presence.set({
          currentWatchingContent: currentWatchingContent,
          userID: currentUser,
        });
      });
    }
  }, [doc, currentWatchingContent, currentUser]);

  // Handle content visibility change
  const handleContentVisible = useCallback((contentKey: string | null) => {
    setCurrentWatchingContent(contentKey);
  }, []);

  // Find Yorkie documents for topic and contents
  const contentDocuments = topic.content.map((content) => ({
    content,
  }));

  console.log("TopicPageContent", "contentDocuments", contentDocuments);

  return (
    <div className="topic-page-container">
      {/* Top navigation */}
      <nav className="topic-nav">
        <Link to="/" className="back-button">
          ← Back to Topics
        </Link>
      </nav>

      {/* Topic content */}
      <article className="topic-content">
        <header className="topic-header">
          <h1 className="topic-title">{topic.title}</h1>
          <div className="topic-meta">
            <span className="topic-subscribe">{topic.subscribe}</span>
          </div>
          <Viewers currentUser={currentUser} />
        </header>

        {/* Contents list */}
        <div className="contents-list">
          <h2 className="contents-title">Contents</h2>
          {contentDocuments.map(({ content }) => (
            <ContentItem
              key={content.id}
              content={content}
              onContentVisible={handleContentVisible}
              currentUser={currentUser}
            />
          ))}
        </div>
      </article>

      {/* Footer */}
      <footer className="topic-footer">
        <p className="demo-note">
          🌟 <strong>Yorkie Demo:</strong> Open this topic in another browser
          tab. Viewer count and reactions will sync in real-time!
        </p>
      </footer>
    </div>
  );
}

function TopicPage({ currentUser }: TopicPageProps) {
  const { id } = useParams<{ id: string }>();
  const topicId = id ? parseInt(id, 10) : null;
  const topic = topicId ? sampleTopic.find((t) => t.id === topicId) : null;
  const [yorkieDocuments, setYorkieDocuments] = useState<YorkieDocument[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  // Fetch Yorkie documents for this topic and its contents
  const fetchYorkieDocuments = async () => {
    if (!topic) return;

    try {
      setLoading(true);
      const documentKeys = [
        topic.key,
        ...topic.content.map((content) => content.key),
      ];
      const documents = await yorkieApi.getWatchThisPageDocuments(documentKeys);
      setYorkieDocuments(documents);
    } catch (err) {
      console.error('Failed to fetch Yorkie documents:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchYorkieDocuments();
    const interval = setInterval(fetchYorkieDocuments, 10000);
    return () => clearInterval(interval);
  }, [topic]);

  // Redirect to home if topic not found
  if (!topic) {
    return <Navigate to="/" replace />;
  }

  return (
    <DocumentProvider
      docKey={`${topic.key}`}
      initialPresence={{
        userID: currentUser,
        currentWatchingContent: null,
      }}
    >
      <TopicPageContent
        currentUser={currentUser}
        topic={topic}
        yorkieDocuments={yorkieDocuments}
      />
    </DocumentProvider>
  );
}

export default TopicPage;
