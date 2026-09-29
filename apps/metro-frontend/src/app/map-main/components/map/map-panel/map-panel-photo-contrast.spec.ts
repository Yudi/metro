import { PhotoHandleTone, samplePhotoHandleTone } from './map-panel-photo-contrast';

describe('photo handle contrast', () => {
  function sample(pixels: number[], blocked = false, previousTone: PhotoHandleTone | null = null) {
    const image = document.createElement('img');
    image.style.objectPosition = '50% 45%';
    image.style.opacity = '1';
    Object.defineProperties(image, {
      naturalWidth: { value: 400 }, naturalHeight: { value: 200 },
    });
    image.getBoundingClientRect = () => new DOMRect(0, 0, 200, 100);
    const context = {
      canvas: { width: pixels.length / 4, height: 1 },
      globalAlpha: 1,
      fillStyle: '',
      fillRect: jest.fn(),
      drawImage: jest.fn(),
      getImageData: () => {
        if (blocked) throw new Error('Canvas access denied');
        return { data: new Uint8ClampedArray(pixels) };
      },
    } as unknown as CanvasRenderingContext2D;
    return samplePhotoHandleTone(image, new DOMRect(82, 20, 36, 4), context,
      'rgb(244, 243, 246)', 'rgba(244, 243, 246, 0)', previousTone);
  }

  it('chooses a light solid tone over a dark photo', () => {
    expect(sample([20, 30, 40, 255])).toBe('light');
  });

  it('chooses a dark solid tone over a bright photo', () => {
    expect(sample([240, 230, 220, 255])).toBe('dark');
  });

  it('chooses one tone for the whole handle over a mixed backdrop', () => {
    expect(sample([0, 0, 0, 255, 255, 255, 255, 255])).toBe('dark');
  });

  it('does not let a bright reflection outweigh the dark region beneath the handle', () => {
    expect(sample([30, 30, 30, 255, 35, 35, 35, 255, 40, 40, 40, 255, 250, 250, 250, 255])).toBe('light');
  });

  it('keeps the selected tone stable near the crossover while resizing', () => {
    expect(sample([120, 120, 120, 255], false, 'light')).toBe('light');
    expect(sample([120, 120, 120, 255], false, 'dark')).toBe('dark');
    expect(sample([240, 240, 240, 255], false, 'light')).toBe('dark');
    expect(sample([20, 20, 20, 255], false, 'dark')).toBe('light');
  });

  it('keeps the Material fallback when canvas access is blocked', () => {
    expect(sample([20, 30, 40, 255], true)).toBeNull();
  });
});
