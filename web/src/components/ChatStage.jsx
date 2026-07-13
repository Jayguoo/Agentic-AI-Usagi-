import { useState, useRef, useEffect, useCallback } from "react";
import MessageBubble from "./MessageBubble";
import ApprovalTray from "./ApprovalTray";
import ReminderTray from "./ReminderTray";
import { SendIcon, RefreshIcon } from "./icons";
import { Sparkle, Star, Cloud, Carrot } from "./decorations";
import useChat from "../hooks/useChat";

const suggestions = [
  "Give me my daily briefing",
  "Research the web for…",
  "Check my email",
  "Remind me at…",
];

export default function ChatStage({
  status,
  onRefresh,
  composerSeed,
  actions,
  approvingId,
  onApprove,
  onViewApprovals,
  dueReminders,
  reminderWorkingId,
  onReminderAction,
  onStatusUpdate,
  addActivity,
  onBusyChange,
}) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const scrollRef = useRef(null);
  const inputRef = useRef(null);

  const { busy, send } = useChat(
    useCallback(
      (answer, newStatus) => {
        setMessages((prev) => [...prev, { speaker: "Usagi", body: answer }]);
        if (newStatus) onStatusUpdate(newStatus);
        addActivity("Reply received.");
      },
      [onStatusUpdate, addActivity]
    )
  );

  useEffect(() => {
    onBusyChange(busy);
  }, [busy, onBusyChange]);

  useEffect(() => {
    if (scrollRef.current)
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, busy]);

  const seedInput = useCallback((text) => {
    setInput(text);
    const el = inputRef.current;
    if (el) {
      el.focus();
      requestAnimationFrame(() => {
        el.style.height = "auto";
        el.style.height = `${el.scrollHeight}px`;
      });
    }
  }, []);

  useEffect(() => {
    if (composerSeed) seedInput(composerSeed.text);
  }, [composerSeed, seedInput]);

  function autoGrow(e) {
    setInput(e.target.value);
    e.target.style.height = "auto";
    e.target.style.height = `${e.target.scrollHeight}px`;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const text = input.trim();
    if (!text || busy) return;
    setInput("");
    if (inputRef.current) inputRef.current.style.height = "auto";
    setMessages((prev) => [...prev, { speaker: "Jay", body: text }]);
    addActivity("Message sent.");
    try {
      await send(text);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        { speaker: "Usagi", body: `Error: ${err.message}`, tone: "error" },
      ]);
      addActivity("Error — see chat.");
    }
  }

  return (
    <section className="stage">
      <header className="stage-head">
        <h1>Chat</h1>
        <span className="chip blush">
          Memory <strong>{status.memoryFacts}</strong>
        </span>
        <span className="chip mint">
          Tasks <strong>{status.openTasks}</strong>
        </span>
        <span className="chip cream">
          Skills <strong>{status.skills}</strong>
        </span>
        <button
          className="icon-button"
          onClick={onRefresh}
          title="Refresh status"
          aria-label="Refresh status"
        >
          <RefreshIcon />
        </button>
      </header>

      <div ref={scrollRef} className="messages-scroll">
        {messages.length === 0 && !busy ? (
          <div className="chat-empty">
            <span className="deco deco-cloud" aria-hidden="true">
              <Cloud size={34} />
            </span>
            <span className="deco deco-sparkle" aria-hidden="true">
              <Sparkle size={22} />
            </span>
            <span className="deco deco-star" aria-hidden="true">
              <Star size={18} />
            </span>
            <span className="deco deco-carrot" aria-hidden="true">
              <Carrot size={26} />
            </span>
            <img src="/Usagi.png" alt="" />
            <h2>Hi Jay, I'm here.</h2>
            <p>
              Ask me to search your notes, stage a task, or check on your AIOS.
              Anything I want to save shows up for your OK first.
            </p>
            <div className="suggestions">
              {suggestions.map((text) => (
                <button key={text} onClick={() => seedInput(text)}>
                  {text}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="messages" aria-live="polite">
            {messages.map((msg, i) => (
              <MessageBubble
                key={i}
                speaker={msg.speaker}
                body={msg.body}
                tone={msg.tone}
              />
            ))}
            {busy && (
              <div className="msg-row usagi">
                <span className="msg-avatar thinking" aria-hidden="true">
                  <video
                    src="/graphics/usagi-thinking.mp4"
                    autoPlay
                    loop
                    muted
                    playsInline
                  />
                  <img src="/Usagi.png" alt="" />
                </span>
                <div className="msg-bubble" aria-label="Usagi is thinking">
                  <span className="typing">
                    <i />
                    <i />
                    <i />
                  </span>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <ReminderTray
        reminders={dueReminders}
        workingId={reminderWorkingId}
        onAction={onReminderAction}
      />

      <ApprovalTray
        actions={actions}
        approvingId={approvingId}
        onApprove={onApprove}
        onViewAll={onViewApprovals}
      />

      <div className="composer-wrap">
        <form className="composer" onSubmit={handleSubmit}>
          <textarea
            ref={inputRef}
            rows="1"
            placeholder="Message Usagi…"
            value={input}
            onChange={autoGrow}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                e.target.form.requestSubmit();
              }
            }}
          />
          <button
            className="send-button"
            type="submit"
            disabled={busy || !input.trim()}
            aria-label={busy ? "Usagi is thinking" : "Send message"}
          >
            <SendIcon />
          </button>
        </form>
        <p className="composer-hint">Enter to send · Shift+Enter for a new line</p>
      </div>
    </section>
  );
}
