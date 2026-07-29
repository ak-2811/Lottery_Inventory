import re
import signal
import time
from contextlib import contextmanager
import requests


class CleanupTimeout(Exception):
    pass


@contextmanager
def timeout_after(seconds):
    if not hasattr(signal, "SIGALRM"):
        yield
        return

    def handle_timeout(signum, frame):
        raise CleanupTimeout(f"Timed out after {seconds} seconds")

    previous_handler = signal.signal(signal.SIGALRM, handle_timeout)
    signal.alarm(seconds)
    try:
        yield
    finally:
        signal.alarm(0)
        signal.signal(signal.SIGALRM, previous_handler)


def parse_amount_to_number(text):
    if not text:
        return None

    cleaned = text.replace(",", "").strip()

    m = re.search(r"\$?\s*([\d.]+)\s*(Million|Billion)", cleaned, re.I)
    if m:
        value = float(m.group(1))
        unit = m.group(2).lower()
        if unit == "million":
            return int(value * 1_000_000)
        if unit == "billion":
            return int(value * 1_000_000_000)

    return None


def get_driver():
    from selenium import webdriver
    from selenium.webdriver.chrome.options import Options

    options = Options()
    options.add_argument("--headless=new")
    options.add_argument("--disable-gpu")
    options.add_argument("--no-sandbox")
    options.add_argument("--window-size=1920,1080")
    options.add_argument("--disable-dev-shm-usage")
    options.add_argument("--disable-extensions")
    options.add_argument("--disable-background-networking")

    driver = webdriver.Chrome(options=options)
    driver.set_page_load_timeout(25)
    driver.set_script_timeout(10)
    return driver


def safe_quit(driver):
    try:
        with timeout_after(5):
            driver.quit()
    except Exception:
        pass


def extract_money_after_label(text, label):
    pattern = rf"{re.escape(label)}\s*:?\s*(\$[\d.,]+\s*(?:Million|Billion))"
    m = re.search(pattern, text, re.I)
    return m.group(1).strip() if m else None


def extract_first_money_amount(text):
    m = re.search(r"\$\s*[\d.,]+\s*(?:Million|Billion)", text or "", re.I)
    return re.sub(r"\s+", " ", m.group(0)).strip() if m else None


def fetch_powerball():
    url = "https://www.powerball.com/"
    headers = {
        "User-Agent": (
            "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
            "(KHTML, like Gecko) Chrome/120.0 Safari/537.36"
        )
    }

    try:
        response = requests.get(url, headers=headers, timeout=15)
        response.raise_for_status()
        jackpot = extract_money_after_label(response.text, "Estimated Jackpot")
        if not jackpot:
            jackpot = extract_first_money_amount(response.text)

        if jackpot:
            return {
                "game_name": "Powerball",
                "amount_text": jackpot,
                "amount_number": parse_amount_to_number(jackpot),
                "source_url": url,
            }
    except requests.RequestException:
        pass

    from selenium.webdriver.common.by import By

    driver = get_driver()

    try:
        driver.get(url)
        time.sleep(4)

        page_text = driver.find_element(By.TAG_NAME, "body").text
        jackpot = extract_money_after_label(page_text, "Estimated Jackpot")

        return {
            "game_name": "Powerball",
            "amount_text": jackpot,
            "amount_number": parse_amount_to_number(jackpot),
            "source_url": url,
        }
    finally:
        safe_quit(driver)


def fetch_mega_millions():
    from selenium.webdriver.common.by import By

    url = "https://www.megamillions.com/"
    driver = get_driver()

    try:
        driver.get(url)
        time.sleep(4)

        page_text = driver.find_element(By.TAG_NAME, "body").text
        jackpot = extract_money_after_label(page_text, "Estimated Jackpot")

        return {
            "game_name": "Mega Millions",
            "amount_text": jackpot,
            "amount_number": parse_amount_to_number(jackpot),
            "source_url": url,
        }
    finally:
        safe_quit(driver)
