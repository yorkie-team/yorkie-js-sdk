import React from 'react';

interface YorkieDocument {
  id: string;
  key: string;
  project_name: string;
  created_at: string;
  updated_at: string;
  root: any;
  presences: any;
}

interface PostViewerCountProps {
  document?: YorkieDocument | undefined;
}

function PostViewerCount({ document }: PostViewerCountProps) {  
  // Calculate viewer count and active presences
  const getViewerCount = (document: YorkieDocument): number => {
    if (!document.presences) return 0;
    return Object.values(document.presences).length;
  };

  const viewerCount = document ? getViewerCount(document) : 0;

  // Show loading state if no documents are available yet
  if (!document) {
    return (
      <div className="viewer-count loading">
        <span className="viewer-number">...</span>
        <span className="viewer-text">loading</span>
      </div>
    );
  }

  return (
    <div className="viewer-count">
      <span className="viewer-number">{viewerCount}</span>
      <span className="viewer-text">
        {viewerCount === 1 ? 'viewing' : 'viewing'}
      </span>
    </div>
  );
}

export default PostViewerCount; 