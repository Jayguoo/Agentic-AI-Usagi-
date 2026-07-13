import { useState, useCallback, useEffect } from "react";
import Rail from "./components/Rail";
import ChatStage from "./components/ChatStage";
import Drawer from "./components/Drawer";
import useStatus from "./hooks/useStatus";
import { approveAction, openTarget, reminderAction } from "./api";

const toolPresets = {
  status: "Show my Usagi status and summarize the important bits.",
  workflow:
    "Run the workflow_audit skill. Interview me about repeated weekly work, then produce a ranked skill chart.",
  briefing: "Give me my daily briefing.",
  research: "Research the web for: ",
  email: "Check my email and triage what matters.",
};

export default function App() {
  const { status, refresh } = useStatus();
  const [pendingActions, setPendingActions] = useState([]);
  const [activityItems, setActivityItems] = useState([
    { time: new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }), text: "Usagi opened." },
  ]);
  const [busy, setBusy] = useState(false);
  const [activePanel, setActivePanel] = useState(null);
  const [approvingId, setApprovingId] = useState(null);
  const [reminderWorkingId, setReminderWorkingId] = useState(null);
  const [dueReminders, setDueReminders] = useState([]);
  const [composerSeed, setComposerSeed] = useState(null);

  useEffect(() => {
    if (status.actions) setPendingActions(status.actions);
  }, [status.actions]);

  useEffect(() => {
    if (status.dueReminders) setDueReminders(status.dueReminders);
  }, [status.dueReminders]);

  const addActivity = useCallback((text) => {
    const time = new Date().toLocaleTimeString([], {
      hour: "numeric",
      minute: "2-digit",
    });
    setActivityItems((prev) => [{ time, text }, ...prev]);
  }, []);

  const handleStatusUpdate = useCallback(
    (newStatus) => {
      if (newStatus && newStatus.actions) setPendingActions(newStatus.actions);
      if (newStatus) refresh();
    },
    [refresh]
  );

  const handleApprove = useCallback(
    async (id) => {
      setApprovingId(id);
      try {
        const data = await approveAction(id);
        if (data.status && data.status.actions)
          setPendingActions(data.status.actions);
        refresh();
        addActivity("Approved a pending change.");
      } catch (e) {
        addActivity(`Error approving: ${e.message}`);
      } finally {
        setApprovingId(null);
      }
    },
    [refresh, addActivity]
  );

  const handleReminderAction = useCallback(
    async (id, op) => {
      setReminderWorkingId(id);
      try {
        const data = await reminderAction(id, op);
        if (data.status && data.status.dueReminders)
          setDueReminders(data.status.dueReminders);
        refresh();
        addActivity(op === "done" ? "Reminder completed." : "Reminder snoozed 1h.");
      } catch (e) {
        addActivity(`Error updating reminder: ${e.message}`);
      } finally {
        setReminderWorkingId(null);
      }
    },
    [refresh, addActivity]
  );

  const seedComposer = useCallback((text) => {
    setComposerSeed({ text, at: Date.now() });
    setActivePanel(null);
  }, []);

  const handleTool = useCallback(
    async (action) => {
      if (toolPresets[action]) {
        seedComposer(toolPresets[action]);
        return;
      }
      try {
        await openTarget(action);
        addActivity(`Opened ${action}.`);
      } catch (e) {
        addActivity(`Error opening ${action}: ${e.message}`);
      }
      setActivePanel(null);
    },
    [seedComposer, addActivity]
  );

  return (
    <div className="app">
      <Rail
        busy={busy}
        pendingCount={pendingActions.length}
        activePanel={activePanel}
        onNavigate={setActivePanel}
      />

      <ChatStage
        status={status}
        onRefresh={refresh}
        composerSeed={composerSeed}
        actions={pendingActions}
        approvingId={approvingId}
        onApprove={handleApprove}
        onViewApprovals={() => setActivePanel("approvals")}
        dueReminders={dueReminders}
        reminderWorkingId={reminderWorkingId}
        onReminderAction={handleReminderAction}
        onStatusUpdate={handleStatusUpdate}
        addActivity={addActivity}
        onBusyChange={setBusy}
      />

      {activePanel && (
        <Drawer
          panel={activePanel}
          onClose={() => setActivePanel(null)}
          actions={pendingActions}
          approvingId={approvingId}
          onApprove={handleApprove}
          onTool={handleTool}
          activityItems={activityItems}
        />
      )}
    </div>
  );
}
