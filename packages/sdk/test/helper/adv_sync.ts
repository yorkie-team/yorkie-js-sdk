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

// The push/pull model of Go's pkg/document/adv_sync_test.go, for the
// randomized harnesses that drive replicas through a model server.

import { Document } from '@yorkie-js/sdk/src/document/document';
import { Change } from '@yorkie-js/sdk/src/document/change/change';
import { ChangePack } from '@yorkie-js/sdk/src/document/change/change_pack';
import { Checkpoint } from '@yorkie-js/sdk/src/document/change/checkpoint';
import {
  InitialVersionVector,
  VersionVector,
} from '@yorkie-js/sdk/src/document/time/version_vector';

/**
 * `mulberry32` is a small seeded PRNG, so a seed replays the same history.
 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * `minVersionVector` is Go's `time.MinVersionVector`: element-wise min, and
 * 0 for an actor any vector does not carry.
 */
export function minVersionVector(vectors: Array<VersionVector>): VersionVector {
  const actors = new Set<string>();
  for (const v of vectors) {
    for (const [actor] of v) {
      actors.add(actor);
    }
  }
  const out = new VersionVector(new Map());
  for (const actor of actors) {
    let min: bigint | undefined;
    for (const v of vectors) {
      const l = v.get(actor) ?? 0n;
      min = min === undefined || l < min ? l : min;
    }
    out.set(actor, min!);
  }
  return out;
}

/**
 * `AdvClient` is a replica attached to an `AdvServer`.
 */
export type AdvClient<T> = {
  doc: Document<T>;
  id: string;
  cursor: number;
};

/**
 * `newAdvClients` returns `n` replicas of one document under the actors
 * 1..n.
 */
export function newAdvClients<T>(n: number): Array<AdvClient<T>> {
  const clients: Array<AdvClient<T>> = [];
  for (let i = 0; i < n; i++) {
    const id = String(i + 1).padStart(24, '0');
    const doc = new Document<T>('adv-doc');
    doc.setActor(id);
    clients.push({ doc, id, cursor: 0 });
  }
  return clients;
}

/**
 * `AdvServer` models the server's pushpull: one ordered change log, one
 * stored version vector row per client (the vector its push carried), and
 * minVV = element-wise min over the stored rows. A client only ever sees
 * minVV as the version vector of a pull response, and `applyChangePack` is
 * what runs GC with it, so GC can never run at a moment the protocol would
 * not produce.
 */
export class AdvServer {
  public log: Array<Change<any>> = [];
  private rows = new Map<string, VersionVector>();

  /**
   * `sync` is one PushPull round trip: push local changes, store the
   * request's vector, pull everything the server holds that this client has
   * not seen, and hand the response (changes + minVV) to `applyChangePack`,
   * which applies then collects.
   */
  public sync<T>(c: AdvClient<T>, gc: boolean): void {
    const p = c.doc.createChangePack();
    const pushed = p.getChanges();
    this.log.push(...pushed);
    this.rows.set(c.id, p.getVersionVector()!.deepcopy());
    const lastSeq = pushed.length
      ? pushed[pushed.length - 1].getID().getClientSeq()
      : 0;

    const pulled = this.log
      .slice(c.cursor)
      .filter((ch) => ch.getID().getActorID() !== c.id);
    c.cursor = this.log.length;

    const vv = gc
      ? minVersionVector([...this.rows.values()])
      : InitialVersionVector;
    c.doc.applyChangePack(
      ChangePack.create(
        c.doc.getKey(),
        Checkpoint.of(0n, lastSeq),
        false,
        pulled,
        vv,
      ),
    );
  }
}
