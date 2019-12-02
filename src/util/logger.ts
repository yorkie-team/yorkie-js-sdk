export const logger = {
  info: (message: string) => {
    if (typeof console != 'undefined') {
      console.log(`YORKIE INFO: ${message}`);
    }
  },
  warn: (message: string) => {
    if (typeof console != 'undefined') {
      if (typeof console.warn !== 'undefined') {
        console.warn(`YORKIE WARN: ${message}`);
      } else {
        console.log(`YORKIE WARN: ${message}`);
      }
    }
  }
};
