import React from "react";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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
  account: { status: "ACTIVE", equity: 10000, cash: 6200, buyingPower: 12400, currency: "USD" },
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
  decisions: [{ time: "2026-07-16T14:27:00+00:00", action: "preflight failed", mode: "market-open", ok: false, detail: "drawdown guard blocked trading" }],
  journal: [{ symbol: "AAPL", side: "BUY", strategy: "breakout", pnl: 42.5, returnPct: 0.012, outcome: "take_profit", exitedAt: "2026-07-15T18:00:00+00:00" }],
  performance: {
    objective: { candidates: 1, passed: 0, failed: 1, autoApproval: false },
    walkForward: [{ symbol: "AAPL", returnPct: 0.08, maxDrawdown: -0.04, stressDrawdown: -0.09, windows: 3 }],
    paper: { ok: true, blocked: false, mode: "paper", submitted: 0 },
  },
  freshness: { status: "stale", syncedAt: "2026-07-11T22:34:00+00:00", ageMinutes: 6231, files: [{ label: "Portfolio", updatedAt: "2026-07-11T22:34:00+00:00", ageMinutes: 6231 }] },
};

beforeEach(() => {
  hoursSpy = vi.spyOn(Date.prototype, "getHours").mockReturnValue(14);
  api.getTradeSnapshot.mockResolvedValue(TRADE_FIXTURE);
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

test("keeps one-click email triage available as a persistent quick action", () => {
  api.sendMessage.mockReturnValue(new Promise(() => {}));
  render(<App />);

  const quickActions = screen.getByRole("group", { name: "Quick actions" });
  fireEvent.click(within(quickActions).getByRole("button", { name: "Email" }));

  expect(api.sendMessage).toHaveBeenCalledWith(
    "Check my email and triage what matters."
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
      { symbol: "MSFT", pnl: -125, exitedAt: "2026-07-14T18:00:00+00:00" },
      { symbol: "NVDA", pnl: 210, exitedAt: "2026-07-13T18:00:00+00:00" },
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

  fireEvent.click(screen.getByRole("button", { name: "Drawdown" }));

  expect(screen.getByRole("img", { name: "Closed-trade drawdown performance graph" })).toBeVisible();
  expect(screen.getByText("Worst drawdown")).toBeVisible();
  expect(screen.queryByRole("button", { name: /place order/i })).not.toBeInTheDocument();
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

test("launches one read-only morning email triage per local day", async () => {
  hoursSpy.mockReturnValue(8);
  api.sendMessage.mockReturnValue(new Promise(() => {}));

  const firstLaunch = render(<App />);

  await waitFor(() => {
    expect(api.sendMessage).toHaveBeenCalledWith(
      expect.stringContaining("unread email")
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
