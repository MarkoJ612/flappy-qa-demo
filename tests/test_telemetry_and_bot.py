"""Real-time telemetry panel, scoring logic and the Auto-Play bot."""
import pytest
from playwright.sync_api import expect

from pages.game_page import ALL_BUILDS, BUILD_LEGACY, GamePage


@pytest.mark.telemetry
def test_telemetry_tiles_track_engine_state(game: GamePage):
    game.open(seed=3)
    game.press_space()
    game.pause()
    snap = game.step_frames(20)
    # Give the render loop a frame to flush DOM updates.
    game.page.wait_for_timeout(100)
    expect(game.page.locator("#birdX")).to_have_text(f"{snap['bird']['x']:.1f}")
    expect(game.page.locator("#birdY")).to_have_text(f"{snap['bird']['y']:.1f}")
    expect(game.page.locator("#frame")).to_have_text(str(snap["frame"]))
    vy = game.page.locator("#birdVy").inner_text()
    assert abs(float(vy) - snap["bird"]["vy"]) < 0.02
    dist = game.page.locator("#distNext").inner_text()
    assert dist.endswith("px") or dist == "—"


@pytest.mark.telemetry
def test_gravity_increases_downward_velocity(game: GamePage):
    game.open()
    game.press_space()
    game.pause()
    a = game.step_frames(5)["bird"]["vy"]
    b = game.step_frames(5)["bird"]["vy"]
    assert b > a, "velocity must grow under gravity between frames"


@pytest.mark.telemetry
def test_distance_to_next_pipe_decreases_over_time(game: GamePage):
    game.open(seed=5)
    game.press_space()
    game.pause()
    game.step_frames(31)  # first pipe spawns at frame 30
    d1 = game.telemetry().distance_to_next_pipe
    game.qa("flap()")
    game.step_frames(10)
    d2 = game.telemetry().distance_to_next_pipe
    assert d1 is not None and d2 is not None and d2 < d1


@pytest.mark.telemetry
@pytest.mark.parametrize("build", ALL_BUILDS)
def test_score_increments_once_per_pipe_passed(game: GamePage, build: str):
    game.open(build=build, seed=21)
    game.qa("toggleBot(true)")
    game.pause()
    snap = game.step_frames(700)
    assert snap["state"] == "PLAYING", f"bot crashed in {build}: {snap}"
    assert snap["score"] == snap["pipesPassed"] >= 5
    game.page.wait_for_timeout(100)
    expect(game.score).to_have_text(str(snap["score"]))
    expect(game.assertion_badge("score")).to_have_text("[PASS]")


@pytest.mark.bot
def test_auto_play_bot_button_starts_game_and_keeps_bird_alive(game: GamePage):
    game.open(build=BUILD_LEGACY)
    game.toggle_bot()
    expect(game.bot_button).to_have_attribute("aria-pressed", "true")
    game.wait_for_state("PLAYING")
    game.wait_for_score_at_least(2, timeout=15000)  # real-time run
    expect(game.state_badge).to_have_text("PLAYING")
    expect(game.collision_type).to_have_text("NONE")


@pytest.mark.bot
def test_bot_survives_long_soak_in_stable_build(game: GamePage):
    game.open(build=BUILD_LEGACY, seed=99)
    game.qa("toggleBot(true)")
    game.pause()
    snap = game.step_frames(3000)  # 50 s of simulated play, instant
    assert snap["state"] == "PLAYING"
    assert snap["score"] >= 25
