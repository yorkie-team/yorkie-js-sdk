/* eslint-disable jsdoc/require-jsdoc */
import { useCallback, useEffect, useState } from 'react';
import {
  TDUserStatus,
  TDAsset,
  TDBinding,
  TDShape,
  TDUser,
  TldrawApp,
} from '@tldraw/tldraw';
import { useThrottleCallback } from '@react-hook/throttle';
import * as yorkie from 'yorkie-js-sdk';
import randomColor from 'randomcolor';
import { uniqueNamesGenerator, names } from 'unique-names-generator';

import type { Options, YorkieDocType } from './types';

// Yorkie Client declaration
let client: yorkie.Client<yorkie.Indexable>;

// Yorkie Document declaration
let doc: yorkie.Document<yorkie.Indexable>;

export function useMultiplayerState(roomId: string) {
  const [app, setApp] = useState<TldrawApp>();
  const [loading, setLoading] = useState(true);

  // Callbacks --------------

  const onMount = useCallback(
    (app: TldrawApp) => {
      app.loadRoom(roomId);
      app.setIsLoading(true);
      app.pause();
      setApp(app);

      const randomName = uniqueNamesGenerator({
        dictionaries: [names],
      });

      // On mount, create new user
      app.updateUsers([
        {
          id: app!.currentUser!.id,
          point: [0, 0],
          color: randomColor(),
          status: TDUserStatus.Connected,
          activeShapes: [],
          selectedIds: [],
          metadata: { name: randomName }, // <-- custom metadata
        },
      ]);
    },
    [roomId],
  );

  // Update Yorkie doc when the app's shapes change.
  // Prevent overloading yorkie update api call by throttle
  const onChangePage = useThrottleCallback(
    (
      app: TldrawApp,
      shapes: Record<string, TDShape | undefined>,
      bindings: Record<string, TDBinding | undefined>,
    ) => {
      if (!app || client === undefined || doc === undefined) return;

      doc.update((root) => {
        Object.entries(shapes).forEach(([id, shape]) => {
          if (!shape) {
            delete root.shapes[id];
          } else {
            root.shapes[id] = shape;
          }
        });

        Object.entries(bindings).forEach(([id, binding]) => {
          if (!binding) {
            delete root.bindings[id];
          } else {
            root.bindings[id] = binding;
          }
        });

        // Should store app.document.assets which is global asset storage referenced by inner page assets
        // Document key for assets should be asset.id (string), not index
        Object.entries(app.assets).forEach(([, asset]) => {
          if (!asset.id) {
            delete root.assets[asset.id];
          } else {
            root.assets[asset.id] = asset;
          }
        });
      });
    },
    60,
    false,
  );

  // Handle presence updates when the user's pointer / selection changes
  const onChangePresence = useThrottleCallback(
    (app: TldrawApp, user: TDUser) => {
      if (!app || client === undefined || !client.isActive()) return;

      client.updatePresence('user', user);
    },
    60,
    false,
  );

  // Document Changes --------

  useEffect(() => {
    if (!app) return;

    // Detach & deactive yorkie client before unload
    function handleDisconnect() {
      if (client === undefined || doc === undefined) return;

      client.detach(doc);
      client.deactivate();
    }

    window.addEventListener('beforeunload', handleDisconnect);

    // Subscribe to changes
    function handleChanges() {
      const root = doc.getRoot();

      // Parse proxy object to record
      const shapeRecord: Record<string, TDShape> = JSON.parse(
        root.shapes.toJSON(),
      );
      const bindingRecord: Record<string, TDBinding> = JSON.parse(
        root.bindings.toJSON(),
      );
      const assetRecord: Record<string, TDAsset> = JSON.parse(
        root.assets.toJSON(),
      );

      // Replace page content with changed(propagated) records
      app?.replacePageContent(shapeRecord, bindingRecord, assetRecord);
    }

    let stillAlive = true;

    // Setup the document's storage and subscriptions
    async function setupDocument() {
      try {
        // 01. Create client with RPCAddr(envoy) and options with presence and apiKey if provided.
        //     Then activate client.
        const options: Options = {
          apiKey: import.meta.env.VITE_YORKIE_API_KEY,
          presence: {
            user: app?.currentUser,
          },
          syncLoopDuration: 0,
          reconnectStreamDelay: 1000,
        };

        client = new yorkie.Client(
          import.meta.env.VITE_YORKIE_API_ADDR,
          options,
        );
        await client.activate();

        // 01-1. Subscribe peers-changed event and update tldraw users state
        client.subscribe((event) => {
          if (event.type !== 'peers-changed') return;

          const { type, peers } = event.value;
          // remove leaved users
          if (type === 'unwatched') {
            peers[doc.getKey()].map((peer) => {
              app?.removeUser(peer.presence.user.id);
            });
          }

          // update users
          const allPeers = client
            .getPeersByDocKey(doc.getKey())
            .map((peer) => peer.presence.user);
          app?.updateUsers(allPeers);
        });

        // 02. Create document with tldraw custom object type, then attach it into the client.
        doc = new yorkie.Document<YorkieDocType>(roomId);
        await client.attach(doc);

        // 03. Initialize document if document not exists.
        doc.update((root) => {
          if (!root.shapes) {
            root.shapes = {};
          }
          if (!root.bindings) {
            root.bindings = {};
          }
          if (!root.assets) {
            root.assets = {};
          }
        }, 'create shapes/bindings/assets object if not exists');

        // 04. Subscribe document event and handle changes.
        doc.subscribe((event) => {
          if (event.type === 'remote-change') {
            handleChanges();
          }
        });

        // 05. Sync client to sync document with other peers.
        await client.sync();

        if (stillAlive) {
          // Update the document with initial content
          handleChanges();

          // Zoom to fit the content & finish loading
          if (app) {
            app.zoomToFit();
            if (app.zoom > 1) {
              app.resetZoom();
            }
            app.setIsLoading(false);
          }

          setLoading(false);
        }
      } catch (e) {
        console.error(e);
      }
    }

    setupDocument();

    return () => {
      window.removeEventListener('beforeunload', handleDisconnect);
      stillAlive = false;
    };
  }, [app]);

  return {
    onMount,
    onChangePage,
    loading,
    onChangePresence,
  };
}
