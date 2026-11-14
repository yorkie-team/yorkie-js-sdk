'use client';

import { YorkieProvider, DocumentProvider } from '@yorkie-js/react';
import TodoList, { API_ADDR } from '../components/TodoList';

const NAMES = ['Alice', 'Bob', 'Carol', 'Dave', 'Erin', 'Frank', 'Grace'];
const myName = NAMES[Math.floor(Math.random() * NAMES.length)];

export default function Home() {
  return (
    <YorkieProvider
      apiKey={process.env.NEXT_PUBLIC_YORKIE_API_KEY || ''}
      rpcAddr={API_ADDR}
    >
      {/* Everyone shares the `nextjs-todolist` document. Each tab joins with
          a random name in its presence, shown as an avatar in the header. */}
      <DocumentProvider
        docKey="nextjs-todolist"
        initialRoot={{ todos: [] }}
        initialPresence={{ name: myName }}
      >
        <TodoList />
      </DocumentProvider>
    </YorkieProvider>
  );
}
