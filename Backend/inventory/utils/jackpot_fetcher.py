import re
import time
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By


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
    options = Options()
    options.add_argument("--headless=new")
    options.add_argument("--disable-gpu")
    options.add_argument("--no-sandbox")
    options.add_argument("--window-size=1920,1080")
    options.add_argument("--disable-dev-shm-usage")

    driver = webdriver.Chrome(options=options)
    return driver


def extract_money_after_label(text, label):
    pattern = rf"{re.escape(label)}\s*:?\s*(\$[\d.,]+\s*(?:Million|Billion))"
    m = re.search(pattern, text, re.I)
    return m.group(1).strip() if m else None


def fetch_powerball():
    url = "https://www.powerball.com/draw-result"
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
        driver.quit()


def fetch_mega_millions():
    url = "https://www.megamillions.com/winning-numbers.aspx"
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
        driver.quit()