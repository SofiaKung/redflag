
import React from 'react';
import { motion } from 'framer-motion';
import { useI18n } from '../i18n/I18nContext';

interface ApertureProps {
  isAnalyzing: boolean;
  score?: number;
}

const Aperture: React.FC<ApertureProps> = ({ isAnalyzing, score }) => {
  const { t } = useI18n();
  const radius = 90;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = score !== undefined ? circumference - (score / 100) * circumference : circumference;

  return (
    <div className="relative flex items-center justify-center w-72 h-72">
      {/* Background Decorative Rings */}
      <div className="absolute inset-0 border border-neutral-100 rounded-full opacity-50" />
      <div className="absolute inset-8 border border-neutral-50 rounded-full opacity-30" />

      {/* Radial Score Progress Ring */}
      <svg className="absolute inset-0 w-full h-full -rotate-90 overflow-visible">
        <circle
          cx="50%"
          cy="50%"
          r={radius}
          stroke="currentColor"
          strokeWidth="1"
          fill="transparent"
          className="text-neutral-100"
        />
        {score !== undefined && (
          <motion.circle
            cx="50%"
            cy="50%"
            r={radius}
            stroke="currentColor"
            strokeWidth="4"
            fill="transparent"
            strokeDasharray={circumference}
            initial={{ strokeDashoffset: circumference }}
            animate={{ strokeDashoffset }}
            transition={{ duration: 1.5, ease: "easeOut", delay: 0.2 }}
            className={score > 80 ? 'text-red-500' : score < 20 ? 'text-emerald-500' : 'text-amber-500'}
            strokeLinecap="round"
          />
        )}
      </svg>

      {/* Crosshair Markers */}
      <div className="absolute inset-0 flex items-center justify-center opacity-20">
        <div className="w-full h-[1px] bg-neutral-400 absolute" />
        <div className="h-full w-[1px] bg-neutral-400 absolute" />
      </div>

      {/* Outer Glow */}
      <motion.div
        animate={{
          scale: isAnalyzing ? [1, 1.05, 1] : 1,
          opacity: isAnalyzing ? [0.1, 0.3, 0.1] : 0.05,
        }}
        transition={{ duration: 2, repeat: Infinity }}
        className={`absolute inset-0 rounded-full blur-3xl ${
          score ? (score > 80 ? 'bg-red-500' : 'bg-emerald-500') : 'bg-blue-500'
        }`}
      />

      {/* Main Rotating Element */}
      <motion.div
        animate={{ rotate: isAnalyzing ? 360 : 0 }}
        transition={{ duration: isAnalyzing ? 1.5 : 20, repeat: Infinity, ease: isAnalyzing ? "linear" : "linear" }}
        className="absolute inset-4 rounded-full border border-neutral-200/50 flex items-center justify-center"
      >
        {/* Shutter Blades simulation */}
        <div className="absolute inset-0 opacity-5">
           <svg viewBox="0 0 100 100" className="w-full h-full">
            {[0, 45, 90, 135, 180, 225, 270, 315].map((angle) => (
              <path 
                key={angle}
                d="M50 50 L100 20 L100 80 Z" 
                transform={`rotate(${angle} 50 50)`} 
                fill="currentColor" 
                className="text-neutral-900"
              />
            ))}
           </svg>
        </div>
      </motion.div>

      {/* Core UI Content */}
      <div className="absolute inset-12 rounded-full border border-neutral-100 bg-white/60 backdrop-blur-md flex flex-col items-center justify-center z-10 shadow-inner">
        {score !== undefined ? (
          <motion.div 
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="text-center"
          >
            <div className="text-6xl font-black tracking-tighter tabular-nums text-slate-900 leading-none">
              {score}
            </div>
            <div className="text-[10px] font-mono tracking-[0.3em] font-bold text-neutral-400 mt-2 uppercase">
              {t('aperture.threatLevel')}
            </div>
          </motion.div>
        ) : (
          <div className="text-center px-6">
            <motion.div
              animate={isAnalyzing ? { opacity: [0.4, 1, 0.4] } : {}}
              transition={{ duration: 1, repeat: Infinity }}
              className={`text-[10px] font-mono tracking-[0.4em] font-bold ${
                isAnalyzing ? 'text-blue-600' : 'text-neutral-300'
              }`}
            >
              {isAnalyzing ? t('aperture.analyzing') : t('aperture.engineIdle')}
            </motion.div>
            {!isAnalyzing && (
               <div className="mt-2 flex justify-center gap-1">
                 <div className="w-1 h-1 bg-neutral-200 rounded-full" />
                 <div className="w-1 h-1 bg-neutral-200 rounded-full" />
                 <div className="w-1 h-1 bg-neutral-200 rounded-full" />
               </div>
            )}
          </div>
        )}
      </div>

      {/* Floating Data Readouts (Only while idle or scanning) */}
      {!score && (
        <motion.div 
          animate={{ opacity: [0.2, 0.5, 0.2] }}
          transition={{ duration: 3, repeat: Infinity }}
          className="absolute -top-4 -right-4 bg-white/80 border border-neutral-100 p-2 rounded-lg backdrop-blur-md shadow-sm"
        >
          <div className="text-[8px] font-mono text-neutral-400 leading-none mb-1">BITRATE: 4.2GB/S</div>
          <div className="text-[8px] font-mono text-blue-600 leading-none">SECURE_LINK: ACTIVE</div>
        </motion.div>
      )}
    </div>
  );
};

export default Aperture;
