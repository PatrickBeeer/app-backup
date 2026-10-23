import React, { useState, useEffect, useRef } from 'react';
import { GenerationRequest, IssueType, ToneModifier, Language } from '../types';
import { Sparkles, ShieldCheck, ChevronDown, Mic, MicOff, Loader2 } from 'lucide-react';
import { useTranslation } from '../i18n';

interface ReviewInputProps {
  lang: Language;
  onSubmit: (data: Omit<GenerationRequest, 'language'>) => void;
  isLoading: boolean;
  initialValues?: GenerationRequest | null;
}

const ReviewInput: React.FC<ReviewInputProps> = ({ lang, onSubmit, isLoading, initialValues }) => {
  const t = useTranslation(lang);
  const [reviewText, setReviewText] = useState('');
  const [productInfo, setProductInfo] = useState('');
  const [issueType, setIssueType] = useState<IssueType>(IssueType.QUALITY);
  const [toneModifier, setToneModifier] = useState<ToneModifier>(ToneModifier.FRIENDLY);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    if (initialValues) {
      setReviewText(initialValues.reviewText);
      setProductInfo(initialValues.productInfo || '');
      setIssueType(initialValues.issueType);
      setToneModifier(initialValues.toneModifier || ToneModifier.FRIENDLY);
    }
  }, [initialValues]);

  useEffect(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = lang;

      recognition.onresult = (event: any) => {
        let finalTranscript = '';

        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
            finalTranscript += event.results[i][0].transcript;
          }
        }

        if (finalTranscript) {
          setReviewText(prev => prev + finalTranscript);
        }
      };

      recognition.onend = () => setIsListening(false);
      recognition.onerror = () => setIsListening(false);
      recognitionRef.current = recognition;
    }
  }, [lang]);

  const toggleListening = () => {
    if (!recognitionRef.current) {
      alert(lang === Language.ZH ? '浏览器不支持语音识别' : 'Browser does not support speech recognition');
      return;
    }
    if (isListening) {
      recognitionRef.current.stop();
    } else {
      setIsListening(true);
      recognitionRef.current.start();
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!reviewText.trim()) return;
    if (isListening) recognitionRef.current?.stop();
    onSubmit({ reviewText, productInfo, issueType, toneModifier });
  };

  return (
    <div className="bg-white rounded-[2.5rem] shadow-xl shadow-slate-200/40 border border-slate-100 overflow-hidden">
      <form onSubmit={handleSubmit} className="p-8 sm:p-10 space-y-8">
        <div className="space-y-3 relative">
          <div className="flex items-center justify-between px-1">
            <label className="text-xs font-bold text-slate-400 uppercase tracking-widest">
              {t.reviewContent}
            </label>
            <button
              type="button"
              onClick={toggleListening}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold transition-all duration-300 ${
                isListening ? 'bg-red-50 text-red-500 animate-pulse' : 'bg-slate-50 text-slate-400 hover:bg-slate-100'
              }`}
            >
              {isListening ? <><MicOff className="w-3 h-3" /><span>{t.listening}</span></> : <><Mic className="w-3 h-3" /><span>{t.voiceInput}</span></>}
            </button>
          </div>
          <div className="relative">
            <textarea
              value={reviewText}
              onChange={(e) => setReviewText(e.target.value)}
              placeholder={isListening ? t.placeholderListening : t.placeholderReview}
              required
              className={`w-full h-36 px-6 py-5 rounded-3xl border transition-all resize-none text-base leading-relaxed ${
                isListening ? 'border-red-100 bg-red-50/20 ring-4 ring-red-50/30' : 'border-slate-100 bg-slate-50/50 text-slate-900 placeholder-slate-300 focus:ring-4 focus:ring-brand-50 focus:border-brand-500'
              }`}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-5">
          <div className="space-y-2">
            <label className="text-[10px] font-bold text-slate-300 uppercase tracking-widest ml-1">{t.issueType}</label>
            <div className="relative group">
              <select
                value={issueType}
                onChange={(e) => setIssueType(e.target.value as IssueType)}
                className="w-full pl-4 pr-10 py-3 rounded-2xl border border-slate-100 bg-white text-slate-600 focus:ring-2 focus:ring-brand-500 transition-all text-sm appearance-none cursor-pointer"
              >
                <option value={IssueType.QUALITY}>{lang === Language.ZH ? '产品质量' : 'Product Quality'}</option>
                <option value={IssueType.LOGISTICS}>{lang === Language.ZH ? '物流配送' : 'Logistics/Shipping'}</option>
                <option value={IssueType.SERVICE}>{lang === Language.ZH ? '客服服务' : 'Customer Service'}</option>
                <option value={IssueType.MISUNDERSTANDING}>{lang === Language.ZH ? '买家误解' : 'User Misunderstanding'}</option>
                <option value={IssueType.OTHER}>{lang === Language.ZH ? '其他事宜' : 'Other'}</option>
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300 pointer-events-none" />
            </div>
          </div>
          <div className="space-y-2">
            <label className="text-[10px] font-bold text-slate-300 uppercase tracking-widest ml-1">{t.toneModifier}</label>
            <div className="relative group">
              <select
                value={toneModifier}
                onChange={(e) => setToneModifier(e.target.value as ToneModifier)}
                className="w-full pl-4 pr-10 py-3 rounded-2xl border border-slate-100 bg-white text-slate-600 focus:ring-2 focus:ring-brand-500 transition-all text-sm appearance-none cursor-pointer"
              >
                <option value={ToneModifier.FRIENDLY}>{lang === Language.ZH ? '亲切耐心' : 'Friendly'}</option>
                <option value={ToneModifier.MORE_EMPATHETIC}>{lang === Language.ZH ? '加强安抚' : 'Deeply Empathic'}</option>
                <option value={ToneModifier.MORE_FACTUAL}>{lang === Language.ZH ? '侧重澄清' : 'Rational'}</option>
                <option value={ToneModifier.COMPENSATION_FOCUSED}>{lang === Language.ZH ? '主动补偿' : 'Compensation'}</option>
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300 pointer-events-none" />
            </div>
          </div>
        </div>

        <div className="pt-2">
          {!showAdvanced ? (
            <button
              type="button"
              onClick={() => setShowAdvanced(true)}
              className="w-full py-4 border-2 border-dashed border-slate-50 rounded-2xl text-slate-300 text-xs hover:border-brand-100 hover:text-brand-400 transition-all flex items-center justify-center gap-2"
            >
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>{t.productHighlights}</span>
            </button>
          ) : (
            <div className="bg-slate-50/30 rounded-3xl p-6 space-y-4 border border-slate-100 animate-fade-in">
              <div className="flex items-center justify-between">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{t.productHighlightsLabel}</label>
                <button type="button" onClick={() => setShowAdvanced(false)} className="text-[10px] text-slate-300 hover:text-slate-500">
                  {lang === Language.ZH ? '隐藏' : 'Hide'}
                </button>
              </div>
              <textarea
                value={productInfo}
                onChange={(e) => setProductInfo(e.target.value)}
                placeholder={t.placeholderHighlights}
                className="w-full h-20 px-4 py-3 rounded-2xl border border-slate-100 bg-white text-slate-900 placeholder-slate-200 focus:ring-2 focus:ring-brand-500 transition-all text-sm resize-none"
              />
            </div>
          )}
        </div>

        <button
          type="submit"
          disabled={isLoading || !reviewText.trim()}
          className={`w-full flex items-center justify-center gap-3 py-5 px-6 rounded-[1.5rem] font-bold text-white shadow-xl transition-all active:scale-[0.98]
            ${isLoading ? 'bg-slate-200 cursor-not-allowed shadow-none' : 'bg-slate-900 hover:bg-black hover:shadow-slate-200'}`}
        >
          {isLoading ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : (
            <>
              <Sparkles className="w-4 h-4" />
              <span>{t.generateBtn}</span>
            </>
          )}
        </button>
      </form>
    </div>
  );
};

export default ReviewInput;
