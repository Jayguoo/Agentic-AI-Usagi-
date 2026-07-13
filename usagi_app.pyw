"""Usagi desktop app: native window around the local Usagi web UI."""

import ctypes
import importlib.util
import threading
import time
import urllib.request
from ctypes import wintypes
from pathlib import Path

import webview

APP_ID = "Jay.Usagi.Agent"
ROOT = Path(__file__).resolve().parent
ICON_FILE = ROOT / "Usagi.ico"
BG = "#f5eff7"

try:
    ctypes.windll.shell32.SetCurrentProcessExplicitAppUserModelID(APP_ID)
except Exception:
    pass


def load_web_module():
    spec = importlib.util.spec_from_file_location("usagi_web", ROOT / "usagi_web.pyw")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def apply_window_icon(title: str) -> None:
    """Set the Usagi icon on the native window (pywebview ignores `icon` on Windows)."""
    if not ICON_FILE.exists():
        return
    user32 = ctypes.windll.user32
    user32.FindWindowW.restype = wintypes.HWND
    user32.LoadImageW.restype = wintypes.HANDLE
    hwnd = user32.FindWindowW(None, title)
    if not hwnd:
        return
    IMAGE_ICON = 1
    LR_LOADFROMFILE = 0x0010
    LR_DEFAULTSIZE = 0x0040
    WM_SETICON = 0x0080
    hicon = user32.LoadImageW(
        None, str(ICON_FILE), IMAGE_ICON, 0, 0, LR_LOADFROMFILE | LR_DEFAULTSIZE
    )
    if not hicon:
        return
    user32.SendMessageW(hwnd, WM_SETICON, 0, hicon)
    user32.SendMessageW(hwnd, WM_SETICON, 1, hicon)


def wait_for_server(url: str, timeout: float = 8.0) -> bool:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        try:
            with urllib.request.urlopen(url, timeout=1):
                return True
        except OSError:
            time.sleep(0.2)
    return False


def main() -> None:
    web = load_web_module()
    url = f"http://{web.HOST}:{web.PORT}"

    # Serve in the background; if the port is already taken, an earlier
    # Usagi server is running and the window just attaches to it.
    threading.Thread(
        target=web.start_server, kwargs={"open_browser": False}, daemon=True
    ).start()
    wait_for_server(f"{url}/health")

    window = webview.create_window(
        "Usagi",
        url,
        width=1220,
        height=780,
        min_size=(900, 620),
        background_color=BG,
    )
    window.events.shown += lambda: apply_window_icon("Usagi")
    webview.start()


if __name__ == "__main__":
    main()
