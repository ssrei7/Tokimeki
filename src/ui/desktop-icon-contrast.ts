export type DesktopIconContrast = {
  ink: string;
  label: string;
  border: string;
  shadow: string;
};

function gray(value: number): string {
  const channel = Math.max(0, Math.min(255, Math.round(value))).toString(16).padStart(2, '0');
  return `#${channel}${channel}${channel}`;
}

export function desktopIconContrastForLuminance(luminance: number): DesktopIconContrast {
  const value = Math.max(0, Math.min(1, luminance));
  if (value < 0.42) {
    const amount = value / 0.42;
    return { ink: gray(242 - amount * 20), label: gray(232 - amount * 18), border: 'rgb(255 255 255 / 0.72)', shadow: 'rgb(0 0 0 / 0.28)' };
  }
  if (value > 0.58) {
    const amount = (value - 0.58) / 0.42;
    return { ink: gray(82 - amount * 38), label: gray(64 - amount * 32), border: 'rgb(23 23 23 / 0.22)', shadow: 'rgb(255 255 255 / 0.24)' };
  }
  const amount = (value - 0.42) / 0.16;
  const middle = 148 - amount * 36;
  return { ink: gray(middle), label: gray(middle - 14), border: 'rgb(128 128 128 / 0.42)', shadow: 'rgb(23 23 23 / 0.18)' };
}

export async function readWallpaperLuminance(source: string): Promise<number | null> {
  if (typeof Image === 'undefined' || typeof document === 'undefined') return null;
  return new Promise((resolve) => {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = 32;
        canvas.height = 32;
        const context = canvas.getContext('2d', { willReadFrequently: true });
        if (!context) { resolve(null); return; }
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
        let total = 0;
        let weight = 0;
        for (let index = 0; index < pixels.length; index += 4) {
          const alpha = pixels[index + 3] / 255;
          if (alpha === 0) continue;
          total += (0.2126 * pixels[index] + 0.7152 * pixels[index + 1] + 0.0722 * pixels[index + 2]) / 255 * alpha;
          weight += alpha;
        }
        resolve(weight ? total / weight : null);
      } catch { resolve(null); }
    };
    image.onerror = () => resolve(null);
    image.src = source;
  });
}
