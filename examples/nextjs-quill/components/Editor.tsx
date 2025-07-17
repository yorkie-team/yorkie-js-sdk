'use client';

import { useDocument, usePresences } from '@yorkie-js/react';
import { Indexable, OperationInfo, Text, TextPosStructRange } from '@yorkie-js/sdk';
import Quill, { type DeltaOperation, type DeltaStatic } from 'quill';
import 'quill/dist/quill.snow.css';
import { useCallback, useEffect, useRef, useState } from 'react';

type YorkieDoc = {
  content: Text;
};

type YorkiePresence = {
  username: string;
  color: string;
  selection?: TextPosStructRange;
};

type TextValueType = {
  attributes?: Indexable;
  content?: string;
};

function toDeltaOperation<T extends TextValueType>(
  textValue: T,
): DeltaOperation {
  const { embed, ...restAttributes } = textValue.attributes ?? {};
  if (embed) {
    return { insert: embed, attributes: restAttributes };
  }

  return {
    insert: textValue.content || '',
    attributes: textValue.attributes,
  };
}

export default function Editor() {
  const editorRef = useRef<HTMLDivElement>(null);
  const quillRef = useRef<Quill | null>(null);
  const initializingRef = useRef(false);

  const [documentJson, setDocumentJson] = useState('');
  const [documentText, setDocumentText] = useState('');

  const { doc, update, loading, error } = useDocument<YorkieDoc, YorkiePresence>();
  const presences = usePresences();

  // Document state update
  useEffect(() => {
    if (doc) {
      setDocumentJson(doc.toJSON());
      setDocumentText(doc.getRoot().content?.toTestString() || '');
    }
  }, [doc]);

  const handleOperations = useCallback((ops: Array<OperationInfo>) => {
    if (!quillRef.current) return;

    const deltaOperations = [];
    let prevTo = 0;

    for (const op of ops) {
      if (op.type === 'edit') {
        const from = op.from;
        const to = op.to;
        const retainFrom = from - prevTo;
        const retainTo = to - from;

        const { insert, attributes } = toDeltaOperation(op.value!);
        console.log(`%c remote: ${from}-${to}: ${insert}`, 'color: skyblue');

        if (retainFrom) {
          deltaOperations.push({ retain: retainFrom });
        }
        if (retainTo) {
          deltaOperations.push({ delete: retainTo });
        }
        if (insert) {
          const op: DeltaOperation = { insert };
          if (attributes) {
            op.attributes = attributes;
          }
          deltaOperations.push(op);
        }
        prevTo = to;
      } else if (op.type === 'style') {
        const from = op.from;
        const to = op.to;
        const retainFrom = from - prevTo;
        const retainTo = to - from;
        const { attributes } = toDeltaOperation(op.value!);
        console.log(
          `%c remote: ${from}-${to}: ${JSON.stringify(attributes)}`,
          'color: skyblue',
        );

        if (retainFrom) {
          deltaOperations.push({ retain: retainFrom });
        }
        if (attributes) {
          const op: DeltaOperation = { attributes };
          if (retainTo) {
            op.retain = retainTo;
          }
          deltaOperations.push(op);
        }
        prevTo = to;
      }
    }

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
      setDocumentJson(doc.toJSON());
      setDocumentText(doc.getRoot().content?.toTestString() || '');
    });

    const unsubscribeContent = doc.subscribe('$.content', (event: any) => {
      if (event.type === 'remote-change') {
        handleOperations(event.value.operations);
      }
    });

    // Quill initialization
    const quill = new Quill(editorRef.current, {
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
          ['image', 'video'],
          ['clean'],
        ],
      },
      theme: 'snow',
    });

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

  if (loading) return <div className="p-4">Loading editor...</div>;
  if (error) return <div className="p-4 text-red-500">Error: {error.message}</div>;

  return (
    <div className="container mx-auto p-4">
      <div className="mb-4 flex items-center gap-4">
        <div className="flex items-center gap-2">
          <span>Network Status:</span>
          <span className="inline-block w-3 h-3 rounded-full bg-green-500"></span>
        </div>
        <div className="flex items-center gap-2">
          <span>Participants:</span>
          <div className="flex items-center gap-2">
            {presences && presences.length > 0 ? (
              <>
                <div className="flex -space-x-2">
                  {presences.slice(0, 3).map((user, _) => (
                    <div
                      key={user.clientID}
                      className="h-6 w-6 rounded-full border-2 border-white flex items-center justify-center text-xs text-white"
                      style={{ backgroundColor: user.presence.color }}
                    >
                      {user.presence.username}
                    </div>
                  ))}
                </div>
                <span className="text-sm text-gray-600">
                  {presences.length === 1 ? 'Just you' : `${presences.length} users`}
                </span>
              </>
            ) : (
              <span className="text-sm text-gray-400">No participants</span>
            )}
          </div>
        </div>
      </div>

      <div className="mb-4">
        <div ref={editorRef} className="h-96 border border-gray-300 rounded" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <h3 className="font-bold mb-2">Document JSON:</h3>
          <pre className="bg-gray-100 p-2 rounded text-sm overflow-auto max-h-40">
            {documentJson}
          </pre>
        </div>
        <div>
          <h3 className="font-bold mb-2">Document Text:</h3>
          <pre className="bg-gray-100 p-2 rounded text-sm overflow-auto max-h-40">
            {documentText}
          </pre>
        </div>
      </div>
    </div>
  );
}
