import React, { createContext, useContext, useState, useCallback, useMemo } from 'react';
import { locales, LocaleCode, resolveLocaleCode } from './locales';

interface I18nContextValue {
  locale: LocaleCode;
  setLocale: (code: LocaleCode) => void;
  t: (key: string, params?: Record<string, string | number>) => string;
}

const I18nContext = createContext<I18nContextValue | null>(null);

const STORAGE_KEY = 'redflag-locale';

function detectInitialLocale(): LocaleCode {
  // 1. Check localStorage for user override
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && stored in locales) return stored as LocaleCode;
  } catch {
    // localStorage may be unavailable (private browsing, etc.)
  }

  // 2. Auto-detect from navigator.language
  const resolved = resolveLocaleCode(navigator.language);
  if (resolved) return resolved;

  // 3. Fallback to English
  return 'en';
}

export const I18nProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [locale, setLocaleState] = useState<LocaleCode>(detectInitialLocale);

  const setLocale = useCallback((code: LocaleCode) => {
    setLocaleState(code);
    try {
      localStorage.setItem(STORAGE_KEY, code);
    } catch {
      // silent
    }
  }, []);

  const t = useCallback((key: string, params?: Record<string, string | number>): string => {
    let message = locales[locale]?.[key] || locales.en[key] || key;
    if (params) {
      Object.entries(params).forEach(([k, v]) => {
        message = message.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
      });
    }
    return message;
  }, [locale]);

  const value = useMemo(() => ({ locale, setLocale, t }), [locale, setLocale, t]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
};

export const useI18n = (): I18nContextValue => {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used within I18nProvider');
  return ctx;
};
