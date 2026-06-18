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

import { describe, it, assert, beforeEach, vi, afterEach } from 'vitest';

import { Document } from '@yorkie-js/sdk/src/document/document';
import { ChangeContext } from '@yorkie-js/sdk/src/document/change/context';
import { InitialChangeID } from '@yorkie-js/sdk/src/document/change/change_id';
import { CRDTRoot } from '@yorkie-js/sdk/src/document/crdt/root';
import { PresenceChangeType } from '@yorkie-js/sdk/src/document/presence/change';

describe('Document.disablePresence', function () {
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('round-trips through DocumentOptions to isPresenceDisabled', function () {
    const doc = new Document<{ count: number }>('test-doc', {
      disablePresence: true,
    });
    assert.isTrue(doc.isPresenceDisabled());

    const docDefault = new Document<{ count: number }>('test-doc-default');
    assert.isFalse(docDefault.isPresenceDisabled());

    const docExplicitFalse = new Document<{ count: number }>(
      'test-doc-explicit-false',
      { disablePresence: false },
    );
    assert.isFalse(docExplicitFalse.isPresenceDisabled());
  });

  it('drops presence-only update silently when option is on', function () {
    type P = { cursor: number };
    const doc = new Document<{ count: number }, P>('test-doc', {
      disablePresence: true,
    });
    const actorID = doc.getChangeID().getActorID();

    doc.update((_, p) => {
      p.set({ cursor: 7 });
    });

    // No presence recorded for the actor — the change collapsed
    // (no operations + dropped presence emit).
    assert.isFalse(doc.hasPresence(actorID));
    // Warn fires exactly once.
    assert.strictEqual(warnSpy.mock.calls.length, 1);
  });

  it('warns at most once per document across many drops', function () {
    type P = { cursor: number };
    const doc = new Document<{ count: number }, P>('test-doc', {
      disablePresence: true,
    });

    for (let i = 0; i < 5; i++) {
      doc.update((_, p) => {
        p.set({ cursor: i });
      });
    }

    assert.strictEqual(warnSpy.mock.calls.length, 1);
  });

  it('preserves operations on a mixed change even when presence is dropped', function () {
    type P = { cursor: number };
    const doc = new Document<{ count: number }, P>('test-doc', {
      disablePresence: true,
    });
    const actorID = doc.getChangeID().getActorID();

    doc.update((root, p) => {
      root.count = 42;
      p.set({ cursor: 9 });
    });

    // Operation persisted on the root.
    assert.strictEqual(doc.getRoot().count, 42);
    // Presence dropped — no entry for the actor.
    assert.isFalse(doc.hasPresence(actorID));
  });

  it('allows presence to flow when option is off', function () {
    type P = { cursor: number };
    const doc = new Document<{ count: number }, P>('test-doc');
    const actorID = doc.getChangeID().getActorID();

    doc.update((_, p) => {
      p.set({ cursor: 3 });
    });

    // No warn fired.
    assert.strictEqual(warnSpy.mock.calls.length, 0);
    // Presence recorded for the actor.
    assert.isTrue(doc.hasPresence(actorID));
  });

  it('honours setDisablePresence flipped after construction', function () {
    type P = { cursor: number };
    const doc = new Document<{ count: number }, P>('test-doc');
    const actorID = doc.getChangeID().getActorID();
    assert.isFalse(doc.isPresenceDisabled());

    // Flip on — subsequent updates should drop presence.
    doc.setDisablePresence(true);
    assert.isTrue(doc.isPresenceDisabled());
    doc.update((_, p) => {
      p.set({ cursor: 1 });
    });
    assert.isFalse(doc.hasPresence(actorID));
    assert.strictEqual(warnSpy.mock.calls.length, 1);

    // Flip off — presence flows again.
    doc.setDisablePresence(false);
    assert.isFalse(doc.isPresenceDisabled());
    doc.update((_, p) => {
      p.set({ cursor: 2 });
    });
    assert.isTrue(doc.hasPresence(actorID));
    // Warn is still latched at one — the second update was not gated.
    assert.strictEqual(warnSpy.mock.calls.length, 1);
  });
});

describe('ChangeContext presenceless accessors', function () {
  function makeCtx() {
    const root = CRDTRoot.create();
    return ChangeContext.create<{ cursor: number }>(InitialChangeID, root, {
      cursor: 0,
    });
  }

  it('hasPresenceChange reflects setPresenceChange / dropPresenceChange', function () {
    const ctx = makeCtx();
    assert.isFalse(ctx.hasPresenceChange());

    ctx.setPresenceChange({
      type: PresenceChangeType.Put,
      presence: { cursor: 5 },
    });
    assert.isTrue(ctx.hasPresenceChange());

    ctx.dropPresenceChange();
    assert.isFalse(ctx.hasPresenceChange());
  });

  it('dropPresenceChange leaves a presence-only context with no change', function () {
    const ctx = makeCtx();
    ctx.setPresenceChange({
      type: PresenceChangeType.Put,
      presence: { cursor: 5 },
    });
    assert.isTrue(ctx.hasChange());

    ctx.dropPresenceChange();
    assert.isFalse(ctx.hasChange());
  });

  it('clearReversePresence discards recorded reverse keys', function () {
    const ctx = makeCtx();
    ctx.setReversePresence({ cursor: 1 }, { addToHistory: true });
    assert.deepEqual(ctx.getReversePresence(), { cursor: 0 });

    ctx.clearReversePresence();
    assert.strictEqual(ctx.getReversePresence(), undefined);
  });
});
