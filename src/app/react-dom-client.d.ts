// Minimal typing for react-dom/client (avoids adding @types/react-dom to the Remotion project).
declare module "react-dom/client" {
  import type { ReactNode } from "react";
  export type Root = { render(children: ReactNode): void; unmount(): void };
  export function createRoot(container: Element | DocumentFragment): Root;
}

declare module "react-dom" {
  import type { ReactNode, ReactPortal } from "react";
  export function createPortal(children: ReactNode, container: Element | DocumentFragment): ReactPortal;
}
