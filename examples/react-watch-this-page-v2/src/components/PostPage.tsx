import React from 'react';
import { useParams, Link, Navigate } from 'react-router-dom';
import { DocumentProvider } from '@yorkie-js/react';
import { sampleTopic } from '../App';
import Viewers from './Viewers';
import Reactions from './Reactions';

interface PostPageProps {
  currentUser: string;
}

function PostPage({ currentUser }: PostPageProps) {
  const { id } = useParams<{ id: string }>();
  const contentId = id ? parseInt(id, 10) : null;

  // Find content across all topics
  let foundContent = null;
  let foundTopic = null;

  for (const topic of sampleTopic) {
    const content = topic.content.find((c) => c.id === contentId);
    if (content) {
      foundContent = content;
      foundTopic = topic;
      break;
    }
  }

  // Redirect to home if content not found
  if (!foundContent || !foundTopic) {
    return <Navigate to="/" replace />;
  }

  return (
    <DocumentProvider
      docKey={`${foundContent.key}`}
      initialRoot={{
        likes: 0,
        hearts: 0,
        thinking: 0,
        lastAnimation: null,
      }}
      initialPresence={{
        userID: currentUser,
        currentWatchingContent: foundContent.key,
      }}
    >
      <div className="post-page-container">
        {/* Top navigation */}
        <nav className="post-nav">
          <Link to={`/topic/${foundTopic.id}`} className="back-button">
            ← Back to Topic
          </Link>
          <div className="viewers-container">
            <Viewers currentUser={currentUser} />
          </div>
        </nav>

        {/* Content */}
        <article className="post-content">
          <header className="post-header">
            <h1 className="post-title">{foundContent.title}</h1>
            <div className="post-meta">
              <span className="post-subscribe">{foundTopic.title}</span>
            </div>
          </header>

          <div className="post-body">
            <div className="post-paragraph">
              {foundContent.content.split('\n').map((paragraph, index) => (
                <p key={index}>{paragraph}</p>
              ))}
            </div>
          </div>

          {/* Real-time reactions inside the post */}
          <div className="post-reactions">
            <Reactions />
          </div>
        </article>

        {/* Footer */}
        <footer className="post-footer">
          <p className="demo-note">
            🌟 <strong>Yorkie Demo:</strong> Open this page in another browser
            tab. Viewer count and reactions will sync in real-time!
          </p>
        </footer>
      </div>
    </DocumentProvider>
  );
}

export default PostPage;
