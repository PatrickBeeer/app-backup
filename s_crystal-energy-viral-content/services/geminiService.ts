import {
  generateContent,
  extractJsonTextFromResponse,
  extractImageFromResponse,
} from '../../../shared_services/geminiProxyService';
import type { GeminiGenerateRequest } from '../../../shared_services/geminiProxyService';
import type { ImageStyle, TextStyle, XiaohongshuPost } from '../types';

// 生成模式对应的模型。当前业务只走 1k，2k 保留以备后续切换。
const TEXT_MODEL = 'gemini-3-flash-preview';
const IMAGE_MODEL = 'gemini-3.1-flash-image-preview';

const RETRYABLE_ERROR_PATTERN = /(\b408\b|\b429\b|\b500\b|\b502\b|\b503\b|\b504\b|\b524\b|timeout|timed out|etimedout|econnreset|network)/i;

export const IMAGE_STYLE_LABELS: Record<ImageStyle, string> = {
  scene: '场景化',
  ootd: '辣妹风',
  natural: '自然感',
  minimalist: '极简风',
  oldMoney: '老钱风',
  creamJewelry: '奶油珠宝',
};

export const TEXT_STYLE_LABELS: Record<TextStyle, string> = {
  lively: '活泼种草',
  healing: '疗愈能量',
};

// 每个风格 4 条自洽的系列组图提示词（新版业务逻辑）。每条 prompt 已内置
// 产品图/佩戴图/人物/无人物的区分、高清重绘核心任务、禁文字 logo 指令。
export const defaultPrompts: Record<ImageStyle, string[]> = {
  scene: [
    '系列组图1/4：为这张水晶手串生成一张小红书风格的高级杂志感静物图，主题“设计的诞生”。构图为平铺(flat lay)，将真实的水晶手串，仿佛不经意地放置在它自己的设计图纸或蓝图之上。这张设计图纸上应该有关于手串尺寸、材质和结构的草图与注释，营造出一种从概念到成品的专业感和故事感。图纸旁可以放一杯精致的玻璃杯黑咖啡（不要有热气），和一支专业的绘图铅笔。摄影要求：模拟专业商业摄影，光线柔和而聚焦，突出真实手串的光泽与设计图纸的哑光质感之间的对比，整体画面干净、高级、富有叙事性。核心任务：请将用户上传的原始水晶手串作为主体进行高清重绘和精修，而不是简单地将其嵌入新背景。你需要重点提升水晶的通透感、光泽和内部纹理细节，确保其款式和颜色被忠实还原，使其质感超越原始图片。重要指令：生成的图片中绝对不能包含任何可识别的文字、logo或水印。场景中出现的任何文字元素（如图纸注释、杂志内文）必须使用无法辨认的抽象线条或模糊符号代替。',
    '系列组-图2/4：延续“设计师的晨间灵感”主题，切换为“旅途中的松弛感”场景。一个符合小红书审美的中国网红风格模特，身穿焦糖色或燕麦色的柔软针织衫，坐在高级感汽车的副驾驶座上，身体微微侧向车窗，仿佛被窗外的风景所吸引。她怀里抱着几本设计简约的杂志或品牌画册，佩戴着水晶手串的手臂自然地搭在车门上，手腕放松垂下。构图为中近景，捕捉她不经意间转头，阳光洒在发丝和下颚线上的瞬间，营造一种动态抓拍感。模特的脸部只露出精致的下颚线和颈部，不露全脸。摄影要求：模拟手机街拍的随性感，但色调是高级、温暖的“美拉德风”，光线透过车窗形成自然柔和的光影，重点突出水晶的质感和人物的松弛状态，避免任何僵硬的摆拍感。核心任务：请将用户上传的原始水晶手串作为主体进行高清重绘和精修，而不是简单地将其嵌入新背景。你需要重点提升水晶的通透感、光泽和内部纹理细节，确保其款式和颜色被忠实还原，使其质感超越原始图片。重要指令：生成的图片中绝对不能包含任何可识别的文字、logo或水印。场景中出现的任何文字元素（如图纸注释、杂志内文）必须使用无法辨认的抽象线条或模糊符号代替。',
    '系列组图3/4：延续“奶油风的温柔角落”主题。一张中景图，一个中国网红风格的模特，她展现出一种松弛的高级感。她身穿燕麦色的柔软针織衫，妆容精致，是当下流行的“白开水”或“clean fit”风格。她舒适地蜷在奶油色的沙发上，沙发旁的边几上放着一本翻开的外文时尚杂志和一杯咖啡。阳光透过百叶窗在她身上和墙壁上形成柔和且富有质感的光栅效果，她正低头欣赏手腕上的手串，脸上带着满足而宁静的微笑。摄影要求：画面充满松弛感和时尚杂志般的生活气息，光影真实自然。核心任务：请将用户上传的原始水晶手串作为主体进行高清重绘和精修，而不是简单地将其嵌入新背景。你需要重点提升水晶的通透感、光泽和内部纹理细节，确保其款式和颜色被忠实还原，使其质感超越原始图片。重要指令：生成的图片中绝对不能包含任何可识别的文字、logo或水印。场景中出现的任何文字元素（如图纸注释、杂志内文）必须使用无法辨认的抽象线条或模糊符号代替。',
    '系列组-图4/4：延续“奶油风的温柔角落”主题，但融入更多时尚杂志编辑风格。一张高级感的平铺构图(flat lay)，将水晶手串随意地搭在一本翻开的、设计简约的艺术或时尚杂志上。旁边巧妙地放置一副高品质的黑色太阳镜和一个精致的金色戒指。背景可以是干净的白色桌面或带有纹理的亚麻布。摄影要求：光线明亮而柔和，模拟专业商业摄影质感，突出水晶、金属和杂志纸张的不同材质光泽，营造出一种不经意的精致和高级感。核心任务：请将用户上传的原始水晶手串作为主体进行高清重绘和精修，而不是简单地将其嵌入新背景。你需要重点提升水晶的通透感、光泽和内部纹理细节，确保其款式和颜色被忠实还原，使其质感超越原始图片。重要指令：生成的图片中绝对不能包含任何可识别的文字、logo或水印。场景中出现的任何文字元素（如图纸注释、杂志内文）必须使用无法辨认的抽象线条或模糊符号代替。',
  ],
  ootd: [
    '系列组图1/4：为这张水晶手串生成一张小红书风格的“Y2K辣妹风”穿搭图。一张手腕特写，一个符合小红书审美的中国辣妹风网红模特，她的手部皮肤白皙，手指纤细，佩戴着手串，搭配其他金属或亚克力材质的戒指。美甲是未来感的金属色或黑色系。袖口是水洗做旧的牛仔夹克或机能风外套。背景是干净的灰色墙壁或金属板。摄影要求：闪光灯直射的锐利质感，高清晰度，保留皮肤的毛孔和纹理，水晶和金属上有清晰的反射高光。核心任务：请将用户上传的原始水晶手串作为主体进行高清重绘和精修，而不是简单地将其嵌入新背景。你需要重点提升水晶的通透感、光泽和内部纹理细节，确保其款式和颜色被忠实还原，使其质感超越原始图片。重要指令：生成的图片中绝对不能包含任何可识别的文字、logo或水印，务必保持画面的纯净。',
    '系列组-图2/4：延续“Y2K辣妹风”主题。一张半身构图，一个中国辣妹风的网红模特，身穿挂脖背心和低腰工装裤，戴着银色头戴式耳机。她手肘撑在栏杆上，手腕自然垂下，突出手串。模特的表情是冷酷的、带有距离感的“厌世脸”，眼神不看镜头。摄影要求：整体色调偏冷，有赛博朋克感，画面要有电影颗粒感，模拟真实街拍。核心任务：请将用户上传的原始水晶手串作为主体进行高清重绘和精修，而不是简单地将其嵌入新背景。你需要重点提升水晶的通透感、光泽和内部纹理细节，确保其款式和颜色被忠实还原，使其质感超越原始图片。重要指令：生成的图片中绝对不能包含任何可识别的文字、logo或水印，务必保持画面的纯净。',
    '系列组图3/4：延续“Y2K辣妹风”主题。一张夜晚街头的动态抓拍，一个中国辣妹风的网红模特，在便利店门口或霓虹灯牌下，正在低头看手机。环境光线与闪光灯结合，在他身上和手串上形成高光。摄影要求：捕捉一个不经意的瞬间，强调潮酷、随性的氛围，模拟真实夜景拍摄的光感。核心任务：请将用户上传的原始水晶手串作为主体进行高清重绘和精修，而不是简单地将其嵌入新背景。你需要重点提升水晶的通透感、光泽和内部纹理细节，确保其款式和颜色被忠实还原，使其质感超越原始图片。重要指令：生成的图片中绝对不能包含任何可识别的文字、logo或水印，务必保持画面的纯净。',
    '系列组-图4/4：延续“Y2K辣妹风”主题。一张第一人称视角的对镜自拍局部图，焦点在手腕和手串上。一个中国辣妹风的网红模特用手机对着镜子拍照，可以看到手机壳是Y2K风格的。镜子可以是有趣的哈哈镜或带有水渍，增加氛围感。摄影要求：构图大胆，只截取手臂和身体局部，突出神秘感和酷感，有真实的镜面反射效果。核心任务：请将用户上传的原始水晶手串作为主体进行高清重绘和精修，而不是简单地将其嵌入新背景。你需要重点提升水晶的通透感、光泽和内部纹理细节，确保其款式和颜色被忠实还原，使其质感超越原始图片。重要指令：生成的图片中绝对不能包含任何可识别的文字、logo或水印，务必保持画面的纯净。',
  ],
  natural: [
    '系列组图1/4：为这张水晶手串生成一张小红书风格的自然系图，主题“光与能量的低语”。特写图，手串放置在清晨森林中的苔藓或带有水珠的大片植物叶子上，阳光穿过树叶缝隙形成“耶稣光”。摄影要求：精准捕捉水晶的通透和内部纹理，以及叶片上的水珠细节，光影对比强烈。核心任务：请将用户上传的原始水晶手串作为主体进行高清重绘和精修，而不是简单地将其嵌入新背景。你需要重点提升水晶的通透感、光泽和内部纹理细节，确保其款式和颜色被忠实还原，使其质感超越原始图片。重要指令：生成的图片中绝对不能包含任何可识别的文字、logo或水印，务必保持画面的纯净。',
    '系列组-图2/4：延续“光与能量的低语”主题。一个气质空灵、符合小红书审美的中国网红模特，她皮肤白皙、手指纤细的手佩戴着手串，轻轻触碰清澈溪水的水面，仿佛在与自然进行能量交换。特写水面的光影和涟漪如何与水晶互动，美甲是透明或淡雅的颜色。摄影要求：画面干净纯粹，保留皮肤的自然纹理，微距拍摄，捕捉水滴的细节和皮肤上的绒毛，光线要柔和，有空气感。核心任务：请将用户上传的原始水晶手串作为主体进行高清重绘和精修，而不是简单地将其嵌入新背景。你需要重点提升水晶的通透感、光泽和内部纹理细节，确保其款式和颜色被忠实还原，使其质感超越原始图片。重要指令：生成的图片中绝对不能包含任何可识别的文字、logo或水印，务必保持画面的纯净。',
    '系列组图3/4：延续“光与能量的低语”主题。一张中景图，一个气质空灵的中国网红模特，身穿亚麻或丝质的连衣裙，在逆光下拍摄，她的侧脸和手串形成美丽的剪影。她的神情是疗愈和享受的，闭上眼睛仿佛在感受自然的能量。摄影要求：强调逆光下发丝的轮廓光和水晶的通透感，画面要有呼吸感和电影感。核心任务：请将用户上传的原始水晶手串作为主体进行高清重绘和精修，而不是简单地将其嵌入新背景。你需要重点提升水晶的通透感、光泽和内部纹理细节，确保其款式和颜色被忠实还原，使其质感超越原始图片。重要指令：生成的图片中绝对不能包含任何可识别的文字、logo或水印，务必保持画面的纯净。',
    '系列组-图4/4：延续“光与能量的低语”主题。一张氛围图，将手串挂在一支形态优美的枯木或花枝上，背景是日落时分的柔和天空或波光粼粼的水面。摄影要求：营造出高级、禅意的疗愈氛围，有强烈的景深效果，模拟长焦镜头拍摄。核心任务：请将用户上传的原始水晶手串作为主体进行高清重绘和精修，而不是简单地将其嵌入新背景。你需要重点提升水晶的通透感、光泽和内部纹理细节，确保其款式和颜色被忠实还原，使其质感超越原始图片。重要指令：生成的图片中绝对不能包含任何可识别的文字、logo或水印，务必保持画面的纯净。',
  ],
  minimalist: [
    '系列组图1/4：为这张水晶手串生成一张小红书风格的极简图，主题“质感颂诗”。产品静物图，手串在带有微水泥质感的背景上，利用几何形状的石膏体或道具进行构图。摄影要求：光线柔和但方向性强，创造出分明的明暗和富有雕塑感的影子，突出材质的肌理。核心任务：请将用户上传的原始水晶手串作为主体进行高清重绘和精修，而不是简单地将其嵌入新背景。你需要重点提升水晶的通透感、光泽和内部纹理细节，确保其款式和颜色被忠实还原，使其质感超越原始图片。重要指令：生成的图片中绝对不能包含任何可识别的文字、logo或水印，务必保持画面的纯净。',
    '系列组-图2/4：延续“质感颂诗”主题。一张手部特写，一个具有艺术气质、符合小红书审美的中国模特白皙且手指纤细的手，佩戴着手串，美甲是高级感的法式或半透明果冻色。手部姿态优雅，富有表现力。背景是纯色但有肌理感的墙面。摄影要求：构图遵循黄金分割，留白高级，避免AI塑料感，追求真实摄影质感。光线从侧面打来，在皮肤和背景上形成柔和的过渡和微妙的阴影。核心任务：请将用户上传的原始水晶手串作为主体进行高清重绘和精修，而不是简单地将其嵌入新背景。你需要重点提升水晶的通透感、光泽和内部纹理细节，确保其款式和颜色被忠实还原，使其质感超越原始图片。重要指令：生成的图片中绝对不能包含任何可识别的文字、logo或水印，务必保持画面的纯净。',
    '系列组图3/4：延续“质感颂诗”主题。一张抽象光影图，利用棱镜或玻璃器皿，将光线投射在手串上，在墙面形成一道彩虹或斑驳的光影。手串在光影中若隐若现。摄影要求：画面充满艺术感和神秘感，光影效果真实，无数字感。核心任务：请将用户上传的原始水晶手串作为主体进行高清重绘和精修，而不是简单地将其嵌入新背景。你需要重点提升水晶的通透感、光泽和内部纹理细节，确保其款式和颜色被忠实还原，使其质感超越原始图片。重要指令：生成的图片中绝对不能包含任何可识别的文字、logo或水印，务必保持画面的纯净。',
    '系列组-图4/4：延续“质感颂诗”主题。一张在美术馆或现代家居环境中的场景图，一个具有艺术气质的中国模特，她佩戴手串的手轻轻搭在旋转楼梯的扶手或一件极简设计感的家具上。模特的神情专注而有艺术感。摄影要求：强调人物与空间的互动，突出高级感，模拟室内自然光或美术馆的轨道灯光效。核心任务：请将用户上传的原始水晶手串作为主体进行高清重绘和精修，而不是简单地将其嵌入新背景。你需要重点提升水晶的通透感、光泽和内部纹理细节，确保其款式和颜色被忠实还原，使其质感超越原始图片。重要指令：生成的图片中绝对不能包含任何可识别的文字、logo或水印，务必保持画面的纯净。',
  ],
  oldMoney: [
    '系列组图1/4：为这张水晶手串生成一张小红书风格的“老钱风·静奢日常”产品主视觉。将用户上传的手串完整、自然地放在深棕胡桃木桌面或复古皮革托盘上，旁边只点缀一小块棕褐色人字纹粗花呢、一本打开但文字完全不可辨认的艺术画册和一只简洁银色戒指。构图为高级杂志平铺与轻微俯拍结合，保留克制留白，配色为咖啡棕、烟灰、象牙白和深黑。摄影要求：柔和窗边侧光、真实材质、浅景深、低饱和暖调、细腻胶片颗粒，呈现90年代欧洲珠宝编辑与quiet luxury气质。核心任务：用户原始手串是唯一主体，必须严格保持珠子数量、排列、颜色、尺寸、吊坠和金属结构，只提升水晶通透感、光泽和内部纹理，尺寸必须符合真实首饰比例。生成图片中绝对不能出现任何可识别文字、品牌logo或水印。',
    '系列组图2/4：延续“老钱风·静奢日常”主题。一张手腕与手部近景，一位中国女性坐在高级汽车的深色座椅中，佩戴手串的手自然搭在打开的时尚画册上。她穿棕褐色人字纹粗花呢西装，内搭灰色羊绒针织，搭配一枚克制银戒；手腕纤细，手掌窄而修长，手指细长但不过度夸张，骨节、指甲、肌腱和皮肤纹理真实自然，裸色短甲干净精致。车窗午后侧光柔和照亮手背、水晶和羊毛纹理。摄影要求：真实手机随拍、近距离抓拍、浅景深、低饱和暖棕灰、轻微胶片颗粒，避免塑料皮肤和僵硬摆拍。核心任务：必须忠实保留用户原始手串的珠子数量、顺序、颜色、材质、吊坠和连接结构，手串自然贴合纤细手腕且松紧合理。手部必须为正常五指，比例准确，不得出现粗壮手掌、多余手指、畸形关节、粘连或重复首饰。图片中禁止可识别文字、logo和水印。',
    '系列组图3/4：延续“老钱风·静奢日常”主题。一张有完整人物氛围的半身时尚场景图，一位身形纤细、气质知性的中国女性模特坐在老牌酒店休息室或安静私人图书馆的皮质扶手椅中，身穿剪裁考究的驼色粗花呢西装、灰色羊绒衫和深色长裙。她侧身翻阅一本艺术画册，佩戴手串的手自然停在书页上，人物表情松弛、不直视镜头；手腕纤细，手指修长，骨节自然，皮肤保留真实纹理。环境有深色木饰面、羊毛地毯和柔和窗光，但不出现明显奢侈品牌。摄影要求：中景构图、90年代欧洲时尚杂志编辑感、真实自然光、低饱和暖棕灰、细腻颗粒，人物、服装和空间完整呈现，同时让手串保持清晰可见。核心任务：严格忠实还原用户原始手串的全部产品细节和真实尺寸，手部五指与人体比例准确，不得变形。生成图片中禁止任何可识别文字、logo或水印。',
    '系列组图4/4：延续“老钱风·静奢日常”主题。一张更宽松的生活方式场景抓拍，一位纤细的中国女性模特从古典酒店门廊或安静街角咖啡馆走出，穿驼色长款大衣、灰色针织和深色皮鞋，一只手轻握结构简洁的皮革手袋，佩戴用户手串的另一只手自然抬起整理袖口或发丝。画面能看到人物半身至膝部和周围建筑环境，手串在自然动作中清晰但不过度放大；模特的手腕纤细，手掌窄，手指修长，骨节和皮肤纹理真实。摄影要求：真实街拍、午后柔光、低饱和咖啡棕与烟灰色、轻微动态感和胶片颗粒，呈现含蓄昂贵、松弛且生活化的old money气质。核心任务：忠实保持用户原始手串的珠子数量、排列、颜色、吊坠、连接结构和真实尺寸，不得重新设计产品。人体和手部必须自然准确，无多余手指、畸形、粘连或塑料感。图片中禁止任何文字、品牌logo和水印。',
  ],
  creamJewelry: [
    '系列组图1/4：为这张水晶手串生成一张小红书风格的“奶油珠宝画册”产品主视觉。用户上传的水晶手串以完整环形悬浮在画面中央，使用极细、几乎不可见的透明线从上方轻轻吊起，保持自然重力感和真实圆弧，背景为无接缝的暖灰橄榄到奶咖色柔和渐变。画面只出现手串本身，不出现人物和多余道具，保留大量干净留白。摄影要求：高端珠宝目录微距摄影、柔和漫射侧光、低对比奶油色调、浅景深，清晰呈现每颗水晶的透明度、冰裂、棉絮、猫眼或纹理以及金属配件的细腻反光，质感安静、温柔、克制，带有法式独立珠宝画册氛围。核心任务：严格忠实还原用户原始手串的珠子数量、大小、形状、排列、颜色、吊坠和连接结构，不得新增大珠、替换配珠或改变设计，只允许提升清晰度、通透感、光泽和内部纹理。透明吊线不得穿过或破坏珠子结构。生成图片中禁止任何可识别文字、logo、品牌名、边框或水印。',
    '系列组图2/4：延续“奶油珠宝画册”主题。一张真实佩戴状态的手腕微距近景，一位手腕纤细、手指修长的中国女性穿象牙白半透明薄针织袖口，用户上传的水晶手串闭合环绕在腕关节附近，手腕完整穿过手串内圈，珠子沿手腕四周自然分布并轻贴皮肤，松紧舒适。她的手自然抬起靠近暖灰橄榄与奶咖色渐变背景，手指姿态放松，指甲为干净的裸粉半透明短甲。摄影要求：竖版高端珠宝lookbook、微距近景、柔和窗边漫射光、低饱和奶油调、浅景深和细腻空气感，重点表现水晶通透高光、内部纹理、真实皮肤与针织纤维的柔软对比。核心任务：完整保留用户原始手串的珠子数量、顺序、大小、颜色、造型、吊坠和金属结构，真实贴合手腕，不得把手串平铺或搭放在前臂、手背、掌心或手指上，不得让完整圆环暴露在手臂表面。手部必须为正常五指，结构准确自然，无多余手指、畸形或粘连。图片中绝对不能出现文字、logo、品牌标识和水印。',
    '系列组图3/4：延续“奶油珠宝画册”主题。一张有模特的半身生活方式图，一位气质温柔、身形纤细的中国女性模特坐在阳光柔和的奶油色咖啡馆或极简工作室窗边，穿象牙白薄针织开衫与香槟色真丝吊带。她一手轻托下颚，佩戴用户手串的另一只手自然搭在浅木桌面或奶油色书册旁，完整面部与上半身自然入镜，表情松弛，不刻意展示产品。空间采用暖灰橄榄、奶咖、象牙白配色，窗边漫射光照亮皮肤、针织和水晶。摄影要求：中景、法式独立珠宝lookbook、低对比奶油调、浅景深、真实肤质和轻微胶片颗粒，既有人物氛围又能清晰看见手串。核心任务：严格保持用户原始手串的珠子数量、顺序、大小、颜色、吊坠和金属结构，真实贴合手腕，不得放大或改造成其他首饰。人物和手部比例必须自然，无多余手指或畸形。图片中禁止可识别文字、logo和水印。',
    '系列组图4/4：延续“奶油珠宝画册”主题。一张更完整的生活场景图，同一位中国女性模特置身于暖灰橄榄与奶咖色的简约珠宝工作室或安静画廊中，身穿象牙白针织上衣和柔软浅色长裙，正站在浅木展示桌前整理一束白色花材、翻看无文字的设计册或端起奶油色咖啡杯。佩戴用户手串的手臂自然伸入柔和侧光中，手串清晰可见但保持真实比例；画面包含人物半身至膝部、桌面和空间背景，形成有故事感的环境构图。摄影要求：竖版时尚编辑场景、柔和窗光、低饱和奶油暖调、大面积留白、浅景深和细腻空气感，整体温柔、诗意、生活化，不是单纯产品棚拍。核心任务：忠实还原用户原始手串的每颗珠子、排列、颜色、尺寸、吊坠和连接结构，不得复制、增删或改造产品。人体与手部必须准确自然，避免塑料感、变形和多余肢体。图片中禁止任何可识别文字、品牌logo和水印。',
  ],
};

// 随机灵感：开启后给每条图片 prompt 追加一条随机摄影/艺术风格 seed。
export const XIAOHONGSHU_STYLE_SEEDS: string[] = [
  '摄影风格：使用索尼A7M4相机，搭配85mm F1.4 G-Master镜头拍摄，营造出电影感和空气切割感。',
  '摄影风格：模拟富士相机色彩，带有经典的胶片颗粒感，色调温暖复古。',
  '摄影风格：90年代复古CCD相机风格，带有轻微的噪点和柔光效果，氛围感十足。',
  '摄影风格：使用闪光灯直射，营造高对比度、锐利、情绪化的“侵入式”时尚感。',
  '摄影风格：低饱和度、低对比度的“莫兰迪”色系，画面高级、宁静，有油画质感。',
  '艺术风格：ins风奶油色调，画面干净明亮，带有温柔的ins博主氛围。',
  '艺术风格：日系杂志感，构图干净，留白巧妙，光线柔和，色调清新通透。',
  '艺术风格：利用光影，在画面中创造出斑驳、戏剧性的光斑或条纹，增强故事感。',
  '艺术风格：韩系简约风，背景干净，色彩柔和，突出人物的清冷或温柔气质。',
  '艺术风格：侘寂美学(Wabi-sabi)，画面带有不完美、质朴的质感，如微水泥背景、枯枝道具等。',
  '艺术风格：空灵梦幻感，使用柔焦和轻微的光晕效果，营造出仙气飘飘的氛围。',
  '摄影风格：黄金时刻（Golden Hour）拍摄，光线温暖、柔和，影子被拉长，为画面增添一层金色滤镜。',
  '艺术风格：暗黑学院风（Dark Academia），背景为深色木质、旧书、复古道具，色调沉稳，充满知性与神秘感。',
  '摄影风格：利用棱镜在镜头前制造出彩虹光斑或扭曲的视觉效果，增加画面的艺术性和独特性。',
  '艺术风格：中式古典美学，搭配丝绸、陶瓷、水墨画等元素，构图讲究意境和留白。',
  '摄影风格：微距特写，极度放大水晶的内部冰裂、棉絮和彩虹光，展现其微观世界的细节之美。',
  '艺术风格：赛博朋克霓虹光感，背景是城市的霓虹灯或LED光绘，色调以蓝、紫、粉为主，充满未来感。',
  '艺术风格：田园风（Cottagecore），在野餐垫、草地、野花等自然元素中展示，氛围舒适、惬意、回归自然。',
];

// 文案合规硬性约束：禁止诱导互动、导流或交易话术。
const CONTENT_COMPLIANCE_REQUIREMENT =
  '文案合规硬性要求：只做水晶审美、材质、寓意和穿搭分享，禁止任何诱导互动、导流或交易话术。正文和标题中不得出现或变相表达“私信我、私聊、评论区留言、扣1、关注我、点赞、收藏、转发、加微信、联系方式、点击主页、点击链接、戳我、找我、咨询我、下单、购买、抢购、限时、仅剩名额”等内容；不得引导用户通过任何渠道联系、互动或购买。结尾自然收束，不设置行动号召。';

// 诱导交易词，命中后从标题/正文/话题中剥离。
const INDUCEMENT_TERMS = '私信|私聊|评论区|留言|扣1|扣一|关注我|关注|点赞|收藏|转发|加微信|微信|联系方式|联系我|点击主页|主页链接|点击链接|戳我|找我|咨询我|下单|购买|抢购|限时|仅剩|名额|DM';

// 全局真实比例约束：每条图片 prompt 末尾追加，强反 AI 伪影。
const PRODUCT_SCALE_REQUIREMENT =
  '全局真实比例约束：必须以用户上传图片中的手串实际尺寸为基准，严格保持珠径、主珠、吊坠、配件与整条手串之间的原始比例。佩戴场景中，手串应自然贴合普通成年女性手腕，松紧适中，不悬空、不勒入皮肤。除非上传原图明确如此，禁止把普通珠子、主珠、吊坠或整条手串夸张放大，禁止生成项链大小、手镯粗细或超现实巨型珠子。产品与手、手腕、袖口和场景道具之间必须符合真实物理尺度和透视关系。人物佩戴硬性规则：凡画面中出现真人手部、手腕或手臂，手串必须以正常佩戴状态出现，闭合圆环完整环绕在腕关节附近，手腕明确从手串内圈穿过，珠子沿手腕四周自然分布并接触皮肤；严禁把完整手串平铺、套放、搭放或悬浮在前臂表面、手背、掌心或手指上，严禁让手串仅压在皮肤上而没有环绕手腕，严禁把手串当作手持道具。若原场景描述为手持展示，应自动改为佩戴后的手腕近景。只有完全不出现人物肢体的纯产品静物图或悬挂产品图，才允许手串脱离手腕展示。';

// hashtags 为空时的兜底话题，按图片风格给出。
const hashtagBank: Record<ImageStyle, string[]> = {
  scene: ['#水晶手串', '#小红书图文', '#高级感配饰', '#水晶美学', '#氛围感拍照'],
  ootd: ['#今日穿搭', '#手串搭配', '#显白饰品', '#配饰分享', '#通勤穿搭'],
  natural: ['#能量水晶', '#疗愈日常', '#自然系饰品', '#松弛感', '#水晶能量'],
  minimalist: ['#极简穿搭', '#质感配饰', '#通勤首饰', '#高级感拍摄', '#小众设计'],
  oldMoney: ['#老钱风', '#静奢日常', '#高级感配饰', '#低调贵气', '#水晶手串'],
  creamJewelry: ['#奶油珠宝', '#温柔系配饰', '#法式氛围', '#珠宝画册', '#水晶手串'],
};

interface GeneratePostInput {
  imageFile: File;
  textStyle: TextStyle;
  prompts: string[];
  useRandomInspiration: boolean;
  // 仅用于 hashtags 为空时的兜底。
  imageStyle: ImageStyle;
}

interface ImagePart {
  inlineData: { mimeType: string; data: string };
}

function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('图片读取失败'));
    reader.onload = () => resolve(String(reader.result));
    reader.readAsDataURL(file);
  });
}

function stripDataUrl(dataUrl: string) {
  const [, meta = '', data = ''] = dataUrl.match(/^data:(.*?);base64,(.*)$/) ?? [];
  return { mimeType: meta || 'image/png', base64: data || dataUrl };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

function isRetryableError(error: unknown): boolean {
  return RETRYABLE_ERROR_PATTERN.test(normalizeErrorMessage(error));
}

function toUserFriendlyError(error: unknown): Error {
  const message = normalizeErrorMessage(error);
  if (/\b524\b|timeout|timed out/i.test(message)) {
    return new Error('请求超时（524），已自动重试多次仍失败，请稍后重试。');
  }
  return new Error(message || '请求失败，请稍后重试。');
}

async function executeWithRetry<T>(
  action: () => Promise<T>,
  maxAttempts: number,
  actionLabel: string,
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await action();
    } catch (error) {
      lastError = error;
      const retryable = isRetryableError(error);
      if (!retryable || attempt === maxAttempts) {
        console.error(`${actionLabel} failed after ${attempt} attempt(s).`, error);
        throw toUserFriendlyError(error);
      }

      const backoffMs = Math.min(1200 * 2 ** (attempt - 1), 6000);
      const jitterMs = Math.floor(Math.random() * 350);
      await sleep(backoffMs + jitterMs);
    }
  }

  throw toUserFriendlyError(lastError);
}

// 组装最终图片 prompts：每条追加真实比例约束，开启随机灵感时再追加随机 seed。
function buildImagePrompts(input: GeneratePostInput): string[] {
  const prompts = input.prompts.slice(0, 4);
  let finalPrompts = prompts.map((prompt) => `${prompt}。${PRODUCT_SCALE_REQUIREMENT}`);
  if (input.useRandomInspiration) {
    const randomSeed =
      XIAOHONGSHU_STYLE_SEEDS[Math.floor(Math.random() * XIAOHONGSHU_STYLE_SEEDS.length)];
    finalPrompts = finalPrompts.map((prompt) => `${prompt}。重要附加要求：${randomSeed}`);
  }
  return finalPrompts;
}

async function generateText(imagePart: ImagePart, textStyle: TextStyle) {
  const livelyPrompt =
    '你是一位资深的小红书博主，专注于水晶手串的销售和推广。你的文案风格活泼、有吸引力，擅长使用emoji和热门话题标签。请根据用户上传的水晶手串图片，生成一篇完整的、引人注目的小红书图文内容。请严格按照JSON格式返回内容。';
  const healingPrompt =
    '你是一位资深的身心灵疗愈师和水晶能量专家。你的文案风格温柔、有深度，能引发读者的情感共鸣。请根据用户上传的水晶手串图片，从水晶的能量、寓意、疗愈功效等角度出发，撰写一篇走心的小红书图文内容，引导用户感受水晶带来的平静和治愈。请严格按照JSON格式返回内容。';

  const rolePrompt = textStyle === 'healing' ? healingPrompt : livelyPrompt;
  const systemText = `${rolePrompt}\n\n${CONTENT_COMPLIANCE_REQUIREMENT}\n\n请严格返回 JSON，字段必须为 title、body、hashtags。`;

  const responseSchema = {
    type: 'object',
    properties: {
      title: {
        type: 'string',
        description: '一个非常吸引人的小红书标题，要包含emoji表情符号, 长度在20字以内。',
      },
      body: {
        type: 'string',
        description:
          '小红书正文内容，分段清晰，段落间要有空行，多使用emoji来增加趣味性。需要突出图片中水晶的特点、寓意、适合人群和美感。内容要真诚，有感染力。',
      },
      hashtags: {
        type: 'array',
        items: { type: 'string' },
        description:
          '一个包含5到10个相关的小红书热门话题标签的数组，每个标签以#开头。例如：#水晶手串, #能量水晶, #疗愈, #每日穿搭, #提升能量。',
      },
    },
    required: ['title', 'body', 'hashtags'],
  };

  const request: GeminiGenerateRequest = {
    model: TEXT_MODEL,
    task: 'text_gen',
    systemInstruction: { parts: [{ text: systemText }] },
    contents: {
      role: 'user',
      parts: [
        { text: '请根据这张水晶手串图片生成一篇小红书图文内容，严格返回 JSON。' },
        { inlineData: imagePart.inlineData },
      ],
    },
    config: {
      responseMimeType: 'application/json',
      responseSchema,
    },
  };

  const response = await executeWithRetry(
    () => generateContent(request),
    2,
    'Text generation',
  );
  const jsonText = extractJsonTextFromResponse(response);
  const parsed = JSON.parse(jsonText);

  if (!parsed.title || !parsed.body || !Array.isArray(parsed.hashtags)) {
    throw new Error('API text response is missing required fields.');
  }

  // 诱导交易词清洗：标题剥离、正文按行过滤、话题过滤。
  const inducementPattern = new RegExp(INDUCEMENT_TERMS, 'i');
  const inducementGlobalPattern = new RegExp(INDUCEMENT_TERMS, 'gi');
  const sanitizedTitle = String(parsed.title)
    .replace(inducementGlobalPattern, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
  const sanitizedBody = String(parsed.body)
    .split(/\r?\n/)
    .filter((line) => !inducementPattern.test(line))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  const sanitizedHashtags = parsed.hashtags
    .map((tag: unknown) => `#${String(tag).trim().replace(/^#+/, '')}`)
    .filter((tag: string) => !inducementPattern.test(tag));

  return {
    title: sanitizedTitle || '水晶手串的温柔光泽 ✨',
    body: sanitizedBody,
    hashtags: sanitizedHashtags,
  };
}

async function generateImages(imagePart: ImagePart, fullPrompts: string[]): Promise<string[]> {
  const results = await Promise.all(
    fullPrompts.map(async (prompt) => {
      try {
        const request: GeminiGenerateRequest = {
          model: IMAGE_MODEL,
          task: 'image_gen',
          contents: {
            parts: [{ text: prompt }, { inlineData: imagePart.inlineData }],
          },
          config: {
            imageConfig: {
              aspectRatio: '3:4',
            },
          },
        };

        const response = await executeWithRetry(
          () => generateContent(request),
          3,
          `Image generation (${prompt.substring(0, 24)}...)`,
        );
        const image = extractImageFromResponse(response);
        if (!image) {
          throw new Error('图片接口没有返回图片数据');
        }
        return image;
      } catch (error) {
        console.error(
          `Image generation failed for prompt: "${prompt.substring(0, 50)}..."`,
          error,
        );
        return null;
      }
    }),
  );

  const successfulImages = results.filter((img): img is string => img !== null);
  if (successfulImages.length === 0 && fullPrompts.length > 0) {
    throw new Error('所有图片生成尝试均失败，无法生成任何内容。');
  }

  // 不足 4 张时用已成功图片补齐，保证界面始终展示 4 张。
  const finalImages: string[] = [...successfulImages];
  while (finalImages.length > 0 && finalImages.length < 4) {
    finalImages.push(finalImages[finalImages.length % successfulImages.length]);
  }

  return finalImages;
}

export async function generateAiPost(input: GeneratePostInput): Promise<XiaohongshuPost> {
  const imageDataUrl = await fileToDataUrl(input.imageFile);
  const { mimeType, base64 } = stripDataUrl(imageDataUrl);
  const imagePart: ImagePart = { inlineData: { mimeType, data: base64 } };

  const fullPrompts = buildImagePrompts(input);

  // 文案与图片并行：文案只看用户上传的原图，不依赖生成图。
  const [text, images] = await Promise.all([
    generateText(imagePart, input.textStyle),
    generateImages(imagePart, fullPrompts),
  ]);

  const hashtags = text.hashtags.length > 0
    ? text.hashtags
    : [...hashtagBank[input.imageStyle], '#水晶饰品'];

  return {
    title: text.title,
    body: text.body,
    hashtags,
    images,
    prompts: fullPrompts,
    mode: '1k',
    createdAt: new Date().toISOString(),
  };
}
