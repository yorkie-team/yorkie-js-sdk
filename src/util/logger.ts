export enum LogLevel {
  Debug = 0,
  Info = 1,
  Warn = 2,
  Error = 3,
  Fatal = 4
}

let level = LogLevel.Info;
export function setLogLevel(l: LogLevel): void {
  level = l;
}

export const logger = {
  debug: (message: string) => {
    if (level > LogLevel.Debug) {
      return;
    }

    if (typeof console != 'undefined') {
      console.log(`YORKIE D: ${message}`);
    }
  },

  info: (message: string) => {
    if (level > LogLevel.Info) {
      return;
    }

    if (typeof console != 'undefined') {
      console.log(`YORKIE I: ${message}`);
    }
  },

  warn: (message: string) => {
    if (level > LogLevel.Warn) {
      return;
    }

    if (typeof console != 'undefined') {
      if (typeof console.warn !== 'undefined') {
        console.warn(`YORKIE W: ${message}`);
      } else {
        console.log(`YORKIE W: ${message}`);
      }
    }
  },

  error: (message: string) => {
    if (level > LogLevel.Error) {
      return;
    }

    if (typeof console != 'undefined') {
      if (typeof console.error !== 'undefined') {
        console.error(`YORKIE E: ${message}`);
      } else {
        console.log(`YORKIE E: ${message}`);
      }
    }
  },

  fatal: (message: string) => {
    if (typeof console != 'undefined') {
      if (typeof console.error !== 'undefined') {
        console.error(`YORKIE F: ${message}`);
      } else {
        console.log(`YORKIE F: ${message}`);
      }
    }

    throw new Error(`YORKIE F: ${message}`);
  }
};
