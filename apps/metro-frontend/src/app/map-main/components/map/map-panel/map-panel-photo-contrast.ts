export type PhotoHandleTone = 'light' | 'dark';

/** Sample the small photo region beneath the handle, including its surface overlay. */
export function samplePhotoHandleTone(
  image: HTMLImageElement,
  handleBounds: DOMRect,
  context: CanvasRenderingContext2D,
  surfaceColor: string,
  overlayColor: string,
  previousTone: PhotoHandleTone | null = null,
): PhotoHandleTone | null {
  const imageBounds = image.getBoundingClientRect();
  const imageStyle = image.ownerDocument.defaultView?.getComputedStyle(image);
  if (!imageStyle || !imageBounds.width || !imageBounds.height) return null;

  const scale = Math.max(
    imageBounds.width / image.naturalWidth,
    imageBounds.height / image.naturalHeight,
  );
  const [positionX, positionY] = imageStyle.objectPosition.split(' ').map(
    (value) => Number.parseFloat(value) / 100,
  );
  const sourceX = (handleBounds.left - imageBounds.left +
    (image.naturalWidth * scale - imageBounds.width) * positionX) / scale;
  const sourceY = (handleBounds.top - imageBounds.top +
    (image.naturalHeight * scale - imageBounds.height) * positionY) / scale;
  const centerY = (handleBounds.top + handleBounds.height / 2 - imageBounds.top) / imageBounds.height;
  // Matches the photo's mask: opaque through 40%, transparent at its bottom.
  const maskOpacity = Math.max(0, Math.min(1, (1 - centerY) / 0.6));
  const { width, height } = context.canvas;

  try {
    context.globalAlpha = 1;
    context.fillStyle = surfaceColor;
    context.fillRect(0, 0, width, height);
    context.globalAlpha = Number(imageStyle.opacity) * maskOpacity;
    context.drawImage(image, sourceX, sourceY,
      handleBounds.width / scale, handleBounds.height / scale,
      0, 0, width, height);
    context.globalAlpha = 1;
    context.fillStyle = overlayColor;
    context.fillRect(0, 0, width, height);
    const pixels = context.getImageData(0, 0, width, height).data;
    const luminances: number[] = [];
    for (let index = 0; index < pixels.length; index += 4) {
      luminances.push(0.2126 * linearChannel(pixels[index]) +
        0.7152 * linearChannel(pixels[index + 1]) +
        0.0722 * linearChannel(pixels[index + 2]));
    }
    // Bright reflections must not outweigh the darker pixels covering most
    // of the handle. A median gives the entire pill one stable contrasting tone.
    luminances.sort((a, b) => a - b);
    const middle = Math.floor(luminances.length / 2);
    const median = luminances.length % 2 === 0
      ? (luminances[middle - 1] + luminances[middle]) / 2
      : luminances[middle];
    // Both tones remain useful around the crossover. Keep the previous tone
    // there so tiny crop/scroll changes cannot make the handle flicker.
    if (previousTone === 'light' && median < 0.20) return 'light';
    if (previousTone === 'dark' && median > 0.17) return 'dark';
    return median > 0.18 ? 'dark' : 'light';
  } catch {
    // Reset a tainted canvas so a later valid image can still be sampled.
    context.canvas.width = width;
    return null;
  }
}

function linearChannel(channel: number): number {
  const value = channel / 255;
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}
