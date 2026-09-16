"""
Cross-build collision regression matrix.

The same scenarios run against every build. v1.0.0 and v1.2.0 must pass;
v1.1.0 is EXPECTED to fail pipe & ground collision (that is the regression
this bench demonstrates). The expectations are encoded explicitly so the
suite is green when the regression build behaves as documented, and red if
either a "good" build regresses or the bug build gets silently fixed.
"""
import pytest
from playwright.sync_api import expect

from pages.game_page import ALL_BUILDS, BUILD_HOTFIX, BUILD_LEGACY, BUILD_REGRESSION, GamePage

EXPECTED_SUITE = {
    BUILD_LEGACY:     {"ceiling": "PASS", "ground": "PASS", "pipe": "PASS", "score": "PASS"},
    BUILD_REGRESSION: {"ceiling": "PASS", "ground": "FAIL", "pipe": "FAIL", "score": "PASS"},
    BUILD_HOTFIX:     {"ceiling": "PASS", "ground": "PASS", "pipe": "PASS", "score": "PASS"},
}


@pytest.mark.regression
@pytest.mark.parametrize("build", ALL_BUILDS)
def test_headless_assertion_suite_matches_expected_matrix(game: GamePage, build: str):
    game.open()
    game.select_build(build)  # switching a build auto-runs the suite
    results = game.assertions()
    actual = {k: results[k]["status"] for k in EXPECTED_SUITE[build]}
    assert actual == EXPECTED_SUITE[build], f"{build}: {results}"

    for assertion_id, status in EXPECTED_SUITE[build].items():
        expect(game.assertion_badge(assertion_id)).to_have_text(f"[{status}]")
        expect(game.assertion_item(assertion_id)).to_have_attribute("data-status", status)

    expected_fail_count = sum(1 for s in EXPECTED_SUITE[build].values() if s == "FAIL")
    expect(game.suite_summary).to_contain_text(f"{expected_fail_count} fail")


@pytest.mark.regression
@pytest.mark.parametrize("build", [BUILD_LEGACY, BUILD_HOTFIX])
def test_ground_collision_ends_game_in_stable_builds(game: GamePage, build: str):
    game.open(build=build)
    game.press_space()
    game.wait_for_state("PLAYING")
    # Real-time path: let gravity pull the bird to the ground (~0.6 s at 60 fps).
    game.wait_for_state("GAME_OVER", timeout=6000)
    expect(game.collision_type).to_have_text("GROUND")
    expect(game.assertion_badge("ground")).to_have_text("[PASS]")


@pytest.mark.regression
@pytest.mark.parametrize("build", [BUILD_LEGACY, BUILD_HOTFIX])
def test_pipe_collision_ends_game_in_stable_builds(game: GamePage, build: str):
    game.open(build=build)
    game.press_space()
    snap = game.force_collision("pipe")
    assert snap["state"] == "GAME_OVER"
    assert snap["lastCollision"].startswith("PIPE_")
    game.wait_for_state("GAME_OVER")
    expect(game.assertion_badge("pipe")).to_have_text("[PASS]")
    assert game.bugs() == [], "no ticket should be filed when collision is handled"


@pytest.mark.regression
@pytest.mark.parametrize("build", ALL_BUILDS)
def test_ceiling_boundary_enforced_in_every_build(game: GamePage, build: str):
    game.open(build=build)
    game.press_space()
    snap = game.force_collision("ceiling")
    assert snap["state"] == "GAME_OVER"
    assert snap["lastCollision"] == "CEILING"
    expect(game.collision_type).to_have_text("CEILING")


@pytest.mark.regression
def test_regression_build_bird_clips_through_pipe(game: GamePage):
    game.open(build=BUILD_REGRESSION)
    game.press_space()
    snap = game.force_collision("pipe")
    assert snap["state"] == "PLAYING", "v1.1.0 must NOT detect the pipe hit (documented regression)"
    assert snap["lastCollision"] == "NONE"
    game.wait_for_state("PLAYING")
    expect(game.assertion_badge("pipe")).to_have_text("[FAIL]")


@pytest.mark.regression
def test_regression_build_bird_rests_on_ground_without_game_over(game: GamePage):
    game.open(build=BUILD_REGRESSION)
    game.press_space()
    game.pause()
    snap = game.step_frames(240)  # ~4 s of simulated time, deterministic
    assert snap["state"] == "PLAYING"
    ground_line = 540 - 56
    assert snap["bird"]["y"] + 12 >= ground_line - 1, "bird should be clamped to the ground plane"
    expect(game.assertion_badge("ground")).to_have_text("[FAIL]")


@pytest.mark.regression
def test_hotfix_resolves_ticket_filed_against_regression_build(game: GamePage):
    game.open(build=BUILD_REGRESSION)
    game.press_space()
    game.force_collision("pipe")
    expect(game.bug_card("QA-BUG-104")).to_have_attribute("data-status", "OPEN")

    game.select_build(BUILD_HOTFIX)  # suite re-runs and passes → ticket reconciled
    expect(game.bug_card("QA-BUG-104")).to_have_attribute("data-status", "RESOLVED")
    expect(game.bug_card("QA-BUG-104")).to_contain_text(f"verified in {BUILD_HOTFIX}")
