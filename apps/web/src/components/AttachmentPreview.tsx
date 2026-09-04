import { useEffect, useState } from 'react';
import { downloadAttachment } from '../api/client';
import { getAttachmentPreview, resolveRenderableUrl, type AttachmentKind } from '../api/attachmentPreview';

interface Attachment {
  id: number;
  file_name: string;
  mime_type: string;
  size_bytes: number | string;
}

function formatBytes(bytes: number | string): string {
  const n = Number(bytes);
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

const OFFICE_EXTENSIONS = ['doc', 'docx', 'ppt', 'pptx', 'xls', 'xlsx'];
const TEXT_PREVIEW_LIMIT = 20000;

/** Renders a homework/submission attachment inline — image, PDF, text, or (when the
 * storage provider gives us a public signed URL) an Office document via Google's
 * viewer — instead of forcing a click-to-download round trip. */
export function AttachmentPreview({ attachment, kind }: { attachment: Attachment; kind: AttachmentKind }) {
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [renderUrl, setRenderUrl] = useState<string | null>(null);
  const [textContent, setTextContent] = useState<string | null>(null);
  const [direct, setDirect] = useState(false);

  const ext = attachment.file_name.split('.').pop()?.toLowerCase() ?? '';
  const isImage = attachment.mime_type.startsWith('image/');
  const isPdf = attachment.mime_type === 'application/pdf';
  const isText = attachment.mime_type.startsWith('text/');
  const isOffice = OFFICE_EXTENSIONS.includes(ext);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const info = await getAttachmentPreview(kind, attachment.id);
        const url = await resolveRenderableUrl(kind, attachment.id);
        if (cancelled) return;
        setDirect(info.direct);
        setRenderUrl(url);
        if (isText) {
          const text = await fetch(url).then((r) => r.text());
          if (!cancelled) setTextContent(text.slice(0, TEXT_PREVIEW_LIMIT));
        }
        if (!cancelled) setStatus('ready');
      } catch {
        if (!cancelled) setStatus('error');
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attachment.id, kind]);

  const downloadPath = kind === 'submission' ? `/attachments/submission/${attachment.id}/download` : `/attachments/${attachment.id}/download`;

  return (
    <div className="rounded-xl border border-slate-100 overflow-hidden bg-white">
      <div className="flex items-center gap-2 px-3 py-2 bg-slate-50 border-b border-slate-100">
        <span className="h-6 w-6 shrink-0 rounded bg-brand-indigo/10 text-brand-indigo flex items-center justify-center text-[10px] font-bold">
          {ext.toUpperCase().slice(0, 3)}
        </span>
        <span className="flex-1 min-w-0 text-xs font-medium text-slate-700 truncate">{attachment.file_name}</span>
        <span className="text-[11px] text-slate-400 shrink-0">{formatBytes(attachment.size_bytes)}</span>
        <button
          type="button"
          onClick={() => downloadAttachment(downloadPath, attachment.file_name)}
          className="text-[11px] font-semibold text-brand-indigo shrink-0"
        >
          Download
        </button>
      </div>

      {status === 'loading' && (
        <div className="h-32 flex items-center justify-center text-xs text-slate-400 animate-pulse">Loading preview…</div>
      )}
      {status === 'error' && (
        <div className="h-20 flex items-center justify-center text-xs text-rose-500">Couldn't load preview — use Download.</div>
      )}

      {status === 'ready' && renderUrl && isImage && (
        <img src={renderUrl} alt={attachment.file_name} className="w-full max-h-96 object-contain bg-slate-900/5" />
      )}
      {status === 'ready' && renderUrl && isPdf && (
        <iframe src={renderUrl} title={attachment.file_name} className="w-full h-[520px] border-0" />
      )}
      {status === 'ready' && isText && textContent != null && (
        <pre className="text-xs p-3 max-h-96 overflow-auto whitespace-pre-wrap text-slate-700">{textContent}</pre>
      )}
      {status === 'ready' && renderUrl && isOffice && direct && (
        <iframe
          src={`https://docs.google.com/viewer?embedded=true&url=${encodeURIComponent(renderUrl)}`}
          title={attachment.file_name}
          className="w-full h-[520px] border-0"
        />
      )}
      {status === 'ready' && !isImage && !isPdf && !isText && !(isOffice && direct) && (
        <div className="h-16 flex items-center justify-center text-xs text-slate-400">No inline preview for this file type.</div>
      )}
    </div>
  );
}
