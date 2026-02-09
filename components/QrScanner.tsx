
import React, { useState, useEffect, useRef } from 'react';
import { Scanner } from '@yudiel/react-qr-scanner';
import { X, Camera, CameraOff, ShieldAlert, Search } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useI18n } from '../i18n/I18nContext';

interface QrScannerProps {
  onScan: (url: string) => void;
  onClose: () => void;
}

type ScannerStatus = 'START' | 'ACTIVE' | 'DENIED' | 'ERROR';

const QrScanner: React.FC<QrScannerProps> = ({ onScan, onClose }) => {
  const { t } = useI18n();
  const [status, setStatus] = useState<ScannerStatus>('START');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [searchTimer, setSearchTimer] = useState(0);
  const hasScanned = useRef(false);

  // Search ticker effect
  useEffect(() => {
    let interval: any;
    if (status === 'ACTIVE') {
      interval = setInterval(() => {
        setSearchTimer(prev => prev + 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [status]);

  const startScanner = () => {
    setErrorMessage(null);
    setStatus('ACTIVE');
  };

  const handleError = (err: any) => {
    console.error("Scanner Error:", err);
    // OverconstrainedError or NotFoundError usually means facingMode: 'environment' failed
    if (err?.name === 'NotAllowedError' || err?.name === 'PermissionDeniedError') {
      setStatus('DENIED');
      setErrorMessage(t('qr.deniedMsg'));
    } else if (err?.name === 'NotFoundError' || err?.name === 'DevicesNotFoundError' || err?.message?.includes('device not found')) {
      setStatus('ERROR');
      setErrorMessage(t('qr.notFoundMsg'));
    } else {
      setStatus('ERROR');
      setErrorMessage(err?.message || t('qr.unexpectedError'));
    }
  };

  return (
    <div className="fixed inset-0 z-[100] bg-black flex flex-col font-sans overflow-hidden">
      {/* HUD Header */}
      <div className="absolute top-0 w-full p-8 flex justify-between items-center z-[110]">
        <div className="flex items-center gap-3">
          <div className={`w-2.5 h-2.5 rounded-full shadow-[0_0_10px_red] ${status === 'ACTIVE' ? 'bg-red-600 animate-pulse' : 'bg-neutral-600'}`} />
          <div className="flex flex-col">
            <span className="text-white font-mono text-[10px] tracking-[0.3em] font-black uppercase">
              {status === 'ACTIVE' ? t('qr.sensorLive') : t('qr.sensorIdle')}
            </span>
            {status === 'ACTIVE' && (
              <span className="text-red-500 font-mono text-[8px] tracking-[0.2em] font-bold uppercase animate-pulse">
                {t('qr.uptime', { seconds: searchTimer })}
              </span>
            )}
          </div>
        </div>
        <button
          onClick={onClose}
          className="p-3 bg-white/10 backdrop-blur-xl rounded-full text-white hover:bg-white/20 border border-white/20 transition-all active:scale-90"
        >
          <X className="w-6 h-6" />
        </button>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 relative flex items-center justify-center">
        <AnimatePresence mode="wait">
          {status === 'START' && (
            <motion.div
              key="start"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 1.1 }}
              className="flex flex-col items-center text-center p-10 z-10 max-w-xs"
            >
              <div className="w-24 h-24 bg-blue-600/10 rounded-full flex items-center justify-center mb-8 border border-blue-500/20 relative">
                <Camera className="text-blue-500 w-10 h-10" />
                <motion.div
                  animate={{ scale: [1, 1.2, 1], opacity: [0.3, 0.6, 0.3] }}
                  transition={{ duration: 2, repeat: Infinity }}
                  className="absolute inset-0 bg-blue-500/20 rounded-full"
                />
              </div>
              <h3 className="text-white font-black text-2xl mb-3 uppercase tracking-tight">{t('qr.cameraRequired')}</h3>
              <p className="text-white/50 text-sm mb-10 leading-relaxed font-medium">
                {t('qr.cameraDesc')}
              </p>
              <button
                onClick={startScanner}
                className="w-full py-5 bg-white text-black rounded-3xl font-black text-sm uppercase tracking-widest active:scale-95 transition-all shadow-2xl shadow-white/5"
              >
                {t('qr.initSensor')}
              </button>
            </motion.div>
          )}

          {status === 'DENIED' || status === 'ERROR' ? (
            <motion.div
              key="error"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="flex flex-col items-center text-center p-10 z-10 max-w-xs"
            >
              <div className="w-20 h-20 bg-red-500/10 rounded-full flex items-center justify-center mb-6 border border-red-500/20">
                {status === 'DENIED' ? <CameraOff className="text-red-500 w-8 h-8" /> : <ShieldAlert className="text-red-500 w-8 h-8" />}
              </div>
              <h3 className="text-white font-black text-xl mb-3 uppercase tracking-tight">
                {status === 'DENIED' ? t('qr.accessBlocked') : t('qr.deviceError')}
              </h3>
              <p className="text-white/40 text-sm mb-10 leading-relaxed font-medium">
                {errorMessage}
              </p>
              <div className="flex flex-col gap-3 w-full">
                <button
                  onClick={startScanner}
                  className="w-full py-4 bg-red-600 text-white rounded-2xl font-black text-xs uppercase tracking-widest active:scale-95 transition-all"
                >
                  {t('qr.retryConnection')}
                </button>
                <button
                  onClick={onClose}
                  className="w-full py-4 bg-white/5 text-white/40 border border-white/10 rounded-2xl font-black text-xs uppercase tracking-widest active:scale-95"
                >
                  {t('qr.returnHome')}
                </button>
              </div>
            </motion.div>
          ) : status === 'ACTIVE' && (
            <motion.div
              key="active"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="w-full h-full relative"
            >
              <Scanner
                onScan={(result) => {
                  if (result && result.length > 0 && !hasScanned.current) {
                    hasScanned.current = true;
                    onScan(result[0].rawValue);
                  }
                }}
                onError={handleError}
                paused={hasScanned.current}
                // Using 'ideal' instead of a hard string to prevent OverconstrainedError on desktops
                constraints={{
                  facingMode: { ideal: 'environment' }
                }}
                components={{ finder: false }}
                styles={{
                  container: { height: '100%', width: '100%' },
                  video: { objectFit: 'cover', opacity: 1 }
                }}
              />

              {/* Tactical Overlay */}
              <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center p-6">
                <div className="absolute top-32 flex flex-col items-center">
                  <div className="px-4 py-1.5 bg-red-600/20 border border-red-600/30 rounded-full flex items-center gap-3 mb-2">
                     <Search size={12} className="text-red-500 animate-pulse" />
                     <span className="text-[10px] font-mono font-bold text-red-500 uppercase tracking-widest">{t('qr.scanningTarget')}</span>
                  </div>
                </div>

                <div className="w-full max-w-sm aspect-square relative flex items-center justify-center">
                  {/* The Target Box */}
                  <div className="w-64 h-64 border border-white/5 rounded-[2.5rem] relative">
                    <div className="absolute -top-1 -left-1 w-12 h-12 border-t-4 border-l-4 border-red-600 rounded-tl-3xl" />
                    <div className="absolute -top-1 -right-1 w-12 h-12 border-t-4 border-r-4 border-red-600 rounded-tr-3xl" />
                    <div className="absolute -bottom-1 -left-1 w-12 h-12 border-b-4 border-l-4 border-red-600 rounded-bl-3xl" />
                    <div className="absolute -bottom-1 -right-1 w-12 h-12 border-b-4 border-r-4 border-red-600 rounded-br-3xl" />

                    {/* Laser Animation */}
                    <motion.div
                      animate={{ top: ['10%', '90%', '10%'] }}
                      transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                      className="absolute left-4 right-4 h-0.5 bg-red-500 shadow-[0_0_20px_rgba(239,68,68,1)] z-10"
                    />

                    <div className="absolute -bottom-16 left-0 right-0 text-center space-y-3">
                      <div className="flex justify-center gap-1.5">
                        <motion.div animate={{ opacity: [0.2, 1, 0.2] }} transition={{ duration: 0.8, repeat: Infinity, delay: 0 }} className="w-1.5 h-1.5 bg-red-500 rounded-full" />
                        <motion.div animate={{ opacity: [0.2, 1, 0.2] }} transition={{ duration: 0.8, repeat: Infinity, delay: 0.2 }} className="w-1.5 h-1.5 bg-red-500 rounded-full" />
                        <motion.div animate={{ opacity: [0.2, 1, 0.2] }} transition={{ duration: 0.8, repeat: Infinity, delay: 0.4 }} className="w-1.5 h-1.5 bg-red-500 rounded-full" />
                      </div>
                      <span className="text-[10px] font-mono text-white/40 tracking-[0.4em] uppercase font-bold block">
                        {t('qr.seekingPacket')}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* HUD Footer */}
      <div className="p-12 text-center bg-gradient-to-t from-black to-transparent z-20">
        <div className="max-w-xs mx-auto">
          <p className="text-white/60 text-[11px] leading-relaxed font-medium">
            {t('qr.alignTarget')}
            {' '}
            <br/><span className="text-red-500 font-bold uppercase">RedFlag</span> {t('qr.autoCapture', { brand: '' }).trim()}
          </p>
        </div>
      </div>
    </div>
  );
};

export default QrScanner;
