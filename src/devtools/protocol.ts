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

export type FullSDKToPanelMessage = SDKToPanelMessage & {
  source: 'yorkie-devtools-sdk';
};
