export default function ApprovalTray({ actions, approvingId, onApprove, onViewAll }) {
  if (actions.length === 0) return null;

  const visible = actions.slice(0, 2);
  const hidden = actions.length - visible.length;

  return (
    <div className="tray">
      <div className="tray-inner">
        <div className="tray-head">
          <strong>Waiting for your OK</strong>
          <span className="count">{actions.length}</span>
          <button className="view-all" onClick={onViewAll}>
            {hidden > 0 ? `View all ${actions.length}` : "Open panel"}
          </button>
        </div>
        <div className="tray-cards">
          {visible.map((action) => (
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
          ))}
        </div>
      </div>
    </div>
  );
}
