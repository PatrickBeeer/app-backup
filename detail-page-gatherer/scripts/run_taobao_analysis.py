import argparse
import csv
import json
import re
import time
import urllib.request
from dataclasses import asdict, dataclass
from datetime import datetime
from pathlib import Path
from typing import Iterable
from urllib.parse import quote_plus

from playwright.sync_api import Browser, BrowserContext, Page, TimeoutError as PlaywrightTimeoutError, sync_playwright


STATE_PATH = Path("storage/taobao_state.json")
OUTPUT_ROOT = Path("output")


@dataclass
class ProductSnapshot:
    role: str
    url: str
    title: str
    price: str
    main_images: list[str]
    detail_images: list[str]
    top_screenshot: str
    detail_screenshots: list[str]
    review_screenshots: list[str]
    review_texts: list[str]
    html_path: str
    review_text_path: str


def clean_text(value: str | None) -> str:
    if not value:
        return ""
    return re.sub(r"\s+", " ", value).strip()


def safe_filename(value: str, fallback: str) -> str:
    name = re.sub(r"[^0-9A-Za-z\u4e00-\u9fff_-]+", "-", value).strip("-").lower()
    name = re.sub(r"-{2,}", "-", name)
    return name[:80] or fallback


def ensure_url(url: str) -> str:
    if url.startswith("//"):
        return "https:" + url
    if url.startswith("http"):
        return url
    return ""


def extract_image_urls(html: str) -> list[str]:
    urls: list[str] = []
    pattern = r"""(?:src|data-src|data-ks-lazyload|data-lazyload)=["']([^"']+)["']"""
    for match in re.finditer(pattern, html, flags=re.IGNORECASE):
        src = ensure_url(match.group(1))
        if src and src not in urls:
            urls.append(src)
    return urls


def first_text(page: Page, selectors: Iterable[str]) -> str:
    for selector in selectors:
        try:
            text = page.locator(selector).first.text_content(timeout=1800)
            text = clean_text(text)
            if text:
                return text
        except PlaywrightTimeoutError:
            continue
        except Exception:
            continue
    return ""


def page_title(page: Page) -> str:
    fallback = clean_text(page.title())
    fallback = re.sub(r"[-_].*$", "", fallback).strip()

    title = first_text(
        page,
        [
            "[class*='ItemTitle']",
            "[class*='MainTitle']",
            ".tb-main-title",
            ".tb-detail-hd h1",
            "h1",
        ],
    )
    bad_title = title in {"用户评价", "商品详情", "宝贝详情", "详情", "评价"} or title.startswith("用户评价")
    if title and not bad_title:
        return title

    return fallback


def goto_with_wait(page: Page, url: str) -> None:
    page.goto(url, wait_until="domcontentloaded", timeout=60000)
    page.wait_for_timeout(2500)
    try:
        page.wait_for_load_state("networkidle", timeout=8000)
    except PlaywrightTimeoutError:
        pass


def click_by_text(page: Page, patterns: list[str]) -> bool:
    for pattern in patterns:
        exact_text = pattern.replace("^", "").replace("$", "").replace("\\", "")
        try:
            locator = page.get_by_text(exact_text, exact=True).first
            if locator.count() > 0:
                locator.scroll_into_view_if_needed(timeout=1800)
                locator.click(timeout=2200)
                page.wait_for_timeout(1800)
                return True
        except Exception:
            pass

    script = """
    (patterns) => {
      const regexes = patterns.map((item) => new RegExp(item));
      const elements = [...document.querySelectorAll('a, button, div, span, li')];
      for (const el of elements) {
        const text = (el.innerText || el.textContent || '').trim();
        if (!text || text.length > 40) continue;
        if (regexes.some((regex) => regex.test(text))) {
          el.scrollIntoView({ block: 'center', inline: 'center' });
          el.click();
          return text;
        }
      }
      return '';
    }
    """
    try:
        clicked = page.evaluate(script, patterns)
        if clicked:
            page.wait_for_timeout(1800)
            return True
    except Exception:
        return False
    return False


def scroll_to_top(page: Page) -> None:
    page.evaluate("window.scrollTo(0, 0)")
    page.wait_for_timeout(800)


def capture_viewport(page: Page, path: Path) -> str:
    path.parent.mkdir(parents=True, exist_ok=True)
    page.screenshot(path=str(path), full_page=False)
    return str(path)


def capture_scrolled_sections(page: Page, screenshot_dir: Path, base: str, prefix: str, steps: int = 6) -> list[str]:
    paths: list[str] = []
    last_y = -1
    for idx in range(steps):
        page.wait_for_timeout(900)
        path = screenshot_dir / f"{base}-{prefix}-{idx + 1:02d}.png"
        paths.append(capture_viewport(page, path))
        page.evaluate("window.scrollBy(0, Math.floor(window.innerHeight * 0.82))")
        page.wait_for_timeout(1200)
        y = page.evaluate("Math.round(window.scrollY)")
        if y == last_y:
            break
        last_y = y
    return paths


def prepare_detail_area(page: Page) -> None:
    clicked = click_by_text(page, [r"图文详情", r"商品详情", r"宝贝详情"])
    if not clicked:
        page.evaluate("window.scrollTo(0, Math.floor(document.body.scrollHeight * 0.32))")
        page.wait_for_timeout(1600)


def prepare_review_area(page: Page) -> None:
    clicked = click_by_text(page, [r"用户评价", r"累计评价", r"评价"])
    if not clicked:
        page.evaluate("window.scrollTo(0, Math.floor(document.body.scrollHeight * 0.18))")
        page.wait_for_timeout(1200)
        click_by_text(page, [r"用户评价", r"累计评价", r"评价"])
    page.wait_for_timeout(2200)


def extract_review_texts(page: Page) -> list[str]:
    script = """
    () => {
      const visible = (el) => {
        const rect = el.getBoundingClientRect();
        const style = window.getComputedStyle(el);
        return rect.width > 20 && rect.height > 8 && style.visibility !== 'hidden' && style.display !== 'none';
      };
      const nodes = [...document.querySelectorAll('div, span, p, li')];
      const texts = [];
      for (const node of nodes) {
        if (!visible(node)) continue;
        const text = (node.innerText || node.textContent || '').replace(/\\s+/g, ' ').trim();
        if (text.length < 12 || text.length > 260) continue;
        if (/评价|追评|有图|规格|颜色|尺寸|质量|物流|客服|好用|满意|舒服|刷|毛|洗澡|收到|购买|回购/.test(text)) {
          if (!texts.includes(text)) texts.push(text);
        }
        if (texts.length >= 40) break;
      }
      return texts;
    }
    """
    try:
        return page.evaluate(script)
    except Exception:
        return []


def extract_page_images(page: Page) -> list[str]:
    script = """
    () => {
      const urls = [];
      for (const img of document.querySelectorAll('img')) {
        const values = [
          img.currentSrc,
          img.src,
          img.getAttribute('data-src'),
          img.getAttribute('data-ks-lazyload'),
          img.getAttribute('data-lazyload')
        ];
        for (const value of values) {
          if (!value) continue;
          const url = value.startsWith('//') ? `https:${value}` : value;
          if (/^https?:\\/\\//.test(url) && !urls.includes(url)) urls.push(url);
        }
      }
      return urls;
    }
    """
    try:
        return page.evaluate(script)
    except Exception:
        return []


def search_top_products(page: Page, keyword: str, limit: int) -> list[str]:
    search_url = f"https://s.taobao.com/search?q={quote_plus(keyword)}"
    goto_with_wait(page, search_url)

    urls: list[str] = []
    anchors = page.locator("a[href*='item.taobao.com/item.htm'], a[href*='detail.tmall.com/item.htm']")
    count = min(anchors.count(), 80)

    for i in range(count):
        href = anchors.nth(i).get_attribute("href") or ""
        url = ensure_url(href)
        if not url:
            continue
        if url not in urls:
            urls.append(url)
        if len(urls) >= limit:
            break

    return urls


def scrape_product(page: Page, url: str, role: str, output_dir: Path) -> ProductSnapshot:
    raw_dir = output_dir / "raw"
    screenshot_dir = output_dir / "screenshots"
    review_dir = output_dir / "reviews"
    raw_dir.mkdir(parents=True, exist_ok=True)
    screenshot_dir.mkdir(parents=True, exist_ok=True)
    review_dir.mkdir(parents=True, exist_ok=True)

    goto_with_wait(page, url)
    scroll_to_top(page)

    title = page_title(page)
    price = first_text(
        page,
        [
            "[class*='Price']",
            ".tb-rmb-num",
            ".tm-price",
            "[class*='price']",
        ],
    )

    base = safe_filename(f"{role}-{title}", role)
    top_screenshot = capture_viewport(page, screenshot_dir / f"{base}-top.png")

    prepare_detail_area(page)
    detail_screenshots = capture_scrolled_sections(page, screenshot_dir, base, "detail", steps=8)
    detail_html = page.content()

    prepare_review_area(page)
    review_screenshots = capture_scrolled_sections(page, screenshot_dir, base, "reviews", steps=3)
    review_texts = extract_review_texts(page)
    review_html = page.content()

    all_images = extract_page_images(page) or extract_image_urls(detail_html)
    main_images = all_images[:12]
    detail_images = all_images[12:100]

    html_path = raw_dir / f"{base}.html"
    review_html_path = raw_dir / f"{base}-reviews.html"
    review_text_path = review_dir / f"{base}-reviews.txt"

    html_path.write_text(detail_html, encoding="utf-8")
    review_html_path.write_text(review_html, encoding="utf-8")
    review_text_path.write_text("\n\n".join(review_texts), encoding="utf-8")

    return ProductSnapshot(
        role=role,
        url=url,
        title=title,
        price=price,
        main_images=main_images,
        detail_images=detail_images,
        top_screenshot=top_screenshot,
        detail_screenshots=detail_screenshots,
        review_screenshots=review_screenshots,
        review_texts=review_texts,
        html_path=str(html_path),
        review_text_path=str(review_text_path),
    )


def render_product_block(item: ProductSnapshot) -> list[str]:
    return [
        f"### {item.role}",
        "",
        f"- 链接：{item.url}",
        f"- 标题：{item.title}",
        f"- 价格：{item.price}",
        f"- 首屏截图：{item.top_screenshot}",
        f"- 详情页截图：{', '.join(item.detail_screenshots[:4])}",
        f"- 评价截图：{', '.join(item.review_screenshots[:2])}",
        f"- 评价文本：{item.review_text_path}",
        f"- HTML 留档：{item.html_path}",
        "",
        "主图/页面图片候选：",
        "",
        *[f"- {url}" for url in item.main_images[:8]],
        "",
        "评价文本摘要：",
        "",
        *[f"- {text}" for text in item.review_texts[:8]],
    ]


def build_report(case_dir: Path, row: dict, snapshots: list[ProductSnapshot]) -> None:
    report = case_dir / "report.md"
    client = next((item for item in snapshots if item.role == "client"), None)
    competitors = [item for item in snapshots if item.role.startswith("competitor")]

    lines = [
        "# 淘宝主图与详情页竞品分析报告草稿",
        "",
        "## 1. 项目信息",
        "",
        f"- 行业：{row.get('industry', '')}",
        f"- 搜索关键词：{row.get('category_keyword', '')}",
        f"- 平台：{row.get('platform', '')}",
        f"- 品牌：{row.get('brand_name', '')}",
        f"- 目标市场：{row.get('target_market', '')}",
        f"- 价格区间：{row.get('price_range', '')}",
        f"- 备注：{row.get('notes', '')}",
        "",
        "## 2. 客户产品",
        "",
    ]

    if client:
        lines.extend(render_product_block(client))

    lines.extend(["", "## 3. Top 3 竞品", ""])
    for competitor in competitors:
        lines.extend(render_product_block(competitor))
        lines.append("")

    lines.extend(
        [
            "## 4. 待 AI 深度分析问题",
            "",
            "### 主图",
            "",
            "- 客户主图和竞品主图在构图、主体突出度、色彩、场景、文字卖点上的差异是什么？",
            "- Top 3 竞品主图共同强调了哪些购买理由？",
            "- 客户主图是否在缩略图场景下具备点击吸引力？",
            "",
            "### 详情页",
            "",
            "- 竞品详情页常见模块顺序是什么？",
            "- 客户详情页缺少哪些转化模块？",
            "- 哪些模块适合前置，哪些模块适合放在信任证明或 FAQ？",
            "",
            "### 视觉与人群",
            "",
            "- 页面视觉更偏功能理性、生活方式、高端质感，还是低价促销？",
            "- 目标客群的年龄、性别、消费动机和使用场景可以如何推断？",
            "- 客户产品应该采用哪种视觉表现方式来提高匹配度？",
            "",
            "## 5. 建议输出结构",
            "",
            "1. 行业页面共性规律",
            "2. Top 3 竞品亮点拆解",
            "3. 客户页面问题诊断",
            "4. 主图优化方向",
            "5. 详情页模块策划",
            "6. 文案卖点重构",
            "7. 拍摄与设计素材清单",
        ]
    )

    report.write_text("\n".join(lines), encoding="utf-8")


def resolve_cdp_endpoint(cdp_url: str) -> str:
    if cdp_url.startswith("ws://") or cdp_url.startswith("wss://"):
        return cdp_url

    base = cdp_url.rstrip("/")
    with urllib.request.urlopen(f"{base}/json/version", timeout=5) as response:
        payload = json.loads(response.read().decode("utf-8"))

    websocket_url = payload.get("webSocketDebuggerUrl")
    if not websocket_url:
        raise RuntimeError(f"Chrome DevTools endpoint missing webSocketDebuggerUrl: {base}/json/version")
    return websocket_url


def open_context(p, browser_mode: str, headless: bool, cdp_url: str) -> tuple[Browser, BrowserContext, Page, bool]:
    if browser_mode == "chrome":
        endpoint = resolve_cdp_endpoint(cdp_url)
        browser = p.chromium.connect_over_cdp(endpoint)
        context = browser.contexts[0] if browser.contexts else browser.new_context(viewport={"width": 1440, "height": 1200})
        page = context.pages[0] if context.pages else context.new_page()
        print(f"[INFO] 已连接你的 Chrome：{cdp_url}")
        return browser, context, page, False

    browser = p.chromium.launch(headless=headless)
    context_kwargs = {
        "viewport": {"width": 1440, "height": 1200},
        "locale": "zh-CN",
    }
    if STATE_PATH.exists():
        context_kwargs["storage_state"] = str(STATE_PATH)
    context = browser.new_context(**context_kwargs)
    page = context.new_page()
    print("[INFO] 使用 Playwright 管理的 Chromium。")
    return browser, context, page, True


def run(input_path: Path, limit: int, headless: bool, browser_mode: str, cdp_url: str) -> None:
    with input_path.open("r", encoding="utf-8-sig", newline="") as file:
        data = [{key: value or "" for key, value in row.items()} for row in csv.DictReader(file)]

    OUTPUT_ROOT.mkdir(exist_ok=True)

    with sync_playwright() as p:
        browser, _context, page, should_close = open_context(p, browser_mode, headless, cdp_url)

        for idx, row_dict in enumerate(data):
            keyword = row_dict.get("category_keyword", "")
            run_stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
            case_name = safe_filename(f"{idx + 1}-{row_dict.get('industry', '')}-{keyword}-{run_stamp}", f"case-{idx + 1}")
            case_dir = OUTPUT_ROOT / case_name
            case_dir.mkdir(parents=True, exist_ok=True)

            manual_competitors = [
                row_dict.get("competitor_1_url", "").strip(),
                row_dict.get("competitor_2_url", "").strip(),
                row_dict.get("competitor_3_url", "").strip(),
            ]
            competitor_urls = [url for url in manual_competitors if url]
            if len(competitor_urls) < limit:
                searched_urls = search_top_products(page, keyword, limit=limit)
                for url in searched_urls:
                    if url not in competitor_urls:
                        competitor_urls.append(url)
                    if len(competitor_urls) >= limit:
                        break

            product_urls = [("client", row_dict.get("client_product_url", ""))]
            product_urls += [(f"competitor_{i + 1}", url) for i, url in enumerate(competitor_urls)]

            snapshots: list[ProductSnapshot] = []
            for role, url in product_urls:
                if not url:
                    continue
                try:
                    snapshot = scrape_product(page, url, role, case_dir)
                    snapshots.append(snapshot)
                    time.sleep(1.5)
                except Exception as exc:
                    print(f"[WARN] {role} 抓取失败: {url} - {exc}")

            (case_dir / "snapshots.json").write_text(
                json.dumps([asdict(item) for item in snapshots], ensure_ascii=False, indent=2),
                encoding="utf-8",
            )
            build_report(case_dir, row_dict, snapshots)
            print(f"[OK] 已生成: {case_dir / 'report.md'}")

        if should_close:
            browser.close()


def main() -> None:
    parser = argparse.ArgumentParser(description="淘宝主图与详情页竞品抓取分析 MVP")
    parser.add_argument("--input", default="input_template.csv", help="输入 CSV 文件路径")
    parser.add_argument("--limit", type=int, default=3, help="竞品数量")
    parser.add_argument("--headless", action="store_true", help="无头模式运行")
    parser.add_argument("--browser-mode", choices=["managed", "chrome"], default="managed", help="浏览器模式")
    parser.add_argument("--cdp-url", default="http://127.0.0.1:9222", help="Chrome DevTools 调试地址")
    args = parser.parse_args()

    run(Path(args.input), args.limit, args.headless, args.browser_mode, args.cdp_url)


if __name__ == "__main__":
    main()
