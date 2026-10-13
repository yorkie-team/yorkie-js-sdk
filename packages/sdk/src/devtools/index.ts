/*
 * Copyright 2024 The Yorkie Authors. All rights reserved.
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

import { Document, Indexable } from '@yorkie-js/sdk/src/yorkie';
import { logger } from '@yorkie-js/sdk/src/util/logger';
import type * as DevTools from './protocol';
import { EventSourceDevPanel, EventSourceSDK } from './protocol';
import {
  DocEventsForReplay,
  DocNotification,
  DocNotificationEvent,
  isDocEventForReplay,
  isDocNotificationEvent,
} from './types';
import { DocEventType, DocStatus } from '@yorkie-js/sdk/src/document/document';

type DevtoolsStatus = 'connected' | 'disconnected' | 'synced';

/**
 * `devtoolsStatusByDocKey` stores the panel connection status of each document.
 * The panel reaches every document on the page through a single window message
 * channel, so the status cannot be shared across documents.
 */
const devtoolsStatusByDocKey = new Map<string, DevtoolsStatus>();

/**
 * `teardownByDoc` holds what every `setupDevtools` call has to give back: the
 * document subscription, the window listener and the recording. They are kept
 * per Document rather than per key, because one key can have several Documents
 * behind it and releasing one of them must not release the others.
 */
const teardownByDoc = new WeakMap<object, () => void>();

/**
 * `recordingResetByDoc` holds, per Document, the way to throw its replay
 * recording away. See `resetDevtoolsRecording`.
 */
const recordingResetByDoc = new WeakMap<
  object,
  (baseline?: DocEventsForReplay) => void
>();

/**
 * `Registration` is one `setupDevtools` call. Each keeps its own recording, so
 * handing a key from one Document to another hands over a complete history
 * instead of whatever the previous holder had collected.
 */
type Registration = {
  token: object;
  events: Array<DocEventsForReplay>;
  notifications: Array<DocNotification>;
  attached: boolean;
};

/**
 * `registrationsByDocKey` holds every Document that has claimed a key on this
 * page, oldest first.
 */
const registrationsByDocKey = new Map<string, Array<Registration>>();

/**
 * `ownerByDocKey` names the registration that speaks for a key: the protocol
 * identifies a document by its key alone, so only one of them can answer the
 * panel and fill the replay buffer.
 *
 * NOTE(chacha912): The key goes to the Document that is *attached*, not to
 * the one built most recently. A page under React's development double-render
 * builds two Documents per key and throws one away, and which of the two is
 * built last is decided by whichever token request happens to return first.
 * Picking by construction order hands the panel the discarded Document about
 * half the time, and the user sees a document that never changes again.
 * Construction order still decides between Documents that never attach.
 */
const ownerByDocKey = new Map<string, object>();

/**
 * `sendFullSync` hands the panel the whole recording of the given key. It is
 * sent when the panel asks, and again whenever the recording behind the key is
 * replaced, because the panel has no way to notice that on its own.
 */
function sendFullSync(docKey: string): void {
  if (getDevtoolsStatus(docKey) !== 'synced') {
    return;
  }

  sendToPanel({
    msg: 'doc::sync::full',
    docKey,
    events: docEventsForReplayByDocKey.get(docKey) || [],
  });
  sendToPanel({
    msg: 'doc::notification::full',
    docKey,
    notifications: docNotificationsByDocKey.get(docKey) || [],
  });
}

/**
 * `ownerOf` returns the registration currently speaking for the given key.
 */
function ownerOf(docKey: string): Registration | undefined {
  const token = ownerByDocKey.get(docKey);
  return (registrationsByDocKey.get(docKey) || []).find(
    (registration) => registration.token === token,
  );
}

/**
 * `claimKey` makes the given registration the one that answers for the key and
 * publishes its recording. It reports whether the owner actually changed.
 */
function claimKey(docKey: string, registration: Registration): boolean {
  if (ownerByDocKey.get(docKey) === registration.token) {
    return false;
  }

  ownerByDocKey.set(docKey, registration.token);
  docEventsForReplayByDocKey.set(docKey, registration.events);
  docNotificationsByDocKey.set(docKey, registration.notifications);
  return true;
}

/**
 * `releaseKey` gives up a key the leaving registration held, handing it to
 * another Document of the same key that is still attached. It reports whether
 * a successor took over.
 */
function releaseKey(docKey: string, registration: Registration): boolean {
  if (ownerByDocKey.get(docKey) !== registration.token) {
    // NOTE(chacha912): Another Document already speaks for the key, so the
    // panel keeps what it is showing. A key nobody holds is a key whose
    // Documents have all left, and it has nothing left to announce.
    return ownerByDocKey.has(docKey);
  }

  const successor = (registrationsByDocKey.get(docKey) || [])
    .filter((other) => other !== registration && other.attached)
    .pop();
  if (!successor) {
    ownerByDocKey.delete(docKey);
    docEventsForReplayByDocKey.delete(docKey);
    docNotificationsByDocKey.delete(docKey);
    return false;
  }

  claimKey(docKey, successor);
  return true;
}

/**
 * `getDevtoolsStatus` returns the panel connection status of the given
 * document.
 */
function getDevtoolsStatus(docKey: string): DevtoolsStatus {
  return devtoolsStatusByDocKey.get(docKey) || 'disconnected';
}

/**
 * `isPanelConnected` returns whether the panel is attached to any document on
 * this page.
 */
function isPanelConnected(): boolean {
  for (const status of devtoolsStatusByDocKey.values()) {
    if (status !== 'disconnected') {
      return true;
    }
  }

  return false;
}

/**
 * `docEventsForReplayByDocKey` stores all events in the document for replaying
 * (time-traveling feature) in Devtools. Later, external storage such as
 * IndexedDB will be used.
 */
const docEventsForReplayByDocKey = new Map<string, Array<DocEventsForReplay>>();
declare global {
  interface Window {
    docEventsForReplayByDocKey: Map<string, Array<DocEventsForReplay>>;
  }
}
if (typeof window !== 'undefined') {
  window.docEventsForReplayByDocKey = docEventsForReplayByDocKey;
}

/**
 * `docNotificationsByDocKey` stores the events that cannot be replayed, such as
 * `LocalChangesDropped`. They are kept beside `docEventsForReplayByDocKey`
 * because `Document.applyDocEventsForReplay` has no case for them and the
 * panel's time travel is an index over the replay list.
 */
const docNotificationsByDocKey = new Map<string, Array<DocNotification>>();

/**
 * `repeatKeyOf` returns a value identifying a notification that a retry loop
 * can republish unchanged. Two records sharing a key describe the same
 * ongoing condition, not two things that happened.
 *
 * `LocalChangesDropped` deliberately has no key: every one of them reports a
 * distinct set of discarded changes and must always be recorded.
 *
 * NOTE(hackerwins): `DocEventType` is read lazily. `document.ts` imports this
 * module, so the enum is still uninitialized while this one is evaluated.
 */
function repeatKeyOf(event: DocNotificationEvent): string | undefined {
  switch (event.type) {
    case DocEventType.SyncStatusChanged:
    case DocEventType.ConnectionChanged:
      return `${event.type}:${event.value}`;
    case DocEventType.AuthError:
      return `${event.type}:${event.value.method}:${event.value.reason}`;
    case DocEventType.EpochMismatch:
      return `${event.type}:${event.value.method}`;
    case DocEventType.WriteRejected:
      return `${event.type}:${event.value.method}:${event.value.code}`;
    default:
      return undefined;
  }
}

/**
 * `isStatusRepeat` reports whether the given event restates the condition
 * already held by the most recent record of the same type.
 *
 * Without this the retry loops bury everything else. A document holding an
 * invalid token publishes `AuthError` from the sync loop every
 * `retrySyncLoopDelay` and again from the watch loop every
 * `reconnectStreamDelay`, and the sync loop republishes `SyncStatusChanged`
 * on every round it runs. Minutes of that would leave a single
 * `LocalChangesDropped` as one row among thousands.
 */
function isStatusRepeat(
  recorded: Array<DocNotification>,
  event: DocNotificationEvent,
  pending: Array<DocNotification>,
): boolean {
  const key = repeatKeyOf(event);
  if (key === undefined) {
    return false;
  }

  for (const list of [pending, recorded]) {
    for (let i = list.length - 1; i >= 0; i--) {
      const previous = list[i].event;
      if (previous.type === event.type) {
        return repeatKeyOf(previous) === key;
      }
    }
  }

  return false;
}

/**
 * `sendToPanel` sends a message to the devtools panel.
 */
function sendToPanel(
  message: DevTools.SDKToPanelMessage,
  options?: { force: boolean },
): void {
  const connected =
    'docKey' in message && getDevtoolsStatus(message.docKey) !== 'disconnected';
  if (!(options?.force || connected)) {
    return;
  }

  window.postMessage(
    {
      source: EventSourceSDK,
      ...message,
    },
    '*',
  );
}

/**
 * `setupDevtools` sets up the devtools integration. It sends messages to the
 * devtools panel when a document is available, when a document is subscribed,
 * and when a document is changed.
 */
export function setupDevtools<T, P extends Indexable>(
  doc: Document<T, P>,
): void {
  if (!doc.isEnableDevtools() || typeof window === 'undefined') {
    return;
  }

  // NOTE(chacha912): A document key can be claimed twice on one page: a
  // component remounts, or a page swaps documents while the old one is still
  // being torn down. Every claim records on its own, and `ownerByDocKey`
  // decides which recording the panel sees.
  const registration: Registration = {
    token: {},
    events: [],
    notifications: [],
    attached: false,
  };
  const registrations = registrationsByDocKey.get(doc.getKey()) || [];
  registrations.push(registration);
  registrationsByDocKey.set(doc.getKey(), registrations);

  // NOTE(chacha912): A Document that has attached is the one the page is
  // working with, so a newly built Document does not displace it. Between
  // Documents that never attach, the newest still wins: the older one is a
  // remount leftover the application can no longer reach.
  if (!ownerOf(doc.getKey())?.attached) {
    claimKey(doc.getKey(), registration);
  }
  // NOTE(hackerwins): A re-claim replaces the Document behind the key, not the
  // panel's attachment to it. Zeroing the status here would make
  // `isPanelConnected` report false on a single-document page, so the SDK would
  // send `refresh-devtools` and wipe the view the re-announce path exists to
  // preserve.
  if (!devtoolsStatusByDocKey.has(doc.getKey())) {
    devtoolsStatusByDocKey.set(doc.getKey(), 'disconnected');
  }

  const isOwner = () => ownerByDocKey.get(doc.getKey()) === registration.token;

  /**
   * `answersForKey` reports whether this registration is the one to answer the
   * panel about the key. The owner answers while there is one. A key whose
   * Documents have all detached has no owner at all, and a `devtools::subscribe`
   * that nobody answers leaves the panel waiting with neither a full sync nor
   * an error, so the newest registration speaks for such a key until a Document
   * attaches again.
   */
  const answersForKey = () => {
    if (ownerByDocKey.has(doc.getKey())) {
      return isOwner();
    }

    const registered = registrationsByDocKey.get(doc.getKey()) || [];
    return registered[registered.length - 1] === registration;
  };

  const unsub = doc.subscribe('all', (events) => {
    // NOTE(hackerwins): One transaction can carry both replayable events and
    // events that cannot be replayed, so the batch is split by hand.
    // `events.filter(isDocEventForReplay)` does not narrow here: this callback
    // receives `DocEvents<P>` with `P` still an unresolved type parameter,
    // while the guard is declared over `DocEvent<Indexable, OpInfo>`.
    const eventsForReplay: DocEventsForReplay = [];
    const notifications: Array<DocNotification> = [];
    for (const event of events) {
      if (isDocEventForReplay(event)) {
        eventsForReplay.push(event);
      } else if (isDocNotificationEvent(event)) {
        if (isStatusRepeat(registration.notifications, event, notifications)) {
          continue;
        }
        notifications.push({ event, timestamp: Date.now() });
      }
    }

    // NOTE(hackerwins): The replay half of the batch goes first, so that the
    // document state the panel replays never lags behind a notification that
    // refers to it. The two lists are rendered separately anyway, so the
    // interleaving within one transaction is not observable.
    if (eventsForReplay.length > 0) {
      registration.events.push(eventsForReplay);
      if (isOwner() && getDevtoolsStatus(doc.getKey()) === 'synced') {
        sendToPanel({
          msg: 'doc::sync::partial',
          docKey: doc.getKey(),
          event: eventsForReplay,
        });
      }
    }

    for (const notification of notifications) {
      registration.notifications.push(notification);
      if (isOwner() && getDevtoolsStatus(doc.getKey()) === 'synced') {
        sendToPanel({
          msg: 'doc::notification::partial',
          docKey: doc.getKey(),
          notification,
        });
      }
    }

    // NOTE(chacha912): A page that swaps documents as the user navigates —
    // one document per page of a board, say — leaves every document it has
    // ever opened registered here. Without this the panel keeps offering all
    // of them and the user picks a detached one that will never move again.
    // The recording survives, so attaching again brings the key back.
    for (const event of events) {
      if (event.type !== DocEventType.StatusChanged) {
        continue;
      }
      const attached = event.value.status === DocStatus.Attached;
      registration.attached = attached;
      if (attached) {
        // NOTE(chacha912): Two Documents of one key can be attached at once: a
        // remount whose predecessor has not finished detaching, or two clients
        // collaborating inside a single page. The one that already holds the
        // key keeps it, because taking it over here would replace the history
        // the user is watching with this Document's empty recording.
        const owner = ownerOf(doc.getKey());
        if (owner && owner !== registration && owner.attached) {
          continue;
        }

        claimKey(doc.getKey(), registration);
        sendToPanel({ msg: 'doc::available', docKey: doc.getKey() });
        // NOTE(chacha912): The panel may have subscribed to this key while
        // the document was still attaching, and answered with the empty log it
        // had at that moment. It cannot tell that the log it holds is the wrong
        // one, so the recording is handed over here rather than waiting for the
        // panel to ask again.
        sendFullSync(doc.getKey());
        continue;
      }

      // NOTE(chacha912): A page that shows one document at a time leaves every
      // document it has opened registered here. Announcing them all gives the
      // user a list of documents that will never move again, so a key that has
      // no attached Document behind it goes quiet until one attaches.
      const successor = releaseKey(doc.getKey(), registration);
      sendToPanel({
        msg: successor ? 'doc::available' : 'doc::unavailable',
        docKey: doc.getKey(),
      });
      if (successor) {
        sendFullSync(doc.getKey());
      }
    }
  });

  // NOTE(chacha912): Send initial message, in case the devtool panel is already open.
  // NOTE(hackerwins): When the panel is already attached to another document on
  // this page, announcing this document is enough. Asking for a refresh would
  // throw away the view the user is currently looking at.
  if (isPanelConnected()) {
    sendToPanel(
      {
        msg: 'doc::available',
        docKey: doc.getKey(),
      },
      { force: true },
    );
  } else {
    sendToPanel(
      {
        msg: 'refresh-devtools',
      },
      { force: true },
    );
  }

  const handleMessage = (
    event: MessageEvent<DevTools.FullPanelToSDKMessage>,
  ) => {
    // NOTE(hackerwins): `message` events also arrive from child frames. Only
    // this window's own posts come from the panel relay; a third-party iframe
    // must not be able to drive the bridge.
    if (event.source !== window || event.data?.source !== EventSourceDevPanel) {
      return;
    }

    const message = event.data;
    switch (message.msg) {
      case 'devtools::connect':
        // NOTE(hackerwins): The panel clears its state before sending
        // `devtools::connect`, so every document has to announce itself
        // again, including one that is already connected.
        devtoolsStatusByDocKey.set(doc.getKey(), 'connected');
        if (!isOwner()) {
          break;
        }
        sendToPanel({
          msg: 'doc::available',
          docKey: doc.getKey(),
        });
        logger.info(`[YD] Devtools connected. Doc: ${doc.getKey()}`);
        break;
      case 'devtools::disconnect':
        devtoolsStatusByDocKey.set(doc.getKey(), 'disconnected');
        logger.info(`[YD] Devtools disconnected. Doc: ${doc.getKey()}`);
        break;
      case 'devtools::subscribe':
        // NOTE(hackerwins): The panel watches one document at a time, so
        // subscribing to another document stops the stream of this one. This
        // runs whoever owns the key: a registration that no longer speaks for
        // it still has to stop streaming.
        if (message.docKey !== doc.getKey()) {
          if (getDevtoolsStatus(doc.getKey()) === 'synced') {
            devtoolsStatusByDocKey.set(doc.getKey(), 'connected');
          }
          break;
        }
        if (!answersForKey()) {
          break;
        }

        devtoolsStatusByDocKey.set(doc.getKey(), 'synced');
        sendFullSync(doc.getKey());
        logger.info(`[YD] Devtools subscribed. Doc: ${doc.getKey()}`);
        break;
    }
  };
  window.addEventListener('message', handleMessage);

  // NOTE(chacha912): A Document that stays on the page keeps its subscription
  // and its recording even while detached, so that attaching again brings the
  // history back. A Document the page has thrown away has to give them back:
  // the bindings build a new Document under the same key whenever their effect
  // re-runs, and a registration nobody releases leaves a window listener, a
  // subscription and a recording that grows with every event behind on each
  // remount. `teardownDevtools` is how the holder of the Document says so.
  recordingResetByDoc.set(doc, (baseline?: DocEventsForReplay) => {
    // The array is the one `claimKey` handed to `docEventsForReplayByDocKey`,
    // so it is emptied in place rather than replaced.
    registration.events.length = 0;
    if (baseline?.length) {
      registration.events.push(baseline);
    }
    if (isOwner()) {
      sendFullSync(doc.getKey());
    }
  });

  teardownByDoc.set(doc, () => {
    teardownByDoc.delete(doc);
    recordingResetByDoc.delete(doc);
    unsub();
    window.removeEventListener('message', handleMessage);

    const remaining = (registrationsByDocKey.get(doc.getKey()) || []).filter(
      (other) => other !== registration,
    );
    if (remaining.length > 0) {
      registrationsByDocKey.set(doc.getKey(), remaining);
    } else {
      registrationsByDocKey.delete(doc.getKey());
    }

    if (isOwner()) {
      // NOTE(chacha912): The key goes to another attached Document of the same
      // key if there is one, and otherwise goes quiet: the panel must not be
      // left offering a document that nothing on the page can reach any more.
      const successor = releaseKey(doc.getKey(), registration);
      sendToPanel({
        msg: successor ? 'doc::available' : 'doc::unavailable',
        docKey: doc.getKey(),
      });
      if (successor) {
        sendFullSync(doc.getKey());
      }
    }

    // NOTE(chacha912): The status is dropped last, after the messages above
    // have gone out through it. Nothing is left to answer
    // `devtools::disconnect` for a key with no Document, so a status left
    // behind would keep `isPanelConnected` reporting a panel that has closed.
    if (remaining.length === 0) {
      devtoolsStatusByDocKey.delete(doc.getKey());
    }
  });
}

/**
 * `resetDevtoolsRecording` drops the replay events recorded for the given
 * Document and tells the panel, which has no way to notice on its own.
 *
 * The panel replays a document from its initial root by applying the raw
 * changes the recording carries. A document that re-issues its pre-attach
 * tickets to the client's actor (`Document.setActor` with `reissue`) rewrites
 * those changes in place: the recorded copies name an actor nothing in the
 * document uses any more, so replaying them and then the changes that follow
 * the attach diverges from the live root, or throws on an operation whose
 * target the replay never created. Nothing can repair the recorded copies
 * from here, so the history is dropped and the panel restarts from the
 * re-issued document. It is a no-op for a Document with no registration.
 *
 * The panel replays onto a freshly built empty Document and has no way to be
 * told "start from here", so a recording that merely started over would be a
 * history missing its beginning: the events recorded after the reset would be
 * replayed onto a root that never had the ones before it, which diverges or
 * throws on an operation whose target the replay never created. The caller
 * therefore hands over a `baseline` -- a snapshot event carrying the document
 * as it stands -- which becomes the recording's first entry so that what the
 * panel holds is a complete history again.
 */
export function resetDevtoolsRecording<T, P extends Indexable>(
  doc: Document<T, P>,
  baseline?: DocEventsForReplay,
): void {
  recordingResetByDoc.get(doc)?.(baseline);
}

/**
 * `teardownDevtools` releases what `setupDevtools` registered for the given
 * Document: its subscription, its window listener and its recording. Call it
 * when the Document is discarded — nothing else reaches those, and a page that
 * rebuilds Documents under one key accumulates them otherwise. It is a no-op
 * for a Document that has no devtools registration, and calling it twice is
 * harmless.
 */
export function teardownDevtools<T, P extends Indexable>(
  doc: Document<T, P>,
): void {
  teardownByDoc.get(doc)?.();
}
