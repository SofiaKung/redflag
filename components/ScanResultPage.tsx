
import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Shield,
  ShieldCheck,
  ShieldAlert,
  AlertTriangle,
  Eye,
  ExternalLink,
  Copy,
  Ban,
  RefreshCw,
  Link as LinkIcon,
  Check,
} from 'lucide-react';
import { RiskLevel, AnalysisResult, LocalizedAnalysis } from '../types';

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
  if (riskLevel === RiskLevel.SAFE) {
    navigator.vibrate(50);
  } else if (riskLevel === RiskLevel.DANGER) {
    navigator.vibrate([100, 80, 100]);
  } else {
    navigator.vibrate([60, 50, 60]);
  }
};

// --- Config per risk level ---
const getConfig = (riskLevel: RiskLevel) => {
  switch (riskLevel) {
    case RiskLevel.DANGER:
      return {
        accentBg: 'bg-red-50',
        accentText: 'text-red-600',
        accentBorder: 'border-red-200',
        ringColor: 'stroke-red-500',
        ringGlow: 'shadow-[0_0_60px_rgba(239,68,68,0.25)]',
        iconBg: 'bg-red-100',
        iconColor: 'text-red-500',
        buttonBg: 'bg-red-600 hover:bg-red-700',
        buttonShadow: 'shadow-red-500/30',
        pulseColor: 'bg-red-500',
        label: 'THREAT DETECTED',
        Icon: ShieldAlert,
      };
    case RiskLevel.CAUTION:
      return {
        accentBg: 'bg-amber-50',
        accentText: 'text-amber-600',
        accentBorder: 'border-amber-200',
        ringColor: 'stroke-amber-500',
        ringGlow: 'shadow-[0_0_60px_rgba(245,158,11,0.2)]',
        iconBg: 'bg-amber-100',
        iconColor: 'text-amber-500',
        buttonBg: 'bg-amber-600 hover:bg-amber-700',
        buttonShadow: 'shadow-amber-500/30',
        pulseColor: 'bg-amber-500',
        label: 'PROCEED WITH CAUTION',
        Icon: Eye,
      };
    default:
      return {
        accentBg: 'bg-emerald-50',
        accentText: 'text-emerald-600',
        accentBorder: 'border-emerald-200',
        ringColor: 'stroke-emerald-500',
        ringGlow: 'shadow-[0_0_60px_rgba(16,185,129,0.2)]',
        iconBg: 'bg-emerald-100',
        iconColor: 'text-emerald-500',
        buttonBg: 'bg-slate-900 hover:bg-slate-800',
        buttonShadow: 'shadow-slate-500/20',
        pulseColor: 'bg-emerald-500',
        label: 'LINK VERIFIED',
        Icon: ShieldCheck,
      };
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
    // Highlight everything except the TLD
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

const ScanResultPage: React.FC<ScanResultPageProps> = ({
  result,
  scannedUrl,
  activeContent,
  onReset,
  viewMode,
  onToggleLanguage,
  isDifferentLang,
}) => {
  const config = getConfig(result.riskLevel);
  const { displayed: streamedExplanation, isDone: explanationDone } = useStreamingText(activeContent.explanation, 10);
  const [copied, setCopied] = useState(false);
  const [showRiskDetails, setShowRiskDetails] = useState(false);

  useEffect(() => {
    triggerHaptic(result.riskLevel);
  }, [result.riskLevel]);

  const handleCopyUrl = async () => {
    try {
      await navigator.clipboard.writeText(scannedUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  };

  const handleOpenLink = () => {
    window.open(scannedUrl, '_blank', 'noopener,noreferrer');
  };

  const IconComponent = config.Icon;

  return (
    <motion.div
      key="scan-result"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className="w-full max-w-md mx-auto pb-60"
    >
      {/* ===== A. VERDICT HEADER ===== */}
      <div className="flex flex-col items-center mt-4 mb-8">
        {/* Pulsing Ring + Icon */}
        <div className={`relative mb-6 ${config.ringGlow} rounded-full`}>
          {/* Outer decorative ring */}
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 20, repeat: Infinity, ease: 'linear' }}
            className="w-32 h-32 relative"
          >
            <svg className="w-full h-full -rotate-90" viewBox="0 0 120 120">
              <circle cx="60" cy="60" r="54" fill="none" strokeWidth="1" className="stroke-neutral-100" />
              <motion.circle
                cx="60" cy="60" r="54"
                fill="none"
                strokeWidth="3"
                strokeLinecap="round"
                strokeDasharray={2 * Math.PI * 54}
                initial={{ strokeDashoffset: 2 * Math.PI * 54 }}
                animate={{ strokeDashoffset: 2 * Math.PI * 54 * (1 - result.score / 100) }}
                transition={{ duration: 1.5, ease: 'easeOut', delay: 0.3 }}
                className={config.ringColor}
              />
            </svg>
          </motion.div>

          {/* Center icon */}
          <motion.div
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 200, damping: 15, delay: 0.2 }}
            className={`absolute inset-0 flex items-center justify-center`}
          >
            <div className={`w-20 h-20 rounded-full ${config.iconBg} flex items-center justify-center`}>
              <IconComponent className={`w-10 h-10 ${config.iconColor}`} strokeWidth={1.5} />
            </div>
          </motion.div>

          {/* Pulse ring */}
          <motion.div
            animate={{ scale: [1, 1.3, 1], opacity: [0.3, 0, 0.3] }}
            transition={{ duration: 2, repeat: Infinity }}
            className={`absolute inset-0 rounded-full ${config.iconBg}`}
          />
        </div>

        {/* Headline */}
        <motion.h1
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className={`text-3xl font-black tracking-tight text-center uppercase ${config.accentText}`}
        >
          {activeContent.headline}
        </motion.h1>

        {/* Confidence Score */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6 }}
          className="mt-3 flex items-center gap-3"
        >
          <span className="text-[10px] font-mono text-neutral-400 tracking-[0.2em] uppercase">
            Agent Confidence: {result.score}%
          </span>
          <div className={`w-1.5 h-1.5 rounded-full ${config.pulseColor} animate-pulse`} />
        </motion.div>

        {/* Risk Label */}
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.7 }}
          className={`mt-3 px-4 py-1.5 rounded-full ${config.accentBg} ${config.accentBorder} border`}
        >
          <span className={`text-[10px] font-black uppercase tracking-[0.15em] ${config.accentText}`}>
            {config.label}
          </span>
        </motion.div>

        {/* Language Toggle */}
        {isDifferentLang && (
          <motion.button
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.8 }}
            onClick={onToggleLanguage}
            className="mt-4 flex items-center gap-2 px-4 py-2 bg-neutral-100 hover:bg-blue-50 border border-neutral-200 rounded-full transition-all"
          >
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-500">
              {viewMode === 'translated' ? `Show in ${result.detectedNativeLanguage}` : `Show in ${result.userSystemLanguage}`}
            </span>
          </motion.button>
        )}
      </div>

      {/* ===== B. AGENT INSIGHT CARD ===== */}
      <motion.div
        initial={{ y: 30, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.5, duration: 0.5 }}
        className={`rounded-3xl border ${config.accentBorder} bg-white/70 backdrop-blur-sm p-6 shadow-sm mb-4`}
      >
        {/* Card Header */}
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-[10px] font-black uppercase tracking-[0.2em] text-neutral-400">
            Analysis Report
          </h2>
          <div className="flex items-center gap-2">
            <div className={`h-2 w-2 rounded-full ${config.pulseColor} animate-pulse`} />
            <span className="text-[9px] font-mono text-neutral-400 tracking-wider uppercase">
              {result.category}
            </span>
          </div>
        </div>

        {/* Threat / Intent */}
        <div className="mb-5">
          <p className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider mb-1.5">
            {result.riskLevel === RiskLevel.SAFE ? 'Assessment' : 'Detected Threat'}
          </p>
          <p className={`text-base font-bold leading-snug ${config.accentText}`}>
            {activeContent.hook}
          </p>
        </div>

        {/* Streaming Explanation */}
        <div className={`p-4 rounded-2xl ${config.accentBg} border ${config.accentBorder} mb-5`}>
          <p className="text-sm font-medium text-slate-700 leading-relaxed">
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

        {/* URL Display */}
        {scannedUrl && (
          <div className="p-4 bg-neutral-50 rounded-2xl border border-neutral-100">
            <div className="flex items-center justify-between mb-2">
              <p className="text-[10px] font-mono font-bold text-neutral-400 uppercase tracking-wider">
                Scanned URL
              </p>
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
          </div>
        )}
      </motion.div>

      {/* Technical Trap Card */}
      <motion.div
        initial={{ y: 30, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.7, duration: 0.5 }}
        className="bg-white/70 border border-neutral-100 rounded-3xl p-6 shadow-sm mb-4"
      >
        <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-neutral-400 mb-3 flex items-center gap-2">
          <AlertTriangle size={12} className="text-amber-500" /> Technical Analysis
        </h4>
        <p className="text-sm font-bold text-slate-800 leading-snug">{activeContent.trap}</p>
      </motion.div>

      {/* Red Flags / Signals */}
      <motion.div
        initial={{ y: 30, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.9, duration: 0.5 }}
        className="bg-neutral-50/40 border border-neutral-100 rounded-3xl p-6 mb-4"
      >
        <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-neutral-400 mb-4 flex items-center gap-2">
          <Shield size={12} /> Technical Signals
        </h4>
        <div className="space-y-2">
          {activeContent.redFlags.map((flag, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 1.0 + i * 0.1 }}
              className="flex items-start gap-3 bg-white px-4 py-3 rounded-2xl border border-neutral-100/50 text-sm font-bold text-slate-700 shadow-sm"
            >
              <div className={`w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 ${
                result.riskLevel === RiskLevel.SAFE ? 'bg-emerald-500' : 'bg-red-500'
              }`} />
              <span className="leading-snug">{flag}</span>
            </motion.div>
          ))}
        </div>
      </motion.div>

      {/* ===== C. ACTION ARRAY (Sticky Footer) ===== */}
      <div className="fixed bottom-0 left-0 right-0 p-6 bg-white/90 backdrop-blur-2xl border-t border-neutral-100 z-50">
        {result.riskLevel === RiskLevel.DANGER ? (
          <>
            <motion.button
              whileTap={{ scale: 0.95 }}
              onClick={() => {
                triggerHaptic(RiskLevel.DANGER);
                alert('This link has been flagged and blocked.');
              }}
              className="w-full py-4 rounded-2xl font-bold text-sm text-white bg-red-600 hover:bg-red-700 shadow-2xl shadow-red-500/30 flex items-center justify-center gap-2 transition-all"
            >
              <Ban size={16} />
              Block & Report Link
            </motion.button>
            <button
              onClick={() => setShowRiskDetails(true)}
              className="w-full mt-3 text-[10px] text-neutral-400 hover:text-neutral-600 font-medium transition-colors"
            >
              I understand the risk, open anyway
            </button>
            <button
              onClick={onReset}
              className="w-full mt-4 text-[10px] font-mono font-bold text-neutral-400 uppercase tracking-widest flex items-center justify-center gap-2 hover:text-slate-900 transition-colors"
            >
              <RefreshCw size={12} /> START ANOTHER SCAN
            </button>
          </>
        ) : result.riskLevel === RiskLevel.CAUTION ? (
          <>
            <motion.button
              whileTap={{ scale: 0.95 }}
              onClick={handleOpenLink}
              className="w-full py-4 rounded-2xl font-bold text-sm text-white bg-amber-600 hover:bg-amber-700 shadow-2xl shadow-amber-500/30 flex items-center justify-center gap-2 transition-all"
            >
              <ExternalLink size={16} />
              Proceed with Caution
            </motion.button>
            <button
              onClick={onReset}
              className="w-full mt-4 text-[10px] font-mono font-bold text-neutral-400 uppercase tracking-widest flex items-center justify-center gap-2 hover:text-slate-900 transition-colors"
            >
              <RefreshCw size={12} /> START ANOTHER SCAN
            </button>
          </>
        ) : (
          <>
            <motion.button
              whileTap={{ scale: 0.95 }}
              onClick={handleOpenLink}
              className="w-full py-4 rounded-2xl font-bold text-sm text-white bg-slate-900 hover:bg-slate-800 shadow-2xl shadow-slate-500/20 flex items-center justify-center gap-2 transition-all"
            >
              <ExternalLink size={16} />
              Open Link
            </motion.button>
            <button
              onClick={onReset}
              className="w-full mt-4 text-[10px] font-mono font-bold text-neutral-400 uppercase tracking-widest flex items-center justify-center gap-2 hover:text-slate-900 transition-colors"
            >
              <RefreshCw size={12} /> START ANOTHER SCAN
            </button>
          </>
        )}
      </div>

      {/* Risk Override Confirmation Modal */}
      <AnimatePresence>
        {showRiskDetails && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[70] bg-black/60 backdrop-blur-sm flex items-end justify-center"
            onClick={() => setShowRiskDetails(false)}
          >
            <motion.div
              initial={{ y: 100 }}
              animate={{ y: 0 }}
              exit={{ y: 100 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-md bg-white rounded-t-3xl p-8 pb-10"
            >
              <div className="w-10 h-1 bg-neutral-200 rounded-full mx-auto mb-6" />
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center">
                  <ShieldAlert className="w-5 h-5 text-red-500" />
                </div>
                <div>
                  <h3 className="font-black text-slate-900 text-lg">Are you sure?</h3>
                  <p className="text-xs text-neutral-500 font-medium">This link was flagged as dangerous</p>
                </div>
              </div>
              <p className="text-sm text-slate-600 leading-relaxed mb-6">
                Our AI has identified this URL as a potential threat. Opening it may expose you to phishing, malware, or credential theft. Proceed only if you fully understand the risks.
              </p>
              <button
                onClick={() => {
                  setShowRiskDetails(false);
                  handleOpenLink();
                }}
                className="w-full py-4 rounded-2xl font-bold text-sm text-red-600 bg-red-50 border border-red-200 hover:bg-red-100 transition-all mb-3"
              >
                Open Anyway
              </button>
              <button
                onClick={() => setShowRiskDetails(false)}
                className="w-full py-4 rounded-2xl font-bold text-sm text-white bg-slate-900 transition-all"
              >
                Go Back to Safety
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

export default ScanResultPage;
