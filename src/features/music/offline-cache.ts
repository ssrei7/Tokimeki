export interface DownloadedMusicAsset {
  blob: Blob;
  mimeType: string;
}

export async function downloadMusicAsset(url: string, fetchImpl: typeof fetch = fetch): Promise<DownloadedMusicAsset> {
  if (!/^https?:\/\/\S+$/i.test(url)) throw new Error('音频地址必须是有效的 http(s) URL。');
  let response: Response;
  try {
    response = await fetchImpl(url, { method: 'GET', mode: 'cors', credentials: 'omit', cache: 'no-store' });
  } catch {
    throw new Error('下载失败；该音频站点可能不允许跨域读取，仍可尝试直接在线播放。');
  }
  if (!response.ok) throw new Error(`下载失败：HTTP ${response.status}。`);
  const blob = await response.blob();
  if (!blob.size) throw new Error('下载结果为空，未写入离线缓存。');
  const mimeType = (response.headers.get('content-type') ?? blob.type).split(';')[0].trim().toLowerCase() || 'application/octet-stream';
  if (mimeType.startsWith('text/') || mimeType.includes('html') || mimeType.includes('json')) throw new Error(`下载结果不是音频（${mimeType}）。`);
  return { blob: blob.type === mimeType ? blob : blob.slice(0, blob.size, mimeType), mimeType };
}
