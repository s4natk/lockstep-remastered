"use client";

import { extraStatementCount, reviewTitle, type ReviewRecord } from "../../lib/review";
import { connectionDetail, connectionLabel, type ConnectionState } from "../../lib/connection";
import { relativeTime } from "../../lib/time";
import { Logo, LogoMark } from "../brand/Logo";
import { IconButton } from "../ui/Button";
import { Icon, type IconName } from "../ui/Icon";
import styles from "./NavSidebar.module.css";

export type WorkspaceView = "review" | "ask";

interface NavSidebarProps {
  view: WorkspaceView;
  collapsed: boolean;
  overlay: boolean;
  history: ReviewRecord[];
  activeId?: string;
  contextCount: number;
  connection: ConnectionState;
  model?: string;
  onView: (view: WorkspaceView) => void;
  onOpenReview: (record: ReviewRecord) => void;
  onExamples: () => void;
  onContext: () => void;
  onSettings: () => void;
  onPalette: () => void;
  onToggleCollapsed: () => void;
  onCloseOverlay: () => void;
}

export function NavSidebar({
  view,
  collapsed,
  overlay,
  history,
  activeId,
  contextCount,
  connection,
  model,
  onView,
  onOpenReview,
  onExamples,
  onContext,
  onSettings,
  onPalette,
  onToggleCollapsed,
  onCloseOverlay,
}: NavSidebarProps) {
  const rail = collapsed && !overlay;

  return (
    <nav className={styles.root} data-collapsed={rail || undefined} data-overlay={overlay || undefined} aria-label="Workspace">
      <div className={styles.brand}>
        {rail ? <LogoMark size={18} title="Lockstep" /> : <Logo size={18} />}
        <IconButton
          icon={rail ? "chevronRight" : "chevronLeft"}
          label={rail ? "Expand sidebar" : "Collapse sidebar"}
          size="sm"
          onClick={onToggleCollapsed}
        />
      </div>

      <div className={styles.section}>
        <NavItem icon="review" label="Review" active={view === "review"} rail={rail} onClick={() => onView("review")} />
        <NavItem icon="ask" label="Ask" active={view === "ask"} rail={rail} onClick={() => onView("ask")} />
        <NavItem icon="search" label="Command palette" rail={rail} onClick={onPalette} />
      </div>

      {!rail ? (
        <div className={styles.history}>
          <h2>Recent</h2>
          {history.length === 0 ? <p className={styles.empty}>Reviews you run stay in this browser.</p> : null}
          <ul>
            {history.map((record) => {
              const extra = extraStatementCount(record);
              return (
                <li key={record.id}>
                  <button
                    type="button"
                    className={styles.review}
                    data-active={record.id === activeId || undefined}
                    onClick={() => {
                      onOpenReview(record);
                      onCloseOverlay();
                    }}
                  >
                    <span className={styles.reviewTitle}>
                      {reviewTitle(record)}
                      {extra > 0 ? <span className={styles.extra}>+{extra}</span> : null}
                    </span>
                    <span className={styles.when}>{relativeTime(record.createdAt)}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      <div className={styles.footer}>
        <NavItem icon="library" label="Examples" rail={rail} onClick={onExamples} />
        <NavItem
          icon="context"
          label="Context"
          badge={contextCount > 0 ? String(contextCount) : undefined}
          rail={rail}
          onClick={onContext}
        />
        <NavItem icon="settings" label="Preferences" rail={rail} onClick={onSettings} />
        <div className={styles.health} data-state={connection} title={connectionDetail(connection, model)}>
          <span className={styles.dot} aria-hidden="true" />
          {rail ? <span className="sr-only">{connectionLabel(connection)}</span> : <span>{connectionDetail(connection, model)}</span>}
        </div>
        <a
          className={styles.credit}
          href="https://github.com/s4natk"
          target="_blank"
          rel="noreferrer"
          title="Built by @s4natk"
        >
          {rail ? <span aria-label="Built by @s4natk">@</span> : "Built by @s4natk"}
        </a>
      </div>
    </nav>
  );
}

function NavItem({
  icon,
  label,
  active,
  badge,
  rail,
  onClick,
}: {
  icon: IconName;
  label: string;
  active?: boolean;
  badge?: string;
  rail: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={styles.item}
      data-active={active || undefined}
      title={rail ? label : undefined}
      onClick={onClick}
    >
      <Icon name={icon} size={16} />
      {rail ? <span className="sr-only">{label}</span> : <span>{label}</span>}
      {badge && !rail ? <span className={styles.badge}>{badge}</span> : null}
    </button>
  );
}
