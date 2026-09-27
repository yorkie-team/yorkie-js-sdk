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

import type { EditorView } from 'prosemirror-view';
import type { Transaction } from 'prosemirror-state';
import { Tree, SyncMode } from '@yorkie-js/sdk';
import type { MarkMapping, YorkieProseMirrorOptions } from './types';
import { buildMarkMapping, invertMapping } from './defaults';
import { pmToYorkie } from './convert';
import { syncToYorkie } from './diff';
import {
  syncToPM,
  syncToPMIncremental,
  buildDocFromYorkieTree,
  diffDocs,
  applyDocDiff,
  type DocDiff,
} from './sync';
import {
  buildPositionMap,
  pmPosToYorkieIdx,
  yorkieIdxToPmPos,
} from './position';
import { CursorManager } from './cursor';
import { remoteSelectionsKey, type RemoteSelection } from './selection-plugin';

/**
 * Sync mode the document is held in while an IME composition is active.
 *
 * `RealtimePushOnly` keeps local edits flowing to peers while refusing
 * incoming changes: the request carries `pushOnly`, and the client drops a
 * response pack carrying remote state — changes or a snapshot — that arrives
 * anyway, including from an explicit `client.sync(doc)` (which always pulls).
 * That is all the composition guard needs — applying a remote change
 * mid-composition is what breaks the browser's composing text node, pushing a
 * local one is not.
 *
 * The pause is still asynchronous, so a snapshot can land in the window
 * between compositionstart and `changeSyncMode` resolving; `onSnapshot()`
 * defers that one to the compositionend flush.
 */
const PausedSyncMode = SyncMode.RealtimePushOnly;

/**
 * How many times a single sync-mode transition is attempted before giving up.
 *
 * A rejected `changeSyncMode` has no other re-driver: a failed resume would
 * otherwise leave the document in `RealtimePushOnly` forever, silently never
 * receiving another remote change.
 */
const MaxSyncModeAttempts = 3;

/** Cancel a scheduled frame, tolerating environments without the global. */
function cancelFrame(handle: number): void {
  if (typeof cancelAnimationFrame === 'function') {
    cancelAnimationFrame(handle);
  }
}

/**
 * Primary user-facing API for binding a ProseMirror editor to a Yorkie document.
 *
 * Usage:
 * ```ts
 * const binding = new YorkieProseMirrorBinding(view, doc, 'tree', {
 *   markMapping: { strong: 'strong', em: 'em' },
 *   cursors: { enabled: true, overlayElement: el },
 * });
 * binding.initialize();
 * // ...
 * binding.destroy();
 * ```
 */
export class YorkieProseMirrorBinding {
  private view: EditorView;
  private doc: any;
  private treePath: string;
  private markMapping: MarkMapping;
  private elementToMarkMapping: Record<string, string>;
  private wrapperElementName: string;
  private client?: {
    changeSyncMode(doc: any, syncMode: SyncMode): Promise<any>;
  };
  private isSyncing = false;
  private isComposing = false;
  private isSyncPaused = false;
  /**
   * The mode the document is attached in, and the one a resume returns it to.
   *
   * Nothing on the client reads the current mode back, so this is whatever the
   * host declared via `options.syncMode`. Resuming to a hardcoded `Realtime`
   * instead would promote a document the host attached as `Polling` or
   * `Manual` the first time anyone used an IME.
   */
  private baseSyncMode: SyncMode;
  private desiredSyncMode: SyncMode;
  private syncModeChangeQueue: Promise<void> = Promise.resolve();
  private composingBlockRange: { from: number; to: number } | undefined =
    undefined;
  private hasPendingRemoteChanges = false;
  private pendingFlushHandle: number | undefined = undefined;
  private isDestroyed = false;
  private cursorManager: CursorManager | undefined = undefined;
  private remoteSelections = new Map<string, RemoteSelection>();
  private publishSelection: boolean | undefined;
  private hasPublishedSelection = false;
  private lastShouldPublish: boolean | undefined;
  private onLog?: (type: 'local' | 'remote' | 'error', message: string) => void;
  private originalDispatchTransaction: ((tr: Transaction) => void) | undefined;
  private installedDispatchTransaction: ((tr: Transaction) => void) | undefined;
  private originalViewUpdate: ((props: any) => void) | undefined;
  private installedViewUpdate: ((props: any) => void) | undefined;
  private unsubscribeDoc?: () => void;
  private unsubscribePresence?: () => void;

  constructor(
    view: EditorView,
    doc: any,
    treePath: string,
    options: YorkieProseMirrorOptions = {},
  ) {
    this.view = view;
    this.doc = doc;
    this.treePath = treePath;
    this.markMapping =
      options.markMapping || buildMarkMapping(view.state.schema);
    this.elementToMarkMapping = invertMapping(this.markMapping);
    this.wrapperElementName = options.wrapperElementName || 'span';
    this.publishSelection = options.publishSelection;
    this.onLog = options.onLog;
    this.client = options.client;
    this.baseSyncMode = options.syncMode ?? SyncMode.Realtime;
    this.desiredSyncMode = this.baseSyncMode;

    if (options.cursors?.enabled) {
      this.cursorManager = new CursorManager(options.cursors);
    }
  }

  /**
   * Initialize the binding: load or create the Yorkie tree,
   * set up dispatchTransaction override and subscriptions.
   */
  initialize(): void {
    // A binding re-initialized after destroy() must not stay inert.
    this.isDestroyed = false;
    const tree = this.getTree();

    // If tree doesn't exist yet, create it from current PM doc
    if (!tree) {
      this.doc.update((root: any) => {
        const yorkieDoc = pmToYorkie(
          this.view.state.doc,
          this.markMapping,
          this.wrapperElementName,
        );
        this.onLog?.('local', `Initializing Yorkie tree: ${yorkieDoc.type}`);
        root[this.treePath] = new Tree(yorkieDoc as any);
      });
    } else {
      // Tree already existed (second client) — load its state into PM
      syncToPM(
        this.view,
        tree,
        this.view.state.schema,
        this.elementToMarkMapping,
        this.onLog,
        this.wrapperElementName,
      );
      this.onLog?.('local', 'Loaded existing Yorkie tree into PM');
    }

    // Override dispatchTransaction for upstream sync
    this.setupDispatchTransaction();

    // Subscribe to remote changes for downstream sync
    this.setupDocSubscription();

    // Subscribe to presence for cursor display
    this.setupPresenceSubscription();

    // Track IME composition to defer remote updates
    this.setupCompositionListeners();

    // Watch prop updates so an `editable` flip is acted on right away
    this.setupEditableWatch();

    // Set initial presence
    this.syncPresence();
  }

  /**
   * Clean up all subscriptions and overrides.
   */
  destroy(): void {
    this.isDestroyed = true;
    // Cancel a flush deferred by a compositionend that never got its frame,
    // so it cannot sync and dispatch into a torn-down view.
    if (this.pendingFlushHandle !== undefined) {
      cancelFrame(this.pendingFlushHandle);
      this.pendingFlushHandle = undefined;
    }
    this.resumeRemoteSync();
    this.unsubscribeDoc?.();
    this.unsubscribePresence?.();
    this.cursorManager?.destroy();
    this.hasPendingRemoteChanges = false;
    this.composingBlockRange = undefined;
    this.isComposing = false;
    // `isSyncPaused` is owned by the sync-mode queue: clearing it here while
    // the resume queued above is still in flight would make a failed resume
    // revert `desiredSyncMode` to Realtime even though the document is still
    // push-only, stranding it there. The queued resume clears it on success.

    const dom = this.view.dom;
    dom.removeEventListener('compositionstart', this.onCompositionStart);
    dom.removeEventListener('compositionend', this.onCompositionEnd);

    const view = this.view as any;

    // Unwrap `update` before the setProps below, which routes through it.
    // Restore only while ours is still the installed one: a wrapper layered
    // on after us owns the slot, and overwriting it would detach that one.
    if (this.installedViewUpdate && view.update === this.installedViewUpdate) {
      view.update = this.originalViewUpdate;
    }
    this.installedViewUpdate = undefined;
    this.originalViewUpdate = undefined;

    // Retract before the binding goes quiet. A torn-down binding that leaves
    // its last `presence.selection` behind is a ghost cursor on every peer:
    // the peer-side removal only fires on a presence event carrying no
    // selection, and nothing else would ever send one.
    this.retractSelection();
    this.lastShouldPublish = undefined;

    // Restore the original dispatchTransaction via setProps (ProseMirror's
    // API). It is `undefined` for a view built without that prop — the usual
    // case — and restoring it must still happen, or the binding keeps writing
    // edits and publishing the caret after destroy(). Same ownership check as
    // `update` above, so a later wrapper is left alone. A view destroyed
    // first (`view.destroy(); binding.destroy();`) dispatches nothing anymore,
    // and its setProps throws, so skip the write there.
    if (
      this.installedDispatchTransaction &&
      !view.isDestroyed &&
      view.props.dispatchTransaction === this.installedDispatchTransaction
    ) {
      view.setProps({
        dispatchTransaction: this.originalDispatchTransaction,
      });
    }
    this.installedDispatchTransaction = undefined;
    this.originalDispatchTransaction = undefined;
  }

  private getTree(): any {
    return this.doc.getRoot()[this.treePath];
  }

  /**
   * Whether the binding may still read from and dispatch into its view.
   *
   * `view.destroy(); binding.destroy();` is a supported ordering, and in the
   * window between those two calls the document and presence subscriptions are
   * still live: an event arriving there reaches `view.state` / `view.dispatch`
   * on a view whose `docView` is already gone, which throws out of the SDK's
   * subscriber callback. Every path that touches the view from a subscription
   * or a deferred frame checks this first.
   */
  private canTouchView(): boolean {
    return !this.isDestroyed && !(this.view as any).isDestroyed;
  }

  private setupCompositionListeners(): void {
    const dom = this.view.dom;
    dom.addEventListener('compositionstart', this.onCompositionStart);
    dom.addEventListener('compositionend', this.onCompositionEnd);
  }

  private onCompositionStart = (): void => {
    this.isComposing = true;
    this.composingBlockRange = this.getComposingBlockRange();
    this.pauseRemoteSync();
  };

  private onCompositionEnd = (): void => {
    this.isComposing = false;
    this.composingBlockRange = undefined;
    this.flushPendingRemoteChanges();
  };

  /**
   * Find the position range of the top-level block containing the selection.
   */
  private getComposingBlockRange(): { from: number; to: number } | undefined {
    const { from } = this.view.state.selection;
    const doc = this.view.state.doc;
    let pos = 0;
    for (let i = 0; i < doc.content.childCount; i++) {
      const child = doc.content.child(i);
      const end = pos + child.nodeSize;
      if (from >= pos && from <= end) {
        return { from: pos, to: end };
      }
      pos = end;
    }
    return undefined;
  }

  /**
   * Serialize sync-mode transitions to prevent mode inversion when
   * pause/resume are called in quick succession.
   */
  private setRemoteSyncMode(nextMode: SyncMode): void {
    if (!this.client || this.desiredSyncMode === nextMode) return;
    this.desiredSyncMode = nextMode;
    this.syncModeChangeQueue = this.syncModeChangeQueue.then(() =>
      this.applySyncMode(nextMode, 1),
    );
  }

  /**
   * Apply one queued sync-mode transition, retrying a rejected request.
   *
   * Nothing else re-drives a transition — `resumeRemoteSync()` is only called
   * from `destroy()` and from the deferred flush — so a resume that fails once
   * and is never retried strands the document in `PausedSyncMode`, where it
   * pushes local edits but receives nothing.
   */
  private applySyncMode(nextMode: SyncMode, attempt: number): Promise<void> {
    // A newer transition superseded this one while it waited in the queue.
    if (this.desiredSyncMode !== nextMode) return Promise.resolve();

    // `Promise.resolve().then` so a client that throws synchronously rejects
    // this attempt instead of poisoning the shared queue.
    return Promise.resolve()
      .then(() => this.client!.changeSyncMode(this.doc, nextMode))
      .then(
        () => {
          this.isSyncPaused = nextMode === PausedSyncMode;
        },
        (e: Error) => {
          this.onLog?.('error', `Failed to change sync mode: ${e.message}`);
          if (attempt < MaxSyncModeAttempts) {
            return this.applySyncMode(nextMode, attempt + 1);
          }
          // Out of attempts: fall back to the last known effective mode so a
          // later pause/resume is not skipped by the `desiredSyncMode` check.
          if (this.desiredSyncMode === nextMode) {
            this.desiredSyncMode = this.isSyncPaused
              ? PausedSyncMode
              : this.baseSyncMode;
          }
          return undefined;
        },
      );
  }

  /**
   * Whether the composition guard should touch the document's sync mode.
   *
   * Only `Realtime` qualifies, and the reason is what `changeSyncMode` does
   * either side of the pause. `Realtime` and `PausedSyncMode` are both
   * stream-using modes, so moving between them keeps the existing watch
   * stream and resolves without a round trip. `Manual` and `Polling` are
   * stream-*less*: `Client.changeSyncMode` awaits `runWatchLoop()` when it
   * leaves one of them and cancels the stream on the way back, so pausing a
   * polling document would open and tear down a server watch stream on every
   * compositionstart — network the host opted out of by attaching that way,
   * with the resume queued behind it.
   *
   * Neither mode needs the pause anyway: a remote change that lands mid
   * composition is deferred by `onRemoteChange`/`onSnapshot` regardless of
   * sync mode, which is what actually protects the composing text node. The
   * mode change is only an optimization that stops the changes arriving in
   * the first place, so the modes where it costs a stream skip it.
   */
  private managesSyncMode(): boolean {
    return this.baseSyncMode === SyncMode.Realtime;
  }

  private pauseRemoteSync(): void {
    if (!this.managesSyncMode()) return;
    this.setRemoteSyncMode(PausedSyncMode);
  }

  private resumeRemoteSync(): void {
    if (!this.managesSyncMode()) return;
    this.setRemoteSyncMode(this.baseSyncMode);
  }

  /**
   * Check whether a block-level diff overlaps the block being composed.
   */
  private diffOverlapsComposingBlock(diff: DocDiff): boolean {
    if (!this.composingBlockRange) return true;
    return (
      diff.fromPos < this.composingBlockRange.to &&
      diff.toPos > this.composingBlockRange.from
    );
  }

  /**
   * Check whether any remote selection overlaps the block being composed.
   */
  private selectionsOverlapComposingBlock(): boolean {
    if (!this.composingBlockRange) return true;
    const { from, to } = this.composingBlockRange;
    for (const sel of this.remoteSelections.values()) {
      if (sel.from < to && sel.to > from) return true;
    }
    return false;
  }

  /**
   * Flush all deferred remote changes after composition ends.
   */
  private flushPendingRemoteChanges(): void {
    // `isSyncPaused` only flips once the queued `changeSyncMode` resolves, so a
    // composition short enough to end while the pause is still in flight would
    // early-return here and strand the document in `PausedSyncMode` forever.
    // Treat the requested mode as paused too, so the resume always happens.
    const isPausedOrPausing =
      this.isSyncPaused || this.desiredSyncMode === PausedSyncMode;
    if (!this.hasPendingRemoteChanges && !isPausedOrPausing) return;
    this.hasPendingRemoteChanges = false;

    // Wait for the browser to finish processing the compositionend event
    // and check that a new composition hasn't started immediately after.
    if (this.pendingFlushHandle !== undefined) {
      cancelFrame(this.pendingFlushHandle);
    }
    this.pendingFlushHandle = requestAnimationFrame(() => {
      this.pendingFlushHandle = undefined;
      if (this.isDestroyed) return;
      if (this.isComposing) {
        // A new composition started (e.g. user continued typing Korean).
        // Re-defer until that composition ends.
        this.hasPendingRemoteChanges = true;
        return;
      }

      // Resume sync first so accumulated remote changes arrive
      this.resumeRemoteSync();

      // The view can be destroyed before the binding is, leaving this frame
      // scheduled with nothing to apply it to. The resume above still has to
      // run — it is what takes the document back out of `PausedSyncMode`.
      if (!this.canTouchView()) return;

      // Apply any accumulated remote content changes
      try {
        this.isSyncing = true;
        syncToPMIncremental(
          this.view,
          this.getTree(),
          this.view.state.schema,
          this.elementToMarkMapping,
          this.onLog,
          this.wrapperElementName,
        );
      } catch (e) {
        this.onLog?.(
          'error',
          `Deferred remote sync failed: ${(e as Error).message}`,
        );
      } finally {
        this.isSyncing = false;
      }
      this.cursorManager?.repositionAll(this.view);

      // Apply any deferred decoration updates
      this.applySelectionDecorations();
    });
  }

  private setupDispatchTransaction(): void {
    this.originalDispatchTransaction = (
      this.view as any
    ).props.dispatchTransaction;

    this.installedDispatchTransaction = (transaction: Transaction) => {
      const newState = this.view.state.apply(transaction);
      this.view.updateState(newState);

      // A consumer that installed no dispatchTransaction of its own can hold
      // on to this closure past destroy() (ProseMirror keeps the props of a
      // view it never re-configured). Apply the transaction, but never write
      // into the document from a torn-down binding.
      if (this.isDestroyed) return;

      // Skip sync for remote changes or during sync
      if (transaction.getMeta('yorkie-remote') || this.isSyncing) {
        return;
      }

      const tree = this.getTree();
      if (!tree) return;

      if (!transaction.steps.length) {
        // Selection-only change — sync cursor to presence
        this.syncPresence();
        return;
      }

      // Content changed — remap remote cursor positions through the mapping
      if (this.cursorManager && transaction.steps.length) {
        this.cursorManager.remapPositions(transaction.mapping);
        for (const [id, sel] of this.remoteSelections) {
          this.remoteSelections.set(id, {
            ...sel,
            from: transaction.mapping.map(sel.from),
            to: transaction.mapping.map(sel.to),
          });
        }
        this.cursorManager.repositionAll(this.view);
      }

      // Content changed - sync to Yorkie
      const oldDoc = transaction.before;
      const newDoc = newState.doc;

      this.doc.update((root: any, presence: any) => {
        try {
          this.isSyncing = true;
          syncToYorkie(
            root[this.treePath],
            oldDoc,
            newDoc,
            this.markMapping,
            this.onLog,
            this.wrapperElementName,
          );

          // Sync cursor position after content edit
          if (this.shouldPublishSelection()) {
            const treeJSON = JSON.parse(root[this.treePath].toJSON());
            const map = buildPositionMap(newDoc, treeJSON);
            const sel = newState.selection;
            const yorkieFrom = pmPosToYorkieIdx(map, sel.from);
            const yorkieTo = pmPosToYorkieIdx(map, sel.to);
            presence.set({
              selection: root[this.treePath].indexRangeToPosRange([
                yorkieFrom,
                yorkieTo,
              ]),
            });
            this.hasPublishedSelection = true;
          } else if (this.hasPublishedSelection) {
            // Publishing just turned off — retract what peers still render.
            presence.set({ selection: undefined });
            this.hasPublishedSelection = false;
          }
        } catch (e) {
          this.onLog?.(
            'error',
            `Upstream sync failed: ${(e as Error).message}`,
          );
          // Re-sync from Yorkie to recover from diverged state
          syncToPM(
            this.view,
            root[this.treePath],
            this.view.state.schema,
            this.elementToMarkMapping,
            this.onLog,
            this.wrapperElementName,
          );
        } finally {
          this.isSyncing = false;
        }
      });
    };

    (this.view as any).setProps({
      dispatchTransaction: this.installedDispatchTransaction,
    });
  }

  private setupDocSubscription(): void {
    const unsubscribe = this.doc.subscribe((event: any) => {
      // The view can be torn down before destroy() unsubscribes this.
      if (!this.canTouchView()) return;
      if (event.type === 'snapshot') {
        this.onSnapshot();
        return;
      }
      if (event.type !== 'remote-change') return;
      if (this.isSyncing) return;

      const { operations } = event.value;
      const hasTreeOps = operations.some(
        (op: any) => op.type === 'tree-edit' || op.type === 'tree-style',
      );
      if (!hasTreeOps) return;

      this.onLog?.('remote', `Received ${operations.length} remote operations`);

      // Not composing — apply immediately
      if (!this.isComposing) {
        this.applyRemoteTreeOps();
        return;
      }

      // During composition: check if the diff touches the composing block
      try {
        const newDoc = buildDocFromYorkieTree(
          this.getTree(),
          this.view.state.schema,
          this.elementToMarkMapping,
          this.wrapperElementName,
        );
        const diff = diffDocs(this.view.state.doc, newDoc);
        if (!diff) return;

        if (!this.diffOverlapsComposingBlock(diff)) {
          // Safe: changes are in a different block — apply immediately
          try {
            this.isSyncing = true;
            applyDocDiff(this.view, diff);
            // Update composing block range in case positions shifted
            this.composingBlockRange = this.getComposingBlockRange();
          } finally {
            this.isSyncing = false;
          }
          this.cursorManager?.repositionAll(this.view);
          return;
        }
      } catch {
        // On any error, fall through to defer
      }

      // Overlaps composing block or couldn't determine — defer
      this.hasPendingRemoteChanges = true;
    });
    this.unsubscribeDoc = unsubscribe;
  }

  /**
   * Handle a snapshot the document applied. It replaces the whole root and
   * emits no `remote-change`, so without this the view would silently fall
   * behind the tree. While composing, defer it to the compositionend flush:
   * a replaced root gives no trustworthy block-level diff to apply in part.
   */
  private onSnapshot(): void {
    this.onLog?.('remote', 'Received a remote snapshot');
    if (this.isComposing) {
      this.hasPendingRemoteChanges = true;
      return;
    }
    this.applyRemoteTreeOps();
  }

  private applyRemoteTreeOps(): void {
    try {
      this.isSyncing = true;
      syncToPMIncremental(
        this.view,
        this.getTree(),
        this.view.state.schema,
        this.elementToMarkMapping,
        this.onLog,
        this.wrapperElementName,
      );
    } catch (e) {
      this.onLog?.('error', `Downstream sync failed: ${(e as Error).message}`);
    } finally {
      this.isSyncing = false;
    }
    this.cursorManager?.repositionAll(this.view);
  }

  private setupPresenceSubscription(): void {
    if (!this.cursorManager) return;

    const unsubscribe = this.doc.subscribe('others' as any, (event: any) => {
      // The view can be torn down before destroy() unsubscribes this.
      if (!this.canTouchView()) return;
      if (event.type === 'presence-changed') {
        const { clientID, presence } = event.value;
        if (!presence.selection) {
          // The peer retracted its selection (e.g. it went read-only). The
          // event carries that peer's whole presence, so an absent selection
          // means there is no cursor of theirs left to render.
          this.cursorManager!.removeCursor(clientID);
          if (this.remoteSelections.delete(clientID)) {
            this.dispatchSelectionDecorations();
          }
        } else {
          try {
            const tree = this.getTree();
            const [fromIdx, toIdx] = tree.posRangeToIndexRange([
              presence.selection[0],
              presence.selection[1],
            ]);
            const treeJSON = JSON.parse(tree.toJSON());
            const map = buildPositionMap(this.view.state.doc, treeJSON);
            const pmFrom = yorkieIdxToPmPos(map, fromIdx);
            const pmTo = yorkieIdxToPmPos(map, toIdx);
            const color = this.cursorManager!.displayCursor(
              this.view,
              pmTo,
              clientID,
            );
            if (color) {
              this.remoteSelections.set(clientID, {
                clientID,
                from: pmFrom,
                to: pmTo,
                color,
              });
              this.dispatchSelectionDecorations();
            }
          } catch (e) {
            this.onLog?.(
              'error',
              `Remote cursor failed: ${(e as Error).message}`,
            );
          }
        }
      } else if (event.type === 'unwatched') {
        const { clientID } = event.value;
        this.cursorManager!.removeCursor(clientID);
        this.remoteSelections.delete(clientID);
        this.dispatchSelectionDecorations();
      }
    });
    this.unsubscribePresence = unsubscribe;
  }

  private dispatchSelectionDecorations(): void {
    if (this.isComposing && this.selectionsOverlapComposingBlock()) {
      // Defer: a remote selection decoration touches the composing block,
      // which could insert <span> wrappers around the composing text node.
      this.hasPendingRemoteChanges = true;
      return;
    }
    this.applySelectionDecorations();
  }

  private applySelectionDecorations(): void {
    // Last line of defence for the `view.destroy(); binding.destroy();`
    // window: unlike the two sync paths this one has no try/catch, so a
    // dispatch into a destroyed view would escape into the caller — the SDK's
    // presence subscriber, or the deferred compositionend frame.
    if (!this.canTouchView()) return;
    const selections = Array.from(this.remoteSelections.values());
    const tr = this.view.state.tr;
    tr.setMeta(remoteSelectionsKey, selections);
    tr.setMeta('yorkie-remote', true);
    this.view.dispatch(tr);
  }

  /**
   * Whether the local selection may be published as presence. Evaluated at
   * publish time, not at construction, so a view whose `editable` prop flips
   * later is honored. Never affects the receive side.
   */
  private shouldPublishSelection(): boolean {
    if (this.publishSelection !== undefined) return this.publishSelection;
    return this.view.editable !== false;
  }

  /**
   * Wrap `view.update`, the single funnel every prop change passes through
   * (`setProps` delegates to it), and recheck publishing after each one.
   * A prop change produces no transaction, so a view whose `editable` flips
   * to false and is then left alone would otherwise never retract — the very
   * case retraction exists for. `setProps` on such a view is also how a host
   * turns the editor read-only, which makes this the primary trigger rather
   * than a fallback for the transaction-driven ones.
   */
  private setupEditableWatch(): void {
    const view = this.view as any;
    if (typeof view.update !== 'function') return;

    this.lastShouldPublish = this.shouldPublishSelection();
    const original = view.update.bind(view) as (props: any) => void;
    this.originalViewUpdate = original;
    this.installedViewUpdate = (props: any) => {
      original(props);
      this.reconcilePublishSelection();
    };
    view.update = this.installedViewUpdate;
  }

  /**
   * Publish or retract after `shouldPublishSelection()` changes answer.
   * A no-op while the answer is unchanged, so an unrelated prop update costs
   * no presence write.
   */
  private reconcilePublishSelection(): void {
    const shouldPublish = this.shouldPublishSelection();
    if (shouldPublish === this.lastShouldPublish) return;
    this.lastShouldPublish = shouldPublish;

    if (shouldPublish) {
      this.syncPresence();
    } else {
      this.retractSelection();
    }
  }

  /**
   * Drop an already-published selection from presence. Without this, a view
   * that stops publishing (e.g. `editable` flips to false) would leave its
   * last selection behind and every peer would keep rendering that cursor.
   */
  private retractSelection(): void {
    if (!this.hasPublishedSelection) return;
    this.hasPublishedSelection = false;

    try {
      this.doc.update((_root: any, presence: any) => {
        presence.set({ selection: undefined });
      });
    } catch (e) {
      this.onLog?.(
        'error',
        `Presence retraction failed: ${(e as Error).message}`,
      );
    }
  }

  private syncPresence(): void {
    if (!this.shouldPublishSelection()) {
      this.retractSelection();
      return;
    }

    const tree = this.getTree();
    if (!tree) return;

    try {
      const treeJSON = JSON.parse(tree.toJSON());
      const map = buildPositionMap(this.view.state.doc, treeJSON);
      const sel = this.view.state.selection;
      const yorkieFrom = pmPosToYorkieIdx(map, sel.from);
      const yorkieTo = pmPosToYorkieIdx(map, sel.to);
      this.doc.update((_root: any, presence: any) => {
        presence.set({
          selection: tree.indexRangeToPosRange([yorkieFrom, yorkieTo]),
        });
      });
      this.hasPublishedSelection = true;
    } catch (e) {
      this.onLog?.('error', `Presence sync failed: ${(e as Error).message}`);
    }
  }
}
