/// <reference types="vite/client" />

import type { CodeHarborBridge } from './shared/contracts';

declare global {
  interface Window {
    codeHarbor: CodeHarborBridge;
  }
}

export {};
