import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import useStatus from "./hooks/useStatus";
import {
  approveAction,
  connectEmail,
  getTradeSnapshot,
  openTarget,
  reminderAction,
  sendMessage,
  setPlanApproval,
  setTradeAccount,
  setTradeReadOnly,
} from "./api";
import EmailConnection from "./components/EmailConnection";
import TradeCompanion from "./components/TradeCompanion";
import {
  ActivityIcon,
  ApprovalsIcon,
  ChatIcon,
  MoonIcon,
  RefreshIcon,
  SendIcon,
  SunIcon,
  ToolsIcon,
} from "./components/icons";

const PHASES = ["listen", "sniff", "dash", "bonk", "deliver"];

const TRADE_POLL_MS = 15000;

const MORNING_EMAIL_TASK =
  "Morning email triage: check my unread email, identify what is important or urgent, and give me a concise prioritized list. Do not send, delete, or mark anything read.";

const ASSETS = {
  default: "/Usagi.png",
  button: "/characters/usagi-button.png",
  idle: "/characters/usagi-idle.png",
  thinking: "/characters/usagi-thinking-cutout.png",
  working: "/characters/usagi-working-cutout.png",
  checking: "/characters/chiikawa-checking.gif",
  delivered: "/characters/usagi-delivered.png",
  celebrate: "/characters/usagi-celebrate.png",
  sad: "/characters/usagi-sad-cutout.png",
  hungry: "/characters/usagi-hungry.png",
  portrait: "/characters/usagi-portrait.png",
  pose: "/characters/usagi-pose.png",
};

const PHASE_ASSETS = {
  listen: ASSETS.idle,
  sniff: ASSETS.thinking,
  dash: ASSETS.working,
  bonk: ASSETS.checking,
  deliver: ASSETS.delivered,
};

const PHASE_COPY = {
  listen: {
    label: "Listen",
    state: "Listening with both ears",
    detail: "Ready for a useful desktop task.",
  },
  sniff: {
    label: "Sniff",
    state: "Mapping the task",
    detail: "Reading intent, context, and safety boundaries.",
  },
  dash: {
    label: "Dash",
    state: "Calling local tools",
    detail: "Usagi is moving through the useful parts of the request.",
  },
  bonk: {
    label: "Bonk",
    state: "Checking the result",
    detail: "Reviewing the run and correcting anything uncertain.",
  },
  deliver: {
    label: "Deliver",
    state: "Task bundle delivered",
    detail: "The finished response is ready on your desk.",
  },
};

const QUICK_ACTIONS = [
  {
    id: "briefing",
    label: "Briefing",
    taskLabel: "Daily briefing",
    prompt: "Give me my daily briefing.",
    runImmediately: true,
  },
  {
    id: "email",
    label: "Email",
    taskLabel: "Email triage",
    prompt: "Check my email and triage what matters.",
    runImmediately: true,
  },
  {
    id: "research",
    label: "Research",
    prompt: "Research the web for: ",
  },
  {
    id: "reminder",
    label: "Reminder",
    prompt: "Remind me at: ",
  },
];

const TOOL_PRESETS = [
  {
    action: "opentrade",
    label: "OpenTrade project",
    detail: "Open the connected read-only trading workspace.",
    asset: ASSETS.pose,
  },
  {
    action: "briefing",
    label: "Daily briefing",
    detail: "Tasks, approvals, reminders, notes, and mail.",
    prompt: "Give me my daily briefing.",
    asset: ASSETS.portrait,
  },
  {
    action: "research",
    label: "Research",
    detail: "Search the web and return cited sources.",
    prompt: "Research the web for: ",
    asset: ASSETS.working,
  },
  {
    action: "email",
    label: "Email triage",
    detail: "Read-only review of unread mail.",
    prompt: "Check my email and triage what matters.",
    asset: ASSETS.default,
  },
  {
    action: "status",
    label: "Status report",
    detail: "Summarize the local AIOS state.",
    prompt: "Show my Usagi status and summarize the important bits.",
    asset: ASSETS.delivered,
  },
  {
    action: "workflow",
    label: "Workflow audit",
    detail: "Find repeated work worth turning into skills.",
    prompt:
      "Run the workflow_audit skill. Interview me about repeated weekly work, then produce a ranked skill chart.",
    asset: ASSETS.pose,
  },
  {
    action: "skills",
    label: "Skills folder",
    detail: "Open saved skills on this computer.",
    asset: ASSETS.button,
  },
  {
    action: "knowledge",
    label: "Knowledge folder",
    detail: "Open Usagi's structured knowledge store.",
    asset: ASSETS.thinking,
  },
  {
    action: "vault",
    label: "Obsidian vault",
    detail: "Open the notes Usagi can search.",
    asset: ASSETS.idle,
  },
];

const INSPECTOR_TABS = [
  { id: "run", label: "Current", Icon: ChatIcon },
  { id: "approvals", label: "Review", Icon: ApprovalsIcon },
  { id: "tools", label: "Tools", Icon: ToolsIcon },
  { id: "activity", label: "History", Icon: ActivityIcon },
];

function clock() {
  return new Date().toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
}

function latestUsagiMessage(messages) {
  return [...messages].reverse().find((message) => message.speaker === "Usagi");
}

export default function App() {
  const { status, error: statusError, refresh } = useStatus();
  const morningRunRef = useRef(false);
  const [theme, setTheme] = useState(() => {
    try {
      const saved = localStorage.getItem("usagi.theme");
      if (saved === "light" || saved === "dark") return saved;
    } catch {
      // ignore
    }
    if (
      typeof window !== "undefined" &&
      window.matchMedia &&
      window.matchMedia("(prefers-color-scheme: dark)").matches
    ) {
      return "dark";
    }
    return "light";
  });
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState([]);
  const [activeTask, setActiveTask] = useState("What should Usagi handle next?");
  const [phase, setPhase] = useState("listen");
  const [busy, setBusy] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [muted, setMuted] = useState(false);
  const [inspectorTab, setInspectorTab] = useState("run");
  const [pendingActions, setPendingActions] = useState([]);
  const [dueReminders, setDueReminders] = useState([]);
  const [approvingId, setApprovingId] = useState(null);
  const [reminderWorkingId, setReminderWorkingId] = useState(null);
  const [workspace, setWorkspace] = useState("agent");
  const [tradeSnapshot, setTradeSnapshot] = useState(null);
  const [tradeLoading, setTradeLoading] = useState(false);
  const [tradeError, setTradeError] = useState("");
  const [emailSetupOpen, setEmailSetupOpen] = useState(false);
  const [connection, setConnection] = useState(() => {
    const saved = localStorage.getItem("usagi.connection");
    return ["claude", "codex"].includes(saved) ? saved : "claude";
  });
  const [selectedModel, setSelectedModel] = useState(() =>
    localStorage.getItem(`usagi.model.${connection}`) || ""
  );
  const models = status.modelOptions?.[connection] || [];
  const model = models.some((item) => item.id === selectedModel) ? selectedModel : models[0]?.id || "";
  const [activityItems, setActivityItems] = useState(() => [
    { time: clock(), text: "Native desktop session opened." },
  ]);

  useEffect(() => {
    setPendingActions(status.actions || []);
  }, [status.actions]);

  useEffect(() => {
    setDueReminders(status.dueReminders || []);
  }, [status.dueReminders]);

  useEffect(() => {
    if (!busy) return undefined;
    const dashTimer = window.setTimeout(() => setPhase("dash"), 900);
    const checkTimer = window.setTimeout(() => setPhase("bonk"), 2100);
    return () => {
      window.clearTimeout(dashTimer);
      window.clearTimeout(checkTimer);
    };
  }, [busy]);

  const addActivity = useCallback((text) => {
    setActivityItems((items) => [{ time: clock(), text }, ...items].slice(0, 16));
  }, []);

  const playTone = useCallback(
    (kind) => {
      if (muted || !window.AudioContext) return;
      const context = new window.AudioContext();
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      const frequencies = { start: 330, success: 660, error: 180, select: 440 };
      oscillator.type = "sine";
      oscillator.frequency.value = frequencies[kind] || frequencies.select;
      gain.gain.setValueAtTime(0.0001, context.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.045, context.currentTime + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.14);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start();
      oscillator.stop(context.currentTime + 0.15);
      oscillator.addEventListener("ended", () => context.close());
    },
    [muted]
  );

  // Only an explicit toggle saves a choice; otherwise the app keeps following the system theme.
  useEffect(() => {
    if (typeof document !== "undefined") {
      document.documentElement.setAttribute("data-theme", theme);
      document.documentElement.style.colorScheme = theme;
    }
  }, [theme]);

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return undefined;
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const handleMediaChange = (e) => {
      try {
        if (!localStorage.getItem("usagi.theme")) {
          setTheme(e.matches ? "dark" : "light");
        }
      } catch {
        setTheme(e.matches ? "dark" : "light");
      }
    };
    if (mediaQuery.addEventListener) {
      mediaQuery.addEventListener("change", handleMediaChange);
      return () => mediaQuery.removeEventListener("change", handleMediaChange);
    }
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme((current) => {
      const next = current === "dark" ? "light" : "dark";
      try {
        localStorage.setItem("usagi.theme", next);
      } catch {
        // ignore
      }
      addActivity(next === "dark" ? "Switched to dark theme." : "Switched to light theme.");
      playTone("select");
      return next;
    });
  }, [addActivity, playTone]);

  const tradeRequestRef = useRef(false);

  const loadTradeData = useCallback(async ({ silent = false } = {}) => {
    if (tradeRequestRef.current) return null;
    tradeRequestRef.current = true;
    if (!silent) setTradeLoading(true);
    try {
      const data = await getTradeSnapshot();
      setTradeSnapshot(data);
      setTradeError("");
      if (!silent) addActivity("Trade Companion snapshot refreshed.");
      return data;
    } catch (error) {
      setTradeError(error.message);
      if (!silent) {
        addActivity(`Trade Companion error: ${error.message}`);
        playTone("error");
      }
      return null;
    } finally {
      tradeRequestRef.current = false;
      if (!silent) setTradeLoading(false);
    }
  }, [addActivity, playTone]);

  const changeTradeMode = useCallback(async (readOnly) => {
    try {
      const data = await setTradeReadOnly(readOnly);
      setTradeSnapshot(data.trades);
      setTradeError("");
      addActivity(readOnly ? "Trade Companion is read-only again." : "Trade Companion can approve OpenTrade plans.");
      playTone("select");
    } catch (error) {
      setTradeError(error.message);
      addActivity(`Trade mode error: ${error.message}`);
      playTone("error");
    }
  }, [addActivity, playTone]);

  const changeTradeAccount = useCallback(async (id) => {
    try {
      const data = await setTradeAccount(id);
      setTradeSnapshot(data.trades);
      setTradeError("");
      addActivity(`Trade Companion switched to ${data.trades.account?.label || id}.`);
      playTone("select");
    } catch (error) {
      setTradeError(error.message);
      addActivity(`Account switch error: ${error.message}`);
      playTone("error");
    }
  }, [addActivity, playTone]);

  const decidePlan = useCallback(async (symbol, side, decision) => {
    try {
      const data = await setPlanApproval(symbol, side, decision);
      setTradeSnapshot(data.trades);
      setTradeError("");
      addActivity(data.result.detail);
      playTone("success");
    } catch (error) {
      setTradeError(error.message);
      addActivity(`Plan approval error: ${error.message}`);
      playTone("error");
    }
  }, [addActivity, playTone]);

  useEffect(() => {
    if (workspace !== "trade") return undefined;
    const id = window.setInterval(() => void loadTradeData({ silent: true }), TRADE_POLL_MS);
    return () => window.clearInterval(id);
  }, [workspace, loadTradeData]);

  const seedTask = useCallback(
    (text) => {
      setInput(text);
      setInspectorTab("run");
      playTone("select");
    },
    [playTone]
  );

  const launchTask = useCallback(
    async (task, options = {}) => {
      const cleanTask = task.trim();
      const { label = cleanTask, silent = false } = options;
      if (!cleanTask || busy || !model) return false;

      setInput("");
      setHasError(false);
      setActiveTask(label);
      setMessages((items) => [
        ...items,
        { speaker: "Jay", body: cleanTask, time: clock() },
      ]);
      setInspectorTab("run");
      setPhase("sniff");
      setBusy(true);
      addActivity(label === "Morning email triage" ? "Morning email triage launched." : "Task launched.");
      if (!silent) playTone("start");

      try {
        const data = await sendMessage(cleanTask, connection, model);
        setMessages((items) => [
          ...items,
          { speaker: "Usagi", body: data.answer, time: clock() },
        ]);
        if (data.status?.actions) setPendingActions(data.status.actions);
        if (data.status?.dueReminders) setDueReminders(data.status.dueReminders);
        setPhase("deliver");
        addActivity("Task delivered.");
        if (!silent) playTone("success");
        refresh();
        return true;
      } catch (error) {
        setHasError(true);
        setMessages((items) => [
          ...items,
          {
            speaker: "Usagi",
            body: `Error: ${error.message}`,
            tone: "error",
            time: clock(),
          },
        ]);
        setPhase("bonk");
        addActivity(`Task error: ${error.message}`);
        if (!silent) playTone("error");
        return false;
      } finally {
        setBusy(false);
      }
    },
    [addActivity, busy, connection, model, playTone, refresh]
  );

  const handleSubmit = useCallback(
    (event) => {
      event.preventDefault();
      void launchTask(input);
    },
    [input, launchTask]
  );

  const handleQuickAction = useCallback(
    (action) => {
      if ((action.id === "email" || action.id === "briefing") && !status.email?.connected) {
        setEmailSetupOpen(true);
        playTone("select");
        return;
      }
      if (action.runImmediately) {
        void launchTask(action.prompt, { label: action.taskLabel });
        return;
      }
      seedTask(action.prompt);
    },
    [launchTask, playTone, seedTask, status.email?.connected]
  );

  useEffect(() => {
    if (morningRunRef.current) return;
    if (!status.ready || !status.email?.connected || !model) return;

    const now = new Date();
    const hour = now.getHours();
    if (hour < 5 || hour >= 12) return;

    const date = [
      now.getFullYear(),
      String(now.getMonth() + 1).padStart(2, "0"),
      String(now.getDate()).padStart(2, "0"),
    ].join("-");
    const storageKey = `usagi:morning-email:${date}`;
    if (window.localStorage.getItem(storageKey)) return;

    morningRunRef.current = true;
    window.localStorage.setItem(storageKey, "started");
    void launchTask(MORNING_EMAIL_TASK, {
      label: "Morning email triage",
      silent: true,
    }).then((completed) => {
      if (completed) {
        window.localStorage.setItem(storageKey, "complete");
      } else {
        window.localStorage.removeItem(storageKey);
      }
    });
  }, [launchTask, model, status.email?.connected, status.ready]);

  const handleConnectEmail = useCallback(
    async (address, appPassword) => {
      const data = await connectEmail(address, appPassword);
      await refresh();
      setEmailSetupOpen(false);
      addActivity(`Gmail connected for ${data.email.address}.`);
      playTone("success");
      return data;
    },
    [addActivity, playTone, refresh]
  );

  const handleApprove = useCallback(
    async (id) => {
      setApprovingId(id);
      try {
        const data = await approveAction(id);
        setPendingActions(data.status?.actions || []);
        addActivity("Approved a staged change.");
        playTone("success");
        refresh();
      } catch (error) {
        addActivity(`Approval error: ${error.message}`);
        playTone("error");
      } finally {
        setApprovingId(null);
      }
    },
    [addActivity, playTone, refresh]
  );

  const handleReminder = useCallback(
    async (id, op) => {
      setReminderWorkingId(id);
      try {
        const data = await reminderAction(id, op);
        setDueReminders(data.status?.dueReminders || []);
        addActivity(op === "done" ? "Reminder completed." : "Reminder snoozed one hour.");
        playTone("success");
        refresh();
      } catch (error) {
        addActivity(`Reminder error: ${error.message}`);
        playTone("error");
      } finally {
        setReminderWorkingId(null);
      }
    },
    [addActivity, playTone, refresh]
  );

  const handleTool = useCallback(
    async (tool) => {
      if ((tool.action === "email" || tool.action === "briefing") && !status.email?.connected) {
        setEmailSetupOpen(true);
        playTone("select");
        return;
      }
      if (tool.prompt) {
        seedTask(tool.prompt);
        return;
      }
      try {
        await openTarget(tool.action);
        addActivity(`Opened ${tool.label}.`);
        playTone("select");
      } catch (error) {
        addActivity(`Tool error: ${error.message}`);
        playTone("error");
      }
    },
    [addActivity, playTone, seedTask, status.email?.connected]
  );

  const phaseIndex = PHASES.indexOf(phase);
  const phaseCopy = PHASE_COPY[phase];
  const lastDelivery = useMemo(() => latestUsagiMessage(messages), [messages]);
  const approvalCount = pendingActions.length + dueReminders.length;
  const companionAsset = hasError ? ASSETS.sad : PHASE_ASSETS[phase];
  const shellBusy = workspace === "trade" ? tradeLoading : busy;
  const shellStatus = workspace === "trade"
    ? tradeError
      ? "Trading snapshot unavailable"
      : tradeLoading
        ? "Reading OpenTrade snapshots"
        : tradeSnapshot?.risk?.locked
          ? "Risk lock needs attention"
          : "Trade Companion is observing"
    : statusError
      ? "Local service unavailable"
      : busy
        ? phaseCopy.state
        : "Ready on this computer";

  const openTradeCompanion = () => {
    setWorkspace("trade");
    playTone("select");
    void loadTradeData({ silent: Boolean(tradeSnapshot) });
  };

  return (
    <main
      className={`desktop-shell phase-${phase} workspace-${workspace} theme-${theme}`}
      data-theme={theme}
      role="application"
      aria-label="Usagi desktop agent"
    >
      <header className="app-bar">
        <div className="app-brand">
          <span className="brand-mark">
            <img src={ASSETS.button} alt="" />
          </span>
          <div>
            <strong>USAGI</strong>
            <span>{workspace === "trade" ? "Trade companion" : "Desktop agent"}</span>
          </div>
        </div>

        <div className={`app-status ${shellBusy ? "is-busy" : ""}`}>
          <i aria-hidden="true" />
          <span>{shellStatus}</span>
        </div>

        <div className="app-actions">
          <button
            type="button"
            className={`workspace-action ${workspace === "trade" ? "is-trade" : ""}`}
            onClick={() => {
              if (workspace === "trade") {
                setWorkspace("agent");
                playTone("select");
              } else {
                openTradeCompanion();
              }
            }}
            aria-label={workspace === "trade" ? "Return to agent desk" : "Open trade companion"}
          >
            {workspace === "trade" ? "AGENT DESK" : "TRADE COMPANION"}
          </button>
          <button
            type="button"
            className="top-action theme-action"
            onClick={toggleTheme}
            aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
            title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
          >
            {theme === "dark" ? <SunIcon /> : <MoonIcon />}
          </button>
          <button
            type="button"
            className="top-action"
            onClick={() => {
              refresh();
              addActivity("Status refreshed.");
              playTone("select");
            }}
            aria-label="Refresh status"
          >
            <RefreshIcon />
          </button>
          <button
            type="button"
            className="sound-action"
            onClick={() => setMuted((value) => !value)}
            aria-label={muted ? "Enable sound" : "Mute sound"}
          >
            {muted ? "SOUND OFF" : "SOUND ON"}
          </button>
        </div>
      </header>

      {workspace === "trade" ? (
        <TradeCompanion
          snapshot={tradeSnapshot}
          loading={tradeLoading}
          error={tradeError}
          asset={tradeError ? ASSETS.sad : ASSETS.thinking}
          theme={theme}
          onRefresh={() => void loadTradeData()}
          onChangeMode={(readOnly) => void changeTradeMode(readOnly)}
          onChangeAccount={(id) => void changeTradeAccount(id)}
          onDecidePlan={(symbol, side, decision) => void decidePlan(symbol, side, decision)}
          onOpenProject={() => void handleTool(TOOL_PRESETS[0])}
          onAskUsagi={(prompt) => {
            setWorkspace("agent");
            seedTask(prompt);
          }}
        />
      ) : (
      <section className="quiet-task-canvas">
        <section className="task-workspace">
          <header className="task-heading">
            <div>
              <span>ACTIVE DESKTOP TASK</span>
              <h1>{activeTask}</h1>
            </div>
            <div className="task-mode">
              <span>{phaseCopy.label}</span>
              <small>{messages.length || status.openTasks || 0} objects</small>
            </div>
          </header>

          <div className="work-body">
            <section className="usagi-portrait" aria-label="Live companion">
              <span>LIVE COMPANION</span>
              <img
                className={`png-${phase} ${busy ? "is-busy" : ""}`}
                src={companionAsset}
                alt="Usagi companion"
                draggable="false"
              />
              <small>{busy ? phaseCopy.state : "Waiting with both ears open"}</small>
            </section>

            <section className="run-ledger" aria-label="Agent run ledger">
              <header className="run-state">
                <span>{busy ? "IN PROGRESS" : phase === "deliver" ? "DELIVERED" : "READY"}</span>
                <h2>{phaseCopy.state}</h2>
                <p>{phaseCopy.detail}</p>
              </header>

              <div className="run-entries" aria-live="polite">
                {messages.length === 0 ? (
                  <div className="run-welcome">
                    <span>GET STARTED</span>
                    <h3>Choose an action or write a task.</h3>
                    <p>
                      Briefing and email run immediately. Research and reminders stay
                      editable before launch.
                    </p>
                  </div>
                ) : (
                  messages
                    .slice()
                    .reverse()
                    .map((message, index) => (
                      <article
                        className={`run-entry ${message.speaker === "Usagi" ? "delivery" : "request"} ${message.tone || ""}`}
                        key={`${message.time}-${index}`}
                      >
                        <header>
                          <span>{message.speaker === "Usagi" ? "DELIVERY" : "REQUEST"}</span>
                          <time>{message.time}</time>
                        </header>
                        <pre>{message.body}</pre>
                      </article>
                    ))
                )}

                {busy && (
                  <div className="active-run" aria-label="Usagi is working">
                    <div>
                      <i />
                      <i />
                      <i />
                    </div>
                    <span>{phaseCopy.state}</span>
                  </div>
                )}
              </div>
            </section>
          </div>

          <nav className="phase-trail" aria-label="Usagi task phases">
            {PHASES.map((item, index) => (
              <span
                key={item}
                className={index === phaseIndex ? "is-current" : index < phaseIndex ? "is-past" : ""}
                aria-current={index === phaseIndex ? "step" : undefined}
              >
                <i aria-hidden="true" />
                {PHASE_COPY[item].label}
              </span>
            ))}
          </nav>
        </section>

        <aside className="task-inspector" aria-label="Task inspector">
          <header className="inspector-heading">
            <div>
              <span>DESKTOP CONTROL</span>
              <strong>{phaseCopy.state}</strong>
            </div>
            <small>{approvalCount ? `${approvalCount} WAITING` : "LOCAL"}</small>
          </header>

          <nav className="inspector-tabs" aria-label="Inspector sections">
            {INSPECTOR_TABS.map(({ id, label, Icon }) => (
              <button
                type="button"
                key={id}
                className={inspectorTab === id ? "is-active" : ""}
                aria-current={inspectorTab === id ? "page" : undefined}
                onClick={() => {
                  setInspectorTab(id);
                  playTone("select");
                }}
              >
                <Icon />
                <span>{label}</span>
                {id === "approvals" && approvalCount > 0 && <b>{approvalCount}</b>}
              </button>
            ))}
          </nav>

          <div className="inspector-body">
            {inspectorTab === "run" && (
              <section className="inspector-run">
                <span className="section-kicker">CURRENT RUN</span>
                {lastDelivery && (
                  <img
                    className="inspector-hero"
                    src={ASSETS.celebrate}
                    alt="Usagi celebrating"
                  />
                )}
                <h2>{lastDelivery ? "Latest delivery" : "Both ears are listening"}</h2>
                <p>
                  {lastDelivery
                    ? lastDelivery.body
                    : "Launch a task below. Usagi will expose the run state without showing private chain-of-thought."}
                </p>
                <div className="metric-grid">
                  <div><span>MEMORY</span><strong>{status.memoryFacts || 0}</strong></div>
                  <div><span>TASKS</span><strong>{status.openTasks || 0}</strong></div>
                  <div><span>SKILLS</span><strong>{status.skills || 0}</strong></div>
                  <div><span>APPROVALS</span><strong>{pendingActions.length}</strong></div>
                </div>
                <div className="run-checks">
                  <div><i />Local-only interface</div>
                  <div><i />Changes require approval</div>
                  <div><i />Original files stay protected</div>
                </div>
              </section>
            )}

            {inspectorTab === "approvals" && (
              <section className="inspector-list">
                <span className="section-kicker">WAITING FOR YOU</span>
                 {dueReminders.length === 0 && pendingActions.length === 0 && (
                   <div className="empty-inspector">
                     <img src={ASSETS.hungry} alt="Usagi waiting for approval" />
                     <strong>Nothing waiting.</strong>
                    <p>Staged changes and due reminders will appear here.</p>
                  </div>
                )}
                 {dueReminders.map((reminder) => (
                   <article className="inspector-card" key={reminder.id}>
                     <img className="card-art" src={ASSETS.hungry} alt="" />
                    <span>REMINDER</span>
                    <strong>{reminder.text}</strong>
                    <small>{reminder.due_at}</small>
                    <div>
                      <button
                        type="button"
                        onClick={() => handleReminder(reminder.id, "snooze")}
                        disabled={reminderWorkingId === reminder.id}
                      >
                        +1 hour
                      </button>
                      <button
                        type="button"
                        className="primary-small"
                        onClick={() => handleReminder(reminder.id, "done")}
                        disabled={reminderWorkingId === reminder.id}
                      >
                        Done
                      </button>
                    </div>
                  </article>
                ))}
                {pendingActions.map((action) => (
                  <article className="inspector-card" key={action.id}>
                    <span>{action.kind || "STAGED CHANGE"}</span>
                    <strong>{action.summary || action.id}</strong>
                    <small>{action.id}</small>
                    <button
                      type="button"
                      className="primary-small full"
                      onClick={() => handleApprove(action.id)}
                      disabled={approvingId === action.id}
                    >
                      {approvingId === action.id ? "Approving" : "Approve change"}
                    </button>
                  </article>
                ))}
              </section>
            )}

            {inspectorTab === "tools" && (
              <section className="inspector-list">
                <span className="section-kicker">LOCAL TOOLS</span>
                {TOOL_PRESETS.map((tool) => (
                  <button
                    type="button"
                    className="tool-item"
                    key={tool.action}
                   onClick={() => handleTool(tool)}
                 >
                    <img src={tool.asset} alt="" />
                    <div>
                      <strong>{tool.label}</strong>
                      <small>
                        {tool.action === "email" && !status.email?.connected
                          ? "Not connected · Set up read-only Gmail."
                          : tool.detail}
                      </small>
                    </div>
                  </button>
                ))}
              </section>
            )}

            {inspectorTab === "activity" && (
              <section className="inspector-list">
                <span className="section-kicker">SESSION LOG</span>
                {activityItems.map((item, index) => (
                  <div className="activity-item" key={`${item.time}-${index}`}>
                    <time>{item.time}</time>
                    <span>{item.text}</span>
                  </div>
                ))}
              </section>
            )}
          </div>
        </aside>

        <form className="command-row" onSubmit={handleSubmit}>
          <div className="command-shortcuts">
            <label htmlFor="desktop-task">Ask Usagi</label>
            <select
              aria-label="Model connection"
              value={connection}
              disabled={busy}
              onChange={(event) => {
                setConnection(event.target.value);
                setSelectedModel(localStorage.getItem(`usagi.model.${event.target.value}`) || "");
                localStorage.setItem("usagi.connection", event.target.value);
              }}
            >
              <option value="claude">Claude account</option>
              <option value="codex">Codex account</option>
            </select>
            <select
              aria-label="AI model"
              value={model}
              disabled={busy || !models.length}
              onChange={(event) => {
                setSelectedModel(event.target.value);
                localStorage.setItem(`usagi.model.${connection}`, event.target.value);
              }}
            >
              {!models.length && <option value="" disabled>No models available</option>}
              {models.map((item) => (
                <option key={item.id} value={item.id}>{item.name}</option>
              ))}
            </select>
            <div role="group" aria-label="Quick actions">
              {QUICK_ACTIONS.map((action) => (
                <button
                  type="button"
                  key={action.id}
                  className={action.runImmediately ? "runs-now" : ""}
                  disabled={busy}
                  title={action.runImmediately ? "Runs immediately" : "Adds to task"}
                  onClick={() => handleQuickAction(action)}
                >
                  {action.label}
                </button>
              ))}
            </div>
          </div>
          <div className="command-input">
            <img src={ASSETS.default} alt="" />
            <textarea
              id="desktop-task"
              rows="1"
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  event.currentTarget.form.requestSubmit();
                }
              }}
              placeholder="Type a task or choose a quick action"
            />
            <button type="submit" disabled={busy || !input.trim() || !model} aria-label="Run task">
              <SendIcon />
              <span>{busy ? "Running" : "Run task"}</span>
            </button>
          </div>
          <footer>
            <span>ENTER TO RUN / SHIFT+ENTER FOR A NEW LINE</span>
            <span>{statusError || (busy ? phaseCopy.state : phase === "deliver" ? "TASK DELIVERED" : "USAGI IS READY")}</span>
          </footer>
        </form>
      </section>
      )}
      <EmailConnection
        asset={ASSETS.thinking}
        open={emailSetupOpen}
        onClose={() => setEmailSetupOpen(false)}
        onConnect={handleConnectEmail}
      />
    </main>
  );
}
