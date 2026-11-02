import { MARK_BOUNDS, MARK_PATHS } from "./mark";
import styles from "./Logo.module.css";

const VIEW_BOX = `${MARK_BOUNDS.min} ${MARK_BOUNDS.min} ${MARK_BOUNDS.max - MARK_BOUNDS.min} ${
  MARK_BOUNDS.max - MARK_BOUNDS.min
}`;

interface MarkProps {
  size?: number;
  className?: string;
  title?: string;
}

export function LogoMark({ size = 18, className, title }: MarkProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox={VIEW_BOX}
      className={[styles.mark, className].filter(Boolean).join(" ")}
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      focusable="false"
    >
      <path d={MARK_PATHS.base} className={styles.base} />
      <path d={MARK_PATHS.lock} className={styles.lock} />
    </svg>
  );
}

export function Logo({ size = 18, className }: { size?: number; className?: string }) {
  return (
    <span className={[styles.logo, className].filter(Boolean).join(" ")}>
      <LogoMark size={size} />
      <span className={styles.wordmark}>Lockstep</span>
    </span>
  );
}
