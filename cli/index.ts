#!/usr/bin/env node

/**
 * Gravito Eval CLI
 *
 * Usage:
 *   gravito-eval run <path>                    Run evaluation
 *   gravito-eval run <path> --explain          Show detailed match reasoning
 *   gravito-eval run <path> --json             Output raw JSON
 *   gravito-eval run <path> --no-telemetry     Disable anonymous usage tracking
 *   gravito-eval --help                        Show help
 *   gravito-eval --version                     Show version
 */

import * as fs from "fs";
import * as path from "path";
import { evaluate } from "../src/calibration";
import { trackRun } from "../src/telemetry";
import type { Finding, Adjudication, EvalResult } from "../src/types";

// ─── Helpers ──────────────────────────────────────────────────────────────

function pct(n: number): string {
  return `${Math.round(n * 100)}%`;
}

// ─── Output Formatting ────────────────────────────────────────────────────

function printResult(result: EvalResult): void {
  const d = result.detection;
  const r = result.ranking;

  console.log();
  console.log("Gravito Eval Results");
  console.log();

  console.log(`Recall: ${pct(d.recall)}`);
  console.log(`Precision: ${pct(d.precision)}`);
  console.log(`F1: ${pct(d.f1)}`);
  console.log();

  console.log(`Top-3 Agreement: ${pct(r.top3Overlap)}`);

  if (result.novelSignal) {
    console.log(`Novel Signal: ${pct(result.novelSignal.validatedNovelRate)} (validated)`);
  }

  console.log();

  console.log("Interpretation:");
  printInterpretation(result);
  console.log();

  console.log("Next Step:");
  console.log("Want this running continuously and fixing issues automatically?");
  console.log();
  console.log("→ Try Gravito: https://gravito.ai/pilot");
  console.log();
}

function printInterpretation(result: EvalResult): void {
  const d = result.detection;

  if (d.recall >= 0.7) {
    console.log("- Strong alignment with human judgment");
  } else if (d.recall >= 0.5) {
    console.log("- Moderate alignment — some human findings missed");
  } else {
    console.log("- Low alignment — many human findings missed");
  }

  if (result.novelSignal) {
    const rate = result.novelSignal.validatedNovelRate;
    if (rate >= 0.4) {
      console.log("- AI found significant issues humans missed");
    } else if (rate >= 0.2) {
      console.log("- AI found some issues humans missed");
    }
  }
}

// ─── Explain Mode ─────────────────────────────────────────────────────────

function printExplain(result: EvalResult): void {
  console.log("─── Detailed Reasoning ───");
  console.log();

  // Matched pairs
  if (result.matches.length > 0) {
    console.log("Matched (AI ↔ Human):");
    for (const m of result.matches) {
      console.log();
      console.log(`  AI:    "${m.aiIssue.description}"`);
      console.log(`  Human: "${m.humanIssue.description}"`);
      console.log(`  Why:   ${m.matchType} match (${Math.round(m.similarity * 100)}% similar)`);
    }
    console.log();
  }

  // Novel findings
  if (result.aiOnly.length > 0) {
    console.log("Novel (AI found, humans didn't):");
    for (const f of result.aiOnly) {
      console.log(`  → "${f.description}"`);
      console.log(`    Why novel: No similar human finding found`);
    }
    console.log();
  }

  // Missed findings
  if (result.humanOnly.length > 0) {
    console.log("Missed (humans found, AI didn't):");
    for (const f of result.humanOnly) {
      console.log(`  ✗ "${f.description}"`);
    }
    console.log();
  }
}

// ─── Data Loading ─────────────────────────────────────────────────────────

interface EvalData {
  aiFindings: Finding[];
  humanFindings: Finding[];
  adjudications?: Adjudication[];
}

function printInvalidInput(): void {
  console.error(`Invalid input.`);
  console.error();
  console.error(`Expected:`);
  console.error(`{`);
  console.error(`  "aiFindings": [...],`);
  console.error(`  "humanFindings": [...]`);
  console.error(`}`);
  console.error();
  console.error(`Run:`);
  console.error(`npx gravito-eval run ./examples/basic`);
}

function validateData(data: any): EvalData {
  if (!data || typeof data !== "object") {
    printInvalidInput();
    process.exit(1);
  }

  if (!Array.isArray(data.aiFindings) || !Array.isArray(data.humanFindings)) {
    printInvalidInput();
    process.exit(1);
  }

  return data as EvalData;
}

function loadData(inputPath: string): EvalData {
  const resolved = path.resolve(inputPath);

  if (!fs.existsSync(resolved)) {
    console.error(`Path not found: ${inputPath}`);
    process.exit(1);
  }

  if (fs.statSync(resolved).isDirectory()) {
    for (const name of ["input.json", "data.json"]) {
      const file = path.join(resolved, name);
      if (fs.existsSync(file)) {
        const raw = JSON.parse(fs.readFileSync(file, "utf-8"));
        return validateData(raw);
      }
    }

    const aiFile = path.join(resolved, "ai-findings.json");
    const humanFile = path.join(resolved, "human-findings.json");

    if (!fs.existsSync(aiFile) || !fs.existsSync(humanFile)) {
      console.error(`No input.json found in ${inputPath}`);
      console.error();
      console.error(`Expected: input.json with { aiFindings, humanFindings }`);
      console.error();
      console.error(`Run:`);
      console.error(`npx gravito-eval run ./examples/basic`);
      process.exit(1);
    }

    const data: EvalData = {
      aiFindings: JSON.parse(fs.readFileSync(aiFile, "utf-8")),
      humanFindings: JSON.parse(fs.readFileSync(humanFile, "utf-8")),
    };

    const adjFile = path.join(resolved, "adjudications.json");
    if (fs.existsSync(adjFile)) {
      data.adjudications = JSON.parse(fs.readFileSync(adjFile, "utf-8"));
    }

    return validateData(data);
  }

  if (!resolved.endsWith(".json")) {
    console.error(`Expected a .json file or directory, got: ${inputPath}`);
    process.exit(1);
  }

  const raw = JSON.parse(fs.readFileSync(resolved, "utf-8"));
  return validateData(raw);
}

// ─── Main ─────────────────────────────────────────────────────────────────

function showHelp(): void {
  console.log(`
Gravito Eval — Measure AI-human alignment

Usage:
  gravito-eval run <path>                    Evaluate findings
  gravito-eval run <path> --explain          Show detailed match reasoning
  gravito-eval run <path> --json             Output raw JSON
  gravito-eval run <path> --no-telemetry     Disable anonymous tracking

Input:
  <path> can be a .json file or a directory containing input.json

Examples:
  gravito-eval run ./examples/basic
  gravito-eval run ./my-audit.json
  gravito-eval run ./examples/basic --explain
`);
}

function main(): void {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
    showHelp();
    process.exit(0);
  }

  if (args.includes("--version") || args.includes("-v")) {
    let pkgDir = __dirname;
    while (!fs.existsSync(path.join(pkgDir, "package.json"))) {
      const parent = path.dirname(pkgDir);
      if (parent === pkgDir) break;
      pkgDir = parent;
    }
    const pkg = JSON.parse(
      fs.readFileSync(path.join(pkgDir, "package.json"), "utf-8")
    );
    console.log(pkg.version);
    process.exit(0);
  }

  if (args[0] !== "run") {
    console.error(`Unknown command: ${args[0]}`);
    console.error(`Run: gravito-eval --help`);
    process.exit(1);
  }

  if (!args[1]) {
    console.error(`Missing path.`);
    console.error(`Usage: gravito-eval run <path>`);
    process.exit(1);
  }

  const jsonOutput = args.includes("--json");
  const explainMode = args.includes("--explain");

  // Fire-and-forget telemetry (non-blocking)
  trackRun("run");

  try {
    const data = loadData(args[1]);

    const result = evaluate(data.aiFindings, data.humanFindings, {
      adjudications: data.adjudications,
      autoAdjudicate: !data.adjudications,
    });

    if (jsonOutput) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      printResult(result);
      if (explainMode) {
        printExplain(result);
      }
    }
  } catch (err: any) {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  }

  // Force exit — telemetry HTTP should not keep process alive
  setTimeout(() => process.exit(0), 100);
}

main();
