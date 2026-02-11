import type { EditorView } from 'prosemirror-view';
import type { Transaction } from 'prosemirror-state';
import { Tree } from '@yorkie-js/sdk';
import type { MarkMapping, YorkieProseMirrorOptions } from './types';
import { defaultMarkMapping, invertMapping } from './defaults';
import { pmToYorkie } from './convert';
import { syncToYorkie } from './diff';
import { syncToPM, syncToPMIncremental } from './sync';
import {
  buildPositionMap,
  pmPosToYorkieIdx,
  yorkieIdxToPmPos,
} from './position';
import { CursorManager } from './cursor';

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
  private isSyncing = false;
  private cursorManager: CursorManager | undefined = undefined;
  private onLog?: (type: 'local' | 'remote' | 'error', message: string) => void;
  private originalDispatchTransaction: ((tr: Transaction) => void) | undefined;
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
    this.markMapping = options.markMapping || defaultMarkMapping;
    this.elementToMarkMapping = invertMapping(this.markMapping);
    this.onLog = options.onLog;

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
        const yorkieDoc = pmToYorkie(this.view.state.doc, this.markMapping);
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
      );
      this.onLog?.('local', 'Loaded existing Yorkie tree into PM');
    }

    // Override dispatchTransaction for upstream sync
    this.setupDispatchTransaction();

    // Subscribe to remote changes for downstream sync
    this.setupDocSubscription();

    // Subscribe to presence for cursor display
    this.setupPresenceSubscription();

    // Set initial presence
    this.syncPresence();
  }

  /**
   * Clean up all subscriptions and overrides.
   */
  destroy(): void {
    this.unsubscribeDoc?.();
    this.unsubscribePresence?.();
    this.cursorManager?.destroy();

    // Restore original dispatchTransaction
    if (this.originalDispatchTransaction) {
      (this.view as any).props.dispatchTransaction =
        this.originalDispatchTransaction;
    }
  }

  private getTree(): any {
    return this.doc.getRoot()[this.treePath];
  }

  private setupDispatchTransaction(): void {
    this.originalDispatchTransaction = (
      this.view as any
    ).props.dispatchTransaction;

    (this.view as any).setProps({
      dispatchTransaction: (transaction: Transaction) => {
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
            );

            // Sync cursor position after content edit
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
            );
          } finally {
            this.isSyncing = false;
          }
        });
      },
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

      if (hasTreeOps) {
        this.onLog?.(
          'remote',
          `Received ${operations.length} remote operations`,
        );
        try {
          this.isSyncing = true;
          syncToPMIncremental(
            this.view,
            this.getTree(),
            this.view.state.schema,
            this.elementToMarkMapping,
            this.onLog,
          );
        } catch (e) {
          this.onLog?.(
            'error',
            `Downstream sync failed: ${(e as Error).message}`,
          );
        } finally {
          this.isSyncing = false;
        }
        this.cursorManager?.repositionAll(this.view);
      }
    });
    this.unsubscribeDoc = unsubscribe;
  }

  private setupPresenceSubscription(): void {
    if (!this.cursorManager) return;

    const unsubscribe = this.doc.subscribe('others' as any, (event: any) => {
      if (event.type === 'presence-changed') {
        const { clientID, presence } = event.value;
        if (presence.selection) {
          try {
            const tree = this.getTree();
            const [fromIdx, toIdx] = tree.posRangeToIndexRange([
              presence.selection[0],
              presence.selection[1],
            ]);
            const treeJSON = JSON.parse(tree.toJSON());
            const map = buildPositionMap(this.view.state.doc, treeJSON);
            const pmFrom = yorkieIdxToPmPos(map, Math.min(fromIdx, toIdx));
            this.cursorManager!.displayCursor(this.view, pmFrom, clientID);
          } catch (e) {
            this.onLog?.(
              'error',
              `Remote cursor failed: ${(e as Error).message}`,
            );
          }
        }
      }
    });
    this.unsubscribePresence = unsubscribe;
  }

  private syncPresence(): void {
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
    } catch (e) {
      this.onLog?.('error', `Presence sync failed: ${(e as Error).message}`);
    }
  }
}
