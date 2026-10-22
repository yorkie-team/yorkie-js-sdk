/*
 * Copyright 2020 The Yorkie Authors. All rights reserved.
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

import { ActorID } from '@yorkie-js/sdk/src/document/time/actor_id';
import {
  OpSource,
  Operation,
  OpInfo,
} from '@yorkie-js/sdk/src/document/operation/operation';
import { CRDTRoot } from '@yorkie-js/sdk/src/document/crdt/root';
import { ChangeID } from '@yorkie-js/sdk/src/document/change/change_id';
import { Indexable } from '@yorkie-js/sdk/src/document/document';
import { converter } from '@yorkie-js/sdk/src/api/converter';
import { HistoryOperation } from '@yorkie-js/sdk/src/document/history';
import {
  PresenceChange,
  PresenceChangeType,
} from '@yorkie-js/sdk/src/document/presence/change';
import { deepcopy } from '@yorkie-js/sdk/src/util/object';
import { ChangeApplyError } from '@yorkie-js/sdk/src/util/error';

/**
 * `ChangeStruct` represents the structure of Change.
 * This is used to serialize and deserialize Change.
 */
export type ChangeStruct<P extends Indexable> = {
  changeID: string;
  message?: string;
  operations?: Array<string>;
  // A `Patch` serializes its local-only `full` copy alongside the changed
  // keys, so a pending patch restored from offline persistence can still be
  // rewritten into the put it stands for.
  presenceChange?: {
    type: PresenceChangeType;
    presence?: P | Partial<P>;
    full?: P;
  };
  // `undoRedo` marks a change an undo or a redo produced. It is serialized
  // because a queued change outlives this process -- the offline-persistence
  // layer writes it and replays it after a reload -- and a replay has to reuse
  // the source the change originally ran under. See `Change.isUndoRedo`.
  undoRedo?: boolean;
};

/**
 * `Change` represents a unit of modification in the document.
 */
export class Change<P extends Indexable> {
  private id: ChangeID;

  // `operations` represent a series of user edits.
  private operations: Array<Operation>;

  // `presenceChange` represents the presenceChange of the user who made the change.
  private presenceChange?: PresenceChange<P>;

  // `message` is used to save a description of the change.
  private message?: string;

  // `undoRedo` records that this change was produced by an undo or a redo, so
  // it ran with `OpSource.UndoRedo`. That source is the only thing
  // `SetOperation.execute`/`RemoveOperation.execute` consult to skip an
  // operation whose target now sits under a removed parent, so anything that
  // replays a queued change -- `Document.applySnapshot`, `reissueActor`, the
  // persisted-log replay -- has to execute it under that source again or it
  // runs an operation that never ran.
  private undoRedo: boolean;

  constructor({
    id,
    operations,
    presenceChange,
    message,
    undoRedo,
  }: {
    id: ChangeID;
    operations?: Array<Operation>;
    presenceChange?: PresenceChange<P>;
    message?: string;
    undoRedo?: boolean;
  }) {
    this.id = id;
    this.operations = operations || [];
    this.presenceChange = presenceChange;
    this.message = message;
    this.undoRedo = undoRedo || false;
  }

  /**
   * `create` creates a new instance of Change.
   */
  public static create<P extends Indexable>({
    id,
    operations,
    presenceChange,
    message,
    undoRedo,
  }: {
    id: ChangeID;
    operations?: Array<Operation>;
    presenceChange?: PresenceChange<P>;
    message?: string;
    undoRedo?: boolean;
  }): Change<P> {
    return new Change({ id, operations, presenceChange, message, undoRedo });
  }

  /**
   * `getID` returns the ID of this change.
   */
  public getID(): ChangeID {
    return this.id;
  }

  /**
   * `getMessage` returns the message of this change.
   */
  public getMessage(): string | undefined {
    return this.message;
  }

  /**
   * `hasOperations` returns whether this change has operations or not.
   */
  public hasOperations(): boolean {
    return this.operations.length > 0;
  }

  /**
   * `getOperations` returns the operations of this change.
   */
  public getOperations(): Array<Operation> {
    return this.operations;
  }

  /**
   * `setActor` sets the given actor.
   */
  public setActor(actorID: ActorID): void {
    for (const operation of this.operations) {
      operation.setActor(actorID);
    }

    this.id = this.id.setActor(actorID);
  }

  /**
   * `isUndoRedo` returns whether an undo or a redo produced this change, which
   * is to say whether a replay of it has to use `OpSource.UndoRedo`.
   */
  public isUndoRedo(): boolean {
    return this.undoRedo;
  }

  /**
   * `markAsUndoRedo` records that an undo or a redo produced this change.
   */
  public markAsUndoRedo(): void {
    this.undoRedo = true;
  }

  /**
   * `hasPresenceChange` returns whether this change has presence change or not.
   */
  public hasPresenceChange(): boolean {
    return this.presenceChange !== undefined;
  }

  /**
   * `getPresenceChange` returns the presence change of this change.
   */
  public getPresenceChange(): PresenceChange<P> | undefined {
    return this.presenceChange;
  }

  /**
   * `setPresenceChange` replaces the presence change of this change. It is how
   * a pending patch is rewritten into the full put the server asks for when it
   * has no base to fold the patch into. The presence it resolves to is the
   * same either way, so the change this document already applied locally
   * stands.
   */
  public setPresenceChange(presenceChange: PresenceChange<P>): void {
    this.presenceChange = presenceChange;
  }

  /**
   * `execute` executes the operations of this change to the given root.
   */
  public execute(
    root: CRDTRoot,
    presences: Map<ActorID, P>,
    source: OpSource,
  ): {
    operations: Array<Operation>;
    opInfos: Array<OpInfo>;
    reverseOps: Array<HistoryOperation<P>>;
  } {
    const changeOpInfos: Array<OpInfo> = [];
    const changeOperations: Array<Operation> = [];
    const reverseOps: Array<HistoryOperation<P>> = [];

    for (const [opIndex, operation] of this.operations.entries()) {
      let executionResult;
      try {
        executionResult = operation.execute(
          root,
          source,
          this.id.getVersionVector(),
        );
      } catch (cause) {
        // NOTE: only a remote change is named. The wedged-document problem is
        // specific to the pull path — the checkpoint does not advance past a
        // change that throws, so the server redelivers it forever — while a
        // local `update` or an undo/redo reports the failure straight to the
        // caller that asked for it. Wrapping those would replace the error
        // code an operation deliberately threw (`ErrInvalidArgument`,
        // `ErrInvalidType`, ...) with `ErrChangeApplyFailed` for every
        // consumer of the public API.
        if (source !== OpSource.Remote) {
          throw cause;
        }

        // NOTE: the failing operation is only identifiable here. Name it now
        // so the document can report which operation of which change is
        // stuck; the document key is added as the error passes through
        // `Document`. The name is the operation's type and target element,
        // never `toTestString()`: that serializer embeds the operation's
        // payload, i.e. the plaintext document content, and this message
        // reaches application code and the console.
        throw new ChangeApplyError({
          changeID: this.id.toTestString(),
          opIndex,
          operation: `${
            operation.constructor.name
          } on ${operation.getParentCreatedAt().toTestString()}`,
          cause,
        });
      }
      // NOTE(hackerwins): If the element was removed while executing undo/redo,
      // the operation is not executed and executionResult is undefined.
      if (!executionResult) continue;
      const { opInfos, reverseOp } = executionResult;
      changeOpInfos.push(...opInfos);
      changeOperations.push(operation);
      // TODO(hackerwins): This condition should be removed after implementing
      // all reverse operations.
      if (reverseOp) {
        reverseOps.unshift(reverseOp);
      }
    }

    if (this.presenceChange) {
      if (this.presenceChange.type === PresenceChangeType.Put) {
        presences.set(
          this.id.getActorID(),
          deepcopy(this.presenceChange.presence),
        );
      } else if (this.presenceChange.type === PresenceChangeType.Patch) {
        // A patch is an upload-side encoding: only the changed keys go on the
        // wire. A locally minted one carries the whole presence as of that
        // change in `full`, so there is nothing to fold -- apply that. One
        // decoded off the wire has no `full` (it never goes on the wire), so
        // fold its keys onto the presence already held for that actor, which
        // is what the server would have done before storing it.
        const actorID = this.id.getActorID();
        if (this.presenceChange.full) {
          presences.set(actorID, deepcopy(this.presenceChange.full));
        } else {
          const base = presences.get(actorID);
          // No base to fold onto. The server folded this patch onto the full
          // presence it stores, so the keys on the wire are only the ones
          // that changed -- everything the peer did not touch lives in a
          // base this document no longer has (it was evicted past
          // `MaxRetainedPresences`, or the put that seeded it was never
          // seen). Writing the changed keys alone would hand the application
          // an object typed `P` that is missing most of its fields, and
          // indexing into it would throw inside app code. Leave the actor
          // without a presence instead: that is a state `getPresence` and
          // `getPresences` already model, and the next snapshot restores the
          // real presence in full.
          if (base !== undefined) {
            presences.set(actorID, {
              ...base,
              ...deepcopy(this.presenceChange.presence),
            } as P);
          }
        }
      } else {
        presences.delete(this.id.getActorID());
      }
    }

    return { operations: changeOperations, opInfos: changeOpInfos, reverseOps };
  }

  /**
   * `toTestString` returns a string containing the meta data of this change.
   */
  public toTestString(): string {
    return `${this.operations
      .map((operation) => operation.toTestString())
      .join(',')}`;
  }

  /**
   * `toStruct` returns the structure of this change.
   */
  public toStruct(): ChangeStruct<P> {
    return {
      changeID: converter.bytesToHex(converter.changeIDToBinary(this.getID())),
      message: this.getMessage(),
      operations: this.getOperations().map((op) =>
        converter.bytesToHex(converter.operationToBinary(op)),
      ),
      presenceChange: this.getPresenceChange(),
      // Written only when set, so a change no undo produced serializes exactly
      // as it did before this field existed.
      undoRedo: this.undoRedo || undefined,
    };
  }

  /**
   * `fromStruct` creates a instance of Change from the struct.
   */
  public static fromStruct<P extends Indexable>(
    struct: ChangeStruct<P>,
  ): Change<P> {
    const { changeID, operations, presenceChange, message, undoRedo } = struct;
    return Change.create<P>({
      id: converter.bytesToChangeID(converter.hexToBytes(changeID)),
      operations: operations?.map((op) => {
        return converter.bytesToOperation(converter.hexToBytes(op));
      }),
      presenceChange: presenceChange as any,
      message,
      undoRedo,
    });
  }
}
