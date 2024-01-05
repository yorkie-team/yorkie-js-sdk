// TODO(chacha912): Import from yorkie-js-sdk
export type PanelToSDKMessage =
  | { msg: 'devtools::connect' }
  | {
      msg: 'devtools::subscribe';
      docKey: string;
    }
  | {
      msg: 'devtools::node::detail';
      data: {
        path: string;
        type: string;
      };
    };

export type SDKToPanelMessage =
  | {
      msg: 'doc::available';
      docKey: string;
    }
  | {
      msg: 'doc::unavailable';
      docKey: string;
    }
  | {
      msg: 'doc::sync::full';
      docKey: string;
      root: any;
      clients: any;
      nodeDetail: any;
    }
  | {
      msg: 'doc::sync::partial';
      docKey: string;
      event?: any;
      root?: any;
      clients?: any;
      nodeDetail?: any;
    };

export type FullPanelToSDKMessage = PanelToSDKMessage & {
  source: 'yorkie-devtools-panel';
  tabId: number;
};

export type FullSDKToPanelMessage = SDKToPanelMessage & {
  source: 'yorkie-devtools-sdk';
};
