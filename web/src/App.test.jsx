import React from "react";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import App from "./App";

const api = vi.hoisted(() => ({
  approveAction: vi.fn(),
  connectEmail: vi.fn(),
  getTradeSnapshot: vi.fn(),
  openTarget: vi.fn(),
  reminderAction: vi.fn(),
  sendMessage: vi.fn(),
  setPlanApproval: vi.fn(),
  setTradeAccount: vi.fn(),
  setTradeReadOnly: vi.fn(),
}));

const appState = vi.hoisted(() => ({
  refresh: vi.fn(),
  status: {
    memoryFacts: 4,
    openTasks: 2,
    pendingActions: 0,
    skills: 6,
    actions: [],
    dueReminders: [],
    recentRuns: [],
    ready: true,
    modelOptions: {
      default: [{ id: "sonnet", name: "Sonnet" }],
      claude: [{ id: "sonnet", name: "Sonnet" }, { id: "opus", name: "Opus" }],
      codex: [{ id: "gpt-5.5", name: "GPT-5.5" }],
    },
    email: {
      connected: true,
      address: "jay@example.com",
      provider: "Gmail",
      readOnly: true,
    },
  },
}));

vi.mock("./api", () => api);

let hoursSpy;

const TRADE_FIXTURE = {
  mode: "READ_ONLY",
  readOnlyReason: "Usagi observes OpenTrade snapshots. Trading stays in OpenTrade.",
  connected: true,
  generatedAt: "2026-07-16T14:30:00+00:00",
  account: { id: "primary", label: "Primary account", status: "ACTIVE", equity: 10000, cash: 6200, buyingPower: 12400, currency: "USD" },
  accountId: "primary",
  accounts: [
    { id: "primary", label: "Primary account", paperOnly: true, sharedWithPrimary: [] },
    { id: "2", label: "Small $100 account", paperOnly: true, sharedWithPrimary: ["vision", "health"] },
  ],
  market: {
    isOpen: true,
    regime: "constructive",
    score: 0.75,
    sizeMultiplier: 0.75,
    benchmarks: [{ symbol: "SPY", latest: 620, sma50: 610, sma200: 580, volatility: 0.18 }],
  },
  risk: { locked: true, reason: "max_drawdown_lock", drawdown: 0.279, peakEquity: 100, lockEquity: 72.1, unprotected: 0 },
  positions: [{ symbol: "AAPL", side: "LONG", quantity: 4, entryPrice: 210, currentPrice: 216, marketValue: 864, unrealizedPnl: 24, unrealizedPct: 0.02857, protected: true }],
  orders: [{ id: "order-1", symbol: "AAPL", side: "SELL", type: "STOP", status: "NEW", quantity: 4, stopPrice: 204 }],
  plans: [{ symbol: "AAPL", side: "BUY", approved: false, thesis: "Breakout watch", entry: 216, stop: 204, target: 240, quantity: 4, maxLoss: 48, riskReward: 2, score: 4.5, spreadPct: 0.0001, objectivePassed: false, failureConditions: ["Drawdown lock active"], newsCount: 2, filingCount: 1, headline: "AAPL 8-K" }],
  alerts: [{ severity: "critical", title: "Drawdown lock active", detail: "max drawdown lock" }],
  decisions: [{
    time: "2026-07-16T14:27:00+00:00",
    action: "preflight failed",
    mode: "market-open",
    ok: false,
    title: "Preflight checks blocked the run",
    detail: "Drawdown guard blocked trading.",
    explanation: "OpenTrade stopped before order submission because a required safety check failed.",
    evidence: [
      { label: "Failed check", value: "Drawdown guard blocked trading" },
      { label: "Outcome", value: "No order submitted" },
    ],
  }],
  journal: [{ symbol: "AAPL", side: "BUY", strategy: "breakout", pnl: 42.5, returnPct: 0.012, outcome: "take_profit", exitedAt: "2026-07-15T18:00:00+00:00" }],
  performance: {
    objective: { candidates: 1, passed: 0, failed: 1, autoApproval: false },
    walkForward: [{ symbol: "AAPL", returnPct: 0.08, maxDrawdown: -0.04, stressDrawdown: -0.09, windows: 3 }],
    paper: { ok: true, blocked: false, mode: "paper", submitted: 0 },
  },
  freshness: { status: "stale", syncedAt: "2026-07-11T22:34:00+00:00", ageMinutes: 6231, files: [{ label: "Portfolio", updatedAt: "2026-07-11T22:34:00+00:00", ageMinutes: 6231 }] },
  automations: {
    routines: [
      {
        name: "pre-market-research", label: "OpenTrade PreMarket Research", scheduledAt: "07:30", installed: true,
        steps: ["cloud-preflight", "research-market", "build-plan"], ageMinutes: 45,
        lastRun: { name: "pre-market-research", startedAt: "2026-07-16T11:30:00+00:00", status: "warning", exitCode: 0, failures: [], warnings: ["missing Telegram credentials"], artifacts: ["MARKET_VISION.json"] },
      },
      {
        name: "end-of-day-review", label: "OpenTrade End Of Day Review", scheduledAt: "15:05", installed: true,
        steps: ["sync-state", "notify-summary"], ageMinutes: null, lastRun: null,
      },
    ],
    recentRuns: [
      { name: "pre-market-research", startedAt: "2026-07-16T11:30:00+00:00", status: "completed", exitCode: 0, failures: [], artifacts: ["MARKET_VISION.json"] },
      { name: "paper-test-execute", startedAt: "2026-07-16T12:25:00+00:00", status: "failed", exitCode: 1, failures: ["TradingView tv CLI not found"], artifacts: [] },
    ],
    logAgeMinutes: 45,
  },
  research: {
    generatedAt: "2026-07-16T11:30:05+00:00",
    regime: { state: "neutral", score: 0.25, notes: ["realized volatility calm at 8.8%"], macroNotes: [] },
    providers: [
      { provider: "alpaca_news", state: "ok", detail: "10 articles", items: 10 },
      { provider: "fred_macro", state: "skipped", detail: "missing FRED_API_KEY", items: 0 },
    ],
    riskFlags: ["NVDA: heavy news flow (9 items); reduce confidence until reviewed."],
    symbols: [
      { symbol: "NVDA", newsCount: 9, filingCount: 0, headlines: [{ title: "SK Hynix ships HBM4 for Nvidia Rubin", url: "https://example.com/nvda", source: "alpaca_news" }] },
    ],
    leaderWatch: {
      generatedAt: "2026-07-16T10:46:52+00:00", person: "Nancy Pelosi", researchOnly: true, newItems: 1,
      symbols: [{ symbol: "NVDA", actions: ["buy"], score: 0.8, headlines: [{ title: "Pelosi disclosure: NVDA buy", url: "https://example.com/leader", source: "google_news_rss" }] }],
    },
  },
  tradingview: {
    generatedAt: "2026-07-16T20:05:00+00:00",
    connected: true,
    timeframe: "5",
    problem: "",
    charts: [
      { symbol: "NVDA", available: true, capturedAt: "2026-07-16T20:05:10+00:00", error: "" },
      { symbol: "SPY", available: true, capturedAt: "2026-07-16T20:05:20+00:00", error: "" },
      { symbol: "QQQ", available: false, capturedAt: null, error: "Chart pane not found" },
    ],
  },
};

const storageMock = (() => {
  let store = {};
  return {
    getItem: (key) => store[key] ?? null,
    setItem: (key, value) => { store[key] = String(value); },
    removeItem: (key) => { delete store[key]; },
    clear: () => { store = {}; },
  };
})();

if (typeof window !== "undefined" && (!window.localStorage || typeof window.localStorage.clear !== "function")) {
  Object.defineProperty(window, "localStorage", { value: storageMock, writable: true });
}
if (typeof globalThis !== "undefined" && (!globalThis.localStorage || typeof globalThis.localStorage.clear !== "function")) {
  try {
    Object.defineProperty(globalThis, "localStorage", { value: storageMock, writable: true });
  } catch {}
}

beforeEach(() => {
  window.localStorage.removeItem("usagi.connection");
  hoursSpy = vi.spyOn(Date.prototype, "getHours").mockReturnValue(14);
  api.getTradeSnapshot.mockResolvedValue(TRADE_FIXTURE);
  api.setTradeReadOnly.mockImplementation((readOnly) => Promise.resolve({ trades: { ...TRADE_FIXTURE, readOnly, mode: readOnly ? "READ_ONLY" : "PLAN_APPROVALS" } }));
  api.setTradeAccount.mockImplementation((id) => Promise.resolve({
    trades: { ...TRADE_FIXTURE, accountId: id, account: { ...TRADE_FIXTURE.account, id, label: id === "2" ? "Small $100 account" : "Primary account", equity: id === "2" ? 100 : 10000 } },
  }));
  api.setPlanApproval.mockResolvedValue({
    result: { detail: "AAPL BUY is approved for OpenTrade's guarded trader." },
    trades: { ...TRADE_FIXTURE, readOnly: false, paperOnly: true, mode: "PLAN_APPROVALS" },
  });
  api.connectEmail.mockResolvedValue({
    email: {
      connected: true,
      address: "jay@example.com",
      provider: "Gmail",
      readOnly: true,
    },
  });
  appState.refresh.mockReset();
  appState.status.ready = true;
  appState.status.email = {
    connected: true,
    address: "jay@example.com",
    provider: "Gmail",
    readOnly: true,
  };
  window.localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.clearAllMocks();
  vi.restoreAllMocks();
  window.localStorage.clear();
});

vi.mock("./hooks/useStatus", () => {
  return {
    default: () => ({
      status: appState.status,
      error: null,
      refresh: appState.refresh,
    }),
  };
});

function mockSystemTheme(dark) {
  const listeners = new Set();
  const query = {
    matches: dark,
    addEventListener: (_type, listener) => listeners.add(listener),
    removeEventListener: (_type, listener) => listeners.delete(listener),
  };
  window.matchMedia = vi.fn(() => query);
  return (nextDark) => {
    query.matches = nextDark;
    listeners.forEach((listener) => listener({ matches: nextDark }));
  };
}

test("switches between light and dark mode, remembers it, and restyles the live chart", async () => {
  mockSystemTheme(false);
  render(<App />);
  expect(document.documentElement).toHaveAttribute("data-theme", "light");
  expect(localStorage.getItem("usagi.theme")).toBeNull();

  fireEvent.click(screen.getByRole("button", { name: "Switch to dark mode" }));

  expect(document.documentElement).toHaveAttribute("data-theme", "dark");
  expect(localStorage.getItem("usagi.theme")).toBe("dark");
  expect(screen.getByRole("button", { name: "Switch to light mode" })).toBeVisible();

  fireEvent.click(screen.getByRole("button", { name: "Open trade companion" }));
  await screen.findByRole("img", { name: "Closed-trade equity performance graph" });
  fireEvent.click(within(screen.getByRole("group", { name: "Graph source" })).getByRole("button", { name: "TradingView" }));
  const widgetTheme = () => JSON.parse(document.querySelector(".tradingview-widget-container script").innerHTML).theme;
  expect(widgetTheme()).toBe("dark");

  fireEvent.click(screen.getByRole("button", { name: "Switch to light mode" }));

  expect(document.documentElement).toHaveAttribute("data-theme", "light");
  expect(widgetTheme()).toBe("light");
  expect(document.querySelectorAll(".tradingview-widget-container script")).toHaveLength(1);
  delete window.matchMedia;
});

test("follows the system theme until a choice is made, then keeps the choice", () => {
  const setSystemDark = mockSystemTheme(true);
  const { unmount } = render(<App />);
  expect(document.documentElement).toHaveAttribute("data-theme", "dark");
  expect(localStorage.getItem("usagi.theme")).toBeNull();

  act(() => setSystemDark(false));
  expect(document.documentElement).toHaveAttribute("data-theme", "light");

  fireEvent.click(screen.getByRole("button", { name: "Switch to dark mode" }));
  act(() => setSystemDark(false));
  expect(document.documentElement).toHaveAttribute("data-theme", "dark");
  unmount();

  render(<App />);
  expect(document.documentElement).toHaveAttribute("data-theme", "dark");
  delete window.matchMedia;
});

test("renders the native desktop task canvas with the repository Usagi PNG", () => {
  const { container } = render(<App />);

  expect(screen.getByRole("application", { name: "Usagi desktop agent" })).toBeVisible();
  expect(container.querySelector(".quiet-task-canvas")).toBeVisible();
  expect(screen.getByRole("img", { name: "Usagi companion" })).toHaveAttribute(
    "src",
    "/characters/usagi-idle.png"
  );
  expect(screen.getByRole("complementary", { name: "Task inspector" })).toBeVisible();
  expect(screen.getByRole("textbox", { name: "Ask Usagi" })).toBeVisible();
  expect(screen.getByRole("button", { name: "Run task" })).toBeVisible();
  expect(container.querySelector(".rail")).not.toBeInTheDocument();
  expect(container.querySelector(".drawer")).not.toBeInTheDocument();
  expect(container.querySelector("canvas")).not.toBeInTheDocument();
  expect(container.querySelector("video")).not.toBeInTheDocument();
  expect(api.sendMessage).not.toHaveBeenCalled();
});

test("moves the desktop agent into its visible planning loop when a task is launched", () => {
  api.sendMessage.mockReturnValue(new Promise(() => {}));
  render(<App />);

  fireEvent.change(screen.getByRole("textbox", { name: "Ask Usagi" }), {
    target: { value: "Sort my Downloads folder" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Run task" }));

  const phases = screen.getByRole("navigation", { name: "Usagi task phases" });
  expect(within(phases).getByText("Sniff")).toHaveAttribute("aria-current", "step");
  expect(within(screen.getByLabelText("Usagi is working")).getByText("Mapping the task")).toBeVisible();
  expect(screen.getByRole("img", { name: "Usagi companion" })).toHaveAttribute(
    "src",
    "/characters/usagi-thinking-cutout.png"
  );
});

test("remembers models per connection and sends the chosen model", () => {
  api.sendMessage.mockReturnValue(new Promise(() => {}));
  render(<App />);
  const connection = screen.getByRole("combobox", { name: "Model connection" });
  fireEvent.change(connection, { target: { value: "codex" } });
  fireEvent.change(screen.getByRole("combobox", { name: "AI model" }), {
    target: { value: "gpt-5.5" },
  });
  fireEvent.change(connection, { target: { value: "claude" } });
  expect(screen.getByRole("combobox", { name: "AI model" })).toHaveValue("sonnet");
  expect(screen.queryByRole("option", { name: "Default model" })).not.toBeInTheDocument();
  expect(screen.queryByRole("option", { name: "Default connection" })).not.toBeInTheDocument();
  expect(screen.queryByRole("option", { name: "GPT-5.5" })).not.toBeInTheDocument();
  fireEvent.change(connection, { target: { value: "codex" } });
  expect(screen.getByRole("combobox", { name: "AI model" })).toHaveValue("gpt-5.5");
  fireEvent.change(screen.getByLabelText("Ask Usagi"), { target: { value: "Hello" } });
  fireEvent.click(screen.getByRole("button", { name: "Run task" }));
  expect(api.sendMessage).toHaveBeenCalledWith("Hello", "codex", "gpt-5.5");
});

test("sends tasks through the selected Codex connection", () => {
  api.sendMessage.mockReturnValue(new Promise(() => {}));
  render(<App />);
  fireEvent.change(screen.getByRole("combobox", { name: "Model connection" }), {
    target: { value: "codex" },
  });
  fireEvent.change(screen.getByLabelText("Ask Usagi"), { target: { value: "Hello" } });
  fireEvent.click(screen.getByRole("button", { name: "Run task" }));
  expect(api.sendMessage).toHaveBeenCalledWith("Hello", "codex", "gpt-5.5");
  expect(localStorage.getItem("usagi.connection")).toBe("codex");
});

test("keeps one-click email triage available as a persistent quick action", () => {
  api.sendMessage.mockReturnValue(new Promise(() => {}));
  render(<App />);

  const quickActions = screen.getByRole("group", { name: "Quick actions" });
  fireEvent.click(within(quickActions).getByRole("button", { name: "Email" }));

  expect(api.sendMessage).toHaveBeenCalledWith(
    "Check my email and triage what matters.", "claude", "sonnet"
  );
  expect(screen.getByRole("heading", { name: "Email triage" })).toBeVisible();
  expect(screen.getByRole("group", { name: "Quick actions" })).toBeVisible();
});

test("opens secure Gmail setup instead of launching email triage when disconnected", () => {
  appState.status.email = {
    connected: false,
    address: "",
    provider: "Gmail",
    readOnly: true,
  };
  render(<App />);

  const quickActions = screen.getByRole("group", { name: "Quick actions" });
  fireEvent.click(within(quickActions).getByRole("button", { name: "Email" }));

  expect(screen.getByRole("dialog", { name: "Connect Gmail" })).toBeVisible();
  expect(screen.getByLabelText("Gmail address")).toBeVisible();
  expect(screen.getByLabelText("16-character app password")).toHaveAttribute("type", "password");
  expect(screen.getByText(/never your normal Gmail password/i)).toBeVisible();
  expect(api.sendMessage).not.toHaveBeenCalled();
});

test("connects Gmail locally without sending the app password to the agent", async () => {
  appState.status.email = {
    connected: false,
    address: "",
    provider: "Gmail",
    readOnly: true,
  };
  render(<App />);

  const quickActions = screen.getByRole("group", { name: "Quick actions" });
  fireEvent.click(within(quickActions).getByRole("button", { name: "Email" }));
  fireEvent.change(screen.getByLabelText("Gmail address"), {
    target: { value: "jay@gmail.com" },
  });
  fireEvent.change(screen.getByLabelText("16-character app password"), {
    target: { value: "abcd efgh ijkl mnop" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Connect Gmail" }));

  await waitFor(() => {
    expect(api.connectEmail).toHaveBeenCalledWith("jay@gmail.com", "abcd efgh ijkl mnop");
  });
  expect(api.sendMessage).not.toHaveBeenCalled();
  expect(appState.refresh).toHaveBeenCalled();
  expect(screen.queryByRole("dialog", { name: "Connect Gmail" })).not.toBeInTheDocument();
});

test("seeds editable quick actions into the task composer", () => {
  render(<App />);

  const quickActions = screen.getByRole("group", { name: "Quick actions" });
  fireEvent.click(within(quickActions).getByRole("button", { name: "Research" }));

  expect(screen.getByRole("textbox", { name: "Ask Usagi" })).toHaveValue(
    "Research the web for: "
  );
  expect(api.sendMessage).not.toHaveBeenCalled();
});

test("opens the read-only OpenTrade project from desktop Tools", () => {
  render(<App />);

  fireEvent.click(screen.getByRole("button", { name: "Tools" }));
  fireEvent.click(screen.getByRole("button", { name: /OpenTrade project/i }));

  expect(api.openTarget).toHaveBeenCalledWith("opentrade");
});

test("opens a read-only Trade Companion with plans, risk, portfolio, and review context", async () => {
  render(<App />);

  fireEvent.click(screen.getByRole("button", { name: "Open trade companion" }));

  expect(await screen.findByRole("heading", { name: "Trade Companion" })).toBeVisible();
  expect(api.getTradeSnapshot).toHaveBeenCalledTimes(1);
  expect(screen.getByText("READ ONLY")).toBeVisible();
  expect(screen.getAllByText("Drawdown lock active")[0]).toBeVisible();
  expect(screen.getByText("$10,000.00")).toBeVisible();
  expect(screen.getByText("4d")).toBeVisible();
  expect(screen.getByRole("heading", { name: "AAPL" })).toBeVisible();
  expect(screen.getByText("Breakout watch")).toBeVisible();
  expect(screen.queryByRole("button", { name: /place order/i })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /cancel order/i })).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "Portfolio" }));
  expect(screen.getByRole("heading", { name: "Open positions" })).toBeVisible();
  expect(screen.getByText("Protected")).toBeVisible();
  expect(screen.getByRole("heading", { name: "Open orders" })).toBeVisible();

  fireEvent.click(screen.getByRole("button", { name: "Review" }));
  expect(screen.getByRole("heading", { name: "Decision trail" })).toBeVisible();
  expect(screen.getByText("+$42.50")).toBeVisible();
  expect(screen.getByText("Walk-forward validation")).toBeVisible();
});

test("shows an interactive equity and drawdown performance trace", async () => {
  api.getTradeSnapshot.mockResolvedValue({
    ...TRADE_FIXTURE,
    journal: [
      { symbol: "AAPL", pnl: 42.5, exitedAt: "2026-07-15T18:00:00+00:00" },
      {
        symbol: "MSFT", pnl: -125, exitedAt: "2026-07-14T18:00:00+00:00",
        review: { status: "done", explanation: "MSFT slid with the tech selloff after the yield spike." },
      },
      { symbol: "NVDA", pnl: 210, exitedAt: "2026-07-13T18:00:00+00:00", review: { status: "pending" } },
    ],
  });
  render(<App />);

  fireEvent.click(screen.getByRole("button", { name: "Open trade companion" }));

  expect(await screen.findByRole("heading", { name: "Performance trace" })).toBeVisible();
  const equityGraph = screen.getByRole("img", { name: "Closed-trade equity performance graph" });
  expect(equityGraph).toBeVisible();
  expect(screen.getByText("3 closed trades")).toBeVisible();

  vi.spyOn(equityGraph, "getBoundingClientRect").mockReturnValue({ left: 0, width: 760 });
  fireEvent.mouseMove(equityGraph, { clientX: 64 });
  expect(screen.getByText("Journal baseline")).toBeVisible();
  expect(screen.queryByText("WHY IT LOST")).not.toBeInTheDocument();

  fireEvent.mouseMove(equityGraph, { clientX: 290 });
  expect(screen.getByText("RESEARCHING")).toBeVisible();
  expect(screen.getByText("Usagi is researching why this trade made money.")).toBeVisible();

  fireEvent.mouseMove(equityGraph, { clientX: 512 });
  expect(screen.getByText("WHY IT LOST")).toBeVisible();
  expect(screen.getByText("MSFT slid with the tech selloff after the yield spike.")).toBeVisible();

  fireEvent.click(screen.getByRole("button", { name: "Drawdown" }));

  expect(screen.getByRole("img", { name: "Closed-trade drawdown performance graph" })).toBeVisible();
  expect(screen.getByText("Worst drawdown")).toBeVisible();
  expect(screen.queryByRole("button", { name: /place order/i })).not.toBeInTheDocument();
});

test("opens a descriptive window for a selected audit decision", async () => {
  render(<App />);

  fireEvent.click(screen.getByRole("button", { name: "Open trade companion" }));
  await screen.findByRole("heading", { name: "Trade Companion" });
  fireEvent.click(screen.getByRole("button", { name: "Review" }));
  fireEvent.click(screen.getByRole("button", { name: /Preflight checks blocked the run/i }));

  const dialog = screen.getByRole("dialog", { name: "Preflight checks blocked the run" });
  expect(within(dialog).getByText("OpenTrade stopped before order submission because a required safety check failed.")).toBeVisible();
  expect(within(dialog).getByText("Failed check")).toBeVisible();
  expect(within(dialog).getByText("Drawdown guard blocked trading")).toBeVisible();
  expect(within(dialog).getByText("No order submitted")).toBeVisible();

  fireEvent.click(within(dialog).getByRole("button", { name: "Close audit details" }));
  expect(screen.queryByRole("dialog", { name: "Preflight checks blocked the run" })).not.toBeInTheDocument();
});

test("swaps Trade Companion between configured accounts", async () => {
  render(<App />);
  fireEvent.click(screen.getByRole("button", { name: "Open trade companion" }));
  await screen.findByRole("heading", { name: "Trade Companion" });

  const picker = screen.getByRole("combobox", { name: "Trading account" });
  expect(picker).toHaveValue("primary");
  expect(within(picker).getAllByRole("option").map((option) => option.textContent)).toEqual([
    "Primary account",
    "Small $100 account",
  ]);

  fireEvent.change(picker, { target: { value: "2" } });

  await waitFor(() => expect(api.setTradeAccount).toHaveBeenCalledWith("2"));
  const companion = screen.getByRole("complementary", { name: "Usagi trading companion" });
  expect(await within(companion).findByText("Small $100 account")).toBeVisible();
  expect(screen.getByText("$100.00")).toBeVisible();
  expect(screen.getByText(/Shares the primary account's vision, health files/)).toBeVisible();
});

test("shows automation runs and what pre-market research found", async () => {
  render(<App />);
  fireEvent.click(screen.getByRole("button", { name: "Open trade companion" }));
  await screen.findByRole("heading", { name: "Trade Companion" });
  fireEvent.click(screen.getByRole("button", { name: "Automations" }));

  expect(screen.getByRole("heading", { name: "Automations" })).toBeVisible();
  expect(screen.queryByRole("button", { name: "Plans" })).not.toBeInTheDocument();

  const premarket = screen.getByRole("heading", { name: "OpenTrade PreMarket Research" }).closest("article");
  expect(within(premarket).getByText("RUNS 07:30 ON WEEKDAYS")).toBeVisible();
  expect(within(premarket).getByText("Completed with warnings")).toBeVisible();
  expect(within(premarket).getByText("SKIPPED OR BLOCKED IN THIS RUN")).toBeVisible();
  expect(within(premarket).getByText("missing Telegram credentials")).toBeVisible();
  expect(within(premarket).getByText("Wrote MARKET_VISION.json")).toBeVisible();
  expect(within(within(premarket).getByRole("list", { name: /steps/ })).getAllByRole("listitem").map((item) => item.textContent))
    .toEqual(["cloud-preflight", "research-market", "build-plan"]);

  const review = screen.getByRole("heading", { name: "OpenTrade End Of Day Review" }).closest("article");
  expect(within(review).getByText("No run recorded")).toBeVisible();

  expect(screen.getByText("neutral")).toBeVisible();
  expect(screen.getByText("realized volatility calm at 8.8%")).toBeVisible();
  expect(screen.getByText("10 articles")).toBeVisible();
  expect(screen.getByText("missing FRED_API_KEY")).toBeVisible();
  expect(screen.getByText("NVDA: heavy news flow (9 items); reduce confidence until reviewed.")).toBeVisible();
  expect(screen.getByRole("link", { name: "SK Hynix ships HBM4 for Nvidia Rubin" })).toHaveAttribute("href", "https://example.com/nvda");
  expect(screen.getByText(/LEADER WATCH · Nancy Pelosi · RESEARCH ONLY/)).toBeVisible();
  expect(screen.getByText("TradingView tv CLI not found")).toBeVisible();

  const charts = screen.getByRole("region", { name: "TradingView charts" });
  expect(within(charts).getByText("TRADINGVIEW CHARTS · 5M")).toBeVisible();
  const nvda = within(charts).getByRole("img", { name: "NVDA TradingView chart" });
  expect(nvda).toHaveAttribute("src", expect.stringContaining("/api/trades/chart?symbol=NVDA"));
  expect(within(charts).queryByRole("img", { name: "QQQ TradingView chart" })).not.toBeInTheDocument();
  expect(within(charts).getByText("Human review only. OpenTrade never trades from these charts.")).toBeVisible();
});

test("explains why TradingView charts are missing", async () => {
  api.getTradeSnapshot.mockResolvedValue({
    ...TRADE_FIXTURE,
    tradingview: {
      generatedAt: "2026-07-16T20:05:00+00:00", connected: false, timeframe: "5",
      problem: "TradingView Desktop is not reachable; launch it with --remote-debugging-port=9222",
      charts: [{ symbol: "SPY", available: false, capturedAt: null, error: "TradingView Desktop is not reachable" }],
    },
  });
  render(<App />);
  fireEvent.click(screen.getByRole("button", { name: "Open trade companion" }));
  await screen.findByRole("heading", { name: "Trade Companion" });
  fireEvent.click(screen.getByRole("button", { name: "Automations" }));

  const charts = screen.getByRole("region", { name: "TradingView charts" });
  expect(within(charts).getByText("TradingView Desktop is not reachable; launch it with --remote-debugging-port=9222")).toBeVisible();
  expect(within(charts).queryByRole("img")).not.toBeInTheDocument();
});

test("keeps plan approvals behind the read-only toggle", async () => {
  api.getTradeSnapshot.mockResolvedValue({ ...TRADE_FIXTURE, readOnly: true, paperOnly: true, mode: "READ_ONLY" });
  render(<App />);
  fireEvent.click(screen.getByRole("button", { name: "Open trade companion" }));
  await screen.findByRole("heading", { name: "Trade Companion" });
  expect(screen.queryByRole("button", { name: "Approve" })).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "READ ONLY" }));
  expect(api.setTradeReadOnly).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Enable" }));

  await waitFor(() => expect(api.setTradeReadOnly).toHaveBeenCalledWith(false));
  expect(await screen.findByRole("button", { name: "PLAN APPROVALS ON" })).toBeVisible();

  fireEvent.click(screen.getAllByRole("button", { name: "Approve" })[0]);
  await waitFor(() => expect(api.setPlanApproval).toHaveBeenCalledWith("AAPL", "BUY", "approve"));

  fireEvent.click(screen.getByRole("button", { name: "PLAN APPROVALS ON" }));
  await waitFor(() => expect(api.setTradeReadOnly).toHaveBeenLastCalledWith(true));
});

test("cannot leave read-only when OpenTrade is not on the paper endpoint", async () => {
  api.getTradeSnapshot.mockResolvedValue({ ...TRADE_FIXTURE, readOnly: true, paperOnly: false, mode: "READ_ONLY" });
  render(<App />);
  fireEvent.click(screen.getByRole("button", { name: "Open trade companion" }));
  await screen.findByRole("heading", { name: "Trade Companion" });

  expect(screen.getByRole("button", { name: "READ ONLY" })).toBeDisabled();
  expect(api.setTradeReadOnly).not.toHaveBeenCalled();
});

test("logs trades and explains researched losses in the trade journal", async () => {
  api.getTradeSnapshot.mockResolvedValue({
    ...TRADE_FIXTURE,
    journal: [
      {
        id: "SPY:loss", symbol: "SPY", side: "LONG", strategy: "paper-volume", pnl: -0.35, returnPct: -0.0002, outcome: "loss",
        enteredAt: "2026-09-15T18:42:12+00:00", exitedAt: "2026-09-15T18:43:08+00:00", entryPrice: 757.366, exitPrice: 757.236,
        quantity: 0.00264, feesAllocated: false,
        evidence: [{ label: "Entry reason", value: "Signal-independent test order (no trade thesis)" }],
        notes: ["Broker fees are not allocated; P&L is before fees."],
        review: {
          status: "done",
          explanation: "SPY slipped in under a minute with no news; the loss was spread noise.",
          sentiment: { stance: "bearish", summary: "Investors were cautious on rising yields, matching the direction but not the one-minute move." },
          psychology: {
            market: "Fear built into the Fed decision as the VIX rose.",
            decision: "The system re-entered within a minute of a loss, which resembles overtrading.",
            biases: ["Overtrading", "Recency bias"],
          },
          lesson: "Check the spread before test orders.",
          sources: [{ title: "Market wrap", url: "https://example.com/wrap" }],
          queries: ["SPY September 15 2026"],
          warnings: [],
          reviewedAt: "2026-09-15T19:20:00+00:00",
        },
      },
      { id: "QQQ:loss", symbol: "QQQ", side: "LONG", pnl: -0.1, returnPct: -0.02, outcome: "loss", entryPrice: 717.12, exitPrice: 702.8, review: { status: "pending" } },
      { id: "SPY:win", symbol: "SPY", side: "LONG", pnl: 0.07, returnPct: 0.0001, outcome: "profit", entryPrice: 757.24, exitPrice: 757.26, review: { status: "done", explanation: "SPY ticked up within normal spread noise.", sources: [] } },
    ],
  });
  render(<App />);
  fireEvent.click(screen.getByRole("button", { name: "Open trade companion" }));
  await screen.findByRole("heading", { name: "Trade Companion" });
  fireEvent.click(screen.getByRole("button", { name: "Review" }));

  const journal = screen.getByRole("heading", { name: "Trade journal" }).closest("section");
  expect(within(journal).getByText("SPY slipped in under a minute with no news; the loss was spread noise.")).toBeVisible();
  expect(within(journal).getByText("Usagi is researching why this trade lost.")).toBeVisible();
  expect(within(journal).getByText("WHY IT MADE MONEY")).toBeVisible();
  expect(within(journal).getByText("Public: bearish")).toBeVisible();
  expect(within(journal).getByText("SPY ticked up within normal spread noise.")).toBeVisible();
  expect(within(journal).getByText(/\$757\.37 → \$757\.24/)).toBeVisible();
  expect(within(journal).queryByRole("link")).not.toBeInTheDocument();
  expect(readFileSync(resolve(process.cwd(), "src/App.css"), "utf8")).toMatch(/\.decision-list,\s*\.journal-list \{[^}]*overflow-y: auto/);

  fireEvent.click(within(journal).getByRole("button", { name: /Open trade details: SPY loss/ }));

  const dialog = screen.getByRole("dialog", { name: "SPY LONG trade" });
  const why = within(dialog).getByRole("region", { name: "Why this trade lost" });
  expect(within(why).getByText("SPY slipped in under a minute with no news; the loss was spread noise.")).toBeVisible();
  expect(within(dialog).getByText("Check the spread before test orders.")).toBeVisible();
  const sentiment = within(dialog).getByRole("region", { name: "Public sentiment" });
  expect(within(sentiment).getByText("bearish")).toBeVisible();
  expect(within(sentiment).getByText("Investors were cautious on rising yields, matching the direction but not the one-minute move.")).toBeVisible();
  const psychology = within(dialog).getByRole("region", { name: "Trade psychology" });
  expect(within(psychology).getByText("Fear built into the Fed decision as the VIX rose.")).toBeVisible();
  expect(within(psychology).getByText("The system re-entered within a minute of a loss, which resembles overtrading.")).toBeVisible();
  expect(within(within(psychology).getByRole("list", { name: "Behavioral biases" })).getAllByRole("listitem").map((item) => item.textContent)).toEqual(["Overtrading", "Recency bias"]);
  expect(within(dialog).getByRole("link", { name: "Market wrap" })).toHaveAttribute("href", "https://example.com/wrap");
  expect(within(dialog).getByText("SPY September 15 2026")).toBeVisible();
  expect(within(dialog).getByText(/\$757\.366$/)).toBeVisible();
  expect(within(dialog).getByText("56s")).toBeVisible();
  expect(within(dialog).getByText("Not allocated; P&L is before fees")).toBeVisible();
  expect(within(dialog).getByText("Signal-independent test order (no trade thesis)")).toBeVisible();
  expect(within(dialog).getByText("Broker fees are not allocated; P&L is before fees.")).toBeVisible();
  const chart = within(dialog).getByRole("img", { name: "SPY TradingView chart" });
  expect(chart).toHaveAttribute("src", expect.stringContaining("symbol=SPY"));
  expect(within(dialog).getByText(/not when this trade happened/)).toBeVisible();

  fireEvent.keyDown(window, { key: "Escape" });
  expect(screen.queryByRole("dialog", { name: "SPY LONG trade" })).not.toBeInTheDocument();

  fireEvent.click(within(journal).getByRole("button", { name: /Open trade details: SPY profit/ }));
  const profitDialog = screen.getByRole("dialog", { name: "SPY LONG trade" });
  expect(within(profitDialog).getByRole("region", { name: "Why this trade made money" })).toHaveTextContent("SPY ticked up within normal spread noise.");
  expect(within(profitDialog).getByText("Sentiment and psychology research is queued for this trade.")).toBeVisible();
});

test("reads the hovered point from where the graph is actually drawn", async () => {
  api.getTradeSnapshot.mockResolvedValue({
    ...TRADE_FIXTURE,
    journal: [
      { symbol: "AAPL", pnl: 42.5, exitedAt: "2026-07-15T18:00:00+00:00", review: { status: "done", explanation: "AAPL ran with the tape." } },
      { symbol: "MSFT", pnl: -125, exitedAt: "2026-07-14T18:00:00+00:00", review: { status: "done", explanation: "MSFT slid with the tech selloff." } },
      { symbol: "NVDA", pnl: 210, exitedAt: "2026-07-13T18:00:00+00:00", review: { status: "done", explanation: "NVDA rallied on chip demand." } },
    ],
  });
  render(<App />);
  fireEvent.click(screen.getByRole("button", { name: "Open trade companion" }));
  const graph = await screen.findByRole("img", { name: "Closed-trade equity performance graph" });

  // A wide card letterboxes the 760x248 drawing: it renders 796px wide, inset 427px from each side.
  vi.spyOn(graph, "getBoundingClientRect").mockReturnValue({ left: 0, width: 1650, height: 260 });
  const scale = 260 / 248;
  const inset = (1650 - 760 * scale) / 2;
  const screenX = (svgX) => inset + svgX * scale;

  fireEvent.mouseMove(graph, { clientX: screenX(64) });
  expect(screen.getByText("Journal baseline")).toBeVisible();

  fireEvent.mouseMove(graph, { clientX: screenX(288) });
  expect(screen.getByText("NVDA rallied on chip demand.")).toBeVisible();

  fireEvent.mouseMove(graph, { clientX: screenX(736) });
  expect(screen.getByText("AAPL ran with the tape.")).toBeVisible();
});

test("switches the performance graph between my graph and a live TradingView chart", async () => {
  render(<App />);
  fireEvent.click(screen.getByRole("button", { name: "Open trade companion" }));
  await screen.findByRole("img", { name: "Closed-trade equity performance graph" });
  const source = screen.getByRole("group", { name: "Graph source" });
  expect(within(source).getByRole("button", { name: "My graph" })).toHaveAttribute("aria-pressed", "true");

  fireEvent.click(within(source).getByRole("button", { name: "TradingView" }));

  expect(screen.getByRole("heading", { name: "TradingView chart" })).toBeVisible();
  expect(screen.queryByRole("img", { name: "Closed-trade equity performance graph" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Zoom in" })).not.toBeInTheDocument();
  expect(screen.getByText("REALIZED P&L")).toBeVisible();

  // It embeds TradingView's official live widget, opening on the most recent trade's symbol.
  const liveConfig = () => {
    const script = document.querySelector(".tradingview-widget-container script");
    expect(script).toHaveAttribute("src", "https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js");
    return JSON.parse(script.innerHTML);
  };
  expect(liveConfig()).toMatchObject({ symbol: "AAPL", interval: "5", allow_symbol_change: true, autosize: true });
  expect(document.querySelectorAll(".tradingview-widget-container script")).toHaveLength(1);
  expect(screen.getByRole("link", { name: "AAPL chart" })).toHaveAttribute("href", "https://www.tradingview.com/symbols/AAPL/");
  expect(document.querySelector("img.tradingview-chart")).not.toBeInTheDocument();

  const symbols = screen.getByRole("group", { name: "TradingView symbol" });
  expect(within(symbols).getAllByRole("button").map((button) => button.textContent)).toEqual(["NVDA", "AAPL"]);
  fireEvent.click(within(symbols).getByRole("button", { name: "NVDA" }));
  expect(liveConfig().symbol).toBe("NVDA");
  expect(document.querySelectorAll(".tradingview-widget-container script")).toHaveLength(1);

  fireEvent.click(within(source).getByRole("button", { name: "My graph" }));
  expect(screen.getByRole("heading", { name: "Performance trace" })).toBeVisible();
  expect(document.querySelector(".tradingview-widget-container")).not.toBeInTheDocument();
});

test("shows the live TradingView chart without TradingView Desktop running", async () => {
  api.getTradeSnapshot.mockResolvedValue({
    ...TRADE_FIXTURE,
    tradingview: { generatedAt: null, connected: false, timeframe: "", problem: "TradingView Desktop is not reachable; launch it with --remote-debugging-port=9222", charts: [] },
  });
  render(<App />);
  fireEvent.click(screen.getByRole("button", { name: "Open trade companion" }));
  await screen.findByRole("img", { name: "Closed-trade equity performance graph" });

  fireEvent.click(within(screen.getByRole("group", { name: "Graph source" })).getByRole("button", { name: "TradingView" }));

  expect(document.querySelector(".tradingview-widget-container script")).toBeInTheDocument();
  expect(screen.queryByText(/not reachable/)).not.toBeInTheDocument();
});

test("zooms and pans the performance graph", async () => {
  api.getTradeSnapshot.mockResolvedValue({
    ...TRADE_FIXTURE,
    journal: Array.from({ length: 8 }, (_, index) => ({
      id: `T${index}`,
      symbol: `SYM${index}`,
      pnl: index % 2 ? -10 : 20,
      exitedAt: `2026-07-${String(10 + index).padStart(2, "0")}T18:00:00+00:00`,
    })),
  });
  render(<App />);
  fireEvent.click(screen.getByRole("button", { name: "Open trade companion" }));
  const graph = await screen.findByRole("img", { name: "Closed-trade equity performance graph" });
  const points = () => graph.querySelectorAll(".performance-point").length;

  expect(screen.getByText("8 closed trades")).toBeVisible();
  expect(points()).toBe(9);
  expect(screen.getByRole("button", { name: "Zoom out" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Fit" })).toBeDisabled();

  fireEvent.click(screen.getByRole("button", { name: "Zoom in" }));

  expect(points()).toBeLessThan(9);
  expect(screen.getByText(/showing trades \d+–\d+ · drag to pan/)).toBeVisible();
  const zoomedLabel = screen.getByText(/showing trades/).textContent;

  vi.spyOn(graph, "getBoundingClientRect").mockReturnValue({ left: 0, width: 760, height: 248 });
  fireEvent.mouseDown(graph, { clientX: 600 });
  fireEvent.mouseMove(graph, { clientX: 200 });
  fireEvent.mouseUp(graph);

  expect(screen.getByText(/showing trades/).textContent).not.toEqual(zoomedLabel);

  fireEvent.click(screen.getByRole("button", { name: "Fit" }));

  expect(points()).toBe(9);
  expect(screen.getByText(/reconstructed from the journal/)).toBeVisible();
  expect(screen.getByRole("button", { name: "Zoom out" })).toBeDisabled();
});

test("keeps the performance graph useful before trade history exists", async () => {
  api.getTradeSnapshot.mockResolvedValue({ ...TRADE_FIXTURE, journal: [] });
  render(<App />);

  fireEvent.click(screen.getByRole("button", { name: "Open trade companion" }));

  expect(await screen.findByText("Waiting for closed-trade history")).toBeVisible();
  expect(screen.getByRole("img", { name: "Closed-trade equity performance graph" })).toBeVisible();
  expect(screen.getByText("0 closed trades")).toBeVisible();
});

test("refreshes Trade Companion snapshots without enabling execution", async () => {
  render(<App />);
  fireEvent.click(screen.getByRole("button", { name: "Open trade companion" }));
  await screen.findByRole("heading", { name: "Trade Companion" });

  fireEvent.click(screen.getByRole("button", { name: "Refresh trade data" }));

  await waitFor(() => expect(api.getTradeSnapshot).toHaveBeenCalledTimes(2));
  expect(screen.getByText("OpenTrade remains the execution boundary.")).toBeVisible();
});

test("keeps the performance graph updated while Trade Companion is open", async () => {
  vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
  render(<App />);
  fireEvent.click(screen.getByRole("button", { name: "Open trade companion" }));
  expect(await screen.findByText("1 closed trade")).toBeVisible();

  api.getTradeSnapshot.mockResolvedValue({
    ...TRADE_FIXTURE,
    journal: [
      ...TRADE_FIXTURE.journal,
      { symbol: "MSFT", pnl: -20, exitedAt: "2026-07-16T15:00:00+00:00" },
    ],
  });
  vi.advanceTimersByTime(15000);

  expect(await screen.findByText("2 closed trades")).toBeVisible();
  expect(api.getTradeSnapshot).toHaveBeenCalledTimes(2);

  fireEvent.click(screen.getByRole("button", { name: "Return to agent desk" }));
  vi.advanceTimersByTime(15000);
  expect(api.getTradeSnapshot).toHaveBeenCalledTimes(2);
});

test("launches one read-only morning email triage per local day", async () => {
  hoursSpy.mockReturnValue(8);
  api.sendMessage.mockReturnValue(new Promise(() => {}));

  const firstLaunch = render(<App />);

  await waitFor(() => {
    expect(api.sendMessage).toHaveBeenCalledWith(
      expect.stringContaining("unread email"), "claude", "sonnet"
    );
  });
  expect(api.sendMessage.mock.calls[0][0]).toContain(
    "Do not send, delete, or mark anything read."
  );
  expect(
    screen.getByRole("heading", { name: "Morning email triage" })
  ).toBeVisible();

  firstLaunch.unmount();
  render(<App />);

  await waitFor(() => expect(api.sendMessage).toHaveBeenCalledTimes(1));
});

test("does not launch morning email triage until Gmail is connected", async () => {
  hoursSpy.mockReturnValue(8);
  appState.status.email = {
    connected: false,
    address: "",
    provider: "Gmail",
    readOnly: true,
  };

  render(<App />);

  await waitFor(() => expect(api.sendMessage).not.toHaveBeenCalled());
});

test("wires every available character image into a matching desktop-agent surface", () => {
  const source = readFileSync(resolve(process.cwd(), "src", "App.jsx"), "utf8");
  const expectedAssets = [
    "/Usagi.png",
    "/characters/usagi-button.png",
    "/characters/usagi-idle.png",
    "/characters/usagi-thinking-cutout.png",
    "/characters/usagi-working-cutout.png",
    "/characters/chiikawa-checking.gif",
    "/characters/usagi-delivered.png",
    "/characters/usagi-celebrate.png",
    "/characters/usagi-sad-cutout.png",
    "/characters/usagi-hungry.png",
    "/characters/usagi-portrait.png",
    "/characters/usagi-pose.png",
  ];

  expectedAssets.forEach((asset) => expect(source).toContain(asset));
});

test("keeps the square Current-run artwork fully visible", () => {
  const styles = readFileSync(resolve(process.cwd(), "src", "App.css"), "utf8");
  const heroRule = styles.match(/\.inspector-hero\s*\{([^}]*)\}/)?.[1] || "";

  expect(heroRule).toMatch(/aspect-ratio:\s*1/);
  expect(heroRule).toMatch(/object-fit:\s*contain/);
});

test("keeps the local backend desktop-only without a browser launcher", () => {
  const source = readFileSync(resolve(process.cwd(), "..", "usagi_web.pyw"), "utf8");

  expect(source).not.toContain("import webbrowser");
  expect(source).not.toContain("webbrowser.open");
  expect(source).toContain("def start_server() -> None:");
});

test("toggles between light and dark themes", () => {
  render(<App />);

  const toggle = screen.getByRole("button", { name: "Switch to dark mode" });
  expect(toggle).toBeVisible();
  expect(document.documentElement.getAttribute("data-theme")).toBe("light");

  fireEvent.click(toggle);

  expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
  expect(screen.getByRole("button", { name: "Switch to light mode" })).toBeVisible();

  fireEvent.click(screen.getByRole("button", { name: "Switch to light mode" }));

  expect(document.documentElement.getAttribute("data-theme")).toBe("light");
  expect(screen.getByRole("button", { name: "Switch to dark mode" })).toBeVisible();
});

