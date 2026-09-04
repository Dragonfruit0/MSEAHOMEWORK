import { api } from './client';

export type AttachmentKind = 'homework' | 'submission';

export interface AttachmentPreviewInfo {
  fileName: string;
  mimeType: string;
  /** true = `url` is a self-contained signed URL fetchable directly (Supabase/S3); false = `url` is our own auth-required download route. */
  direct: boolean;
  url: string;
}

function cacheKey(kind: AttachmentKind, id: number): string {
  return `${kind}:${id}`;
}

const previewCache = new Map<string, Promise<AttachmentPreviewInfo>>();
const renderUrlCache = new Map<string, Promise<string>>();

/** Fetches (and caches) the preview descriptor for one attachment. Safe to call repeatedly — concurrent/duplicate calls share one request. */
export function getAttachmentPreview(kind: AttachmentKind, id: number): Promise<AttachmentPreviewInfo> {
  const key = cacheKey(kind, id);
  let entry = previewCache.get(key);
  if (!entry) {
    const path = kind === 'submission' ? `/attachments/submission/${id}/preview` : `/attachments/${id}/preview`;
    entry = api.get<AttachmentPreviewInfo>(path).then((res) => res.data);
    entry.catch(() => previewCache.delete(key));
    previewCache.set(key, entry);
  }
  return entry;
}

/** Fire-and-forget warmup — call as soon as a homework list is known so the detail view opens instantly. */
export function prefetchAttachmentPreview(kind: AttachmentKind, id: number): void {
  getAttachmentPreview(kind, id).catch(() => {});
}

/** Resolves to a URL directly usable as an <img>/<iframe> src or for a raw fetch() of file bytes. */
export async function resolveRenderableUrl(kind: AttachmentKind, id: number): Promise<string> {
  const info = await getAttachmentPreview(kind, id);
  if (info.direct) return info.url;
  const key = cacheKey(kind, id);
  let blobUrl = renderUrlCache.get(key);
  if (!blobUrl) {
    blobUrl = api.get(info.url, { responseType: 'blob' }).then((res) => URL.createObjectURL(res.data as Blob));
    blobUrl.catch(() => renderUrlCache.delete(key));
    renderUrlCache.set(key, blobUrl);
  }
  return blobUrl;
}
