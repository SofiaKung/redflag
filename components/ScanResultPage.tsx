
import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  RefreshCw,
  Link as LinkIcon,
  ExternalLink,
  Copy,
  Check,
  Globe,
  ImageOff,
  Monitor,
  AlertTriangle,
  Shield,
} from 'lucide-react';
import { RiskLevel, AnalysisResult, LocalizedAnalysis } from '../types';
import { useI18n } from '../i18n/I18nContext';
import Aperture from './Aperture';
import ThreatStoryAndFeedback from './ThreatStoryAndFeedback';
import DigitalFingerprint from './DigitalFingerprint';
import { generateLinkPreview } from '../services/linkPreview';

interface ScanResultPageProps {
  result: AnalysisResult;
  scannedUrl: string;
  activeContent: LocalizedAnalysis;
  onReset: () => void;
  viewMode: 'translated' | 'native';
  onToggleLanguage: () => void;
  isDifferentLang: boolean;
}

// --- Streaming Text Hook ---
const useStreamingText = (text: string, speed: number = 12) => {
  const [displayed, setDisplayed] = useState('');
  const [isDone, setIsDone] = useState(false);

  useEffect(() => {
    setDisplayed('');
    setIsDone(false);
    let i = 0;
    const interval = setInterval(() => {
      i++;
      setDisplayed(text.slice(0, i));
      if (i >= text.length) {
        clearInterval(interval);
        setIsDone(true);
      }
    }, speed);
    return () => clearInterval(interval);
  }, [text, speed]);

  return { displayed, isDone };
};

// --- Haptic Feedback ---
const triggerHaptic = (riskLevel: RiskLevel) => {
  if (!navigator.vibrate) return;
  if (riskLevel === RiskLevel.SAFE) navigator.vibrate(50);
  else if (riskLevel === RiskLevel.DANGER) navigator.vibrate([100, 80, 100]);
  else navigator.vibrate([60, 50, 60]);
};

// --- Headline color helper ---
const getHeadlineColor = (riskLevel: RiskLevel) => {
  switch (riskLevel) {
    case RiskLevel.DANGER: return 'text-red-600';
    case RiskLevel.CAUTION: return 'text-amber-600';
    default: return 'text-emerald-600';
  }
};

// --- Border color by risk ---
const getRiskBorderColor = (riskLevel: RiskLevel) => {
  switch (riskLevel) {
    case RiskLevel.DANGER: return 'border-red-300';
    case RiskLevel.CAUTION: return 'border-amber-300';
    default: return 'border-emerald-300';
  }
};

// --- URL Highlighter ---
const HighlightedUrl: React.FC<{ url: string; riskLevel: RiskLevel }> = ({ url, riskLevel }) => {
  try {
    const parsed = new URL(url.startsWith('http') ? url : `https://${url}`);
    const protocol = parsed.protocol + '//';
    const host = parsed.hostname;
    const rest = parsed.pathname + parsed.search + parsed.hash;

    const hostParts = host.split('.');
    const suspicious = hostParts.slice(0, -1).join('.');
    const tld = '.' + hostParts[hostParts.length - 1];

    const isDanger = riskLevel === RiskLevel.DANGER;
    const isCaution = riskLevel === RiskLevel.CAUTION;

    return (
      <span className="break-all">
        <span className="text-neutral-400">{protocol}</span>
        <span className={
          isDanger ? 'bg-red-200/60 text-red-800 px-0.5 rounded' :
          isCaution ? 'bg-amber-200/60 text-amber-800 px-0.5 rounded' :
          'text-emerald-700'
        }>
          {suspicious}
        </span>
        <span className="text-neutral-500">{tld}</span>
        {rest !== '/' && <span className="text-neutral-400">{rest}</span>}
      </span>
    );
  } catch {
    return <span className="text-neutral-700 break-all">{url}</span>;
  }
};

// --- Safe Link Preview Component ---
const SafeLinkPreview: React.FC<{ url: string; riskLevel: RiskLevel }> = ({ url, riskLevel }) => {
  const { t } = useI18n();
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      const result = await generateLinkPreview(url);
      if (cancelled) return;
      setPreviewImage(result.imageBase64);
      setPreviewError(result.error);
      setLoading(false);
    };
    load();
    return () => { cancelled = true; };
  }, [url]);

  const borderColor = getRiskBorderColor(riskLevel);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.3 }}
      className="mb-6"
    >
      <div className="flex items-center gap-2 mb-3">
        <Monitor size={12} className="text-neutral-400" />
        <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-neutral-400">
          {t('scan.safePreview')}
        </h4>
        {loading && (
          <span className="text-[9px] font-mono text-blue-500 animate-pulse tracking-wider">
            {t('scan.rendering')}
          </span>
        )}
      </div>

      <div className={`relative rounded-2xl border-2 ${borderColor} overflow-hidden bg-neutral-50 shadow-sm`}>
        {loading && (
          <div className="aspect-[390/600] flex flex-col items-center justify-center gap-3">
            {/* Scanning animation */}
            <div className="relative w-full h-full">
              <motion.div
                animate={{ y: ['0%', '100%', '0%'] }}
                transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
                className="absolute left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-blue-500 to-transparent"
              />
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
                <Monitor size={28} className="text-neutral-300" />
                <span className="text-[10px] font-mono text-neutral-400 tracking-wider">
                  {t('scan.capturingSitePreview')}
                </span>
              </div>
            </div>
          </div>
        )}

        {!loading && previewImage && (
          <motion.img
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            src={`data:image/png;base64,${previewImage}`}
            alt="Safe preview of destination"
            className="w-full object-cover object-top max-h-[400px]"
          />
        )}

        {!loading && !previewImage && (
          <div className="aspect-[390/500] flex flex-col items-center justify-center gap-2 text-neutral-400">
            <ImageOff size={28} />
            <span className="text-xs font-medium">{previewError || t('scan.previewUnavailable')}</span>
          </div>
        )}

        {/* Overlay badge */}
        <div className="absolute top-3 left-3 px-2.5 py-1 bg-black/60 backdrop-blur-md rounded-full flex items-center gap-1.5">
          <div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
          <span className="text-[9px] font-mono text-white/80 tracking-wider uppercase">
            {t('scan.sandboxed')}
          </span>
        </div>
      </div>
    </motion.div>
  );
};

const ScanResultPage: React.FC<ScanResultPageProps> = ({
  result,
  scannedUrl,
  activeContent,
  onReset,
  viewMode,
  onToggleLanguage,
  isDifferentLang,
}) => {
  const { t } = useI18n();
  const { displayed: streamedExplanation, isDone: explanationDone } = useStreamingText(activeContent.explanation, 10);
  const [copied, setCopied] = useState(false);

  const meta = result.linkMetadata;
  const verified = meta?.verified;
  const infrastructureClues = [
    meta?.suspiciousTld ? t('link.suspiciousTldClue', { tld: meta.suspiciousTld }) : '',
    meta?.impersonating && meta.impersonating !== 'None detected'
      ? t('link.impersonatingClue', { brand: meta.impersonating })
      : '',
    verified?.safeBrowsingThreats && verified.safeBrowsingThreats.length > 0
      ? t('link.safeBrowsingClue', { threats: verified.safeBrowsingThreats.join(', ') })
      : '',
    verified?.homographAttack ? t('link.homographClue') : '',
    verified?.geoMismatch && verified.geoMismatchDetails.length > 0 ? verified.geoMismatchDetails[0] : '',
    ...activeContent.redFlags,
  ].filter(Boolean).slice(0, 3) as string[];

  useEffect(() => {
    triggerHaptic(result.riskLevel);
  }, [result.riskLevel]);

  const handleCopyUrl = async () => {
    try {
      await navigator.clipboard.writeText(scannedUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access may be blocked by browser permissions.
    }
  };

  return (
    <motion.div
      key="scan-result"
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className="w-full max-w-md mx-auto pb-56"
    >
      {/* ===== SCORE HERO ===== */}
      <div className="flex flex-col items-center gap-6 pt-3 pb-3 mb-6">
        <Aperture isAnalyzing={false} score={result.score} />

        <div className="flex justify-center w-full min-h-10">
          {isDifferentLang && (
            <button
              onClick={onToggleLanguage}
              className="flex items-center gap-3 px-5 py-2.5 bg-neutral-100 hover:bg-blue-50 border border-neutral-200 rounded-full transition-all group shadow-sm"
            >
              <Globe size={14} className="text-blue-600" />
              <span className="text-[10px] font-black uppercase tracking-wider text-slate-600">
                {t('result.showIn', { language: viewMode === 'translated' ? result.detectedNativeLanguage : result.userSystemLanguage })}
              </span>
            </button>
          )}
        </div>
      </div>

      <motion.div key={viewMode} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
        {/* ===== HEADLINE + CATEGORY ===== */}
        <div className="text-center space-y-3">
          <h2 className={`text-4xl font-black tracking-tighter uppercase leading-none ${getHeadlineColor(result.riskLevel)}`}>
            {activeContent.headline}
          </h2>
          <p className="text-slate-600 text-xs font-mono uppercase tracking-[0.2em] font-bold">
            {t('result.riskContext', { category: result.category })}
          </p>
          <div className="bg-slate-50/80 border border-slate-100 rounded-3xl p-6 backdrop-blur-sm">
            <p className="text-slate-700 text-sm font-bold leading-relaxed">
              {streamedExplanation}
              {!explanationDone && (
                <motion.span
                  animate={{ opacity: [1, 0] }}
                  transition={{ duration: 0.5, repeat: Infinity }}
                  className="inline-block w-0.5 h-4 bg-slate-500 ml-0.5 align-middle"
                />
              )}
            </p>
          </div>
        </div>

        {/* ===== SAFE LINK PREVIEW ===== */}
        {scannedUrl && (
          <SafeLinkPreview url={scannedUrl} riskLevel={result.riskLevel} />
        )}

        {/* ===== SCANNED URL CARD ===== */}
        {scannedUrl && (
          <div className="bg-white/70 border border-neutral-100 rounded-3xl p-6 shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-neutral-400 flex items-center gap-2">
                <LinkIcon size={12} /> {t('scan.scannedUrl')}
              </h4>
              <button
                onClick={handleCopyUrl}
                className="text-neutral-400 hover:text-slate-600 transition-colors p-1"
              >
                {copied ? <Check size={12} className="text-emerald-500" /> : <Copy size={12} />}
              </button>
            </div>
            <p className="text-sm font-mono leading-relaxed">
              <HighlightedUrl url={scannedUrl} riskLevel={result.riskLevel} />
            </p>
            {meta?.suspiciousTld && (
              <div className="mt-3 flex items-start gap-2">
                <div className="w-0.5 h-full min-h-[2rem] bg-gradient-to-b from-blue-500 to-transparent rounded-full shrink-0" />
                <p className="text-[11px] text-blue-600 leading-snug">
                  <span className="font-black">{t('scan.note')}</span>{' '}
                  {t('scan.suspiciousTldNote', { tld: meta.suspiciousTld })}
                </p>
              </div>
            )}
          </div>
        )}

        {/* ===== REDIRECT CHAIN ALERT ===== */}
        {verified && verified.redirectCount > 0 && verified.finalUrl && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
            className="bg-amber-50/80 border border-amber-200 rounded-3xl p-6 shadow-sm"
          >
            <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-amber-500 mb-3 flex items-center gap-2">
              <ExternalLink size={12} />
              {t('scan.redirectChain')}
              <span className="ml-auto text-[8px] font-mono px-2 py-0.5 rounded-full bg-amber-200 text-amber-700">
                {verified.redirectCount} {verified.redirectCount === 1 ? t('scan.hop') : t('scan.hops')}
              </span>
            </h4>
            <div className="space-y-2">
              <div className="flex items-center gap-3 p-3 rounded-xl bg-white/60 border border-amber-100">
                <div className="w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center shrink-0">
                  <LinkIcon size={14} className="text-amber-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[9px] font-mono text-neutral-400 uppercase tracking-wider">{t('scan.qrPointsTo')}</p>
                  <p className="text-xs font-bold font-mono text-amber-800 truncate">{scannedUrl}</p>
                </div>
              </div>
              <div className="flex justify-center">
                <div className="text-amber-400 text-xs">↓</div>
              </div>
              <div className="flex items-center gap-3 p-3 rounded-xl bg-white/60 border border-amber-100">
                <div className="w-8 h-8 rounded-lg bg-red-50 flex items-center justify-center shrink-0">
                  <AlertTriangle size={14} className="text-red-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[9px] font-mono text-neutral-400 uppercase tracking-wider">{t('scan.actuallyGoesTo')}</p>
                  <p className="text-xs font-bold font-mono text-red-600 truncate">{verified.finalUrl}</p>
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {/* ===== IMPERSONATION ALERT ===== */}
        {meta && meta.impersonating && meta.impersonating !== 'None detected' && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="bg-white/70 border border-neutral-100 rounded-3xl p-6 shadow-sm"
          >
            <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-neutral-400 mb-3 flex items-center gap-2">
              <Shield size={12} /> {t('scan.impersonationAnalysis')}
            </h4>
            <div className="space-y-2">
              <div className="flex items-center gap-3 p-3 rounded-xl bg-neutral-50 border border-neutral-100">
                <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center">
                  <Shield size={14} className="text-blue-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[9px] font-mono text-neutral-400 uppercase tracking-wider">{t('scan.impersonating')}</p>
                  <p className="text-sm font-bold text-slate-900 truncate">{meta.impersonating}</p>
                </div>
              </div>
              <div className="flex items-center gap-3 p-3 rounded-xl bg-red-50/50 border border-red-100">
                <div className="w-8 h-8 rounded-lg bg-red-50 flex items-center justify-center">
                  <AlertTriangle size={14} className="text-red-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[9px] font-mono text-neutral-400 uppercase tracking-wider">{t('scan.actualDestination')}</p>
                  <p className="text-sm font-bold text-red-600 font-mono truncate">{meta.actualDomain}</p>
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {/* ===== DIGITAL FINGERPRINT + GEO-MISMATCH ===== */}
        {meta && <DigitalFingerprint meta={meta} />}

        <ThreatStoryAndFeedback
          hook={activeContent.hook}
          trap={activeContent.trap}
          infrastructureClues={infrastructureClues}
          category={result.category}
          analysisId={result.analysisId}
        />
      </motion.div>

      {/* ===== STICKY FOOTER ===== */}
      <div className="fixed bottom-0 left-0 right-0 p-6 bg-white/90 backdrop-blur-2xl border-t border-neutral-100 z-50">
        <div className="max-w-md mx-auto px-1">
          <div
            className={`w-full py-5 px-6 rounded-2xl text-center font-bold text-sm ${
              result.riskLevel === RiskLevel.DANGER
                ? 'bg-red-50 text-red-800 border border-red-200'
                : result.riskLevel === RiskLevel.CAUTION
                  ? 'bg-amber-50 text-amber-800 border border-amber-200'
                  : 'bg-emerald-50 text-emerald-800 border border-emerald-200'
            }`}
          >
            {activeContent.action}
          </div>
          <p className="text-[10px] text-neutral-400 text-center mt-3 leading-relaxed px-2">
            {t('scan.aiDisclaimer')}
          </p>
          <button
            onClick={onReset}
            className="w-full mt-3 text-[10px] font-mono font-bold text-neutral-400 uppercase tracking-widest flex items-center justify-center gap-2 hover:text-slate-900 transition-colors"
          >
            <RefreshCw size={12} /> {t('result.startAnotherScan')}
          </button>
        </div>
      </div>
    </motion.div>
  );
};

export default ScanResultPage;
