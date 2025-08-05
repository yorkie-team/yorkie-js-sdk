import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { yorkieApi } from '../services/yorkieApi';
import PostViewerCount from './PostViewerCount';

interface Post {
  id: number;
  key: string;
  title: string;
  content: string;
  author: string;
  createdAt: string;
}

interface PostListWithApiProps {
  currentUser: string;
  samplePosts: Post[];
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

// Individual post item component
function PostItemWithApi({ 
  post, 
  currentUser, 
  yorkieDocuments 
}: { 
  post: Post; 
  currentUser: string;
  yorkieDocuments: YorkieDocument[];
}) {
  // Find the corresponding Yorkie document for this post
  const docKey = post.key;
  const document = yorkieDocuments.find(doc => doc.key === docKey);

  return (
    <Link to={`/post/${post.id}`} className="post-item-link">
      <div className="post-item">
        <div className="post-header">
          <h3 className="post-title">{post.title}</h3>
          <PostViewerCount document={document}/>
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

function PostListWithApi({ currentUser, samplePosts }: PostListWithApiProps) {
  const [yorkieDocuments, setYorkieDocuments] = useState<YorkieDocument[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchYorkieDocuments = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const documents = await yorkieApi.getWatchThisPageDocuments(samplePosts.map(post => post.key));
      setYorkieDocuments(documents);
    } catch (err) {
      console.error('Failed to fetch Yorkie documents:', err);
      setError('Failed to load real-time data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Initial fetch
    fetchYorkieDocuments();

    // Set up interval for periodic updates
    const interval = setInterval(fetchYorkieDocuments, 10000); // Update every 10 seconds

    // Cleanup interval on unmount
    return () => clearInterval(interval);
  }, []);

  if (loading && yorkieDocuments.length === 0) {
    return (
      <div className="post-list-container">
        <header className="post-list-header">
          <h1>Real-time Bulletin Board</h1>
          <p className="header-subtitle">
            Loading real-time data...
          </p>
        </header>
        <div className="loading-indicator">
          <div className="spinner"></div>
          <p>Connecting to Yorkie server...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="post-list-container">
        <header className="post-list-header">
          <h1>Real-time Bulletin Board</h1>
          <p className="header-subtitle">
            Real-time collaboration bulletin board using Yorkie. 
            Check how many people are viewing each post in real-time!
          </p>
        </header>
        <div className="error-message">
          <p>⚠️ {error}</p>
          <p>Real-time viewer count may not be available.</p>
        </div>
        <div className="posts-grid">
          {samplePosts.map((post) => (
            <PostItemWithApi
              key={post.id}
              post={post}
              currentUser={currentUser}
              yorkieDocuments={yorkieDocuments}
            />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="post-list-container">
      <header className="post-list-header">
        <h1>Real-time Bulletin Board</h1>
        <p className="header-subtitle">
          Real-time collaboration bulletin board using Yorkie. 
          Check how many people are viewing each post in real-time!
        </p>
        {yorkieDocuments.length > 0 && (
          <p className="connection-status">
            ✅ Connected to Yorkie server ({yorkieDocuments.length} active documents)
          </p>
        )}
      </header>
      
      <div className="posts-grid">
        {samplePosts.map((post) => (
          <PostItemWithApi
            key={post.id}
            post={post}
            currentUser={currentUser}
            yorkieDocuments={yorkieDocuments}
          />
        ))}
      </div>
    </div>
  );
}

export default PostListWithApi; 