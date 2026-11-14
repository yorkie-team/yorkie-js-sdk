import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type CompositionEvent,
} from 'react';
import { flushSync } from 'react-dom';
import { useDocument } from '@yorkie-js/react';
import type { DocType, PresenceType } from './App';

type Edit = { from: number; to: number; length: number };

// Where a caret at `pos` ends up after an edit replaced [from, to) with
// `length` characters.
const moveCaret = (pos: number, { from, to, length }: Edit) => {
  if (pos <= from) return pos;
  if (pos >= to) return pos + length - (to - from);
  return from + length;
};

const isHigh = (c: string | undefined) =>
  c !== undefined && c >= '\uD800' && c <= '\uDBFF';
const isLow = (c: string | undefined) =>
  c !== undefined && c >= '\uDC00' && c <= '\uDFFF';

// The part of `prev` that `next` replaced: everything between the common
// prefix and suffix. The cut points never split an emoji (a surrogate pair),
// because Yorkie rejects edits that would.
const diff = (prev: string, next: string) => {
  let from = 0;
  while (from < prev.length && prev[from] === next[from]) from++;
  if (isLow(prev[from]) || isLow(next[from])) from--;
  let to = prev.length;
  let nextTo = next.length;
  while (to > from && nextTo > from && prev[to - 1] === next[nextTo - 1]) {
    to--;
    nextTo--;
  }
  if (isHigh(prev[to - 1]) || isHigh(next[nextTo - 1])) {
    to++;
    nextTo++;
  }
  return { from, to, content: next.slice(from, nextTo) };
};

export default function NoteEditor() {
  const { doc, update } = useDocument<DocType, PresenceType>();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [text, setText] = useState(
    () => doc?.getRoot().content.toString() ?? '',
  );
  // While an IME (Korean, Japanese, …) is composing a character, the textarea
  // must not be re-rendered, or the browser drops the composition. Remote
  // edits that arrive meanwhile are kept here and applied when it ends.
  const composition = useRef<{ base: string; remote: Array<Edit> }>(undefined);

  // Show the document's text and keep the caret where you were typing,
  // shifted by the edits other people made.
  const render = (edits: Array<Edit>) => {
    const textarea = textareaRef.current;
    const focused = textarea && document.activeElement === textarea;
    let start = textarea?.selectionStart ?? 0;
    let end = textarea?.selectionEnd ?? 0;
    for (const edit of edits) {
      start = moveCaret(start, edit);
      end = moveCaret(end, edit);
    }
    // Render right away so the next keystroke is diffed against the text
    // that is really in the document, not a stale copy.
    flushSync(() => setText(doc!.getRoot().content.toString()));
    if (focused) textarea.setSelectionRange(start, end);
  };

  useEffect(() => {
    if (!doc) return;
    setText(doc.getRoot().content.toString());

    // Covers remote edits, restores and snapshots alike: re-read the text.
    return doc.subscribe((event) => {
      if (event.type !== 'remote-change' && event.type !== 'snapshot') return;
      const edits: Array<Edit> = [];
      if (event.type === 'remote-change') {
        for (const op of event.value.operations) {
          if (op.type !== 'edit') continue;
          edits.push({
            from: op.from,
            to: op.to,
            length: op.value.content.length,
          });
        }
      }
      if (composition.current) {
        composition.current.remote.push(...edits);
        return;
      }
      render(edits);
    });
    // `render` only reads refs and `doc`, so subscribing once per doc is enough.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc]);

  // Send only what changed. A small `edit()` like this merges with what
  // others type at the same time.
  const handleChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
    const next = e.target.value;
    if (composition.current) {
      // Wait for the composed character; it is sent when composition ends.
      setText(next);
      return;
    }
    const { from, to, content } = diff(text, next);
    if (from === to && !content) return;
    update((root) => root.content.edit(from, to, content));
    setText(next);
  };

  const handleCompositionStart = () => {
    composition.current = { base: text, remote: [] };
  };

  const handleCompositionEnd = (e: CompositionEvent<HTMLTextAreaElement>) => {
    const { base, remote } = composition.current!;
    composition.current = undefined;
    // `from` and `to` point into the text as it was before composing; shift
    // them past the remote edits that arrived in the meantime.
    const { from, to, content } = diff(base, e.currentTarget.value);
    let start = from;
    let end = to;
    for (const edit of remote) {
      start = moveCaret(start, edit);
      end = Math.max(start, moveCaret(end, edit));
    }
    if (start !== end || content) {
      update((root) => root.content.edit(start, end, content));
    }
    render(remote);
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
        onCompositionStart={handleCompositionStart}
        onCompositionEnd={handleCompositionEnd}
        placeholder="Start typing your note…"
      />
    </section>
  );
}
