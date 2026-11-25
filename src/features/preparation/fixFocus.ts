
const escape = (s: string) => (typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(s) : s.replace(/["\\]/g, '\\$&'));

/** The element a Fix lands on, marked in the page with data-fix="…". */
export const fixElement = (target: string) => document.querySelector<HTMLElement>(`[data-fix="${escape(target)}"]`);

/**
 * Scrolls to the field a gap is about, outlines it and puts the cursor in it. The step's panel may
 * still be rendering (or lazy-loading), so it looks for the field for up to about two seconds.
 */
export function focusFix(target: string | undefined, tries = 120) {
  if (!target) return;
  const el = fixElement(target);
  if (!el) {
    if (tries > 0) requestAnimationFrame(() => focusFix(target, tries - 1));
    return;
  }
  document.querySelectorAll('.fix-target').forEach((x) => x.classList.remove('fix-target', 'fix-flash'));
  el.classList.add('fix-target', 'fix-flash');
  window.setTimeout(() => el.classList.remove('fix-flash'), 2600);
  el.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
  const field = el.matches('input, textarea, select') ? el : preferredField(el) ?? el.querySelector<HTMLElement>('input:not([type=hidden]):not([type=checkbox]):not([type=file]), textarea, select');
  (field ?? el.querySelector<HTMLElement>('button'))?.focus({ preventScroll: true });
}

/** The field inside a landing spot that most likely needs the change. */
function preferredField(el: HTMLElement): HTMLElement | null {
  const marked = el.querySelector<HTMLElement>('[data-fix-focus]');
  if (marked) return marked;
  // A BOQ row: an empty rate first, else the description.
  if (el.tagName === 'TR') {
    const rates = [...el.querySelectorAll<HTMLInputElement>('input[type=number]')].filter((i) => /rate/i.test(i.getAttribute('aria-label') ?? ''));
    return rates.find((i) => !Number(i.value)) ?? el.querySelector('textarea');
  }
  return null;
}

/** Takes the outline off whatever a Fix last pointed at. */
export function clearFixMark() {
  document.querySelectorAll('.fix-target').forEach((x) => x.classList.remove('fix-target', 'fix-flash'));
}
