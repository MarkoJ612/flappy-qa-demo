"""Dynamic Jira issue generator — ticket content, dedupe and lifecycle."""
import pytest
from playwright.sync_api import expect

from pages.game_page import BUILD_REGRESSION, GamePage

TICKET_TITLE = (
    "Collision detection failed - Bird bounding box intersected Pipe Object "
    "without entering GAME_OVER state."
)


@pytest.mark.bugs
def test_bugs_panel_starts_empty(game: GamePage):
    game.open()
    expect(game.bug_empty_state).to_be_visible()
    expect(game.bug_cards).to_have_count(0)
    expect(game.bug_tab_count).to_have_text("0")


@pytest.mark.bugs
def test_pipe_clip_in_regression_build_files_qa_bug_104(game: GamePage):
    game.open(build=BUILD_REGRESSION)
    game.press_space()
    game.force_collision("pipe")

    card = game.bug_card("QA-BUG-104")
    expect(card).to_be_visible()
    expect(card.locator(".bug-id")).to_have_text("QA-BUG-104")
    expect(card.locator(".bug-sev")).to_have_text("HIGH / BLOCKER")
    expect(card.locator(".bug-title")).to_have_text(TICKET_TITLE)
    expect(card.locator(".bug-ea .exp")).to_contain_text("GAME_OVER")
    expect(card.locator(".bug-ea .act")).to_contain_text("PLAYING")
    expect(card).to_contain_text(BUILD_REGRESSION)
    expect(game.bug_tab_count).to_have_text("1")
    expect(game.bug_empty_state).to_be_hidden()

    ticket = next(t for t in game.bugs() if t["id"] == "QA-BUG-104")
    assert ticket["status"] == "OPEN"
    assert ticket["expected"] == "GAME_OVER" and ticket["actual"] == "PLAYING"
    assert ticket["evidence"]["type"].startswith("PIPE_")
    assert ticket["evidence"]["objectId"] == 1


@pytest.mark.bugs
def test_ground_clip_in_regression_build_files_qa_bug_105(game: GamePage):
    game.open(build=BUILD_REGRESSION)
    game.press_space()
    game.force_collision("ground")
    card = game.bug_card("QA-BUG-105")
    expect(card).to_be_visible()
    expect(card.locator(".bug-sev")).to_have_text("HIGH / BLOCKER")
    expect(card).to_contain_text("Ground collision not detected")


@pytest.mark.bugs
def test_repeated_pipe_overlaps_increment_occurrences_not_cards(game: GamePage):
    game.open(build=BUILD_REGRESSION, seed=11)
    game.press_space()
    game.pause()
    # Bot-driven soak: the bot survives in v1.1.0 regardless, so instead glide
    # into pipes deterministically by stepping with sparse flaps.
    for _ in range(12):
        game.qa("flap()")
        game.step_frames(36)
    tickets = game.bugs()
    pipe_tickets = [t for t in tickets if t["id"] == "QA-BUG-104"]
    assert len(pipe_tickets) == 1, "same defect must be a single ticket"
    assert pipe_tickets[0]["occurrences"] >= 2
    expect(game.bug_cards.filter(has_text="QA-BUG-104")).to_have_count(1)
    expect(game.bug_card("QA-BUG-104").locator(".bug-occ")).to_contain_text(
        f"×{pipe_tickets[0]['occurrences']}"
    )


@pytest.mark.bugs
def test_clear_button_empties_board(game: GamePage):
    game.open(build=BUILD_REGRESSION)
    game.press_space()
    game.force_collision("pipe")
    expect(game.bug_cards).to_have_count(1)
    game.clear_bugs_button.click()
    expect(game.bug_cards).to_have_count(0)
    expect(game.bug_empty_state).to_be_visible()
    expect(game.bug_tab_count).to_have_text("0")


@pytest.mark.bugs
def test_ticket_json_export_is_well_formed(game: GamePage):
    game.open(build=BUILD_REGRESSION)
    game.press_space()
    game.force_collision("pipe")
    import json
    exported = json.loads(game.page.evaluate("() => window.FlappyApp.bugs.exportJSON()"))
    assert isinstance(exported, list) and exported[0]["id"] == "QA-BUG-104"
    assert {"severity", "title", "expected", "actual", "steps", "evidence"} <= exported[0].keys()
