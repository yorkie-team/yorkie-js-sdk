import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ChangeEvent,
} from 'react';
import { flushSync } from 'react-dom';
import { useDocument } from '@yorkie-js/react';
import type { DocType, PresenceType } from './App';

// Where a caret at `pos` ends up after an edit replaced [from, to) with
// `length` characters.
const moveCaret = (pos: number, from: number, to: number, length: number) => {
  if (pos <= from) return pos;
  if (pos >= to) return pos + length - (to - from);
  return from + length;
};

export default function NoteEditor() {
  const { doc, update } = useDocument<DocType, PresenceType>();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [text, setText] = useState(
    () => doc?.getRoot().content.toString() ?? '',
  );
  // The caret to put back once a remote edit has re-rendered the textarea.
  const pendingCaret = useRef<[number, number]>(undefined);

  useEffect(() => {
    if (!doc) return;
    setText(doc.getRoot().content.toString());

    // Covers remote edits, restores and snapshots alike: re-read the text.
    return doc.subscribe((event) => {
      if (event.type !== 'remote-change' && event.type !== 'snapshot') return;

      // Keep your caret where you were typing, shifted by the remote edits.
      const textarea = textareaRef.current;
      if (textarea && event.type === 'remote-change') {
        let start = textarea.selectionStart;
        let end = textarea.selectionEnd;
        for (const op of event.value.operations) {
          if (op.type !== 'edit') continue;
          const length = op.value.content.length;
          start = moveCaret(start, op.from, op.to, length);
          end = moveCaret(end, op.from, op.to, length);
        }
        pendingCaret.current = [start, end];
      }
      // Render right away so the next keystroke is diffed against the text
      // that is really in the document, not a stale copy.
      flushSync(() => setText(doc.getRoot().content.toString()));
    });
  }, [doc]);

  useLayoutEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea || !pendingCaret.current) return;
    if (document.activeElement === textarea) {
      textarea.setSelectionRange(...pendingCaret.current);
    }
    pendingCaret.current = undefined;
  }, [text]);

  // Send only what changed: the part between the common prefix and suffix.
  // A small `edit()` like this merges with what others type at the same time.
  const handleChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
    const next = e.target.value;
    let from = 0;
    while (from < text.length && text[from] === next[from]) from++;
    let to = text.length;
    let nextTo = next.length;
    while (to > from && nextTo > from && text[to - 1] === next[nextTo - 1]) {
      to--;
      nextTo--;
    }
    update((root) => {
      root.content.edit(from, to, next.slice(from, nextTo));
    });
    setText(next);
  };

  return (
    <section className="editor-section" aria-labelledby="editor-title">
      <h2 className="section-title" id="editor-title">
        Today&apos;s note
      </h2>
      <textarea
        ref={textareaRef}
        className="editor"
        aria-labelledby="editor-title"
        value={text}
        onChange={handleChange}
        placeholder="Start typing your note…"
      />
    </section>
  );
}
