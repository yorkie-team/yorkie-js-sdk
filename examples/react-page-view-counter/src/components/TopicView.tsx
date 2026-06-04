import { useEffect, useRef } from 'react';
import { Counter, useDocument, useYorkie } from '@yorkie-js/react';
import { TOPICS } from '../topics';
import { ViewCountBadge } from './ViewCountBadge';

type Root = { counter?: Counter };

export function TopicView({ topicId }: { topicId: string }) {
  const { doc, root, update, loading, error } = useDocument<Root>();
  const { client } = useYorkie();
  const incrementedRef = useRef(false);

  useEffect(() => {
    if (loading || !client || !doc || incrementedRef.current) return;
    incrementedRef.current = true;

    update((r) => {
      if (!r.counter) {
        r.counter = new Counter(0);
      }
      r.counter.increase(1);
    });

    // attach already pulled the snapshot. This sync pushes our +1
    // (and pulls any concurrent +1s that landed in the meantime).
    void client.sync(doc);
  }, [loading, client, doc, update]);

  const topic = TOPICS.find((t) => t.id === topicId);
  if (!topic) return <p>Topic not found.</p>;
  if (error) return <p className="error">Error: {error.message}</p>;

  const rawValue = root.counter?.getValue();
  const count =
    loading || rawValue === undefined ? '…' : String(rawValue);

  return (
    <article className="topic">
      <h1>{topic.title}</h1>
      <ViewCountBadge count={count} />
      <p className="body">{topic.body}</p>
    </article>
  );
}
