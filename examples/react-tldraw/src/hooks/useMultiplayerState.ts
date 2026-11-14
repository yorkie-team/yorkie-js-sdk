import { useCallback, useEffect, useRef, useState } from 'react';
import {
  TDUserStatus,
  TDAsset,
  TDBinding,
  TDShape,
  TDUser,
  TldrawApp,
} from '@tldraw/tldraw';
import { useThrottleCallback } from '@react-hook/throttle';
import * as yorkie from '@yorkie-js/sdk';
import { uniqueNamesGenerator, names } from 'unique-names-generator';
import { isEqual } from 'es-toolkit';

import type { YorkieDocType, YorkiePresenceType } from './types';

type Doc = yorkie.Document<YorkieDocType, YorkiePresenceType>;

export type Status = 'connecting' | 'connected' | 'offline' | 'error';
export type Peer = { id: string; name: string; color: string; isMe: boolean };

// Peer colours are picked from the client ID, so every tab agrees on them.
const peerColors = [
  '#fc8539',
  '#fdc433',
  '#23c176',
  '#3c9af1',
  '#f44954',
  '#855cf9',
];

function peerColor(clientID: string) {
  let hash = 0;
  for (const char of clientID) {
    hash = (hash * 31 + char.charCodeAt(0)) | 0;
  }
  return peerColors[Math.abs(hash) % peerColors.length];
}

/**
 * `replacePageContent` replaces the canvas with the shapes, bindings and
 * assets in the Yorkie document.
 */
function replacePageContent(app: TldrawApp, doc: Doc) {
  const root = doc.getRoot();
  app.replacePageContent(
    root.shapes.toJS() as Record<string, TDShape>,
    root.bindings.toJS() as Record<string, TDBinding>,
    root.assets.toJS() as Record<string, TDAsset>,
  );
}

/**
 * `updateRecord` writes only the properties that changed, so concurrent edits
 * to different properties of the same shape are both kept.
 */
function updateRecord<T extends object>(
  records: Record<string, yorkie.JSONObject<T>>,
  id: string,
  value: T | undefined,
) {
  if (!value) {
    delete records[id];
    return;
  }
  if (!records[id]) {
    records[id] = value as yorkie.JSONObject<T>;
    return;
  }
  const current = records[id].toJS() as T;
  for (const key of Object.keys(value) as Array<keyof T>) {
    if (!isEqual(value[key], current[key]) && value[key] !== undefined) {
      (records[id] as T)[key] = value[key];
    }
  }
}

/**
 * `useMultiplayerState` connects a tldraw app to a Yorkie document: shapes
 * and bindings live in the document root, and each user's cursor and
 * selection live in their presence.
 */
export function useMultiplayerState(roomId: string) {
  const [app, setApp] = useState<TldrawApp>();
  const [status, setStatus] = useState<Status>('connecting');
  const [peers, setPeers] = useState<Array<Peer>>([]);
  // The attached document, for the tldraw callbacks below. It is set only
  // while the effect that owns it is mounted.
  const docRef = useRef<Doc | undefined>(undefined);

  const onMount = useCallback(
    (app: TldrawApp) => {
      app.loadRoom(roomId);
      app.setIsLoading(true);
      // Undo and redo go through Yorkie's history (see onUndo), not tldraw's.
      app.pause();
      // tldraw creates its app in a state initializer, which StrictMode runs
      // twice in development; both apps call onMount. The first one is the
      // app tldraw renders, so keep it.
      setApp((current) => current ?? app);
    },
    [roomId],
  );

  const onUndo = useCallback(() => {
    const doc = docRef.current;
    if (app && doc?.history.canUndo()) {
      doc.history.undo();
      replacePageContent(app, doc);
    }
  }, [app]);

  const onRedo = useCallback(() => {
    const doc = docRef.current;
    if (app && doc?.history.canRedo()) {
      doc.history.redo();
      replacePageContent(app, doc);
    }
  }, [app]);

  // tldraw passes only the records each call changed, and the throttled
  // flush below sees only the last call's arguments. So every call adds its
  // records to these pending maps; a later value for the same ID wins, and
  // `undefined` means the record was deleted.
  const pendingShapes = useRef<Record<string, TDShape | undefined>>({});
  const pendingBindings = useRef<Record<string, TDBinding | undefined>>({});
  const pendingAssets = useRef<Record<string, TDAsset | undefined>>({});

  // Write the pending records to the document as one change.
  const writePending = useCallback(() => {
    const doc = docRef.current;
    const shapes = pendingShapes.current;
    const bindings = pendingBindings.current;
    const assets = pendingAssets.current;
    const isEmpty = [shapes, bindings, assets].every(
      (records) => Object.keys(records).length === 0,
    );
    if (!doc || isEmpty) return;

    pendingShapes.current = {};
    pendingBindings.current = {};
    pendingAssets.current = {};
    doc.update((root) => {
      for (const [id, shape] of Object.entries(shapes)) {
        updateRecord(root.shapes, id, shape);
      }
      for (const [id, binding] of Object.entries(bindings)) {
        updateRecord(root.bindings, id, binding);
      }
      for (const [id, asset] of Object.entries(assets)) {
        updateRecord(root.assets, id, asset);
      }
    });
  }, []);

  // The second argument is a rate in calls per second, not milliseconds:
  // write at most 60 times a second.
  const flushPage = useThrottleCallback(writePending, 60, false);

  const onChangePage = useCallback(
    (
      _app: TldrawApp,
      shapes: Record<string, TDShape | undefined>,
      bindings: Record<string, TDBinding | undefined>,
      assets: Record<string, TDAsset | undefined>,
    ) => {
      Object.assign(pendingShapes.current, shapes);
      Object.assign(pendingBindings.current, bindings);
      Object.assign(pendingAssets.current, assets);
      flushPage();
    },
    [flushPage],
  );

  // Share the cursor and selection through presence.
  const onChangePresence = useThrottleCallback(
    (_app: TldrawApp, user: TDUser) => {
      docRef.current?.update((_root, presence) => {
        presence.set({ tdUser: user });
      });
    },
    60,
    false,
  );

  useEffect(() => {
    if (!app) return;

    // The client and document belong to this effect run. In development,
    // StrictMode runs the effect twice, so each run cleans up its own.
    let cancelled = false;
    const client = new yorkie.Client({
      rpcAddr: import.meta.env.VITE_YORKIE_API_ADDR,
      apiKey: import.meta.env.VITE_YORKIE_API_KEY,
    });
    const doc: Doc = new yorkie.Document(roomId, {
      enableDevtools: import.meta.env.DEV,
    });

    const syncPeers = () => {
      const myID = client.getID();
      const presences = doc.getPresences().filter((p) => p.presence.tdUser);
      // A reloaded tab can briefly appear twice with the same tldraw user.
      const users = new Map(
        presences.map(({ presence }) => [presence.tdUser.id, presence.tdUser]),
      );
      app.updateUsers([...users.values()]);
      setPeers(
        presences.map(({ clientID, presence }) => ({
          id: clientID,
          name: String(presence.tdUser.metadata?.name ?? ''),
          color: presence.tdUser.color,
          isMe: clientID === myID,
        })),
      );
    };

    const unsubs = [
      doc.subscribe('presence', (event) => {
        if (event.type === yorkie.DocEventType.Unwatched) {
          app.removeUser(event.value.presence.tdUser.id);
        }
        syncPeers();
      }),
      doc.subscribe((event) => {
        if (event.type === 'remote-change') {
          // Write local edits still waiting for the next flush first, so
          // replacing the canvas with the document does not drop them.
          writePending();
          replacePageContent(app, doc);
        }
      }),
      doc.subscribe('connection', (event) => {
        setStatus(
          event.value === yorkie.StreamConnectionStatus.Connected
            ? 'connected'
            : 'offline',
        );
      }),
    ];

    const setup = async () => {
      await client.activate();
      if (cancelled) {
        // The effect was cleaned up while activating.
        await client.deactivate();
        return;
      }

      const user: TDUser = {
        id: app.currentUser!.id,
        point: [0, 0],
        color: peerColor(client.getID()!),
        status: TDUserStatus.Connected,
        activeShapes: [],
        selectedIds: [],
        metadata: { name: uniqueNamesGenerator({ dictionaries: [names] }) },
      };
      await client.attach(doc, {
        initialRoot: { shapes: {}, bindings: {}, assets: {} } as YorkieDocType,
        initialPresence: { tdUser: user },
      });
      if (cancelled) return;

      docRef.current = doc;
      replacePageContent(app, doc);
      syncPeers();
      app.zoomToFit();
      if (app.zoom > 1) app.resetZoom();
      app.setIsLoading(false);
    };

    setup().catch(() => {
      if (!cancelled) setStatus('error');
    });

    return () => {
      cancelled = true;
      for (const unsub of unsubs) unsub();
      if (docRef.current === doc) docRef.current = undefined;
      // Deactivating also detaches the document. While `activate` is still
      // in flight this is a no-op, and `setup` deactivates instead.
      client.deactivate().catch(() => {});
    };
  }, [app, roomId, writePending]);

  return {
    status,
    peers,
    onMount,
    onChangePage,
    onChangePresence,
    onUndo,
    onRedo,
  };
}
