import React from 'react';
import { useParams, Link, Navigate } from 'react-router-dom';
import { DocumentProvider } from '@yorkie-js/react';
import { samplePosts } from '../App';
import Viewers from './Viewers';
import Reactions from './Reactions';

interface Post {
  id: number;
  title: string;
  content: string;
  author: string;
  createdAt: string;
}

interface PostPageProps {
  currentUser: string;
}

function PostPage({ currentUser }: PostPageProps) {
  const { id } = useParams<{ id: string }>();
  const postId = id ? parseInt(id, 10) : null;

  // Find post
  const post = postId ? samplePosts.find((p) => p.id === postId) : null;

  // Redirect to home if post not found
  if (!post) {
    return <Navigate to="/" replace />;
  }

  return (
    <DocumentProvider
      docKey={`watch-this-page-example-${post.id}`}
      initialRoot={{
        likes: 0,
        hearts: 0,
        thinking: 0,
        lastAnimation: null,
      }}
      initialPresence={{
        userID: currentUser,
        presence: { online: true, viewing: true },
      }}
    >
      <div className="post-page-container">
        {/* Top navigation */}
        <nav className="post-nav">
          <Link to="/" className="back-button">
            ← Back to List
          </Link>
          <div className="viewers-container">
            <Viewers currentUser={currentUser} />
          </div>
        </nav>

        {/* Post content */}
        <article className="post-content">
          <header className="post-header">
            <h1 className="post-title">{post.title}</h1>
            <div className="post-meta">
              <span className="post-author">👤 {post.author}</span>
              <span className="post-date">📅 {post.createdAt}</span>
            </div>
          </header>

          <div className="post-body">
            {post.content.split('\n').map((paragraph, index) => (
              <p key={index} className="post-paragraph">
                {paragraph}
              </p>
            ))}
          </div>

          {/* Real-time reactions inside the post */}
          <div className="post-reactions">
            <Reactions />
          </div>
        </article>

        {/* Footer */}
        <footer className="post-footer">
          <p className="demo-note">
            🌟 <strong>Yorkie Demo:</strong> Open this page in another browser tab.
            Viewer count and reactions will sync in real-time!
          </p>
        </footer>
      </div>
    </DocumentProvider>
  );
}

export default PostPage;
