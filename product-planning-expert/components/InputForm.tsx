import React from 'react';
import { ProductFormData } from '../types';

interface InputFormProps {
  data: ProductFormData;
  onChange: (field: keyof ProductFormData, value: string) => void;
  onSubmit: () => void;
    cost?: number;
}

export const InputForm: React.FC<InputFormProps> = ({ data, onChange, onSubmit, cost }) => {
  return (
    <div className="bg-white/70 backdrop-blur-xl shadow-xl shadow-blue-100/50 rounded-[2.5rem] border border-white/60 overflow-hidden relative">
      {/* Decorative top shape */}
      <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-blue-400 via-purple-400 to-pink-400"></div>

      <div className="px-8 py-8 md:p-10 space-y-10">
        {/* Section 1: Blue Theme */}
        <section>
            <div className="flex items-center gap-4 mb-6">
                <div className="w-10 h-10 rounded-2xl bg-blue-100 text-blue-600 flex items-center justify-center font-black text-lg shadow-sm">1</div>
                <h4 className="text-lg font-bold text-gray-800">基础信息</h4>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pl-2 md:pl-14">
                <div className="group">
                    <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2 ml-1">平台 & 场景</label>
                    <input
                        type="text"
                        value={data.platform}
                        onChange={(e) => onChange('platform', e.target.value)}
                        placeholder="例如：淘宝首页、抖音直播间"
                        className="block w-full text-sm bg-gray-50 border-none rounded-2xl shadow-inner focus:ring-2 focus:ring-blue-400 focus:bg-white transition-all py-3.5 px-5 placeholder:text-gray-300 font-medium text-gray-700"
                    />
                </div>
                <div className="group">
                    <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2 ml-1">产品品类 / 型号</label>
                    <input
                        type="text"
                        value={data.category}
                        onChange={(e) => onChange('category', e.target.value)}
                        placeholder="例如：电动牙刷 Pro"
                        className="block w-full text-sm bg-gray-50 border-none rounded-2xl shadow-inner focus:ring-2 focus:ring-blue-400 focus:bg-white transition-all py-3.5 px-5 placeholder:text-gray-300 font-medium text-gray-700"
                    />
                </div>
            </div>
        </section>

        {/* Section 2: Purple Theme */}
        <section>
             <div className="flex items-center gap-4 mb-6">
                <div className="w-10 h-10 rounded-2xl bg-purple-100 text-purple-600 flex items-center justify-center font-black text-lg shadow-sm">2</div>
                <h4 className="text-lg font-bold text-gray-800">市场定位</h4>
            </div>
            <div className="grid grid-cols-1 gap-6 pl-2 md:pl-14">
                <div className="group">
                    <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2 ml-1">目标人群画像</label>
                    <textarea
                        value={data.targetAudience}
                        onChange={(e) => onChange('targetAudience', e.target.value)}
                        placeholder="描述您的核心用户画像，例如：25-35岁精致白领，注重生活品质..."
                        rows={3}
                        className="block w-full text-sm bg-gray-50 border-none rounded-2xl shadow-inner focus:ring-2 focus:ring-purple-400 focus:bg-white transition-all py-3.5 px-5 placeholder:text-gray-300 font-medium text-gray-700 resize-none"
                    />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="group">
                        <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2 ml-1">定价与定位</label>
                        <input
                            type="text"
                            value={data.priceRange}
                            onChange={(e) => onChange('priceRange', e.target.value)}
                            placeholder="例如：¥299，中高端"
                            className="block w-full text-sm bg-gray-50 border-none rounded-2xl shadow-inner focus:ring-2 focus:ring-purple-400 focus:bg-white transition-all py-3.5 px-5 placeholder:text-gray-300 font-medium text-gray-700"
                        />
                    </div>
                    <div className="group">
                         <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2 ml-1">竞品参考 (选填)</label>
                         <input
                            type="text"
                            value={data.competitors}
                            onChange={(e) => onChange('competitors', e.target.value)}
                            placeholder="对标品牌..."
                            className="block w-full text-sm bg-gray-50 border-none rounded-2xl shadow-inner focus:ring-2 focus:ring-purple-400 focus:bg-white transition-all py-3.5 px-5 placeholder:text-gray-300 font-medium text-gray-700"
                        />
                    </div>
                </div>
            </div>
        </section>

        {/* Section 3: Pink Theme */}
        <section>
             <div className="flex items-center gap-4 mb-6">
                <div className="w-10 h-10 rounded-2xl bg-pink-100 text-pink-600 flex items-center justify-center font-black text-lg shadow-sm">3</div>
                <h4 className="text-lg font-bold text-gray-800">核心策略</h4>
            </div>
            <div className="grid grid-cols-1 gap-6 pl-2 md:pl-14">
                <div className="group">
                     <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2 ml-1">核心优势 / 差异化</label>
                     <textarea
                        value={data.advantages}
                        onChange={(e) => onChange('advantages', e.target.value)}
                        placeholder="相比竞品，您的产品最大的优势是什么？"
                        rows={3}
                        className="block w-full text-sm bg-gray-50 border-none rounded-2xl shadow-inner focus:ring-2 focus:ring-pink-400 focus:bg-white transition-all py-3.5 px-5 placeholder:text-gray-300 font-medium text-gray-700 resize-none"
                     />
                </div>
                <div className="group">
                     <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2 ml-1">品牌调性 / 风格</label>
                     <input
                        type="text"
                        value={data.brandStyle}
                        onChange={(e) => onChange('brandStyle', e.target.value)}
                        placeholder="例如：简约科技感、温馨日系..."
                        className="block w-full text-sm bg-gray-50 border-none rounded-2xl shadow-inner focus:ring-2 focus:ring-pink-400 focus:bg-white transition-all py-3.5 px-5 placeholder:text-gray-300 font-medium text-gray-700"
                    />
                </div>
            </div>
        </section>
      </div>

      <div className="px-10 py-8 bg-gray-50/50 backdrop-blur-sm border-t border-gray-100 flex justify-end">
        <button
            onClick={onSubmit}
            className="w-full md:w-auto inline-flex justify-center items-center py-4 px-10 border border-transparent shadow-xl shadow-blue-500/20 text-base font-bold rounded-2xl text-white bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-500 hover:scale-[1.02] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-all duration-300"
        >
            <svg className="w-5 h-5 mr-2 -ml-1 text-blue-100 animate-pulse" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.384-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
            </svg>
                        生成 AI 策划方案{typeof cost === 'number' ? ` (${cost} 积分)` : ''}
        </button>
      </div>
    </div>
  );
};
