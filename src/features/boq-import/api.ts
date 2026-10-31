import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { sampleStore } from '@/lib/sampleStore';
import type { EstimateSection } from '@/features/preparation/types';
import { isReadableBoq, readBoqWorkbook } from './readWorkbook';
import type { BoqReadResult } from './types';

/** Documents whose Excel files are read into the estimate, and the BOQ part each one fills. */
export const BOQ_DOCUMENTS: Record<string, EstimateSection> = {
  'bill-of-quantity-electrical': 'electrical',
  'bill-of-quantity-civil': 'civil',
};

/** BOQ files read for a DPR, kept in this browser until the backend exists. */
export function useBoqReads(dprId: string) {
  return useQuery({
    queryKey: ['boq-reads', dprId],
    enabled: Boolean(dprId),
    staleTime: Infinity,
    queryFn: () => sampleStore.boqReads(dprId),
  });
}

const fileBuffer = (file: Blob): Promise<ArrayBuffer> =>
  typeof file.arrayBuffer === 'function'
    ? file.arrayBuffer()
    : new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as ArrayBuffer);
        reader.onerror = () => reject(reader.error);
        reader.readAsArrayBuffer(file);
      });

/** Reads BOQ workbooks attached to a DPR. Files that are not .xlsx are skipped and returned in `unreadable`. */
export function useReadBoqFiles(dprId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ docKey, files }: { docKey: string; files: File[] }) => {
      const section = BOQ_DOCUMENTS[docKey];
      const results: BoqReadResult[] = [];
      const unreadable: string[] = [];
      if (!section) return { results, unreadable };
      for (const file of files) {
        if (!isReadableBoq(file.name)) {
          unreadable.push(file.name);
          continue;
        }
        const read = await readBoqWorkbook(await fileBuffer(file), file.name, section);
        sampleStore.saveBoqRead(dprId, docKey, read);
        results.push(read);
      }
      return { results, unreadable };
    },
    onSuccess: () => qc.setQueryData(['boq-reads', dprId], sampleStore.boqReads(dprId)),
  });
}

export function useRemoveBoqRead(dprId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ docKey, fileName }: { docKey: string; fileName: string }) => sampleStore.removeBoqRead(dprId, docKey, fileName),
    onSuccess: (reads) => qc.setQueryData(['boq-reads', dprId], reads),
  });
}
