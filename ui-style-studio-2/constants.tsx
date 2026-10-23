
import { StyleConfig, StyleCategory } from './types';

export const PRESET_STYLES: StyleConfig[] = [
  {
    id: 'vibrant-lime',
    name: '高光流体 / Radiant Flow',
    category: StyleCategory.VIBRANT,
    description: '高对比度荧光绿配合极致现代排版，营造 Web3 时代的金融美学。',
    prompt: "请为我开发一个 Web 应用界面，采用‘高饱和度现代金融 (High-Saturate Web3 Finance)’视觉风格。\n\n【全局审美规范】：\n1. 布局逻辑：采用极简主义的左右或上下大色块分割布局。背景使用纯白 (#FFFFFF) 与高饱和荧光绿 (#bef264) 的强力对比。\n2. 容器设计：面板应呈现绝对扁平化，摒弃传统投影。组件边界应极为清晰，可使用 1px 的极细黑色或深灰边框 (#E5E7EB) 来界定空间。\n3. 排版系统：字体强制使用 Inter 或系统默认非衬线体。标题字号需极大（如 72px+），使用 Black 字重，字间距 (letter-spacing) 设为 -0.05em 产生紧凑的撞击感。正文使用深灰色 (#4B5563) 确保可读性。\n4. 装饰元素：融入 3D 渲染质感的半透明绿色圆盘（具有玻璃折射感）或抽象流体。这些元素应呈漂浮状，利用深度模糊 (Blur) 增加界面的层次感。\n5. 交互动态：主按钮 (Primary Button) 使用纯黑背景，文字颜色设为荧光绿。悬停时 (Hover) 产生轻微的位移 (TranslateY-1) 和无模糊的硬阴影效果。\n6. 组件细节：输入框和下拉列表需具备极大的内边距 (Padding)，背景设为纯白，聚焦时 (Focus) 边框变为黑色实线，保持界面的极简工业感。",
    visualSpecs: {
      backgroundClass: 'bg-vibrant-lime',
      containerClass: 'bg-white rounded-none border-none shadow-none transition-all duration-500',
      buttonClass: 'bg-black text-[#bef264] rounded-none px-12 py-5 font-black uppercase tracking-widest text-sm hover:scale-[1.02] transition-all active:scale-95',
      textTitleClass: 'text-black font-black tracking-tighter leading-[0.9]',
      textContentClass: 'text-gray-500 font-bold',
      accentColor: '#bef264',
      inputClass: 'bg-white border border-gray-100 rounded-none px-6 py-5 focus:border-black outline-none transition-all text-lg font-black',
      iconColor: '#000000'
    }
  },
  {
    id: 'luxury-glass',
    name: '灵动晶质 / Liquid Glass',
    category: StyleCategory.LUXURY,
    description: '利用深度、柔和渐变和极度精致的毛玻璃面板营造高级感。',
    prompt: "请为我设计一个具备‘现代轻奢毛玻璃 (Modern Luxury Glassmorphism)’质感的 Web 应用。\n\n【核心视觉参数】：\n1. 背景氛围：使用柔和的动态网格渐变。底色为浅灰白 (#F0F2F5)，叠加淡紫 (#E0E7FF) 和淡粉 (#FAE8FF) 的径向渐变，营造出通透且具有空气感的梦幻底色。\n2. 毛玻璃容器：所有面板必须具备深度模糊。背景色设为白色半透明 (white/60)，配合 backdrop-blur-3xl 效果。边缘需添加 1px 的半透明纯白边框 (white/40) 来模拟玻璃切面质感。圆角统一设定为超大尺寸 (32px 或 2rem)。\n3. 阴影系统：摒弃黑色投影，改用带色彩倾向的弥散阴影（如 rgba(99, 102, 241, 0.1)），阴影半径需极大 (Shadow-2xl)，使面板产生真正的‘悬浮’错觉。\n4. 排版层次：标题使用纯黑 (#000000)，正文使用冷灰色 (#6B7280)。字体使用紧凑的 Inter，小标签使用全大写加宽字距 (Tracking-widest) 的处理方式。\n5. 交互体验：按钮使用纯黑背景，圆角应与容器协调。悬停时产生 1.05 倍微量放大，并带有平滑的阴影加深动效。输入框采用白色半透明背景 (white/40)，聚焦时增加透明度。\n6. 装饰细节：使用细线条图标 (Lucide React 风格)，留白空间要极其充裕，营造一种“呼吸感”极强的奢侈品电商或高端工具类产品的调性。",
    visualSpecs: {
      backgroundClass: 'mesh-gradient-luxury',
      containerClass: 'bg-white/60 backdrop-blur-2xl rounded-[3rem] border border-white/40 shadow-2xl transition-all duration-500',
      buttonClass: 'bg-black text-white rounded-[24px] px-8 py-4 font-black uppercase tracking-widest text-xs hover:scale-[1.05] transition-all active:scale-95 shadow-xl shadow-black/10',
      textTitleClass: 'text-black font-black tracking-tighter',
      textContentClass: 'text-gray-500 font-medium',
      accentColor: '#000000',
      inputClass: 'bg-white/40 border-none rounded-2xl px-6 py-3 focus:bg-white/80 outline-none transition-all text-sm font-bold',
      iconColor: '#000000'
    }
  },
  {
    id: 'maternity-warm',
    name: '暖心舒缓 / Cozy Soft',
    category: StyleCategory.SOFT,
    description: '轻盈、通透、温暖。旨在唤起安全、柔软和高级舒适感。',
    prompt: "请采用‘现代母婴/高端康养生活方式’风格进行界面设计，追求极致的‘轻盈、舒缓、温暖’感。\n\n【视觉设计细节】：\n1. 色彩与渐变：全局背景使用“空气感渐变”。从淡蓝 (#EFF6FF) 平滑过渡到淡紫 (#F5F3FF) 再到柔粉 (#FFF1F2)，色彩饱和度应极低，呈现如棉花糖般的温润感。\n2. 容器形态：面板采用“磨砂晶体”材质，背景透明度保持在 30%-50%，高模糊度 (Backdrop Blur XL)。最关键的是圆角必须极大 (40px 以上)，完全杜绝任何尖锐直角，传达亲和力与绝对的安全感。\n3. 投影美学：使用超大范围、极低浓度的弥散阴影。阴影应带有柔和的紫色调，营造面板轻微悬浮在云端的视觉体验。\n4. 排版系统：标题采用深板岩灰 (#0F172A) 而非纯黑，正文采用中灰 (#64748B)，确保阅读时的视觉压力最小化。字间距略微放开，保持字体的呼吸感。\n5. 交互元素：所有按钮采用胶囊型 (Full Rounded)。主按钮使用明亮的渐变色（如蓝紫渐变），悬停时带有缓慢的位移和发光感。交互反馈应设计得如丝般顺滑。\n6. 背景点缀：在背景层散落一些模糊的彩色圆形光斑 (Orbs)，其颜色应与背景渐变呼应，增加界面的层次深度和通透性。",
    visualSpecs: {
      backgroundClass: 'mesh-gradient-maternity',
      containerClass: 'bg-white/50 backdrop-blur-3xl rounded-[3.5rem] border border-white/60 shadow-[0_40px_80px_-20px_rgba(100,116,139,0.12)] transition-all duration-500',
      buttonClass: 'bg-gradient-to-r from-indigo-500 to-purple-500 text-white rounded-full px-10 py-4.5 font-black uppercase tracking-widest text-xs shadow-2xl shadow-indigo-200/50 hover:scale-[1.05] transition-all',
      textTitleClass: 'text-slate-900 font-black tracking-tight',
      textContentClass: 'text-slate-500 font-bold',
      accentColor: '#6366f1',
      inputClass: 'bg-white/70 border-none rounded-full px-8 py-3.5 shadow-inner focus:bg-white/90 outline-none transition-all text-sm font-bold',
      iconColor: '#6366f1'
    }
  },
  {
    id: 'cyber-dark',
    name: '高阶机能 / Advanced Tech',
    category: StyleCategory.TECH,
    description: '深沉沉浸式，高对比度发光点缀和极具攻击性的几何美学。',
    prompt: "请为我开发一个深度沉浸的‘高级机能/科幻 HUD’风格 Web 界面。\n\n【界面技术参数】：\n1. 背景基础：底色设为深黑色 (#020504)，叠加 40px 间距的精密绿色参考网格线。背景边缘需带有微弱的荧光绿 (#00FF80) 环境光晕。\n2. 容器美学：采用极深色的墨绿面板 (bg-zinc-950/90)，具有高透明度和模糊感。容器四角必须带有 L 型的金属包角装饰或点阵序列。边缘可使用 45 度切角 (Clip-path) 处理，营造硬核军事感。\n3. 霓虹系统：所有边框为双重设计：内层 1px 荧光绿实线，外层为带扩散效果的辉光阴影。UI 元素在交互时应产生类似电子脉冲的微震颤效果。\n4. 排版与字体：强制使用 JetBrains Mono 或类似等宽字体。重要标题需带有 [COMMAND_LINE] 风格的装饰符，文字色彩采用荧光绿并带有轻微的文字阴影 (Text-shadow)。\n5. 动态修饰：界面中应分布动态旋转的扫描雷达、实时波形示波器和浮动的数据坐标。添加一条全屏垂直扫描线动效，模拟老式显示器的扫描质感。\n6. 交互逻辑：按钮采用空心边框设计，悬停时内部填充荧光色，文字反色。所有操作应伴随极短的、高对比度的色彩闪烁反馈。",
    visualSpecs: {
      backgroundClass: 'mesh-gradient-cyber tech-grid',
      containerClass: 'bg-zinc-950/90 backdrop-blur-2xl rounded-sm border-[1px] border-emerald-500 shadow-[0_0_30px_rgba(16,185,129,0.2)] transition-all duration-500 relative before:content-[""] before:absolute before:inset-0 before:bg-[repeating-linear-gradient(rgba(0,0,0,0)_0px,rgba(0,0,0,0)_2px,rgba(0,255,128,0.02)_3px,rgba(0,255,128,0.02)_4px)] before:pointer-events-none',
      buttonClass: 'bg-transparent border-2 border-emerald-500 text-emerald-400 rounded-none px-8 py-4 font-black uppercase tracking-[0.4em] text-xs shadow-[0_0_15px_rgba(16,185,129,0.4)] hover:bg-emerald-500 hover:text-black hover:shadow-[0_0_35px_rgba(16,185,129,0.8)] transition-all',
      textTitleClass: 'text-emerald-400 font-mono uppercase tracking-[0.5em] drop-shadow-[0_0_8px_rgba(16,185,129,0.6)]',
      textContentClass: 'text-emerald-900 font-mono tracking-tight font-bold',
      accentColor: '#10b981',
      inputClass: 'bg-black border border-emerald-900 rounded-none px-6 py-4 text-emerald-400 focus:border-emerald-400 focus:bg-emerald-950/20 outline-none transition-all text-sm font-mono',
      iconColor: '#10b981'
    }
  },
  {
    id: 'apple-design',
    name: '苹果风 / Apple Style',
    category: StyleCategory.APPLE,
    description: '极致简洁、精准的间距与排版，体现 Apple 官网那种通透且高级的工业美感。',
    prompt: "请设计一个标准的‘Apple 官网视觉风格 (Cupertino Style)’界面，体现极致的工艺精准感。\n\n【核心视觉规范】：\n1. 空间布局：背景使用纯净无暇的浅灰白 (#FBFBFD)，营造一种近乎无限延伸的通透感。全局留白 (Whitespace) 比例应超过 60%，强调“内容即中心”。\n2. 容器与圆角：采用 Apple 独有的连续曲率圆角 (通常设定为 20px-28px)，杜绝生硬的圆弧。不使用明显的投影，仅通过极其微弱的浅灰边框 (#F5F5F7) 或背景色差来区分面板层级。\n3. 排版体系：字体首选 SF Pro Display (或 Inter)。标题颜色为深邃黑 (#1D1D1F)，正文为高级深灰 (#86868B)。标题字间距应微量收紧 (-0.02em)，行高 (Line-height) 严格控制在 1.5-1.6 倍。\n4. 交互组件：按钮采用经典的胶囊型设计，颜色为苹果蓝 (#0066CC)。悬停时色彩应极其自然地加深，而非闪烁。所有动效时长应控制在 300ms-500ms 之间，追求平顺感。\n5. 细节处理：图标必须为 Retina 级高清晰度，线条粗细统一。所有元素在视觉上必须处于完美的几何对齐状态，体现极简主义背后的工业设计严谨性。",
    visualSpecs: {
      backgroundClass: 'bg-[#fbfbfd]',
      containerClass: 'bg-[#f5f5f7] rounded-[2.5rem] border-none shadow-none transition-all duration-700',
      buttonClass: 'bg-[#0066cc] text-white rounded-full px-10 py-4 font-black text-sm hover:bg-[#0077ee] transition-all active:scale-95 shadow-lg shadow-blue-100',
      textTitleClass: 'text-[#1d1d1f] font-black tracking-tight text-4xl',
      textContentClass: 'text-[#86868b] leading-relaxed font-semibold',
      accentColor: '#0066cc',
      inputClass: 'bg-white border-2 border-slate-100 rounded-2xl px-6 py-4 focus:border-[#0066cc] outline-none transition-all text-base font-medium placeholder:text-slate-300',
      iconColor: '#0066cc'
    }
  },
  {
    id: 'organic-nature',
    name: '原生美学 / Organic Native',
    category: StyleCategory.CREATIVE,
    description: '大地色系、鼠尾草绿和柔软的纸质感，带来稳重的感觉。',
    prompt: "请设计一个‘自然有机/原生审美’风格的 Web 应用界面。\n\n【设计参数与审美要求】：\n1. 色彩体系：底色采用温暖的米黄色 (#FCFAF2)，核心色调由鼠尾草绿 (#4A5D4E)、赭土色 (#9C6644) 和暗木色 (#2D3A31) 构成，营造一种置身森林与土地的宁静感。\n2. 容器形态：面板边缘应模拟手工纸张或有机物的不对称感。圆角不应完全对称（例如圆角可设为 40px 80px 60px 70px），边框可带有轻微的、类似手工造纸的粗糙纹理质感。\n3. 投影美学：使用柔和的、带褐色调的暖色阴影。阴影不应有清晰的边界，而应像漫反射光一样自然晕开。\n4. 排版艺术：标题采用优雅的、带衬线的古典字体 (Serif)，展现人文底蕴；正文采用现代感极简无衬线字体，形成跨越时代的对比。标题可使用斜体或加宽字距来增加修辞感。\n5. 交互动态：按钮采用全圆角或有机不规则形状，按下时产生类似纸张按压的内凹阴影 (Inset Shadow)。点缀色采用极低饱和度的矿石色彩。\n6. 环境装饰：在界面空白处可点缀极其淡化的植物轮廓水印或微小的噪点纹理，模拟纸张的物理纤维质感，提升整体的触觉联想。",
    visualSpecs: {
      backgroundClass: 'bg-[#fcfaf2]',
      containerClass: 'bg-[#ffffff] rounded-[40px_80px_60px_70px] shadow-2xl shadow-stone-200 border border-[#e5e7eb] transition-all duration-700 p-14',
      buttonClass: 'bg-[#4a5d4e] text-white rounded-full px-10 py-4 font-black uppercase tracking-widest text-xs hover:bg-[#3d4d40] transition-all hover:scale-105',
      textTitleClass: 'text-[#2d3a31] font-serif italic text-3xl font-black',
      textContentClass: 'text-[#5a6a5e] font-medium leading-relaxed',
      accentColor: '#4a5d4e',
      inputClass: 'bg-[#f3f4f1] border-none rounded-[24px] px-8 py-4 focus:ring-2 focus:ring-[#4a5d4e] outline-none text-sm font-bold',
      iconColor: '#4a5d4e'
    }
  }
];
