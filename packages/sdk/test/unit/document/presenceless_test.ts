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

import { Document } from '@yorkie-js/sdk/src/document/document';

describe('Presenceless project mode (SDK side)', () => {
  it('defaults to presence enabled', () => {
    const doc = new Document<{ pv: number }>('test-presence-default');
    assert.equal(doc.isEnablePresence(), true);
  });

  it('records the disabled flag from setEnablePresence', () => {
    const doc = new Document<{ pv: number }, { id?: string }>(
      'test-presence-flag',
    );
    doc.setEnablePresence(false);
    assert.equal(doc.isEnablePresence(), false);
  });

  it('drops the local change when only presence was emitted with flag off', () => {
    const doc = new Document<{ pv: number }, { id?: string }>(
      'test-presence-put-drop',
    );
    doc.setEnablePresence(false);

    // Emit a PUT via the presence proxy with no JSON operations.
    // With the flag off the Channel proxy is a no-op so the
    // ChangeContext records no presence change and no operations;
    // ctx.hasChange() returns false and Document.update does not push
    // a local change at all. createChangePack() then carries zero
    // changes from this update.
    doc.update((_root, presence) => {
      presence.set({ id: 'actor-1' });
    });

    const pack = doc.createChangePack();
    assert.equal(
      pack.getChanges().length,
      0,
      'presence-only update with flag off produces no local change',
    );
  });

  it('keeps JSON ops but strips presence when both happen with flag off', () => {
    const doc = new Document<{ pv: number; tag?: string }, { id?: string }>(
      'test-presence-mixed',
    );
    doc.setEnablePresence(false);

    doc.update((root, presence) => {
      root.tag = 'hello';
      presence.set({ id: 'actor-1' });
    });

    const pack = doc.createChangePack();
    const changes = pack.getChanges();
    assert.equal(changes.length, 1, 'JSON op-bearing change survives');
    assert.equal(
      changes[0].hasPresenceChange(),
      false,
      'presence component is stripped from the surviving change',
    );
  });

  it('still emits presence changes when the flag is enabled (default)', () => {
    const doc = new Document<{ pv: number }, { id?: string }>(
      'test-presence-put-keep',
    );

    doc.update((_root, presence) => {
      presence.set({ id: 'actor-1' });
    });

    const pack = doc.createChangePack();
    const changes = pack.getChanges();
    const hasPresenceChange = changes.some(
      (c) => c.getPresenceChange() !== undefined,
    );
    assert.equal(
      hasPresenceChange,
      true,
      'default behavior preserves presence emission',
    );
  });
});
