/// <reference types="vite/client" />
/// <reference types="vite-plugin-svgr/client" />

declare module "*.svg" {
  import type { FC, SVGProps } from "react";
  const SVGComponent: FC<SVGProps<SVGSVGElement>>;
  export default SVGComponent;
}
