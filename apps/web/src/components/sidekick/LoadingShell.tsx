import { AgentMark } from "./Primitives";

export function LoadingShell() {
  return (
    <div className="ls-loading-shell" role="status">
      <AgentMark size={36} motion="working" />
      <span>Opening your workspace…</span>
    </div>
  );
}
