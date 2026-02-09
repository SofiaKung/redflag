
import React, { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ShieldAlert, Globe, Loader2, Upload, Trash2, Plus } from 'lucide-react';

interface EvidenceModalProps {
  onConfirm: (imagesBase64: string[]) => void;
  onClose: () => void;
  isLoading: boolean;
  maxFiles?: number;
  title: string;
  description: string;
  icon: React.ReactNode;
}

const EvidenceModal: React.FC<EvidenceModalProps> = ({ 
  onConfirm, 
  onClose, 
  isLoading, 
  maxFiles = 1, 
  title, 
  description, 
  icon 
}) => {
  const [images, setImages] = useState<{ id: string, url: string, base64: string }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files: File[] = e.target.files ? Array.from(e.target.files) : [];
    if (files.length === 0) return;

    const remainingSlots = maxFiles - images.length;
    const filesToProcess = files.slice(0, remainingSlots);

    if (files.length > remainingSlots) {
      setError(`Maximum ${maxFiles} images allowed.`);
    }

    filesToProcess.forEach(file => {
      if (!file.type.startsWith('image/')) {
        setError("Only image files are accepted.");
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => {
        const result = reader.result as string;
        const base64 = result.split(',')[1];
        setImages(prev => [...prev, { 
          id: Math.random().toString(36).substr(2, 9), 
          url: result, 
          base64 
        }]);
        setError(null);
      };
      reader.readAsDataURL(file);
    });

    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removeImage = (id: string) => {
    setImages(prev => prev.filter(img => img.id !== id));
  };

  const handleAnalyze = () => {
    if (images.length === 0) {
      setError("Please provide at least one screenshot for forensic inspection.");
      return;
    }
    setError(null);
    onConfirm(images.map(img => img.base64));
  };

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-slate-900/60 backdrop-blur-md"
    >
      <motion.div 
        initial={{ scale: 0.9, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.9, opacity: 0, y: 20 }}
        className="w-full max-w-md bg-white rounded-[2.5rem] shadow-2xl border border-neutral-100 overflow-hidden flex flex-col max-h-[90vh]"
      >
        <div className="p-8 overflow-y-auto custom-scrollbar">
          <div className="flex justify-between items-start mb-6">
            <div className="w-12 h-12 bg-blue-50 rounded-2xl flex items-center justify-center text-blue-600">
              {icon}
            </div>
            <button 
              onClick={onClose}
              disabled={isLoading}
              className="p-2 hover:bg-neutral-50 rounded-full transition-colors text-neutral-400"
            >
              <X size={20} />
            </button>
          </div>

          <div className="space-y-2 mb-8">
            <h3 className="text-xl font-black text-slate-900 tracking-tight uppercase">{title}</h3>
            <p className="text-sm text-slate-500 font-medium leading-relaxed">
              {description}
            </p>
          </div>

          <div className="space-y-4">
            {images.length === 0 ? (
              <div 
                onClick={() => !isLoading && fileInputRef.current?.click()}
                className={`relative h-48 rounded-3xl border-2 border-dashed flex flex-col items-center justify-center cursor-pointer transition-all ${
                  error ? 'border-red-300 bg-red-50/10' : 'border-neutral-200 hover:border-blue-400 hover:bg-neutral-50'
                }`}
              >
                <Upload className="text-neutral-300 mb-2" size={32} />
                <span className="text-xs font-bold text-neutral-400 uppercase tracking-widest">Select Screenshot</span>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                {images.map((img) => (
                  <div key={img.id} className="relative aspect-video rounded-2xl overflow-hidden border border-neutral-100 group">
                    <img src={img.url} alt="Evidence" className="w-full h-full object-cover grayscale opacity-60 group-hover:grayscale-0 group-hover:opacity-100 transition-all" />
                    <button 
                      onClick={() => removeImage(img.id)}
                      className="absolute top-2 right-2 p-1.5 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                ))}
                {images.length < maxFiles && (
                  <button 
                    onClick={() => fileInputRef.current?.click()}
                    className="aspect-video rounded-2xl border-2 border-dashed border-neutral-100 flex flex-col items-center justify-center text-neutral-300 hover:border-blue-300 hover:text-blue-500 transition-all"
                  >
                    <Plus size={20} />
                    <span className="text-[10px] font-black uppercase mt-1">Add More</span>
                  </button>
                )}
              </div>
            )}

            <input 
              type="file" 
              ref={fileInputRef} 
              onChange={handleFileChange} 
              accept="image/*" 
              multiple={maxFiles > 1}
              className="hidden" 
            />

            <div className="flex justify-between items-center px-1">
               <div className="text-[10px] font-mono text-neutral-400 uppercase font-bold tracking-widest">
                 {images.length} / {maxFiles} Evidence Capsules
               </div>
               <AnimatePresence>
                {error && (
                  <motion.p 
                    initial={{ opacity: 0, x: 10 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="text-[10px] text-red-500 font-bold flex items-center gap-1"
                  >
                    <ShieldAlert size={10} /> {error}
                  </motion.p>
                )}
              </AnimatePresence>
            </div>

            <div className="flex gap-3 pt-2">
              <button 
                onClick={onClose}
                disabled={isLoading}
                className="flex-1 py-4 text-sm font-bold text-slate-400 uppercase tracking-widest hover:text-slate-900 transition-colors"
              >
                Cancel
              </button>
              <button 
                onClick={handleAnalyze}
                disabled={isLoading}
                className="flex-[2] py-4 bg-blue-600 text-white rounded-2xl font-bold text-sm uppercase tracking-widest shadow-lg shadow-blue-500/20 active:scale-[0.98] transition-all flex items-center justify-center gap-2"
              >
                {isLoading ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    <span>Analyzing...</span>
                  </>
                ) : (
                  <span>Run Analysis</span>
                )}
              </button>
            </div>
          </div>
        </div>

        <div className="bg-slate-50 px-8 py-4 flex items-center justify-center gap-2 shrink-0">
          <Globe size={12} className="text-slate-400" />
          <span className="text-[10px] font-mono text-slate-400 uppercase font-bold tracking-widest">Submissions are logged to help detect and prevent scams.</span>
        </div>
      </motion.div>
    </motion.div>
  );
};

export default EvidenceModal;
