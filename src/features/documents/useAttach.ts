import { useToast } from '@/lib/toast';
import { putFiles } from '@/lib/fileStore';
import { useUpdateDocuments } from './api';
import { pdfOnly } from './catalog';
import { addFiles } from './state';

export const MAX_FILE_BYTES = 25 * 1024 * 1024;

/**
 * Attaches picked files to one of a DPR's documents: checks type and size, keeps the files themselves
 * in this browser (for the printed DPR pack) and records their names. Used by the Documents page and
 * by the Input documents step, so a missing file can be added without leaving DPR Preparation.
 */
export function useAttachFiles(dprId: string) {
  const update = useUpdateDocuments(dprId);
  const toast = useToast();
  return (spec: { key: string; name: string }, picked: File[]) => {
    let files = picked;
    const notPdf = pdfOnly(spec.key) ? files.filter((f) => !/\.pdf$/i.test(f.name)) : [];
    if (notPdf.length) toast({ title: 'PDF only', description: `${spec.name} takes the BOQ PDF as received. Upload the estimated BOQ workbook in DPR Preparation, Estimate tab. Skipped: ${notPdf.map((f) => f.name).join(', ')}.`, tone: 'error' });
    files = files.filter((f) => !notPdf.includes(f));
    const tooBig = files.filter((f) => f.size > MAX_FILE_BYTES);
    const ok = files.filter((f) => f.size <= MAX_FILE_BYTES);
    if (tooBig.length) toast({ title: 'File too large', description: `${tooBig.map((f) => f.name).join(', ')} is over 25 MB.`, tone: 'error' });
    if (!ok.length) return;
    const added = ok.map((f) => ({ name: f.name, size: f.size, addedAt: new Date().toISOString() }));
    void putFiles(dprId, spec.key, ok);
    update.mutate((d) => addFiles(d, spec.key, added), {
      onSuccess: () => toast({ title: `${ok.length === 1 ? 'File' : `${ok.length} files`} added`, description: spec.name }),
    });
  };
}
