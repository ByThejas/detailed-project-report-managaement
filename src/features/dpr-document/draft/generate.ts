import type { DprDocuments } from '@/features/documents/types';
import { allDocsOf } from '@/features/documents/state';
import type { Estimate } from '@/features/preparation/types';
import { hasLineWorks } from '@/features/preparation/calc';
import { loadFigures, lf2 } from '@/features/preparation/load';
import type { DprRow } from '@/features/reports/types';
import { getFile } from '@/lib/fileStore';
import { readJson, writeJson } from '@/lib/storage';
import { DETAIL_FIELDS, PLACEHOLDER, SECTIONS, defaultContent, isLineOnly, type DprContent } from '../content';
import { readFileText, type FileText } from '../extract';
import { guideOf, type DraftTarget } from './fields';
import { scanDraft } from './scan';

/**
 * The Generate button behind every Report text field: reads the documents uploaded for the DPR and
 * drafts that field. With AI drafting set up on the server it asks Claude, sending the files' text
 * page by page so every fact comes back with its file, page and quoted words; otherwise it drafts
 * from the app's own scan. Facts the documents don't give become [missing: …] notes, which keep
 * the DPR a draft until someone fills them (ADR-0002). Nothing is written into the field until the
 * user presses Use.
 */

export interface DraftContext {
  dpr: DprRow;
  estimate: Estimate;
  documents: DprDocuments;
  content: DprContent;
}

export interface DraftCitation {
  file: string;
  page?: number;
  quote: string;
}

export interface DraftResult {
  text: string;
  citations: DraftCitation[];
  missing: string[];
  /** Numbers in the draft that appear in no document and no known fact. */
  unverified: string[];
  /** ai: drafted by Claude from the files. scan: the app's own scan. app: set by the app (not from documents). */
  engine: 'ai' | 'scan' | 'app';
  /** Files that could not be read, text trimmed, or why AI was not used. */
  notes: string[];
}

/** Thrown when the server wants the team passcode. */
export class AccessCodeNeeded extends Error {
  constructor(public wrong: boolean) {
    super(wrong ? 'The team AI passcode was not accepted.' : 'Enter the team AI passcode to draft with AI.');
  }
}

const CODE_KEY = 'dpr.aiAccessCode';
export const aiAccessCode = () => readJson<string>(CODE_KEY, '');
export const setAiAccessCode = (code: string) => writeJson(CODE_KEY, code);

/** Characters of document text sent per request; the server keeps the same limit. */
const MAX_CHARS = 600_000;

// ---- Reading the uploaded files, once per set of files ----

interface Sources {
  texts: FileText[];
  notes: string[];
}
const cache = new Map<string, Promise<Sources>>();

const attachedFiles = (docs: DprDocuments) => Object.entries(docs.files).flatMap(([key, fs]) => fs.map((f) => ({ key, name: f.name, addedAt: f.addedAt })));

/** The text of every file uploaded for the DPR. Cached until a file is added or removed. */
export function readSources(dpr: DprRow, docs: DprDocuments): Promise<Sources> {
  const files = attachedFiles(docs);
  const sig = `${dpr.id}|${files.map((f) => `${f.key}/${f.name}/${f.addedAt}`).join('|')}`;
  let hit = cache.get(sig);
  if (!hit) {
    hit = (async () => {
      const texts: FileText[] = [];
      const notes: string[] = [];
      for (const a of files) {
        const f = await getFile(dpr.id, a.key, a.name);
        if (!f) {
          notes.push(`${a.name}: not stored in this browser; attach it again in Documents so it can be read`);
          continue;
        }
        const t = await readFileText({ name: f.name, type: f.type, bytes: f.data }, a.key);
        if (t.note) notes.push(`${a.name}: ${t.note}`);
        if (t.pages.some((p) => p.trim())) texts.push(t);
      }
      return { texts, notes };
    })();
    hit.catch(() => cache.delete(sig));
    cache.set(sig, hit);
  }
  return hit;
}

export const clearSourceCache = () => cache.clear();

// ---- What the app already knows ----

const fieldLabel = new Map<string, string>([...DETAIL_FIELDS.map((f) => [f.key, f.label] as const), ...SECTIONS.map((s) => [s.key, s.title] as const)]);
const filled = (v: string | undefined) => Boolean(v?.trim()) && !PLACEHOLDER.test(v!);

/** Facts from the DPR record, the estimate, the load data and the fields already written. */
export function knownFacts(ctx: DraftContext, except?: DraftTarget): Record<string, string> {
  const { dpr, estimate: e, content } = ctx;
  const out: Record<string, string> = {
    'Project (as created in the app)': dpr.project,
    'Brown or green field': dpr.stream,
    'Work type': dpr.workType ?? 'Station work',
    Voltage: dpr.voltage,
    'Capacity added': dpr.capacity,
    'Existing station': dpr.station,
    Zone: dpr.zone,
    Circle: dpr.circle,
    Division: dpr.division,
    'Line works in the estimate': hasLineWorks(e) ? 'yes' : 'no',
  };
  if (e.load?.existing) out['Existing transformers (load data)'] = e.load.existing;
  if (e.load?.peakMw) out['Recorded peak load (load data)'] = `${e.load.peakMw} MW`;
  const lf = loadFigures(e.load, dpr.capacity);
  if (lf) out['Loading factor now / after the work'] = `${lf2(lf.now)} / ${lf2(lf.after)}`;
  const items = [...e.lines]
    .filter((l) => l.section === 'electrical' || l.section === 'line' || l.section === 'dismantling')
    .sort((a, b) => b.qty * (b.supplyRate + b.erectionRate) - a.qty * (a.supplyRate + a.erectionRate))
    .slice(0, 15)
    .map((l) => `${l.description.replace(/\s+/g, ' ').slice(0, 140)} (${l.qty} ${l.unit})`);
  if (items.length) out['Main estimate items'] = items.join('; ');
  for (const [k, v] of Object.entries(content.details)) if (!(except?.kind === 'detail' && except.key === k) && filled(v)) out[fieldLabel.get(k) ?? k] = v;
  for (const [k, v] of Object.entries(content.sections))
    if (!(except?.kind === 'section' && except.key === k) && filled(v) && ['scope', 'approvals', 'budget', 'proposals'].includes(k)) out[`Section: ${fieldLabel.get(k) ?? k}`] = v;
  return Object.fromEntries(Object.entries(out).filter(([, v]) => v?.trim()));
}

// ---- Checks on a draft ----

export const missingNotes = (text: string) => [...text.matchAll(/\[(?:missing|conflict):\s*([^\]]+)\]/gi)].map((m) => m[0].slice(1, -1).trim());

/** Numbers (ratings, loads, dates, codes) in the draft that no document and no known fact contains. */
export function unverifiedNumbers(text: string, texts: FileText[], facts: Record<string, string>): string[] {
  const squash = (s: string) => s.replace(/[\s,]/g, '');
  const hay = squash([...texts.flatMap((t) => t.pages), ...Object.values(facts)].join(' '));
  const body = text.replace(/\[[^\]]*\]/g, ' ');
  const nums = body.match(/\d+(?:[.,/-]\d+)*/g) ?? [];
  const out = new Set<string>();
  for (const n of nums) {
    if (n.length < 2 && !/[.,]/.test(n)) continue; // list numbers, single digits
    if (/^(19|20)\d{2}$/.test(n) && hay.includes(n.slice(2))) continue; // a year written "26-27"
    if (!hay.includes(squash(n))) out.add(n);
  }
  return [...out];
}

// ---- Drafting ----

function appText(t: DraftTarget, ctx: DraftContext): string | null {
  const d = defaultContent(ctx.dpr, hasLineWorks(ctx.estimate), isLineOnly(ctx.estimate));
  if (t.kind === 'detail' && t.key === 'reportMonth') return d.details.reportMonth;
  if (t.kind === 'section' && (t.key === 'schedule' || t.key === 'costBenefit' || t.key === 'expenditure')) return d.sections[t.key];
  if (t.kind === 'salient' && t.label === 'Certificate') return d.salient.find((r) => r.label === 'Certificate')?.value ?? null;
  return null;
}

function whereOf(t: DraftTarget): string {
  if (t.kind === 'salient') return `section 02, salient features, "${t.label}" row`;
  if (t.kind === 'section') return `section 02 Project report, part "${fieldLabel.get(t.key)}"`;
  const f = DETAIL_FIELDS.find((x) => x.key === t.key)!;
  return f.group === 'glance' ? 'section 01 Project at a glance' : f.group === 'cover' ? 'cover page and page footer' : 'general abstract of the estimate';
}

export const labelOf = (t: DraftTarget) => (t.kind === 'salient' ? t.label : fieldLabel.get(t.key) ?? t.key);

type AiAnswer = { ok: true; text: string; citations: DraftCitation[]; trimmed: string[] } | { ok: false; reason: string };

async function askAi(t: DraftTarget, ctx: DraftContext, texts: FileText[], facts: Record<string, string>, current: string): Promise<AiAnswer> {
  const names = new Map(allDocsOf(ctx.documents).map((d) => [d.key, d.name]));
  let left = MAX_CHARS;
  const files = texts.map((f) => {
    const pages: string[] = [];
    for (const p of f.pages) {
      const s = p.replace(/[ \t]+/g, ' ');
      if (s.length > left) break;
      pages.push(s);
      left -= s.length;
    }
    return { name: f.file, docKey: f.docKey, docName: names.get(f.docKey) ?? f.docKey, pages };
  });
  const g = guideOf(t);
  let res: Response;
  try {
    res = await fetch('/api/ai/draft', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-ai-access-code': aiAccessCode() },
      body: JSON.stringify({ field: { where: whereOf(t), label: labelOf(t), guide: g.guide, example: g.example, docs: g.docs }, facts, current, files: files.filter((f) => f.pages.length) }),
    });
  } catch {
    return { ok: false, reason: 'AI drafting could not be reached' };
  }
  if (res.status === 401) throw new AccessCodeNeeded(Boolean(aiAccessCode()));
  const body = (await res.json().catch(() => null)) as { text?: string; citations?: DraftCitation[]; trimmed?: string[]; message?: string; error?: string } | null;
  if (res.status === 404 || res.status === 501 || !body) return { ok: false, reason: 'AI drafting is not set up (no ANTHROPIC_API_KEY on the server)' };
  if (!res.ok) return { ok: false, reason: `AI drafting failed: ${body.message ?? res.status}` };
  return { ok: true, text: body.text ?? '', citations: body.citations ?? [], trimmed: body.trimmed ?? [] };
}

/** Drafts one field from the DPR's documents. */
export async function generateDraft(t: DraftTarget, ctx: DraftContext, current = ''): Promise<DraftResult> {
  const fixed = appText(t, ctx);
  if (fixed !== null) return { text: fixed, citations: [], missing: [], unverified: [], engine: 'app', notes: ['Set by the app from the DPR’s own data and KPTCL practice, not from the documents.'] };
  const g = guideOf(t);
  if (g.notInDocuments) {
    const text = `[missing: ${g.notInDocuments}; project documents don’t give this, so type it in]`;
    return { text, citations: [], missing: missingNotes(text), unverified: [], engine: 'app', notes: [] };
  }

  const { texts, notes } = await readSources(ctx.dpr, ctx.documents);
  const facts = knownFacts(ctx, t);
  if (!texts.length) {
    const text = '[missing: no readable uploaded documents; attach the TCCM papers and load details in Documents]';
    return { text, citations: [], missing: missingNotes(text), unverified: [], engine: 'scan', notes };
  }

  const ai = await askAi(t, ctx, texts, facts, current);
  const out = ai.ok ? { text: ai.text, citations: ai.citations, engine: 'ai' as const, notes: [...notes, ...ai.trimmed.map((x) => `Left out (too long to send): ${x}`)] } : { ...scanDraft(t, texts, ctx), engine: 'scan' as const, notes: [...notes, `${ai.reason}; drafted from the app’s own scan of the files instead.`] };
  return { ...out, missing: missingNotes(out.text), unverified: unverifiedNumbers(out.text, texts, facts) };
}
