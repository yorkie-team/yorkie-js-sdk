'use client';

import { YorkieProvider, DocumentProvider } from '@yorkie-js/react';
import TodoList from '../components/TodoList';

export default function Home() {
  return (
    <YorkieProvider
      apiKey={process.env.NEXT_PUBLIC_YORKIE_API_KEY || ''}
      rpcAddr={process.env.NEXT_PUBLIC_YORKIE_API_ADDR}
    >
      <DocumentProvider docKey="nextjs-todolist" initialRoot={{ todos: [] }}>
        <main className="container mx-auto p-4">
          <TodoList />
        </main>
      </DocumentProvider>
    </YorkieProvider>
  );
}
