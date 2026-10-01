import { useMemo } from 'react';
import { useStore } from '../state/store.js';
import { makeT, type Lang, type TFn } from './index.js';

export function useLang(): Lang {
  return useStore((s) => s.ui.lang);
}

export function useT(): TFn {
  const lang = useLang();
  return useMemo(() => makeT(lang), [lang]);
}
