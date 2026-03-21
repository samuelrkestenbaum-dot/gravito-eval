/**
 * Website Audit Example — Gravito-like evaluation with novel signal
 *
 * Demonstrates a realistic website audit scenario where an AI system
 * identifies issues that partially overlap with human expert findings,
 * plus additional novel signal that humans missed.
 *
 * Run: npx ts-node examples/website-audit/run.ts
 * Or:  gravito-eval run examples/website-audit
 */

import { evaluate } from "../../src";
import data from "./data.json";

const result = evaluate(data.aiFindings, data.humanFindings, {
  adjudications: data.adjudications,
});

console.log("=== Website Audit Evaluation ===\n");
console.log(`AI findings:    ${data.aiFindings.length}`);
console.log(`Human findings: ${data.humanFindings.length}`);
console.log();

console.log("--- Detection ---");
console.log(`Recall:    ${(result.detection.recall * 100).toFixed(1)}%`);
console.log(`Precision: ${(result.detection.precision * 100).toFixed(1)}%`);
console.log(`F1:        ${(result.detection.f1 * 100).toFixed(1)}%`);
console.log(`Verdict:   ${result.verdict}`);
console.log();

console.log("--- Match Breakdown ---");
console.log(`Strict:         ${result.matchBreakdown.strict}`);
console.log(`Cross-category: ${result.matchBreakdown.crossCategory}`);
console.log(`Conceptual:     ${result.matchBreakdown.conceptual}`);
console.log();

console.log("--- Ranking ---");
console.log(`Top-3 Overlap:  ${(result.ranking.top3Overlap * 100).toFixed(1)}%`);
console.log(`Top-5 Overlap:  ${(result.ranking.top5Overlap * 100).toFixed(1)}%`);
console.log();

console.log("--- Severity Agreement ---");
console.log(`Weighted Kappa: ${result.severity.weightedKappa.toFixed(3)}`);
console.log(`Mean Abs Error: ${result.severity.meanAbsoluteError.toFixed(2)} levels`);
console.log();

if (result.novelSignal) {
  console.log("--- Novel Signal ---");
  console.log(`Valid:      ${result.novelSignal.validCount} of ${result.novelSignal.totalAiOnly} AI-only`);
  console.log(`Novel Rate: ${(result.novelSignal.validatedNovelRate * 100).toFixed(1)}%`);
  console.log(`Strength:   ${result.novelSignal.systemStrength}`);
  console.log();
}

if (result.adjustedPrecision !== undefined) {
  console.log("--- Adjusted Precision ---");
  console.log(`Raw:      ${(result.detection.precision * 100).toFixed(1)}%`);
  console.log(`Adjusted: ${(result.adjustedPrecision * 100).toFixed(1)}%`);
  console.log(`Lift:     +${((result.adjustedPrecision - result.detection.precision) * 100).toFixed(1)}%`);
}
