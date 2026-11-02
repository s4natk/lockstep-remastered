import assert from "node:assert/strict";

import { checkCitations } from "../src/citationCheck.ts";
import type { Citation, Hazard } from "@lockstep/shared";

const hazard: Hazard = {
  code: "data_loss",
  statementIndex: 0,
  start: 0,
  end: 18,
  sql: "DROP TABLE sessions",
  reason: "DROP TABLE deletes the table and its rows.",
};
const chunks = [
  {
    id: "drop-table",
    text: "DROP TABLE deletes the table and its rows. Dependent views and foreign keys need CASCADE, or the statement fails.",
  },
];

const groundedParser: Citation = {
  kind: "parser",
  quote: "DROP TABLE deletes the table and its rows.",
  sourceId: "statement:0",
};
const groundedRunbook: Citation = {
  kind: "runbook",
  quote: "Dependent views and foreign keys need CASCADE",
  sourceId: "drop-table",
};
const invented: Citation = {
  kind: "runbook",
  quote: "deploy on Friday",
  sourceId: "drop-table",
};

const checked = checkCitations({
  note: "DROP TABLE deletes the table and its rows. Dependent views and foreign keys need CASCADE. This migration is safe to run on Friday.",
  hazards: [hazard],
  chunks,
  citations: [groundedParser, groundedRunbook, invented],
});

assert.equal(
  checked.note,
  "DROP TABLE deletes the table and its rows. Dependent views and foreign keys need CASCADE.",
);
assert.deepEqual(checked.dropped, ["This migration is safe to run on Friday."]);
assert.deepEqual(
  checked.citations.map((citation) => citation.quote),
  [groundedParser.quote, groundedRunbook.quote],
);

const wrongStatement = checkCitations({
  note: "DROP TABLE sessions.",
  hazards: [hazard],
  chunks,
  citations: [
    {
      kind: "parser",
      quote: "DROP TABLE sessions",
      sourceId: "statement:1",
    },
  ],
});
assert.equal(wrongStatement.note, "");
assert.deepEqual(wrongStatement.dropped, ["DROP TABLE sessions."]);
assert.deepEqual(wrongStatement.citations, []);
