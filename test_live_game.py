from playwright.sync_api import Page, expect

def test_flappy_bird_telemetry(page: Page):
    # Gađamo tvoj živi sajt!
    page.goto("https://tvoje-ime.github.io/flappy-bird-qa-demo/")
    
    # Započinjemo igru
    page.keyboard.press("Space")
    page.wait_for_timeout(2000) # Čekamo da padne na pod
    
    # Proveravamo da li je QA indikator na sajtu pozeleneo ([PASS])
    assert page.inner_text("#assertGround") == "[PASS]"
    assert page.inner_text("#stateBadge") == "GAME_OVER"