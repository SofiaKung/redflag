import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, X } from 'lucide-react';
import { useI18n } from '../i18n/I18nContext';
import { SUPPORTED_LOCALES, LocaleCode } from '../i18n/locales';

interface LanguagePickerProps {
  isOpen: boolean;
  onClose: () => void;
}

const LanguagePicker: React.FC<LanguagePickerProps> = ({ isOpen, onClose }) => {
  const { locale, setLocale, t } = useI18n();

  const handleSelect = (code: LocaleCode) => {
    setLocale(code);
    onClose();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-[80] bg-black/40 backdrop-blur-sm flex items-end justify-center"
          onClick={onClose}
        >
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 28, stiffness: 300 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md bg-white rounded-t-[2.5rem] shadow-2xl overflow-hidden"
          >
            {/* Handle bar */}
            <div className="flex justify-center pt-3 pb-1">
              <div className="w-10 h-1 bg-neutral-200 rounded-full" />
            </div>

            {/* Header */}
            <div className="flex items-center justify-between px-8 py-4">
              <h3 className="text-lg font-black text-slate-900 uppercase tracking-tight">
                {t('lang.picker.title')}
              </h3>
              <button
                onClick={onClose}
                className="p-2 hover:bg-neutral-50 rounded-full transition-colors text-neutral-400"
              >
                <X size={18} />
              </button>
            </div>

            {/* Language list */}
            <div className="px-4 pb-10">
              {SUPPORTED_LOCALES.map(({ code, nativeName }) => {
                const isSelected = code === locale;
                return (
                  <button
                    key={code}
                    onClick={() => handleSelect(code)}
                    className={`w-full flex items-center justify-between px-5 py-4 rounded-2xl transition-all mb-1 ${
                      isSelected
                        ? 'bg-blue-50 border border-blue-200'
                        : 'hover:bg-neutral-50 border border-transparent'
                    }`}
                  >
                    <span className={`text-[15px] font-bold ${
                      isSelected ? 'text-blue-600' : 'text-slate-700'
                    }`}>
                      {nativeName}
                    </span>
                    {isSelected && (
                      <motion.div
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        className="w-6 h-6 rounded-full bg-blue-600 flex items-center justify-center"
                      >
                        <Check size={14} className="text-white" strokeWidth={3} />
                      </motion.div>
                    )}
                  </button>
                );
              })}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default LanguagePicker;
