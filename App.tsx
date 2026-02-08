
import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ScanLine,
  Search,
  Link as LinkIcon,
  RefreshCw,
  Globe,
  ShieldAlert,
  ChevronRight,
  MapPin
} from 'lucide-react';
import { AppState, RiskLevel, AnalysisResult } from './types';
import { analyzeFraudContent, checkPhishingFromScreenshot, verifyUrlString } from './services/geminiService';
import Aperture from './components/Aperture';
import QrScanner from './components/QrScanner';
import EvidenceModal from './components/EvidenceModal';
import ScanResultPage from './components/ScanResultPage';
import LinkResultPage from './components/LinkResultPage';
import ThreatStoryAndFeedback from './components/ThreatStoryAndFeedback';

const normalizeLanguageName = (language?: string): string => {
  if (!language) return '';

  const cleaned = language
    .toLowerCase()
    .replace(/\(.*?\)/g, ' ')
    .replace(/[_-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!cleaned) return '';

  const aliasMap: Record<string, string> = {
    'british english': 'english',
    'uk english': 'english',
    'english united kingdom': 'english',
    'american english': 'english',
    'us english': 'english',
    'english united states': 'english',
    'en gb': 'english',
    'en us': 'english',
  };

  if (aliasMap[cleaned]) return aliasMap[cleaned];
  if (cleaned.includes('english')) return 'english';
  return cleaned;
};

const areLanguagesEquivalent = (left?: string, right?: string): boolean => {
  const normalizedLeft = normalizeLanguageName(left);
  const normalizedRight = normalizeLanguageName(right);
  if (!normalizedLeft || !normalizedRight) return false;
  return normalizedLeft === normalizedRight;
};

const App: React.FC = () => {
  const [state, setState] = useState<AppState>(AppState.IDLE);
  const [isScanningQr, setIsScanningQr] = useState(false);
  const [modalMode, setModalMode] = useState<'screenshot' | 'link' | null>(null);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [statusText, setStatusText] = useState("EXTRACTING DATA...");
  const [viewMode, setViewMode] = useState<'translated' | 'native'>('translated');
  const [analysisSource, setAnalysisSource] = useState<'qr' | 'screenshot' | 'link' | null>(null);
  const [scannedUrl, setScannedUrl] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [userRegion, setUserRegion] = useState<{ country: string; countryCode: string } | null>(null);

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

  const getReadableLanguage = () => {
    try {
      const browserLangCode = navigator.language;
      return new Intl.DisplayNames(['en'], { type: 'language' }).of(browserLangCode) || 'English';
    } catch {
      return 'English';
    }
  };

  useEffect(() => {
    if (state === AppState.ANALYZING) {
      const texts = ["EXTRACTING PIXELS...", "IDENTIFYING BRAND...", "INTERCEPTING URL...", "NEURAL REASONING...", "MAPPING THREATS..."];
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
      const userLanguage = getReadableLanguage();
      let analysis: AnalysisResult;

      if (inputData.url) {
        analysis = await verifyUrlString(inputData.url, userLanguage);
      } else if (inputData.forensic && inputData.imagesBase64 && inputData.imagesBase64.length > 0) {
        analysis = await checkPhishingFromScreenshot(inputData.imagesBase64[0], userLanguage);
      } else {
        analysis = await analyzeFraudContent({ ...inputData, userLanguage });
      }

      setResult(analysis);
      setState(AppState.RESULT);
    } catch (err: any) {
      console.error(err);
      setError(err?.message || 'Analysis failed. Check your API key and network connection.');
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
    ? !areLanguagesEquivalent(result.detectedNativeLanguage, result.userSystemLanguage)
    : false;
  const genericInfrastructureClues = activeContent ? activeContent.redFlags.slice(0, 3) : [];

  return (
    <div className="min-h-screen bg-white relative overflow-hidden grid-pattern flex flex-col font-sans">
      {/* Fixed Header */}
      <header className="fixed top-0 left-0 right-0 z-[60] px-6 py-5 flex justify-between items-center bg-white/80 backdrop-blur-xl border-b border-neutral-100">
        <div className="flex items-center gap-2.5">
          <div className="relative">
            <div className="w-3 h-3 bg-red-600 rounded-full" />
            <motion.div animate={{ opacity: [0.2, 0.6, 0.2], scale: [1, 1.5, 1] }} transition={{ duration: 2, repeat: Infinity }} className="absolute inset-0 w-3 h-3 bg-red-600 rounded-full" />
          </div>
          <span className="font-black tracking-tighter text-xl text-slate-900 uppercase">REDFLAG</span>
        </div>
        <div className="flex items-center gap-2 px-3 py-1.5 bg-neutral-100/60 rounded-full border border-neutral-200/50">
          <MapPin size={10} className="text-neutral-500" />
          <span className="text-[9px] font-bold text-neutral-600 uppercase tracking-widest tabular-nums">
            {userRegion ? userRegion.countryCode : '...'}
          </span>
        </div>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center px-6 pt-24 pb-12">
        <AnimatePresence mode="wait">
          {isScanningQr && <QrScanner onScan={(url) => runAnalysis({ url, source: 'qr' })} onClose={() => setIsScanningQr(false)} />}
          
          {modalMode === 'screenshot' && (
            <EvidenceModal
              title="Analyze Screenshots"
              description="Upload up to 10 screenshots of chats, emails, or messages. Our AI will analyze the sequence for complex fraud patterns."
              icon={<Search size={24} />}
              maxFiles={10}
              onConfirm={(images) => runAnalysis({ imagesBase64: images, source: 'screenshot' })}
              onClose={() => setModalMode(null)}
              isLoading={state === AppState.ANALYZING}
            />
          )}

          {modalMode === 'link' && (
            <EvidenceModal
              title="Forensic Link Check"
              description="Upload a screenshot of the suspicious URL. We will perform a technical intercept and risk analysis."
              icon={<LinkIcon size={24} />}
              maxFiles={1}
              onConfirm={(images) => runAnalysis({ imagesBase64: images, forensic: true, source: 'link' })}
              onClose={() => setModalMode(null)}
              isLoading={state === AppState.ANALYZING}
            />
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
                  Is this a Scam?
                </h2>
                <p className="text-sm text-slate-500 mt-3 font-medium px-4">
                  Use AI to verify potential scams in images, QR codes, and links instantly.
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
                    <p className="text-sm font-bold text-red-800">Analysis Failed</p>
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
                    <h3 className="font-black text-slate-900 text-lg tracking-tight uppercase">Scan QR Code</h3>
                    <p className="text-xs text-slate-500 mt-1 leading-relaxed font-medium">
                      Reveal the hidden destination of QR code before you scan it.
                    </p>
                  </div>
                  <ChevronRight className="w-5 h-5 text-slate-300 group-hover:text-blue-500 transition-colors" />
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
                    <h3 className="font-black text-slate-900 text-lg tracking-tight uppercase">Analyze Screenshot</h3>
                    <p className="text-xs text-slate-500 mt-1 leading-relaxed font-medium">
                      Upload chats (WhatsApp/Line), emails, or images to detect fraud.
                    </p>
                  </div>
                  <ChevronRight className="w-5 h-5 text-slate-300 group-hover:text-blue-500 transition-colors" />
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
                    <h3 className="font-black text-slate-900 text-lg tracking-tight uppercase">Verify Link</h3>
                    <p className="text-xs text-slate-500 mt-1 leading-relaxed font-medium">
                      Upload an screenshot of suspicious URL to check for phishing or malware.
                    </p>
                  </div>
                  <ChevronRight className="w-5 h-5 text-slate-300 group-hover:text-blue-500 transition-colors" />
                </button>
              </div>
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
            <ScanResultPage
              result={result}
              scannedUrl={scannedUrl}
              activeContent={activeContent}
              onReset={reset}
              viewMode={viewMode}
              onToggleLanguage={() => setViewMode(viewMode === 'native' ? 'translated' : 'native')}
              isDifferentLang={isDifferentLang}
            />
          )}

          {/* RESULT VIEW — Verify Link */}
          {state === AppState.RESULT && result && activeContent && analysisSource === 'link' && !isScanningQr && !modalMode && (
            <LinkResultPage
              result={result}
              activeContent={activeContent}
              onReset={reset}
              viewMode={viewMode}
              onToggleLanguage={() => setViewMode(viewMode === 'native' ? 'translated' : 'native')}
              isDifferentLang={isDifferentLang}
            />
          )}

          {/* RESULT VIEW — Generic (Screenshot) */}
          {state === AppState.RESULT && result && activeContent && analysisSource !== 'qr' && analysisSource !== 'link' && !isScanningQr && !modalMode && (
            <motion.div key="result" initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-md pb-56">
              <div className="flex justify-center mb-8">
                <Aperture isAnalyzing={false} score={result.score} />
              </div>

              <div className="flex justify-center mb-6 w-full h-10">
                {isDifferentLang && (
                  <button
                    onClick={() => setViewMode(viewMode === 'native' ? 'translated' : 'native')}
                    className="flex items-center gap-3 px-5 py-2.5 bg-neutral-100 hover:bg-blue-50 border border-neutral-200 rounded-full transition-all group shadow-sm"
                  >
                    <Globe size={14} className="text-blue-600" />
                    <span className="text-[10px] font-black uppercase tracking-wider text-slate-600">
                      Show in {viewMode === 'translated' ? result.detectedNativeLanguage : result.userSystemLanguage}
                    </span>
                  </button>
                )}
              </div>

              <motion.div key={viewMode} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
                <div className="text-center space-y-3">
                  <h2 className={`text-4xl font-black tracking-tighter uppercase leading-none ${result.riskLevel === RiskLevel.DANGER ? 'text-red-600' : 'text-emerald-600'}`}>
                    {activeContent.headline}
                  </h2>
                  <p className="text-slate-600 text-xs font-mono uppercase tracking-[0.2em] font-bold">Risk Context: {result.category}</p>
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
                  />
                </div>
              </motion.div>

              <div className="fixed bottom-0 left-0 right-0 p-6 bg-white/90 backdrop-blur-2xl border-t border-neutral-100 z-50">
                <button
                  onClick={() => alert(`Shield Action Triggered: ${activeContent.action}`)}
                  className={`w-full py-5 rounded-2xl flex items-center justify-center font-bold text-sm shadow-2xl transition-all active:scale-95 ${
                    result.riskLevel === RiskLevel.DANGER ? 'bg-red-600 text-white shadow-red-500/30' : 'bg-emerald-600 text-white shadow-emerald-500/30'
                  }`}
                >
                  {activeContent.action}
                </button>
                <button onClick={reset} className="w-full mt-4 text-[10px] font-mono font-bold text-neutral-400 uppercase tracking-widest flex items-center justify-center gap-2 hover:text-slate-900 transition-colors">
                  <RefreshCw size={12} /> START ANOTHER SCAN
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
};

export default App;
