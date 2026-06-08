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
      <button className="back" onClick={onBack}>
        ← Back to topics
      </button>
      <DocumentProvider
        docKey={docKey}
        syncMode={SyncMode.Manual}
        disableGC
      >
        <TopicView topicId={topicId} />
      </DocumentProvider>
      <p className="doc-key">
        docKey: <code>{docKey}</code>
      </p>
    </section>
  );
}
