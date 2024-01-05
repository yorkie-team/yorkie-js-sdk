export type PanelToSDKMessage =
  | { msg: 'devtools::connect' }
  | {
      msg: 'devtools::subscribe';
      docKey: string;
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
    }
  | {
      msg: 'doc::sync::partial';
      docKey: string;
      root?: any;
      clients?: any;
      event?: any;
    };

export type FullPanelToSDKMessage = PanelToSDKMessage & {
  source: 'yorkie-devtools-panel';
  tabId: number;
};

export type FullSDKToPanelMessage = SDKToPanelMessage & {
  source: 'yorkie-devtools-sdk';
};
