/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_EVORACER_SERVICE_ORIGIN?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
