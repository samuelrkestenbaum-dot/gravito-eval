# Gravito Eval

Measure how closely your AI matches human judgment — and where it finds things humans missed.

```bash
npx gravito-eval run ./examples/basic
```

```
Gravito Eval Results

Recall: 75%
Precision: 50%
F1: 60%

Top-3 Agreement: 100%
Novel Signal: 67% (validated)

Interpretation:
- Strong alignment with human judgment
- AI found significant issues humans missed
```

---

## What this tells you

Your AI found 75% of what humans found (Recall).
Half of what it flagged was relevant (Precision).
And 67% of its unique findings were genuinely useful (Novel Signal).

That means your AI is catching real issues humans miss — but also generating some noise.

---

## Install

```bash
npm install gravito-eval
```

Or run directly:

```bash
npx gravito-eval run ./your-data.json
```

---

## Input format

```json
{
  "aiFindings": [
    { "id": "ai-1", "description": "Missing CTA", "category": "conversion", "severity": "high" }
  ],
  "humanFindings": [
    { "id": "h-1", "description": "No clear action", "category": "conversion", "severity": "high" }
  ]
}
```

Save as `input.json` in a directory, then run:

```bash
gravito-eval run ./my-directory
```

---

## Flags

```bash
gravito-eval run <path> --explain     # Show why each match was made
gravito-eval run <path> --json        # Raw JSON output
gravito-eval run <path> --no-telemetry
```

---

## Programmatic API

```typescript
import { evaluate } from "gravito-eval";

const result = evaluate(aiFindings, humanFindings);

result.detection.recall     // How much of what humans find does the AI catch?
result.detection.precision  // How much of what the AI finds is actually relevant?
result.detection.f1         // Harmonic mean
result.novelSignal          // What did the AI find that humans missed?
result.verdict              // PASS | PARTIAL | FAIL | INSUFFICIENT_DATA
```

---

## What this is for

- Evaluating LLM outputs against human baselines
- QA for AI agents (code review, content audit, compliance)
- Measuring whether your AI is useful, not just accurate

---

## What this is NOT

This does not generate outputs, fix issues, or run workflows.
It **measures** and **evaluates**.

---

## Telemetry

Anonymous usage data (timestamp, version, command name) is collected to improve the tool.
No findings, file paths, or PII.

Disable:

```bash
GRAVITO_TELEMETRY=0 gravito-eval run ./data
```

Respects `DO_NOT_TRACK=1`.

---

## Gravito

This is the open-source evaluation layer behind [Gravito](https://gravito.ai) — continuous AI governance that scans, calibrates, and self-corrects.

**Want this running continuously on your system?**

[Request a pilot →](https://gravito.ai/pilot)

---

MIT License
