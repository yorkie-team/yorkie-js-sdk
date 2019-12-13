export type Code = string;

export const Code = {
  Ok: 'ok' as Code,

  ClientNotActive: 'client-not-active' as Code,
  Unimplemented: 'unimplemented' as Code,
  Unsupported: 'unsupported' as Code,
}

export class YorkieError extends Error {
  name = 'YorkieError';
  stack?: string;

  constructor(readonly code: Code, readonly message: string) {
    super(message);
    this.toString = () => `${this.name}: [code=${this.code}]: ${this.message}`;
  }
}
