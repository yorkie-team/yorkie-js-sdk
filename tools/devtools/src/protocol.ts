// TODO(chacha912): This code is a copy from src/devtools/protocol.ts.
// It is intended to be used by importing it from yorkie-js-sdk when
// it is structured as a monorepo.
import type { DocEvent, PrimitiveValue } from 'yorkie-js-sdk';

/**
 * Definition of all messages the Devtools panel can send to the SDK.
 */
export type PanelToSDKMessage =
  /**
   * Initial message from the panel to the SDK. It is sent when the panel is opened.
   */
  | { msg: 'devtools::connect' }
  /**
   * Informs the SDK that the panel is interested in receiving the "event" for the document,
   * starting with the initial "full sync" event.
   */
  | {
      msg: 'devtools::subscribe';
      docKey: string;
    }
  /**
   * Requests the detailed information for the node corresponding to the given path.
   */
  | {
      msg: 'devtools::node::detail';
      data: {
        path: string;
        type: string;
      };
    };

/**
 * Definition of all messages the SDK can send to the Devtools panel.
 */
export type SDKToPanelMessage =
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
      root: JSONElement;
      clients: Clients;
    }
  /**
   * Sent whenever the document is updated.
   */
  | {
      msg: 'doc::sync::partial';
      docKey: string;
      event?: DocEvent;
      root?: JSONElement;
      clients?: Clients;
    }
  /**
   * Sent detailed information for the node corresponding to the given path.
   */
  | {
      msg: 'doc::node::detail';
      node: TreeNodeInfo;
    };

export type FullPanelToSDKMessage = PanelToSDKMessage & {
  source: 'yorkie-devtools-panel';
};

export type FullSDKToPanelMessage = SDKToPanelMessage & {
  source: 'yorkie-devtools-sdk';
};

// ================================================

export type Json =
  | string
  | number
  | boolean
  // eslint-disable-next-line @typescript-eslint/ban-types
  | null
  | { [key: string]: Json }
  | Array<Json>;

export type ContainerValue = {
  [key: string]: JSONElement;
};

export type ElementValue =
  | PrimitiveValue
  | ContainerValue // Array | Object
  | Json; // Text | Tree

export type ElementType =
  | 'YORKIE_PRIMITIVE'
  | 'YORKIE_COUNTER'
  | 'YORKIE_OBJECT'
  | 'YORKIE_ARRAY'
  | 'YORKIE_TEXT'
  | 'YORKIE_TREE';

export type JSONElement = {
  key: string;
  value: ElementValue;
  type: ElementType;
  createdAt: string;
};

export type Clients = Array<{
  clientID: string;
  presence: Json;
}>;

export type TreeNodeInfo = {
  id: string;
  type: string;
  parent?: string;
  size: number;
  value?: string;
  removedAt?: string;
  isRemoved: boolean;
  insPrev?: string;
  insNext?: string;
  children: Array<TreeNodeInfo>;
  depth: number;
};
