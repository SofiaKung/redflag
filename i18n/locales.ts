import en from '../locales/en.json';
import th from '../locales/th.json';
import vi from '../locales/vi.json';
import zhCN from '../locales/zh-CN.json';
import zhTW from '../locales/zh-TW.json';
import pt from '../locales/pt.json';
import es from '../locales/es.json';
import id from '../locales/id.json';

export type LocaleCode = 'en' | 'th' | 'vi' | 'zh-CN' | 'zh-TW' | 'pt' | 'es' | 'id';
export type LocaleMessages = Record<string, string>;

export const locales: Record<LocaleCode, LocaleMessages> = {
  en, th, vi, 'zh-CN': zhCN, 'zh-TW': zhTW, pt, es, id,
};

export const SUPPORTED_LOCALES: { code: LocaleCode; nativeName: string }[] = [
  { code: 'en', nativeName: 'English' },
  { code: 'th', nativeName: 'ไทย' },
  { code: 'vi', nativeName: 'Tiếng Việt' },
  { code: 'zh-CN', nativeName: '简体中文' },
  { code: 'zh-TW', nativeName: '繁體中文' },
  { code: 'pt', nativeName: 'Português' },
  { code: 'es', nativeName: 'Español' },
  { code: 'id', nativeName: 'Bahasa Indonesia' },
];

/** Convert an ISO 639-1 / BCP 47 code to a human-readable name. */
export function languageDisplayName(code: string, displayLocale: string = 'en'): string {
  if (!code) return '';
  try {
    return new Intl.DisplayNames([displayLocale], { type: 'language' }).of(code) || code;
  } catch {
    try { return new Intl.DisplayNames(['en'], { type: 'language' }).of(code) || code; }
    catch { return code; }
  }
}

/** Map browser language codes to our locale codes */
export function resolveLocaleCode(browserLang: string): LocaleCode | null {
  const lower = browserLang.toLowerCase();

  // Exact match first (e.g., "zh-cn" → "zh-CN")
  const exactMap: Record<string, LocaleCode> = {
    'zh-cn': 'zh-CN', 'zh-sg': 'zh-CN', 'zh-hans': 'zh-CN',
    'zh-tw': 'zh-TW', 'zh-hk': 'zh-TW', 'zh-hant': 'zh-TW',
    'pt-br': 'pt', 'pt-pt': 'pt',
    'es-es': 'es', 'es-mx': 'es', 'es-ar': 'es',
  };
  if (exactMap[lower]) return exactMap[lower];

  // Base language prefix match
  const base = lower.split('-')[0];
  const baseMap: Record<string, LocaleCode> = {
    en: 'en', th: 'th', vi: 'vi', zh: 'zh-CN', pt: 'pt', es: 'es', id: 'id',
  };
  return baseMap[base] || null;
}
