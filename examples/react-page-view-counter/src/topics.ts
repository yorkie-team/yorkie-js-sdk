export type Topic = {
  id: string;
  title: string;
  body: string;
};

export const TOPICS: ReadonlyArray<Topic> = [
  {
    id: 'react-19',
    title: 'What changed in React 19',
    body: 'Summary of Actions, useFormStatus, the new use hook, and more.',
  },
  {
    id: 'server-actions',
    title: 'Server Actions in practice',
    body: 'Patterns for handling form submission and data mutation on the server.',
  },
  {
    id: 'suspense',
    title: 'Data loading with Suspense',
    body: 'Combining fallback UI with concurrent mode.',
  },
  {
    id: 'concurrent',
    title: 'Concurrent mode revisited',
    body: 'The difference between transitions and deferred values.',
  },
  {
    id: 'streaming-ssr',
    title: 'Streaming SSR',
    body: 'Progressive rendering with renderToPipeableStream.',
  },
];
