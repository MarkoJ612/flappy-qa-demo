"""
Page Object Model for the Flappy QA Bench.

All selectors live here. Tests never touch raw locators, so a UI refactor only
requires updating this file. Deterministic scenarios use the app-side
`window.QA` automation hooks rather than wall-clock waits wherever possible.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from playwright.sync_api import Locator, Page, expect

BUILD_LEGACY = "v1.0.0"
BUILD_REGRESSION = "v1.1.0"
BUILD_HOTFIX = "v1.2.0"
ALL_BUILDS = (BUILD_LEGACY, BUILD_REGRESSION, BUILD_HOTFIX)

ASSERTION_IDS = ("ceiling", "ground", "pipe", "score")


@dataclass(frozen=True)
class Telemetry:
    state: str
    bird_x: float
    bird_y: float
    bird_vy: float
    score: int
    frame: int
    last_collision: str
    distance_to_next_pipe: float | None


class GamePage:
    """Encapsulates the Flappy QA Bench single-page app."""

    PATH = "/"

    def __init__(self, page: Page, base_url: str):
        self.page = page
        self.base_url = base_url.rstrip("/")

    # ------------------------------------------------------------------ #
    # Navigation
    # ------------------------------------------------------------------ #
    def open(self, build: str | None = None, seed: int | None = None) -> "GamePage":
        query = []
        if build:
            query.append(f"build={build}")
        if seed is not None:
            query.append(f"seed={seed}")
        url = f"{self.base_url}{self.PATH}" + (f"?{'&'.join(query)}" if query else "")
        self.page.goto(url)
        self.page.wait_for_function("() => window.QA && window.FlappyApp")
        return self

    # ------------------------------------------------------------------ #
    # Locators (single source of truth)
    # ------------------------------------------------------------------ #
    @property
    def canvas(self) -> Locator:
        return self.page.locator("#gameCanvas")

    @property
    def state_badge(self) -> Locator:
        return self.page.locator("#stateBadge")

    @property
    def active_build_chip(self) -> Locator:
        return self.page.locator("#activeBuild")

    @property
    def collision_type(self) -> Locator:
        return self.page.locator("#collisionType")

    @property
    def score(self) -> Locator:
        return self.page.locator("#score")

    @property
    def start_button(self) -> Locator:
        return self.page.locator("#btnStart")

    @property
    def hitbox_button(self) -> Locator:
        return self.page.locator("#btnHitbox")

    @property
    def bot_button(self) -> Locator:
        return self.page.get_by_role("button", name="Toggle Auto-Play Bot")

    @property
    def run_suite_button(self) -> Locator:
        return self.page.locator("#btnRunSuite")

    @property
    def clear_bugs_button(self) -> Locator:
        return self.page.locator("#btnClearBugs")

    @property
    def suite_summary(self) -> Locator:
        return self.page.locator("#suiteSummary")

    @property
    def bug_cards(self) -> Locator:
        return self.page.locator(".bug-card")

    @property
    def bug_empty_state(self) -> Locator:
        return self.page.locator("#bugEmpty")

    @property
    def bug_tab_count(self) -> Locator:
        return self.page.locator("#bugCount")

    @property
    def tabs(self) -> Locator:
        return self.page.locator(".tabs")

    def build_button(self, build: str) -> Locator:
        return self.page.locator(f".build-btn[data-build='{build}']")

    def assertion_badge(self, assertion_id: str) -> Locator:
        return self.page.locator(f"#assert-{assertion_id}")

    def assertion_item(self, assertion_id: str) -> Locator:
        return self.page.locator(f".assert-item[data-assert='{assertion_id}']")

    def bug_card(self, ticket_id: str) -> Locator:
        return self.page.locator(f".bug-card[data-ticket-id='{ticket_id}']")

    def tab(self, name: str) -> Locator:
        return self.page.locator(f".tab-btn[data-tab='{name}']")

    def panel(self, name: str) -> Locator:
        return self.page.locator(f".panel[data-panel='{name}']")

    # ------------------------------------------------------------------ #
    # UI actions (real user interactions)
    # ------------------------------------------------------------------ #
    def select_build(self, build: str) -> None:
        self.build_button(build).click()
        expect(self.build_button(build)).to_have_attribute("aria-selected", "true")
        expect(self.active_build_chip).to_have_text(build)

    def press_space(self) -> None:
        self.page.keyboard.press("Space")

    def tap_canvas(self) -> None:
        self.canvas.click()

    def click_start(self) -> None:
        self.start_button.click()

    def toggle_bot(self) -> None:
        self.bot_button.click()

    def toggle_hitboxes(self) -> None:
        self.hitbox_button.click()

    def run_suite(self) -> None:
        self.run_suite_button.click()

    def open_tab(self, name: str) -> None:
        self.tab(name).click()
        expect(self.tab(name)).to_have_class(compile_regex("is-active"))

    # ------------------------------------------------------------------ #
    # Automation hooks (deterministic, app-side API)
    # ------------------------------------------------------------------ #
    def qa(self, expression: str) -> Any:
        return self.page.evaluate(f"() => window.QA.{expression}")

    def telemetry(self) -> Telemetry:
        s = self.qa("getState()")
        return Telemetry(
            state=s["state"],
            bird_x=s["bird"]["x"],
            bird_y=s["bird"]["y"],
            bird_vy=s["bird"]["vy"],
            score=s["score"],
            frame=s["frame"],
            last_collision=s["lastCollision"],
            distance_to_next_pipe=s["distanceToNextPipe"],
        )

    def assertions(self) -> dict[str, dict]:
        return {a["id"]: a for a in self.qa("getAssertions()")}

    def bugs(self) -> list[dict]:
        return self.qa("getBugs()")

    def force_collision(self, kind: str) -> dict:
        return self.qa(f"forceCollision('{kind}')")

    def step_frames(self, n: int) -> dict:
        return self.qa(f"stepFrames({n})")

    def pause(self) -> None:
        self.qa("pause()")

    def resume(self) -> None:
        self.qa("resume()")

    # ------------------------------------------------------------------ #
    # Waits
    # ------------------------------------------------------------------ #
    def wait_for_state(self, state: str, timeout: int = 5000) -> None:
        expect(self.state_badge).to_have_text(state, timeout=timeout)

    def wait_for_score_at_least(self, n: int, timeout: int = 15000) -> None:
        self.page.wait_for_function(
            "n => window.QA.getState().score >= n", arg=n, timeout=timeout
        )


def compile_regex(fragment: str):
    import re
    return re.compile(rf"\b{fragment}\b")
