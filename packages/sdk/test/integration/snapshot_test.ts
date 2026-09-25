/*
 * Copyright 2021 The Yorkie Authors. All rights reserved.
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
import {
  DefaultSnapshotThreshold,
  EventCollector,
} from '@yorkie-js/sdk/test/helper/helper';
import { withTwoClientsAndDocuments } from '@yorkie-js/sdk/test/integration/integration_helper';
import { DocEventType } from '@yorkie-js/sdk/src/document/document';
import { Counter, Text } from '@yorkie-js/sdk/src/yorkie';

describe('Snapshot', function () {
  it('should handle snapshot', async function ({ task }) {
    type TestDoc = Record<string, number> & { key: string };
    await withTwoClientsAndDocuments<TestDoc>(async (c1, d1, c2, d2) => {
      // 01. Updates changes over snapshot threshold.
      for (let idx = 0; idx < DefaultSnapshotThreshold; idx++) {
        d1.update((root) => {
          root[`${idx}`] = idx;
        });
      }
      await c1.sync();

      // 02. Makes local changes then pull a snapshot from the agent.
      d2.update((root) => {
        root['key'] = 'value';
      });
      await c2.sync();
      assert.equal(d2.getRoot()['key'], 'value');

      await c1.sync();
      await c2.sync();
      await c1.sync();
      assert.equal(d1.toSortedJSON(), d2.toSortedJSON());
    }, task.name);
  });

  it('should handle snapshot for text object', async function ({ task }) {
    await withTwoClientsAndDocuments<{ k1: Text }>(async (c1, d1, c2, d2) => {
      for (let idx = 0; idx < DefaultSnapshotThreshold; idx++) {
        d1.update((root) => {
          root.k1 = new Text();
        }, 'set new doc by c1');
      }
      await c1.sync();
      await c2.sync();

      // 01. Updates changes over snapshot threshold by c1.
      for (let idx = 0; idx < DefaultSnapshotThreshold; idx++) {
        d1.update((root) => {
          root.k1.edit(idx, idx, 'x');
        });
      }

      // 02. Makes local change by c2.
      d2.update((root) => {
        root.k1.edit(0, 0, 'o');
      });

      await c1.sync();
      await c2.sync();
      await c1.sync();

      assert.equal(d1.toSortedJSON(), d2.toSortedJSON());
    }, task.name);
  });

  it('should handle snapshot for text with attributes', async function ({
    task,
  }) {
    await withTwoClientsAndDocuments<{ k1: Text }>(async (c1, d1, c2, d2) => {
      d1.update((root) => {
        root.k1 = new Text();
        root.k1.edit(0, 0, 'a');
      }, 'set new doc by c1');
      await c1.sync();
      await c2.sync();

      // 01. Updates changes over snapshot threshold by c1.
      for (let idx = 0; idx < DefaultSnapshotThreshold; idx++) {
        d1.update((root) => {
          root.k1.setStyle(0, 1, { bold: 'true' });
        });
      }
      await c1.sync();
      await c2.sync();

      assert.equal(d1.toSortedJSON(), d2.toSortedJSON());
    }, task.name);
  });

  it('should publish snapshot event with up-to-date document', async function ({
    task,
  }) {
    type TestDoc = { counter: Counter };
    await withTwoClientsAndDocuments<TestDoc>(async (c1, d1, c2, d2) => {
      const eventCollector = new EventCollector<number>();
      d2.subscribe((event) => {
        if (event.type === DocEventType.Snapshot) {
          eventCollector.add(d2.getRoot().counter.getValue() as number);
        }
      });

      d1.update((r) => (r.counter = new Counter(0)));
      await c1.sync();
      await c2.sync();

      // 01. c1 increases the counter for creating snapshot.
      for (let i = 0; i < DefaultSnapshotThreshold; i++) {
        d1.update((r) => r.counter.increase(1));
      }
      await c1.sync();

      // 02. c2 receives the snapshot and increases the counter simultaneously.
      const synced = c2.sync();
      d2.update((r) => r.counter.increase(1));

      await eventCollector.waitAndVerifyNthEvent(
        1,
        DefaultSnapshotThreshold + 1,
      );
      await synced;
    }, task.name);
  });
});
