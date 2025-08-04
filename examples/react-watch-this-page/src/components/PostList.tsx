import React from 'react';
import { Link } from 'react-router-dom';
import { DocumentProvider, usePresences } from '@yorkie-js/react';
import { samplePosts } from '../App';

interface Post {
  id: number;
  title: string;
  content: string;
  author: string;
  createdAt: string;
}

interface PostListProps {
  currentUser: string;
}

// Component to display real-time viewer count for each post
function PostViewerCount() {
  const presences = usePresences();
  const viewerCount = presences.length;

  return (
    <div className="viewer-count">
      <span className="viewer-icon">👁️</span>
      <span className="viewer-number">{viewerCount}</span>
      <span className="viewer-text">viewing</span>
    </div>
  );
}

// Individual post item component
function PostItem({ post, currentUser }: { 
  post: Post; 
  currentUser: string;
}) {
  return (
      <Link to={`/post/${post.id}`} className="post-item-link">
        <div className="post-item">
          <div className="post-header">
            <h3 className="post-title">{post.title}</h3>
            {/* <PostViewerCount/> */}
          </div>
          <div className="post-meta">
            <span className="post-author">Author: {post.author}</span>
            <span className="post-date">{post.createdAt}</span>
          </div>
          <p className="post-preview">
            {post.content.substring(0, 100)}...
          </p>
        </div>
      </Link>
  );
}

function PostList({ currentUser }: PostListProps) {
  return (
    <div className="post-list-container">
      <header className="post-list-header">
        <h1>Real-time Bulletin Board</h1>
        <p className="header-subtitle">
          Real-time collaboration bulletin board using Yorkie. 
          Check how many people are viewing each post in real-time!
        </p>
      </header>
      
      <div className="posts-grid">
        {samplePosts.map((post) => (
          <PostItem
            key={post.id}
            post={post}
            currentUser={currentUser}
          />
        ))}
      </div>
    </div>
  );
}

export default PostList;