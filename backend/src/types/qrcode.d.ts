// Minimal ambient declaration for the `qrcode` package (a runtime dependency in
// package.json, but with no bundled types and no @types/qrcode installed). We
// only use `toString` (SVG) and `toDataURL`, so declare just those to keep the
// prod tsc build clean without adding a devDependency / churning package-lock.
declare module 'qrcode' {
  export interface QRCodeRenderOptions {
    type?: 'svg' | 'utf8' | 'terminal';
    margin?: number;
    width?: number;
    scale?: number;
    errorCorrectionLevel?: 'L' | 'M' | 'Q' | 'H';
    color?: { dark?: string; light?: string };
  }
  export function toString(text: string, options?: QRCodeRenderOptions): Promise<string>;
  export function toDataURL(text: string, options?: QRCodeRenderOptions): Promise<string>;
  const _default: {
    toString: typeof toString;
    toDataURL: typeof toDataURL;
  };
  export default _default;
}
