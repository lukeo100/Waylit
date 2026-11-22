/**
 * Draws an SVG data URI onto a canvas and returns it as a PNG data URI. Media notifications
 * are not guaranteed to show SVG artwork, and the usual Media Session examples use PNG, so the
 * Media Session binding offers PNG copies alongside the SVG. Resolves to undefined where there
 * is no DOM or the image cannot be drawn, and the binding then keeps the SVG.
 */
export function rasteriseArtwork(svgDataUri: string, size: number): Promise<string | undefined> {
  if (typeof document === "undefined" || typeof Image === "undefined") {
    return Promise.resolve(undefined);
  }
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = size;
        canvas.height = size;
        const context = canvas.getContext("2d");
        if (!context) {
          resolve(undefined);
          return;
        }
        context.drawImage(image, 0, 0, size, size);
        resolve(canvas.toDataURL("image/png"));
      } catch {
        resolve(undefined);
      }
    };
    image.onerror = () => {
      resolve(undefined);
    };
    image.src = svgDataUri;
  });
}
