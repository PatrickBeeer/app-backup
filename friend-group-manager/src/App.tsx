import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Toaster, toast } from 'sonner';
import { 
  Sparkles, Wand2, Copy, CheckCircle2, 
  UserCircle, MessageSquare, Briefcase, BookOpen, ShoppingBag, 
  Loader2, PenTool, Edit3, Settings2, Info
} from 'lucide-react';
import { extractStyle, generateCopy, StyleProfile } from './lib/gemini';

const SCENARIOS = [
  { id: '日常生活', label: '日常生活', icon: MessageSquare, desc: '情绪共鸣与松弛感' },
  { id: '工作职场', label: '工作职场', icon: Briefcase, desc: '专业、靠谱且不呆板' },
  { id: '学习成长', label: '学习成长', icon: BookOpen, desc: '通透、内驱力与启发' },
  { id: '产品种草/安利', label: '好物种草', icon: ShoppingBag, desc: '提供价值、润物无声' },
];

export default function App() {
  // Phase 1 State
  const [pastPosts, setPastPosts] = useState('');
  const [isExtracting, setIsExtracting] = useState(false);
  const [styleProfile, setStyleProfile] = useState<StyleProfile | null>(null);
  
  // Phase 2 State
  const [currentTopic, setCurrentTopic] = useState('');
  const [currentScenario, setCurrentScenario] = useState(SCENARIOS[0].id);
  const [currentLength, setCurrentLength] = useState<'auto' | 'short' | 'long'>('auto');
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedCopies, setGeneratedCopies] = useState<string[]>([]);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  const handleExtractStyle = async () => {
    if (!pastPosts.trim()) {
      toast.error("请输入一些以前的朋友圈文案！");
      return;
    }
    setIsExtracting(true);
    try {
      const profile = await extractStyle(pastPosts);
      setStyleProfile(profile);
      toast.success("专属风格提取完毕！");
    } catch (error) {
      toast.error("提取风格失败，请稍后重试或检查配置。");
    } finally {
      setIsExtracting(false);
    }
  };

  const handleGenerateCopy = async () => {
    if (!styleProfile) {
      toast.error("请先提取专属文风！");
      return;
    }
    if (!currentTopic.trim()) {
      toast.error("请输入今天的发文素材！");
      return;
    }
    setIsGenerating(true);
    setGeneratedCopies([]);
    try {
      const copies = await generateCopy(styleProfile, currentScenario, currentTopic, currentLength);
      setGeneratedCopies(copies);
      toast.success("生成成功，请查收专属文案！");
    } catch (error) {
      toast.error("生成文案失败，请稍后重试。");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCopy = (text: string, index: number) => {
    navigator.clipboard.writeText(text);
    setCopiedIndex(index);
    toast.success("文案已复制到剪贴板！");
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  const handleProfileChange = (key: keyof StyleProfile, value: string) => {
    if (styleProfile) {
      setStyleProfile({ ...styleProfile, [key]: value });
    }
  };

  return (
    <div className="h-screen flex flex-col bg-[#f7f8fc] text-neutral-900 font-sans selection:bg-[#FF6321]/20 overflow-hidden">
      <Toaster position="top-center" richColors />
      {/* Header */}
      <header className="h-[60px] bg-white border-b border-neutral-200 flex items-center px-6 shrink-0 justify-between z-20 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="bg-[#FF6321] p-1.5 rounded-lg">
            <Sparkles className="w-5 h-5 text-white" />
          </div>
          <h1 className="text-lg font-bold tracking-tight text-neutral-900">
            朋友圈营业厅 
            <span className="text-xs font-normal text-neutral-500 ml-3 hidden sm:inline-block border-l border-neutral-200 pl-3">
              你的文案克隆师 🚀
            </span>
          </h1>
        </div>
      </header>

      <main className="flex-1 overflow-hidden p-4 sm:p-6 flex flex-col lg:flex-row gap-6 max-w-[1600px] w-full mx-auto">
        
        {/* Left Panel: Inputs */}
        <div className="w-full lg:w-[400px] xl:w-[450px] bg-white rounded-2xl border border-neutral-200/80 flex flex-col shrink-0 shadow-sm relative z-10 overflow-hidden">
          <div className="h-14 px-5 border-b border-neutral-100 flex items-center justify-between shrink-0 bg-neutral-50/50">
            <div className="flex items-center gap-2 text-neutral-700 font-bold text-sm">
              <Settings2 className="w-4 h-4 text-[#FF6321]" />
              输入信息
            </div>
          </div>
          
          <div className="flex-1 overflow-y-auto custom-scrollbar p-5 space-y-8 pb-32">
            {/* Step 1: 提取风格 */}
            <section className="space-y-4">
              <div className="flex items-center gap-2">
                <span className="text-xs font-black text-neutral-400 tracking-wider">01</span>
                <h3 className="text-sm font-bold text-neutral-900">朋友圈风格 <span className="text-red-500">*</span></h3>
              </div>
              <textarea
                value={pastPosts}
                onChange={(e) => setPastPosts(e.target.value)}
                placeholder="请丢给我3-5条你喜欢的朋友圈文案，或你自己过往发过的朋友圈内容,我来建立你的专属文风档案!"
                className="w-full min-h-[140px] p-4 bg-neutral-50 border border-neutral-200 rounded-xl focus:ring-2 focus:ring-[#FF6321]/20 focus:border-[#FF6321] transition-all resize-none text-sm leading-relaxed placeholder:text-neutral-400"
              />
              <button
                onClick={handleExtractStyle}
                disabled={!pastPosts.trim() || isExtracting}
                className="w-full py-3 px-4 bg-white border border-neutral-200 hover:border-[#FF6321] hover:text-[#FF6321] text-neutral-700 rounded-xl text-sm font-bold tracking-wide flex items-center justify-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
              >
                {isExtracting ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> 解码中...</>
                ) : (
                  <><Wand2 className="w-4 h-4" /> 提取专属风格</>
                )}
              </button>
            </section>

            <div className="h-px w-full bg-neutral-100" />

            {/* Step 2: 发文信息 */}
            <section className={`space-y-6 transition-opacity duration-300 ${!styleProfile ? 'opacity-40 pointer-events-none' : 'opacity-100'}`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-black text-neutral-400 tracking-wider">02</span>
                  <h3 className="text-sm font-bold text-neutral-900">可选配置</h3>
                </div>
              </div>
              
              <div className="space-y-4">
                <p className="text-xs font-semibold text-neutral-500 uppercase tracking-wider mb-3">场景选择</p>
                <div className="grid grid-cols-2 gap-2.5">
                  {SCENARIOS.map((sc) => {
                    const isActive = currentScenario === sc.id;
                    const Icon = sc.icon;
                    return (
                      <button
                        key={sc.id}
                        onClick={() => setCurrentScenario(sc.id)}
                        className={`py-2.5 px-3 rounded-xl border text-sm flex items-center justify-center gap-1.5 transition-all ${
                          isActive 
                            ? 'bg-[#FF6321]/5 border-[#FF6321]/40 text-[#FF6321] font-bold shadow-sm' 
                            : 'bg-white border-neutral-200 text-neutral-600 hover:bg-neutral-50 hover:border-neutral-300'
                        }`}
                        title={sc.desc}
                      >
                        <Icon className="w-3.5 h-3.5" />
                        {sc.label}
                      </button>
                    )
                  })}
                </div>
              </div>

              <div className="space-y-4">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-xs font-semibold text-neutral-500 uppercase tracking-wider">篇幅控制</p>
                </div>
                <div className="grid grid-cols-3 gap-2.5">
                  {[
                    { id: 'short', label: '短平快' },
                    { id: 'auto', label: '默认适中' },
                    { id: 'long', label: '娓娓道来' },
                  ].map((len) => (
                    <button
                      key={len.id}
                      onClick={() => setCurrentLength(len.id as 'auto' | 'short' | 'long')}
                      className={`py-2 px-2.5 rounded-xl border text-xs font-medium transition-all ${
                        currentLength === len.id 
                          ? 'bg-neutral-800 border-neutral-800 text-white shadow-sm font-bold' 
                          : 'bg-white border-neutral-200 text-neutral-600 hover:bg-neutral-50 hover:border-neutral-300'
                      }`}
                    >
                      {len.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-4 pt-2">
                <p className="text-xs font-semibold text-neutral-500 uppercase tracking-wider mb-2">核心素材 <span className="text-red-500">*</span></p>
                <textarea
                  value={currentTopic}
                  onChange={(e) => setCurrentTopic(e.target.value)}
                  placeholder="输入今天的所见所闻所想。例如：今天开了一下午会，终于敲定了年度方案..."
                  className="w-full min-h-[140px] p-4 bg-neutral-50/80 border border-neutral-200 rounded-xl focus:ring-2 focus:ring-[#FF6321]/20 focus:border-[#FF6321] transition-all resize-none text-sm leading-relaxed placeholder:text-neutral-400 custom-scrollbar"
                />
              </div>

            </section>
          </div>

          <div className="absolute bottom-0 left-0 right-0 p-5 bg-white border-t border-neutral-100 shadow-[0_-4px_20px_rgba(0,0,0,0.02)]">
            <button
              onClick={handleGenerateCopy}
              disabled={!currentTopic.trim() || isGenerating || !styleProfile}
              className="w-full py-4 px-4 bg-[#FF6321] hover:bg-[#E55315] text-white rounded-xl font-bold tracking-wide flex items-center justify-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-[0_4px_14px_0_rgba(255,99,33,0.25)] hover:shadow-[0_6px_20px_rgba(255,99,33,0.35)]"
            >
              {isGenerating ? (
                <><Loader2 className="w-5 h-5 animate-spin" /> 创作中...</>
              ) : (
                <><Sparkles className="w-5 h-5" /> 立即生成专属文案</>
              )}
            </button>
          </div>
        </div>

        {/* Right Panel: Results */}
        <div className="flex-1 bg-white rounded-2xl border border-neutral-200/80 flex flex-col shadow-sm overflow-hidden z-10">
          <div className="h-14 px-5 border-b border-neutral-100 flex items-center shrink-0 bg-neutral-50/50">
            <div className="flex items-center gap-2 text-neutral-700 font-bold text-sm">
              <Sparkles className="w-4 h-4 text-green-500" />
              生成结果
            </div>
          </div>

          <div className="flex-1 overflow-y-auto custom-scrollbar bg-[#fafafa]">
            {/* Empty State */}
            {!styleProfile && !isExtracting && (
              <div className="h-full flex flex-col items-center justify-center p-8 text-center text-neutral-400">
                <div className="w-20 h-20 bg-white border border-neutral-100 rounded-full flex items-center justify-center mb-6 shadow-sm">
                  <Edit3 className="w-8 h-8 text-neutral-300" />
                </div>
                <h3 className="text-lg font-bold text-neutral-700 mb-2">等待灵感注入</h3>
                <p className="text-sm max-w-[260px]">请在左侧输入你的文案样本，让我们先提取一下你的风格档案。</p>
              </div>
            )}

            <div className="p-6 sm:p-8 space-y-8">
              {/* Profile Card */}
              <AnimatePresence>
                {styleProfile && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    className="bg-white rounded-2xl border border-neutral-200 shadow-sm p-6 overflow-hidden"
                  >
                    <div className="flex items-center gap-2 mb-6">
                      <UserCircle className="w-5 h-5 text-indigo-500" />
                      <h3 className="text-base font-bold text-neutral-900">你的专属风格卡</h3>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 relative z-10">
                      {[
                        { key: 'tone' as const, label: '表达语气', icon: <MessageSquare className="w-3.5 h-3.5 text-neutral-400" /> },
                        { key: 'layout' as const, label: '标点排版', icon: <PenTool className="w-3.5 h-3.5 text-neutral-400" /> },
                        { key: 'emojis' as const, label: 'Emoji 偏好', icon: <Sparkles className="w-3.5 h-3.5 text-neutral-400" /> },
                        { key: 'persona' as const, label: '核心人设', icon: <UserCircle className="w-3.5 h-3.5 text-neutral-400" /> },
                      ].map((item) => (
                        <div key={item.key} className="bg-neutral-50 p-3.5 rounded-xl border border-neutral-100 flex flex-col gap-1.5 transition-all focus-within:bg-white focus-within:border-indigo-200 focus-within:ring-2 focus-within:ring-indigo-50">
                          <div className="flex items-center gap-1.5 text-neutral-500 text-xs font-semibold uppercase tracking-wider">
                            {item.icon}
                            {item.label}
                          </div>
                          <textarea
                            value={styleProfile[item.key]}
                            onChange={(e) => handleProfileChange(item.key, e.target.value)}
                            className="w-full text-sm text-neutral-800 bg-transparent resize-none focus:outline-none min-h-[44px] leading-relaxed custom-scrollbar"
                            rows={2}
                          />
                        </div>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Generated Results */}
              <AnimatePresence>
                {generatedCopies.length > 0 && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="space-y-6"
                  >
                    <div className="flex items-center gap-2 text-neutral-900 pb-2 border-b border-neutral-200">
                      <CheckCircle2 className="w-5 h-5 text-green-500" />
                      <h3 className="font-bold text-lg">为您生成的 {generatedCopies.length} 款文案</h3>
                    </div>
                    
                    <div className="space-y-6 max-w-4xl mx-auto">
                      {generatedCopies.map((copy, idx) => (
                        <motion.div 
                          initial={{ opacity: 0, y: 15 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: idx * 0.1 }}
                          key={idx} 
                          className="bg-white p-7 sm:p-10 rounded-3xl border border-neutral-200 shadow-sm relative group hover:border-[#FF6321]/30 hover:shadow-md transition-all"
                        >
                          <div className="absolute top-7 right-7 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                              onClick={() => handleCopy(copy, idx)}
                              className="px-4 py-2 bg-neutral-50 hover:bg-[#FF6321]/10 border border-neutral-200 hover:border-[#FF6321]/30 text-neutral-700 hover:text-[#FF6321] rounded-xl transition-all flex items-center gap-2 font-semibold text-xs shadow-sm"
                            >
                              {copiedIndex === idx ? (
                                <><CheckCircle2 className="w-4 h-4 text-[#FF6321]" /><span className="text-[#FF6321]">已复制</span></>
                              ) : (
                                <><Copy className="w-4 h-4" /><span>一键复制</span></>
                              )}
                            </button>
                          </div>
                          <div className="flex items-center gap-3 mb-5">
                            <div className="w-1.5 h-6 bg-[#FF6321] rounded-full"></div>
                            <h4 className="font-serif italic font-black text-neutral-300 text-xl tracking-widest uppercase">
                              Option {String(idx + 1).padStart(2, '0')}
                            </h4>
                          </div>
                          <p className="text-[15px] sm:text-[17px] leading-[1.8] whitespace-pre-wrap text-neutral-800 pr-0 sm:pr-24 custom-scrollbar">
                            {copy}
                          </p>
                        </motion.div>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

