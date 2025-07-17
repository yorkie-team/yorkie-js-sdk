'use client';

import { useDocument } from '@yorkie-js/react';
import { Text as YorkieText } from '@yorkie-js/sdk';
import Quill, { Delta, EmitterSource, type QuillOptions } from 'quill';
import 'quill/dist/quill.snow.css';
import { useCallback, useEffect, useRef } from 'react';
import { YorkieDoc, YorkiePresence } from '../types';

const quillOptions = {
  theme: 'snow',
  modules: {
    toolbar: [
      [{ 'header': '1' }, { 'header': '2' }],
      ['bold', 'italic', 'underline'],
      [{ 'list': 'ordered' }, { 'list': 'bullet' }],
      [{ 'script': 'sub' }, { 'script': 'super' }],
      [{ 'indent': '-1' }, { 'indent': '+1' }],
      [{ 'size': ['small', 'medium', 'large', 'huge'] }],
      [{ 'color': [] }, { 'background': [] }],
      [{ 'font': [] }],
      [{ 'align': [] }],
      ['link', 'image']
    ]
  }
} satisfies QuillOptions;

const Editor = () => {
  const editorRef = useRef(null);
  const { root, update } = useDocument<YorkieDoc, YorkiePresence>();

  update((root) => {
    if (!root.content) {
      root.content = new YorkieText();
      root.content.edit(0, 0, '\n');
    }
  });

  // Handle text changes from Quill and update the Yorkie document.
  const handleQuillTextChange = useCallback((delta: Delta, source: EmitterSource) => {
    if (source === 'api' || !delta.ops) return;

    let from = 0, to = 0;
    for (const op of delta.ops) {
      if (op.attributes !== undefined || op.insert !== undefined) {
        if (op.retain !== undefined) {
          to = from + (op.retain as number);
        }

        update((root, presence) => {
          let range;
          if (op.attributes !== undefined && op.insert === undefined) {
            root.content.setStyle(from, to, op.attributes);
          } else if (op.insert !== undefined) {
            if (to < from) to = from;

            if (typeof op.insert === 'object') {
              range = root.content.edit(from, to, ' ', {
                embed: JSON.stringify(op.insert),
                ...op.attributes,
              });
            } else {
              range = root.content.edit(from, to, op.insert, op.attributes);
            }
            from = to + (op.insert as string).length;
          }

          range && presence.set({
            selection: root.content.indexRangeToPosRange(range),
          });
        });
      } else if (op.delete !== undefined) {
        to = from + op.delete;
        update((root, presence) => {
          const range = root.content.edit(from, to, '');
          range && presence.set({
            selection: root.content.indexRangeToPosRange(range),
          });
        })
      } else if (op.retain !== undefined) {
        from = to + (op.retain as number);
        to = from;
      }
    }
  }, [update]);

  // TODO : bind the quill with the document.

  useEffect(() => {
    if (!editorRef.current) return;
    const quill = new Quill(editorRef.current, quillOptions);

    // bind the document with the Quill.
    quill.on('text-change', (delta, _, source) => {
      handleQuillTextChange(delta, source);
    });
  }, []);

  return (
    <div>
      <div ref={editorRef}></div>
    </div>
  );
};

export default Editor;
