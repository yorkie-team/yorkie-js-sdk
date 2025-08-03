'use client';

import { useDocument } from '@yorkie-js/react';
import { Indexable, OperationInfo, Text } from '@yorkie-js/sdk';
import Quill, { Delta, QuillOptions } from 'quill';
import 'quill/dist/quill.snow.css';
import { useCallback, useEffect, useRef } from 'react';
import { getDeltaOperations, toDeltaOperation } from '../lib/utils';
import { YorkieDoc } from '../types';
import DocumentInfo from './DocumentInfo';
import Participants from './Participants';

const quillSettings: QuillOptions = {
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
};

const Editor = () => {
  const editorRef = useRef<HTMLDivElement>(null);
  const quillRef = useRef<Quill | null>(null);
  const initializingRef = useRef(false);

  const { doc, update, loading, error } = useDocument<YorkieDoc>();

  // Handle remote operations and apply them to Quill editor
  const handleOperations = useCallback((ops: OperationInfo[]) => {
    if (!quillRef.current) return;

    const deltaOperations = getDeltaOperations(ops);

    if (deltaOperations.length) {
      console.log(
        `%c to quill: ${JSON.stringify(deltaOperations)}`,
        'color: green',
      );

      // Apply remote changes to Quill editor
      const delta = new Delta(deltaOperations);
      // using 'api' source to prevent infinite loop
      quillRef.current.updateContents(delta, 'api');
    }
  }, []);

  // Synchronize entire document content with Quill editor
  const syncText = useCallback(() => {
    if (!doc || !quillRef.current) return;

    const text = doc.getRoot().content;
    if (!text) return;

    const delta = new Delta(text.values().map((val) => toDeltaOperation(val)));
    // using 'api' source to prevent infinite loop
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

    // Subscribe to document-level events (snapshots, connection status, etc.)
    const unsubscribeDoc = doc.subscribe((event) => {
      if (event.type === 'snapshot') {
        syncText();
      }
    });

    // Subscribe to changes specifically in the 'content' field
    // $.content means we are subscribing to changes in the 'content' field of the document
    // (which is a YorkieText in YorkieDoc type in this case)
    const unsubscribeContent = doc.subscribe('$.content', (event) => {
      if (event.type === 'remote-change') {
        handleOperations(event.value.operations);
      }
    });

    // Initialize Quill editor instance
    const quill = new Quill(editorRef.current, quillSettings);
    quillRef.current = quill;

    // Listen to local text changes in Quill editor
    quill.on(
      'text-change',
      (delta: Delta, _oldContent: Delta, source: string) => {
        if (source === 'api' || !delta.ops) {
          return;
        }

        // Track cursor position for processing operations
        let from = 0,
          to = 0;
        console.log(`%c quill: ${JSON.stringify(delta.ops)}`, 'color: green');

        // Process each operation in the delta
        for (const op of delta.ops) {
          if (op.attributes !== undefined || op.insert !== undefined) {
            if (op.retain !== undefined && typeof op.retain === 'number') {
              to = from + op.retain;
            }
            console.log(
              `%c local: ${from}-${to}: ${op.insert} ${
                op.attributes ? JSON.stringify(op.attributes) : '{}'
              }`,
              'color: green',
            );

            update((root) => {
              if (op.attributes !== undefined && op.insert === undefined) {
                root.content.setStyle(from, to, op.attributes as Indexable);
              } else if (op.insert !== undefined) {
                if (to < from) {
                  to = from;
                }

                // Handle embedded objects (images, videos, etc.)
                if (typeof op.insert === 'object') {
                  root.content.edit(from, to, ' ', {
                    embed: JSON.stringify(op.insert),
                    ...op.attributes,
                  });
                } else {
                  root.content.edit(
                    from,
                    to,
                    op.insert,
                    op.attributes as Indexable,
                  );
                }
                from =
                  to + (typeof op.insert === 'string' ? op.insert.length : 1);
              }
            });
          } else if (op.delete !== undefined) {
            to = from + op.delete;
            console.log(`%c local: ${from}-${to}: ''`, 'color: green');
            update((root) => {
              // Delete by replacing with empty string
              root.content.edit(from, to, '');
            });
          } else if (op.retain !== undefined && typeof op.retain === 'number') {
            from = to + op.retain;
            to = from;
          }
        }
      },
    );

    // Perform initial synchronization of document content
    syncText();

    // Cleanup function
    return () => {
      unsubscribeDoc();
      unsubscribeContent();

      if (quillRef.current) {
        quillRef.current = null;
      }
      initializingRef.current = false;
    };
  }, [doc, update, handleOperations, syncText]);

  if (loading) return <div className="p-4">Loading editor...</div>;
  if (error)
    return <div className="p-4 text-red-500">Error: {error.message}</div>;

  return (
    <div className="container mx-auto p-4">
      <div className="mb-4 flex items-center gap-4">
        <Participants />
      </div>

      <div className="mb-4">
        <div ref={editorRef} className="h-96 border border-gray-300 rounded" />
      </div>

      <DocumentInfo doc={doc} />
    </div>
  );
};

export default Editor;
