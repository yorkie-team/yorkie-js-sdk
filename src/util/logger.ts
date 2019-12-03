export const logger = {
  debug: (message: string) => {
    if (typeof console != 'undefined') {
      console.log(`YORKIE D: ${message}`);
    }
  },

  info: (message: string) => {
    if (typeof console != 'undefined') {
      console.log(`YORKIE I: ${message}`);
    }
  },

  warn: (message: string) => {
    if (typeof console != 'undefined') {
      if (typeof console.warn !== 'undefined') {
        console.warn(`YORKIE W: ${message}`);
      } else {
        console.log(`YORKIE W: ${message}`);
      }
    }
  },

  error: (message: string) => {
    if (typeof console != 'undefined') {
      if (typeof console.error !== 'undefined') {
        console.error(`YORKIE E: ${message}`);
      } else {
        console.log(`YORKIE E: ${message}`);
      }
    }
  }
};
