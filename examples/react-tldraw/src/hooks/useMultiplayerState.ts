import { useCallback, useEffect, useState, useRef } from 'react';
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

import type { YorkieDocType, YorkiePresenceType } from './types';

/**
 * Custom hook for managing multiplayer state in Tldraw using Yorkie
 * Handles real-time collaboration, presence updates, and undo/redo functionality
 */
export function useMultiplayerState(roomId: string) {
  const [app, setApp] = useState<TldrawApp>();
  const [loading, setLoading] = useState(true);

  const clientRef = useRef<yorkie.Client>();
  const docRef = useRef<yorkie.Document<YorkieDocType, YorkiePresenceType>>();

  /**
   * Handles changes from remote users and updates the local Tldraw app
   * Parses document content and replaces page content in the app
   */
  const handleChanges = useCallback(() => {
    if (!docRef.current || !app) return;

    const root = docRef.current.getRoot();

    try {
      const shapesJson = root.shapes.toJSON?.();
      const bindingsJson = root.bindings.toJSON?.();
      const assetsJson = root.assets.toJSON?.();

      if (!shapesJson || !bindingsJson || !assetsJson) {
        console.warn('Document content is not yet initialized');
        return;
      }

      const shapeRecord: Record<string, TDShape> = JSON.parse(shapesJson);
      const bindingRecord: Record<string, TDBinding> = JSON.parse(bindingsJson);
      const assetRecord: Record<string, TDAsset> = JSON.parse(assetsJson);

      app.replacePageContent(shapeRecord, bindingRecord, assetRecord);
    } catch (error) {
      console.error('Error parsing document content:', error);
    }
  }, [app]);

  /**
   * Utility function to get the list of properties that have changed
   * between source and target objects using deep equality comparison
   */
  const getUpdatedPropertyList = useCallback(
    <T extends object>(source: T, target: T) => {
      return (Object.keys(source) as Array<keyof T>).filter(
        (key) => !_.isEqual(source[key], target[key]),
      );
    },
    [],
  );

  /**
   * Callback for when Tldraw app is mounted
   * Initializes the room, sets loading state, and creates initial user
   */
  const onMount = useCallback(
    (app: TldrawApp) => {
      app.loadRoom(roomId);
      app.setIsLoading(true);
      app.pause();
      setApp(app);

      const randomName = uniqueNamesGenerator({
        dictionaries: [names],
      });

      app.updateUsers([
        {
          id: app!.currentUser!.id,
          point: [0, 0],
          color: randomColor(),
          status: TDUserStatus.Connected,
          activeShapes: [],
          selectedIds: [],
          metadata: { name: randomName },
        },
      ]);
    },
    [roomId],
  );

  /** Handle undo operation using Yorkie's history API */
  const onUndo = useCallback(() => {
    if (docRef.current?.history.canUndo()) {
      docRef.current.history.undo();
      handleChanges();
    }
  }, [handleChanges]);

  /** Handle redo operation using Yorkie's history API */
  const onRedo = useCallback(() => {
    if (docRef.current?.history.canRedo()) {
      docRef.current.history.redo();
      handleChanges();
    }
  }, [handleChanges]);

  /**
   * Throttled callback for handling page content changes
   * Updates shapes, bindings, and assets in the Yorkie document
   * Throttled to 60ms to prevent excessive updates
   */
  const onChangePage = useThrottleCallback(
    (
      app: TldrawApp,
      shapes: Record<string, TDShape | undefined>,
      bindings: Record<string, TDBinding | undefined>,
    ) => {
      if (!app || !clientRef.current || !docRef.current) return;

      // Update shapes in the document
      for (const [id, shape] of Object.entries(shapes)) {
        docRef.current.update((root: YorkieDocType) => {
          if (!shape) {
            delete root.shapes[id];
          } else if (!root.shapes[id]) {
            root.shapes[id] = shape as yorkie.JSONObject<TDShape>;
          } else {
            const updatedPropertyList = getUpdatedPropertyList(
              shape,
              root.shapes[id].toJS(),
            );

            for (const key of updatedPropertyList) {
              (root.shapes[id] as any)[key] = shape[key];
            }
          }
        });
      }

      // Update bindings in the document
      for (const [id, binding] of Object.entries(bindings)) {
        docRef.current.update((root: YorkieDocType) => {
          if (!binding) {
            delete root.bindings[id];
          } else if (!root.bindings[id]) {
            root.bindings[id] = binding as yorkie.JSONObject<TDBinding>;
          } else {
            const updatedPropertyList = getUpdatedPropertyList(
              binding,
              root.bindings[id].toJS(),
            );

            for (const key of updatedPropertyList) {
              const newValue = binding[key];
              if (newValue !== undefined) {
                (root.bindings[id] as any)[key] = newValue;
              }
            }
          }
        });
      }

      /**
       * Update assets in the document
       * Assets are stored globally in app.assets and referenced by inner page assets
       * Document keys for assets use asset.id (string), not array indices
       */
      for (const [, asset] of Object.entries(app.assets)) {
        docRef.current.update((root: YorkieDocType) => {
          if (!asset.id) {
            // Skip assets without valid IDs
            return;
          } else if (!root.assets[asset.id]) {
            root.assets[asset.id] = asset as yorkie.JSONObject<TDAsset>;
          } else {
            const updatedPropertyList = getUpdatedPropertyList(
              asset,
              root.assets[asset.id].toJS(),
            );

            for (const key of updatedPropertyList) {
              (root.assets[asset.id] as any)[key] = asset[key];
            }
          }
        });
      }
    },
    60,
    false,
  );

  /**
   * Throttled callback for handling user presence updates
   * Updates cursor position, selection, and other user state
   * Throttled to 60ms to prevent excessive presence updates
   */
  const onChangePresence = useThrottleCallback(
    (app: TldrawApp, user: TDUser) => {
      if (!app || !clientRef.current?.isActive() || !docRef.current) return;

      docRef.current.update((root, presence) => {
        presence.set({ tdUser: user });
      });
    },
    60,
    false,
  );

  useEffect(() => {
    if (!app) return;

    const unsubs: Array<Function> = [];
    let stillAlive = true;

    /**
     * Set up document change subscription for remote updates
     * Triggers handleChanges when remote changes are received
     */
    const setupDocumentSubscription = (
      doc: yorkie.Document<YorkieDocType, YorkiePresenceType>,
    ) => {
      doc.subscribe((event) => {
        if (event.type === 'remote-change') {
          handleChanges();
        }
      });
    };

    /**
     * Finalize setup after document is attached
     * Syncs data, handles initial zoom, and sets loading state
     */
    const finalizeSetup = async (client: yorkie.Client) => {
      await client.sync();

      if (stillAlive) {
        handleChanges();
        if (app) {
          app.zoomToFit();
          if (app.zoom > 1) {
            app.resetZoom();
          }
          app.setIsLoading(false);
        }

        setLoading(false);
      }
    };

    /**
     * Main setup function that orchestrates the entire initialization process
     * Creates document and client, sets up subscriptions, and handles errors
     */
    const setupDocument = async () => {
      try {
        // 01. Activate Yorkie client.
        const client = new yorkie.Client({
          rpcAddr: import.meta.env.VITE_YORKIE_API_ADDR,
          apiKey: import.meta.env.VITE_YORKIE_API_KEY,
          syncLoopDuration: 0,
          reconnectStreamDelay: 1000,
        });
        await client.activate();
        clientRef.current = client;

        // 02. Create document and subscribe to events.
        const doc = new yorkie.Document<YorkieDocType, YorkiePresenceType>(
          roomId,
          { enableDevtools: true },
        );
        docRef.current = doc;
        unsubs.push(
          doc.subscribe('my-presence', (event) => {
            if (event.type === yorkie.DocEventType.Initialized) {
              const allPeers = doc
                .getPresences()
                .map((peer) => peer.presence.tdUser);
              app?.updateUsers(allPeers);
            }
          }),
        );

        unsubs.push(
          doc.subscribe('others', (event) => {
            if (event.type === yorkie.DocEventType.Unwatched) {
              app?.removeUser(event.value.presence.tdUser.id);
            }

            const allPeers = doc
              .getPresences()
              .map((peer) => peer.presence.tdUser);
            app?.updateUsers(allPeers);
          }),
        );

        unsubs.push(
          doc.subscribe((event) => {
            if (event.type === 'remote-change') {
              handleChanges();
            }
          }),
        );

        await client.attach(doc, {
          initialRoot: {
            shapes: {},
            bindings: {},
            assets: {},
          } as YorkieDocType,
          initialPresence: app?.currentUser
            ? { tdUser: app.currentUser }
            : undefined,
        });

        await finalizeSetup(client);
      } catch (error) {
        console.error('Error setting up document:', error);
        setLoading(false);
      }
    };

    setupDocument();

    // Cleanup function to properly dispose of resources
    return () => {
      stillAlive = false;
      for (const unsub of unsubs) {
        unsub();
      }

      const cleanup = async () => {
        try {
          if (docRef.current && clientRef.current) {
            await clientRef.current.detach(docRef.current);
          }
          if (clientRef.current) {
            await clientRef.current.deactivate();
          }
        } catch (error) {
          console.error('Error during cleanup:', error);
        } finally {
          docRef.current = undefined;
          clientRef.current = undefined;
        }
      };
      cleanup();
    };
  }, [app, handleChanges]);

  return {
    onMount,
    onChangePage,
    loading,
    onChangePresence,
    onUndo,
    onRedo,
  };
}
