import React, {useRef, useState} from 'react';
import {ArrowRight, Download, Package, RefreshCw, Sparkles, Upload, X} from 'lucide-react';
import Markdown from 'react-markdown';
import {generateScenarioMarketingPlan} from './services/scenarioMarketingService';
import {resizeImageToMaxDimension} from './lib/image';

export default function App() {
  const [productText, setProductText] = useState('');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [targetAudience, setTargetAudience] = useState<string>('');

  const audiences = [
    "小镇青年",
    "Z世代",
    "精致妈妈",
    "新锐白领",
    "资深中产",
    "都市蓝领",
    "都市银发",
    "小镇中老年"
  ];

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setImageFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const removeImage = () => {
    setImageFile(null);
    setImagePreview(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        const base64String = reader.result as string;
        // Remove the data URL prefix (e.g., "data:image/jpeg;base64,")
        const base64 = base64String.split(',')[1];
        resolve(base64);
      };
      reader.onerror = (error) => reject(error);
    });
  };

  const handleSubmit = async () => {
    if (!productText.trim() && !imageFile) {
      setError('请提供产品信息或图片。');
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      let imageDataUrl = imageFile ? imagePreview || `data:${imageFile.type};base64,${await fileToBase64(imageFile)}` : undefined;
      if (imageDataUrl) {
        imageDataUrl = await resizeImageToMaxDimension(imageDataUrl, 1024);
      }
      const text = await generateScenarioMarketingPlan({
        productText,
        imageDataUrl,
        targetAudience,
      });
      setResult(text);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '发生未知错误。');
    } finally {
      setLoading(false);
    }
  };

  const handleExport = () => {
    if (!result) return;
    const blob = new Blob([result], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = '场景化营销买点方案.md';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-neutral-100/70 text-neutral-800 font-sans selection:bg-primary-100 selection:text-primary-600">
      <div className="w-full max-w-7xl mx-auto px-4 py-6 md:py-10 flex flex-col items-center">
        
        {/* Header */}
        <div className="text-center max-w-2xl mb-10">
          <div className="inline-flex items-center justify-center space-x-2 bg-primary-50 text-primary-600 px-4 py-1.5 rounded-full text-sm font-medium mb-6">
            <Sparkles className="w-4 h-4" />
            <span>场景化营销</span>
          </div>
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight text-neutral-900 mb-6">
            卖点变 <span className="text-primary-500">买点</span>
          </h1>
          <p className="text-lg text-neutral-600 leading-relaxed">
            上传产品图片或描述其功能。我们将干瘪的技术参数（卖点）转化为能引起客户共鸣的生动生活场景（买点）。
          </p>
        </div>

        <div className="w-full grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          
          {/* Input Section */}
          <div className="bg-white rounded-3xl p-6 md:p-8 shadow-xl shadow-neutral-200/40 ring-1 ring-neutral-900/5 flex flex-col space-y-6 w-full lg:col-span-5 lg:sticky lg:top-8">
            <div className="space-y-2">
              <span className="block text-sm font-semibold text-neutral-800">产品图片（选填）</span>
              
              {!imagePreview ? (
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full h-32 rounded-2xl border-2 border-dashed border-neutral-200 bg-neutral-50 hover:bg-neutral-100 hover:border-neutral-300 transition-colors flex flex-col items-center justify-center text-neutral-500 group"
                >
                  <Upload className="w-6 h-6 mb-2 text-neutral-400 group-hover:text-primary-500 transition-colors" />
                  <span className="text-sm font-medium">点击上传图片</span>
                </button>
              ) : (
                <div className="relative w-full rounded-2xl overflow-hidden border border-neutral-200 bg-neutral-50">
                  <img src={imagePreview} alt="Preview" className="w-full h-48 object-cover" />
                  <button
                    onClick={removeImage}
                    className="absolute top-3 right-3 p-1.5 bg-black/50 hover:bg-black/70 text-white rounded-full backdrop-blur-sm transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )}
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleImageChange}
                accept="image/jpeg, image/png, image/webp"
                className="hidden"
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="productText" className="block text-sm font-semibold text-neutral-800">
                产品信息
              </label>
              <textarea
                id="productText"
                rows={5}
                className="w-full rounded-2xl border-neutral-200 bg-neutral-50 px-4 py-3 text-neutral-800 focus:border-primary-500 focus:ring-primary-500 focus:ring-2 focus:ring-opacity-20 transition-all outline-none resize-none"
                placeholder="例如：12小时保温，304不锈钢，350ml容量..."
                value={productText}
                onChange={(e) => setProductText(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <span className="block text-sm font-semibold text-neutral-800">目标人群（选填）</span>
              <div className="flex flex-wrap gap-2">
                {audiences.map((audience) => (
                  <button
                    key={audience}
                    onClick={() => setTargetAudience(targetAudience === audience ? '' : audience)}
                    className={`px-4 py-2 rounded-full text-sm font-medium transition-colors border ${
                      targetAudience === audience
                        ? 'bg-primary-500 text-white border-primary-500'
                        : 'bg-white text-neutral-600 border-neutral-200 hover:border-primary-300 hover:text-primary-500'
                    }`}
                  >
                    {audience}
                  </button>
                ))}
              </div>
            </div>

            {error && (
              <div className="p-4 rounded-xl bg-red-50 text-red-600 text-sm font-medium">
                {error}
              </div>
            )}

            <button
              onClick={handleSubmit}
              disabled={loading || (!productText.trim() && !imageFile)}
              className="w-full bg-neutral-900 hover:bg-primary-600 text-white font-medium py-3.5 px-6 rounded-2xl transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
            >
              {loading ? (
                <div className="flex items-center space-x-2">
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>正在生成场景...</span>
                </div>
              ) : (
                <>
                  <span>转化为买点</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </div>

          {/* Result Section */}
          <div className="w-full lg:col-span-7">
            {result ? (
              <div className="bg-white rounded-3xl p-6 md:p-8 shadow-xl shadow-neutral-200/40 ring-1 ring-neutral-900/5 relative">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 pb-6 border-b border-neutral-100 gap-4">
                  <h2 className="text-xl font-bold text-neutral-800">营销方案生成结果</h2>
                  <div className="flex items-center space-x-3">
                    <button
                      onClick={handleSubmit}
                      disabled={loading}
                      className="inline-flex items-center space-x-1.5 px-4 py-2 bg-neutral-50 hover:bg-neutral-100 text-neutral-700 text-sm font-medium rounded-xl transition-colors disabled:opacity-50"
                    >
                      <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                      <span>重新生成</span>
                    </button>
                    <button
                      onClick={handleExport}
                      className="inline-flex items-center space-x-1.5 px-4 py-2 bg-primary-50 hover:bg-primary-100 text-primary-600 text-sm font-medium rounded-xl transition-colors"
                    >
                      <Download className="w-4 h-4" />
                      <span>导出方案</span>
                    </button>
                  </div>
                </div>
                <div className="prose prose-neutral prose-primary max-w-none">
                  <Markdown>{result}</Markdown>
                </div>
              </div>
            ) : (
              <div className="bg-transparent rounded-3xl p-8 border-2 border-neutral-200 border-dashed h-full min-h-[400px] flex flex-col items-center justify-center text-center text-neutral-400">
                <Package className="w-12 h-12 mb-4 opacity-50" />
                <h3 className="text-lg font-medium text-neutral-600 mb-2">等待产品信息</h3>
                <p className="text-sm max-w-sm">
                  输入您的产品特点或上传图片。我们将在这里为您生成引人入胜的使用场景。
                </p>
              </div>
            )}
          </div>

        </div>
      </div>
    </div>
  );
}
