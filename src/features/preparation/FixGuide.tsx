import { ArrowLeft, ArrowRight, CheckCircle2, Crosshair, Wrench, X } from 'lucide-react';
import type { Gap } from '@/features/dpr-document/readiness';

/**
 * The bar shown at the top of a step after pressing Fix: what is wrong, what to do, and the way on to
 * the next problem. It turns green as soon as the problem is gone.
 */
export function FixBanner({
  gap,
  solved,
  left,
  onShow,
  onNext,
  onBack,
  onClose,
}: {
  gap: Gap;
  solved: boolean;
  /** Problems still open in the whole DPR. */
  left: number;
  onShow: () => void;
  onNext: (() => void) | null;
  onBack: () => void;
  onClose: () => void;
}) {
  const what = gap.label.replace(/^(text|document|PERT|mismatch): /, '');
  return (
    <section
      aria-label="What to fix"
      aria-live="polite"
      className={`sticky top-2 z-20 rounded-lg border px-4 py-3 text-[13px] shadow-sm ${solved ? 'border-emerald-200 bg-emerald-50 text-emerald-900' : 'border-amber-300 bg-amber-50 text-amber-950'}`}
    >
      <div className="flex items-start gap-3">
        {solved ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-hidden /> : <Wrench className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden />}
        <div className="min-w-0 flex-1">
          <p className="font-medium">{solved ? `Fixed: ${what}` : `To fix: ${what}`}</p>
          {solved ? (
            <p className="mt-0.5">{left ? `${left} ${left === 1 ? 'problem is' : 'problems are'} left in the DPR.` : 'Nothing else is missing. The DPR is ready to generate.'}</p>
          ) : (
            <p className="mt-0.5">
              <span className="font-medium">What to do: </span>
              {gap.how}
            </p>
          )}
          <div className="mt-2 flex flex-wrap gap-2">
            {!solved && gap.target && (
              <button type="button" className="btn-secondary h-7 px-2 text-xs" onClick={onShow}>
                <Crosshair className="h-3 w-3" aria-hidden />
                Show me where
              </button>
            )}
            {onNext && (
              <button type="button" className={`${solved ? 'btn-primary' : 'btn-secondary'} h-7 px-2 text-xs`} onClick={onNext}>
                {solved ? 'Next problem' : 'Skip to the next problem'}
                <ArrowRight className="h-3 w-3" aria-hidden />
              </button>
            )}
            <button type="button" className={`${solved && !onNext ? 'btn-primary' : 'btn-ghost'} h-7 px-2 text-xs`} onClick={onBack}>
              <ArrowLeft className="h-3 w-3" aria-hidden />
              Back to Generate DPR
            </button>
          </div>
        </div>
        <button type="button" aria-label="Close" className="btn-ghost -mr-2 -mt-1 h-7 w-7 shrink-0 px-0" onClick={onClose}>
          <X className="h-3.5 w-3.5" aria-hidden />
        </button>
      </div>
    </section>
  );
}
