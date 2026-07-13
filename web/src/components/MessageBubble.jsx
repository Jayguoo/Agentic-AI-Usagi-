export default function MessageBubble({ speaker, body, tone }) {
  const side = speaker === "Jay" ? "jay" : "usagi";
  return (
    <div className={`msg-row ${side}`}>
      {side === "usagi" && (
        <span className="msg-avatar" aria-hidden="true">
          <img src="/Usagi.png" alt="" />
        </span>
      )}
      <article className={`msg-bubble${tone ? ` ${tone}` : ""}`} aria-label={speaker}>
        <pre>{body}</pre>
      </article>
    </div>
  );
}
