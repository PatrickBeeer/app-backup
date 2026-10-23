import React, { useState, useEffect } from 'react';
import { AppProps } from '../../types';
import Header from './components/Header';
import ReviewInput from './components/ReviewInput';
import ResponseDisplay from './components/ResponseDisplay';
import HistoryList from './components/HistoryList';
import { generateReviewResponse } from './services/geminiService';
import { GenerationRequest, GenerationResponse, HistoryItem, Language } from './types';
import { useTranslation } from './i18n';

const APP_ID = 'review-turnover-coach';
const STORAGE_KEY = 'review-turnover-history';
const LANG_STORAGE_KEY = 'review-turnover-lang';

export const ReviewTurnoverCoachApp: React.FC<AppProps> = ({ platform, costs }) => {
  const [lang, setLang] = useState<Language>(() => {
    const stored = localStorage.getItem(LANG_STORAGE_KEY);
    return (stored as Language) || Language.ZH;
  });
  const t = useTranslation(lang);

  const [isLoading, setIsLoading] = useState(false);
  const [response, setResponse] = useState<GenerationResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [currentRequest, setCurrentRequest] = useState<GenerationRequest | null>(null);

  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [selectedRequest, setSelectedRequest] = useState<GenerationRequest | null>(null);

  const cost = costs?.GENERATE_RESPONSE ?? 10;

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        setHistory(JSON.parse(stored));
      }
    } catch (e) {
      console.error("Failed to load history", e);
    }
  }, []);

  const saveHistory = (newHistory: HistoryItem[]) => {
    setHistory(newHistory);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(newHistory));
  };

  const handleLanguageChange = (newLang: Language) => {
    setLang(newLang);
    localStorage.setItem(LANG_STORAGE_KEY, newLang);
  };

  const handleGeneration = async (requestData: Omit<GenerationRequest, 'language'>) => {
    await platform.refreshCredits();

    if (!platform.checkBalance(cost)) {
      return;
    }

    const request: GenerationRequest = { ...requestData, language: lang };
    setIsLoading(true);
    setError(null);
    setCurrentRequest(request);

    try {
      const result = await generateReviewResponse(request);
      setResponse(result);
      await platform.refreshCredits?.();

      const newItem: HistoryItem = {
        id: Date.now().toString(),
        timestamp: Date.now(),
        request: request,
        response: result
      };

      const updatedHistory = [newItem, ...history];
      saveHistory(updatedHistory);

      setTimeout(() => {
        const resultEl = document.getElementById('result-section');
        if (resultEl) {
          resultEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }, 100);

    } catch (err: any) {
      setError(err.message || (lang === Language.ZH ? '生成回复时出现未知错误' : 'An unknown error occurred during generation'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleRegenerate = () => {
    if (currentRequest) {
      const { language: _language, ...requestData } = currentRequest;
      void handleGeneration(requestData);
    }
  };

  const handleSelectHistory = (item: HistoryItem) => {
    setResponse(item.response);
    setSelectedRequest(item.request);
    setCurrentRequest(item.request);
    setError(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDeleteHistory = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const updatedHistory = history.filter(item => item.id !== id);
    saveHistory(updatedHistory);
  };

  const handleClearHistory = () => {
    if (confirm(lang === Language.ZH ? '确定要清空所有历史记录吗？' : 'Are you sure you want to clear all history?')) {
      saveHistory([]);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900 pb-20">
      <Header currentLang={lang} onLangChange={handleLanguageChange} />

      <main className="max-w-2xl mx-auto px-4 py-12">
        <div className="text-center mb-10">
          <h2 className="text-4xl font-black text-slate-900 tracking-tight mb-3">
            {t.appName}
          </h2>
          <p className="text-slate-400 text-base font-medium">
            {t.tagline}
          </p>
        </div>

        <div className="space-y-10">
          <section className="space-y-8">
            <ReviewInput
              lang={lang}
              onSubmit={handleGeneration}
              isLoading={isLoading}
              initialValues={selectedRequest}
            />

            <div id="result-section">
              <ResponseDisplay
                lang={lang}
                response={response}
                error={error}
                onRegenerate={handleRegenerate}
                isLoading={isLoading}
              />
            </div>
          </section>

          <section className="pt-6">
            {history.length > 0 ? (
              <div className="border-t border-slate-200 pt-8">
                <HistoryList
                  lang={lang}
                  history={history}
                  onSelect={handleSelectHistory}
                  onDelete={handleDeleteHistory}
                  onClear={handleClearHistory}
                />
              </div>
            ) : (
              <div className="bg-white rounded-3xl p-8 border border-slate-100 text-center shadow-sm">
                <div className="max-w-xs mx-auto space-y-2">
                  <p className="text-slate-400 text-sm">
                    {t.noHistory}
                  </p>
                </div>
              </div>
            )}
          </section>
        </div>

        {cost > 0 && (
          <div className="mt-6 text-center text-sm text-slate-600">
            {lang === Language.ZH ? `生成成功后将扣费 ${cost} 积分` : `${cost} credits will be deducted after successful generation`}
          </div>
        )}
      </main>

      <footer className="text-center text-slate-300 text-[10px] py-10 uppercase tracking-widest">
        &copy; {new Date().getFullYear()} {t.appName}
      </footer>
    </div>
  );
};
