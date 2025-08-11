import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { yorkieApi } from '../services/yorkieApi';
import PostViewerCount from './PostViewerCount';

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

interface PostListWithApiProps {
  currentUser: string;
  sampleTopic: Post[];
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

// Individual topic item component
function TopicItemWithApi({ 
  topic, 
  currentUser, 
  yorkieDocuments 
}: { 
  topic: Post; 
  currentUser: string;
  yorkieDocuments: YorkieDocument[];
}) {
  // Find the corresponding Yorkie document for this topic
  const docKey = topic.key;
  const document = yorkieDocuments.find(doc => doc.key === docKey);

  return (
    <Link to={`/topic/${topic.id}`} className="topic-item-link">
      <div className="topic-item">
        <div className="topic-header">
          <h3 className="topic-title">{topic.title}</h3>
          <PostViewerCount document={document}/>
        </div>
        <div className="topic-meta">
          <span className="topic-subscribe">{topic.subscribe}</span>
          <span className="topic-content-count">{topic.content.length} contents</span>
        </div>
        <div className="topic-content-preview">
          {topic.content.slice(0, 2).map((content) => (
            <div key={content.id} className="content-preview-item">
              <span className="content-title">{content.title}</span>
            </div>
          ))}
          {topic.content.length > 2 && (
            <div className="content-preview-more">
              +{topic.content.length - 2} more contents
            </div>
          )}
        </div>
      </div>
    </Link>
  );
}

function PostListWithApi({ currentUser, sampleTopic }: PostListWithApiProps) {
  const [yorkieDocuments, setYorkieDocuments] = useState<YorkieDocument[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchYorkieDocuments = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const documents = await yorkieApi.getWatchThisPageDocuments(sampleTopic.map(post => post.key));
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
        <div className="topics-grid">
          {sampleTopic.map((topic) => (
            <TopicItemWithApi
              key={topic.id}
              topic={topic}
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
      </header>
      
      <div className="topics-grid">
        {sampleTopic.map((topic) => (
          <TopicItemWithApi
            key={topic.id}
            topic={topic}
            currentUser={currentUser}
            yorkieDocuments={yorkieDocuments}
          />
        ))}
      </div>
    </div>
  );
}

export default PostListWithApi; 