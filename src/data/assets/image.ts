export interface DownsampledImage {
  blob: Blob;
  width: number;
  height: number;
  mimeType: 'image/webp';
}

export async function downsampleImage(input: Blob, maxHeight = 1600, quality = 0.85): Promise<DownsampledImage> {
  if (typeof createImageBitmap !== 'function') throw new Error('当前浏览器不支持图片导入，请使用支持 createImageBitmap 的浏览器。');
  const bitmap = await createImageBitmap(input);
  try {
    const scale = bitmap.height > maxHeight ? maxHeight / bitmap.height : 1;
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('无法创建图片处理画布。');
    context.drawImage(bitmap, 0, 0, width, height);
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((value) => value ? resolve(value) : reject(new Error('图片无法转换为 WebP。')), 'image/webp', quality);
    });
    return { blob, width, height, mimeType: 'image/webp' };
  } finally {
    bitmap.close();
  }
}
