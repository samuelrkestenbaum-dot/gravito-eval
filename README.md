# Gravito Eval

Measure how closely your AI matches human judgment — and where it adds new signal.

---

## Run in 10 seconds

```bash
npx gravito-eval run ./examples/basic
```

Output:

```
Gravito Eval Results

Recall: 75%
Precision: 50%
F1: 60%

Top-3 Agreement: 100%
Novel Signal: 67% (validated)

Interpretation:
- Strong alignment with human judgment
- Additional issues detected beyond baseline

Next Step:

  Want this to run continuously and fix issues automatically?

  → Try Gravito: https://empathiq-api-hbjrlavx.manus.space/pilot
```

---

## What this does

Gravito Eval helps you answer:

- **Is my AI actually correct?**
- **Where does it disagree with humans?**
- **Is it finding new, valuable insights?**

---

## Core Concepts

### Alignment

How often AI finds the same issues as humans.

→ Recall, Precision, F1

### Priority Agreement

Does AI rank problems the same way?

→ Top-K overlap

### Novel Signal

What AI finds that humans missed — and whether it's valid.

---

## Example

Input:

```
AI Findings:
- Missing CTA
- Weak hierarchy
- Inconsistent tone

Human Findings:
- No clear primary action
- Confusing layout
```

Output:

```
Recall: 67%
Precision: 75%
Novel Signal: 33%
```

---

## Install

```bash
npm install gravito-eval
```

---

## Usage

```bash
npx gravito-eval run ./data
```

---

## Input format

```json
{
  "aiFindings": [
    { "category": "conversion", "description": "Missing CTA" }
  ],
  "humanFindings": [
    { "category": "conversion", "description": "No clear action" }
  ]
}
```

---

## What makes this different

Most eval tools measure accuracy.

Gravito Eval measures:

- **alignment** with human judgment
- **disagreement** patterns
- **validated novel insight**

It tells you not just if AI is right, but if it is **useful**.

---

## Use Cases

- LLM output evaluation
- Agent QA systems
- UX / product audits
- Compliance review workflows

---

## Programmatic API

```typescript
import { evaluate } from "gravito-eval";

const result = evaluate(aiFindings, humanFindings);

result.detection.recall     // How much of what humans find does the AI catch?
result.detection.precision  // How much of what the AI finds is actually relevant?
result.detection.f1         // Harmonic mean of recall and precision
result.novelSignal          // What did the AI find that humans missed?
result.verdict              // PASS | PARTIAL | FAIL | INSUFFICIENT_DATA
```

### With Adjudications

```typescript
import { evaluate } from "gravito-eval";

const result = evaluate(aiFindings, humanFindings, {
  adjudications: [
    { findingId: "ai-3", label: "VALID", reasoning: "Genuine issue humans missed" },
    { findingId: "ai-4", label: "LOW_VALUE", reasoning: "True but too minor" },
  ]
});

result.novelSignal?.validatedNovelRate  // Real human-validated rate
result.adjustedPrecision                // Accounts for valid novel signal
```

### Individual Modules

```typescript
import { multiPassMatch, computeNovelSignal, scoreFindings } from "gravito-eval";

// Just matching
const matches = multiPassMatch(aiFindings, humanFindings);

// Just novel signal
const signal = computeNovelSignal(aiOnlyFindings, adjudications);

// Just confidence scoring
const scored = scoreFindings(aiFindings);
```

---

## Data Format

```typescript
// Finding
{
  id: string;
  description: string;
  category: string;
  severity: "low" | "medium" | "high" | "critical";
  location?: string;
  keywords?: string[];
}

// Adjudication
{
  findingId: string;
  label: "VALID" | "INVALID" | "DUPLICATE" | "LOW_VALUE";
  reasoning?: string;
}
```

---

## Examples

Three examples included:

| Example | Use Case | Run |
|---|---|---|
| `basic` | Simple CTA/hierarchy audit | `npx gravito-eval run ./examples/basic` |
| `website-audit` | Full UX/trust audit with adjudications | `npx gravito-eval run ./examples/website-audit` |
| `agent-eval` | AI code review agent | `npx gravito-eval run ./examples/agent-eval` |

---

## Current Status

This framework is actively used in production systems.

Metrics are based on ongoing calibration studies and continue to improve as more human validation data is added.

---

## What this is NOT

This is not a full AI system.

It does not:
- generate outputs
- fix issues
- run workflows

It **evaluates** and **measures**.

---

## Telemetry

Gravito Eval collects anonymous usage data to help improve the tool:

- Timestamp
- Package version
- Command name (e.g. `run`)

No findings data, file paths, or PII is collected.

Disable with:

```bash
GRAVITO_TELEMETRY=0 gravito-eval run ./data
# or
gravito-eval run ./data --no-telemetry
```

Respects the `DO_NOT_TRACK=1` environment variable.

---

## Gravito

This project is part of [Gravito](https://empathiq-api-hbjrlavx.manus.space).

Gravito uses this evaluation layer to power continuous AI governance and self-correction.

Want this running continuously on your system?

→ [Request a pilot](https://empathiq-api-hbjrlavx.manus.space/pilot)

---

## License

MIT
