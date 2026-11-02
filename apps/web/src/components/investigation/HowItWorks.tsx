import Link from "next/link";
import { AppFrame, Arrow } from "./AppFrame";

export function HowItWorks() {
  return (
    <AppFrame>
      <div className="page-intro">
        <div>
          <p className="eyebrow">HOW LOCKSTEP WORKS</p>
          <h1>Reasoning you can inspect.</h1>
          <p>Understand the error. Find the cause. Know what to do next.</p>
        </div>
        <Link href="/investigate" className="action action-primary">
          Open workspace <Arrow />
        </Link>
      </div>
      <div className="explanation-layout">
        <aside className="explanation-summary">
          <span className="eyebrow">THE INVESTIGATION PIPELINE</span>
          <ol>
            {[
              "Validate the submission",
              "Parse the facts",
              "Retrieve useful context",
              "Investigate likely causes",
              "Validate evidence references",
              "Save the report",
            ].map((item, index) => (
              <li key={item}>
                <span>{String(index + 1).padStart(2, "0")}</span>
                {item}
              </li>
            ))}
          </ol>
          <p>
            Progress follows actual workflow stages. Submitted logs, code, SQL, and commands are
            treated as data and are never executed.
          </p>
        </aside>
        <div className="explanation-content">
          <section>
            <h2>Start with facts, then test explanations.</h2>
            <p>
              Deterministic parsers classify supported excerpts and extract messages, stack frames,
              HTTP metadata, test assertions, and log events. PostgreSQL migration analysis uses the
              existing Rust parser compiled to WebAssembly.
            </p>
            <p>
              Findings reference the source text. A working hypothesis is an inference, not a
              confirmed root cause. The report keeps those two kinds of information separate.
            </p>
          </section>
          <section>
            <h2>Use relevant context without hiding its source.</h2>
            <p>
              Retrieval selects curated debugging runbooks using the failure category and extracted
              facts. Optional embedding search can enrich keyword results; the report identifies
              retrieval limits when a vector service is unavailable.
            </p>
            <p>
              References point to submitted evidence, SQL parser findings, or retrieved material.
              Citation validation checks that references exist. You still need to judge whether the
              source supports the claim.
            </p>
          </section>
          <section>
            <h2>AI when configured. Clear limits when it is not.</h2>
            <p>
              With a configured model provider, Lockstep generates structured hypotheses,
              remediation, and verification guidance. Provider failures or invalid output produce a
              clearly labelled deterministic report using extracted facts and curated guidance.
            </p>
            <p>
              Confidence is qualitative. Limited input cannot establish production impact, reproduce
              a failure, or prove that a proposed fix works. Missing context and limitations remain
              visible.
            </p>
          </section>
          <section>
            <h2>A useful excerpt beats a large dump.</h2>
            <p>
              Supported inputs include Python, JavaScript, Java, and Rust exception excerpts;
              pytest, Jest, and Vitest-style failures; HTTP responses and connection errors; text or
              JSON logs; PostgreSQL errors; and SQL migrations. These parsers handle representative
              formats, not every tool or language.
            </p>
            <p>
              Include the full error message, the failing frame or assertion, and a few surrounding
              log lines. Add non-secret runtime or framework details. Remove credentials and
              personal information before submitting.
            </p>
          </section>
          <section>
            <h2>Private history with a browser access key.</h2>
            <p>
              Your browser creates a random access key and uses it to authorize saved
              investigations. The backend stores the input and completed report; it does not expose
              a global public history. The key stays in this browser’s local storage.
            </p>
            <p>
              History is tied to that key, not an account. Other browsers cannot open it
              automatically. Clearing site storage loses access to the existing records. You can
              export a report as JSON or delete it from History.
            </p>
          </section>
        </div>
      </div>
    </AppFrame>
  );
}
