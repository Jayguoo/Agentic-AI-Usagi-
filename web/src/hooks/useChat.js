import { useState, useCallback } from "react";
import { sendMessage } from "../api";

export default function useChat(onNewMessage) {
  const [busy, setBusy] = useState(false);

  const send = useCallback(
    async (text) => {
      setBusy(true);
      try {
        const data = await sendMessage(text);
        if (onNewMessage) onNewMessage(data.answer, data.status);
        return data;
      } finally {
        setBusy(false);
      }
    },
    [onNewMessage]
  );

  return { busy, send };
}
