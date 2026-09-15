const BASE = "";

export async function api(path, options = {}) {
  const res = await fetch(BASE + path, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Request failed.");
  return data;
}

export function getStatus() {
  return api("/api/status");
}

export function getTradeSnapshot() {
  return api("/api/trades");
}

export function connectEmail(address, appPassword) {
  return api("/api/email/connect", {
    method: "POST",
    body: JSON.stringify({ address, appPassword }),
  });
}

export function sendMessage(message) {
  return api("/api/chat", {
    method: "POST",
    body: JSON.stringify({ message }),
  });
}

export function approveAction(id) {
  return api("/api/approve", {
    method: "POST",
    body: JSON.stringify({ id }),
  });
}

export function reminderAction(id, op) {
  return api("/api/reminder", {
    method: "POST",
    body: JSON.stringify({ id, op }),
  });
}

export function openTarget(target) {
  return api("/api/open", {
    method: "POST",
    body: JSON.stringify({ target }),
  });
}
