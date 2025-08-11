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
import * as yorkie from '@yorkie-js/sdk';
import randomColor from 'randomcolor';
import { uniqueNamesGenerator, names } from 'unique-names-generator';
import _ from 'lodash';
import useUndoRedo from './useUndoRedo';

import type {
  Options,
  YorkieDocType,
  YorkiePresenceType,
  TlType,
} from './types';

// Yorkie Client declaration
let client: yorkie.Client;

// Yorkie Document declaration
let doc: yorkie.Document<YorkieDocType, YorkiePresenceType>;

export function useMultiplayerState(roomId: string) {
  const [app, setApp] = useState<TldrawApp>();
  const [loading, setLoading] = useState(true);
  const { push, undo, redo } = useUndoRedo();

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

  // undo

  const onUndo = useCallback(() => {
    doc.history.undo();
    handleChanges();
  }, [doc, roomId]);

  // redo

  const onRedo = useCallback(() => {
    doc.history.redo();
    handleChanges();
  }, [doc, roomId]);

  // Subscribe to changes
  function handleChanges() {
    const root = doc.getRoot();
    console.log('handleChange');

    // Parse proxy object to record
    const shapeRecord: Record<string, TDShape> = JSON.parse(
      root.shapes.toJSON!(),
    );
    console.log(`shapeRecond length: ${Object.keys(shapeRecord).length}`)
    const bindingRecord: Record<string, TDBinding> = JSON.parse(
      root.bindings.toJSON!(),
    );
    const assetRecord: Record<string, TDAsset> = JSON.parse(
      root.assets.toJSON!(),
    );

    // Replace page content with changed(propagated) records
    app?.replacePageContent(shapeRecord, bindingRecord, assetRecord);
  }

  // Update Yorkie doc when the app's shapes change.
  // Prevent overloading yorkie update api call by throttle
  const onChangePage = useThrottleCallback(
    (
      app: TldrawApp,
      shapes: Record<string, TDShape | undefined>,
      bindings: Record<string, TDBinding | undefined>,
    ) => {
      if (!app || client === undefined || doc === undefined) return;

      // Object that stores the latest state value of yorkie doc before the client changes
      const currentYorkieDocSnapshot: TlType = {
        shapes: {},
        bindings: {},
        assets: {},
      };

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
          const rootShapesToJS = root.shapes.toJS!();
          if (!shape) {
            currentYorkieDocSnapshot.shapes[id] = rootShapesToJS[id];
            delete root.shapes[id];
          } else if (!root.shapes[id]) {
            currentYorkieDocSnapshot.shapes[id] = undefined!;
            root.shapes[id] = shape;
          } else {
            const updatedPropertyList = getUpdatedPropertyList(
              shape,
              rootShapesToJS[id],
            );
            currentYorkieDocSnapshot.shapes[id] =
              {} as yorkie.JSONObject<TDShape>;
            updatedPropertyList.forEach((key) => {
              const newValue = shape[key];
              const snapshotValue = rootShapesToJS[id][key];
              (currentYorkieDocSnapshot.shapes[id][
                key
              ] as typeof snapshotValue) = snapshotValue;
              (root.shapes[id][key] as typeof newValue) = newValue;
            });
          }
        });
      });

      Object.entries(bindings).forEach(([id, binding]) => {
        doc.update((root) => {
          const rootBindingsToJS = root.bindings.toJS!();
          if (!binding) {
            currentYorkieDocSnapshot.bindings[id] = rootBindingsToJS[id];
            delete root.bindings[id];
          } else if (!root.bindings[id]) {
            currentYorkieDocSnapshot.bindings[id] = undefined!;
            root.bindings[id] = binding;
          } else {
            const updatedPropertyList = getUpdatedPropertyList(
              binding,
              rootBindingsToJS[id],
            );
            currentYorkieDocSnapshot.bindings[id] =
              {} as yorkie.JSONObject<TDBinding>;
            updatedPropertyList.forEach((key) => {
              const newValue = binding[key];
              const snapshotValue = rootBindingsToJS[id][key];
              (currentYorkieDocSnapshot.bindings[id][
                key
              ] as typeof snapshotValue) = snapshotValue;
              (root.bindings[id][key] as typeof newValue) = newValue;
            });
          }
        });
      });

      // Should store app.document.assets which is global asset storage referenced by inner page assets
      // Document key for assets should be asset.id (string), not index
      Object.entries(app.assets).forEach(([, asset]) => {
        doc.update((root) => {
          const rootAssetsToJS = root.assets.toJS!();
          currentYorkieDocSnapshot.assets[asset.id] = rootAssetsToJS[asset.id];
          if (!asset.id) {
            delete root.assets[asset.id];
          } else if (!root.assets[asset.id]) {
            root.assets[asset.id] = asset;
          } else {
            const updatedPropertyList = getUpdatedPropertyList(
              asset,
              rootAssetsToJS[asset.id],
            );

            updatedPropertyList.forEach((key) => {
              const newValue = asset[key];
              (root.assets[asset.id][key] as typeof newValue) = newValue;
            });
          }
        });
      });

      // Command object for action
      // Undo, redo work the same way
      // undo(): Save yorkie doc's state before returning
      // redo(): Save yorkie doc's state before moving forward
      const command = {
        snapshot: currentYorkieDocSnapshot,
        undo: () => {
          const currentYorkieDocSnapshot: TlType = {
            shapes: {},
            bindings: {},
            assets: {},
          };
          const snapshot = command.snapshot;
          Object.entries(snapshot.shapes).forEach(([id, shape]) => {
            doc.update((root) => {
              const rootShapesToJS = root.shapes.toJS!();
              if (!shape) {
                currentYorkieDocSnapshot.shapes[id] = rootShapesToJS[id];
                delete root.shapes[id];
              } else if (!root.shapes.toJS!()[id]) {
                currentYorkieDocSnapshot.shapes[id] = undefined!;
                if (shape.id) root.shapes[id] = shape;
              } else {
                currentYorkieDocSnapshot.shapes[id] =
                  {} as yorkie.JSONObject<TDShape>;
                (
                  Object.keys(snapshot.shapes[id]) as Array<keyof TDShape>
                ).forEach((key) => {
                  const snapshotValue = snapshot.shapes[id][key];
                  const newSnapshotValue = rootShapesToJS[id][key];

                  (currentYorkieDocSnapshot.shapes[id][
                    key
                  ] as typeof newSnapshotValue) = newSnapshotValue;
                  (root.shapes[id][key] as typeof snapshotValue) =
                    snapshotValue;
                });
              }
            });
          });

          Object.entries(snapshot.bindings).forEach(([id, binding]) => {
            doc.update((root) => {
              const rootBindingsToJs = root.bindings.toJS!();
              if (!binding) {
                currentYorkieDocSnapshot.bindings[id] = rootBindingsToJs[id];
                delete root.bindings[id];
              } else if (!root.bindings.toJS!()[id]) {
                currentYorkieDocSnapshot.bindings[id] = undefined!;
                if (binding.id) root.bindings[id] = binding;
              } else {
                currentYorkieDocSnapshot.bindings[id] =
                  {} as yorkie.JSONObject<TDBinding>;
                (
                  Object.keys(snapshot.bindings[id]) as Array<keyof TDBinding>
                ).forEach((key) => {
                  const snapshotValue = snapshot.bindings[id][key];
                  const newSnapshotValue = rootBindingsToJs[id][key];

                  (currentYorkieDocSnapshot.bindings[id][
                    key
                  ] as typeof newSnapshotValue) = newSnapshotValue;
                  (root.bindings[id][key] as typeof snapshotValue) =
                    snapshotValue;
                });
              }
            });
          });

          Object.entries(snapshot.assets).forEach(([, asset]) => {
            doc.update((root) => {
              const rootAssetsToJs = root.assets.toJS!();
              currentYorkieDocSnapshot.assets[asset.id] =
                rootAssetsToJs[asset.id];
              if (!asset.id) {
                delete root.assets[asset.id];
              } else if (!root.assets.toJS!()[asset.id]) {
                root.assets[asset.id] = asset;
              } else {
                const updatedPropertyList = getUpdatedPropertyList(
                  asset,
                  rootAssetsToJs[asset.id],
                );

                updatedPropertyList.forEach((key) => {
                  const newValue = asset[key];
                  (root.assets[asset.id][key] as typeof newValue) = newValue;
                });
              }
            });
          });
          command.snapshot = currentYorkieDocSnapshot;
          // Reflect changes locally
          handleChanges();
        },
        redo: () => {
          command.undo();
          handleChanges();
        },
      };

      // Create History
      push(command);
    },
    20,
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

    let stillAlive = true;

    // Setup the document's storage and subscriptions
    async function setupDocument() {
      try {
        // 01. Create client with RPCAddr(envoy) and options with apiKey if provided.
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
    onUndo,
    onRedo,
  };
}