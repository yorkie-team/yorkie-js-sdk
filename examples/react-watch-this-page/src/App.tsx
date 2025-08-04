import { YorkieProvider } from '@yorkie-js/react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { useState } from 'react';
import PostList from './components/PostList';
import PostPage from './components/PostPage';

// Sample post data
export const samplePosts = [
  {
    id: 1,
    title: "Development Experience with Yorkie Real-time Collaboration Tool",
    content: "Hello! Today I want to share my experience building a real-time collaboration tool using the Yorkie library.\n\nYorkie is a really powerful CRDT-based real-time synchronization library. You can easily implement data synchronization between multiple users without building complex servers.\n\nEspecially impressive points:\n1. Stable operation even in unstable network environments\n2. Automatic conflict resolution\n3. Perfect integration with React\n\nI'll also share the difficulties and solutions I encountered during development.",
    author: "Developer Kim",
    createdAt: "2024-01-15"
  },
  {
    id: 2,
    title: "Implementation Review of Real-time Document Editing Feature",
    content: "I implemented a real-time document editing feature like Google Docs.\n\nUsing Yorkie's Text CRDT made it really simple to implement. Even when multiple users edit simultaneously, it synchronizes well without conflicts.\n\nCode example:\n```javascript\nconst doc = new Document('doc-key');\nconst text = doc.getRoot().text;\ntext.edit(0, 0, 'Hello Yorkie!');\n```\n\nIt was really amazing that such complex collaboration features could be implemented with such a simple API.",
    author: "Frontend Master",
    createdAt: "2024-01-14"
  },
  {
    id: 3,
    title: "Reviewing Yorkie Integration for Team Project",
    content: "Hello, I'm currently working on a project that requires real-time collaboration features.\n\nI'm reviewing the Yorkie library with the following requirements:\n- Real-time comment system\n- Display of pages being viewed by multiple users\n- Simple reaction features (like, dislike)\n\nHas anyone implemented similar features? I'd appreciate your advice!",
    author: "Product Manager Park",
    createdAt: "2024-01-13"
  }
];

function App() {
  const [currentUser] = useState(() => 
    `${Math.random().toString(36).substr(2, 9)}`
  );

  return (
    <YorkieProvider
      apiKey={import.meta.env.VITE_YORKIE_API_KEY}
      rpcAddr={import.meta.env.VITE_YORKIE_API_ADDR}
    >
      <Router>
        <div className="app-container">
          <Routes>
            <Route 
              path="/" 
              element={<PostList currentUser={currentUser} />} 
            />
            <Route 
              path="/post/:id" 
              element={<PostPage currentUser={currentUser} />} 
            />
          </Routes>
        </div>
      </Router>
    </YorkieProvider>
  );
}

export default App;
