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
import yorkie, { Document, Text, Tree } from '@yorkie-js/sdk/src/yorkie';
import { DefaultSnapshotThreshold } from '@yorkie-js/sdk/test/helper/helper';
import {
  testRPCAddr,
  withTwoClientsAndDocuments,
} from '@yorkie-js/sdk/test/integration/integration_helper';

// Insertion origins have to survive the server: it stores the changes it
// relays and writes snapshots with its own encoder. These tests type two
// runs at one caret through a server and check that each run stays whole,
// both on the replicas that typed them and on one that loads a snapshot.

// Each keystroke is its own change, as in an editor.
function typeForward(
  doc: Document<{ t: Text; u?: Text }>,
  at: number,
  run: string,
) {
  for (let i = 0; i < run.length; i++) {
    doc.update((root) => root.t.edit(at + i, at + i, run[i]));
  }
}

// Types run with the caret held in place, the way an IME commits
// syllables: each character goes in front of the previous one.
function typeHeld(
  doc: Document<{ t: Text; u?: Text }>,
  at: number,
  run: string,
) {
  for (let i = run.length - 1; i >= 0; i--) {
    doc.update((root) => root.t.edit(at, at, run[i]));
  }
}

function isOneOf(actual: string, ...expected: Array<string>) {
  assert.include(expected, actual, `interleaved: ${actual}`);
}

describe('Insertion origins through the server', function () {
  // Before origins, a run typed with the caret held interleaved with a
  // concurrent one: `X가abc나다Y` and `Xab가c나다Y`. client1 has the lower
  // actor, which is what made those orders come out.
  for (const both of [false, true]) {
    it(`keeps concurrent Text runs contiguous (${
      both ? 'both held' : 'held vs forward'
    })`, async function ({ task }) {
      await withTwoClientsAndDocuments<{ t: Text }>(async (c1, d1, c2, d2) => {
        d1.update((root) => {
          root.t = new Text();
          root.t.edit(0, 0, 'XY');
        });
        await c1.sync();
        await c2.sync();

        typeHeld(d1, 1, '가나다');
        if (both) {
          typeHeld(d2, 1, 'abc');
        } else {
          typeForward(d2, 1, 'abc');
        }
        await c1.sync();
        await c2.sync();
        await c1.sync();

        isOneOf(d1.getRoot().t.toString(), 'Xabc가나다Y', 'X가나다abcY');
        assert.equal(d1.getRoot().t.toString(), d2.getRoot().t.toString());
      }, task.name);
    });
  }

  it('keeps Text runs contiguous after loading a server snapshot', async function ({
    task,
  }) {
    await withTwoClientsAndDocuments<{ t: Text; u: Text }>(
      async (c1, d1, c2, d2) => {
        d1.update((root) => {
          root.t = new Text();
          root.t.edit(0, 0, 'XY');
          root.u = new Text();
        });
        // Enough changes for the server to write a snapshot, so the third
        // client below loads the Text from the server's encoder. They go to
        // another Text, so t keeps no tombstones that would change the case.
        for (let i = 0; i < DefaultSnapshotThreshold; i++) {
          d1.update((root) => root.u.edit(0, 0, 'z'));
        }
        await c1.sync();
        await c2.sync();

        const c3 = new yorkie.Client({ rpcAddr: testRPCAddr });
        await c3.activate();
        const d3 = new yorkie.Document<{ t: Text; u: Text }>(d1.getKey());
        await c3.attach(d3, { syncMode: yorkie.SyncMode.Manual });
        assert.equal(d3.getRoot().t.toString(), 'XY');

        // Before origins, two held runs interleaved (`Xab가c나다Y` when the
        // lower actor types 가나다). The third client's actor is not
        // ordered, so the roles follow the actors.
        const [low, high] =
          c1.getActorID()! < c3.getActorID()! ? [d1, d3] : [d3, d1];
        // Runs interleaved when the typists started at the same lamport, so
        // bring the one behind level with edits to the other Text.
        const lamport = (d: Document<{ t: Text; u: Text }>) =>
          d.getChangeID().getLamport();
        while (lamport(low) !== lamport(high)) {
          const behind = lamport(low) < lamport(high) ? low : high;
          behind.update((root) => root.u.edit(0, 0, 'z'));
        }
        typeHeld(low, 1, '가나다');
        typeHeld(high, 1, 'abc');
        await c1.sync();
        await c3.sync();
        await c1.sync();
        await c2.sync();

        isOneOf(d1.getRoot().t.toString(), 'Xabc가나다Y', 'X가나다abcY');
        assert.equal(d1.getRoot().t.toString(), d2.getRoot().t.toString());
        assert.equal(d1.getRoot().t.toString(), d3.getRoot().t.toString());

        await c3.detach(d3);
        await c3.deactivate();
      },
      task.name,
    );
  });

  it('keeps concurrent Tree runs contiguous', async function ({ task }) {
    await withTwoClientsAndDocuments<{ t: Tree }>(async (c1, d1, c2, d2) => {
      d1.update((root) => {
        root.t = new Tree({
          type: 'doc',
          children: [{ type: 'p', children: [{ type: 'text', value: 'XY' }] }],
        });
      });
      await c1.sync();
      await c2.sync();

      // Index 1 is the start of the paragraph's text; 2 is between X and Y.
      for (const [d, run] of [
        [d1, '가나다'],
        [d2, 'abc'],
      ] as const) {
        for (let i = run.length - 1; i >= 0; i--) {
          d.update((root) =>
            root.t.edit(2, 2, { type: 'text', value: run[i] }),
          );
        }
      }
      await c1.sync();
      await c2.sync();
      await c1.sync();

      isOneOf(
        d1.getRoot().t.toXML(),
        '<doc><p>Xabc가나다Y</p></doc>',
        '<doc><p>X가나다abcY</p></doc>',
      );
      assert.equal(d1.getRoot().t.toXML(), d2.getRoot().t.toXML());
    }, task.name);
  });
});
