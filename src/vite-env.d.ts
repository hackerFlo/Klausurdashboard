/// <reference types="vite/client" />

// Injected at build time from package.json's "version" via vite.config.ts's `define`.
declare const __APP_VERSION__: string;

declare module "*.png" {
  const src: string;
  export default src;
}

declare module "*.jpg" {
  const src: string;
  export default src;
}

declare module "*.svg" {
  const src: string;
  export default src;
}
