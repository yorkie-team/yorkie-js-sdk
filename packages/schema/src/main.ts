/*
 * Copyright 2025 The Yorkie Authors. All rights reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { basicSetup, EditorView } from 'codemirror';
import { linter, lintGutter, Diagnostic } from '@codemirror/lint';
import { validate } from './validator';

const yorkieLinter = linter((view): Array<Diagnostic> => {
  const code = view.state.doc.toString();
  return validate(code).errors.map((data) => {
    return {
      from:
        view.state.doc.line(data.range.start.line).from +
        data.range.start.column,
      to: view.state.doc.line(data.range.end.line).from + data.range.end.column,
      message: data.message,
      severity: data.severity,
    };
  });
});

const doc = `// 🐾 Yorkie Schema Test
// Every document should start with 'Document' type.
type Document = {
  // Primitives
  created: boolean;               // Boolean
  key: string;                    // String
  seq: number;                    // Number
  theme: "light" | "dark";        // String literal with Union
  key: string;                    // Error: duplicated key(TODO)

  // Object, Array and User-defined Type
  udt1: Change;                    // User-Defined Type
  udt2: UndefinedType;             // User-Defined Type: undefined type
  arr0: Array;                     // Array
  arr1: Change[];                  // Array with []
  arr2: Array<Change>;             // Array: Type Parameter
  obj1: Object<{ key: string; }>;  // Object: Type Parameter
  obj2: { key: string; };          // Object

  yobj1: yorkie.Object<{k:number;}>;   // yorkie.Object
  yobj2: yorkie.Object;                // yorkie.Object: Error: requires a generic type
  yarr1: yorkie.Array<number>;         // yorkie.Array
  yarr2: yorkie.Array;                 // yorkie.Array: Error: requires a generic type
  ycnt: yorkie.Counter;                // Yorkie Counter
  ytree: yorkie.Tree;                  // Yorkie Tree
  ytext: yorkie.Text;                  // Yorkie Text
  ytext: yorkie.Text<{b:boolean;}>;    // Yorkie Text: Type Parameter
};`;

new EditorView({
  doc,
  extensions: [basicSetup, yorkieLinter, lintGutter()],
  parent: document.getElementById('editor')!,
});
