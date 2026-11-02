import { Icon } from "./Primitives";

const lines = [
  'File "app/routes/orders.py", line 42',
  "  shipment = build_shipment(payload)",
  'File "app/services/shipping.py", line 18',
  '  postal_code = payload["address"]["postal_code"]',
  "KeyError: 'postal_code'",
];

export function TracePreview() {
  return (
    <div
      className="ls-trace"
      role="img"
      aria-label="Illustration: Lockstep steps through a Python traceback, checks its sources, and forms a working hypothesis."
    >
      <div className="ls-trace-head" aria-hidden="true">
        <span className="ls-trace-lights">
          <i />
          <i />
          <i />
        </span>
        <span className="ls-trace-file">shipping.py · traceback</span>
        <span className="ls-trace-status">
          <b>Tracing</b>
          <b>Hypothesis ready</b>
        </span>
      </div>
      <div className="ls-trace-body" aria-hidden="true">
        <span className="ls-trace-scan" />
        <ol>
          {lines.map((line, index) => (
            <li key={line} data-error={index === lines.length - 1 ? "" : undefined}>
              <span>{String(index + 1).padStart(2, "0")}</span>
              <code>{line}</code>
            </li>
          ))}
        </ol>
      </div>
      <div className="ls-trace-stages" aria-hidden="true">
        <span>
          <Icon name="check" size={13} />
          Parsed
        </span>
        <span>
          <Icon name="check" size={13} />
          Retrieved
        </span>
        <span>
          <Icon name="check" size={13} />
          References checked
        </span>
      </div>
      <div className="ls-trace-finding" aria-hidden="true">
        <small>Working hypothesis</small>
        <p>
          The address payload reaches <code>build_shipment</code> without a <code>postal_code</code>{" "}
          key.
        </p>
      </div>
    </div>
  );
}
