from pathlib import Path

from playwright.sync_api import sync_playwright


STATE_PATH = Path("storage/taobao_state.json")


def main() -> None:
    STATE_PATH.parent.mkdir(parents=True, exist_ok=True)

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=False)
        context = browser.new_context(
            viewport={"width": 1440, "height": 1200},
            locale="zh-CN",
        )
        page = context.new_page()
        page.goto("https://login.taobao.com/", wait_until="domcontentloaded")

        input("请在打开的浏览器中完成淘宝登录，登录成功后回到这里按回车保存登录态...")
        context.storage_state(path=str(STATE_PATH))
        browser.close()

    print(f"已保存淘宝登录态: {STATE_PATH}")


if __name__ == "__main__":
    main()

