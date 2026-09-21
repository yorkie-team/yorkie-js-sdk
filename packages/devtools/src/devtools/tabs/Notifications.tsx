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

import { useMemo, useState } from 'react';
import { DocEventType, Devtools } from '@yorkie-js/sdk';
import { useDocNotifications } from '../contexts/YorkieSource';

/**
 * `describeNotification` renders the payload fields that carry the information
 * for the given event type.
 */
const describeNotification = (event: Devtools.DocNotificationEvent): string => {
  // NOTE(hackerwins): The payload reaches the panel through the page, so a
  // field can be missing or the wrong type. A garbled row is acceptable here;
  // a throw is not, because there is no error boundary above this component.
  switch (event.type) {
    case DocEventType.ConnectionChanged:
    case DocEventType.SyncStatusChanged:
      return String(event.value ?? '');
    case DocEventType.AuthError:
      return `${event.value?.method}: ${event.value?.reason}`;
    case DocEventType.EpochMismatch:
      return String(event.value?.method ?? '');
    case DocEventType.LocalChangesDropped:
      return `${event.value?.reason}, ${
        event.value?.changes?.length ?? 0
      } change(s) dropped`;
    case DocEventType.PersistDisabled:
      return `${event.value?.reason}, ${event.value?.bytes ?? 0} byte(s)`;
    default:
      return '';
  }
};

/**
 * `formatTime` renders the time the SDK observed the event, down to the
 * millisecond, since several of these events can arrive in one burst.
 */
const formatTime = (timestamp: number): string => {
  const date = new Date(timestamp);
  const ms = String(date.getMilliseconds()).padStart(3, '0');
  return `${date.toLocaleTimeString(undefined, { hour12: false })}.${ms}`;
};

/**
 * Renders the events that cannot be replayed, newest first.
 *
 * @returns A React element listing the notifications of the current document.
 */
export function Notifications() {
  const notifications = useDocNotifications();
  const [openNotifications, setOpenNotifications] = useState(false);

  // NOTE(hackerwins): Newest first, so a data-loss record does not scroll out
  // of sight behind a run of connection changes.
  const rows = useMemo(
    () =>
      notifications
        .map((notification, index) => ({ notification, index }))
        .reverse(),
    [notifications],
  );

  return (
    <div className="devtools-notifications">
      <div className="content-wrap">
        <div className="devtools-tab-toolbar">
          <span className="title">
            Notifications ({notifications.length})
            <button
              className="toggle-tab-btn"
              onClick={() => {
                setOpenNotifications((v) => !v);
              }}
            >
              {openNotifications ? '▾' : '▸'}
            </button>
          </span>
        </div>
        {openNotifications && (
          <div className="notification-list">
            {rows.length === 0 ? (
              <p className="notification-empty">
                No events outside the replay history yet.
              </p>
            ) : (
              rows.map(({ notification, index }) => (
                <div className="notification-row" key={index}>
                  <span className="notification-time">
                    {formatTime(notification.timestamp)}
                  </span>
                  <span className="notification-type">
                    {notification.event.type}
                  </span>
                  <span className="notification-detail">
                    {describeNotification(notification.event)}
                  </span>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
