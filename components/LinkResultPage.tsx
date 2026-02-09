
import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  Shield,
  Globe,
  AlertTriangle,
  RefreshCw,
} from 'lucide-react';
import { RiskLevel, AnalysisResult, LocalizedAnalysis } from '../types';
import Aperture from './Aperture';
import ThreatStoryAndFeedback from './ThreatStoryAndFeedback';
import DigitalFingerprint from './DigitalFingerprint';
import { useI18n } from '../i18n/I18nContext';

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
  const { t } = useI18n();
  const { displayed: streamedExplanation, isDone: explanationDone } = useStreamingText(
    activeContent.explanation,
    10
  );

  const meta = result.linkMetadata;
  const verified = meta?.verified;
  const analyzedUrl = meta?.analyzedUrl || '';
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
                {t('result.showIn', { language: viewMode === 'translated' ? result.detectedNativeLanguage : result.userSystemLanguage })}
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

        {/* ===== CONTENT CARDS ===== */}
        <div className="grid gap-3">
          {/* URL Autopsy Card */}
          {analyzedUrl && (
            <div className="bg-white/70 border border-neutral-100 rounded-3xl p-6 shadow-sm">
              <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-neutral-400 mb-3 flex items-center gap-2">
                <Globe size={12} /> {t('link.detectedUrlStructure')}
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
                    <span className="font-black">{t('link.aiInsight')}</span>{' '}
                    {t('scan.suspiciousTldNote', { tld: meta.suspiciousTld })}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Impersonation Diff */}
          {meta && meta.impersonating && meta.impersonating !== 'None detected' && (
            <div className="bg-white/70 border border-neutral-100 rounded-3xl p-6 shadow-sm">
              <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-neutral-400 mb-3 flex items-center gap-2">
                <Shield size={12} /> {t('scan.impersonationAnalysis')}
              </h4>
              <div className="space-y-2">
                <div className="flex items-center gap-3 p-3 rounded-xl bg-neutral-50 border border-neutral-100">
                  <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center">
                    <Shield size={14} className="text-blue-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[9px] font-mono text-neutral-400 uppercase tracking-wider">
                      {t('scan.impersonating')}
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
                      {t('scan.actualDestination')}
                    </p>
                    <p className="text-sm font-bold text-red-600 font-mono truncate">
                      {meta.actualDomain}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Digital Fingerprint + Geo-Mismatch Alert */}
          {meta && <DigitalFingerprint meta={meta} />}

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
            <RefreshCw size={12} /> {t('result.startAnotherScan')}
          </button>
        </div>
      </div>
    </motion.div>
  );
};

export default LinkResultPage;
