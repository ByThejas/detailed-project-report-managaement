import Anthropic from '@anthropic-ai/sdk';
import type { IncomingMessage, ServerResponse } from 'node:http';

/**
 * Drafts one field of a DPR's Report text from the text of the documents uploaded for that DPR.
 *
 * Runs as a Vercel function (POST /api/ai/draft) and, in `npm run dev`, inside the Vite dev server
 * (see vite.config.ts). The browser reads the files (PDF text layer, Word, text) and sends their
 * text page by page; nothing else leaves the browser. Each page is a citable block, so every
 * sentence that rests on a document comes back with its file, page and quoted words.
 *
 * Settings, from the environment (.env.local in development, project settings on Vercel):
 * - ANTHROPIC_API_KEY: required. Without it the endpoint answers 501 and the app drafts from
 *   its own file scan instead.
 * - AI_ACCESS_CODE: optional team passcode. When set, requests must send it in x-ai-access-code.
 */

export const config = { maxDuration: 60 };

export const MODEL = 'claude-opus-5-5';

/** Characters of document text sent per request (about 150k tokens). */
const MAX_CHARS = 600_000;

export interface DraftFile {
  name: string;
  /** Which input document it was uploaded as, e.g. "tccm-proceedings". */
  docKey: string;
  docName: string;
  pages: string[];
}

export interface DraftRequest {
  field: {
    /** Where the text goes in the DPR, e.g. "Section 02 c. Problems". */
    where: string;
    label: string;
    /** What the text must say and in what form. */
    guide: string;
    /** The kind of wording a finished KPTCL DPR uses here. */
    example?: string;
    /** Document keys most likely to hold the facts, read first when the text has to be trimmed. */
    docs?: string[];
  };
  /** Facts already known from the DPR record, the estimate and the other fields. */
  facts: Record<string, string>;
  /** What the field says now, if anything. */
  current?: string;
  files: DraftFile[];
}

export interface DraftCitation {
  file: string;
  page?: number;
  quote: string;
}

export interface DraftResponse {
  text: string;
  citations: DraftCitation[];
  /** Facts the documents did not give, as named in [missing: …] notes. */
  missing: string[];
  /** Files or pages left out because the text was too long. */
  trimmed: string[];
  model: string;
}

const SYSTEM = `You draft the text of Detailed Project Reports (DPRs) for KPTCL (Karnataka Power Transmission Corporation Ltd.) transmission works: new and augmented substations, additional or replacement power transformers, LILO arrangements and lines.

You are given the documents uploaded for one DPR (TCCM proceedings and proposals, load details, layout and BOM letters, earthmat design, survey and other papers), facts from the DPR record and its estimate, and one field to write.

Rules:
- Every fact (number, rating, name, date, letter number, place, load, approval) must come from the documents or the given facts. Never invent, estimate or assume one.
- When a fact the field needs is not in the sources, write [missing: what is needed] at that place, e.g. [missing: date of the TCCM meeting]. When the sources disagree, write [conflict: what differs and where].
- If the documents hold nothing for this field at all, answer only: [missing: no uploaded document covers <what the field needs>].
- Write in the formal, impersonal style of KPTCL DPRs, Indian English, past tense for what was approved and future tense for what is proposed. Use KPTCL terms: power transformer, MVA, kV, sub-station or substation as the documents spell it, TCCM, APW code, List – III.
- Answer with the field's text only: no heading, no preamble, no notes about sources, no markdown. For numbered points start each line with "1.", "2." and so on. Separate paragraphs with a blank line.
- Keep to the length a finished DPR uses for this field; a one-line fact stays one line.
- Never write cost, BCR, IRR, payback or expenditure figures; the app fills those from the estimate.`;

const tidy = (s: string) => s.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();

/** Puts the files the field needs first and keeps the total under MAX_CHARS, dropping whole pages from the end. */
export function selectPages(files: DraftFile[], preferred: string[] = []): { files: DraftFile[]; trimmed: string[] } {
  const rank = (f: DraftFile) => {
    const i = preferred.indexOf(f.docKey);
    return i < 0 ? preferred.length : i;
  };
  const ordered = files
    .map((f) => ({ ...f, pages: f.pages.map(tidy) }))
    .filter((f) => f.pages.some((p) => p))
    .sort((a, b) => rank(a) - rank(b));
  let left = MAX_CHARS;
  const kept: DraftFile[] = [];
  const trimmed: string[] = [];
  for (const f of ordered) {
    const pages: string[] = [];
    for (const p of f.pages) {
      if (p.length > left) break;
      pages.push(p);
      left -= p.length;
    }
    if (pages.length < f.pages.length) trimmed.push(pages.length ? `${f.name} (pages after ${pages.length})` : f.name);
    if (pages.some((p) => p)) kept.push({ ...f, pages });
  }
  return { files: kept, trimmed };
}

function userPrompt(req: DraftRequest): string {
  const facts = Object.entries(req.facts)
    .filter(([, v]) => v?.trim())
    .map(([k, v]) => `- ${k}: ${v.trim()}`)
    .join('\n');
  return [
    `Write the "${req.field.label}" field of this DPR (${req.field.where}).`,
    `What it needs: ${req.field.guide}`,
    req.field.example ? `How a finished KPTCL DPR words it (for form only; take no facts from it):\n${req.field.example}` : '',
    facts ? `Facts from the DPR record and estimate:\n${facts}` : '',
    req.current?.trim() ? `The field says now (keep what is right, replace [bracketed] notes):\n${req.current.trim()}` : '',
    'Answer with the field text only.',
  ]
    .filter(Boolean)
    .join('\n\n');
}

/** Pulls the [missing: …] notes out of a draft. */
export const missingNotes = (text: string) => [...text.matchAll(/\[missing:\s*([^\]]+)\]/gi)].map((m) => m[1]!.trim());

export async function draftField(req: DraftRequest, apiKey: string): Promise<DraftResponse> {
  const { files, trimmed } = selectPages(req.files, req.field.docs);
  if (!files.length) {
    const text = '[missing: no readable text in the uploaded documents]';
    return { text, citations: [], missing: missingNotes(text), trimmed, model: MODEL };
  }
  const client = new Anthropic({ apiKey });
  const documents: Anthropic.Beta.BetaRequestDocumentBlock[] = files.map((f, i) => ({
    type: 'document',
    title: f.name,
    context: `Uploaded as: ${f.docName}. Each content block is one page${f.pages.length > 1 ? `, pages 1 to ${f.pages.length}` : ''}.`,
    source: { type: 'content', content: f.pages.map((p) => ({ type: 'text', text: p || ' ' })) },
    citations: { enabled: true },
    // The documents stay the same while the user drafts field after field, so they are cached.
    ...(i === files.length - 1 ? { cache_control: { type: 'ephemeral' } } : {}),
  }));
  const res = await client.beta.messages.create({
    model: MODEL,
    max_tokens: 16000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    thinking: { type: 'adaptive' },
    output_config: { effort: 'medium' },
    system: SYSTEM,
    messages: [{ role: 'user', content: [...documents, { type: 'text', text: userPrompt(req) }] }],
  });
  if (res.stop_reason === 'refusal') throw new Error('The model declined to draft this field.');

  let text = '';
  const citations: DraftCitation[] = [];
  const seen = new Set<string>();
  for (const block of res.content) {
    if (block.type !== 'text') continue;
    text += block.text;
    for (const c of block.citations ?? []) {
      if (c.type !== 'content_block_location') continue;
      const file = files[c.document_index];
      const page = file && file.pages.length > 1 ? c.start_block_index + 1 : undefined;
      const quote = c.cited_text.replace(/\s+/g, ' ').trim().slice(0, 240);
      const key = `${c.document_index}|${page}|${quote}`;
      if (seen.has(key)) continue;
      seen.add(key);
      citations.push({ file: c.document_title ?? file?.name ?? 'document', page, quote });
    }
  }
  text = text.trim();
  return { text, citations, missing: missingNotes(text), trimmed, model: res.model };
}

export interface Env {
  ANTHROPIC_API_KEY?: string;
  AI_ACCESS_CODE?: string;
}

/** Shared by the Vercel function and the dev server: status and JSON body for one request. */
export async function handleDraft(method: string | undefined, body: unknown, accessCode: string | undefined, env: Env): Promise<{ status: number; json: unknown }> {
  if (!env.ANTHROPIC_API_KEY) return { status: 501, json: { error: 'not-configured', message: 'ANTHROPIC_API_KEY is not set on the server.' } };
  if (env.AI_ACCESS_CODE && accessCode !== env.AI_ACCESS_CODE) return { status: 401, json: { error: 'access-code', message: 'The team AI passcode is missing or wrong.' } };
  if (method === 'GET') return { status: 200, json: { ok: true, model: MODEL } };
  if (method !== 'POST') return { status: 405, json: { error: 'method', message: 'Use POST.' } };
  const req = body as DraftRequest | undefined;
  if (!req?.field?.label || !Array.isArray(req.files)) return { status: 400, json: { error: 'bad-request', message: 'Send a field and the files’ text.' } };
  try {
    return { status: 200, json: await draftField(req, env.ANTHROPIC_API_KEY) };
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) return { status: 429, json: { error: 'rate-limit', message: 'Too many requests to the AI service; try again in a minute.' } };
    if (e instanceof Anthropic.AuthenticationError) return { status: 502, json: { error: 'api-key', message: 'The server’s ANTHROPIC_API_KEY was refused.' } };
    if (e instanceof Anthropic.APIError) return { status: 502, json: { error: 'api', message: `The AI service answered ${e.status ?? 'with an error'}: ${e.message}` } };
    return { status: 500, json: { error: 'failed', message: e instanceof Error ? e.message : 'Drafting failed.' } };
  }
}

async function readBody(req: IncomingMessage & { body?: unknown }): Promise<unknown> {
  if (req.body !== undefined) return typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  const raw = Buffer.concat(chunks).toString('utf8');
  return raw ? JSON.parse(raw) : undefined;
}

/** Node handler: the Vercel function, also mounted by the Vite dev server. */
export default async function handler(req: IncomingMessage & { body?: unknown }, res: ServerResponse, env: Env = { ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY, AI_ACCESS_CODE: process.env.AI_ACCESS_CODE }) {
  let body: unknown;
  try {
    body = req.method === 'POST' ? await readBody(req) : undefined;
  } catch {
    body = undefined;
  }
  const code = req.headers['x-ai-access-code'];
  const out = await handleDraft(req.method, body, Array.isArray(code) ? code[0] : code, env);
  res.statusCode = out.status;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(out.json));
}
