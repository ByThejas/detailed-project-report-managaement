const control =
  'block h-9 w-full rounded-md border bg-white px-3 text-[13px] text-gray-900 placeholder:text-gray-400 ' +
  'focus:outline-none focus:ring-2 disabled:cursor-not-allowed disabled:bg-gray-50 disabled:text-gray-400';

export const controlClass = (invalid?: boolean) =>
  `${control} ${invalid ? 'border-rose-400 focus:border-rose-500 focus:ring-rose-500/15' : 'border-gray-200 focus:border-accent-500 focus:ring-accent-500/15'}`;
