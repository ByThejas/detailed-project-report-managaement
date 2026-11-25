import { useId, useState, type ReactNode } from 'react';
import { Check, FileSearch, Sparkles, TriangleAlert, X } from 'lucide-react';
import { AccessCodeNeeded, generateDraft, labelOf, setAiAccessCode, type DraftContext, type DraftResult } from './generate';
import type { DraftTarget } from './fields';

interface Props {
  target: DraftTarget;
  /** Without documents (e.g. outside DPR preparation) the button is not shown. */
  ctx: DraftContext | null;
  current: string;
  onUse: (text: string) => void;
  /** Renders the field: its id for the control, the Generate button, and the draft panel to place under it. */
  children: (parts: { id: string; button: ReactNode; panel: ReactNode }) => ReactNode;
}

const ENGINE: Record<DraftResult['engine'], string> = {
  ai: 'Drafted with AI from your documents',
  scan: 'Drafted from the app’s scan of your documents',
  app: 'Filled in by the app',
};

/** A Report text field with a Generate button that drafts it from the DPR's uploaded documents. */
export function Draftable({ target, ctx, current, onUse, children }: Props) {
  const id = useId();
  const label = labelOf(target);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<DraftResult | null>(null);
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const [askCode, setAskCode] = useState<AccessCodeNeeded | null>(null);
  const [code, setCode] = useState('');

  const run = async () => {
    if (!ctx) return;
    setBusy(true);
    setError('');
    setAskCode(null);
    try {
      const d = await generateDraft(target, ctx, current);
      setDraft(d);
      setText(d.text);
    } catch (e) {
      if (e instanceof AccessCodeNeeded) setAskCode(e);
      else setError(e instanceof Error ? e.message : 'Could not draft this field.');
    } finally {
      setBusy(false);
    }
  };
  const close = () => {
    setDraft(null);
    setError('');
    setAskCode(null);
  };

  const button = ctx ? (
    <button type="button" className="btn-ghost h-6 shrink-0 gap-1 px-1.5 text-xs font-medium text-blue-700 hover:bg-blue-50" aria-label={`Generate ${label}`} title="Read the uploaded documents and draft this field" onClick={run} disabled={busy}>
      <Sparkles className={`h-3.5 w-3.5 ${busy ? 'animate-pulse' : ''}`} aria-hidden />
      {busy ? 'Reading…' : 'Generate'}
    </button>
  ) : null;

  let panel: ReactNode = null;
  if (askCode) {
    panel = (
      <form
        className="mt-2 flex flex-wrap items-center gap-2 rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-xs"
        onSubmit={(ev) => {
          ev.preventDefault();
          setAiAccessCode(code.trim());
          void run();
        }}
      >
        <span className="text-gray-700">{askCode.message}</span>
        <input type="password" aria-label="Team AI passcode" className="input h-7 w-40 text-xs" value={code} onChange={(ev) => setCode(ev.target.value)} autoComplete="off" />
        <button type="submit" className="btn-primary h-7 px-2 text-xs" disabled={!code.trim()}>
          Continue
        </button>
        <button type="button" className="btn-ghost h-7 px-2 text-xs" onClick={close}>
          Cancel
        </button>
      </form>
    );
  } else if (error) {
    panel = (
      <p role="alert" className="mt-2 flex items-center gap-2 text-xs text-rose-700">
        <TriangleAlert className="h-3.5 w-3.5" aria-hidden /> {error}
        <button type="button" className="btn-ghost h-6 px-1.5 text-xs" onClick={close}>
          Dismiss
        </button>
      </p>
    );
  } else if (draft) {
    const nothing = !draft.text.replace(/\[[^\]]*\]/g, '').trim();
    panel = (
      <div role="region" aria-label={`Draft for ${label}`} className="mt-2 rounded-md border border-blue-200 bg-blue-50/40 px-3 py-2 text-xs">
        <p className="mb-1 flex items-center gap-1.5 font-medium text-gray-700">
          <FileSearch className="h-3.5 w-3.5 text-blue-700" aria-hidden />
          {ENGINE[draft.engine]}
        </p>
        <textarea aria-label={`Drafted ${label}`} rows={Math.min(10, Math.max(2, text.split('\n').length + 1))} className="input h-auto w-full bg-white py-1.5 text-[13px] leading-relaxed" value={text} onChange={(ev) => setText(ev.target.value)} />
        {draft.missing.length > 0 && (
          <div className="mt-1.5 text-amber-800">
            <p className="font-medium">{nothing ? 'Not in the uploaded documents:' : 'Still to fill (not in the documents):'}</p>
            <ul className="list-disc pl-5">
              {draft.missing.map((m) => (
                <li key={m}>{m.replace(/^missing:\s*/i, '')}</li>
              ))}
            </ul>
          </div>
        )}
        {draft.unverified.length > 0 && (
          <p className="mt-1.5 text-rose-700">
            <TriangleAlert className="mr-1 inline h-3.5 w-3.5 align-[-2px]" aria-hidden />
            Not found in any document, check before using: {draft.unverified.join(', ')}
          </p>
        )}
        {draft.citations.length > 0 && (
          <details className="mt-1.5 text-gray-600">
            <summary className="cursor-pointer select-none">Sources ({draft.citations.length})</summary>
            <ul className="mt-1 space-y-1">
              {draft.citations.map((c, i) => (
                <li key={i}>
                  {c.file}
                  {c.page ? `, page ${c.page}` : ''}: <q className="italic">{c.quote}</q>
                </li>
              ))}
            </ul>
          </details>
        )}
        {draft.notes.length > 0 && (
          <ul className="mt-1.5 list-disc pl-5 text-gray-500">
            {draft.notes.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        )}
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="btn-primary h-7 px-2 text-xs"
            disabled={nothing}
            onClick={() => {
              onUse(text);
              close();
            }}
          >
            <Check className="h-3.5 w-3.5" aria-hidden /> {current.trim() ? 'Replace field text' : 'Use this text'}
          </button>
          <button type="button" className="btn-secondary h-7 px-2 text-xs" onClick={run} disabled={busy}>
            {busy ? 'Reading…' : 'Generate again'}
          </button>
          <button type="button" className="btn-ghost h-7 px-2 text-xs" onClick={close}>
            <X className="h-3.5 w-3.5" aria-hidden /> Discard
          </button>
        </div>
      </div>
    );
  }

  return <>{children({ id, button, panel })}</>;
}
