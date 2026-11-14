import { useMemo } from 'react';
import { DocumentProvider, SyncMode } from '@yorkie-js/react';
import { buildPvDocKey } from '../docKey';
import { TopicView } from '../components/TopicView';

export function TopicPage({
  topicId,
  onBack,
}: {
  topicId: string;
  onBack: () => void;
}) {
  const docKey = useMemo(() => buildPvDocKey(topicId), [topicId]);

  return (
    <section className="topic-page">
      <button className="back" type="button" onClick={onBack}>
        <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
          <path
            d="M10 3 5 8l5 5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        Back to topics
      </button>
      <DocumentProvider docKey={docKey} syncMode={SyncMode.Manual} disableGC>
        <TopicView topicId={topicId} />
      </DocumentProvider>
      <p className="doc-key">
        Document key: <code>{docKey}</code>
      </p>
    </section>
  );
}
