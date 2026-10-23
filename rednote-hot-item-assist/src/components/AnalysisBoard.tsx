/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { CheckCircle2, Sparkles, Tag, Package, Camera, Store } from 'lucide-react';
import { motion } from 'motion/react';
import { ProductAnalysis } from '../types';

interface AnalysisBoardProps {
  analysis: ProductAnalysis;
}

export default function AnalysisBoard({ analysis }: AnalysisBoardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass-card p-6 border-white/80"
    >
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 bg-red-50 text-brand-red rounded-xl flex items-center justify-center">
          <Sparkles size={20} />
        </div>
        <div>
          <h2 className="text-base font-bold text-gray-800">产品基因解析 & 爆款洞察</h2>
        </div>
      </div>

      <div className="space-y-6">
        <section className="space-y-4">
          <div className="flex items-start gap-3">
            <div className="p-2 bg-blue-50 text-blue-600 rounded-lg shrink-0">
              <Package size={16} />
            </div>
            <div>
              <p className="text-sm text-gray-700 font-bold">{analysis.name}</p>
              <p className="text-xs text-gray-500 mt-0.5">
                {analysis.category}
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <div className="p-2 bg-purple-50 text-purple-600 rounded-lg shrink-0">
              <Tag size={16} />
            </div>
            <div className="flex-1">
              <div className="flex flex-wrap gap-1.5">
                {analysis.features.map((feature, i) => (
                  <span
                    key={i}
                    className="px-2 py-1 bg-white/60 border border-white rounded-lg text-[10px] text-gray-600 font-bold"
                  >
                    {feature}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="space-y-3">
          <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest px-1">核心卖点辨识</h3>
          <div className="space-y-2">
            {analysis.sellingPoints.map((point, i) => (
              <motion.div
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.1 }}
                key={i}
                className="flex items-center gap-2 p-2.5 bg-white/40 rounded-xl border border-white/60"
              >
                <div className="w-1.5 h-1.5 bg-brand-red rounded-full shadow-[0_0_8px_rgba(255,36,66,0.5)]" />
                <p className="text-xs text-gray-700 font-medium">{point}</p>
              </motion.div>
            ))}
          </div>
        </section>

        {analysis.xiaohongshuTrends && (
          <section className="space-y-3">
            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest px-1">小红书摄影趋势洞察</h3>
            <div className="space-y-3">
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="p-3 bg-red-50/50 rounded-xl border border-red-100"
              >
                <div className="flex items-center gap-2 mb-1">
                  <Camera size={14} className="text-brand-red" />
                  <span className="text-xs font-bold text-gray-800">达人种草图风格</span>
                </div>
                <p className="text-xs text-gray-600 leading-relaxed pl-5 tracking-wide">
                  {analysis.xiaohongshuTrends.influencerStyle}
                </p>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
                className="p-3 bg-orange-50/50 rounded-xl border border-orange-100"
              >
                <div className="flex items-center gap-2 mb-1">
                  <Store size={14} className="text-orange-500" />
                  <span className="text-xs font-bold text-gray-800">卖货博主带货图风格</span>
                </div>
                <p className="text-xs text-gray-600 leading-relaxed pl-5 tracking-wide">
                  {analysis.xiaohongshuTrends.sellerStyle}
                </p>
              </motion.div>
            </div>
          </section>
        )}
      </div>

      <div className="mt-6 pt-4 border-t border-white/40">
        <p className="text-[11px] text-gray-500 leading-relaxed">
          AI 诊断：已深度剖析“{analysis.category}”在小红书的爆款视觉趋势。
        </p>
      </div>
    </motion.div>
  );
}
