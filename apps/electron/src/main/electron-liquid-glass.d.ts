declare module "electron-liquid-glass" {
  export interface GlassOptions {
    cornerRadius?: number;
    tintColor?: string;
    opaque?: boolean;
  }

  const liquidGlass: {
    addView(handle: Buffer, options?: GlassOptions): number;
  };

  export default liquidGlass;
}
