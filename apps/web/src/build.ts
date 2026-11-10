/** Build identifier injected at bundle time (git sha + timestamp); 'dev' when not built. */
declare const __BUILD_ID__: string;
export const BUILD_ID = typeof __BUILD_ID__ === 'string' ? __BUILD_ID__ : 'dev';
