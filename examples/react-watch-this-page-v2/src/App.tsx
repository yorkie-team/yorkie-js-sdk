import { YorkieProvider } from '@yorkie-js/react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { useState } from 'react';
import PostListWithApi from './components/PostListWithApi';
import TopicPage from './components/TopicPage';
import PostPage from './components/PostPage';

// Sample post data
export const sampleTopic = [
  {
    id: 1,
    key: "street-woman-fighter",
    title: "스트릿 우먼 파이터",
    subscribe: "전 세계 쎈 언니들의 자존심을 건 글로벌 춤 싸움 A World Dance Battle of Unapologetic Women 〈WORLD OF STREET WOMAN FIGHTER〉",
    content: [
      {
        id: 1,
        key: "street-woman-fighter-1",
        title: "스트릿 우먼 파이터 1",
        content: "Hello! Today I want to share my experience building a real-time collaboration tool using the Yorkie library.\n\nYorkie is a really powerful CRDT-based real-time synchronization library. You can easily implement data synchronization between multiple users without building complex servers.\n\nEspecially impressive points:\n1. Stable operation even in unstable network environments\n2. Automatic conflict resolution\n3. Perfect integration with React\n\nI'll also share the difficulties and solutions I encountered during development.",
      },
      {
        id: 2,
        key: "street-woman-fighter-2",
        title: "스트릿 우먼 파이터 2",
        content: "Hello! Today I want to share my experience building a real-time collaboration tool using the Yorkie library.\n\nYorkie is a really powerful CRDT-based real-time synchronization library. You can easily implement data synchronization between multiple users without building complex servers.\n\nEspecially impressive points:\n1. Stable operation even in unstable network environments\n2. Automatic conflict resolution\n3. Perfect integration with React\n\nI'll also share the difficulties and solutions I encountered during development.",
      },
      {
        id: 3,
        key: "street-woman-fighter-3",
        title: "스트릿 우먼 파이터 3",
        content: "Hello! Today I want to share my experience building a real-time collaboration tool using the Yorkie library.\n\nYorkie is a really powerful CRDT-based real-time synchronization library. You can easily implement data synchronization between multiple users without building complex servers.\n\nEspecially impressive points:\n1. Stable operation even in unstable network environments\n2. Automatic conflict resolution\n3. Perfect integration with React\n\nI'll also share the difficulties and solutions I encountered during development.",
      },
      {
        id: 4,
        key: "street-woman-fighter-4",
        title: "스트릿 우먼 파이터 4",
        content: "Hello! Today I want to share my experience building a real-time collaboration tool using the Yorkie library.\n\nYorkie is a really powerful CRDT-based real-time synchronization library. You can easily implement data synchronization between multiple users without building complex servers.\n\nEspecially impressive points:\n1. Stable operation even in unstable network environments\n2. Automatic conflict resolution\n3. Perfect integration with React\n\nI'll also share the difficulties and solutions I encountered during development.",
      },
      {
        id: 5,
        key: "street-woman-fighter-5",
        title: "스트릿 우먼 파이터 5",
        content: "Hello! Today I want to share my experience building a real-time collaboration tool using the Yorkie library.\n\nYorkie is a really powerful CRDT-based real-time synchronization library. You can easily implement data synchronization between multiple users without building complex servers.\n\nEspecially impressive points:\n1. Stable operation even in unstable network environments\n2. Automatic conflict resolution\n3. Perfect integration with React\n\nI'll also share the difficulties and solutions I encountered during development.",
      },
      {
        id: 6,
        key: "street-woman-fighter-6",
        title: "스트릿 우먼 파이터 6",
        content: "Hello! Today I want to share my experience building a real-time collaboration tool using the Yorkie library.\n\nYorkie is a really powerful CRDT-based real-time synchronization library. You can easily implement data synchronization between multiple users without building complex servers.\n\nEspecially impressive points:\n1. Stable operation even in unstable network environments\n2. Automatic conflict resolution\n3. Perfect integration with React\n\nI'll also share the difficulties and solutions I encountered during development.",
      }
    ]
  },
  {
    id: 2,
    key: "street-woman-fighter-2",
    title: "스트릿 우먼 파이터 2",
    subscribe: "전 세계 쎈 언니들의 자존심을 건 글로벌 춤 싸움 A World Dance Battle of Unapologetic Women 〈WORLD OF STREET WOMAN FIGHTER〉",
    content: [
      {
        id: 1,
        key: "street-woman-fighter-2-1",
        title: "스트릿 우먼 파이터 2-1",
        content: "Hello! Today I want to share my experience building a real-time collaboration tool using the Yorkie library.\n\nYorkie is a really powerful CRDT-based real-time synchronization library. You can easily implement data synchronization between multiple users without building complex servers.\n\nEspecially impressive points:\n1. Stable operation even in unstable network environments\n2. Automatic conflict resolution\n3. Perfect integration with React\n\nI'll also share the difficulties and solutions I encountered during development.",
      }
    ]
  },
  {
    id: 3,
    key: "street-woman-fighter-3",
    title: "스트릿 우먼 파이터 3",
    subscribe: "전 세계 쎈 언니들의 자존심을 건 글로벌 춤 싸움 A World Dance Battle of Unapologetic Women 〈WORLD OF STREET WOMAN FIGHTER〉",
    content: [
      {
        id: 1,
        key: "street-woman-fighter-3-1",
        title: "스트릿 우먼 파이터 3-1",
        content: "Hello! Today I want to share my experience building a real-time collaboration tool using the Yorkie library.\n\nYorkie is a really powerful CRDT-based real-time synchronization library. You can easily implement data synchronization between multiple users without building complex servers.\n\nEspecially impressive points:\n1. Stable operation even in unstable network environments\n2. Automatic conflict resolution\n3. Perfect integration with React\n\nI'll also share the difficulties and solutions I encountered during development.",
      }
    ]
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
              element={<PostListWithApi currentUser={currentUser} sampleTopic={sampleTopic} />} 
            />
            <Route 
              path="/topic/:id" 
              element={<TopicPage currentUser={currentUser} />} 
            />
            <Route 
              path="/content/:id" 
              element={<PostPage currentUser={currentUser} />} 
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
