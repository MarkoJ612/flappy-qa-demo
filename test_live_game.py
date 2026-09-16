import pytest
from playwright.sync_api import Page, expect

# Tvoj živi GitHub Pages URL
BASE_URL = "https://markoj612.github.io/flappy-qa-demo/"

def test_flappy_bird_ground_collision_telemetry(page: Page):
    """
    Testira mehaniku padanja ptice (gravitaciju) i provere na QA Telemetry tabli:
    1. Otvara živi sajt i proverava 'READY' status.
    2. Pritiska Space za početak igre ('PLAYING').
    3. Čeka pad ptice na pod i proverava 'GAME_OVER' status, 'GROUND' koliziju i '[PASS]' QA badge.
    """
    # 1. Otvaramo živi sajt
    page.goto(BASE_URL)
    
    # Proveravamo početno stanje na tabli
    expect(page.locator("#stateBadge")).to_have_text("READY")
    
    # 2. Započinjemo igru pritiskom na Space
    page.keyboard.press("Space")
    expect(page.locator("#stateBadge")).to_have_text("PLAYING")
    
    # 3. Čekamo 2.5 sekunde da ptica padne na pod pod uticajem gravitacije
    page.wait_for_timeout(2500)
    
    # 4. QA Telemetry Assertions (Automatska provera indikatora na sajtu)
    expect(page.locator("#stateBadge")).to_have_text("GAME_OVER")
    expect(page.locator("#collisionType")).to_have_text("GROUND")
    expect(page.locator("#assertGround")).to_have_text("[PASS]")


def test_auto_play_bot_activation(page: Page):
    """
    Testira funkcionalnost Auto-Play Bota:
    Aktivira bota i proverava da li održava igru aktivnom bez kolizije sa podom.
    """
    page.goto(BASE_URL)
    
    # Klikćemo na dugme za aktivaciju bota
    page.get_by_role("button", name="Toggle Auto-Play Bot").click()
    
    # Proveravamo da li je igra automatski prešla u PLAYING
    expect(page.locator("#stateBadge")).to_have_text("PLAYING")
    
    # Čekamo 2 sekunde dok bot sam drži pticu u vazduhu
    page.wait_for_timeout(2000)
    
    # Ptica ne bi smela da padne na pod dok je bot aktivan
    expect(page.locator("#stateBadge")).to_have_text("PLAYING")