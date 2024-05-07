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

import type { TransactionEvent } from '@yorkie-js-sdk/src/document/document';

/**
 * `EventSourceDevPanel` is the name of the source representing messages
 *  from the Devtools panel.
 */
export const EventSourceDevPanel = 'yorkie-devtools-panel';

/**
 * `EventSourceSDK` is the name of the source representing messages
 * from the SDK.
 */
export const EventSourceSDK = 'yorkie-devtools-sdk';

/**
 * PanelToSDKMessage is a message sent from the Devtools panel to the SDK.
 */
export type PanelToSDKMessage =
  /**
   * Informs the SDK that the panel is available.
   */
  | { msg: 'devtools::connect' }

  /**
   * Informs the SDK that the panel is not available.
   */
  | { msg: 'devtools::disconnect' }

  /**
   * Informs the SDK that the panel is interested in receiving the "event" for the document,
   * starting with the initial "full sync" event.
   */
  | {
      msg: 'devtools::subscribe';
      docKey: string;
    };

/**
 * Definition of all messages the SDK can send to the Devtools panel.
 */
export type SDKToPanelMessage =
  /**
   * Sent when the dev panel is already opened and listened,
   * before the sdk is loaded. If the panel receives this message,
   * it will replay its initial "connect" message.
   */
  | {
      msg: 'refresh-devtools';
    }
  /**
   * Sent when the document is available for the panel to watch.
   */
  | {
      msg: 'doc::available';
      docKey: string;
    }
  /**
   * Sent initially, to synchronize the entire current state of the document.
   */
  | {
      msg: 'doc::sync::full';
      docKey: string;
      events: Array<TransactionEvent>;
    }
  /**
   * Sent whenever the document is changed.
   */
  | {
      msg: 'doc::sync::partial';
      docKey: string;
      event: TransactionEvent;
    };

export type FullPanelToSDKMessage = PanelToSDKMessage & {
  source: 'yorkie-devtools-panel';
};

export type FullSDKToPanelMessage = SDKToPanelMessage & {
  source: 'yorkie-devtools-sdk';
};
