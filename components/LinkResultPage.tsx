
import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ShieldAlert,
  ShieldCheck,
  Shield,
  Globe,
  Clock,
  Server,
  Lock,
  AlertTriangle,
  Ban,
  RefreshCw,
  ExternalLink,
  Flag,
  Eye,
  Fingerprint,
  Search,
  CheckCircle,
  CircleAlert,
  Network,
} from 'lucide-react';
import { RiskLevel, AnalysisResult, LocalizedAnalysis } from '../types';

interface LinkResultPageProps {
  result: AnalysisResult;
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

// --- Risk-level visual config ---
const getConfig = (riskLevel: RiskLevel) => {
  switch (riskLevel) {
    case RiskLevel.DANGER:
      return {
        accentBg: 'bg-red-50',
        accentText: 'text-red-600',
        accentBorder: 'border-red-200',
        badgeClass: 'bg-red-500 shadow-red-500/30',
        heroBg: 'bg-gradient-to-b from-red-50 to-white',
        label: 'CRITICAL THREAT',
        sublabel: 'Do Not Visit',
        buttonBg: 'bg-red-600 hover:bg-red-700',
        buttonShadow: 'shadow-red-500/30',
        pulseColor: 'bg-red-500',
        Icon: ShieldAlert,
      };
    case RiskLevel.CAUTION:
      return {
        accentBg: 'bg-amber-50',
        accentText: 'text-amber-600',
        accentBorder: 'border-amber-200',
        badgeClass: 'bg-amber-500 shadow-amber-500/30',
        heroBg: 'bg-gradient-to-b from-amber-50 to-white',
        label: 'SUSPICIOUS',
        sublabel: 'Exercise Caution',
        buttonBg: 'bg-amber-600 hover:bg-amber-700',
        buttonShadow: 'shadow-amber-500/30',
        pulseColor: 'bg-amber-500',
        Icon: Eye,
      };
    default:
      return {
        accentBg: 'bg-emerald-50',
        accentText: 'text-emerald-600',
        accentBorder: 'border-emerald-200',
        badgeClass: 'bg-emerald-500 shadow-emerald-500/30',
        heroBg: 'bg-gradient-to-b from-emerald-50 to-white',
        label: 'LINK VERIFIED',
        sublabel: 'Appears Safe',
        buttonBg: 'bg-slate-900 hover:bg-slate-800',
        buttonShadow: 'shadow-slate-500/20',
        pulseColor: 'bg-emerald-500',
        Icon: ShieldCheck,
      };
  }
};

// --- URL Autopsy Component ---
const UrlAutopsy: React.FC<{ url: string; suspiciousTld: string; riskLevel: RiskLevel }> = ({
  url,
  suspiciousTld,
  riskLevel,
}) => {
  try {
    const parsed = new URL(url.startsWith('http') ? url : `https://${url}`);
    const protocol = parsed.protocol + '//';
    const host = parsed.hostname;
    const pathAndQuery = parsed.pathname + parsed.search + parsed.hash;

    const hostParts = host.split('.');
    const tld = '.' + hostParts[hostParts.length - 1];
    const domainWithoutTld = hostParts.slice(0, -1).join('.');

    const isSuspiciousTld = suspiciousTld && tld.includes(suspiciousTld.replace('.', ''));
    const isDanger = riskLevel === RiskLevel.DANGER;
    const isCaution = riskLevel === RiskLevel.CAUTION;

    return (
      <div className="font-mono text-sm break-all leading-relaxed">
        <span className="text-neutral-400">{protocol}</span>
        <span
          className={
            isDanger
              ? 'text-red-800 font-semibold'
              : isCaution
                ? 'text-amber-800 font-semibold'
                : 'text-emerald-700 font-semibold'
          }
        >
          {domainWithoutTld}
        </span>
        <span
          className={
            isSuspiciousTld
              ? `${isDanger ? 'bg-red-200/80 text-red-800' : 'bg-yellow-200 text-yellow-800'} px-1 rounded mx-0.5 font-bold`
              : 'text-neutral-500'
          }
        >
          {tld}
        </span>
        {pathAndQuery !== '/' && <span className="text-neutral-400">{pathAndQuery}</span>}
      </div>
    );
  } catch {
    return <span className="font-mono text-sm text-neutral-700 break-all">{url}</span>;
  }
};

// --- Metadata severity color helper ---
const getMetaSeverity = (field: string, value: string | number): string => {
  if (field === 'domainAge') {
    if (typeof value === 'string' && (value.includes('hour') || value.includes('day') || value.includes('< ')))
      return 'text-red-600';
    if (typeof value === 'string' && value.includes('week')) return 'text-amber-600';
    return 'text-slate-700';
  }
  if (field === 'blacklistCount') {
    if (typeof value === 'number' && value > 0) return 'text-red-600';
    return 'text-emerald-600';
  }
  return 'text-slate-700';
};

// =============================================
// MAIN COMPONENT
// =============================================
const LinkResultPage: React.FC<LinkResultPageProps> = ({
  result,
  activeContent,
  onReset,
  viewMode,
  onToggleLanguage,
  isDifferentLang,
}) => {
  const config = getConfig(result.riskLevel);
  const { displayed: streamedExplanation, isDone: explanationDone } = useStreamingText(
    activeContent.explanation,
    10
  );
  const [showReportModal, setShowReportModal] = useState(false);
  const IconComponent = config.Icon;

  const meta = result.linkMetadata;
  const verified = meta?.verified;
  const analyzedUrl = meta?.analyzedUrl || '';

  useEffect(() => {
    triggerHaptic(result.riskLevel);
  }, [result.riskLevel]);

  return (
    <motion.div
      key="link-result"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className="w-full max-w-md mx-auto pb-60"
    >
      {/* ===== A. SANDBOXED PREVIEW HERO ===== */}
      <div
        className={`relative w-full h-56 ${config.heroBg} overflow-hidden rounded-b-3xl border-b ${config.accentBorder}`}
      >
        {/* Grid pattern overlay */}
        <div
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage:
              'repeating-linear-gradient(0deg, #000 0px, transparent 1px, transparent 40px), repeating-linear-gradient(90deg, #000 0px, transparent 1px, transparent 40px)',
          }}
        />

        {/* Simulated blurred site content */}
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-3/4 space-y-3 opacity-10">
            <div className="h-4 bg-neutral-400 rounded w-1/2 mx-auto" />
            <div className="h-3 bg-neutral-300 rounded w-3/4 mx-auto" />
            <div className="h-8 bg-neutral-300 rounded w-2/3 mx-auto" />
            <div className="h-3 bg-neutral-300 rounded w-1/2 mx-auto" />
          </div>
        </div>

        {/* Glass safety overlay */}
        <div className="absolute inset-0 bg-white/40 backdrop-blur-md flex flex-col items-center justify-center z-10">
          <motion.div
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 200, damping: 15 }}
            className={`${config.badgeClass} text-white px-4 py-1.5 rounded-full text-[10px] font-black tracking-[0.2em] uppercase mb-3 shadow-lg`}
          >
            {config.label}
          </motion.div>
          <motion.h2
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="text-2xl font-black text-slate-900 tracking-tight uppercase"
          >
            {config.sublabel}
          </motion.h2>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4 }}
            className="mt-2 flex items-center gap-2 text-neutral-500"
          >
            <Lock size={10} />
            <span className="text-[9px] font-mono uppercase tracking-widest font-bold">
              Sandboxed Analysis
            </span>
          </motion.div>
        </div>
      </div>

      <div className="px-5 -mt-8 relative z-20">
        {/* ===== B. VERDICT CARD ===== */}
        <motion.div
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.3 }}
          className={`bg-white rounded-3xl shadow-xl border ${config.accentBorder} p-6 mb-4`}
        >
          {/* Header: Targeted Entity */}
          <div className="flex items-start justify-between mb-6">
            <div>
              <p className="text-[10px] font-mono text-neutral-400 uppercase tracking-wider mb-1">
                Targeted Entity
              </p>
              <h3 className="text-xl font-black text-slate-900 tracking-tight flex items-center gap-2">
                {meta?.impersonating || result.category || 'Unknown'}
                {result.riskLevel !== RiskLevel.SAFE && (
                  <span className="bg-red-100 text-red-600 text-[9px] px-2 py-0.5 rounded-full font-black uppercase tracking-wider">
                    Fake
                  </span>
                )}
              </h3>
            </div>
            <div
              className={`h-11 w-11 rounded-2xl ${config.accentBg} flex items-center justify-center ${config.accentText}`}
            >
              <IconComponent className="w-6 h-6" />
            </div>
          </div>

          {/* Language Toggle */}
          {isDifferentLang && (
            <button
              onClick={onToggleLanguage}
              className="mb-5 flex items-center gap-2 px-4 py-2 bg-neutral-100 hover:bg-blue-50 border border-neutral-200 rounded-full transition-all w-full justify-center"
            >
              <Globe size={12} className="text-blue-600" />
              <span className="text-[10px] font-black uppercase tracking-wider text-slate-500">
                {viewMode === 'translated'
                  ? `Show in ${result.detectedNativeLanguage}`
                  : `Show in ${result.userSystemLanguage}`}
              </span>
            </button>
          )}

          {/* URL Autopsy */}
          {analyzedUrl && (
            <div className="bg-neutral-50 rounded-2xl p-4 border border-neutral-200 mb-5">
              <p className="text-[10px] text-neutral-400 mb-2 font-mono uppercase tracking-wider font-bold">
                Detected URL Structure
              </p>
              <UrlAutopsy
                url={analyzedUrl}
                suspiciousTld={meta?.suspiciousTld || ''}
                riskLevel={result.riskLevel}
              />

              {/* AI Insight on suspicious TLD */}
              {meta?.suspiciousTld && (
                <motion.div
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.8 }}
                  className="mt-3 flex items-start gap-2"
                >
                  <div className="w-0.5 h-full min-h-[2rem] bg-gradient-to-b from-blue-500 to-transparent rounded-full shrink-0" />
                  <p className="text-[11px] text-blue-600 leading-snug">
                    <span className="font-black">AI Insight:</span> The use of{' '}
                    <code className="bg-blue-100 px-1.5 py-0.5 rounded text-[10px] font-mono font-bold">
                      {meta.suspiciousTld}
                    </code>{' '}
                    is a strong indicator of fraudulent activity.
                  </p>
                </motion.div>
              )}
            </div>
          )}

          {/* Impersonation Diff (Fake vs Real) */}
          {meta && meta.impersonating && meta.impersonating !== 'None detected' && (
            <div className="space-y-2 mb-5">
              <div className="flex items-center gap-3 p-3 rounded-xl bg-neutral-50 border border-neutral-100">
                <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center">
                  <Shield size={14} className="text-blue-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[9px] font-mono text-neutral-400 uppercase tracking-wider">
                    Impersonating
                  </p>
                  <p className="text-sm font-bold text-slate-900 truncate">{meta.impersonating}</p>
                </div>
              </div>
              <div className="flex items-center gap-3 p-3 rounded-xl bg-red-50/50 border border-red-100">
                <div className="w-8 h-8 rounded-lg bg-red-50 flex items-center justify-center">
                  <AlertTriangle size={14} className="text-red-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[9px] font-mono text-neutral-400 uppercase tracking-wider">
                    Actual Destination
                  </p>
                  <p className="text-sm font-bold text-red-600 font-mono truncate">
                    {meta.actualDomain}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Score badge */}
          <div className="flex items-center gap-3">
            <div className={`h-2 w-2 rounded-full ${config.pulseColor} animate-pulse`} />
            <span className="text-[9px] font-mono text-neutral-400 tracking-[0.2em] uppercase">
              Risk Score: {result.score}/100 · {result.category}
            </span>
          </div>
        </motion.div>

        {/* ===== C. DIGITAL FINGERPRINT ===== */}
        {meta && (
          <motion.div
            initial={{ y: 30, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.5 }}
            className="mb-4"
          >
            <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-neutral-400 mb-3 flex items-center gap-2 px-1">
              <Fingerprint size={12} /> Digital Fingerprint
            </h4>
            <div className="grid grid-cols-2 gap-3">
              {/* Domain Age */}
              <div className="p-4 rounded-2xl bg-white border border-neutral-100 shadow-sm">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2 text-neutral-400">
                    <Clock size={12} />
                    <span className="text-[9px] uppercase font-black tracking-wider">Domain Age</span>
                  </div>
                  {verified?.domainAge ? (
                    <CheckCircle size={10} className="text-emerald-500" />
                  ) : (
                    <CircleAlert size={10} className="text-amber-400" />
                  )}
                </div>
                <p className={`text-sm font-bold ${getMetaSeverity('domainAge', verified?.domainAge || meta.domainAge)}`}>
                  {verified?.domainAge || meta.domainAge}
                </p>
                {verified?.registrationDate && (
                  <p className="text-[9px] font-mono text-neutral-400 mt-1">
                    Reg: {new Date(verified.registrationDate).toLocaleDateString()}
                  </p>
                )}
              </div>

              {/* Server Location */}
              <div className="p-4 rounded-2xl bg-white border border-neutral-100 shadow-sm">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2 text-neutral-400">
                    <Server size={12} />
                    <span className="text-[9px] uppercase font-black tracking-wider">Hosted In</span>
                  </div>
                  {verified?.serverCountry ? (
                    <CheckCircle size={10} className="text-emerald-500" />
                  ) : (
                    <CircleAlert size={10} className="text-amber-400" />
                  )}
                </div>
                <p className="text-sm font-bold text-slate-800">
                  {verified?.serverCountry
                    ? `${verified.serverCountry}${verified.serverCity ? `, ${verified.serverCity}` : ''}`
                    : meta.serverLocation}
                </p>
                {verified?.isp && (
                  <p className="text-[9px] font-mono text-neutral-400 mt-1 truncate" title={verified.isp}>
                    {verified.isp}
                  </p>
                )}
              </div>

              {/* DNS Resolution */}
              <div className="p-4 rounded-2xl bg-white border border-neutral-100 shadow-sm">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2 text-neutral-400">
                    <Network size={12} />
                    <span className="text-[9px] uppercase font-black tracking-wider">DNS</span>
                  </div>
                  {verified?.resolvedIp ? (
                    <CheckCircle size={10} className="text-emerald-500" />
                  ) : verified && verified.checksCompleted.includes('dns') === false ? (
                    <CheckCircle size={10} className="text-emerald-500" />
                  ) : (
                    <CircleAlert size={10} className="text-amber-400" />
                  )}
                </div>
                <p className={`text-sm font-bold ${
                  verified?.resolvedIp ? 'text-slate-800' : 'text-red-600'
                }`}>
                  {verified?.resolvedIp || (verified ? 'Does not resolve' : 'Unchecked')}
                </p>
              </div>

              {/* Blacklists / Safe Browsing */}
              <div className="p-4 rounded-2xl bg-white border border-neutral-100 shadow-sm">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2 text-neutral-400">
                    <Flag size={12} />
                    <span className="text-[9px] uppercase font-black tracking-wider">Safe Browsing</span>
                  </div>
                  {verified && verified.checksCompleted.includes('safe_browsing') ? (
                    <CheckCircle size={10} className="text-emerald-500" />
                  ) : (
                    <CircleAlert size={10} className="text-amber-400" />
                  )}
                </div>
                <p className={`text-sm font-bold ${
                  (verified?.safeBrowsingThreats?.length || 0) > 0
                    ? 'text-red-600'
                    : meta.blacklistCount > 0
                      ? 'text-red-600'
                      : 'text-emerald-600'
                }`}>
                  {verified?.safeBrowsingThreats?.length
                    ? `${verified.safeBrowsingThreats.length} threat${verified.safeBrowsingThreats.length > 1 ? 's' : ''}`
                    : meta.blacklistCount > 0
                      ? `Flagged on ${meta.blacklistCount}`
                      : 'No threats'}
                </p>
              </div>
            </div>

            {/* Verification legend */}
            <div className="flex items-center gap-4 mt-3 px-1">
              <div className="flex items-center gap-1">
                <CheckCircle size={8} className="text-emerald-500" />
                <span className="text-[8px] font-mono text-neutral-400 uppercase">Verified (API)</span>
              </div>
              <div className="flex items-center gap-1">
                <CircleAlert size={8} className="text-amber-400" />
                <span className="text-[8px] font-mono text-neutral-400 uppercase">AI Estimate</span>
              </div>
            </div>

            {/* Extra verified data: Registrar, Homograph, Redirects */}
            {verified && (verified.registrar || verified.homographAttack || (verified.redirectCount > 0)) && (
              <div className="mt-3 p-3 rounded-xl bg-neutral-50 border border-neutral-100 space-y-1.5">
                {verified.registrar && (
                  <div className="flex items-center gap-2">
                    <Globe size={10} className="text-neutral-400" />
                    <span className="text-[10px] font-mono text-neutral-500 truncate">
                      Registrar: {verified.registrar}
                    </span>
                  </div>
                )}
                {verified.homographAttack && (
                  <div className="flex items-center gap-2">
                    <AlertTriangle size={10} className="text-red-500" />
                    <span className="text-[10px] font-mono text-red-600 font-bold">
                      HOMOGRAPH ATTACK DETECTED (Punycode/Cyrillic)
                    </span>
                  </div>
                )}
                {verified.redirectCount > 0 && verified.finalUrl && (
                  <div className="flex items-center gap-2">
                    <ExternalLink size={10} className="text-amber-500" />
                    <span className="text-[10px] font-mono text-amber-600 truncate">
                      Redirects to: {verified.finalUrl}
                    </span>
                  </div>
                )}
              </div>
            )}
          </motion.div>
        )}

        {/* ===== D. AI FORENSIC REPORT ===== */}
        <motion.div
          initial={{ y: 30, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.7 }}
          className={`rounded-3xl border ${config.accentBorder} bg-white/70 backdrop-blur-sm p-6 shadow-sm mb-4`}
        >
          <div className="flex items-center justify-between mb-4">
            <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-neutral-400 flex items-center gap-2">
              <Search size={12} /> AI Forensic Report
            </h4>
            <div className="flex items-center gap-2">
              <div className={`h-2 w-2 rounded-full ${config.pulseColor} animate-pulse`} />
              <span className="text-[9px] font-mono text-neutral-400 uppercase tracking-wider">
                Gemini
              </span>
            </div>
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

          {/* Hook & Trap */}
          <div className="space-y-4">
            <div>
              <p className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider mb-1.5">
                The Hook
              </p>
              <p className={`text-sm font-bold leading-snug ${config.accentText}`}>
                {activeContent.hook}
              </p>
            </div>
            <div>
              <p className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider mb-1.5">
                Technical Trap
              </p>
              <p className="text-sm font-bold text-slate-800 leading-snug">{activeContent.trap}</p>
            </div>
          </div>
        </motion.div>

        {/* ===== E. TECHNICAL SIGNALS ===== */}
        <motion.div
          initial={{ y: 30, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.9 }}
          className="bg-neutral-50/40 border border-neutral-100 rounded-3xl p-6 mb-4"
        >
          <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-neutral-400 mb-4 flex items-center gap-2">
            <ShieldAlert size={12} /> Technical Signals
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
                <div
                  className={`w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 ${
                    result.riskLevel === RiskLevel.SAFE ? 'bg-emerald-500' : 'bg-red-500'
                  }`}
                />
                <span className="leading-snug">{flag}</span>
              </motion.div>
            ))}
          </div>
        </motion.div>
      </div>

      {/* ===== F. STICKY FOOTER ACTIONS ===== */}
      <div className="fixed bottom-0 left-0 right-0 p-6 bg-white/90 backdrop-blur-2xl border-t border-neutral-100 z-50">
        {result.riskLevel === RiskLevel.DANGER ? (
          <>
            <motion.button
              whileTap={{ scale: 0.95 }}
              onClick={() => setShowReportModal(true)}
              className={`w-full py-4 ${config.buttonBg} text-white font-bold rounded-2xl shadow-2xl ${config.buttonShadow} text-sm flex items-center justify-center gap-2 transition-all`}
            >
              <Ban size={16} />
              Block & Report
            </motion.button>
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
              onClick={() => setShowReportModal(true)}
              className={`w-full py-4 ${config.buttonBg} text-white font-bold rounded-2xl shadow-2xl ${config.buttonShadow} text-sm flex items-center justify-center gap-2 transition-all`}
            >
              <Flag size={16} />
              Report Suspicious
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
              onClick={() => {
                if (analyzedUrl) window.open(analyzedUrl, '_blank', 'noopener,noreferrer');
              }}
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

      {/* ===== REPORT CONFIRMATION MODAL ===== */}
      <AnimatePresence>
        {showReportModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[70] bg-black/60 backdrop-blur-sm flex items-end justify-center"
            onClick={() => setShowReportModal(false)}
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
                  <Flag className="w-5 h-5 text-red-500" />
                </div>
                <div>
                  <h3 className="font-black text-slate-900 text-lg">Report this link?</h3>
                  <p className="text-xs text-neutral-500 font-medium">
                    Help protect others from this threat
                  </p>
                </div>
              </div>
              <p className="text-sm text-slate-600 leading-relaxed mb-6">
                This will report the URL to security databases (Google Safe Browsing, PhishTank) and
                local cybersecurity authorities. Your report helps protect others from similar threats.
              </p>
              {analyzedUrl && (
                <div className="bg-neutral-50 rounded-xl p-3 mb-6 border border-neutral-100">
                  <p className="font-mono text-xs text-neutral-600 break-all">{analyzedUrl}</p>
                </div>
              )}
              <button
                onClick={() => {
                  setShowReportModal(false);
                  triggerHaptic(RiskLevel.SAFE);
                  alert(
                    'Report submitted successfully. Thank you for helping keep the internet safe.'
                  );
                }}
                className="w-full py-4 rounded-2xl font-bold text-sm text-white bg-red-600 hover:bg-red-700 transition-all mb-3 shadow-lg shadow-red-500/20"
              >
                Confirm Report
              </button>
              <button
                onClick={() => setShowReportModal(false)}
                className="w-full py-4 rounded-2xl font-bold text-sm text-neutral-600 bg-neutral-100 hover:bg-neutral-200 transition-all"
              >
                Cancel
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

export default LinkResultPage;
