"""Usagi desktop app: native window for the local Usagi agent."""

import ctypes
import importlib.util
import os
import shutil
import socket
import subprocess
import threading
import time
import urllib.parse
import urllib.request
from ctypes import wintypes
from pathlib import Path

import webview

APP_ID = "Jay.Usagi.Agent"
ROOT = Path(__file__).resolve().parent
ICON_FILE = ROOT / "Usagi.ico"
BG_LIGHT = "#f3eee2"
BG_DARK = "#1c1a17"
BG = BG_LIGHT

try:
    ctypes.windll.shell32.SetCurrentProcessExplicitAppUserModelID(APP_ID)
except Exception:
    pass


def get_window_background() -> str:
    try:
        import winreg
        with winreg.OpenKey(
            winreg.HKEY_CURRENT_USER,
            r"Software\Microsoft\Windows\CurrentVersion\Themes\Personalize",
        ) as key:
            value, _ = winreg.QueryValueEx(key, "AppsUseLightTheme")
            if value == 0:
                return BG_DARK
    except Exception:
        pass
    return BG_LIGHT


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


def port_is_open(host: str, port: int, timeout: float = 0.5) -> bool:
    try:
        with socket.create_connection((host, port), timeout=timeout):
            return True
    except OSError:
        return False


def ensure_local_ollama(base_url: str, timeout: float = 12.0) -> bool:
    parsed = urllib.parse.urlsplit(base_url)
    host = parsed.hostname or ""
    port = parsed.port or 11434
    if host not in {"127.0.0.1", "localhost"} or port != 11434:
        return True
    if port_is_open(host, port):
        return True

    executable = shutil.which("ollama")
    if not executable:
        return False

    subprocess.Popen(
        [executable, "serve"],
        stdin=subprocess.DEVNULL,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        creationflags=subprocess.CREATE_NO_WINDOW,
    )
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if port_is_open(host, port):
            return True
        time.sleep(0.2)
    return False


def enable_editing_menu(window) -> None:
    from System import Action

    def configure() -> None:
        settings = window.native.webview.CoreWebView2.Settings
        settings.AreDefaultContextMenusEnabled = True

    window.native.Invoke(Action(configure))


def main() -> None:
    web = load_web_module()
    url = f"http://{web.HOST}:{web.PORT}"
    web.usagi.load_env_file(ROOT / ".env.local")
    ensure_local_ollama(os.environ.get("USAGI_BASE_URL", ""))

    # Serve in the background; if the port is already taken, an earlier
    # Usagi server is running and the window just attaches to it.
    threading.Thread(
        target=web.start_server, daemon=True
    ).start()
    wait_for_server(f"{url}/health")

    window = webview.create_window(
        "Usagi",
        url,
        width=1280,
        height=820,
        min_size=(1100, 700),
        background_color=get_window_background(),
        text_select=True,
    )
    window.events.shown += lambda: apply_window_icon("Usagi")
    window.events.loaded += lambda: enable_editing_menu(window)
    webview.start(gui="edgechromium")


if __name__ == "__main__":
    main()
