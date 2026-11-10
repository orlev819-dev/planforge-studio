// Offline type shim: @types/react is not installed in this sandbox. With `npm install` the real
// @types/react / @types/react-dom are used instead (see tsconfig.web.json "paths" note in README).
declare module 'react' {
  export type ReactNode = any;
  export type PointerEvent<T = any> = any; export type WheelEvent<T = any> = any; export type DragEvent<T = any> = any; export type MouseEvent<T = any> = any;
  export function useState<T>(init: T | (() => T)): [T, (v: T | ((p: T) => T)) => void];
  export function useEffect(fn: () => void | (() => void), deps?: unknown[]): void;
  export function useMemo<T>(fn: () => T, deps: unknown[]): T;
  export function useRef<T>(init: T): { current: T };
  export function useRef<T>(init: T | null): { current: T | null };
  export function useSyncExternalStore<T>(sub: (l: () => void) => () => void, get: () => T, getServer?: () => T): T;
}
declare namespace React { type ReactNode = any; type PointerEvent = any; type WheelEvent = any; type DragEvent = any; type MouseEvent = any }
declare module 'react-dom/client' { export function createRoot(el: Element): { render(n: any): void } }
declare module 'react/jsx-runtime' { export const jsx: any; export const jsxs: any; export const Fragment: any }
declare namespace JSX { interface IntrinsicElements { [k: string]: any } interface IntrinsicAttributes { key?: any } interface Element {} interface ElementChildrenAttribute { children: {} } }
declare module '*.css';
