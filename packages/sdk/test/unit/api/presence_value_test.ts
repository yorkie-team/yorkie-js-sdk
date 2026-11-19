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

import { describe, it, assert } from 'vitest';
import { create } from '@bufbuild/protobuf';
import { Document } from '@yorkie-js/sdk/src/document/document';
import { converter } from '@yorkie-js/sdk/src/api/converter';
import { PresenceSchema as PbPresenceSchema } from '@yorkie-js/sdk/src/api/yorkie/v1/resources_pb';

type TestPresence = {
  name?: string;
  cursor?: string | { x: number; y: number };
};

const SourceActor = '000000000000000000000001';

// A presence value on the wire is the JSON encoding of the value, but only
// the SDKs' write side enforces that: a Go app calling `SetJSON` with non-JSON
// text, or a client speaking the RPC API directly, can store one that is not.
// A server older than yorkie#2386 hands it on as-is.
describe('Presence values that are not JSON', function () {
  it('decodes a non-JSON value to its raw text', function () {
    const presence = converter.fromPresence<TestPresence>(
      create(PbPresenceSchema, {
        data: { name: '"a"', cursor: 'moved' },
      }),
    );

    assert.deepEqual(presence, { name: 'a', cursor: 'moved' });
  });

  it('reads the value the server repair writes the same way', function () {
    // yorkie#2386 JSON-encodes such a value on the server, so a client sees
    // either the raw text or its encoding depending on the server version.
    // Both must read as the same value.
    const raw = converter.fromPresence<TestPresence>(
      create(PbPresenceSchema, { data: { cursor: 'moved' } }),
    );
    const repaired = converter.fromPresence<TestPresence>(
      create(PbPresenceSchema, { data: { cursor: '"moved"' } }),
    );

    assert.deepEqual(raw, repaired);
  });

  it('applies a pulled pack that carries one', function () {
    const source = new Document<{ k?: string }, TestPresence>('d');
    source.setActor(SourceActor);
    source.update((r, p) => {
      r.k = 'v';
      p.set({ name: 'a', cursor: { x: 1, y: 1 } });
    });

    const pbPack = converter.toChangePack(source.createChangePack());
    pbPack.changes[0].presenceChange!.presence!.data.cursor = 'moved';
    pbPack.checkpoint!.serverSeq = 1n;

    // Before, `JSON.parse` threw out of the decode, so the checkpoint never
    // advanced and the server redelivered the same change on every pull.
    const target = new Document<{ k?: string }, TestPresence>('d');
    target.applyChangePack(converter.fromChangePack<TestPresence>(pbPack));

    assert.equal(target.getRoot().k, 'v');
    assert.deepEqual(target.getPresenceForTest(SourceActor), {
      name: 'a',
      cursor: 'moved',
    });
    assert.equal(target.getCheckpoint().getServerSeq(), 1n);
  });
});
