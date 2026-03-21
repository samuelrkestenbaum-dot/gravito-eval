/**
 * Agent Evaluation Example — Evaluating an AI code review agent
 *
 * Demonstrates using gravito-eval to measure how well an AI agent's
 * code review findings align with human expert reviews.
 *
 * This is the "agent-eval" use case: you have an AI agent making
 * decisions, and you want to know if those decisions are good.
 *
 * Run: npx ts-node examples/agent-eval/run.ts
 * Or:  gravito-eval run examples/agent-eval
 */

import { evaluate, scoreFindings } from "../../src";
import data from "./data.json";

// Run evaluation
const result = evaluate(data.aiFindings, data.humanFindings, {
  adjudications: data.adjudications,
});

console.log("=== AI Agent Code Review Evaluation ===\n");
console.log(`Agent findings:  ${data.aiFindings.length}`);
console.log(`Expert findings: ${data.humanFindings.length}`);
console.log();

// Core metrics
console.log("--- Alignment ---");
console.log(`Recall:    ${(result.detection.recall * 100).toFixed(1)}% (agent catches this much of what experts find)`);
console.log(`Precision: ${(result.detection.precision * 100).toFixed(1)}% (this much of agent output is relevant)`);
console.log(`F1:        ${(result.detection.f1 * 100).toFixed(1)}%`);
console.log(`Verdict:   ${result.verdict}`);
console.log();

// Match quality
console.log("--- Match Quality ---");
console.log(`Strict matches:    ${result.matchBreakdown.strict} (same category + high similarity)`);
console.log(`Cross-category:    ${result.matchBreakdown.crossCategory} (same issue, different framing)`);
console.log(`Conceptual:        ${result.matchBreakdown.conceptual} (related cluster → single issue)`);
console.log();

// Novel signal
if (result.novelSignal) {
  console.log("--- Novel Signal (what the agent found that experts missed) ---");
  console.log(`Valid novel:   ${result.novelSignal.validCount}`);
  console.log(`Low value:     ${result.novelSignal.lowValueCount}`);
  console.log(`Novel rate:    ${(result.novelSignal.validatedNovelRate * 100).toFixed(1)}%`);
  console.log(`Assessment:    ${result.novelSignal.systemStrength}`);
  console.log();
}

// Confidence scoring
console.log("--- Confidence Scores ---");
const scored = scoreFindings(data.aiFindings);
for (const s of scored) {
  const conf = s.confidence;
  const indicator = conf >= 0.7 ? "●" : conf >= 0.5 ? "◐" : "○";
  console.log(`  ${indicator} ${s.id}: ${conf.toFixed(2)} — ${s.description.slice(0, 60)}...`);
}
