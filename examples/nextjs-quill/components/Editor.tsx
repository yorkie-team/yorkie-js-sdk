'use client';

import { useDocument } from '@yorkie-js/react';
import Quill, { type QuillOptions } from 'quill';
import 'quill/dist/quill.snow.css';
import { useCallback, useEffect, useMemo, useRef } from 'react';

const Editor = () => {
  const editorRef = useRef(null);
  // TODO : Update Yorkie Document type to match Quill Delta
  const { root, update, loading, error } = useDocument();

  const quillOptions = useMemo(() => (
    {
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
    } satisfies QuillOptions), []);

  const setupQuill = useCallback(() => {
    if (!editorRef.current) return null;

    const quill = new Quill(editorRef.current, quillOptions);
    return quill;
  }, [quillOptions]);

  useEffect(() => {
    if (!editorRef.current) return;

    setupQuill()!;
  }, [setupQuill]);

  return (
    <div>
      <div ref={editorRef}></div>
    </div>
  );
};

export default Editor;
