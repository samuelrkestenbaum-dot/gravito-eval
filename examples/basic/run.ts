/**
 * Basic Example — Simplest possible evaluation
 *
 * Run: npx ts-node examples/basic/run.ts
 * Or:  gravito-eval run examples/basic
 */

import { evaluate } from "../../src";
import data from "./data.json";

const result = evaluate(data.aiFindings, data.humanFindings);

console.log("=== Basic Evaluation ===\n");
console.log(`Recall:    ${(result.detection.recall * 100).toFixed(1)}%`);
console.log(`Precision: ${(result.detection.precision * 100).toFixed(1)}%`);
console.log(`F1:        ${(result.detection.f1 * 100).toFixed(1)}%`);
console.log(`Verdict:   ${result.verdict}`);
console.log();
console.log(`Match Breakdown:`);
console.log(`  Strict:         ${result.matchBreakdown.strict}`);
console.log(`  Cross-category: ${result.matchBreakdown.crossCategory}`);
console.log(`  Conceptual:     ${result.matchBreakdown.conceptual}`);
