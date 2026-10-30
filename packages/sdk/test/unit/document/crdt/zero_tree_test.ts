/*
 * Copyright 2026 The Yorkie Authors. All rights reserved.
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

import { describe, it, expect } from 'vitest';
import { Document, Indexable } from '@yorkie-js/sdk/src/document/document';
import { converter } from '@yorkie-js/sdk/src/api/converter';
import { ChangePack } from '@yorkie-js/sdk/src/document/change/change_pack';
import { Checkpoint } from '@yorkie-js/sdk/src/document/change/checkpoint';
import { CRDTObject } from '@yorkie-js/sdk/src/document/crdt/object';
import { RestoreRemovedByCapability } from '@yorkie-js/sdk/src/document/operation/edit_operation';
import { InitialVersionVector } from '@yorkie-js/sdk/src/document/time/version_vector';
import { ZeroTree } from '@yorkie-js/sdk/src/document/json/zero_tree';
import type { ZeroNodeJSON } from '@yorkie-js/sdk/src/document/crdt/zero_tree_view';
import { validateYorkieRuleset } from '@yorkie-js/sdk/src/document/schema/ruleset_validator';

type Root = { zt: ZeroTree };

const capable = [RestoreRemovedByCapability];

/**
 * `send` delivers the pending changes of `from` to `to` through protobuf.
 */
function send(from: Document<Root>, to: Document<Root>): void {
  const pack = converter.fromChangePack<Indexable>(
    converter.toChangePack(from.createChangePack()),
  );
  to.applyChangePack(
    ChangePack.create(
      pack.getDocumentKey(),
      Checkpoint.of(0n, 0),
      false,
      pack.getChanges() as never,
      InitialVersionVector,
      undefined,
      0n,
      capable,
    ),
  );
}

/**
 * `ack` drops the changes `doc` has already sent from its local queue.
 */
function ack(doc: Document<Root>): void {
  const changes = doc.createChangePack().getChanges();
  const lastSeq = changes.length
    ? changes[changes.length - 1].getID().getClientSeq()
    : 0;
  doc.applyChangePack(
    ChangePack.create(
      doc.getKey(),
      Checkpoint.of(0n, lastSeq),
      false,
      [],
      InitialVersionVector,
      undefined,
      0n,
      capable,
    ),
  );
}

function exchange(a: Document<Root>, b: Document<Root>): void {
  send(a, b);
  send(b, a);
  ack(a);
  ack(b);
}

const paragraph = (text: string): ZeroNodeJSON => ({
  type: 'paragraph',
  children: [{ type: 'inline-text', data: text }],
});

const content = (...children: Array<ZeroNodeJSON>): ZeroNodeJSON => ({
  type: 'content',
  children,
});

function replicas(init: ZeroNodeJSON): [Document<Root>, Document<Root>] {
  const a = new Document<Root>('zero-tree');
  const b = new Document<Root>('zero-tree');
  a.setActor('000000000000000000000001');
  b.setActor('000000000000000000000002');
  a.update((root) => {
    root.zt = new ZeroTree(init as never);
  });
  exchange(a, b);
  return [a, b];
}

const model = (doc: Document<Root>) => doc.getRoot().zt.toZeroContent();

/**
 * `texts` lists the text of each paragraph, the shape most tests check.
 */
const texts = (doc: Document<Root>) =>
  (model(doc).children ?? []).map((p) =>
    (p.children ?? []).map((c) => c.data ?? '').join(''),
  );

describe('ZeroTree', () => {
  it('keeps the model it was created with', () => {
    const init = content(paragraph('abcd'), paragraph('ef'));
    const [a, b] = replicas(init);
    expect(model(a)).toEqual(init);
    expect(model(b)).toEqual(init);
  });

  it('applies Zero operations: insert, Enter, merge, delete', () => {
    const [a] = replicas(content(paragraph('abcdefgh')));
    // Enter after `abcd`: split the text, then its paragraph.
    a.update((root) =>
      root.zt.applyZeroOperations([
        ['split', [0, 0, 4]],
        ['split', [0, 1]],
      ]),
    );
    expect(texts(a)).toEqual(['abcd', 'efgh']);

    a.update((root) =>
      root.zt.applyZeroOperations([['insert', [1, 0, 0], 'X']]),
    );
    expect(texts(a)).toEqual(['abcd', 'Xefgh']);

    a.update((root) => root.zt.applyZeroOperations([['merge', [1]]]));
    expect(texts(a)).toEqual(['abcdXefgh']);

    a.update((root) => root.zt.applyZeroOperations([['delete', [0, 0, 1], 2]]));
    expect(texts(a)).toEqual(['adXefgh']);
  });

  it.each([
    ['different places', 4, 2],
    ['the same place', 4, 4],
  ])('converges concurrent Enter in one paragraph (%s)', (_, at1, at2) => {
    const [a, b] = replicas(content(paragraph('abcdefgh')));
    a.update((root) =>
      root.zt.applyZeroOperations([
        ['split', [0, 0, at1]],
        ['split', [0, 1]],
      ]),
    );
    b.update((root) =>
      root.zt.applyZeroOperations([
        ['split', [0, 0, at2]],
        ['split', [0, 1]],
      ]),
    );
    exchange(a, b);

    expect(model(a)).toEqual(model(b));
    expect(texts(a).join('')).toBe('abcdefgh');
  });

  it('converges an undo of a merge against a concurrent edit', () => {
    const [a, b] = replicas(content(paragraph('ab'), paragraph('cd')));
    a.update((root) => root.zt.applyZeroOperations([['merge', [1]]]));
    exchange(a, b);
    b.update((root) =>
      root.zt.applyZeroOperations([['insert', [0, 0, 0], 'Y']]),
    );
    a.history.undo();
    exchange(a, b);

    expect(model(a)).toEqual(model(b));
    expect(texts(a).join('')).toBe('Yabcd');
  });

  it('round-trips the model and the schema through a snapshot', () => {
    const [a] = replicas(content(paragraph('abcd'), paragraph('ef')));
    a.update((root) =>
      root.zt.applyZeroOperations([
        ['update', [0], { style: { textAlign: 'center' } }],
      ]),
    );
    const bytes = converter.snapshotToBytes(a.getRootObject(), new Map());
    const { root } = converter.bytesToSnapshot(bytes);

    const restored = (root as CRDTObject).get('zt');
    expect(restored?.toJSON()).toBe(a.getRootObject().get('zt')!.toJSON());
  });

  it('places an undo after GC where an uncollected replica has it', () => {
    const [a, b] = replicas(content(paragraph('abcdefgh')));
    // a deletes `cdefgh`, the end of the text, and collects it once b knows.
    a.update((root) => root.zt.applyZeroOperations([['delete', [0, 0, 2], 6]]));
    exchange(a, b);
    a.garbageCollect(a.getVersionVector());
    // b, which keeps the tombstones, presses Enter where the text was and
    // types in the new line.
    b.update((root) =>
      root.zt.applyZeroOperations([
        ['split', [0, 0, 2]],
        ['split', [0, 1]],
        ['insert', [1, 0, 0], 'X'],
      ]),
    );
    exchange(a, b);
    a.history.undo();
    exchange(a, b);

    // The collected run comes back where b's tombstones are. Removing the
    // run from the list instead would put it after the new line.
    expect(texts(b)).toEqual(['ab', 'Xcdefgh']);
    expect(model(a)).toEqual(model(b));
  });

  it('keeps the schema it is given, apart from other trees and the process default', () => {
    // An editor with a heading block whose text type is `inline-heading`.
    const schema = {
      textTypes: new Set(['inline-text', 'inline-heading']),
      defaultChild: {
        content: 'paragraph',
        paragraph: 'inline-text',
        heading: 'inline-heading',
      },
      allowed: {
        content: new Set(['paragraph', 'heading']),
        paragraph: new Set(['inline-text']),
        heading: new Set(['inline-heading']),
      },
    };
    const init = content({
      type: 'heading',
      children: [{ type: 'inline-heading', data: 'title' }],
    });
    const a = new Document<Root>('zero-tree');
    a.setActor('000000000000000000000001');
    a.update((root) => {
      root.zt = new ZeroTree(init as never, { schema });
    });
    // Another tree of the same process, without a schema, reads the
    // heading's text as nothing (inline-heading is not text by default).
    const other = new Document<Root>('other');
    other.update((root) => {
      root.zt = new ZeroTree(init as never);
    });
    expect(model(a)).toEqual(init);
    expect(model(other)).not.toEqual(init);

    // A replica and a snapshot get the schema with the tree.
    const b = new Document<Root>('zero-tree');
    b.setActor('000000000000000000000002');
    exchange(a, b);
    b.update((root) =>
      root.zt.applyZeroOperations([['insert', [0, 0, 5], '!']]),
    );
    exchange(a, b);
    expect(model(a)).toEqual(model(b));
    expect((model(b).children ?? [])[0].children?.[0].data).toBe('title!');
    const bytes = converter.snapshotToBytes(b.getRootObject(), new Map());
    const { root } = converter.bytesToSnapshot(bytes);
    expect((root as CRDTObject).get('zt')?.toJSON()).toBe(
      b.getRootObject().get('zt')!.toJSON(),
    );
  });

  it('is checked by the yorkie.ZeroTree schema rule', () => {
    const rules = [{ path: '$.zt', type: 'yorkie.ZeroTree' as const }];
    const [a] = replicas(content(paragraph('x')));
    expect(validateYorkieRuleset(a.getRootObject(), rules).valid).toBe(true);

    const other = new Document<{ zt: number }>('other');
    other.update((root) => {
      root.zt = 1;
    });
    expect(validateYorkieRuleset(other.getRootObject(), rules).valid).toBe(
      false,
    );
  });
});
