'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { type LangCode, translations, getDir, toLangCode } from '@/lib/i18n';

interface I18nValue {
  lang:    LangCode;
  dir:     'ltr' | 'rtl';
  setLang: (l: LangCode) => void;
  /** Translate a key. Supports {n} placeholder substitution. */
  t:       (key: string, vars?: Record<string, string | number>) => string;
}

const I18nContext = createContext<I18nValue>({
  lang:    'en',
  dir:     'ltr',
  setLang: () => {},
  t:       (k) => k,
});

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<LangCode>('en');

  // Load language from settings on mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem('mogarenta_settings');
      if (raw) {
        const s = JSON.parse(raw);
        if (s.language) setLangState(toLangCode(s.language));
      }
    } catch { /* ignore */ }
  }, []);

  const setLang = useCallback((l: LangCode) => {
    setLangState(l);
    // Apply RTL to document
    document.documentElement.setAttribute('dir', getDir(l));
    document.documentElement.setAttribute('lang', l);
  }, []);

  // Apply dir on initial render
  useEffect(() => {
    document.documentElement.setAttribute('dir', getDir(lang));
    document.documentElement.setAttribute('lang', lang);
  }, [lang]);

  const t = useCallback((key: string, vars?: Record<string, string | number>): string => {
    const dict  = translations[lang];
    let text    = dict[key] ?? translations['en'][key] ?? key;
    if (vars) {
      Object.entries(vars).forEach(([k, v]) => {
        text = text.replace(`{${k}}`, String(v));
      });
    }
    return text;
  }, [lang]);

  const dir = getDir(lang);

  return (
    <I18nContext.Provider value={{ lang, dir, setLang, t }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n() {
  return useContext(I18nContext);
}
