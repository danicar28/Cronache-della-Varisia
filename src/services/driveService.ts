import mammoth from 'mammoth';
import type { DriveFileItem } from '../types';
import { FIELD_LIMITS } from '../types';
import { compressDataUrl } from '../utils/campaignUtils';

export class DriveAuthExpiredError extends Error {
  constructor(message = 'Sessione Google Drive scaduta. Riconnetti il tuo account Google.') {
    super(message);
    this.name = 'DriveAuthExpiredError';
  }
}

export function extractGoogleFileId(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  const patterns = [
    /\/document\/d\/([a-zA-Z0-9_-]+)/,
    /\/file\/d\/([a-zA-Z0-9_-]+)/,
    /[?&]id=([a-zA-Z0-9_-]+)/,
  ];

  for (const regex of patterns) {
    const match = trimmed.match(regex);
    if (match?.[1]) return match[1];
  }

  if (FIELD_LIMITS.idRegex.test(trimmed) && trimmed.length >= 15 && trimmed.length <= 128) {
    return trimmed;
  }

  return null;
}

export function formatDriveMimeLabel(file: DriveFileItem): string {
  const lowerName = (file.name || '').toLowerCase();
  if (
    file.mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    lowerName.endsWith('.docx')
  ) {
    return 'Word (.docx)';
  }
  if (file.mimeType === 'application/vnd.google-apps.document') {
    return 'Google Doc';
  }
  return 'Testo';
}

export async function listDriveCampaignDocs(
  accessToken: string,
  searchQuery = ''
): Promise<DriveFileItem[]> {
  const mimeFilter =
    "(mimeType='application/vnd.google-apps.document' or mimeType='application/vnd.openxmlformats-officedocument.wordprocessingml.document' or mimeType='text/plain' or mimeType='text/markdown' or name contains '.docx')";
  const safeSearch = searchQuery.trim().replace(/['\\]/g, '');
  const q = safeSearch
    ? `trashed=false and ${mimeFilter} and name contains '${safeSearch}'`
    : `trashed=false and ${mimeFilter}`;

  const params = new URLSearchParams({
    q,
    fields: 'files(id,name,mimeType,modifiedTime,webViewLink)',
    orderBy: 'modifiedTime desc',
    pageSize: '30',
    supportsAllDrives: 'true',
    includeItemsFromAllDrives: 'true',
  });

  const res = await fetch(`https://www.googleapis.com/drive/v3/files?${params.toString()}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (res.status === 401) {
    throw new DriveAuthExpiredError();
  }
  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    throw new Error(errBody?.error?.message || 'Impossibile leggere i file da Google Drive.');
  }

  const data = (await res.json()) as { files?: DriveFileItem[] };
  return data.files || [];
}

export async function fetchDriveDocumentContent(
  accessToken: string,
  fileId: string
): Promise<{
  id: string;
  name: string;
  text: string;
  images: Array<{ title: string; dataUrl: string }>;
  wasTruncated: boolean;
}> {
  const metaParams = new URLSearchParams({
    fields: 'id,name,mimeType',
    supportsAllDrives: 'true',
  });

  const metaRes = await fetch(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?${metaParams.toString()}`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );

  if (metaRes.status === 401) {
    throw new DriveAuthExpiredError();
  }
  if (!metaRes.ok) {
    const errBody = await metaRes.json().catch(() => ({}));
    throw new Error(errBody?.error?.message || 'Documento non trovato o accesso negato su Drive.');
  }

  const meta = (await metaRes.json()) as { id: string; name: string; mimeType: string };
  const lowerName = (meta.name || '').toLowerCase();

  let rawText = '';
  const extractedImages: Array<{ title: string; dataUrl: string }> = [];

  if (meta.mimeType === 'application/vnd.google-apps.document') {
    const exportRes = await fetch(
      `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}/export?mimeType=text/plain`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    );
    if (exportRes.status === 401) {
      throw new DriveAuthExpiredError();
    }
    if (!exportRes.ok) {
      throw new Error('Errore durante l’esportazione del Google Doc.');
    }
    rawText = await exportRes.text();
  } else if (
    meta.mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    lowerName.endsWith('.docx')
  ) {
    const mediaRes = await fetch(
      `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media&supportsAllDrives=true`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    );
    if (mediaRes.status === 401) {
      throw new DriveAuthExpiredError();
    }
    if (!mediaRes.ok) {
      throw new Error('Errore durante il download del file .docx da Google Drive.');
    }
    const arrayBuffer = await mediaRes.arrayBuffer();
    const extracted = await mammoth.extractRawText({ arrayBuffer });
    rawText = extracted.value || '';

    // Also extract embedded images in reading order
    const seenFingerprints = new Set<string>();
    const baseTitle = meta.name.replace(/\.docx$/i, '').trim().slice(0, 90) || 'Documento';
    const supportedMimes = new Set([
      'image/png',
      'image/jpeg',
      'image/jpg',
      'image/webp',
      'image/gif',
      'image/bmp',
      'image/svg+xml',
    ]);

    try {
      await mammoth.convertToHtml(
        { arrayBuffer },
        {
          convertImage: mammoth.images.imgElement(async (image) => {
            const contentType = (image.contentType || '').toLowerCase();
            if (!supportedMimes.has(contentType) || extractedImages.length >= 60) {
              return { src: '' };
            }
            try {
              const base64 = await image.readAsBase64String();
              if (!base64 || base64.length < 200) {
                return { src: '' };
              }
              const fingerprint = `${contentType}:${base64.length}:${base64.slice(0, 120)}:${base64.slice(-60)}`;
              if (seenFingerprints.has(fingerprint) || extractedImages.length >= 60) {
                return { src: '' };
              }
              seenFingerprints.add(fingerprint);

              const rawDataUrl = `data:${contentType};base64,${base64}`;
              const compressed = await compressDataUrl(rawDataUrl, 960, 0.76, 380000);
              if (compressed.startsWith('data:image/') && compressed.length <= 420000) {
                const alt = (image as { altText?: string }).altText?.trim();
                const fallbackTitle = `${baseTitle} — Immagine #${extractedImages.length + 1}`;
                const title = (alt && alt.length >= 2 && alt.length <= 120 ? alt : fallbackTitle).slice(
                  0,
                  FIELD_LIMITS.galleryTitleMax
                );
                extractedImages.push({ title, dataUrl: compressed });
              }
            } catch {
              // Skip unreadable image formats (e.g. WMF/EMF)
            }
            return { src: '' };
          }),
        }
      );
    } catch {
      // Keep extracted text even if image pass hits an unsupported embedded object
    }
  } else if (meta.mimeType === 'text/plain' || meta.mimeType === 'text/markdown') {
    const mediaRes = await fetch(
      `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media&supportsAllDrives=true`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    );
    if (mediaRes.status === 401) {
      throw new DriveAuthExpiredError();
    }
    if (!mediaRes.ok) {
      throw new Error('Errore durante la lettura del file di testo su Drive.');
    }
    rawText = await mediaRes.text();
  } else {
    throw new Error(
      `Formato non supportato direttamente (${meta.mimeType}). Usa un Google Doc, un file Word (.docx) o un file .txt/.md.`
    );
  }

  const normalized = rawText.replace(/^\uFEFF/, '').trim();
  const wasTruncated = normalized.length > FIELD_LIMITS.diaryTextMax;
  const text = wasTruncated ? normalized.slice(0, FIELD_LIMITS.diaryTextMax) : normalized;

  return {
    id: meta.id,
    name: meta.name.slice(0, FIELD_LIMITS.driveFileNameMax),
    text,
    images: extractedImages,
    wasTruncated,
  };
}
