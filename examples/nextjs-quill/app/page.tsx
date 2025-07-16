'use client';

import { DocumentProvider, YorkieProvider } from "@yorkie-js/react";
import dynamic from 'next/dynamic';
import { useMemo } from "react";

const ClientEditor = dynamic(() => import('../components/Editor'), {
  ssr: false,
});

export default function Home() {
  const docKey = useMemo(() => `nextjs-quill-${new Date()
    .toISOString()
    .substring(0, 10)
    .replace(/-/g, '')}`, []);

  return (
    <YorkieProvider
      apiKey={process.env.NEXT_PUBLIC_YORKIE_API_KEY || ''}
      rpcAddr={process.env.NEXT_PUBLIC_YORKIE_API_ADDR}
    >
      <DocumentProvider docKey={docKey}>
        <main className="container mx-auto p-4">
          <ClientEditor />
        </main>
      </DocumentProvider>
    </YorkieProvider>
  );
}
