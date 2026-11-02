import type { HazardCode } from "@lockstep/shared";

import { hazardLabel } from "../../lib/hazards";
import { Icon, type IconName } from "./Icon";
import styles from "./HazardTag.module.css";

const ICONS: Record<HazardCode, IconName> = {
  data_loss: "dataLoss",
  lock_risk: "lock",
  rewrite: "rewrite",
  safe: "check",
};

export function HazardIcon({ code, size = 14 }: { code: HazardCode; size?: number }) {
  return (
    <span className={`${styles.hz} ${styles.icon}`} data-code={code}>
      <Icon name={ICONS[code]} size={size} />
    </span>
  );
}

interface HazardTagProps {
  code: HazardCode;
  count?: number;
  variant?: "tag" | "inline";
}

export function HazardTag({ code, count, variant = "tag" }: HazardTagProps) {
  return (
    <span className={`${styles.hz} ${styles[variant]}`} data-code={code}>
      <Icon name={ICONS[code]} size={13} />
      <span>{hazardLabel(code)}</span>
      {count !== undefined && count > 1 ? <span className={styles.count}>×{count}</span> : null}
    </span>
  );
}
