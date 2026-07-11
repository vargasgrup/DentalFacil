declare module "pdfjs-dist/build/pdf.mjs" {
  export const version: string;
  export const GlobalWorkerOptions: { workerSrc: string };
  export function getDocument(src: {
    data: Uint8Array;
  }): { promise: Promise<{
    numPages: number;
    getPage: (n: number) => Promise<{
      getViewport: (o: { scale: number }) => { width: number; height: number };
      render: (o: {
        canvasContext: CanvasRenderingContext2D;
        viewport: { width: number; height: number };
      }) => { promise: Promise<void> };
    }>;
  }> };
}
