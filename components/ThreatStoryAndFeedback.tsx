import React, { useMemo, useState } from 'react';
import { Check, Ban, Anchor, Zap, ShieldAlert } from 'lucide-react';
import { submitFeedback } from '../services/geminiService';
import { useI18n } from '../i18n/I18nContext';

interface ThreatStoryAndFeedbackProps {
  hook: string;
  trap: string;
  infrastructureClues: string[];
  category: string;
  analysisId?: string | null;
}

type FeedbackChoice = 'correct' | 'incorrect' | null;

const ThreatStoryAndFeedback: React.FC<ThreatStoryAndFeedbackProps> = ({
  hook,
  trap,
  infrastructureClues,
  category,
  analysisId,
}) => {
  const { t } = useI18n();
  const [feedbackChoice, setFeedbackChoice] = useState<FeedbackChoice>(null);

  const topClues = useMemo(
    () => infrastructureClues.filter(Boolean).slice(0, 5),
    [infrastructureClues]
  );

  return (
    <div className="space-y-3">
      <div className="px-1 flex justify-center">
        <h4 className="text-slate-600 text-xs font-mono uppercase tracking-[0.2em] font-bold text-center leading-none">
          {t('threat.scamAnalysis')}
        </h4>
      </div>

      <div className="bg-white/70 border border-neutral-100 rounded-3xl p-6 shadow-sm">
        <p className="text-[10px] font-mono font-bold uppercase tracking-widest text-neutral-400 mb-2 flex items-center gap-2">
          <Anchor size={12} className="text-blue-500" />
          {t('threat.theHook')}
        </p>
        <p className="text-sm font-bold text-slate-800 leading-snug">{hook}</p>
      </div>

      <div className="bg-white/70 border border-neutral-100 rounded-3xl p-6 shadow-sm">
        <p className="text-[10px] font-mono font-bold uppercase tracking-widest text-neutral-400 mb-2 flex items-center gap-2">
          <Zap size={12} className="text-amber-500" />
          {t('threat.modusOperandi')}
        </p>
        <p className="text-sm font-bold text-slate-800 leading-snug">{trap}</p>
      </div>

      <div className="bg-white/70 border border-neutral-100 rounded-3xl p-6 shadow-sm">
        <p className="text-[10px] font-mono font-bold uppercase tracking-widest text-neutral-400 mb-2 flex items-center gap-2">
          <ShieldAlert size={12} className="text-red-500" />
          {t('threat.riskSignals')}
        </p>
        <div className="space-y-2">
          {(topClues.length > 0 ? topClues : [t('threat.noSignals')]).map((clue, idx) => (
            <div key={`${clue}-${idx}`} className="flex items-start gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-red-500 mt-1.5 shrink-0" />
              <p className="text-sm font-bold text-slate-700 leading-snug">{clue}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-neutral-50/40 border border-neutral-100 rounded-3xl p-6">
        <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-neutral-400 mb-4 text-center">
          {t('feedback.wasCorrect')}
        </h4>
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => {
              setFeedbackChoice('correct');
              if (analysisId) submitFeedback(analysisId, 'correct');
            }}
            className={`py-4 rounded-2xl font-bold text-sm uppercase tracking-widest transition-all border flex items-center justify-center gap-2 ${
              feedbackChoice === 'correct'
                ? 'bg-emerald-600 text-white border-emerald-600 shadow-lg shadow-emerald-500/20'
                : 'bg-white/70 text-slate-700 border-neutral-200 hover:bg-emerald-600 hover:text-white hover:border-emerald-600'
            }`}
          >
            <Check size={14} />
            {t('feedback.yes')}
          </button>
          <button
            onClick={() => {
              setFeedbackChoice('incorrect');
              if (analysisId) submitFeedback(analysisId, 'incorrect');
            }}
            className={`py-4 rounded-2xl font-bold text-sm uppercase tracking-widest transition-all border flex items-center justify-center gap-2 ${
              feedbackChoice === 'incorrect'
                ? 'bg-red-600 text-white border-red-600 shadow-lg shadow-red-500/20'
                : 'bg-white/70 text-slate-700 border-neutral-200 hover:bg-red-600 hover:text-white hover:border-red-600'
            }`}
          >
            <Ban size={14} />
            {t('feedback.no')}
          </button>
        </div>
        {feedbackChoice && (
          <p className="mt-3 text-[11px] font-bold text-neutral-500 text-center">
            {t('feedback.recorded', { category: category.toLowerCase() })}
          </p>
        )}
      </div>
    </div>
  );
};

export default ThreatStoryAndFeedback;
