"""Responsive behaviour: desktop side-by-side vs. mobile tabbed dashboard."""
import pytest
from playwright.sync_api import expect

from pages.game_page import BUILD_REGRESSION, GamePage


@pytest.mark.responsive
def test_desktop_shows_all_panels_and_hides_tabs(game: GamePage):
    game.open()
    expect(game.tabs).to_be_hidden()
    for name in ("telemetry", "assertions", "bugs"):
        expect(game.panel(name)).to_be_visible()

    # Side-by-side: dashboard starts to the right of the canvas.
    canvas_box = game.canvas.bounding_box()
    dash_box = game.page.locator(".dash-col").bounding_box()
    assert dash_box["x"] > canvas_box["x"] + canvas_box["width"] - 1


@pytest.mark.responsive
def test_mobile_collapses_dashboard_into_tabs(mobile_game: GamePage):
    g = mobile_game
    g.open()
    expect(g.tabs).to_be_visible()
    expect(g.panel("telemetry")).to_be_visible()
    expect(g.panel("assertions")).to_be_hidden()
    expect(g.panel("bugs")).to_be_hidden()

    # Stacked: dashboard is below the canvas.
    canvas_box = g.canvas.bounding_box()
    dash_box = g.page.locator(".dash-col").bounding_box()
    assert dash_box["y"] >= canvas_box["y"] + canvas_box["height"]

    # No horizontal overflow.
    overflow = g.page.evaluate("() => document.documentElement.scrollWidth - window.innerWidth")
    assert overflow <= 0

    g.open_tab("assertions")
    expect(g.panel("assertions")).to_be_visible()
    expect(g.panel("telemetry")).to_be_hidden()

    g.open_tab("bugs")
    expect(g.panel("bugs")).to_be_visible()


@pytest.mark.responsive
def test_mobile_tap_flaps_and_bug_tab_badge_updates(mobile_game: GamePage):
    g = mobile_game
    g.open(build=BUILD_REGRESSION)
    g.canvas.tap()
    g.wait_for_state("PLAYING")
    g.force_collision("pipe")
    expect(g.bug_tab_count).to_have_text("1")
    expect(g.bug_tab_count).to_have_attribute("data-nonzero", "true")
    g.open_tab("bugs")
    expect(g.bug_card("QA-BUG-104")).to_be_visible()
