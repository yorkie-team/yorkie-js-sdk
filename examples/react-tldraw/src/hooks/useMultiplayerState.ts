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
import _ from 'lodash';

import type { Options, YorkieDocType, YorkiePresenceType } from './types';

// Yorkie Client declaration
let client: yorkie.Client;

// Yorkie Document declaration
let doc: yorkie.Document<YorkieDocType, YorkiePresenceType>;

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

      const getUpdatedPropertyList = <T extends object>(
        source: T,
        target: T,
      ) => {
        return (Object.keys(source) as Array<keyof T>).filter(
          (key) => !_.isEqual(source[key], target[key]),
        );
      };

      Object.entries(shapes).forEach(([id, shape]) => {
        doc.update((root) => {
          if (!shape) {
            delete root.shapes[id];
          } else if (!root.shapes[id]) {
            root.shapes[id] = shape;
          } else {
            const updatedPropertyList = getUpdatedPropertyList(
              shape,
              root.shapes[id]!.toJS!(),
            );

            updatedPropertyList.forEach((key) => {
              const newValue = shape[key];
              (root.shapes[id][key] as typeof newValue) = newValue;
            });
          }
        });
      });

      Object.entries(bindings).forEach(([id, binding]) => {
        doc.update((root) => {
          if (!binding) {
            delete root.bindings[id];
          } else if (!root.bindings[id]) {
            root.bindings[id] = binding;
          } else {
            const updatedPropertyList = getUpdatedPropertyList(
              binding,
              root.bindings[id]!.toJS!(),
            );

            updatedPropertyList.forEach((key) => {
              const newValue = binding[key];
              (root.bindings[id][key] as typeof newValue) = newValue;
            });
          }
        });
      });

      // Should store app.document.assets which is global asset storage referenced by inner page assets
      // Document key for assets should be asset.id (string), not index
      Object.entries(app.assets).forEach(([, asset]) => {
        doc.update((root) => {
          if (!asset.id) {
            delete root.assets[asset.id];
          } else if (root.assets[asset.id]) {
            root.assets[asset.id] = asset;
          } else {
            const updatedPropertyList = getUpdatedPropertyList(
              asset,
              root.assets[asset.id]!.toJS!(),
            );

            updatedPropertyList.forEach((key) => {
              const newValue = asset[key];
              (root.assets[asset.id][key] as typeof newValue) = newValue;
            });
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

      doc.update((root, presence) => {
        presence.set({ tdUser: user });
      });
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
        root.shapes.toJSON!(),
      );
      const bindingRecord: Record<string, TDBinding> = JSON.parse(
        root.bindings.toJSON!(),
      );
      const assetRecord: Record<string, TDAsset> = JSON.parse(
        root.assets.toJSON!(),
      );

      // Replace page content with changed(propagated) records
      app?.replacePageContent(shapeRecord, bindingRecord, assetRecord);
    }

    let stillAlive = true;

    // Setup the document's storage and subscriptions
    async function setupDocument() {
      try {
        // 01. Create client with RPCAddr and options with apiKey if provided.
        //     Then activate client.
        const options: Options = {
          apiKey: import.meta.env.VITE_YORKIE_API_KEY,
          syncLoopDuration: 0,
          reconnectStreamDelay: 1000,
        };

        client = new yorkie.Client(
          import.meta.env.VITE_YORKIE_API_ADDR,
          options,
        );
        await client.activate();

        // 02. Create document with tldraw custom object type.
        doc = new yorkie.Document<YorkieDocType, YorkiePresenceType>(roomId);

        // 02-1. Subscribe peers-changed event and update tldraw users state
        doc.subscribe('my-presence', (event) => {
          if (event.type === yorkie.DocEventType.Initialized) {
            const allPeers = doc
              .getPresences()
              .map((peer) => peer.presence.tdUser);
            app?.updateUsers(allPeers);
          }
        });
        doc.subscribe('others', (event) => {
          // remove leaved users
          if (event.type === yorkie.DocEventType.Unwatched) {
            app?.removeUser(event.value.presence.tdUser.id);
          }

          // update users
          const allPeers = doc
            .getPresences()
            .map((peer) => peer.presence.tdUser);
          app?.updateUsers(allPeers);
        });

        // 02-2. Attach document with initialPresence.
        await client.attach(doc, {
          initialPresence: {
            tdUser: app?.currentUser,
          },
        });

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
