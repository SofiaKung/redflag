
import React, { lazy, Suspense, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ScanLine,
  Search,
  Link as LinkIcon,
  RefreshCw,
  Globe,
  ShieldAlert,
} from 'lucide-react';
import { AppState, RiskLevel, AnalysisResult } from './types';
import { analyzeContent } from './services/geminiService';
import { useI18n } from './i18n/I18nContext';
import { SUPPORTED_LOCALES, languageDisplayName } from './i18n/locales';
import Aperture from './components/Aperture';
import ThreatStoryAndFeedback from './components/ThreatStoryAndFeedback';
import LanguagePicker from './components/LanguagePicker';

const QrScanner = lazy(() => import('./components/QrScanner'));
const EvidenceModal = lazy(() => import('./components/EvidenceModal'));
const ScanResultPage = lazy(() => import('./components/ScanResultPage'));
const LinkResultPage = lazy(() => import('./components/LinkResultPage'));

/** Compare two BCP 47 / ISO 639-1 codes by their base language. */
const sameBaseLanguage = (a?: string, b?: string): boolean => {
  if (!a || !b) return false;
  return a.split('-')[0].toLowerCase() === b.split('-')[0].toLowerCase();
};

const App: React.FC = () => {
  const { t, locale } = useI18n();
  const [state, setState] = useState<AppState>(AppState.IDLE);
  const [isScanningQr, setIsScanningQr] = useState(false);
  const [modalMode, setModalMode] = useState<'screenshot' | 'link' | null>(null);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [statusText, setStatusText] = useState(t('analyzing.extractingData'));
  const [viewMode, setViewMode] = useState<'translated' | 'native'>('translated');
  const [analysisSource, setAnalysisSource] = useState<'qr' | 'screenshot' | 'link' | null>(null);
  const [scannedUrl, setScannedUrl] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [userRegion, setUserRegion] = useState<{ country: string; countryCode: string } | null>(null);
  const [showLanguagePicker, setShowLanguagePicker] = useState(false);
  const currentLocaleLabel = SUPPORTED_LOCALES.find(l => l.code === locale)?.nativeName.slice(0, 3).toUpperCase() || locale.toUpperCase();

  // Detect user's country on mount
  useEffect(() => {
    const detectCountry = async () => {
      const fallbackFromLocale = () => {
        try {
          const regionCode = navigator.language.split('-')[1];
          if (regionCode) {
            const name = new Intl.DisplayNames(['en'], { type: 'region' }).of(regionCode.toUpperCase());
            if (name) setUserRegion({ country: name, countryCode: regionCode.toUpperCase() });
          }
        } catch {
          // silent
        }
      };

      try {
        const res = await fetch('https://ipwho.is/');
        if (res.ok) {
          const data = await res.json();
          if (data?.success !== false && data?.country) {
            const countryCode = typeof data.country_code === 'string' ? data.country_code : '';
            setUserRegion({ country: data.country, countryCode });
            return;
          }
        }
      } catch {
        // ignore and use locale fallback
      }

      // Fallback: infer from browser locale
      fallbackFromLocale();
    };
    detectCountry();
  }, []);

  // Return the full BCP 47 locale code — Gemini respects regional variants (e.g. zh-TW → Taiwanese vocab)
  const getLanguageCode = () => locale;

  useEffect(() => {
    if (state === AppState.ANALYZING) {
      const texts = [t('analyzing.extractingPixels'), t('analyzing.identifyingBrand'), t('analyzing.interceptingUrl'), t('analyzing.neuralReasoning'), t('analyzing.mappingThreats')];
      let i = 0;
      const interval = setInterval(() => {
        i = (i + 1) % texts.length;
        setStatusText(texts[i]);
      }, 900);
      return () => clearInterval(interval);
    }
  }, [state]);

  const runAnalysis = async (inputData: { text?: string; imagesBase64?: string[]; forensic?: boolean; url?: string; source?: 'qr' | 'screenshot' | 'link' }) => {
    setIsScanningQr(false);
    setModalMode(null);
    setState(AppState.ANALYZING);
    setResult(null);
    setError(null);
    setViewMode('translated');
    setAnalysisSource(inputData.source || null);
    if (inputData.url) setScannedUrl(inputData.url);

    try {
      const userLanguage = getLanguageCode();

      const analysis = await analyzeContent({
        url: inputData.url,
        text: inputData.text,
        imagesBase64: inputData.imagesBase64,
        userLanguage,
        userCountryCode: userRegion?.countryCode,
        source: inputData.source,
      });

      setResult(analysis);
      // Default to the version in the user's chosen language.
      // Compare base ISO codes (e.g. "zh-TW" and "zh" both → "zh").
      setViewMode(sameBaseLanguage(analysis.detectedNativeLanguage, analysis.userSystemLanguage) ? 'native' : 'translated');
      setState(AppState.RESULT);
    } catch (err: any) {
      console.error(err);
      setError(err?.message || t('error.analysisFailedDetail'));
      setState(AppState.IDLE);
    }
  };

  const reset = () => {
    setState(AppState.IDLE);
    setResult(null);
    setError(null);
    setIsScanningQr(false);
    setModalMode(null);
    setAnalysisSource(null);
    setScannedUrl('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const activeContent = result ? (viewMode === 'translated' ? result.translated : result.native) : null;
  const isDifferentLang = result
    ? !sameBaseLanguage(result.detectedNativeLanguage, result.userSystemLanguage)
    : false;
  const genericInfrastructureClues = activeContent ? activeContent.redFlags.slice(0, 3) : [];
  const lazyFallback = (
    <div className="w-full py-10 text-center">
      <span className="text-[10px] font-mono text-neutral-400 uppercase tracking-[0.2em]">
        {t('common.loadingModule')}
      </span>
    </div>
  );

  return (
    <div className="min-h-screen bg-white relative overflow-hidden grid-pattern flex flex-col font-sans">
      {/* Fixed Header */}
      <header className="fixed top-0 left-0 right-0 z-[60] px-6 py-5 flex justify-between items-center bg-white/80 backdrop-blur-xl border-b border-neutral-100">
        <button
          type="button"
          onClick={reset}
          className="flex items-center gap-2.5 hover:opacity-85 transition-opacity"
          aria-label="Go to home page"
        >
          <div className="relative">
            <div className="w-3 h-3 bg-red-600 rounded-full" />
            <motion.div animate={{ opacity: [0.2, 0.6, 0.2], scale: [1, 1.5, 1] }} transition={{ duration: 2, repeat: Infinity }} className="absolute inset-0 w-3 h-3 bg-red-600 rounded-full" />
          </div>
          <span className="font-black tracking-tighter text-xl text-slate-900 uppercase">REDFLAG</span>
        </button>
        <button
          onClick={() => setShowLanguagePicker(true)}
          className="flex items-center gap-2 px-3 py-1.5 bg-neutral-100/60 rounded-full border border-neutral-200/50 hover:bg-blue-50 hover:border-blue-200 transition-all"
        >
          <Globe size={10} className="text-neutral-500" />
          <span className="text-[9px] font-bold text-neutral-600 uppercase tracking-widest tabular-nums">
            {currentLocaleLabel}
          </span>
        </button>
      </header>

      <LanguagePicker isOpen={showLanguagePicker} onClose={() => setShowLanguagePicker(false)} />

      <main className="flex-1 flex flex-col items-center justify-center px-6 pt-24 pb-12">
        <AnimatePresence mode="wait">
          {isScanningQr && (
            <Suspense fallback={lazyFallback}>
              <QrScanner onScan={(url) => runAnalysis({ url, source: 'qr' })} onClose={() => setIsScanningQr(false)} />
            </Suspense>
          )}
          
          {modalMode === 'screenshot' && (
            <Suspense fallback={lazyFallback}>
              <EvidenceModal
                title={t('modal.screenshotTitle')}
                description={t('modal.screenshotDesc')}
                icon={<Search size={24} />}
                maxFiles={10}
                onConfirm={(images) => runAnalysis({ imagesBase64: images, source: 'screenshot' })}
                onClose={() => setModalMode(null)}
                isLoading={state === AppState.ANALYZING}
              />
            </Suspense>
          )}

          {modalMode === 'link' && (
            <Suspense fallback={lazyFallback}>
              <EvidenceModal
                title={t('modal.linkTitle')}
                description={t('modal.linkDesc')}
                icon={<LinkIcon size={24} />}
                maxFiles={1}
                onConfirm={(images) => runAnalysis({ imagesBase64: images, forensic: true, source: 'link' })}
                onClose={() => setModalMode(null)}
                isLoading={state === AppState.ANALYZING}
              />
            </Suspense>
          )}

          {/* IDLE STATE UI */}
          {state === AppState.IDLE && !isScanningQr && !modalMode && (
            <motion.div 
              key="idle" 
              initial={{ opacity: 0, y: 10 }} 
              animate={{ opacity: 1, y: 0 }} 
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-md flex flex-col items-center"
            >
              <div className="mb-8 scale-75">
                <Aperture isAnalyzing={false} />
              </div>
              
              <div className="text-center mb-10">
                <h2 className="text-3xl font-black tracking-tight text-slate-900 uppercase">
                  {t('home.title')}
                </h2>
                <p className="text-sm text-slate-500 mt-3 font-medium px-4">
                  {t('home.subtitle')}
                </p>
              </div>

              {error && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="w-full mb-6 p-4 bg-red-50 border border-red-200 rounded-2xl flex items-start gap-3"
                >
                  <ShieldAlert size={18} className="text-red-500 mt-0.5 shrink-0" />
                  <div className="flex-1">
                    <p className="text-sm font-bold text-red-800">{t('error.analysisFailed')}</p>
                    <p className="text-xs text-red-600 mt-1">{error}</p>
                  </div>
                  <button onClick={() => setError(null)} className="text-red-400 hover:text-red-600 text-lg leading-none">&times;</button>
                </motion.div>
              )}

              <div className="grid grid-cols-1 gap-4 w-full">
                {/* 1. QR Code Check */}
                <button
                  onClick={() => setIsScanningQr(true)}
                  className="group relative flex items-center p-5 bg-white/60 backdrop-blur-md border border-neutral-100 rounded-[2rem] shadow-sm hover:shadow-xl hover:border-blue-200 transition-all text-left active:scale-95"
                >
                  <div className="w-14 h-14 rounded-2xl bg-blue-50 flex items-center justify-center text-blue-600 group-hover:bg-blue-600 group-hover:text-white transition-all">
                    <ScanLine className="w-7 h-7" />
                  </div>
                  <div className="ml-5 flex-1">
                    <h3 className="font-black text-slate-900 text-lg tracking-tight uppercase">{t('home.scanQr')}</h3>
                    <p className="text-xs text-slate-500 mt-1 leading-relaxed font-medium">
                      {t('home.scanQrDesc')}
                    </p>
                  </div>
                </button>

                {/* 2. Analyze Screenshot */}
                <button
                  onClick={() => setModalMode('screenshot')}
                  className="group relative flex items-center p-5 bg-white/60 backdrop-blur-md border border-neutral-100 rounded-[2rem] shadow-sm hover:shadow-xl hover:border-blue-200 transition-all text-left active:scale-95"
                >
                  <div className="w-14 h-14 rounded-2xl bg-blue-50 flex items-center justify-center text-blue-600 group-hover:bg-blue-600 group-hover:text-white transition-all">
                    <Search className="w-7 h-7" />
                  </div>
                  <div className="ml-5 flex-1">
                    <h3 className="font-black text-slate-900 text-lg tracking-tight uppercase">{t('home.analyzeScreenshot')}</h3>
                    <p className="text-xs text-slate-500 mt-1 leading-relaxed font-medium">
                      {t('home.analyzeScreenshotDesc')}
                    </p>
                  </div>
                </button>

                {/* 3. Verify Link */}
                <button
                  onClick={() => setModalMode('link')}
                  className="group relative flex items-center p-5 bg-white/60 backdrop-blur-md border border-neutral-100 rounded-[2rem] shadow-sm hover:shadow-xl hover:border-blue-200 transition-all text-left active:scale-95"
                >
                  <div className="w-14 h-14 rounded-2xl bg-blue-50 flex items-center justify-center text-blue-600 group-hover:bg-blue-600 group-hover:text-white transition-all">
                    <LinkIcon className="w-7 h-7" />
                  </div>
                  <div className="ml-5 flex-1">
                    <h3 className="font-black text-slate-900 text-lg tracking-tight uppercase">{t('home.verifyLink')}</h3>
                    <p className="text-xs text-slate-500 mt-1 leading-relaxed font-medium">
                      {t('home.verifyLinkDesc')}
                    </p>
                  </div>
                </button>
              </div>
              <p className="text-[10px] text-slate-400 text-center mt-4">{t('home.submissionsLogged')}</p>
            </motion.div>
          )}

          {/* ANALYZING STATE */}
          {state === AppState.ANALYZING && !isScanningQr && !modalMode && (
            <motion.div key="analyzing" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} className="flex-1 flex flex-col items-center justify-center w-full max-w-sm">
              <div className="mb-10"><Aperture isAnalyzing={true} /></div>
              <div className="px-5 py-2.5 bg-neutral-900 rounded-full shadow-xl border border-white/10">
                <span className="text-[10px] font-mono text-white tracking-[0.3em] font-bold uppercase">{statusText}</span>
              </div>
            </motion.div>
          )}

          {/* RESULT VIEW — QR Scan */}
          {state === AppState.RESULT && result && activeContent && analysisSource === 'qr' && !isScanningQr && !modalMode && (
            <Suspense fallback={lazyFallback}>
              <ScanResultPage
                result={result}
                scannedUrl={scannedUrl}
                activeContent={activeContent}
                onReset={reset}
                viewMode={viewMode}
                onToggleLanguage={() => setViewMode(viewMode === 'native' ? 'translated' : 'native')}
                isDifferentLang={isDifferentLang}
              />
            </Suspense>
          )}

          {/* RESULT VIEW — Verify Link */}
          {state === AppState.RESULT && result && activeContent && analysisSource === 'link' && !isScanningQr && !modalMode && (
            <Suspense fallback={lazyFallback}>
              <LinkResultPage
                result={result}
                activeContent={activeContent}
                onReset={reset}
                viewMode={viewMode}
                onToggleLanguage={() => setViewMode(viewMode === 'native' ? 'translated' : 'native')}
                isDifferentLang={isDifferentLang}
              />
            </Suspense>
          )}

          {/* RESULT VIEW — Generic (Screenshot) */}
          {state === AppState.RESULT && result && activeContent && analysisSource !== 'qr' && analysisSource !== 'link' && !isScanningQr && !modalMode && (
            <motion.div key="result" initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-md pb-56">
              <div className="flex flex-col items-center gap-6 pt-3 pb-3 mb-6">
                <Aperture isAnalyzing={false} score={result.score} />

                <div className="flex justify-center w-full min-h-10">
                  {isDifferentLang && (
                    <button
                      onClick={() => setViewMode(viewMode === 'native' ? 'translated' : 'native')}
                      className="flex items-center gap-3 px-5 py-2.5 bg-neutral-100 hover:bg-blue-50 border border-neutral-200 rounded-full transition-all group shadow-sm"
                    >
                      <Globe size={14} className="text-blue-600" />
                      <span className="text-[10px] font-black uppercase tracking-wider text-slate-600">
                        {t('result.showIn', { language: languageDisplayName(viewMode === 'translated' ? result.detectedNativeLanguage : result.userSystemLanguage, locale) })}
                      </span>
                    </button>
                  )}
                </div>
              </div>

              <motion.div key={viewMode} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
                <div className="text-center space-y-3">
                  <h2 className={`text-4xl font-black tracking-tighter uppercase leading-none ${result.riskLevel === RiskLevel.DANGER ? 'text-red-600' : 'text-emerald-600'}`}>
                    {activeContent.headline}
                  </h2>
                  <p className="text-slate-600 text-xs font-mono uppercase tracking-[0.2em] font-bold">{t('result.riskContext', { category: result.category })}</p>
                  <div className="bg-slate-50/80 border border-slate-100 rounded-3xl p-6 backdrop-blur-sm">
                    <p className="text-slate-700 text-sm font-bold leading-relaxed">{activeContent.explanation}</p>
                  </div>
                </div>

                <div className="grid gap-3">
                  <ThreatStoryAndFeedback
                    hook={activeContent.hook}
                    trap={activeContent.trap}
                    infrastructureClues={genericInfrastructureClues}
                    category={result.category}
                    analysisId={result.analysisId}
                  />
                </div>
              </motion.div>

              <div className="fixed bottom-0 left-0 right-0 p-6 bg-white/90 backdrop-blur-2xl border-t border-neutral-100 z-50">
                <div className="max-w-md mx-auto px-1">
                  <div
                    className={`w-full py-5 px-6 rounded-2xl text-center font-bold text-sm ${
                      result.riskLevel === RiskLevel.DANGER
                        ? 'bg-red-50 text-red-800 border border-red-200'
                        : 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                    }`}
                  >
                    {activeContent.action}
                  </div>
                  <button onClick={reset} className="w-full mt-4 text-[10px] font-mono font-bold text-neutral-400 uppercase tracking-widest flex items-center justify-center gap-2 hover:text-slate-900 transition-colors">
                  <RefreshCw size={12} /> {t('result.startAnotherScan')}
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
};

export default App;
