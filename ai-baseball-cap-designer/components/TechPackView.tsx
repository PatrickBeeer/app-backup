
import React, { useState } from 'react';
import type { GeneratedDesign, Material } from '../types';
import { DownloadIcon } from './icons/DownloadIcon';
import { ZoomInIcon } from './icons/ZoomInIcon';
import { CloseIcon } from './icons/CloseIcon';
import { ArchiveIcon } from './icons/ArchiveIcon';

interface TechPackViewProps {
  selectedDesign: GeneratedDesign;
  techPackImage: string;
  materialsList: Material[] | null;
  onReset: () => void;
}

export const TechPackView: React.FC<TechPackViewProps> = ({ selectedDesign, techPackImage, materialsList, onReset }) => {
  const [zoomedImage, setZoomedImage] = useState<string | null>(null);

  const downloadFile = (url: string, filename: string) => {
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleDownloadPackage = () => {
    // 1. 下载设计效果图
    downloadFile(selectedDesign.stillLifeUrl, '01_棒球帽_核心静物图.png');
    
    // 2. 下载模特图
    setTimeout(() => {
        downloadFile(selectedDesign.modelUrl, '02_棒球帽_模特展示图.png');
    }, 200);

    // 3. 下载技术图纸
    setTimeout(() => {
      downloadFile(techPackImage, '03_棒球帽_生产技术图纸.png');
    }, 400);

    // 4. 下载 HTML 格式的材料清单
    if (materialsList) {
      setTimeout(() => {
        const tableRows = materialsList.map(item => `
          <tr>
            <td style="border: 1px solid #ddd; padding: 12px; font-weight: bold; background: #fafafa;">${item.component}</td>
            <td style="border: 1px solid #ddd; padding: 12px;">${item.material}</td>
            <td style="border: 1px solid #ddd; padding: 12px; color: #555;">${item.specification}</td>
            <td style="border: 1px solid #ddd; padding: 12px; text-align: right; font-family: monospace;">${item.quantity}</td>
          </tr>
        `).join('');

        const htmlContent = `
          <!DOCTYPE html>
          <html>
          <head>
            <meta charset="UTF-8">
            <title>棒球帽生产资料包 - BOM 清单</title>
            <style>
              body { font-family: 'PingFang SC', 'Microsoft YaHei', sans-serif; color: #333; padding: 40px; line-height: 1.6; }
              .container { max-width: 900px; margin: 0 auto; }
              .header { border-bottom: 3px solid #000; padding-bottom: 20px; margin-bottom: 30px; display: flex; justify-content: space-between; align-items: flex-end; }
              h1 { margin: 0; font-size: 28px; }
              .meta { font-size: 14px; color: #666; }
              table { width: 100%; border-collapse: collapse; margin-top: 20px; box-shadow: 0 2px 10px rgba(0,0,0,0.05); }
              th { background-color: #000; color: #fff; border: 1px solid #000; padding: 15px; text-align: left; text-transform: uppercase; letter-spacing: 1px; }
              td { border: 1px solid #eee; }
              .footer { margin-top: 50px; font-size: 12px; color: #999; border-top: 1px solid #eee; padding-top: 20px; }
              .images-ref { margin-top: 30px; display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
              .img-box { border: 1px solid #eee; padding: 10px; text-align: center; }
              .img-box p { font-size: 12px; margin-bottom: 5px; font-weight: bold; }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="header">
                <div>
                  <h1>棒球帽生产材料清单 (BOM)</h1>
                  <p class="meta">项目编号: CAP-${Date.now().toString().slice(-6)}</p>
                </div>
                <div class="meta text-right">导出日期: ${new Date().toLocaleDateString()}</div>
              </div>

              <table>
                <thead>
                  <tr>
                    <th>组件名称</th>
                    <th>建议材料</th>
                    <th>技术规格</th>
                    <th>单顶用量</th>
                  </tr>
                </thead>
                <tbody>
                  ${tableRows}
                </tbody>
              </table>

              <div class="footer">
                <p>注：本清单由 AI 棒球帽设计助手 自动生成。大货生产前请务必确认产前样。版权所有 © 2025</p>
              </div>
            </div>
          </body>
          </html>
        `;
        
        const blob = new Blob([htmlContent], { type: 'text/html' });
        const url = URL.createObjectURL(blob);
        downloadFile(url, '04_棒球帽_生产物料清单.html');
        URL.revokeObjectURL(url);
      }, 600);
    }
  };

  return (
    <div className="w-full max-w-7xl animate-fade-in pb-32 px-4">
      <div className="text-center mb-12">
        <h2 className="text-5xl font-black mb-4 tracking-tighter text-black">全套生产资料已备齐</h2>
        <p className="text-gray-600 text-lg">产品设计在静物与模特展示中保持高度一致。请核对下方 BOM 清单。</p>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-16">
        {/* Still Life */}
        <div className="flex flex-col group">
          <h3 className="text-sm font-bold text-cyan-600 mb-3 uppercase tracking-widest flex items-center gap-2">
            <span className="w-5 h-5 bg-cyan-500/10 rounded flex items-center justify-center text-[10px]">01</span>
            核心静物图
          </h3>
          <div className="bg-white/60 backdrop-blur-md rounded-2xl overflow-hidden shadow-xl border border-white/40 aspect-square relative flex items-center justify-center">
            <img 
              src={selectedDesign.stillLifeUrl} 
              alt="Still Life Master"
              className="w-full h-full object-cover"
            />
            <button 
              onClick={() => setZoomedImage(selectedDesign.stillLifeUrl)}
              className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
            >
              <div className="bg-white text-black p-3 rounded-full transform scale-90 group-hover:scale-100 transition-transform">
                <ZoomInIcon className="w-6 h-6" />
              </div>
            </button>
          </div>
        </div>

        {/* Model */}
        <div className="flex flex-col group">
          <h3 className="text-sm font-bold text-rose-500 mb-3 uppercase tracking-widest flex items-center gap-2">
            <span className="w-5 h-5 bg-rose-500/10 rounded flex items-center justify-center text-[10px]">02</span>
            模特展示图
          </h3>
          <div className="bg-white/60 backdrop-blur-md rounded-2xl overflow-hidden shadow-xl border border-white/40 aspect-square relative flex items-center justify-center">
            <img 
              src={selectedDesign.modelUrl} 
              alt="Model Reference"
              className="w-full h-full object-cover"
            />
            <button 
              onClick={() => setZoomedImage(selectedDesign.modelUrl)}
              className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
            >
              <div className="bg-white text-black p-3 rounded-full transform scale-90 group-hover:scale-100 transition-transform">
                <ZoomInIcon className="w-6 h-6" />
              </div>
            </button>
          </div>
        </div>
        
        {/* Tech Pack */}
        <div className="flex flex-col group">
          <h3 className="text-sm font-bold text-green-500 mb-3 uppercase tracking-widest flex items-center gap-2">
            <span className="w-5 h-5 bg-green-500/10 rounded flex items-center justify-center text-[10px]">03</span>
            工厂技术包
          </h3>
          <div className="bg-white rounded-2xl overflow-hidden shadow-xl border border-gray-200 aspect-square relative flex items-center justify-center p-6">
            <img 
              src={techPackImage} 
              alt="Tech Pack Drawing"
              className="w-full h-full object-contain"
            />
            <button 
              onClick={() => setZoomedImage(techPackImage)}
              className="absolute inset-0 bg-black/10 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
            >
              <div className="bg-gray-900 text-white p-3 rounded-full transform scale-90 group-hover:scale-100 transition-transform">
                <ZoomInIcon className="w-6 h-6" />
              </div>
            </button>
          </div>
        </div>
      </div>

      {/* BOM Table */}
      {materialsList && (
        <div className="w-full bg-white/60 backdrop-blur-md rounded-[2rem] p-8 border border-white/40 shadow-xl mb-12">
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-yellow-500/20 rounded-xl flex items-center justify-center text-yellow-600">
                    <ArchiveIcon className="w-6 h-6" />
                </div>
                <div>
                    <h3 className="text-2xl font-bold text-black">生产物料清单 (BOM)</h3>
                    <p className="text-gray-500 text-sm">核对设计一致性所需的所有物理组件</p>
                </div>
            </div>
          </div>
          <div className="overflow-hidden rounded-xl border border-gray-200">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-100 text-gray-600 text-[10px] uppercase tracking-[0.2em]">
                  <th className="px-6 py-4">组件</th>
                  <th className="px-6 py-4">材质建议</th>
                  <th className="px-6 py-4">工艺规格</th>
                  <th className="px-6 py-4 text-right">用量</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {materialsList.map((item, index) => (
                  <tr key={index} className="hover:bg-gray-50 transition-colors bg-white">
                    <td className="px-6 py-5 font-bold text-black">{item.component}</td>
                    <td className="px-6 py-5 text-gray-700">{item.material}</td>
                    <td className="px-6 py-5 text-gray-500 text-sm italic font-serif">{item.specification}</td>
                    <td className="px-6 py-5 text-right font-mono text-cyan-600">{item.quantity}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Persistent Floating Controls */}
      <div className="fixed bottom-10 left-1/2 -translate-x-1/2 flex items-center gap-4 z-50">
        <button
          onClick={handleDownloadPackage}
          className="px-12 py-5 bg-black text-white font-bold text-xl rounded-2xl shadow-2xl hover:bg-gray-800 hover:scale-[1.02] transition-all duration-300 flex items-center gap-4"
        >
          <DownloadIcon className="w-8 h-8" />
          下载一键打包生产资料
        </button>
        <button
          onClick={onReset}
          className="px-8 py-5 bg-white/90 backdrop-blur-xl text-black font-bold text-lg rounded-2xl border border-gray-200 hover:bg-gray-100 transition-all shadow-2xl"
        >
          完成并返回
        </button>
      </div>

      {/* Universal Zoom Modal */}
      {zoomedImage && (
        <div 
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/98 backdrop-blur-2xl p-4 animate-fade-in" 
          onClick={() => setZoomedImage(null)}
        >
          <button className="absolute top-8 right-8 p-4 bg-gray-800 text-white rounded-full hover:bg-red-500 transition-colors">
            <CloseIcon className="w-8 h-8" />
          </button>
          <div className="relative max-w-6xl w-full h-full flex flex-col items-center justify-center" onClick={e => e.stopPropagation()}>
            <img 
              src={zoomedImage} 
              alt="Enlarged View"
              className={`max-w-full max-h-full object-contain rounded-2xl shadow-[0_0_100px_rgba(0,0,0,0.5)] ${zoomedImage === techPackImage ? 'bg-white p-8' : ''}`}
            />
            <p className="mt-6 text-white/50 text-sm tracking-widest font-light">点击背景以关闭视图</p>
          </div>
        </div>
      )}
    </div>
  );
};
