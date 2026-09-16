"""
pytest fixtures.

By default the suite spins up a local static server for the repository root
so tests are hermetic and CI-friendly. Set BASE_URL to run the same tests
against a deployed instance (e.g. GitHub Pages):

    BASE_URL=https://<user>.github.io/flappy-qa-bench/ pytest
"""
from __future__ import annotations

import functools
import http.server
import os
import socket
import threading
from pathlib import Path

import pytest
from playwright.sync_api import Page

from pages.game_page import GamePage

REPO_ROOT = Path(__file__).resolve().parent.parent


class _QuietHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *_args):  # silence request logging
        pass


def _free_port() -> int:
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


@pytest.fixture(scope="session")
def base_url() -> str:
    env = os.getenv("BASE_URL")
    if env:
        yield env.rstrip("/")
        return

    port = _free_port()
    handler = functools.partial(_QuietHandler, directory=str(REPO_ROOT))
    server = http.server.ThreadingHTTPServer(("127.0.0.1", port), handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    yield f"http://127.0.0.1:{port}"
    server.shutdown()


@pytest.fixture
def game(page: Page, base_url: str) -> GamePage:
    page.set_viewport_size({"width": 1366, "height": 900})
    return GamePage(page, base_url)


@pytest.fixture
def mobile_game(browser, base_url: str):
    """iPhone-sized context with touch enabled."""
    context = browser.new_context(
        viewport={"width": 390, "height": 844},
        device_scale_factor=2,
        is_mobile=True,
        has_touch=True,
    )
    page = context.new_page()
    yield GamePage(page, base_url)
    context.close()


@pytest.fixture(autouse=True)
def fail_on_js_errors(page: Page):
    """Any uncaught JS exception fails the test — cheap, high-value guard."""
    errors: list[str] = []
    page.on("pageerror", lambda exc: errors.append(str(exc)))
    yield
    assert not errors, f"Uncaught JS errors: {errors}"
