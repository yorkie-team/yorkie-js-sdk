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
  private desiredSyncMode: SyncMode = SyncMode.Realtime;
  private syncModeChangeQueue: Promise<void> = Promise.resolve();
  private composingBlockRange: { from: number; to: number } | undefined =
    undefined;
  private hasPendingRemoteChanges = false;
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

    if (options.cursors?.enabled) {
      this.cursorManager = new CursorManager(options.cursors);
    }
  }

  /**
   * Initialize the binding: load or create the Yorkie tree,
   * set up dispatchTransaction override and subscriptions.
   */
  initialize(): void {
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
    this.resumeRemoteSync();
    this.unsubscribeDoc?.();
    this.unsubscribePresence?.();
    this.cursorManager?.destroy();
    this.hasPendingRemoteChanges = false;
    this.composingBlockRange = undefined;

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
    // `update` above, so a later wrapper is left alone.
    if (
      this.installedDispatchTransaction &&
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
    this.syncModeChangeQueue = this.syncModeChangeQueue
      .then(() => this.client!.changeSyncMode(this.doc, nextMode))
      .then(() => {
        this.isSyncPaused = nextMode === SyncMode.RealtimeSyncOff;
      })
      .catch((e) => {
        // Revert desired mode to the last known effective state so callers can retry.
        this.desiredSyncMode = this.isSyncPaused
          ? SyncMode.RealtimeSyncOff
          : SyncMode.Realtime;
        this.onLog?.(
          'error',
          `Failed to change sync mode: ${(e as Error).message}`,
        );
      });
  }

  private pauseRemoteSync(): void {
    this.setRemoteSyncMode(SyncMode.RealtimeSyncOff);
  }

  private resumeRemoteSync(): void {
    this.setRemoteSyncMode(SyncMode.Realtime);
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
    if (!this.hasPendingRemoteChanges && !this.isSyncPaused) return;
    this.hasPendingRemoteChanges = false;

    // Wait for the browser to finish processing the compositionend event
    // and check that a new composition hasn't started immediately after.
    requestAnimationFrame(() => {
      if (this.isComposing) {
        // A new composition started (e.g. user continued typing Korean).
        // Re-defer until that composition ends.
        this.hasPendingRemoteChanges = true;
        return;
      }

      // Resume sync first so accumulated remote changes arrive
      this.resumeRemoteSync();

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
