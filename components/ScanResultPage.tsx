
import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ShieldAlert,
  Ban,
  RefreshCw,
  Link as LinkIcon,
  ExternalLink,
  Copy,
  Check,
  Globe,
  ImageOff,
  Monitor,
  Clock,
  Server,
  AlertTriangle,
  Fingerprint,
  CircleAlert,
  MapPin,
  Building2,
  ShieldOff,
  Shield,
} from 'lucide-react';
import { RiskLevel, AnalysisResult, LocalizedAnalysis } from '../types';
import Aperture from './Aperture';
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

// --- Metadata severity color helper ---
const getMetaSeverity = (field: string, value: string | number): string => {
  if (field === 'domainAge') {
    if (typeof value === 'string' && (value.includes('hour') || value.includes('day') || value.includes('< ')))
      return 'text-red-600';
    if (typeof value === 'string' && value.includes('week')) return 'text-amber-600';
    return 'text-slate-700';
  }
  return 'text-slate-700';
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
          Safe Preview
        </h4>
        {loading && (
          <span className="text-[9px] font-mono text-blue-500 animate-pulse tracking-wider">
            RENDERING...
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
                  Capturing site preview...
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
            <span className="text-xs font-medium">{previewError || 'Preview unavailable'}</span>
          </div>
        )}

        {/* Overlay badge */}
        <div className="absolute top-3 left-3 px-2.5 py-1 bg-black/60 backdrop-blur-md rounded-full flex items-center gap-1.5">
          <div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
          <span className="text-[9px] font-mono text-white/80 tracking-wider uppercase">
            Sandboxed
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
  const { displayed: streamedExplanation, isDone: explanationDone } = useStreamingText(activeContent.explanation, 10);
  const [copied, setCopied] = useState(false);
  const [showRiskDetails, setShowRiskDetails] = useState(false);

  const meta = result.linkMetadata;
  const verified = meta?.verified;

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

  const handleOpenLink = () => {
    window.open(scannedUrl, '_blank', 'noopener,noreferrer');
  };

  return (
    <motion.div
      key="scan-result"
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className="w-full max-w-md mx-auto pb-56"
    >
      {/* ===== APERTURE SCORE ===== */}
      <div className="flex justify-center mb-8">
        <Aperture isAnalyzing={false} score={result.score} />
      </div>

      {/* Language Toggle */}
      <div className="flex justify-center mb-6 w-full h-10">
        {isDifferentLang && (
          <button
            onClick={onToggleLanguage}
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
        {/* ===== HEADLINE + CATEGORY ===== */}
        <div className="text-center space-y-3">
          <h2 className={`text-4xl font-black tracking-tighter uppercase leading-none ${getHeadlineColor(result.riskLevel)}`}>
            {activeContent.headline}
          </h2>
          <p className="text-slate-600 text-xs font-mono uppercase tracking-[0.2em] font-bold">
            Risk Context: {result.category}
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
                <LinkIcon size={12} /> Scanned URL
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
                  <span className="font-black">Note:</span> The use of{' '}
                  <code className="bg-blue-100 px-1.5 py-0.5 rounded text-[10px] font-mono font-bold">
                    {meta.suspiciousTld}
                  </code>{' '}
                  is a strong indicator of fraudulent activity.
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
              Redirect Chain Detected
              <span className="ml-auto text-[8px] font-mono px-2 py-0.5 rounded-full bg-amber-200 text-amber-700">
                {verified.redirectCount} {verified.redirectCount === 1 ? 'HOP' : 'HOPS'}
              </span>
            </h4>
            <div className="space-y-2">
              <div className="flex items-center gap-3 p-3 rounded-xl bg-white/60 border border-amber-100">
                <div className="w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center shrink-0">
                  <LinkIcon size={14} className="text-amber-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[9px] font-mono text-neutral-400 uppercase tracking-wider">QR Points To</p>
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
                  <p className="text-[9px] font-mono text-neutral-400 uppercase tracking-wider">Actually Goes To</p>
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
              <Shield size={12} /> Impersonation Analysis
            </h4>
            <div className="space-y-2">
              <div className="flex items-center gap-3 p-3 rounded-xl bg-neutral-50 border border-neutral-100">
                <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center">
                  <Shield size={14} className="text-blue-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[9px] font-mono text-neutral-400 uppercase tracking-wider">Impersonating</p>
                  <p className="text-sm font-bold text-slate-900 truncate">{meta.impersonating}</p>
                </div>
              </div>
              <div className="flex items-center gap-3 p-3 rounded-xl bg-red-50/50 border border-red-100">
                <div className="w-8 h-8 rounded-lg bg-red-50 flex items-center justify-center">
                  <AlertTriangle size={14} className="text-red-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[9px] font-mono text-neutral-400 uppercase tracking-wider">Actual Destination</p>
                  <p className="text-sm font-bold text-red-600 font-mono truncate">{meta.actualDomain}</p>
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {/* ===== DIGITAL FINGERPRINT GRID ===== */}
        {meta && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.25 }}
            className="bg-white/70 border border-neutral-100 rounded-3xl p-6 shadow-sm"
          >
            <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-neutral-400 mb-3 flex items-center gap-2">
              <Fingerprint size={12} /> Digital Fingerprint
            </h4>
            <div className="grid grid-cols-2 gap-3">
              {/* Domain Age */}
              <div className="p-4 rounded-2xl bg-neutral-50 border border-neutral-100">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2 text-neutral-400">
                    <Clock size={12} />
                    <span className="text-[9px] uppercase font-black tracking-wider">Domain Age</span>
                  </div>
                  {!verified?.domainAge && (
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
              <div className="p-4 rounded-2xl bg-neutral-50 border border-neutral-100">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2 text-neutral-400">
                    <Server size={12} />
                    <span className="text-[9px] uppercase font-black tracking-wider">Hosted In</span>
                  </div>
                  {!verified?.serverCountry && (
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

              {/* Registrant */}
              <div className="p-4 rounded-2xl bg-neutral-50 border border-neutral-100">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2 text-neutral-400">
                    <Building2 size={12} />
                    <span className="text-[9px] uppercase font-black tracking-wider">Registrant</span>
                  </div>
                  {!(verified && verified.checksCompleted.includes('whois')) && (
                    <CircleAlert size={10} className="text-amber-400" />
                  )}
                </div>
                <p className={`text-sm font-bold ${
                  verified?.privacyProtected && !verified?.registrantOrg ? 'text-amber-600' : 'text-slate-800'
                }`}>
                  {verified?.registrantOrg
                    || verified?.registrantName
                    || (verified?.privacyProtected ? 'Privacy Hidden' : 'Unknown')}
                </p>
              </div>

              {/* Owner Location */}
              <div className="p-4 rounded-2xl bg-neutral-50 border border-neutral-100">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2 text-neutral-400">
                    <MapPin size={12} />
                    <span className="text-[9px] uppercase font-black tracking-wider">Owner Location</span>
                  </div>
                  {!(verified && verified.checksCompleted.includes('whois')) && (
                    <CircleAlert size={10} className="text-amber-400" />
                  )}
                </div>
                <p className={`text-sm font-bold ${
                  verified?.geoMismatch ? 'text-red-600' : 'text-slate-800'
                }`}>
                  {[verified?.registrantCity, verified?.registrantState, verified?.registrantCountry]
                    .filter(Boolean).join(', ') || 'Unknown'}
                </p>
                {verified?.geoMismatch && verified?.serverCountry && (
                  <p className="text-[9px] font-mono text-red-500 mt-1">
                    Server: {verified.serverCountry}
                  </p>
                )}
              </div>
            </div>

            {/* Verification legend */}
            <div className="flex items-center gap-4 mt-3">
              <div className="flex items-center gap-1">
                <CircleAlert size={8} className="text-amber-400" />
                <span className="text-[8px] font-mono text-neutral-400 uppercase">AI Estimate</span>
              </div>
            </div>

            {/* Privacy badge */}
            {verified?.privacyProtected && (
              <div className="flex items-center gap-2 mt-3 px-3 py-2 rounded-xl bg-amber-50/80 border border-amber-100">
                <ShieldOff size={12} className="text-amber-500 shrink-0" />
                <span className="text-[10px] font-bold text-amber-700">WHOIS Privacy Protected</span>
              </div>
            )}

            {/* Safe Browsing, Homograph, Redirects indicators */}
            {verified && (verified.homographAttack || (verified.redirectCount > 0) || verified.checksCompleted.includes('safe_browsing')) && (
              <div className="mt-3 p-3 rounded-xl bg-neutral-100/50 border border-neutral-100 space-y-1.5">
                {verified.checksCompleted.includes('safe_browsing') && (
                  <div className="flex items-center gap-2">
                    <ShieldAlert size={10} className={
                      (verified.safeBrowsingThreats?.length || 0) > 0 ? 'text-red-500' : 'text-emerald-500'
                    } />
                    <span className={`text-[10px] font-mono truncate ${
                      (verified.safeBrowsingThreats?.length || 0) > 0 ? 'text-red-600 font-bold' : 'text-neutral-500'
                    }`}>
                      {(verified.safeBrowsingThreats?.length || 0) > 0
                        ? `Safe Browsing: ${verified.safeBrowsingThreats!.join(', ')}`
                        : 'Safe Browsing: No threats'}
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

        {/* ===== GEO-MISMATCH ALERT ===== */}
        {verified?.geoMismatch && verified.geoMismatchDetails.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className={`border rounded-3xl p-6 shadow-sm ${
              verified.geoMismatchSeverity === 'high'
                ? 'bg-red-50/80 border-red-200'
                : verified.geoMismatchSeverity === 'medium'
                  ? 'bg-amber-50/80 border-amber-200'
                  : 'bg-yellow-50/80 border-yellow-200'
            }`}
          >
            <h4 className={`text-[10px] font-black uppercase tracking-[0.2em] mb-3 flex items-center gap-2 ${
              verified.geoMismatchSeverity === 'high' ? 'text-red-500' : 'text-amber-500'
            }`}>
              <AlertTriangle size={12} />
              Geographic Inconsistency
              <span className={`ml-auto text-[8px] font-mono px-2 py-0.5 rounded-full ${
                verified.geoMismatchSeverity === 'high'
                  ? 'bg-red-200 text-red-700'
                  : verified.geoMismatchSeverity === 'medium'
                    ? 'bg-amber-200 text-amber-700'
                    : 'bg-yellow-200 text-yellow-700'
              }`}>
                {verified.geoMismatchSeverity.toUpperCase()}
              </span>
            </h4>
            <div className="space-y-2">
              {verified.geoMismatchDetails.map((detail, i) => (
                <div key={i} className="flex items-start gap-2.5">
                  <div className={`w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 ${
                    verified.geoMismatchSeverity === 'high' ? 'bg-red-500' : 'bg-amber-500'
                  }`} />
                  <p className={`text-sm font-bold leading-snug ${
                    verified.geoMismatchSeverity === 'high' ? 'text-red-800' : 'text-amber-800'
                  }`}>
                    {detail}
                  </p>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </motion.div>

      {/* ===== STICKY FOOTER ===== */}
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
