import React from 'react';
import { AppProps } from '../../types';

const VirtualTryOnFallbackApp: React.FC<AppProps> = ({ platformService }) => {
  return (
    <div className="max-w-5xl mx-auto p-6">
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm p-8">
        <h1 className="text-2xl font-bold text-slate-900">虚拟试穿</h1>
        <p className="mt-3 text-slate-600 leading-7">
          该应用入口已可访问。当前正在进行页面稳定性修复，完整版试穿工作流将稍后恢复。
        </p>

        <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="rounded-xl bg-slate-50 p-4 border border-slate-200">
            <div className="text-sm text-slate-500">当前用户</div>
            <div className="mt-1 font-semibold text-slate-900">{platformService?.user?.username || '-'}</div>
          </div>
          <div className="rounded-xl bg-slate-50 p-4 border border-slate-200">
            <div className="text-sm text-slate-500">账户积分</div>
            <div className="mt-1 font-semibold text-slate-900">{platformService?.credits ?? 0}</div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default VirtualTryOnFallbackApp;
