'use client';

import { useDocument } from '@yorkie-js/react';
import { OperationInfo, Text } from '@yorkie-js/sdk';
import Quill, { QuillOptionsStatic, type DeltaStatic } from 'quill';
import 'quill/dist/quill.snow.css';
import { useCallback, useEffect, useRef } from 'react';
import { getDeltaOperations, toDeltaOperation } from '../lib/utils';
import { YorkieDoc } from '../types';
import DocumentInfo from './DocumentInfo';
import NetworkStatus from './NetworkStatus';
import Participants from './Participants';

const quillSettings = {
  modules: {
    toolbar: [
      ['bold', 'italic', 'underline', 'strike'],
      ['blockquote', 'code-block'],
      [{ header: 1 }, { header: 2 }],
      [{ list: 'ordered' }, { list: 'bullet' }],
      [{ script: 'sub' }, { script: 'super' }],
      [{ indent: '-1' }, { indent: '+1' }],
      [{ direction: 'rtl' }],
      [{ size: ['small', false, 'large', 'huge'] }],
      [{ header: [1, 2, 3, 4, 5, 6, false] }],
      [{ color: [] }, { background: [] }],
      [{ font: [] }],
      [{ align: [] }],
      ['clean'],
    ],
  },
  theme: 'snow',
} satisfies QuillOptionsStatic;

const Editor = () => {
  const editorRef = useRef<HTMLDivElement>(null);
  const quillRef = useRef<Quill | null>(null);
  const initializingRef = useRef(false);

  const { doc, update, loading, error } = useDocument<YorkieDoc>();

  const handleOperations = useCallback((ops: OperationInfo[]) => {
    if (!quillRef.current) return;

    const deltaOperations = getDeltaOperations(ops);

    if (deltaOperations.length) {
      console.log(
        `%c to quill: ${JSON.stringify(deltaOperations)}`,
        'color: green',
      );

      const delta = {
        ops: deltaOperations,
      } as DeltaStatic;
      quillRef.current.updateContents(delta, 'api');
    }
  }, []);

  const syncText = useCallback(() => {
    if (!doc || !quillRef.current) return;

    const text = doc.getRoot().content;
    if (!text) return;

    const delta = {
      ops: text.values().map((val: any) => toDeltaOperation(val)),
    } as DeltaStatic;
    quillRef.current.setContents(delta, 'api');
  }, [doc]);

  useEffect(() => {
    if (!editorRef.current || !doc || initializingRef.current) return;
    initializingRef.current = true;

    // Document content initialization
    update((root) => {
      if (!root.content) {
        root.content = new Text();
        root.content.edit(0, 0, '\n');
      }
    });

    // Document event subscription
    const unsubscribeDoc = doc.subscribe((event: any) => {
      if (event.type === 'snapshot') {
        syncText();
      }
    });

    const unsubscribeContent = doc.subscribe('$.content', (event: any) => {
      if (event.type === 'remote-change') {
        handleOperations(event.value.operations);
      }
    });

    // Quill initialization
    const quill = new Quill(editorRef.current, quillSettings);
    quillRef.current = quill;

    // Quill event bindings
    quill.on('text-change', (delta, _, source) => {
      if (source === 'api' || !delta.ops) {
        return;
      }

      let from = 0, to = 0;
      console.log(`%c quill: ${JSON.stringify(delta.ops)}`, 'color: green');

      for (const op of delta.ops) {
        if (op.attributes !== undefined || op.insert !== undefined) {
          if (op.retain !== undefined) {
            to = from + op.retain;
          }
          console.log(
            `%c local: ${from}-${to}: ${op.insert} ${op.attributes ? JSON.stringify(op.attributes) : '{}'
            }`,
            'color: green',
          );

          update((root, presence) => {
            let range;
            if (op.attributes !== undefined && op.insert === undefined) {
              root.content.setStyle(from, to, op.attributes);
            } else if (op.insert !== undefined) {
              if (to < from) {
                to = from;
              }

              if (typeof op.insert === 'object') {
                range = root.content.edit(from, to, ' ', {
                  embed: JSON.stringify(op.insert),
                  ...op.attributes,
                });
              } else {
                range = root.content.edit(from, to, op.insert, op.attributes);
              }
              from = to + op.insert.length;
            }

            if (range && presence) {
              presence.set({
                selection: root.content.indexRangeToPosRange(range),
              });
            }
          });
        } else if (op.delete !== undefined) {
          to = from + op.delete;
          console.log(`%c local: ${from}-${to}: ''`, 'color: green');

          update((root, presence) => {
            const range = root.content.edit(from, to, '');
            if (range && presence) {
              presence.set({
                selection: root.content.indexRangeToPosRange(range),
              });
            }
          });
        } else if (op.retain !== undefined) {
          from = to + op.retain;
          to = from;
        }
      }
    });

    // Initial document content synchronization
    syncText();

    return () => {
      unsubscribeDoc();
      unsubscribeContent();

      if (quillRef.current) {
        quillRef.current = null;
      }
      initializingRef.current = false;
    };
  }, [doc]);

  if (loading) return (
    <div className="p-4">Loading editor...</div>
  );
  if (error) return (
    <div className="p-4 text-red-500">Error: {error.message}</div>
  );

  return (
    <div className="container mx-auto p-4">
      <div className="mb-4 flex items-center gap-4">
        <NetworkStatus doc={doc} />
        <Participants />
      </div>

      <div className="mb-4">
        <div ref={editorRef} className="h-96 border border-gray-300 rounded" />
      </div>

      <DocumentInfo doc={doc} />
    </div>
  );
}

export default Editor;
