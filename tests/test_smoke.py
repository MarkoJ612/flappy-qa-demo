"""Smoke: the bench boots, state machine and basic controls work."""
import pytest
from playwright.sync_api import expect

from pages.game_page import BUILD_LEGACY, GamePage


@pytest.mark.smoke
def test_initial_state_is_ready(game: GamePage):
    game.open()
    game.wait_for_state("READY")
    expect(game.active_build_chip).to_have_text(BUILD_LEGACY)
    expect(game.collision_type).to_have_text("NONE")
    expect(game.score).to_have_text("0")


@pytest.mark.smoke
def test_space_starts_game_and_flaps(game: GamePage):
    game.open()
    before = game.telemetry()
    game.press_space()
    game.wait_for_state("PLAYING")
    after = game.telemetry()
    assert after.bird_vy < 0, "flap should give the bird negative (upward) velocity"
    assert after.frame >= before.frame


@pytest.mark.smoke
def test_canvas_click_starts_game(game: GamePage):
    game.open()
    game.tap_canvas()
    game.wait_for_state("PLAYING")


@pytest.mark.smoke
def test_start_button_label_follows_state(game: GamePage):
    game.open()
    expect(game.start_button).to_contain_text("Start")
    game.click_start()
    game.wait_for_state("PLAYING")
    expect(game.start_button).to_contain_text("Restart")
    game.force_collision("ground")
    game.wait_for_state("GAME_OVER")
    expect(game.start_button).to_contain_text("Play Again")


@pytest.mark.smoke
def test_restart_after_game_over_resets_score_and_state(game: GamePage):
    game.open(seed=7)
    game.press_space()
    game.force_collision("ground")
    game.wait_for_state("GAME_OVER")
    game.press_space()  # restart
    game.wait_for_state("PLAYING")
    t = game.telemetry()
    assert t.score == 0 and t.last_collision == "NONE"


@pytest.mark.smoke
def test_hitbox_overlay_toggle_reflects_in_ui(game: GamePage):
    game.open()
    expect(game.hitbox_button).to_have_attribute("aria-pressed", "false")
    game.toggle_hitboxes()
    expect(game.hitbox_button).to_have_attribute("aria-pressed", "true")
    assert game.qa("getState()")["hitboxes"] is True
    game.page.keyboard.press("h")  # keyboard shortcut
    expect(game.hitbox_button).to_have_attribute("aria-pressed", "false")
