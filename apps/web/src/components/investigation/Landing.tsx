import Link from "next/link";
import { AppFrame, Arrow } from "./AppFrame";

const steps = [
  {
    number: "01",
    title: "Submit a failure",
    text: "Bring the traceback, failed test, API response, or logs. Add the context you already have.",
  },
  {
    number: "02",
    title: "Inspect the evidence",
    text: "Deterministic parsers extract the facts. Every observation points back to a source.",
  },
  {
    number: "03",
    title: "Understand likely causes",
    text: "Review grounded hypotheses, alternative explanations, and the context still missing.",
  },
  {
    number: "04",
    title: "Verify the fix",
    text: "Work through practical remediation and verification steps, then investigate again.",
  },
];

export function Landing() {
  return (
    <AppFrame>
      <section className="landing-hero">
        <div className="hero-copy">
          <p className="eyebrow">
            <span className="status-dot" /> AI DEBUGGING & INCIDENT INVESTIGATION
          </p>
          <h1>
            Every error has a story.
            <br />
            <span>Find yours.</span>
          </h1>
          <p className="hero-description">
            Investigate runtime errors, failed tests, API failures, and application logs. Get
            evidence-backed explanations, actionable fixes, and clear next steps.
          </p>
          <div className="hero-actions">
            <Link className="action action-primary" href="/investigate">
              Start an investigation <Arrow />
            </Link>
            <Link className="text-action" href="/how-it-works">
              See how it works <Arrow direction="up" />
            </Link>
          </div>
          <p className="hero-note">
            Your evidence stays yours. History is private to this browser’s access key.
          </p>
        </div>
        <div className="sample-panel">
          <div className="sample-topline">
            <span>
              <span className="sample-file-icon">↳</span> shipping.py
            </span>
            <span className="mono-label">INPUT EXAMPLE</span>
          </div>
          <div className="sample-code" aria-label="Example Python traceback">
            <div>
              <span>01</span>
              <code>Traceback (most recent call last):</code>
            </div>
            <div>
              <span>02</span>
              <code> File &quot;shipping.py&quot;, line 18</code>
            </div>
            <div>
              <span>03</span>
              <code> postal_code = payload[&quot;postal_code&quot;]</code>
            </div>
            <div className="sample-error">
              <span>04</span>
              <code>KeyError: &apos;postal_code&apos;</code>
            </div>
          </div>
          <div className="sample-observation">
            <div className="observation-symbol" aria-hidden="true">
              ⌕
            </div>
            <div>
              <p className="mono-label">START WITH WHAT YOU KNOW</p>
              <h2>The lookup failed. The cause needs context.</h2>
              <p>
                A traceback identifies the missing key and where it was accessed. Investigate the
                payload and its validation before choosing a fix.
              </p>
            </div>
          </div>
          <Link href="/investigate?example=python" className="sample-link">
            Investigate a Python example <Arrow />
          </Link>
        </div>
      </section>
      <section className="supported-strip" aria-label="Supported failure categories">
        <span className="mono-label">BUILT FOR REAL FAILURES</span>
        <span>Runtime exceptions</span>
        <span>Failed tests</span>
        <span>HTTP & API errors</span>
        <span>Application logs</span>
        <span>PostgreSQL & SQL</span>
      </section>
      <section className="landing-workflow">
        <div className="section-heading">
          <p className="eyebrow">FROM FAILURE TO NEXT STEP</p>
          <h2>
            Less guesswork.
            <br />A more useful investigation.
          </h2>
          <p>
            Separate what the evidence proves from what still needs testing. Keep the reasoning and
            the original source in one workspace.
          </p>
        </div>
        <div className="workflow-grid">
          {steps.map((step) => (
            <article key={step.number}>
              <span className="step-number">{step.number}</span>
              <h3>{step.title}</h3>
              <p>{step.text}</p>
            </article>
          ))}
        </div>
      </section>
      <section className="landing-end">
        <div>
          <p className="eyebrow">MAKE THE NEXT STEP A CLEAR ONE</p>
          <h2>Bring the error. Keep the evidence.</h2>
        </div>
        <Link className="action action-primary" href="/investigate">
          Open workspace <Arrow />
        </Link>
      </section>
    </AppFrame>
  );
}
