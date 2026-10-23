import React from 'react';
import { MessageSquareHeart, Globe } from 'lucide-react';
import { Language } from '../types';
import { translations } from '../i18n';

interface HeaderProps {
  currentLang: Language;
  onLangChange: (lang: Language) => void;
}

const Header: React.FC<HeaderProps> = ({ currentLang, onLangChange }) => {
  return (
    <header className="bg-white border-b border-gray-100 sticky top-0 z-10">
      <div className="max-w-4xl mx-auto px-4 py-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-brand-50 p-2 rounded-lg">
              <MessageSquareHeart className="w-6 h-6 text-brand-600" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900 tracking-tight">
                {translations[currentLang].appName}
              </h1>
              <p className="text-[10px] text-gray-500 font-bold uppercase tracking-tighter">
                Review Turnover Coach
              </p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="relative group">
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-full border border-slate-100 bg-slate-50 text-slate-600 text-xs font-bold cursor-pointer hover:bg-slate-100 transition-colors">
                <Globe className="w-3.5 h-3.5" />
                <span>{translations[currentLang].langName}</span>
              </div>
              <div className="absolute right-0 mt-2 w-32 bg-white border border-slate-100 rounded-2xl shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-20 overflow-hidden">
                {(Object.keys(translations) as Language[]).map((lang) => (
                  <button
                    key={lang}
                    onClick={() => onLangChange(lang)}
                    className={`w-full text-left px-4 py-2.5 text-xs font-bold transition-colors ${
                      currentLang === lang
                        ? 'bg-brand-50 text-brand-600'
                        : 'text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    {translations[lang].langName}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
};

export default Header;
