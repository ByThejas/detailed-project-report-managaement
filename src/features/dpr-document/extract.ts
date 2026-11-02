import type { DetailKey } from './content';

/**
 * Finds DPR facts in the text of attached documents: TCCM approval, APW code, list and year, the BOM
 * letter, the earthmat drawing and the recorded load. Each finding is a suggestion with its file and the
 * text around it; nothing is filled in until the user accepts it.
 */

/** Where a suggestion goes when accepted. */
export type SuggestionTarget =
  | { kind: 'detail'; key: DetailKey }
  | { kind: 'salient'; label: string }
  | { kind: 'load'; key: 'peakMw' | 'existing' };

export interface FactSuggestion {
  id: string;
  label: string;
  value: string;
  target: SuggestionTarget;
  file: string;
  page?: number;
  /** The words around the match, so the user can see where it came from. */
  snippet: string;
}

/** Text of one file, page by page when it is a PDF. */
export interface FileText {
  file: string;
  docKey: string;
  pages: string[];
  /** Set when there was no text to read, e.g. a scanned PDF. */
  note?: string;
}

const ord = (n: string) => {
  const k = Number(n) % 100;
  const suffix = k >= 11 && k <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[Number(n) % 10] ?? 'th';
  return `${n}${suffix}`;
};
const DATE = String.raw`(\d{1,2}[./-]\d{1,2}[./-]\d{2,4})`;
const tidy = (s: string) => s.replace(/\s+/g, ' ').trim();
const fy = (s: string) => {
  const m = /(20\d{2})\s*[-–/]\s*(\d{2,4})/.exec(s);
  return m ? `FY ${m[1]}-${m[2]!.slice(-2)}` : '';
};

function snippetAt(text: string, index: number, length: number) {
  const from = Math.max(0, index - 60);
  const to = Math.min(text.length, index + length + 60);
  return `${from > 0 ? '…' : ''}${tidy(text.slice(from, to))}${to < text.length ? '…' : ''}`;
}

type Rule = {
  /** Document keys the rule reads; empty means any. */
  docs: string[];
  label: string;
  target: SuggestionTarget;
  re: RegExp;
  value: (m: RegExpExecArray, all: string) => string;
};

const RULES: Rule[] = [
  {
    docs: ['tccm-proceedings', 'tccm-proposal'],
    label: 'Approval',
    target: { kind: 'detail', key: 'approval' },
    re: new RegExp(String.raw`(\d{1,3})\s*(?:st|nd|rd|th)?\s+TCCM\s+(?:meeting\s+)?(?:of\s+([A-Z]{3,10})\s*)?(?:\(([^)]{3,30})\)\s*)?[^.\n]{0,40}?held\s+on\s+${DATE}`, 'i'),
    value: (m, all) => {
      const sub = /Sub(?:ject)?\.?\s*No\.?\s*[-:.]?\s*(\d{1,4})/i.exec(all);
      return tidy(`${ord(m[1]!)} TCCM${m[2] ? ` of ${m[2].toUpperCase()}` : ''}${m[3] ? ` (${m[3]})` : ''} held on ${m[4]}${sub ? `, Subject-${sub[1]}` : ''}.`);
    },
  },
  {
    docs: [],
    label: 'APW code',
    target: { kind: 'detail', key: 'apwCode' },
    re: /APW\s*code\s*(?:No\.?)?\s*[:\-–]?\s*([A-Z]{1,4}\s?\d{2,6})/i,
    value: (m) => m[1]!.replace(/\s/g, '').toUpperCase(),
  },
  {
    docs: [],
    label: 'Financial year',
    target: { kind: 'detail', key: 'financialYear' },
    re: /(?:F\.?Y\.?|financial\s+year)\s*[:\-–]?\s*(20\d{2}\s*[-–/]\s*\d{2,4})/i,
    value: (m) => fy(m[1]!),
  },
  {
    docs: [],
    label: 'Budget provision',
    target: { kind: 'detail', key: 'budgetProvision' },
    re: /List\s*[-–:]?\s*(IV|III|II|I|V)\b[^.\n]{0,40}?(?:F\.?Y\.?|financial\s+year)\s*[:\-–]?\s*(20\d{2}\s*[-–/]\s*\d{2,4})/i,
    value: (m, all) => {
      const apw = /APW\s*code\s*(?:No\.?)?\s*[:\-–]?\s*([A-Z]{1,4}\s?\d{2,6})/i.exec(all);
      return `Included in List – ${m[1]!.toUpperCase()}, ${fy(m[2]!)}${apw ? ` APW Code: ${apw[1]!.replace(/\s/g, '').toUpperCase()}` : ''}.`;
    },
  },
  {
    docs: ['layout-drawing', 'single-line-diagram-sld', 'bill-of-quantity-electrical'],
    label: 'Layout/BOM letter',
    target: { kind: 'salient', label: 'Layout/BOM' },
    re: new RegExp(String.raw`letter\s+No\.?\s*[:\-–]?\s*([A-Z0-9][A-Z0-9/().\-:&, ]{3,70}?)\s*,?\s*(?:dated|dtd\.?|Dt\.?)\s*[:\-–]?\s*${DATE}`, 'i'),
    value: (m) => `The Bill of Material for the work was issued vide letter No. ${tidy(m[1]!)}, dated ${m[2]}, of the Chief Engineer (Elec.), Planning & Co-ordination, KPTCL.`,
  },
  {
    docs: ['earth-mat-design'],
    label: 'Earthmat drawing',
    target: { kind: 'salient', label: 'Earthing materials' },
    re: new RegExp(String.raw`Dr(?:g|awing)\.?\s*No\.?\s*[:\-–]?\s*([A-Z0-9][A-Z0-9/().\-]{2,40})[^\n]{0,30}?(?:dated|dtd\.?|Dt\.?)\s*[:\-–]?\s*${DATE}`, 'i'),
    value: (m) => `Earthmat is provided as per the SEE (R&D) design, Drg. No. ${m[1]}, dated ${m[2]}.`,
  },
  {
    docs: ['transformer-feeder-load-details', 'tccm-proceedings', 'tccm-proposal'],
    label: 'Recorded peak load (MW)',
    target: { kind: 'load', key: 'peakMw' },
    re: /(?:peak|max(?:imum)?)\.?\s*(?:recorded\s+)?load[^0-9\n]{0,30}(\d{1,3}(?:\.\d{1,2})?)\s*MW/i,
    value: (m) => m[1]!,
  },
  {
    docs: ['transformer-feeder-load-details'],
    label: 'Existing transformers',
    target: { kind: 'load', key: 'existing' },
    re: /(\d)\s*[x×X]\s*(\d{1,3}(?:\.\d{1,2})?)\s*MVA/,
    value: (m) => `${m[1]}x${m[2]} MVA`,
  },
];

/** Suggestions from the files' text, one per fact (the first file and page that has it). */
export function extractFacts(texts: FileText[]): FactSuggestion[] {
  const out: FactSuggestion[] = [];
  for (const rule of RULES) {
    let found: FactSuggestion | null = null;
    for (const t of texts) {
      if (rule.docs.length && !rule.docs.includes(t.docKey)) continue;
      const all = t.pages.join('\n');
      for (let p = 0; p < t.pages.length && !found; p++) {
        const page = t.pages[p]!;
        const m = rule.re.exec(page);
        if (!m) continue;
        const value = rule.value(m, all);
        if (!value) continue;
        found = { id: `${rule.label}|${t.file}|${p}`, label: rule.label, value, target: rule.target, file: t.file, page: t.pages.length > 1 ? p + 1 : undefined, snippet: snippetAt(page, m.index, m[0].length) };
      }
      if (found) break;
    }
    if (found) out.push(found);
  }
  return out;
}

/** Reads the text of a PDF (its text layer), a Word .docx or a plain text file. */
export async function readFileText(file: { name: string; type: string; bytes: ArrayBuffer }, docKey: string): Promise<FileText> {
  const n = file.name.toLowerCase();
  const base = { file: file.name, docKey };
  try {
    if (file.type === 'application/pdf' || n.endsWith('.pdf')) {
      const pdfjs = await import('pdfjs-dist');
      if (!pdfjs.GlobalWorkerOptions.workerSrc) pdfjs.GlobalWorkerOptions.workerSrc = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
      const doc = await pdfjs.getDocument({ data: new Uint8Array(file.bytes.slice(0)) }).promise;
      const pages: string[] = [];
      for (let i = 1; i <= Math.min(doc.numPages, 60); i++) {
        const c = await (await doc.getPage(i)).getTextContent();
        pages.push(c.items.map((it) => ('str' in it ? it.str + (it.hasEOL ? '\n' : ' ') : '')).join(''));
      }
      await doc.destroy();
      const empty = !pages.join('').trim();
      return { ...base, pages, note: empty ? 'no text layer (a scanned PDF?); type its facts by hand' : undefined };
    }
    if (n.endsWith('.docx')) {
      const JSZip = (await import('jszip')).default;
      const zip = await JSZip.loadAsync(file.bytes);
      const xml = (await zip.file('word/document.xml')?.async('string')) ?? '';
      return { ...base, pages: [xml.replace(/<\/w:p>/g, '\n').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')] };
    }
    if (file.type.startsWith('text/') || /\.(txt|csv)$/.test(n)) return { ...base, pages: [new TextDecoder().decode(file.bytes)] };
    return { ...base, pages: [], note: 'not a PDF, Word or text file' };
  } catch {
    return { ...base, pages: [], note: 'could not be read' };
  }
}
