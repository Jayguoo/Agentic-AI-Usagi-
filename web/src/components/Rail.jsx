import { useState, useEffect } from "react";
import { ChatIcon, ApprovalsIcon, ToolsIcon, ActivityIcon } from "./icons";

function clock() {
  return new Date().toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
}

function today() {
  return new Date().toLocaleDateString([], {
    weekday: "long",
    month: "short",
    day: "numeric",
  });
}

const navItems = [
  { id: "chat", label: "Chat", Icon: ChatIcon },
  { id: "approvals", label: "Approvals", Icon: ApprovalsIcon },
  { id: "tools", label: "Tools", Icon: ToolsIcon },
  { id: "activity", label: "Activity", Icon: ActivityIcon },
];

export default function Rail({ busy, pendingCount, activePanel, onNavigate }) {
  const [time, setTime] = useState(clock);

  useEffect(() => {
    const id = setInterval(() => setTime(clock()), 30000);
    return () => clearInterval(id);
  }, []);

  return (
    <nav className="rail" aria-label="Usagi navigation">
      <div className="rail-identity">
        <span className={`rail-avatar${busy ? " busy" : ""}`}>
          <img src="/Usagi.png" alt="" />
          <span className="status-dot" aria-hidden="true" />
        </span>
        <span className="rail-name">
          <strong>Usagi</strong>
          <span>{busy ? "Thinking…" : "Ready"}</span>
        </span>
      </div>

      <div className="rail-nav">
        {navItems.map(({ id, label, Icon }) => {
          const current = id === "chat" ? activePanel === null : activePanel === id;
          return (
            <button
              key={id}
              className={current ? "current" : ""}
              aria-current={current ? "page" : undefined}
              onClick={() => onNavigate(id === "chat" ? null : id)}
            >
              <Icon />
              <span className="label">{label}</span>
              {id === "approvals" && pendingCount > 0 && (
                <span className="badge">{pendingCount}</span>
              )}
            </button>
          );
        })}
      </div>

      <div className="rail-foot">
        <span className="clock">{time}</span>
        <span className="date">{today()}</span>
      </div>
    </nav>
  );
}
