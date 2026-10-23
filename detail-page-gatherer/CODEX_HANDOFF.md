# 给接手 Codex 的项目交接说明

请先认真读完这份文档。你的使用者可能没有很多开发经验，所以你需要耐心、具体、一步一步解释，不要默认对方知道 Python、虚拟环境、端口、Chrome 调试端口、淘宝登录态这些概念。

这个项目当前是一个淘宝商品主图、详情页、评价、竞品页面采集与报告草稿生成工具。它还不是一个完全成熟的商业产品，但已经可以作为 MVP 使用和继续开发。

## 1. 对接手 Codex 的工作方式要求

- 请使用中文和使用者沟通。
- 每次改代码前，先说明你要改什么、为什么改。
- 对非技术使用者，不要只说“运行脚本”，要给出完整命令和预期现象。
- 遇到错误时，不要让使用者自己猜。请先判断错误属于：依赖问题、端口问题、Chrome 连接问题、淘宝风控/登录问题、页面结构变化问题，逐项排查。
- 不要轻易删除 `output/` 里的结果，除非使用者明确要求。
- 不要把 `storage/taobao_state.json` 发给别人。它是淘宝登录态，可能包含账号 cookie。
- 不要建议使用无头浏览器长期抓淘宝。淘宝风控比较敏感，推荐连接使用者自己的 Chrome。
- 如果使用者说“卡住了”，先判断是脚本在等待输入、浏览器没有启动、端口被占用，还是淘宝页面加载慢。

## 2. 项目目标

用户最初需求：

1. 根据客户产品链接和行业/关键词，抓取行业 Top 3 竞品。
2. 抓取客户和竞品的主图、详情页截图、评价内容。
3. 分析主图和详情页的框架、结构、视觉表现方式。
4. 根据视觉和页面结构推断目标客群。
5. 对比客户产品与竞品，生成可以优化的完整策划方案。

当前项目已做到：

- 有一个本地 WebUI。
- 可以填写客户链接、行业、关键词、品牌、价格区间和备注。
- 可以手动填写 Top 3 竞品链接，也可以留空让系统从淘宝搜索页获取。
- 推荐连接使用者自己的 Chrome 浏览器进行采集。
- 可以输出：
  - 首屏截图。
  - 详情页分段截图。
  - 评价区分段截图。
  - 评价文本 txt。
  - 页面 HTML 留档。
  - `snapshots.json` 结构化结果。
  - `report.md` 报告草稿。

当前还没做到：

- 没有真正调用大模型做最终策划方案。
- 没有把截图自动送入视觉模型分析。
- 没有 Word/PDF 导出。
- 没有完整的错误提示 UI。
- 没有多平台适配，目前只针对淘宝。
- 淘宝页面结构变化时，选择器仍可能需要调整。

## 3. 重要隐私和打包注意事项

如果要把项目发给同事，请不要打包这些内容：

- `.venv/`
- `storage/taobao_state.json`
- `output/`
- `__pycache__/`
- `scripts/__pycache__/`

原因：

- `.venv/` 很大，而且不同电脑环境可能不兼容。
- `storage/taobao_state.json` 是登录态，不能共享。
- `output/` 是历史抓取结果，可能包含客户链接、商品截图、评价内容。
- `__pycache__/` 是 Python 缓存，没有价值。

建议打包这些内容：

- `app.py`
- `requirements.txt`
- `README.md`
- `CODEX_HANDOFF.md`
- `input_template.csv`
- `run_webui.bat`
- `login_taobao.bat`
- `start_chrome_for_taobao.bat`
- `start_chrome_for_taobao.ps1`
- `scripts/`
- `web/`
- `需求方案.md`

## 4. 项目文件说明

### 根目录

- `app.py`
  - 本地 WebUI 后端。
  - 默认端口：`9898`。
  - 负责接收 WebUI 表单，写入临时 CSV，后台调用抓取脚本。
  - 会优先使用 `.venv\Scripts\python.exe`，避免全局 Python 没有 Playwright 的问题。

- `run_webui.bat`
  - 启动 WebUI。
  - 当前固定端口：`9898`。
  - 内容大致是：

```bat
set PORT=9898
.venv\Scripts\python.exe app.py
```

- `start_chrome_for_taobao.bat`
  - 调用 PowerShell 脚本，启动带远程调试端口的 Chrome。

- `start_chrome_for_taobao.ps1`
  - 查找 Chrome 安装路径。
  - 以 `--remote-debugging-port=9222` 启动 Chrome。
  - 打开淘宝首页。
  - 如果 Chrome 已经开着但没有调试端口，可能需要先关闭所有 Chrome 窗口再运行。

- `run_webui_mac.sh`
  - macOS 启动 WebUI 的脚本。
  - 固定端口：`9898`。
  - 使用 `.venv/bin/python app.py`。

- `start_chrome_for_taobao_mac.sh`
  - macOS 启动可连接 Chrome 的脚本。
  - 使用 `open -na "Google Chrome" --args --remote-debugging-port=9222 ...`。
  - 打开淘宝首页。

- `login_taobao.bat`
  - 使用 Playwright 托管 Chromium 保存淘宝登录态。
  - 当前不推荐优先使用这个方式。更推荐连接使用者自己的 Chrome。

- `requirements.txt`
  - 当前只依赖：

```text
playwright>=1.44.0
```

- `input_template.csv`
  - 命令行模式输入模板。
  - WebUI 会自动生成临时 input，不一定需要手动编辑。

- `README.md`
  - 面向普通使用者的简版说明。

- `需求方案.md`
  - 最早整理的业务方案、分析维度和 AI 提示词。

### scripts/

- `scripts/run_taobao_analysis.py`
  - 核心采集脚本。
  - 支持两种浏览器模式：
    - `managed`：Playwright 自己打开 Chromium，可使用 `storage/taobao_state.json`。
    - `chrome`：连接使用者自己的 Chrome，推荐。
  - 支持参数：

```powershell
.venv\Scripts\python.exe scripts\run_taobao_analysis.py --input input_template.csv --limit 3 --browser-mode chrome --cdp-url http://127.0.0.1:9222
```

- `scripts/save_taobao_state.py`
  - 打开 Playwright Chromium，手动登录淘宝后保存登录态到 `storage/taobao_state.json`。

### web/

- `web/index.html`
  - WebUI 页面结构。

- `web/styles.css`
  - WebUI 样式。

- `web/app.js`
  - 表单提交、任务轮询、报告预览。

### output/

输出目录。每次运行会生成带时间戳的新目录，例如：

```text
output/1-日用家居-洗脸巾-20260601-220731/
```

目录里一般有：

```text
report.md
snapshots.json
screenshots/
raw/
reviews/
```

- `screenshots/`
  - `*-top.png`：商品首屏截图。
  - `*-detail-01.png` 到 `*-detail-08.png`：详情页分段截图。
  - `*-reviews-01.png` 到 `*-reviews-03.png`：评价区分段截图。

- `reviews/`
  - `*-reviews.txt`：评价文本。

- `raw/`
  - `*.html`：页面 HTML 留档。
  - `*-reviews.html`：评价区加载后的 HTML 留档。
  - 注意：淘宝 HTML 单独打开不一定能看到评价，这是正常的，因为评价依赖登录态和接口渲染。

## 5. 首次安装和启动流程

请一步一步带使用者做。

如果接手同事是 macOS，请优先看 `第 5.6 节：macOS 专门流程`。Windows 的 `.bat` 和 `.ps1` 在 Mac 上不能直接运行。

### 5.1 创建虚拟环境

在项目根目录运行：

```powershell
python -m venv .venv
```

如果系统 Python 是 uv 管理的，可能会遇到权限问题。可以让 Codex 使用可用的 Python 创建 `.venv`，但最终项目运行时应使用：

```powershell
.venv\Scripts\python.exe
```

### 5.2 安装依赖

```powershell
.venv\Scripts\python.exe -m pip install -r requirements.txt
```

### 5.3 安装 Playwright 浏览器

```powershell
.venv\Scripts\python.exe -m playwright install chromium
```

### 5.4 启动自己的 Chrome

推荐方式：

```powershell
.\start_chrome_for_taobao.bat
```

预期现象：

- 会打开 Chrome。
- 地址栏打开淘宝。
- 使用者需要在 Chrome 里登录淘宝。
- 登录完成后不要关闭这个 Chrome。

如果 WebUI 后续连接失败，请提醒使用者：

1. 关闭所有 Chrome 窗口。
2. 重新运行 `.\start_chrome_for_taobao.bat`。
3. 再登录淘宝。

### 5.5 启动 WebUI

```powershell
.\run_webui.bat
```

然后打开：

```text
http://127.0.0.1:9898
```

### 5.6 macOS 专门流程

同事是 Mac 电脑时，请按下面流程操作。注意：Mac 终端命令和 Windows 不一样，不能使用 `.bat`。

第一步，打开 Terminal，进入项目目录。比如项目放在桌面：

```bash
cd ~/Desktop/详情页抓取
```

如果路径不确定，请让使用者把项目文件夹拖进 Terminal，Terminal 会自动填入路径。

第二步，创建虚拟环境：

```bash
python3 -m venv .venv
```

第三步，安装依赖：

```bash
.venv/bin/python -m pip install -r requirements.txt
```

第四步，安装 Playwright Chromium：

```bash
.venv/bin/python -m playwright install chromium
```

第五步，给 macOS 脚本执行权限：

```bash
chmod +x run_webui_mac.sh start_chrome_for_taobao_mac.sh
```

第六步，启动可连接的 Chrome：

```bash
./start_chrome_for_taobao_mac.sh
```

预期现象：

- Chrome 会打开淘宝。
- 使用者需要在 Chrome 里登录淘宝。
- 登录后不要关闭这个 Chrome。

第七步，启动 WebUI：

```bash
./run_webui_mac.sh
```

第八步，在浏览器打开：

```text
http://127.0.0.1:9898
```

WebUI 中保持：

```text
浏览器模式：连接我的 Chrome
Chrome 调试地址：http://127.0.0.1:9222
```

如果 Mac 上提示脚本没有权限，运行：

```bash
chmod +x run_webui_mac.sh start_chrome_for_taobao_mac.sh
```

如果 Mac 上提示找不到 Chrome，请确认已经安装 Google Chrome，并且它在：

```text
/Applications/Google Chrome.app
```

如果 Mac 上 `9222` 连接失败，请让使用者：

1. 退出所有 Chrome 窗口。
2. 再运行：

```bash
./start_chrome_for_taobao_mac.sh
```

3. 登录淘宝。
4. 回到 WebUI 重新运行任务。

## 6. WebUI 使用流程

1. 填写客户产品链接。
2. 填写行业/品类，例如：日用家居。
3. 填写搜索关键词，例如：洗脸巾。
4. 填写品牌名、目标市场、价格区间。
5. 浏览器模式选择：`连接我的 Chrome`。
6. Chrome 调试地址保持默认：

```text
http://127.0.0.1:9222
```

7. 竞品链接可以留空，也可以手动填写。
8. 点击“开始抓取分析”。
9. 等待右侧运行日志完成。
10. 查看 `report.md` 和 `output/` 目录里的截图。

## 7. 常见问题和排查方法

### 问题：WebUI 打不开

检查端口：

```powershell
netstat -ano | Select-String ":9898"
```

如果没有监听，运行：

```powershell
.\run_webui.bat
```

如果端口被占用，可以临时换端口：

```powershell
$env:PORT=9900
.venv\Scripts\python.exe app.py
```

然后访问：

```text
http://127.0.0.1:9900
```

### 问题：No module named playwright

说明当前运行 WebUI 或脚本的 Python 不是 `.venv`。

请确认：

```powershell
.venv\Scripts\python.exe -m pip show playwright
```

如果没有：

```powershell
.venv\Scripts\python.exe -m pip install -r requirements.txt
```

### 问题：连接 Chrome 失败

先检查：

```powershell
Invoke-WebRequest -UseBasicParsing http://127.0.0.1:9222/json/version
```

如果没有返回 JSON，说明 Chrome 没有以调试端口启动。

处理方法：

1. 关闭所有 Chrome。
2. 运行：

```powershell
.\start_chrome_for_taobao.bat
```

3. 在新打开的 Chrome 中登录淘宝。
4. WebUI 里保持 `连接我的 Chrome`。

### 问题：淘宝要求登录或页面异常

淘宝风控正常存在。请不要频繁高并发抓取。

建议：

- 使用自己的 Chrome。
- 降低抓取频率。
- 一次只跑少量产品。
- 必要时手动提供竞品链接，不让系统搜索。

### 问题：HTML 打开看不到评价

这是正常现象。

淘宝评价内容依赖登录态、接口和页面运行时 JS。单独保存 HTML 后不一定能重新渲染评价。

正确查看方式：

- 看 `screenshots/*-reviews-*.png`。
- 看 `reviews/*-reviews.txt`。
- `raw/*-reviews.html` 只是留档，不是主要交付物。

### 问题：详情页截图不对

淘宝页面结构会变化，可能是 tab 文案或 DOM 结构变了。

重点检查 `scripts/run_taobao_analysis.py` 里的这些函数：

- `prepare_detail_area`
- `prepare_review_area`
- `click_by_text`
- `capture_scrolled_sections`

如果“图文详情”点击不到，优先改 `prepare_detail_area` 里的匹配文本。

## 8. 当前实现细节

### 浏览器模式

`managed`：

- Playwright 自己开 Chromium。
- 可以用 `storage/taobao_state.json`。
- 缺点是更像自动化环境，淘宝可能更敏感。

`chrome`：

- 连接使用者自己的 Chrome。
- 推荐使用。
- 需要先运行 `start_chrome_for_taobao.bat`。
- 默认连接地址是 `http://127.0.0.1:9222`。

### 采集逻辑

对每个商品链接：

1. 打开商品页。
2. 截首屏。
3. 点击 `图文详情`。
4. 滚动并截取多段详情页截图。
5. 点击 `用户评价`。
6. 滚动并截取多段评价截图。
7. 提取评价文本。
8. 提取图片 URL。
9. 写入结构化 JSON 和 Markdown 报告。

### 竞品 Top 3 逻辑

如果用户手动填写竞品链接，则优先使用手动链接。

如果留空，则打开：

```text
https://s.taobao.com/search?q=关键词
```

然后抓取搜索结果里的淘宝/天猫商品链接。

注意：淘宝搜索页可能被风控、登录、个性化推荐影响。商业使用时，建议支持“手动指定竞品链接”作为主流程。

## 9. 后续开发建议

建议按优先级推进。

### 优先级 1：提升交付质量

- 在 WebUI 中展示截图缩略图。
- 把 `report.md` 里的截图路径转成可点击链接或直接预览。
- 把评价文本做去重和分条，不要大段合并。
- 对每个产品生成独立的结构化分析块。

### 优先级 2：接入 AI 分析

当前只是生成报告草稿。下一步应接入大模型：

- 读取 `snapshots.json`。
- 读取 `reviews/*.txt`。
- 选取若干 `detail-*.png` 和 `top.png`。
- 让视觉模型分析：
  - 主图构图。
  - 色彩和风格。
  - 卖点呈现。
  - 详情页模块顺序。
  - 客群推断。

建议输出：

- 行业页面共性规律。
- Top 3 竞品亮点。
- 客户页面短板。
- 主图优化方案。
- 详情页模块重构。
- 文案和拍摄素材清单。

### 优先级 3：导出正式报告

可以增加：

- Markdown 到 Word。
- Markdown 到 PDF。
- 截图自动嵌入报告。
- 报告模板化。

### 优先级 4：多平台扩展

未来可以按适配器模式扩展：

```text
platforms/
  taobao.py
  tmall.py
  jd.py
  amazon.py
```

不要把所有平台逻辑继续堆在 `run_taobao_analysis.py` 里。

## 10. 对普通使用者的耐心说明模板

当使用者不会操作时，请这样解释：

```text
你不用理解所有技术细节，我们先按三个窗口来理解：

1. Chrome 窗口：负责登录淘宝和访问商品。
2. WebUI 页面：http://127.0.0.1:9898，负责填写任务和看结果。
3. 黑色命令窗口：负责保持服务运行，不要关。

如果某一步报错，你截图给我，我会判断是浏览器、端口还是淘宝页面的问题。
```

当使用者问“是不是卡住了”：

```text
先别急。我们看右侧日志最后一行是什么。
如果还在打开页面或截图，等一会儿。
如果出现 error，我会按日志里的第一条错误来修。
```

当使用者问“评价 HTML 为什么打不开”：

```text
这不是你操作错了。淘宝评价不是静态 HTML，单独打开 HTML 经常看不到。
我们主要看评价截图和 reviews.txt。
```

## 11. 交接时需要提醒同事

请提醒同事：

- 首次运行前要安装依赖。
- Mac 用户不能运行 `.bat`，要运行 `.sh`。
- Mac 用户首次运行 `.sh` 可能需要 `chmod +x` 授权。
- 不要共享淘宝登录态文件。
- 不要用无头模式大量抓淘宝。
- 先用一个客户链接测试，再跑完整 Top 3。
- 输出文件可能比较多，最终交付应优先看 `report.md`、`screenshots/`、`reviews/`。
- 如果要给客户看，不要直接给 raw HTML，应该整理成正式报告。

## 12. 当前端口

WebUI 当前默认端口是：

```text
9898
```

访问地址：

```text
http://127.0.0.1:9898
```

Chrome 调试端口是：

```text
9222
```

Chrome 调试地址：

```text
http://127.0.0.1:9222
```
