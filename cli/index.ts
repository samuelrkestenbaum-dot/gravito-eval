#!/usr/bin/env node

/**
 * Gravito Eval CLI
 *
 * Usage:
 *   gravito-eval run <path>                    Run evaluation on a data file or directory
 *   gravito-eval run <path> --json             Output raw JSON instead of formatted text
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

  // Core metrics
  console.log(`Recall: ${pct(d.recall)}`);
  console.log(`Precision: ${pct(d.precision)}`);
  console.log(`F1: ${pct(d.f1)}`);
  console.log();

  // Ranking
  console.log(`Top-3 Agreement: ${pct(r.top3Overlap)}`);

  // Novel Signal
  if (result.novelSignal) {
    const ns = result.novelSignal;
    console.log(`Novel Signal: ${pct(ns.validatedNovelRate)} (validated)`);
  }

  console.log();

  // Interpretation
  console.log("Interpretation:");
  printInterpretation(result);
  console.log();

  // Conversion hook — the funnel from OSS → paid
  printNextStep();
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

  if (d.precision >= 0.7) {
    console.log("- High precision — most AI findings are relevant");
  } else if (d.precision >= 0.5) {
    console.log("- Moderate precision — some noise in AI output");
  } else {
    console.log("- Low precision — significant noise in AI output");
  }

  if (result.novelSignal) {
    if (result.novelSignal.validatedNovelRate >= 0.4) {
      console.log("- Additional issues detected beyond baseline");
    } else if (result.novelSignal.validatedNovelRate >= 0.25) {
      console.log("- Meaningful additional signal beyond baseline");
    } else if (result.novelSignal.validatedNovelRate >= 0.15) {
      console.log("- Some additional signal detected");
    }
  }
}

function printNextStep(): void {
  console.log("Next Step:");
  console.log();
  console.log("  Want this to run continuously and fix issues automatically?");
  console.log();
  console.log("  → Try Gravito: https://empathiq-api-hbjrlavx.manus.space/pilot");
  console.log();
}

// ─── Data Loading ─────────────────────────────────────────────────────────

interface EvalData {
  aiFindings: Finding[];
  humanFindings: Finding[];
  adjudications?: Adjudication[];
}

function loadData(inputPath: string): EvalData {
  const resolved = path.resolve(inputPath);

  // Check if it's a directory with data.json or individual files
  if (fs.statSync(resolved).isDirectory()) {
    // Try input.json first, then data.json for backwards compat
    for (const name of ["input.json", "data.json"]) {
      const file = path.join(resolved, name);
      if (fs.existsSync(file)) {
        return JSON.parse(fs.readFileSync(file, "utf-8"));
      }
    }

    // Try individual files
    const aiFile = path.join(resolved, "ai-findings.json");
    const humanFile = path.join(resolved, "human-findings.json");
    const adjFile = path.join(resolved, "adjudications.json");

    if (!fs.existsSync(aiFile) || !fs.existsSync(humanFile)) {
      throw new Error(
        `Directory must contain input.json, data.json, OR ai-findings.json + human-findings.json`
      );
    }

    const data: EvalData = {
      aiFindings: JSON.parse(fs.readFileSync(aiFile, "utf-8")),
      humanFindings: JSON.parse(fs.readFileSync(humanFile, "utf-8")),
    };

    if (fs.existsSync(adjFile)) {
      data.adjudications = JSON.parse(fs.readFileSync(adjFile, "utf-8"));
    }

    return data;
  }

  // Single JSON file
  return JSON.parse(fs.readFileSync(resolved, "utf-8"));
}

// ─── Main ─────────────────────────────────────────────────────────────────

function showHelp(): void {
  console.log(`
Gravito Eval — Measure AI-human alignment

Usage:
  gravito-eval run <path>                    Evaluate AI findings against human findings
  gravito-eval run <path> --json             Output raw JSON
  gravito-eval run <path> --no-telemetry     Disable anonymous usage tracking
  gravito-eval --help                        Show this help
  gravito-eval --version                     Show version

Input format:
  <path> can be:
  - A JSON file with { aiFindings, humanFindings, adjudications? }
  - A directory containing input.json or data.json
  - A directory containing ai-findings.json + human-findings.json

Telemetry:
  Anonymous usage data (timestamp, version, command) is sent to help
  improve the tool. No findings data or PII is collected.
  Disable with: GRAVITO_TELEMETRY=0 or --no-telemetry

Examples:
  gravito-eval run ./examples/basic
  gravito-eval run ./data/my-audit.json
  gravito-eval run ./examples/website-audit --json
`);
}

function main(): void {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
    showHelp();
    process.exit(0);
  }

  if (args.includes("--version") || args.includes("-v")) {
    // Walk up from cli/ to find package.json
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
    console.error(`Run gravito-eval --help for usage.`);
    process.exit(1);
  }

  if (!args[1]) {
    console.error(`Missing path argument.`);
    console.error(`Usage: gravito-eval run <path>`);
    process.exit(1);
  }

  const jsonOutput = args.includes("--json");

  // Fire-and-forget telemetry (non-blocking)
  trackRun("run");

  try {
    const data = loadData(args[1]);

    if (!data.aiFindings || !data.humanFindings) {
      throw new Error("Data must contain aiFindings and humanFindings arrays");
    }

    const result = evaluate(data.aiFindings, data.humanFindings, {
      adjudications: data.adjudications,
      autoAdjudicate: !data.adjudications,
    });

    if (jsonOutput) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      printResult(result);
    }
  } catch (err: any) {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  }
}

main();
