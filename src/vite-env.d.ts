/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** JDC monitoring API URL (e.g., http://localhost:9091) */
  readonly VITE_JDC_URL?: string;
  /** Translator monitoring API URL (e.g., http://localhost:9092) */
  readonly VITE_TRANSLATOR_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
