import React, { useState } from 'react';
import { motion } from 'motion/react';
import Markdown from 'react-markdown';
import { generateContent, extractTextFromResponse } from '../../../shared_services/geminiProxyService';
import { 
  Wand2, 
  Lightbulb, 
  Image as ImageIcon, 
  Type, 
  Sparkles, 
  Copy, 
  CheckCircle2, 
  Loader2,
  LayoutTemplate,
  ShoppingBag,
  PenTool,
  MessageSquare,
  Zap,
  Layers,
  Download,
  Maximize2,
  Upload,
  MousePointer2,
  History,
  LayoutGrid,
  Brush,
  Volume2,
  Search,
  Video,
  Boxes,
  Shirt,
  ArrowUpCircle,
  Eraser,
  Palette,
  UserCircle2,
  Crop,
  Languages
} from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

function extractFinalTextOnly(response: any): string {
  const candidates = Array.isArray(response?.candidates) ? response.candidates : [];
  for (const candidate of candidates) {
    const parts = Array.isArray(candidate?.content?.parts) ? candidate.content.parts : [];

    const finalParts = parts
      .filter((part: any) =>
        typeof part?.text === 'string' &&
        part.text.trim() &&
        part?.thought !== true &&
        part?.intermediate !== true &&
        part?.isIntermediate !== true
      )
      .map((part: any) => String(part.text).trim());

    if (finalParts.length > 0) {
      return finalParts[finalParts.length - 1];
    }

    const fallbackParts = parts
      .filter((part: any) => typeof part?.text === 'string' && part.text.trim())
      .map((part: any) => String(part.text).trim());

    if (fallbackParts.length > 0) {
      return fallbackParts[fallbackParts.length - 1];
    }
  }

  const fallback = extractTextFromResponse(response).trim();
  if (fallback) {
    return fallback;
  }

  throw new Error('Model returned an empty response.');
}

function sanitizeGeneratedFramework(text: string): string {
  let output = String(text || '').trim();

  // Remove common trailing meta-instructions that ask for another output step.
  output = output.replace(
    /请根据以上设定[，,\s]*生成构建此\s*Agent\s*的详细系统指令[\s\S]*?(?:Google\s*AI\s*Studio(?:\s*中)?。?|$)/gi,
    '',
  );

  output = output
    .split('\n')
    .filter((line) => {
      const trimmed = line.trim();
      if (!trimmed) {
        return true;
      }

      return !/^(请根据以上设定|请基于以上设定|请据此生成|并提供一个简单的\s*Python\/JSON\s*结构示例)/i.test(trimmed);
    })
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return output;
}

const SYSTEM_INSTRUCTION = `
你是一个专门为电商设计师、广告图文店老板等非技术背景用户编写“Google AI Studio Agent 生成提示词”的专家。
你的目标是：根据用户简单的需求描述，生成一个结构化、专业且可以直接复制粘贴给 AI 助手（如 Gemini）用来生成 Agent 代码的提示词框架。

【输出规范】：
1. **只输出提示词框架内容**。严禁在开头或结尾添加任何寒暄、建议、总结、使用说明或其他附加信息。
2. 输出必须直接以框架内容开始，并以框架内容结束。
3. 严禁输出“请根据以上设定，生成构建此 Agent 的详细系统指令……”这类二次请求语句。

生成的提示词框架必须包含以下部分：
1. **Agent 角色设定**：定义这个 Agent 是什么。
2. **目标用户与场景**：明确这个 Agent 是给谁用的，解决什么问题。
3. **核心功能列表**：列出核心功能（例如：上传图片、选择风格、一键生成）。
4. **UI/UX 设计建议**：针对电商/设计行业的审美，提供具体的 UI 设计建议。

请使用 Markdown 格式输出。
`;

const FEATURE_ITEMS = [
  {
    id: 'upload',
    title: '图片上传与预览',
    description: '支持点击或拖拽上传图片。在电商 Agent 中，这是处理商品图的第一步。',
    icon: Upload,
    color: 'from-blue-500 to-indigo-500',
    demoType: 'upload'
  },
  {
    id: 'zoom',
    title: '高清放大查看',
    description: '点击生成的图片即可放大，方便设计师检查细节。',
    icon: Maximize2,
    color: 'from-purple-500 to-pink-500',
    demoType: 'zoom'
  },
  {
    id: 'download',
    title: '一键下载保存',
    description: '将生成的作品直接保存到本地，支持多种格式，方便直接发布到店铺。',
    icon: Download,
    color: 'from-emerald-500 to-teal-500',
    demoType: 'download'
  },
  {
    id: 'copy',
    title: '文案一键复制',
    description: '生成的广告文案或提示词，点击即可复制，提高运营效率。',
    icon: Copy,
    color: 'from-orange-500 to-amber-500',
    demoType: 'copy'
  },
  {
    id: 'style',
    title: '风格/参数选择',
    description: '通过按钮或下拉框让用户选择不同的生成风格（如：极简、复古、3D）。',
    icon: MousePointer2,
    color: 'from-cyan-500 to-blue-500',
    demoType: 'style'
  },
  {
    id: 'history',
    title: '历史记录管理',
    description: '自动保存用户之前的生成记录，方便随时找回之前的灵感。',
    icon: History,
    color: 'from-rose-500 to-red-500',
    demoType: 'history'
  },
  {
    id: 'multi-gen',
    title: '多图并行生成',
    description: '一次性生成 4-8 张图片供用户挑选，提高选片效率。',
    icon: LayoutGrid,
    color: 'from-indigo-500 to-blue-600',
    demoType: 'multi-gen'
  },
  {
    id: 'inpaint',
    title: '局部重绘/编辑',
    description: '通过涂抹或指令修改图片局部，如更换模特衣服或背景。',
    icon: Brush,
    color: 'from-orange-400 to-red-500',
    demoType: 'inpaint'
  },
  {
    id: 'tts',
    title: 'AI 语音旁白',
    description: '将广告文案转为多种音色的真人语音，适用于短视频配音。',
    icon: Volume2,
    color: 'from-violet-500 to-purple-600',
    demoType: 'tts'
  },
  {
    id: 'search',
    title: '实时联网搜索',
    description: '集成 Google 搜索，获取最新的流行趋势、竞品价格或节日素材。',
    icon: Search,
    color: 'from-blue-400 to-cyan-500',
    demoType: 'search'
  },
  {
    id: 'video',
    title: '静态图转视频',
    description: '利用 Veo 模型将商品图转为 5-10 秒的动态展示视频。',
    icon: Video,
    color: 'from-rose-400 to-pink-600',
    demoType: 'video'
  },
  {
    id: 'batch',
    title: '批量任务处理',
    description: '一次性处理几十个商品的抠图、打标或文案生成任务。',
    icon: Boxes,
    color: 'from-emerald-400 to-green-600',
    demoType: 'batch'
  },
  {
    id: 'try-on',
    title: '虚拟试穿/换装',
    description: '将衣服平铺图或模特图一键替换到不同身材、肤色的模特身上。',
    icon: Shirt,
    color: 'from-blue-600 to-cyan-500',
    demoType: 'try-on'
  },
  {
    id: 'upscale',
    title: '高清无损放大',
    description: '将模糊的手机实拍图修复为 4K 高清大图，满足印刷或详情页需求。',
    icon: ArrowUpCircle,
    color: 'from-indigo-400 to-blue-500',
    demoType: 'upscale'
  },
  {
    id: 'eraser',
    title: '智能消除笔',
    description: '涂抹即可消除图片中多余的杂物、水印或路人，保持画面干净。',
    icon: Eraser,
    color: 'from-rose-500 to-orange-500',
    demoType: 'eraser'
  },
  {
    id: 'style-transfer',
    title: '品牌风格迁移',
    description: '将普通照片一键转为特定的品牌视觉风格（如：莫兰迪色、赛博朋克）。',
    icon: Palette,
    color: 'from-fuchsia-500 to-purple-600',
    demoType: 'style-transfer'
  },
  {
    id: 'face-swap',
    title: '模特智能换脸',
    description: '根据目标市场（如欧美、东南亚）一键更换模特面孔，降低拍摄成本。',
    icon: UserCircle2,
    color: 'from-amber-500 to-orange-600',
    demoType: 'face-swap'
  },
  {
    id: 'auto-crop',
    title: '智能比例裁切',
    description: '自动识别主体，将原图裁切为 1:1、3:4、9:16 等多种电商常用比例。',
    icon: Crop,
    color: 'from-teal-500 to-emerald-600',
    demoType: 'auto-crop'
  },
  {
    id: 'translate',
    title: '出海详情页翻译',
    description: '自动识别并翻译图片中的文字，并保持原有的排版风格，助力出海。',
    icon: Languages,
    color: 'from-blue-500 to-indigo-600',
    demoType: 'translate'
  }
];

export default function App() {
  const [activeTab, setActiveTab] = useState<'prompt' | 'inspiration'>('prompt');

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900 font-sans flex flex-col md:flex-row">
      {/* Sidebar */}
      <aside className="w-full md:w-64 bg-white border-r border-zinc-200 flex-shrink-0 flex flex-col">
        <div className="p-6 border-b border-zinc-100">
          <div className="flex items-center gap-2 text-indigo-600 mb-1">
            <Sparkles className="w-6 h-6" />
            <h1 className="font-bold text-xl tracking-tight">AI Studio</h1>
          </div>
          <p className="text-xs text-zinc-500 font-medium tracking-wide uppercase">Starter for E-commerce</p>
        </div>
        
        <nav className="flex-1 p-4 space-y-2">
          <button
            onClick={() => setActiveTab('prompt')}
            className={cn(
              "w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200",
              activeTab === 'prompt' 
                ? "bg-indigo-50 text-indigo-700 shadow-sm" 
                : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900"
            )}
          >
            <Wand2 className="w-5 h-5" />
            Agent 提示词生成器
          </button>
          <button
            onClick={() => setActiveTab('inspiration')}
            className={cn(
              "w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200",
              activeTab === 'inspiration' 
                ? "bg-indigo-50 text-indigo-700 shadow-sm" 
                : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900"
            )}
          >
            <Lightbulb className="w-5 h-5" />
            灵感与功能展示
          </button>
        </nav>


      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto">
        <div className={activeTab === 'prompt' ? 'block' : 'hidden'}>
          <PromptBuilder />
        </div>
        <div className={activeTab === 'inspiration' ? 'block' : 'hidden'}>
          <InspirationGallery onUsePrompt={(prompt) => {
            // Trigger filling prompt input and switch back to generator tab.
            window.dispatchEvent(new CustomEvent('use-example-prompt', { detail: prompt }));
            setActiveTab('prompt');
          }} />
        </div>
      </main>
    </div>
  );
}

function PromptBuilder() {
  const [input, setInput] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedPrompt, setGeneratedPrompt] = useState('');
  const [copied, setCopied] = useState(false);

  // Listen for example prompts from the gallery
  React.useEffect(() => {
    const handleUsePrompt = (e: Event) => {
      const customEvent = e as CustomEvent<string>;
      setInput(customEvent.detail);
    };
    window.addEventListener('use-example-prompt', handleUsePrompt);
    return () => window.removeEventListener('use-example-prompt', handleUsePrompt);
  }, []);

  const handleGenerate = async () => {
    if (!input.trim()) return;
    
    setIsGenerating(true);
    setGeneratedPrompt('');
    
    try {
      const response = await generateContent({
        model: 'gemini-3-flash-preview',
        task: 'text_gen',
        contents: [
          {
            role: 'user',
            parts: [{ text: `用户需求：${input}` }],
          },
        ],
        systemInstruction: {
          parts: [{ text: SYSTEM_INSTRUCTION }],
        },
        config: { temperature: 0.7 }
      });

      const text = sanitizeGeneratedFramework(extractFinalTextOnly(response));
      if (!text?.trim()) {
        throw new Error('Model returned an empty response.');
      }

      setGeneratedPrompt(text);
    } catch (error: any) {
      console.error('Generation error:', error);
      setGeneratedPrompt(`发生错误: ${error.message || '未知错误'}。请检查后端服务或网络连接。`);
    } finally {
      setIsGenerating(false);
    }
  };

  const copyText = async (text: string): Promise<boolean> => {
    if (!text) return false;

    // Preferred path for secure contexts and modern browsers.
    if (navigator?.clipboard && typeof navigator.clipboard.writeText === 'function') {
      try {
        await navigator.clipboard.writeText(text);
        return true;
      } catch (error) {
        console.warn('Clipboard API copy failed, trying fallback:', error);
      }
    }

    // Fallback for non-secure contexts or restricted WebViews.
    try {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.setAttribute('readonly', '');
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      textarea.setSelectionRange(0, textarea.value.length);
      const success = document.execCommand('copy');
      document.body.removeChild(textarea);
      return success;
    } catch (error) {
      console.error('Fallback copy failed:', error);
      return false;
    }
  };

  const handleCopy = async () => {
    if (!generatedPrompt) return;
    const success = await copyText(generatedPrompt);
    if (!success) return;

    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="max-w-4xl mx-auto p-6 md:p-10"
    >
      <header className="mb-8">
        <h2 className="text-3xl font-bold text-zinc-900 tracking-tight mb-3">Agent 提示词生成器</h2>
        <p className="text-zinc-500 text-lg">描述你的需求，AI将尝试为你拆解提示词架构</p>
      </header>

      <div className="bg-white rounded-2xl shadow-sm border border-zinc-200 overflow-hidden mb-8">
        <div className="p-6 border-b border-zinc-100 bg-zinc-50/50">
          <label htmlFor="user-needs" className="block text-sm font-semibold text-zinc-700 mb-2">
            你的需求是什么？
          </label>
          <textarea
            id="user-needs"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="例如：我是一个淘宝店主，我想做一个能把白底商品图自动生成带背景的场景图的工具，最好能选风格..."
            className="w-full h-32 p-4 bg-white border border-zinc-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none resize-none transition-shadow text-zinc-800 placeholder:text-zinc-400"
          />
          <div className="mt-4 flex justify-end">
            <button
              onClick={handleGenerate}
              disabled={isGenerating || !input.trim()}
              className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white px-6 py-2.5 rounded-xl font-medium transition-colors shadow-sm"
            >
              {isGenerating ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  生成中...
                </>
              ) : (
                <>
                  <Wand2 className="w-5 h-5" />
                  生成提示词框架
                </>
              )}
            </button>
          </div>
        </div>

        {/* Output Area */}
        <div className="p-6 bg-white min-h-[300px]">
          {generatedPrompt ? (
            <div className="relative">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-zinc-800 flex items-center gap-2">
                  <LayoutTemplate className="w-4 h-4 text-indigo-500" />
                  生成的提示词框架
                </h3>
                <button
                  onClick={handleCopy}
                  className="flex items-center gap-1.5 text-xs font-medium text-zinc-500 hover:text-zinc-900 transition-colors bg-zinc-100 hover:bg-zinc-200 px-3 py-1.5 rounded-lg"
                >
                  {copied ? <CheckCircle2 className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
                  {copied ? '已复制' : '复制代码'}
                </button>
              </div>
              <div className="prose prose-zinc prose-sm max-w-none prose-headings:font-semibold prose-a:text-indigo-600 bg-zinc-50 p-6 rounded-xl border border-zinc-100">
                <Markdown>{generatedPrompt}</Markdown>
              </div>
            </div>
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-zinc-400 py-12">
              <MessageSquare className="w-12 h-12 mb-4 opacity-20" />
              <p>生成的提示词将显示在这里</p>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}

function InspirationGallery({ onUsePrompt }: { onUsePrompt: (prompt: string) => void }) {
  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="max-w-5xl mx-auto p-6 md:p-10"
    >
      <header className="mb-10">
        <h2 className="text-3xl font-bold text-zinc-900 tracking-tight mb-3">常用功能组件展示</h2>
        <p className="text-zinc-500 text-lg">这些是 AI Studio Agent 中最常用的功能模块，你可以直接在你的 Agent 中实现它们。</p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {FEATURE_ITEMS.map((item, index) => (
          <FeatureCard key={item.id} item={item} index={index} />
        ))}
      </div>
      

    </motion.div>
  );
}

function FeatureCard({ item, index }: { item: typeof FEATURE_ITEMS[0], index: number }) {
  const renderDemo = () => {
    switch (item.demoType) {
      case 'upload':
        return (
          <div className="flex flex-col items-center justify-center h-full border-2 border-dashed border-zinc-200 rounded-xl bg-zinc-50 group-hover:bg-white transition-colors">
            <Upload className="w-6 h-6 text-zinc-400 mb-2" />
            <span className="text-[10px] text-zinc-500">点击上传图片</span>
          </div>
        );
      case 'zoom':
        return (
          <div className="relative h-full rounded-xl overflow-hidden group/zoom">
            <img src="https://picsum.photos/seed/product/200/200" alt="demo" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
            <div className="absolute inset-0 bg-black/20 flex items-center justify-center opacity-0 group-hover/zoom:opacity-100 transition-opacity">
              <Maximize2 className="w-6 h-6 text-white" />
            </div>
          </div>
        );
      case 'download':
        return (
          <div className="flex items-center justify-center h-full">
            <button className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-lg text-xs font-medium shadow-sm hover:bg-indigo-700 transition-colors">
              <Download className="w-4 h-4" />
              下载作品
            </button>
          </div>
        );
      case 'copy':
        return (
          <div className="p-3 bg-zinc-100 rounded-lg h-full flex flex-col justify-between">
            <p className="text-[10px] text-zinc-600 line-clamp-2 italic">“这款夏日新品，清凉透气...”</p>
            <div className="flex justify-end">
              <div className="p-1.5 bg-white rounded border border-zinc-200">
                <Copy className="w-3 h-3 text-zinc-400" />
              </div>
            </div>
          </div>
        );
      case 'style':
        return (
          <div className="flex gap-2 items-center justify-center h-full">
            <div className="w-8 h-8 rounded-full bg-indigo-100 border border-indigo-200" title="极简" />
            <div className="w-8 h-8 rounded-full bg-amber-100 border border-amber-200" title="复古" />
            <div className="w-8 h-8 rounded-full bg-rose-100 border border-rose-200" title="时尚" />
          </div>
        );
      case 'history':
        return (
          <div className="space-y-2 h-full overflow-hidden">
            {[1, 2].map(i => (
              <div key={i} className="flex items-center gap-2 p-2 bg-white rounded border border-zinc-100 shadow-sm">
                <div className="w-6 h-6 rounded bg-zinc-200 flex-shrink-0" />
                <div className="h-2 w-12 bg-zinc-100 rounded" />
              </div>
            ))}
          </div>
        );
      case 'multi-gen':
        return (
          <div className="grid grid-cols-2 gap-1.5 h-full">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="bg-zinc-200 rounded-md animate-pulse" />
            ))}
          </div>
        );
      case 'inpaint':
        return (
          <div className="relative h-full rounded-xl overflow-hidden">
            <img src="https://picsum.photos/seed/fashion/200/200" alt="demo" className="w-full h-full object-cover opacity-50" referrerPolicy="no-referrer" />
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-16 h-16 border-2 border-white border-dashed rounded-full bg-white/20 flex items-center justify-center">
                <Brush className="w-6 h-6 text-white" />
              </div>
            </div>
          </div>
        );
      case 'tts':
        return (
          <div className="flex flex-col justify-center h-full space-y-2">
            <div className="flex items-center gap-2 bg-white p-2 rounded-lg border border-zinc-100 shadow-sm">
              <Volume2 className="w-4 h-4 text-indigo-500" />
              <div className="flex-1 h-1.5 bg-zinc-100 rounded-full overflow-hidden">
                <div className="w-2/3 h-full bg-indigo-500" />
              </div>
            </div>
            <div className="flex justify-center gap-1">
              <span className="text-[8px] text-zinc-400">音色: 活力女声</span>
            </div>
          </div>
        );
      case 'search':
        return (
          <div className="flex flex-col justify-center h-full">
            <div className="bg-white border border-zinc-200 rounded-full px-3 py-1.5 flex items-center gap-2 shadow-sm">
              <Search className="w-3 h-3 text-zinc-400" />
              <div className="h-2 w-20 bg-zinc-100 rounded" />
            </div>
            <div className="mt-2 flex gap-1 justify-center">
              <div className="w-4 h-4 rounded bg-blue-100" />
              <div className="w-4 h-4 rounded bg-red-100" />
              <div className="w-4 h-4 rounded bg-green-100" />
            </div>
          </div>
        );
      case 'video':
        return (
          <div className="relative h-full rounded-xl overflow-hidden bg-zinc-900 flex items-center justify-center">
            <Video className="w-8 h-8 text-white/50" />
            <div className="absolute bottom-2 left-2 right-2 h-1 bg-white/20 rounded-full overflow-hidden">
              <div className="w-1/2 h-full bg-white" />
            </div>
          </div>
        );
      case 'batch':
        return (
          <div className="flex items-center justify-center h-full relative">
            <Boxes className="w-8 h-8 text-zinc-300" />
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex gap-1">
              <div className="w-2 h-2 rounded-full bg-emerald-500 animate-bounce" style={{ animationDelay: '0s' }} />
              <div className="w-2 h-2 rounded-full bg-emerald-500 animate-bounce" style={{ animationDelay: '0.2s' }} />
              <div className="w-2 h-2 rounded-full bg-emerald-500 animate-bounce" style={{ animationDelay: '0.4s' }} />
            </div>
          </div>
        );
      case 'try-on':
        return (
          <div className="flex items-center justify-center h-full gap-2">
            <div className="w-10 h-10 rounded bg-zinc-100 border border-zinc-200 flex items-center justify-center">
              <Shirt className="w-5 h-5 text-zinc-400" />
            </div>
            <div className="text-zinc-300">→</div>
            <div className="w-10 h-10 rounded bg-blue-50 border border-blue-100 flex items-center justify-center">
              <UserCircle2 className="w-5 h-5 text-blue-500" />
            </div>
          </div>
        );
      case 'upscale':
        return (
          <div className="flex items-center justify-center h-full">
            <div className="relative">
              <div className="w-12 h-12 bg-zinc-200 rounded blur-[1px]" />
              <div className="absolute inset-0 flex items-center justify-center">
                <ArrowUpCircle className="w-6 h-6 text-indigo-600 bg-white rounded-full" />
              </div>
            </div>
          </div>
        );
      case 'eraser':
        return (
          <div className="relative h-full flex items-center justify-center">
            <div className="w-16 h-10 bg-zinc-200 rounded relative overflow-hidden">
              <div className="absolute top-2 left-2 w-4 h-4 bg-red-400/50 rounded-full animate-pulse" />
              <div className="absolute inset-0 flex items-center justify-center">
                <Eraser className="w-5 h-5 text-zinc-500 rotate-12" />
              </div>
            </div>
          </div>
        );
      case 'style-transfer':
        return (
          <div className="flex items-center justify-center h-full gap-1">
            <div className="w-6 h-6 rounded-sm bg-zinc-300" />
            <div className="w-6 h-6 rounded-sm bg-purple-400" />
            <div className="w-6 h-6 rounded-sm bg-pink-500" />
          </div>
        );
      case 'face-swap':
        return (
          <div className="flex items-center justify-center h-full">
            <div className="relative w-12 h-12">
              <UserCircle2 className="w-12 h-12 text-zinc-200" />
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-6 h-6 border border-amber-500 rounded-full animate-ping" />
              </div>
            </div>
          </div>
        );
      case 'auto-crop':
        return (
          <div className="flex items-center justify-center h-full gap-2">
            <div className="w-12 h-8 border border-zinc-300 rounded flex items-center justify-center">
              <div className="w-6 h-6 border-2 border-emerald-500 border-dashed" />
            </div>
          </div>
        );
      case 'translate':
        return (
          <div className="flex flex-col justify-center h-full space-y-1">
            <div className="bg-zinc-100 h-3 w-16 rounded" />
            <div className="flex items-center gap-2">
              <Languages className="w-3 h-3 text-blue-500" />
              <div className="bg-blue-50 h-3 w-16 rounded" />
            </div>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05 }}
      className="group bg-white rounded-2xl border border-zinc-200 overflow-hidden hover:shadow-lg transition-all duration-300 flex flex-col"
    >
      {/* Demo Area */}
      <div className="h-32 p-4 bg-zinc-50 border-b border-zinc-100">
        {renderDemo()}
      </div>

      {/* Content Area */}
      <div className="p-5 flex-1 flex flex-col">
        <div className="flex items-center gap-3 mb-3">
          <div className={cn("p-2 rounded-lg bg-gradient-to-br text-white", item.color)}>
            <item.icon className="w-4 h-4" />
          </div>
          <h3 className="font-bold text-zinc-900">{item.title}</h3>
        </div>
        <p className="text-zinc-500 text-xs leading-relaxed">
          {item.description}
        </p>
      </div>
    </motion.div>
  );
}

