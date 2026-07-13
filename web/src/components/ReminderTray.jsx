export default function ReminderTray({ reminders, workingId, onAction }) {
  if (reminders.length === 0) return null;

  return (
    <div className="tray">
      <div className="tray-inner reminders">
        <div className="tray-head">
          <strong>Reminders due</strong>
          <span className="count">{reminders.length}</span>
        </div>
        <div className="tray-cards">
          {reminders.map((reminder) => (
            <article key={reminder.id} className="approval-card">
              <div className="meta">
                <strong>{reminder.text}</strong>
                <small>{reminder.due_at}</small>
              </div>
              <div className="remind-actions">
                <button
                  className="snooze-button"
                  onClick={() => onAction(reminder.id, "snooze")}
                  disabled={workingId === reminder.id}
                >
                  +1h
                </button>
                <button
                  className="approve-button"
                  onClick={() => onAction(reminder.id, "done")}
                  disabled={workingId === reminder.id}
                >
                  Done
                </button>
              </div>
            </article>
          ))}
        </div>
      </div>
    </div>
  );
}
