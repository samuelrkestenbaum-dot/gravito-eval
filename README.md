# Gravito Eval

Scan any website. See what's wrong, what's missing, and what a human reviewer would miss.

```
npx gravito-eval scan https://stripe.com
```

---

## What You Get

```
  Scanning https://stripe.com

  ◐ Fetching page content
  ◑ Running governance analysis
  ◒ Calculating score & benchmarks
  ◉ Analysis complete

  Gravito Eval Results
  ──────────────────────────────────────────────────

  Score:  57/100  🔴 F Grade
  Site:   https://stripe.com
  Title:  Stripe | Financial Infrastructure to Grow Your Revenue

  █████████████████░░░░░░░░░░░░░  57%

  vs Fintech & Financial Services: top 52% (avg: 58)

  Key Issues
  ──────────────────────────────────────────────────

  HIGH  Unsubstantiated Claim
  → Unsubstantiated Claims: "50% of"
  Fix: Add a verifiable source or rephrase as a qualified statement

  HIGH  Unsubstantiated Claim
  → Unsubstantiated Claims: "100% of"
  Fix: Add a verifiable source or rephrase as a qualified statement

  MEDIUM  Banned Vocabulary
  → Banned Vocabulary: "cutting edge"
  Fix: Replace with specific, measurable language

  Additional Insights Gravito Found
  ──────────────────────────────────────────────────
  ◆ Unapproved Claims
  ◆ Missing Disclaimers
  ◆ Forbidden Language

  ──────────────────────────────────────────────────
  Share: https://gravito.ai/try/report/a1b2c3d4

  Analyzed in 27.4s · Gravito Engine (Live) · 4 issues found
```

Every scan produces a shareable link.

---

## Try It

```bash
npx gravito-eval scan https://stripe.com
npx gravito-eval scan https://openai.com
npx gravito-eval scan https://your-site.com
```

No install. No API keys. No setup.

---

## Demo Mode

See a walkthrough with explanations:

```bash
npx gravito-eval demo
```

---

## What This Does

Gravito Eval analyzes a real website and shows:

- How closely it matches human-quality governance judgment
- Where the gaps are (unsubstantiated claims, missing disclaimers, banned vocabulary)
- What improvements a human reviewer would miss

It runs the same engine that powers [Gravito](https://gravito.ai) — a governance layer for AI outputs and digital surfaces.

---

## Why This Is Different

Most tools tell you **what** is wrong.

Gravito Eval tells you:

- **How aligned** your content is with governance best practices
- **Where it disagrees** with what a human reviewer would flag
- **Whether those disagreements are valuable** — sometimes the AI catches things humans miss

---

## Use Cases

| Use Case | What You Get |
|---|---|
| **Scan your landing page** | Governance score, issues, fixes, industry benchmark |
| **Evaluate LLM outputs** | Alignment metrics, novel signal detection |
| **Compare prompts** | Run the same content through different prompts, compare scores |
| **QA AI features** | Check if your AI-generated content meets governance standards |
| **Audit competitor pages** | See how your site compares to competitors in your industry |

---

## Local Evaluation Mode

Already have findings from your own AI system? Compare them against a human baseline:

```bash
npx gravito-eval run ./my-findings.json
```

Input format:

```json
{
  "aiFindings": [
    {
      "id": "ai-1",
      "description": "Hero section uses unsubstantiated claim",
      "category": "trust",
      "severity": "high"
    }
  ],
  "humanFindings": [
    {
      "id": "human-1",
      "description": "Misleading statistic in hero",
      "category": "trust",
      "severity": "high"
    }
  ]
}
```

Output:

```
  Recall:     75%
  Precision:  50%
  F1:         60%
  Top-3 Agreement: 100%
  Novel Signal:    67% (validated)

  ✓ Strong alignment with human judgment
  ◆ AI found significant issues humans missed
  Verdict: PASS
```

Add `--explain` for detailed match reasoning. Add `--json` for raw output.

---

## How It Works

```
URL → Fetch Content → Governance Analysis → Industry Benchmark → Score + Issues + Fixes
                              ↓
                    5 analysis frameworks:
                    • Claim verification
                    • Vocabulary compliance
                    • Disclosure detection
                    • Pattern recognition
                    • Brand governance
```

The analysis runs server-side on the Gravito engine. No local LLM required.

---

## CLI Reference

```
gravito-eval scan <url>            Scan a live URL
gravito-eval scan <url> --json     Output raw JSON
gravito-eval demo                  See a demo with explanations
gravito-eval run <path>            Evaluate local findings
gravito-eval run <path> --explain  Show detailed match reasoning
gravito-eval run <path> --json     Output raw JSON
gravito-eval --help                Show help
gravito-eval --version             Show version
```

---

## Requirements

- Node.js 18+
- Internet connection (for `scan` command)

---

## Telemetry

Anonymous usage data (timestamp, version, command name) is collected to improve the tool. No findings, file paths, or PII.

Disable: `GRAVITO_TELEMETRY=0 gravito-eval run ./data` or set `DO_NOT_TRACK=1`.

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

## Continuous Monitoring

Want this running continuously on your site?

[Gravito](https://gravito.ai) provides always-on governance monitoring, automated alerts, and team dashboards.

---

MIT License
