# 淘宝详情页竞品抓取分析 MVP

这个项目用于根据客户产品链接、行业和关键词，抓取淘宝 Top 3 竞品的主图与详情页素材，并整理成后续 AI 分析报告所需的数据包。

## 当前能力

- 读取 `input_template.csv`。
- 打开淘宝搜索页，提取自然搜索结果中的 Top 3 商品链接。
- 打开客户商品与竞品商品详情页。
- 保存页面截图、商品标题、价格、主图候选、详情页图片候选。
- 生成 Markdown 分析报告草稿，后续可接入视觉模型/大模型做深度分析。

## 安装依赖

Windows:

```powershell
python -m venv .venv
.venv\Scripts\python.exe -m pip install -r requirements.txt
.venv\Scripts\python.exe -m playwright install chromium
```

macOS:

```bash
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements.txt
.venv/bin/python -m playwright install chromium
```

## 第一次使用：保存淘宝登录态

淘宝通常需要登录态才能稳定访问详情页。先运行：

```powershell
.venv\Scripts\python.exe scripts\save_taobao_state.py
```

也可以直接双击/运行：

```powershell
login_taobao.bat
```

浏览器打开后，手动登录淘宝。登录成功后回到终端按回车，会保存到：

```text
storage/taobao_state.json
```

## 运行抓取

编辑 `input_template.csv`，填入客户产品链接、行业、关键词和平台：

```csv
client_product_url,industry,category_keyword,platform,brand_name,target_market,price_range,notes
https://item.taobao.com/item.htm?id=xxxx,宠物用品,猫窝,淘宝,客户品牌,中国大陆,50-150 RMB,关注年轻女性用户
```

然后运行：

```powershell
python scripts/run_taobao_analysis.py --input input_template.csv --limit 3
```

## 启动 WebUI

Windows:

```powershell
.\run_webui.bat
```

macOS:

```bash
chmod +x run_webui_mac.sh start_chrome_for_taobao_mac.sh
./run_webui_mac.sh
```

然后打开：

```text
http://127.0.0.1:9898
```

## 推荐：使用自己的 Chrome

淘宝不建议长期使用无头浏览器。更稳的方式是先启动一个可连接的 Chrome。

Windows:

```powershell
.\start_chrome_for_taobao.bat
```

macOS:

```bash
./start_chrome_for_taobao_mac.sh
```

在打开的 Chrome 里登录淘宝，然后回到 WebUI，浏览器模式选择：

```text
连接我的 Chrome
```

默认调试地址保持：

```text
http://127.0.0.1:9222
```

WebUI 支持：

- 填写客户产品链接、行业、关键词、品牌、价格区间和备注。
- 手动填写 Top 3 竞品链接；如果留空，会按关键词从淘宝搜索页抓取。
- 支持连接你自己的 Chrome 浏览器，减少淘宝异常登录和风控概率。
- 后台执行抓取任务并显示日志。
- 任务完成后直接预览 Markdown 报告草稿。

输出目录：

```text
output/
  案例ID/
    raw/
    screenshots/
    images/
    report.md
```

## 重要说明

- 淘宝页面结构经常变化，脚本使用了多组兜底选择器，仍可能需要按实际页面调整。
- 建议控制频率，不要高并发访问。
- 竞品图片和文案仅用于分析参考，不建议直接复制使用。
- 如果淘宝限制搜索页访问，可以人工把 Top 3 竞品链接补到输入表，后续脚本只分析详情页。
