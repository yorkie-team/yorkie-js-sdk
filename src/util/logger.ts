export enum LogLevel {
  Trivial = 0,
  Debug = 1,
  Info = 2,
  Warn = 3,
  Error = 4,
  Fatal = 5
}

let level = LogLevel.Debug;
export function setLogLevel(l: LogLevel): void {
  level = l;
}

export const logger = {
  trivial: (message: string): void => {
    if (level > LogLevel.Trivial) {
      return;
    }

    if (typeof console != 'undefined') {
      console.log(`YORKIE T: ${message}`);
    }
  },

  debug: (message: string): void => {
    if (level > LogLevel.Debug) {
      return;
    }

    if (typeof console != 'undefined') {
      console.log(`YORKIE D: ${message}`);
    }
  },

  info: (message: string): void => {
    if (level > LogLevel.Info) {
      return;
    }

    if (typeof console != 'undefined') {
      console.log(`YORKIE I: ${message}`);
    }
  },

  warn: (message: string): void => {
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

  error: (message: string): void => {
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

  fatal: (message: string): void => {
    if (typeof console != 'undefined') {
      if (typeof console.error !== 'undefined') {
        console.error(`YORKIE F: ${message}`);
      } else {
        console.log(`YORKIE F: ${message}`);
      }
    }

    throw new Error(`YORKIE F: ${message}`);
  },

  isEnabled: (l: LogLevel): boolean => {
    return level <= l;
  }
};
