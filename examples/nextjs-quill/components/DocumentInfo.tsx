'use client';

import { YorkieDoc } from '@/types';
import { Document } from '@yorkie-js/sdk';
import { useEffect, useState } from 'react';

interface DocumentInfoProps<T extends YorkieDoc> {
  doc: Document<T>;
}

const DocumentInfo = <T extends YorkieDoc>({ doc }: DocumentInfoProps<T>) => {
  const [documentJson, setDocumentJson] = useState('');
  const [documentText, setDocumentText] = useState('');

  useEffect(() => {
    if (doc) {
      setDocumentJson(doc.toJSON());
      setDocumentText(doc.getRoot().content?.toTestString() || '');
    }

    const unsubscribeDoc = doc.subscribe(() => {
      setDocumentJson(doc.toJSON());
      setDocumentText(doc.getRoot().content?.toTestString() || '');
    });

    return () => {
      unsubscribeDoc();
    };
  }, [doc]);

  return (
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
  );
};

export default DocumentInfo;
