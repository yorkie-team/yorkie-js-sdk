/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_YORKIE_API_KEY?: string;
  readonly VITE_YORKIE_API_ADDR?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
