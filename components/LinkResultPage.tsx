
import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  ShieldAlert,
  Shield,
  Globe,
  Clock,
  Server,
  AlertTriangle,
  RefreshCw,
  Fingerprint,
  CircleAlert,
  MapPin,
  Building2,
  ShieldOff,
  Mail,
  Phone,
} from 'lucide-react';
import { RiskLevel, AnalysisResult, LocalizedAnalysis } from '../types';
import Aperture from './Aperture';
import ThreatStoryAndFeedback from './ThreatStoryAndFeedback';

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

// --- Headline color helper ---
const getHeadlineColor = (riskLevel: RiskLevel) => {
  switch (riskLevel) {
    case RiskLevel.DANGER: return 'text-red-600';
    case RiskLevel.CAUTION: return 'text-amber-600';
    default: return 'text-emerald-600';
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
  const { displayed: streamedExplanation, isDone: explanationDone } = useStreamingText(
    activeContent.explanation,
    10
  );

  const meta = result.linkMetadata;
  const verified = meta?.verified;
  const analyzedUrl = meta?.analyzedUrl || '';
  const infrastructureClues = [
    meta?.suspiciousTld ? `Suspicious TLD: ${meta.suspiciousTld}` : '',
    meta?.impersonating && meta.impersonating !== 'None detected'
      ? `Impersonating: ${meta.impersonating}`
      : '',
    verified?.safeBrowsingThreats && verified.safeBrowsingThreats.length > 0
      ? `Safe Browsing flagged: ${verified.safeBrowsingThreats.join(', ')}`
      : '',
    verified?.homographAttack ? 'Homograph attack indicators detected' : '',
    verified?.geoMismatch && verified.geoMismatchDetails.length > 0 ? verified.geoMismatchDetails[0] : '',
    ...activeContent.redFlags,
  ].filter(Boolean).slice(0, 3) as string[];

  useEffect(() => {
    triggerHaptic(result.riskLevel);
  }, [result.riskLevel]);

  return (
    <motion.div
      key="link-result"
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
                Show in {viewMode === 'translated' ? result.detectedNativeLanguage : result.userSystemLanguage}
              </span>
            </button>
          )}
        </div>
      </div>

      <motion.div key={viewMode} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
        {/* ===== HEADLINE + CATEGORY + EXPLANATION ===== */}
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

        {/* ===== CONTENT CARDS ===== */}
        <div className="grid gap-3">
          {/* URL Autopsy Card */}
          {analyzedUrl && (
            <div className="bg-white/70 border border-neutral-100 rounded-3xl p-6 shadow-sm">
              <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-neutral-400 mb-3 flex items-center gap-2">
                <Globe size={12} /> Detected URL Structure
              </h4>
              <UrlAutopsy
                url={analyzedUrl}
                suspiciousTld={meta?.suspiciousTld || ''}
                riskLevel={result.riskLevel}
              />
              {meta?.suspiciousTld && (
                <div className="mt-3 flex items-start gap-2">
                  <div className="w-0.5 h-full min-h-[2rem] bg-gradient-to-b from-blue-500 to-transparent rounded-full shrink-0" />
                  <p className="text-[11px] text-blue-600 leading-snug">
                    <span className="font-black">AI Insight:</span> The use of{' '}
                    <code className="bg-blue-100 px-1.5 py-0.5 rounded text-[10px] font-mono font-bold">
                      {meta.suspiciousTld}
                    </code>{' '}
                    is a strong indicator of fraudulent activity.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Impersonation Diff */}
          {meta && meta.impersonating && meta.impersonating !== 'None detected' && (
            <div className="bg-white/70 border border-neutral-100 rounded-3xl p-6 shadow-sm">
              <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-neutral-400 mb-3 flex items-center gap-2">
                <Shield size={12} /> Impersonation Analysis
              </h4>
              <div className="space-y-2">
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
            </div>
          )}

          {/* Digital Fingerprint */}
          {meta && (
            <div className="bg-white/70 border border-neutral-100 rounded-3xl p-6 shadow-sm">
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

                {/* Registrar */}
                <div className="p-4 rounded-2xl bg-neutral-50 border border-neutral-100">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2 text-neutral-400">
                      <Building2 size={12} />
                      <span className="text-[9px] uppercase font-black tracking-wider">Registrar</span>
                    </div>
                  </div>
                  <p className="text-sm font-bold text-slate-800">
                    {verified?.registrar || 'Unknown'}
                  </p>
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

                {/* Registrant Location (WHOIS) */}
                <div className="p-4 rounded-2xl bg-neutral-50 border border-neutral-100">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2 text-neutral-400">
                      <MapPin size={12} />
                      <span className="text-[9px] uppercase font-black tracking-wider">Registrant</span>
                    </div>
                    {!(verified && verified.checksCompleted.includes('whois')) && (
                      <CircleAlert size={10} className="text-amber-400" />
                    )}
                  </div>
                  <p className={`text-sm font-bold ${
                    verified?.privacyProtected ? 'text-amber-600' : verified?.geoMismatch ? 'text-red-600' : 'text-slate-800'
                  }`}>
                    {verified?.registrantOrg || verified?.registrantName
                      || (verified?.privacyProtected ? 'Privacy Protected' : 'Unknown')}
                  </p>
                  <p className="text-[9px] font-mono text-neutral-400 mt-1">
                    {[verified?.registrantCity, verified?.registrantCountry]
                      .filter(Boolean).join(', ') || 'Location unknown'}
                  </p>
                </div>

                {/* Owner Email */}
                <div className="p-4 rounded-2xl bg-neutral-50 border border-neutral-100">
                  <div className="flex items-center gap-2 text-neutral-400 mb-2">
                    <Mail size={12} />
                    <span className="text-[9px] uppercase font-black tracking-wider">Contact Email</span>
                  </div>
                  <p className={`text-sm font-bold break-all leading-snug ${
                    verified?.registrantEmail?.includes('withheldforprivacy') || verified?.registrantEmail?.includes('whoisguard')
                      ? 'text-amber-600' : 'text-slate-800'
                  }`}>
                    {verified?.registrantEmail || 'Not available'}
                  </p>
                </div>

                {/* Owner Phone */}
                <div className="p-4 rounded-2xl bg-neutral-50 border border-neutral-100">
                  <div className="flex items-center gap-2 text-neutral-400 mb-2">
                    <Phone size={12} />
                    <span className="text-[9px] uppercase font-black tracking-wider">Contact Phone</span>
                  </div>
                  <p className="text-sm font-bold text-slate-800">
                    {verified?.registrantTelephone || 'Not available'}
                  </p>
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

              {/* Extra verified data: Safe Browsing, Homograph, Redirects */}
              {verified && (verified.homographAttack || verified.checksCompleted.includes('safe_browsing')) && (
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
                </div>
              )}
            </div>
          )}

          {/* Geo-Mismatch Alert */}
          {verified?.geoMismatch && verified.geoMismatchDetails.length > 0 && (
            <div className={`border rounded-3xl p-6 shadow-sm ${
              verified.geoMismatchSeverity === 'high'
                ? 'bg-red-50/80 border-red-200'
                : verified.geoMismatchSeverity === 'medium'
                  ? 'bg-amber-50/80 border-amber-200'
                  : 'bg-yellow-50/80 border-yellow-200'
            }`}>
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
            </div>
          )}

          <ThreatStoryAndFeedback
            hook={activeContent.hook}
            trap={activeContent.trap}
            infrastructureClues={infrastructureClues}
            category={result.category}
            analysisId={result.analysisId}
          />
        </div>
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
          <button
            onClick={onReset}
            className="w-full mt-4 text-[10px] font-mono font-bold text-neutral-400 uppercase tracking-widest flex items-center justify-center gap-2 hover:text-slate-900 transition-colors"
          >
            <RefreshCw size={12} /> START ANOTHER SCAN
          </button>
        </div>
      </div>
    </motion.div>
  );
};

export default LinkResultPage;
