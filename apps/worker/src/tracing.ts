import { SpanStatusCode, trace } from "@opentelemetry/api";
import {
  BasicTracerProvider,
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from "@opentelemetry/sdk-trace-base";

const exporter = new InMemorySpanExporter();
const provider = new BasicTracerProvider({
  spanProcessors: [new SimpleSpanProcessor(exporter)],
});
trace.setGlobalTracerProvider(provider);

const tracer = trace.getTracer("lockstep");

export interface TraceSpan {
  name: string;
  durationMs: number;
}

export interface TraceSummary {
  spans: TraceSpan[];
}

export async function withSpan<T>(name: string, fn: () => Promise<T>): Promise<T> {
  return tracer.startActiveSpan(name, async (span) => {
    try {
      const result = await fn();
      span.setStatus({ code: SpanStatusCode.OK });
      return result;
    } catch (error) {
      span.recordException(error instanceof Error ? error : new Error(String(error)));
      span.setStatus({ code: SpanStatusCode.ERROR });
      throw error;
    } finally {
      span.end();
    }
  });
}

export function traceMark(): number {
  return exporter.getFinishedSpans().length;
}

export function traceSince(mark: number): TraceSummary {
  return {
    spans: exporter
      .getFinishedSpans()
      .slice(mark)
      .map((span) => ({
        name: span.name,
        durationMs: durationMs(span.startTime, span.endTime),
      })),
  };
}

function durationMs(start: readonly [number, number], end: readonly [number, number]): number {
  return (end[0] - start[0]) * 1000 + (end[1] - start[1]) / 1_000_000;
}
