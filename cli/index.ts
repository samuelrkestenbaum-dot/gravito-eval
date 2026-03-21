#!/usr/bin/env node

/**
 * Gravito Eval CLI
 *
 * Usage:
 *   gravito-eval run <path>          Run evaluation on a data file or directory
 *   gravito-eval run <path> --json   Output raw JSON instead of formatted text
 *   gravito-eval --help              Show help
 *   gravito-eval --version           Show version
 */

import * as fs from "fs";
import * as path from "path";
import { evaluate } from "../src/calibration";
import { scoreFindings } from "../src/confidence";
import type { Finding, Adjudication, EvalResult } from "../src/types";

// ─── ANSI Colors ──────────────────────────────────────────────────────────

const c = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  cyan: "\x1b[36m",
  magenta: "\x1b[35m",
  white: "\x1b[37m",
  bgGreen: "\x1b[42m",
  bgYellow: "\x1b[43m",
  bgRed: "\x1b[41m",
  bgCyan: "\x1b[46m",
};

// ─── Helpers ──────────────────────────────────────────────────────────────

function pct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

function bar(value: number, width: number = 20): string {
  const filled = Math.round(value * width);
  const empty = width - filled;
  const color = value >= 0.7 ? c.green : value >= 0.5 ? c.yellow : c.red;
  return `${color}${"█".repeat(filled)}${c.dim}${"░".repeat(empty)}${c.reset}`;
}

function verdictBadge(verdict: string): string {
  switch (verdict) {
    case "PASS":
      return `${c.bgGreen}${c.bold} PASS ${c.reset}`;
    case "PARTIAL":
      return `${c.bgYellow}${c.bold} PARTIAL ${c.reset}`;
    case "FAIL":
      return `${c.bgRed}${c.bold} FAIL ${c.reset}`;
    default:
      return `${c.bgCyan}${c.bold} ${verdict} ${c.reset}`;
  }
}

function strengthBadge(strength: string): string {
  switch (strength) {
    case "DIFFERENTIATED":
      return `${c.green}${c.bold}DIFFERENTIATED${c.reset}`;
    case "STRONG":
      return `${c.green}STRONG${c.reset}`;
    case "MODERATE":
      return `${c.yellow}MODERATE${c.reset}`;
    default:
      return `${c.red}WEAK${c.reset}`;
  }
}

// ─── Output Formatting ────────────────────────────────────────────────────

function printResult(result: EvalResult): void {
  const d = result.detection;
  const r = result.ranking;
  const s = result.severity;

  console.log();
  console.log(
    `${c.cyan}${c.bold}┌─────────────────────────────────────────────┐${c.reset}`
  );
  console.log(
    `${c.cyan}${c.bold}│          Gravito Eval Results                │${c.reset}`
  );
  console.log(
    `${c.cyan}${c.bold}└─────────────────────────────────────────────┘${c.reset}`
  );
  console.log();

  // Verdict
  console.log(`  Verdict: ${verdictBadge(result.verdict)}`);
  console.log();

  // Detection
  console.log(`  ${c.bold}Detection${c.reset}`);
  console.log(`  Recall:     ${bar(d.recall)} ${c.bold}${pct(d.recall)}${c.reset}`);
  console.log(`  Precision:  ${bar(d.precision)} ${c.bold}${pct(d.precision)}${c.reset}`);
  console.log(`  F1 Score:   ${bar(d.f1)} ${c.bold}${pct(d.f1)}${c.reset}`);
  console.log(
    `  ${c.dim}(${d.matchedCount} matched of ${d.totalAI} AI / ${d.totalHuman} human findings)${c.reset}`
  );
  console.log();

  // Match Breakdown
  const mb = result.matchBreakdown;
  console.log(`  ${c.bold}Match Breakdown${c.reset}`);
  console.log(`  Strict:         ${mb.strict}`);
  console.log(`  Cross-category: ${mb.crossCategory}`);
  console.log(`  Conceptual:     ${mb.conceptual}`);
  console.log();

  // Ranking
  console.log(`  ${c.bold}Ranking${c.reset}`);
  console.log(`  Top-3 Overlap:  ${bar(r.top3Overlap)} ${pct(r.top3Overlap)}`);
  console.log(`  Top-5 Overlap:  ${bar(r.top5Overlap)} ${pct(r.top5Overlap)}`);
  console.log(
    `  Spearman ρ:     ${r.spearmanCorrelation >= 0 ? c.green : c.red}${r.spearmanCorrelation.toFixed(3)}${c.reset}`
  );
  console.log();

  // Severity
  console.log(`  ${c.bold}Severity Agreement${c.reset}`);
  console.log(
    `  Weighted κ:     ${s.weightedKappa >= 0.6 ? c.green : s.weightedKappa >= 0.4 ? c.yellow : c.red}${s.weightedKappa.toFixed(3)}${c.reset}`
  );
  console.log(`  Mean Abs Error: ${s.meanAbsoluteError.toFixed(2)} levels`);
  console.log();

  // Novel Signal
  if (result.novelSignal) {
    const ns = result.novelSignal;
    console.log(`  ${c.bold}Novel Signal${c.reset}`);
    console.log(
      `  Validated:      ${bar(ns.validatedNovelRate)} ${c.bold}${pct(ns.validatedNovelRate)}${c.reset} ${strengthBadge(ns.systemStrength)}`
    );
    console.log(
      `  ${c.dim}(${ns.validCount} valid, ${ns.invalidCount} invalid, ${ns.duplicateCount} duplicate, ${ns.lowValueCount} low-value of ${ns.totalAiOnly} AI-only)${c.reset}`
    );
    console.log();
  }

  // Adjusted Precision
  if (result.adjustedPrecision !== undefined) {
    console.log(`  ${c.bold}Adjusted Precision${c.reset}`);
    console.log(
      `  Raw:            ${bar(d.precision)} ${pct(d.precision)}`
    );
    console.log(
      `  Adjusted:       ${bar(result.adjustedPrecision)} ${c.bold}${pct(result.adjustedPrecision)}${c.reset}`
    );
    const lift = result.adjustedPrecision - d.precision;
    console.log(
      `  Lift:           ${lift >= 0 ? c.green : c.red}${lift >= 0 ? "+" : ""}${pct(lift)}${c.reset}`
    );
    console.log();
  }

  // Interpretation
  console.log(`  ${c.bold}Interpretation${c.reset}`);
  printInterpretation(result);
  console.log();
}

function printInterpretation(result: EvalResult): void {
  const d = result.detection;

  if (d.recall >= 0.7) {
    console.log(`  ${c.green}✓${c.reset} Strong alignment with human judgment`);
  } else if (d.recall >= 0.5) {
    console.log(`  ${c.yellow}~${c.reset} Moderate alignment — some human findings missed`);
  } else {
    console.log(`  ${c.red}✗${c.reset} Low alignment — many human findings missed`);
  }

  if (d.precision >= 0.7) {
    console.log(`  ${c.green}✓${c.reset} High precision — most AI findings are relevant`);
  } else if (d.precision >= 0.5) {
    console.log(`  ${c.yellow}~${c.reset} Moderate precision — some noise in AI output`);
  } else {
    console.log(`  ${c.red}✗${c.reset} Low precision — significant noise in AI output`);
  }

  if (result.novelSignal) {
    if (result.novelSignal.validatedNovelRate >= 0.4) {
      console.log(
        `  ${c.green}✓${c.reset} AI detects significant additional signal beyond human baseline`
      );
    } else if (result.novelSignal.validatedNovelRate >= 0.25) {
      console.log(
        `  ${c.green}✓${c.reset} AI adds meaningful signal beyond human baseline`
      );
    } else if (result.novelSignal.validatedNovelRate >= 0.15) {
      console.log(
        `  ${c.yellow}~${c.reset} AI adds some additional signal`
      );
    }
  }
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
    // Try data.json first
    const dataFile = path.join(resolved, "data.json");
    if (fs.existsSync(dataFile)) {
      return JSON.parse(fs.readFileSync(dataFile, "utf-8"));
    }

    // Try individual files
    const aiFile = path.join(resolved, "ai-findings.json");
    const humanFile = path.join(resolved, "human-findings.json");
    const adjFile = path.join(resolved, "adjudications.json");

    if (!fs.existsSync(aiFile) || !fs.existsSync(humanFile)) {
      throw new Error(
        `Directory must contain data.json OR ai-findings.json + human-findings.json`
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
${c.cyan}${c.bold}Gravito Eval${c.reset} — Measure AI-human alignment

${c.bold}Usage:${c.reset}
  gravito-eval run <path>          Evaluate AI findings against human findings
  gravito-eval run <path> --json   Output raw JSON
  gravito-eval --help              Show this help
  gravito-eval --version           Show version

${c.bold}Input format:${c.reset}
  <path> can be:
  - A JSON file with { aiFindings, humanFindings, adjudications? }
  - A directory containing ai-findings.json + human-findings.json
  - A directory containing data.json

${c.bold}Finding format:${c.reset}
  {
    "id": "unique-id",
    "description": "What the issue is",
    "category": "trust|content|navigation|conversion|visual_hierarchy|compliance|performance",
    "severity": "low|medium|high|critical",
    "location": "optional page/component",
    "keywords": ["optional", "matching", "hints"]
  }

${c.bold}Examples:${c.reset}
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
    const pkg = JSON.parse(
      fs.readFileSync(path.join(__dirname, "..", "package.json"), "utf-8")
    );
    console.log(pkg.version);
    process.exit(0);
  }

  if (args[0] !== "run") {
    console.error(`${c.red}Unknown command: ${args[0]}${c.reset}`);
    console.error(`Run ${c.cyan}gravito-eval --help${c.reset} for usage.`);
    process.exit(1);
  }

  if (!args[1]) {
    console.error(`${c.red}Missing path argument.${c.reset}`);
    console.error(`Usage: ${c.cyan}gravito-eval run <path>${c.reset}`);
    process.exit(1);
  }

  const jsonOutput = args.includes("--json");

  try {
    const data = loadData(args[1]);

    if (!data.aiFindings || !data.humanFindings) {
      throw new Error("Data must contain aiFindings and humanFindings arrays");
    }

    const start = Date.now();
    const result = evaluate(data.aiFindings, data.humanFindings, {
      adjudications: data.adjudications,
      autoAdjudicate: !data.adjudications,
    });
    const elapsed = Date.now() - start;

    if (jsonOutput) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      printResult(result);
      console.log(
        `  ${c.dim}Completed in ${elapsed}ms${c.reset}`
      );
      console.log();
    }
  } catch (err: any) {
    console.error(`${c.red}Error: ${err.message}${c.reset}`);
    process.exit(1);
  }
}

main();
