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
import data from "./input.json";

const result = evaluate(data.aiFindings as any, data.humanFindings as any, {
  adjudications: data.adjudications as any,
});

console.log("Gravito Eval Results\n");
console.log(`Recall: ${Math.round(result.detection.recall * 100)}%`);
console.log(`Precision: ${Math.round(result.detection.precision * 100)}%`);
console.log(`F1: ${Math.round(result.detection.f1 * 100)}%`);
console.log();
console.log(`Top-3 Agreement: ${Math.round(result.ranking.top3Overlap * 100)}%`);
if (result.novelSignal) {
  console.log(`Novel Signal: ${Math.round(result.novelSignal.validatedNovelRate * 100)}% (validated)`);
}
console.log();
console.log("Interpretation:");
if (result.detection.recall >= 0.7) {
  console.log("- Strong alignment with human judgment");
} else if (result.detection.recall >= 0.5) {
  console.log("- Moderate alignment — some human findings missed");
} else {
  console.log("- Low alignment — many human findings missed");
}
if (result.novelSignal && result.novelSignal.validatedNovelRate >= 0.25) {
  console.log("- Additional issues detected beyond baseline");
}
