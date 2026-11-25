import { extractFacts, type FactSuggestion, type FileText } from '../extract';
import { existingCapacityText, loadFigures } from '@/features/preparation/load';
import type { DraftContext, DraftCitation } from './generate';
import type { DraftTarget } from './fields';

/**
 * Drafts a field from the app's own scan of the uploaded files, without AI: the facts the
 * "Suggestions from your files" rules find (TCCM approval, APW code, list and year, BOM letter,
 * earthmat drawing, load), the subject line and taluk/district in the papers, and the load data.
 * Anything it cannot find is left as a [missing: …] note, never guessed (ADR-0002).
 */

export interface ScanDraft {
  text: string;
  citations: DraftCitation[];
}

const cite = (s: FactSuggestion): DraftCitation => ({ file: s.file, page: s.page, quote: s.snippet });
const noDot = (s: string) => s.trim().replace(/\.$/, '');
const tidy = (s: string) => s.replace(/\s+/g, ' ').trim();

/** Finds a pattern in the files, the preferred documents first. */
function find(texts: FileText[], re: RegExp, docs: string[] = []): { m: RegExpExecArray; citation: DraftCitation } | null {
  const ordered = [...texts].sort((a, b) => Number(!docs.includes(a.docKey)) - Number(!docs.includes(b.docKey)));
  for (const t of ordered) {
    for (let p = 0; p < t.pages.length; p++) {
      const page = t.pages[p]!;
      const m = re.exec(page);
      if (!m) continue;
      const from = Math.max(0, m.index - 40);
      return { m, citation: { file: t.file, page: t.pages.length > 1 ? p + 1 : undefined, quote: tidy(page.slice(from, m.index + m[0].length + 40)) } };
    }
  }
  return null;
}

const TCCM = ['tccm-proceedings', 'tccm-proposal'];
const SUBJECT = /\bSub(?:ject)?\s*[:\-–.]\s*([A-Z][^\n]{25,320}?)(?:\.\s|\n|\s+Ref\b|$)/;
const TALUK = /\b([A-Z][A-Za-z]+)\s+(?:Taluk|Tq\.?)\b/;
const DISTRICT = /\b([A-Z][A-Za-z]+)\s+(?:District|Dist\.)/;

export function scanDraft(target: DraftTarget, texts: FileText[], ctx: DraftContext): ScanDraft {
  const facts = extractFacts(texts);
  const fact = (label: string) => facts.find((f) => f.label === label);
  const fromFact = (label: string, missing: string, wrap: (v: string) => string = (v) => v): ScanDraft => {
    const f = fact(label);
    return f ? { text: wrap(f.value), citations: [cite(f)] } : { text: `[missing: ${missing}]`, citations: [] };
  };
  const notFound = (what: string): ScanDraft => ({ text: `[missing: ${what}]`, citations: [] });

  const place = () => {
    const taluk = find(texts, TALUK);
    const district = find(texts, DISTRICT);
    return { taluk, district, citations: [taluk?.citation, district?.citation].filter((c): c is DraftCitation => Boolean(c)) };
  };

  if (target.kind === 'detail') {
    switch (target.key) {
      case 'approval':
        return fromFact('Approval', 'TCCM meeting, date and subject number');
      case 'apwCode':
        return fromFact('APW code', 'APW code');
      case 'financialYear':
        return fromFact('Financial year', 'financial year of the budget provision');
      case 'budgetProvision':
        return fromFact('Budget provision', 'budget list, financial year and APW code');
      case 'nameOfWork':
      case 'coverTitle': {
        const s = find(texts, SUBJECT, TCCM);
        return s ? { text: noDot(tidy(s.m[1]!)) + '.', citations: [s.citation] } : notFound('name of work as approved (subject line of the TCCM papers)');
      }
      case 'coverSubtitle': {
        const p = place();
        if (!p.taluk && !p.district) return notFound('taluk and district');
        return { text: `${p.taluk ? `${p.taluk.m[1]} Taluk` : '[missing: taluk]'}, ${p.district ? `${p.district.m[1]} District` : '[missing: district]'}.`, citations: p.citations };
      }
      case 'location': {
        const p = place();
        const d = ctx.dpr;
        const station = d.station || d.location;
        const parts = [station && `${d.voltage} ${station} Substation`.trim(), p.taluk && `${p.taluk.m[1]} Taluk`, p.district && `${p.district.m[1]} District`].filter(Boolean);
        const text = parts.length ? `${parts.join(', ')}${d.division ? `; ${d.division} Division` : ''}` : '';
        return text ? { text: p.district ? text : `${text} [missing: district]`, citations: p.citations } : notFound('station, taluk and district');
      }
      case 'existingCapacity': {
        const f = loadFigures(ctx.estimate.load, ctx.dpr.capacity);
        if (f && ctx.estimate.load) return { text: existingCapacityText(ctx.estimate.load, ctx.dpr.voltage, f), citations: [] };
        const mw = fact('Recorded peak load (MW)');
        const tx = fact('Existing transformers');
        if (!mw && !tx) return notFound('existing transformers and recorded peak load');
        return {
          text: `${tx ? tx.value.replace(/x/i, '×') : '[missing: existing transformers]'}${ctx.dpr.voltage.includes('/') ? `, ${ctx.dpr.voltage}` : ''} — recorded peak load ${mw ? `${mw.value} MW` : '[missing: recorded peak load]'}`,
          citations: [tx, mw].filter((x): x is FactSuggestion => Boolean(x)).map(cite),
        };
      }
      case 'mvaAdded':
        return ctx.dpr.capacity ? { text: `${ctx.dpr.capacity.replace(/\s*x\s*/i, '×')}${ctx.dpr.voltage ? `, ${ctx.dpr.voltage}` : ''}.`, citations: [] } : notFound('capacity added');
      case 'jurisdiction':
        return ctx.dpr.zone ? { text: `${ctx.dpr.zone} Zone`, citations: [] } : notFound('Transmission (Operations) zone');
      case 'runningTitle':
        return ctx.dpr.project ? { text: ctx.dpr.project, citations: [] } : notFound('a short title');
      case 'substationEstimateTitle': {
        const name = ctx.content.details.nameOfWork?.trim() || ctx.dpr.project;
        return name ? { text: `Estimate for ${noDot(name.charAt(0).toLowerCase() + name.slice(1))}`, citations: [] } : notFound('name of work');
      }
      default:
        return notFound(`${target.key === 'signatory' ? 'the signing officer' : 'this text'}: not found by the file scan`);
    }
  }

  if (target.kind === 'section') {
    switch (target.key) {
      case 'approvals':
        return fromFact('Approval', 'TCCM meeting, date and subject number', (v) => `The subject work was approved in the ${noDot(v)}.`);
      case 'budget':
        return fromFact('Budget provision', 'budget list, financial year and APW code', (v) => `The subject work is ${noDot(v.charAt(0).toLowerCase() + v.slice(1))}.`);
      case 'existing': {
        const f = loadFigures(ctx.estimate.load, ctx.dpr.capacity);
        const station = ctx.dpr.station || ctx.dpr.location || 'the station';
        if (f && ctx.estimate.load) return { text: `1. [missing: source station and line feeding ${station}]\n2. The station has ${existingCapacityText(ctx.estimate.load, ctx.dpr.voltage, f)}.`, citations: [] };
        return notFound('source station, line, installed capacity and recorded peak loads');
      }
      case 'problems': {
        const f = loadFigures(ctx.estimate.load, ctx.dpr.capacity);
        if (f && f.now >= 0.75) return { text: `1. The existing ${ctx.estimate.load!.existing.replace(/x/i, '×')} power transformer at ${ctx.dpr.station || 'the station'} is loaded to ${Math.floor(f.now * 100)}% with a recorded peak load of ${ctx.estimate.load!.peakMw} MW.\n2. [missing: further problems stated in the TCCM papers]`, citations: [] };
        return notFound('the problem this work solves, as stated in the TCCM papers');
      }
      default:
        return notFound('this text: the app’s own file scan only picks out set facts (approval, budget, letters, load), so write it by hand or set up AI drafting');
    }
  }

  if (target.label === 'Layout/BOM') return fromFact('Layout/BOM letter', 'BOM letter number, date and issuing office');
  if (target.label === 'Earthing materials') return fromFact('Earthmat drawing', 'earthmat drawing number and date');
  return notFound(`${target.label}: not found by the file scan`);
}
