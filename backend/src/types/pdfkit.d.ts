// Minimal ambient declaration for `pdfkit`.
//
// pdfkit is a ROOT dependency of this npm-workspaces monorepo with no bundled
// types and no @types/pdfkit installed. It IS present in the production image:
// backend/Dockerfile runs `npm ci` in the builder BEFORE `ENV NODE_ENV=production`
// is set in the final stage, and then copies the whole `/app/node_modules` across —
// so devDependencies are installed and survive. Verified before relying on it.
//
// Only the surface the offer-letter generator uses is declared, matching the
// qrcode.d.ts / uuid.d.ts precedent: keep the prod tsc build clean without adding
// a devDependency or churning package-lock.
declare module 'pdfkit' {
  import { Readable } from 'stream';

  interface PDFDocumentOptions {
    size?: string | [number, number];
    margin?: number;
    margins?: { top: number; bottom: number; left: number; right: number };
    info?: {
      Title?: string;
      Author?: string;
      Subject?: string;
      Keywords?: string;
      Creator?: string;
      Producer?: string;
      CreationDate?: Date;
    };
    autoFirstPage?: boolean;
    bufferPages?: boolean;
  }

  interface TextOptions {
    align?: 'left' | 'center' | 'right' | 'justify';
    width?: number;
    continued?: boolean;
    indent?: number;
    lineGap?: number;
    paragraphGap?: number;
    underline?: boolean;
    link?: string;
  }

  class PDFDocument extends Readable {
    constructor(options?: PDFDocumentOptions);
    readonly page: { width: number; height: number; margins: { top: number; bottom: number; left: number; right: number } };
    y: number;
    x: number;
    addPage(options?: PDFDocumentOptions): this;
    font(src: string, size?: number): this;
    fontSize(size: number): this;
    fillColor(color: string, opacity?: number): this;
    strokeColor(color: string, opacity?: number): this;
    text(text: string, options?: TextOptions): this;
    text(text: string, x?: number, y?: number, options?: TextOptions): this;
    moveDown(lines?: number): this;
    moveTo(x: number, y: number): this;
    lineTo(x: number, y: number): this;
    lineWidth(width: number): this;
    stroke(): this;
    rect(x: number, y: number, w: number, h: number): this;
    fill(color?: string): this;
    end(): void;
  }

  export = PDFDocument;
}
