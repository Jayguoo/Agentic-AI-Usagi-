import { useEffect, useState } from "react";

export default function EmailConnection({ asset, onClose, onConnect, open }) {
  const [address, setAddress] = useState("");
  const [appPassword, setAppPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setAppPassword("");
    setError("");
  }, [open]);

  if (!open) return null;

  const handleSubmit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await onConnect(address.trim(), appPassword);
    } catch (connectionError) {
      setError(connectionError.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="email-connect-layer">
      <section
        className="email-connect-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="email-connect-title"
      >
        <aside className="email-connect-companion">
          <span>PRIVATE CONNECTION</span>
          <img src={asset} alt="Usagi checking Gmail settings" />
          <strong>Read, prioritize, report.</strong>
          <p>Usagi can inspect unread mail without changing your inbox.</p>
        </aside>

        <form onSubmit={handleSubmit}>
          <header>
            <div>
              <span>GMAIL · READ ONLY</span>
              <h2 id="email-connect-title">Connect Gmail</h2>
            </div>
            <button
              type="button"
              className="email-connect-close"
              aria-label="Close Gmail setup"
              onClick={onClose}
              disabled={busy}
            >
              ×
            </button>
          </header>

          <p className="email-connect-intro">
            Use a Google app password, never your normal Gmail password. It is encrypted
            for this Windows account and stays on this computer.
          </p>

          <label htmlFor="gmail-address">Gmail address</label>
          <input
            id="gmail-address"
            type="email"
            value={address}
            onChange={(event) => setAddress(event.target.value)}
            placeholder="you@gmail.com"
            autoComplete="email"
            disabled={busy}
            required
            autoFocus
          />

          <label htmlFor="gmail-app-password">16-character app password</label>
          <input
            id="gmail-app-password"
            type="password"
            value={appPassword}
            onChange={(event) => setAppPassword(event.target.value)}
            placeholder="xxxx xxxx xxxx xxxx"
            autoComplete="off"
            disabled={busy}
            required
          />

          <div className="email-scope" aria-label="Gmail access boundaries">
            <span>Unread headers only</span>
            <span>Never marks read</span>
            <span>No send or delete</span>
          </div>

          {error && <p className="email-connect-error" role="alert">{error}</p>}

          <footer>
            <small>Connection is verified before anything is saved.</small>
            <button type="submit" disabled={busy || !address.trim() || !appPassword.trim()}>
              {busy ? "Verifying…" : "Connect Gmail"}
            </button>
          </footer>
        </form>
      </section>
    </div>
  );
}
