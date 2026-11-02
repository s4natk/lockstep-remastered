import { parseServerEvent, type ClientMessage, type ServerEvent } from "./protocol";
import { reviewSocketUrl, workerHttpUrl } from "./worker";

export interface SessionHandlers {
  onOpen: () => void;
  onEvent: (event: ServerEvent) => void;
  onFailure: (message: string) => void;
}

export interface SessionHandle {
  close: () => void;
}

/**
 * Opens one Worker session, sends a single message, and reports events until
 * `done` or `error`. After `close()` no handler runs again.
 */
export function openSession(sessionId: string, payload: ClientMessage, handlers: SessionHandlers): SessionHandle {
  let finished = false;
  let socket: WebSocket;

  const finish = () => {
    finished = true;
  };

  try {
    socket = new WebSocket(reviewSocketUrl(sessionId));
  } catch {
    queueMicrotask(() => handlers.onFailure(unreachable()));
    return { close: finish };
  }

  socket.addEventListener("open", () => {
    if (finished) {
      socket.close();
      return;
    }
    handlers.onOpen();
    socket.send(JSON.stringify(payload));
  });

  socket.addEventListener("message", (message) => {
    if (finished) {
      return;
    }
    const event = parseServerEvent(String(message.data));
    if (event === null) {
      return;
    }
    if (event.type === "review-done" || event.type === "chat-done" || event.type === "error") {
      finish();
      handlers.onEvent(event);
      socket.close();
      return;
    }
    handlers.onEvent(event);
  });

  socket.addEventListener("error", () => {
    if (finished) {
      return;
    }
    finish();
    handlers.onFailure(unreachable());
  });

  socket.addEventListener("close", () => {
    if (finished) {
      return;
    }
    finish();
    handlers.onFailure("The connection closed before the Worker finished.");
  });

  return {
    close() {
      if (finished) {
        return;
      }
      finish();
      if (socket.readyState === WebSocket.CONNECTING || socket.readyState === WebSocket.OPEN) {
        socket.close();
      }
    },
  };
}

function unreachable(): string {
  return `Couldn't reach the Lockstep Worker at ${workerHttpUrl()}.`;
}
