import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from 'react';
import { useRevisions, type RevisionSummary } from '@yorkie-js/react';
import { YSON } from '@yorkie-js/sdk';

type Preview = { label: string; createdAt: Date; text: string };

const formatDate = (date: Date) =>
  new Date(date).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });

export default function RevisionPanel() {
  const { createRevision, listRevisions, getRevision, restoreRevision } =
    useRevisions();

  const [revisions, setRevisions] = useState<Array<RevisionSummary>>();
  const [label, setLabel] = useState('');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [confirmingID, setConfirmingID] = useState<string>();
  const [preview, setPreview] = useState<Preview>();
  const dialogRef = useRef<HTMLDialogElement>(null);

  // Revisions live on the server, so other people's revisions only show up
  // when the list is fetched again.
  const refresh = useCallback(async () => {
    try {
      setRevisions(await listRevisions({ pageSize: 20, isForward: false }));
      setError('');
    } catch {
      setError("Couldn't load revisions. Try Refresh.");
    }
  }, [listRevisions]);

  useEffect(() => {
    refresh();
    window.addEventListener('focus', refresh);
    return () => window.removeEventListener('focus', refresh);
  }, [refresh]);

  // Open the native <dialog> modally: it traps focus, closes on Escape and
  // gives focus back to the Preview button.
  useEffect(() => {
    if (preview) dialogRef.current?.showModal();
  }, [preview]);

  const run = async (action: () => Promise<void>, failure: string) => {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await action();
    } catch {
      setError(failure);
    } finally {
      setBusy(false);
    }
  };

  const handleCreate = (e: FormEvent) => {
    e.preventDefault();
    if (!label.trim()) return;
    run(async () => {
      await createRevision(label.trim(), description.trim() || undefined);
      setNotice(`Saved “${label.trim()}”.`);
      setLabel('');
      setDescription('');
      await refresh();
    }, "Couldn't save the revision. Try again.");
  };

  const handlePreview = (id: string) =>
    run(async () => {
      const revision = await getRevision(id);
      // The snapshot is YSON; a Text field becomes a list of text nodes.
      const root = YSON.parse<{ content?: YSON.Text }>(revision.snapshot);
      setPreview({
        label: revision.label,
        createdAt: revision.createdAt,
        text: root.content ? YSON.textToString(root.content) : '',
      });
    }, "Couldn't open the revision. Try again.");

  const handleRestore = (revision: RevisionSummary) =>
    run(async () => {
      // The server rewrites the document to this revision; every attached
      // client, this one included, receives the change like any other edit.
      await restoreRevision(revision.id);
      setConfirmingID(undefined);
      setNotice(`Restored “${revision.label}”.`);
      await refresh();
    }, "Couldn't restore the revision. Try again.");

  return (
    <aside className="revision-panel" aria-labelledby="revisions-title">
      <div className="panel-header">
        <h2 className="section-title" id="revisions-title">
          Revisions
        </h2>
        <button type="button" className="button small" onClick={refresh}>
          Refresh
        </button>
      </div>

      <form className="create-revision" onSubmit={handleCreate}>
        <label className="field-label" htmlFor="revision-label">
          Label
        </label>
        <input
          id="revision-label"
          className="field-input"
          placeholder="e.g. First draft"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
        />
        <label className="field-label" htmlFor="revision-description">
          Description <span className="optional">(optional)</span>
        </label>
        <input
          id="revision-description"
          className="field-input"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
        <button
          type="submit"
          className="button primary"
          disabled={busy || !label.trim()}
        >
          Save revision
        </button>
      </form>

      <div className="panel-messages" aria-live="polite">
        {error && <p className="message error">{error}</p>}
        {notice && <p className="message">{notice}</p>}
      </div>

      {revisions === undefined ? (
        <p className="revision-empty">Loading revisions…</p>
      ) : revisions.length === 0 ? (
        <p className="revision-empty">
          No revisions yet. Save one to mark this point in the note.
        </p>
      ) : (
        <ul className="revision-list">
          {revisions.map((revision) => (
            <li key={revision.id} className="revision-item">
              <div className="revision-info">
                <strong className="revision-label">{revision.label}</strong>
                {revision.description && <p>{revision.description}</p>}
                <time>{formatDate(revision.createdAt)}</time>
              </div>
              {confirmingID === revision.id ? (
                <div className="revision-confirm" role="group">
                  <p>Replace the current note with this revision?</p>
                  <div className="revision-actions">
                    <button
                      type="button"
                      className="button small"
                      onClick={() => setConfirmingID(undefined)}
                      disabled={busy}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      className="button small primary"
                      onClick={() => handleRestore(revision)}
                      disabled={busy}
                      autoFocus
                    >
                      Restore
                    </button>
                  </div>
                </div>
              ) : (
                <div className="revision-actions">
                  <button
                    type="button"
                    className="button small"
                    onClick={() => handlePreview(revision.id)}
                  >
                    Preview
                  </button>
                  <button
                    type="button"
                    className="button small"
                    onClick={() => setConfirmingID(revision.id)}
                    disabled={busy}
                  >
                    Restore…
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {preview && (
        <dialog
          ref={dialogRef}
          className="dialog"
          aria-labelledby="preview-title"
          onClose={() => setPreview(undefined)}
        >
          <h2 className="dialog-title" id="preview-title">
            {preview.label}
          </h2>
          <p className="dialog-meta">{formatDate(preview.createdAt)}</p>
          <pre className="preview-text">
            {preview.text || 'This revision is empty.'}
          </pre>
          <form method="dialog" className="dialog-actions">
            <button className="button" autoFocus>
              Close
            </button>
          </form>
        </dialog>
      )}
    </aside>
  );
}
