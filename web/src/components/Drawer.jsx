import { useEffect, useRef } from "react";
import { CloseIcon, ChatIcon, ToolsIcon, ActivityIcon, ApprovalsIcon } from "./icons";

const tools = [
  {
    action: "briefing",
    label: "Daily briefing",
    desc: "Tasks, approvals, reminders, Daily note, mail.",
    swatch: "cream",
    Icon: ActivityIcon,
  },
  {
    action: "research",
    label: "Web research",
    desc: "Search the web with sources cited.",
    swatch: "sky",
    Icon: ChatIcon,
  },
  {
    action: "email",
    label: "Email triage",
    desc: "Read-only pass over unread inbox mail.",
    swatch: "mint",
    Icon: ApprovalsIcon,
  },
  {
    action: "status",
    label: "Status report",
    desc: "Ask Usagi to summarize the AIOS state.",
    swatch: "blush",
    Icon: ApprovalsIcon,
  },
  {
    action: "workflow",
    label: "Workflow audit",
    desc: "Find repeated work worth turning into skills.",
    swatch: "mint",
    Icon: ActivityIcon,
  },
  {
    action: "skills",
    label: "Skills folder",
    desc: "Open saved skills on disk.",
    swatch: "sky",
    Icon: ToolsIcon,
  },
  {
    action: "knowledge",
    label: "Knowledge folder",
    desc: "Open knowledge areas on disk.",
    swatch: "cream",
    Icon: ToolsIcon,
  },
  {
    action: "vault",
    label: "Obsidian vault",
    desc: "Open the vault Usagi searches.",
    swatch: "blush",
    Icon: ChatIcon,
  },
];

const titles = {
  approvals: "Approvals",
  tools: "Tools",
  activity: "Activity",
};

export default function Drawer({
  panel,
  onClose,
  actions,
  approvingId,
  onApprove,
  onTool,
  activityItems,
}) {
  const closeRef = useRef(null);

  useEffect(() => {
    if (closeRef.current) closeRef.current.focus();
    function onKey(e) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <>
      <button className="backdrop" aria-label="Close panel" onClick={onClose} />
      <aside className="drawer" role="dialog" aria-label={titles[panel]}>
        <div className="drawer-head">
          <h2>{titles[panel]}</h2>
          <button
            ref={closeRef}
            className="icon-button"
            onClick={onClose}
            aria-label="Close"
          >
            <CloseIcon />
          </button>
        </div>

        <div className="drawer-body">
          {panel === "approvals" &&
            (actions.length === 0 ? (
              <p className="empty-note">
                Nothing waiting right now. When Usagi wants to save notes,
                tasks, or memory changes, they show up here for your OK before
                anything is written.
              </p>
            ) : (
              actions.map((action) => (
                <article key={action.id} className="approval-card">
                  <div className="meta">
                    <strong>{action.summary || action.kind}</strong>
                    <small>{action.id}</small>
                  </div>
                  <button
                    className="approve-button"
                    onClick={() => onApprove(action.id)}
                    disabled={approvingId === action.id}
                  >
                    {approvingId === action.id ? "Approving…" : "Approve"}
                  </button>
                </article>
              ))
            ))}

          {panel === "tools" &&
            tools.map(({ action, label, desc, swatch, Icon }) => (
              <button
                key={action}
                className="tool-row"
                onClick={() => onTool(action)}
              >
                <span className={`tool-swatch ${swatch}`}>
                  <Icon />
                </span>
                <span className="tool-copy">
                  <strong>{label}</strong>
                  <span>{desc}</span>
                </span>
              </button>
            ))}

          {panel === "activity" &&
            activityItems.map((item, i) => (
              <div key={i} className="activity-item">
                <time>{item.time}</time>
                <span>{item.text}</span>
              </div>
            ))}
        </div>
      </aside>
    </>
  );
}
