import type { HazardCode } from "@lockstep/shared";
import { RangeSet, StateEffect, StateField, type EditorState, type Range } from "@codemirror/state";
import { Decoration, EditorView, GutterMarker, gutterLineClass, hoverTooltip, type DecorationSet } from "@codemirror/view";

import { hazardLabel } from "../../../lib/hazards";

export interface EditorHazard {
  key: string;
  from: number;
  to: number;
  code: HazardCode;
  reason: string;
  statement: number;
}

interface HazardState {
  items: EditorHazard[];
  active: string | null;
  decorations: DecorationSet;
}

export const setHazards = StateEffect.define<EditorHazard[]>();
export const setActiveHazard = StateEffect.define<string | null>();

const PRIORITY: HazardCode[] = ["data_loss", "rewrite", "lock_risk", "safe"];

function primaryCode(codes: Iterable<HazardCode>): HazardCode {
  const set = new Set(codes);
  return PRIORITY.find((code) => set.has(code)) ?? "lock_risk";
}

function lineInfo(state: EditorState, items: EditorHazard[], active: string | null) {
  const lines = new Map<number, { from: number; codes: Set<HazardCode>; active: boolean }>();
  for (const item of items) {
    const first = state.doc.lineAt(item.from).number;
    const last = state.doc.lineAt(Math.max(item.from, item.to - 1)).number;
    for (let number = first; number <= last; number += 1) {
      const line = state.doc.line(number);
      const entry = lines.get(number) ?? { from: line.from, codes: new Set<HazardCode>(), active: false };
      entry.codes.add(item.code);
      entry.active ||= item.key === active;
      lines.set(number, entry);
    }
  }
  return [...lines.values()].sort((left, right) => left.from - right.from);
}

function build(state: EditorState, items: EditorHazard[], active: string | null): DecorationSet {
  const ranges: Range<Decoration>[] = [];
  for (const line of lineInfo(state, items, active)) {
    ranges.push(
      Decoration.line({
        class: `cm-hazard-line cm-hazard--${primaryCode(line.codes)}`,
        attributes: { "data-active": line.active ? "true" : "false" },
      }).range(line.from),
    );
  }
  for (const item of items) {
    if (item.to > item.from) {
      ranges.push(Decoration.mark({ class: `cm-hazard-mark cm-hazard--${item.code}` }).range(item.from, item.to));
    }
  }
  return Decoration.set(ranges, true);
}

export const hazardField = StateField.define<HazardState>({
  create: () => ({ items: [], active: null, decorations: Decoration.none }),
  update(value, transaction) {
    let { items, active } = value;
    let changed = false;
    if (transaction.docChanged) {
      items = items
        .map((item) => ({
          ...item,
          from: transaction.changes.mapPos(item.from, 1),
          to: transaction.changes.mapPos(item.to, -1),
        }))
        .filter((item) => item.to > item.from);
      changed = true;
    }
    for (const effect of transaction.effects) {
      if (effect.is(setHazards)) {
        const length = transaction.state.doc.length;
        items = effect.value
          .map((item) => ({ ...item, from: Math.min(item.from, length), to: Math.min(item.to, length) }))
          .filter((item) => item.to > item.from);
        active = null;
        changed = true;
      } else if (effect.is(setActiveHazard)) {
        active = effect.value;
        changed = true;
      }
    }
    if (!changed) {
      return value;
    }
    return { items, active, decorations: build(transaction.state, items, active) };
  },
  provide: (field) => EditorView.decorations.from(field, (value) => value.decorations),
});

class HazardGutterMarker extends GutterMarker {
  override readonly elementClass: string;

  constructor(readonly code: HazardCode) {
    super();
    this.elementClass = `cm-hazard-gutter cm-hazard--${this.code}`;
  }
  override eq(other: GutterMarker): boolean {
    return other instanceof HazardGutterMarker && other.code === this.code;
  }
}

const hazardGutterClass = gutterLineClass.compute([hazardField], (state) => {
  const { items, active } = state.field(hazardField);
  return RangeSet.of(
    lineInfo(state, items, active).map((line) => new HazardGutterMarker(primaryCode(line.codes)).range(line.from)),
  );
});

const hazardTooltip = hoverTooltip(
  (view, pos) => {
    const hits = view.state.field(hazardField).items.filter((item) => pos >= item.from && pos <= item.to);
    if (hits.length === 0) {
      return null;
    }
    return {
      pos: Math.min(...hits.map((item) => item.from)),
      end: Math.max(...hits.map((item) => item.to)),
      above: true,
      create: () => {
        const dom = document.createElement("div");
        dom.className = "cm-hazard-tip";
        for (const hit of hits) {
          const row = document.createElement("div");
          row.className = `cm-hazard-tip-row cm-hazard--${hit.code}`;
          const label = document.createElement("span");
          label.className = "cm-hazard-tip-label";
          label.textContent = hazardLabel(hit.code);
          const reason = document.createElement("span");
          reason.className = "cm-hazard-tip-reason";
          reason.textContent = hit.reason;
          row.append(label, reason);
          dom.append(row);
        }
        const source = document.createElement("div");
        source.className = "cm-hazard-tip-source";
        source.textContent = `Parser · statement ${hits[0]!.statement + 1}`;
        dom.append(source);
        return { dom };
      },
    };
  },
  { hoverTime: 220 },
);

export const hazardExtension = [hazardField, hazardGutterClass, hazardTooltip];
