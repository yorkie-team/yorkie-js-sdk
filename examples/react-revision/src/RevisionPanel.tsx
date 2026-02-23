import { useState, useEffect } from 'react';
import { useRevisions, RevisionSummary } from '@yorkie-js/react';

export default function RevisionPanel() {
  const { createRevision, listRevisions, getRevision, restoreRevision } =
    useRevisions();

  const [revisions, setRevisions] = useState<RevisionSummary[]>([]);
  const [label, setLabel] = useState('');
  const [description, setDescription] = useState('');
  const [preview, setPreview] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const fetchRevisions = async () => {
    try {
      const revs = await listRevisions({ pageSize: 20, isForward: false });
      setRevisions(revs);
    } catch (err) {
      console.error('Failed to fetch revisions:', err);
    }
  };

  useEffect(() => {
    fetchRevisions();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleCreate = async () => {
    if (!label.trim()) return;
    setIsLoading(true);
    try {
      await createRevision(label.trim(), description.trim() || undefined);
      setLabel('');
      setDescription('');
      await fetchRevisions();
    } catch (err) {
      console.error('Failed to create revision:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handlePreview = async (revisionID: string) => {
    try {
      const rev = await getRevision(revisionID);
      setPreview(
        rev.snapshot ? JSON.stringify(JSON.parse(rev.snapshot), null, 2) : null,
      );
    } catch (err) {
      console.error('Failed to get revision:', err);
    }
  };

  const handleRestore = async (revisionID: string) => {
    if (!confirm('Restore to this revision? Current state will be replaced.')) {
      return;
    }
    setIsLoading(true);
    try {
      await restoreRevision(revisionID);
      await fetchRevisions();
    } catch (err) {
      console.error('Failed to restore revision:', err);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="revision-panel">
      <h2>Revisions</h2>

      <div className="create-revision">
        <input
          type="text"
          placeholder="Label (e.g. v1.0)"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
        />
        <input
          type="text"
          placeholder="Description (optional)"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
        <button onClick={handleCreate} disabled={isLoading || !label.trim()}>
          Save Revision
        </button>
      </div>

      <ul className="revision-list">
        {revisions.map((rev) => (
          <li key={rev.id} className="revision-item">
            <div className="revision-info">
              <strong>{rev.label}</strong>
              {rev.description && <p>{rev.description}</p>}
              <small>{new Date(rev.createdAt).toLocaleString()}</small>
            </div>
            <div className="revision-actions">
              <button onClick={() => handlePreview(rev.id)}>Preview</button>
              <button onClick={() => handleRestore(rev.id)}>Restore</button>
            </div>
          </li>
        ))}
        {revisions.length === 0 && (
          <li className="revision-empty">No revisions yet</li>
        )}
      </ul>

      {preview && (
        <div className="preview-overlay" onClick={() => setPreview(null)}>
          <div className="preview-modal" onClick={(e) => e.stopPropagation()}>
            <h3>Snapshot Preview</h3>
            <pre>{preview}</pre>
            <button onClick={() => setPreview(null)}>Close</button>
          </div>
        </div>
      )}
    </div>
  );
}
