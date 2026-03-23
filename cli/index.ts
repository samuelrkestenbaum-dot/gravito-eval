#!/usr/bin/env node

/**
 * Gravito Eval CLI
 *
 * Usage:
 *   gravito-eval scan <url>                     Scan a live URL
 *   gravito-eval compare <url1> <url2>          Compare two sites side-by-side
 *   gravito-eval demo                           Run a preloaded demo
 *   gravito-eval run <path>                     Evaluate local findings
 *   gravito-eval run <path> --explain           Show detailed match reasoning
 *   gravito-eval run <path> --json              Output raw JSON
 *   gravito-eval run <path> --no-telemetry      Disable anonymous tracking
 *   gravito-eval --help                         Show help
 *   gravito-eval --version                      Show version
 */

import * as fs from "fs";
import * as path from "path";
import * as https from "https";
import * as http from "http";
import { evaluate } from "../src/calibration";
import { trackRun } from "../src/telemetry";
import type { Finding, Adjudication, EvalResult } from "../src/types";

// ─── Constants ───────────────────────────────────────────────────────────

const API_BASE = process.env.GRAVITO_API_URL || "https://empathiq-api-hbjrlavx.manus.space";
const SHARE_BASE = "https://gravito.ai/try/report";

// ─── Color Helpers ───────────────────────────────────────────────────────

const isColorSupported = process.stdout.isTTY && !process.env.NO_COLOR;

const c = {
  bold: (s: string) => (isColorSupported ? `\x1b[1m${s}\x1b[0m` : s),
  dim: (s: string) => (isColorSupported ? `\x1b[2m${s}\x1b[0m` : s),
  green: (s: string) => (isColorSupported ? `\x1b[32m${s}\x1b[0m` : s),
  red: (s: string) => (isColorSupported ? `\x1b[31m${s}\x1b[0m` : s),
  yellow: (s: string) => (isColorSupported ? `\x1b[33m${s}\x1b[0m` : s),
  cyan: (s: string) => (isColorSupported ? `\x1b[36m${s}\x1b[0m` : s),
  magenta: (s: string) => (isColorSupported ? `\x1b[35m${s}\x1b[0m` : s),
  gray: (s: string) => (isColorSupported ? `\x1b[90m${s}\x1b[0m` : s),
  white: (s: string) => (isColorSupported ? `\x1b[37m${s}\x1b[0m` : s),
  bgRed: (s: string) => (isColorSupported ? `\x1b[41m\x1b[37m${s}\x1b[0m` : s),
  bgYellow: (s: string) =>
    isColorSupported ? `\x1b[43m\x1b[30m${s}\x1b[0m` : s,
  bgGreen: (s: string) =>
    isColorSupported ? `\x1b[42m\x1b[30m${s}\x1b[0m` : s,
  bgCyan: (s: string) =>
    isColorSupported ? `\x1b[46m\x1b[30m${s}\x1b[0m` : s,
};

// ─── Helpers ─────────────────────────────────────────────────────────────

function pct(n: number): string {
  return `${Math.round(n * 100)}%`;
}

function severityBadge(severity: string): string {
  switch (severity) {
    case "critical":
      return c.bgRed(" CRITICAL ");
    case "high":
      return c.red("HIGH");
    case "medium":
      return c.yellow("MEDIUM");
    case "low":
      return c.dim("LOW");
    default:
      return severity;
  }
}

function scoreColor(score: number): (s: string) => string {
  if (score >= 80) return c.green;
  if (score >= 60) return c.yellow;
  if (score >= 40) return c.yellow;
  return c.red;
}

function gradeEmoji(grade: string): string {
  switch (grade) {
    case "A":
      return "🟢";
    case "B":
      return "🟡";
    case "C":
      return "🟠";
    case "D":
      return "🔴";
    case "F":
      return "🔴";
    default:
      return "⚪";
  }
}

function bar(value: number, width: number = 20): string {
  const filled = Math.round((value / 100) * width);
  const empty = width - filled;
  const color = scoreColor(value);
  return color("█".repeat(filled)) + c.dim("░".repeat(empty));
}

function formatElapsed(ms: number): string {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${s % 60}s`;
}

function shortDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

// ─── HTTP Client ─────────────────────────────────────────────────────────

interface HttpResponse {
  status: number;
  body: string;
}

function httpRequest(method: string, url: string, data?: any, timeoutMs: number = 60000): Promise<HttpResponse> {
  return new Promise((resolve, reject) => {
    const payload = data ? JSON.stringify(data) : undefined;
    const parsed = new URL(url);
    const lib = parsed.protocol === "https:" ? https : http;

    const headers: Record<string, string> = {
      "User-Agent": "gravito-eval-cli",
    };
    if (payload) {
      headers["Content-Type"] = "application/json";
      headers["Content-Length"] = String(Buffer.byteLength(payload));
    }

    const req = lib.request(
      {
        hostname: parsed.hostname,
        port: parsed.port || (parsed.protocol === "https:" ? 443 : 80),
        path: parsed.pathname + parsed.search,
        method,
        headers,
        timeout: timeoutMs,
      },
      (res) => {
        let body = "";
        res.on("data", (chunk: Buffer) => (body += chunk.toString()));
        res.on("end", () =>
          resolve({ status: res.statusCode || 0, body })
        );
      }
    );

    req.on("error", reject);
    req.on("timeout", () => {
      req.destroy();
      reject(new Error("Request timed out"));
    });

    if (payload) req.write(payload);
    req.end();
  });
}

function httpPost(url: string, data: any, timeoutMs?: number): Promise<HttpResponse> {
  return httpRequest("POST", url, data, timeoutMs);
}

function httpGet(url: string, timeoutMs?: number): Promise<HttpResponse> {
  return httpRequest("GET", url, undefined, timeoutMs);
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ─── Scan Command ────────────────────────────────────────────────────────

interface ScanResult {
  url: string;
  pageTitle: string;
  overallScore: number;
  grade: string;
  riskLevel: string;
  summary: string;
  issues: Array<{
    category: string;
    severity: string;
    title: string;
    description: string;
    fix: string;
    location: string;
  }>;
  projection: {
    riskLevel: string;
    summary: string;
    potentialImpacts: string[];
    timeToFix: string;
  };
  rewrittenExcerpt: string;
  claimsDetected: number;
  claimsVerified: number;
  patternsDetected: string[];
  analysisTimeMs: number;
  engineUsed: string;
  reportId: string;
  benchmark: {
    percentileRank: number;
    industryCategory: string;
    industryLabel: string;
    industryAvg: number;
    insight: string;
  };
}

// Known brand names and design-intent terms that should NOT be flagged
const KNOWN_BRANDS = new Set([
  'URBN', 'NYSE', 'NASDAQ', 'AWS', 'GCP', 'IBM', 'SAP', 'HSBC', 'KPMG',
  'BMW', 'UBS', 'DHL', 'BBC', 'CNN', 'ESPN', 'HBO', 'NFL', 'NBA', 'FIFA',
  'IKEA', 'LEGO', 'ZARA', 'ASOS', 'LVMH', 'VISA', 'AMEX',
]);

function isLikelyFalsePositive(issue: ScanResult['issues'][0]): boolean {
  const desc = issue.description;
  const loc = issue.location || '';

  // Check if it's flagging a known brand name
  for (const brand of KNOWN_BRANDS) {
    if (desc.includes(brand)) return true;
  }

  // Check if it's flagging design-intent capitalization (headers, hero text)
  if (issue.category === 'brand_violation' || issue.title.toLowerCase().includes('capitalization')) {
    if (/header|hero|heading|banner|title|nav/i.test(loc)) return true;
    // Single all-caps words in quotes are likely design headers
    const quotedText = desc.match(/["']([A-Z]{2,})["']/);
    if (quotedText) return true;
  }

  return false;
}

function filterIssuesForDisplay(issues: ScanResult['issues']): ScanResult['issues'] {
  return issues.filter(issue => {
    // Filter out system/internal errors
    if (issue.category === 'system' || issue.title === 'System') return false;
    if (issue.description.toLowerCase().includes('sentinel checks could not')) return false;
    if (issue.description.toLowerCase().includes('system error')) return false;
    // Filter out generic "Pattern detected" filler issues
    if (issue.description.startsWith('Pattern detected:')) return false;
    // Filter out likely false positives (brand names, design-intent caps)
    if (isLikelyFalsePositive(issue)) return false;
    return true;
  });
}

function printScanResult(result: ScanResult, compact: boolean = false): void {
  // Filter issues before display
  const displayIssues = filterIssuesForDisplay(result.issues);
  const sc = scoreColor(result.overallScore);

  if (!compact) {
    console.log();
    console.log(c.bold("  Gravito Eval Results"));
    console.log(c.dim("  " + "─".repeat(50)));
    console.log();
  }

  // Score + Grade
  console.log(
    `  ${c.dim("Score:")}  ${sc(c.bold(String(result.overallScore)))}${c.dim("/100")}  ${gradeEmoji(result.grade)} ${c.bold(result.grade)} Grade`
  );
  console.log(`  ${c.dim("Site:")}   ${c.cyan(result.url)}`);
  if (result.pageTitle && !compact) {
    console.log(`  ${c.dim("Title:")}  ${result.pageTitle}`);
  }
  console.log();

  // Score bar
  console.log(`  ${bar(result.overallScore, 30)}  ${sc(String(result.overallScore) + "%")}`);
  console.log();

  // Benchmark — no (est.) label, cleaner presentation
  if (result.benchmark && !compact) {
    const b = result.benchmark;
    console.log(
      `  ${c.dim("vs")} ${b.industryLabel}: ${c.bold("top " + (100 - b.percentileRank) + "%")} ${c.dim("(avg: " + b.industryAvg + ")")}`
    );
    console.log();
  }

  // Key Issues
  if (displayIssues.length > 0) {
    console.log(c.bold("  Key Issues"));
    console.log(c.dim("  " + "─".repeat(50)));
    const maxIssues = compact ? 3 : 6;
    const topIssues = displayIssues.slice(0, maxIssues);
    for (const issue of topIssues) {
      console.log();
      console.log(`  ${severityBadge(issue.severity)}  ${c.bold(issue.title)}`);
      console.log(`  ${c.dim("→")} ${issue.description}`);
      if (!compact) {
        console.log(`  ${c.green("Fix:")} ${issue.fix}`);
      }
    }
    if (displayIssues.length > maxIssues) {
      console.log();
      console.log(
        c.dim(`  + ${displayIssues.length - maxIssues} more issues in full report`)
      );
    }
    console.log();
  }

  // Novel Insights (patterns) — only in full mode
  if (!compact && result.patternsDetected.length > 0) {
    console.log(c.bold("  Additional Insights"));
    console.log(c.dim("  " + "─".repeat(50)));
    for (const pattern of result.patternsDetected) {
      console.log(
        `  ${c.magenta("◆")} ${pattern.replace(/_/g, " ").replace(/\b\w/g, (ch) => ch.toUpperCase())}`
      );
    }
    console.log();
  }

  // Projection — only in full mode
  if (!compact && result.projection) {
    console.log(c.bold("  What This Means"));
    console.log(c.dim("  " + "─".repeat(50)));
    console.log(`  ${result.projection.summary}`);
    console.log(`  ${c.dim("Time to fix:")} ${result.projection.timeToFix}`);
    console.log();
  }

  // Shareable link — only in full mode
  if (!compact) {
    console.log(c.dim("  " + "─".repeat(50)));
    console.log(
      `  ${c.bold("Share:")} ${c.cyan(`${SHARE_BASE}/${result.reportId}`)}`
    );
    console.log();

    // Next step — subtle, not salesy
    console.log(c.dim("  Try another site:"));
    console.log(c.dim("  npx gravito-eval scan https://your-site.com"));
    console.log();

    // Analysis meta
    console.log(
      c.dim(
        `  Analyzed in ${(result.analysisTimeMs / 1000).toFixed(1)}s · ${result.engineUsed} · ${displayIssues.length} issues found`
      )
    );
    console.log();
  }
}

// ─── Local URL Fetcher ──────────────────────────────────────────────────

interface FetchedPage {
  content: string;
  pageTitle: string;
}

function fetchPageContent(url: string): Promise<FetchedPage> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const lib = parsed.protocol === "https:" ? https : http;

    const req = lib.request(
      {
        hostname: parsed.hostname,
        port: parsed.port || (parsed.protocol === "https:" ? 443 : 80),
        path: parsed.pathname + parsed.search,
        method: "GET",
        headers: {
          "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.5",
        },
        timeout: 20000,
      },
      (res) => {
        // Follow redirects
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          fetchPageContent(new URL(res.headers.location, url).toString())
            .then(resolve)
            .catch(reject);
          return;
        }

        if (res.statusCode && res.statusCode >= 400) {
          reject(new Error(`HTTP ${res.statusCode}`));
          return;
        }

        let body = "";
        res.on("data", (chunk: Buffer) => (body += chunk.toString()));
        res.on("end", () => {
          // Extract title
          const titleMatch = body.match(/<title[^>]*>(.*?)<\/title>/i);
          const pageTitle = titleMatch ? titleMatch[1].trim() : url;

          // Strip HTML to text
          const content = body
            .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
            .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
            .replace(/<[^>]+>/g, " ")
            .replace(/&nbsp;/g, " ")
            .replace(/&amp;/g, "&")
            .replace(/&lt;/g, "<")
            .replace(/&gt;/g, ">")
            .replace(/&quot;/g, '"')
            .replace(/&#39;/g, "'")
            .replace(/\s+/g, " ")
            .trim()
            .slice(0, 15000);

          if (content.length < 50) {
            reject(new Error("Page content too short"));
            return;
          }

          resolve({ content, pageTitle });
        });
      }
    );

    req.on("error", reject);
    req.on("timeout", () => {
      req.destroy();
      reject(new Error("Request timed out"));
    });
    req.end();
  });
}

async function runPrefetchedScan(targetUrl: string): Promise<ScanResult> {
  const startTime = Date.now();

  console.log();
  console.log(`  ${c.dim("Scanning")} ${c.cyan(targetUrl)}`);
  console.log();

  // Step 1: Fetch locally
  console.log(`  ${c.cyan("\u25d0")} Fetching page content ${c.dim("(local)")}`);
  const page = await fetchPageContent(targetUrl);
  const fetchElapsed = formatElapsed(Date.now() - startTime);
  console.log(`  ${c.green("\u25d1")} Page fetched ${c.dim(`(${fetchElapsed})`)}`);

  // Step 2: Send to server for analysis (async — returns jobId)
  console.log(`  ${c.cyan("\u25d1")} Running content analysis`);

  const response = await httpPost(
    `${API_BASE}/api/trpc/try.analyzePrefetched`,
    { json: { url: targetUrl, content: page.content.slice(0, 8000), pageTitle: page.pageTitle } }
  );

  if (response.status !== 200) {
    let errorMsg = "Analysis failed";
    try {
      const err = JSON.parse(response.body);
      if (err?.error?.json?.message) errorMsg = err.error.json.message;
      else if (err?.error?.message) errorMsg = err.error.message;
    } catch {}
    throw new Error(errorMsg);
  }

  const startParsed = JSON.parse(response.body);
  const jobId = startParsed.result?.data?.json?.jobId;
  if (!jobId) {
    // Fallback: maybe server returned result directly (old sync endpoint)
    const directResult: ScanResult = startParsed.result?.data?.json || startParsed.result?.data || startParsed;
    if (directResult.overallScore || directResult.overallScore === 0) {
      const totalElapsed = formatElapsed(Date.now() - startTime);
      console.log(`  ${c.green("\u25c9")} Analysis complete ${c.dim(`(${totalElapsed})`)}`);
      console.log();
      return directResult;
    }
    throw new Error("Unexpected response format");
  }

  // Step 3: Poll for results
  for (let i = 0; i < 60; i++) {
    await sleep(2000);
    try {
      const pollResponse = await httpGet(
        `${API_BASE}/api/trpc/try.getScanStatus?input=${encodeURIComponent(JSON.stringify({ json: { jobId } }))}`
      );
      if (pollResponse.status !== 200) continue;
      const pollParsed = JSON.parse(pollResponse.body);
      const data = pollParsed.result?.data?.json || pollParsed.result?.data;
      if (!data) continue;
      if (data.status === 'complete' && data.result) {
        const totalElapsed = formatElapsed(Date.now() - startTime);
        console.log(`  ${c.green("\u25c9")} Analysis complete ${c.dim(`(${totalElapsed})`)}`);
        console.log();
        return data.result as ScanResult;
      }
      if (data.status === 'error') {
        throw new Error(data.error || 'Analysis failed');
      }
    } catch (err: any) {
      if (err.message && err.message !== 'Request timed out') throw err;
    }
  }
  throw new Error('Scan timed out');
}

async function runPrefetchedScanQuiet(url: string): Promise<ScanResult> {
  const page = await fetchPageContent(url);

  const response = await httpPost(
    `${API_BASE}/api/trpc/try.analyzePrefetched`,
    { json: { url, content: page.content.slice(0, 8000), pageTitle: page.pageTitle } }
  );

  if (response.status !== 200) {
    throw new Error("Analysis failed");
  }

  const startParsed = JSON.parse(response.body);
  const jobId = startParsed.result?.data?.json?.jobId;
  if (!jobId) {
    // Fallback: maybe server returned result directly (old sync endpoint)
    const directResult: ScanResult = startParsed.result?.data?.json || startParsed.result?.data || startParsed;
    if (directResult.overallScore || directResult.overallScore === 0) return directResult;
    throw new Error("Unexpected response format");
  }

  // Poll for results
  for (let i = 0; i < 60; i++) {
    await sleep(2000);
    try {
      const pollResponse = await httpGet(
        `${API_BASE}/api/trpc/try.getScanStatus?input=${encodeURIComponent(JSON.stringify({ json: { jobId } }))}`
      );
      if (pollResponse.status !== 200) continue;
      const pollParsed = JSON.parse(pollResponse.body);
      const data = pollParsed.result?.data?.json || pollParsed.result?.data;
      if (!data) continue;
      if (data.status === 'complete' && data.result) return data.result as ScanResult;
      if (data.status === 'error') throw new Error(data.error || 'Analysis failed');
    } catch (err: any) {
      if (err.message && err.message !== 'Request timed out') throw err;
    }
  }
  throw new Error('Scan timed out');
}

async function runScan(url: string, jsonOutput: boolean): Promise<ScanResult> {
  // Normalize URL
  let targetUrl = url.trim();
  if (!targetUrl.startsWith("http")) {
    targetUrl = `https://${targetUrl}`;
  }

  // Validate URL
  try {
    new URL(targetUrl);
  } catch {
    console.error(`Invalid URL: ${url}`);
    console.error(`Usage: gravito-eval scan https://example.com`);
    process.exit(1);
  }

  // Try prefetched scan first (CLI fetches URL, server only does LLM analysis)
  // Falls back to async scan, then sync scan
  let result: ScanResult;
  try {
    result = await runPrefetchedScan(targetUrl);
  } catch (prefetchErr: any) {
    // If prefetched scan fails, try async scan (server fetches URL)
    try {
      result = await runAsyncScan(targetUrl);
    } catch (asyncErr: any) {
      // Last resort: sync scan
      try {
        result = await runSyncScan(targetUrl);
      } catch (syncErr: any) {
        console.error(`Error: ${syncErr.message || 'Analysis failed'}`);
        console.error();
        console.error(`This can happen if:`);
        console.error(`  ${c.dim("\u2022")} The URL is not publicly accessible`);
        console.error(`  ${c.dim("\u2022")} The site blocks automated requests`);
        console.error(`  ${c.dim("\u2022")} The Gravito API is temporarily unavailable`);
        console.error();
        console.error(`Try: gravito-eval scan https://stripe.com`);
        process.exit(1);
      }
    }
  }

  if (jsonOutput) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    printScanResult(result);
  }

  return result;
}

async function runAsyncScan(targetUrl: string): Promise<ScanResult> {
  const startTime = Date.now();

  // Step 1: Start the scan (returns immediately)
  console.log();
  console.log(`  ${c.dim("Scanning")} ${c.cyan(targetUrl)}`);
  console.log();

  const startResponse = await httpPost(
    `${API_BASE}/api/trpc/try.startScan`,
    { json: { url: targetUrl } }
  );

  if (startResponse.status !== 200) {
    throw new Error(`Failed to start scan (HTTP ${startResponse.status})`);
  }

  const startParsed = JSON.parse(startResponse.body);
  const jobId = startParsed.result?.data?.json?.jobId;
  if (!jobId) {
    throw new Error('No job ID returned');
  }

  // Step 2: Poll for results with real progress and elapsed time
  const progressSteps = [
    { status: 'fetching', icon: '\u25d0', msg: 'Fetching page content' },
    { status: 'analyzing', icon: '\u25d1', msg: 'Running content analysis' },
    { status: 'scoring', icon: '\u25d2', msg: 'Scoring against industry baseline' },
    { status: 'complete', icon: '\u25c9', msg: 'Analysis complete' },
  ];

  let lastStatus = '';
  const maxPolls = 60; // 2 minutes max
  let lastProgressUpdate = Date.now();

  for (let i = 0; i < maxPolls; i++) {
    await sleep(2000);

    const elapsed = formatElapsed(Date.now() - startTime);

    try {
      const pollResponse = await httpGet(
        `${API_BASE}/api/trpc/try.getScanStatus?input=${encodeURIComponent(JSON.stringify({ json: { jobId } }))}`
      );

      if (pollResponse.status !== 200) continue;

      const pollParsed = JSON.parse(pollResponse.body);
      const data = pollParsed.result?.data?.json || pollParsed.result?.data;
      if (!data) continue;

      // Show progress update if status changed
      if (data.status !== lastStatus) {
        const step = progressSteps.find(s => s.status === data.status);
        if (step) {
          const color = data.status === 'complete' ? c.green : c.cyan;
          console.log(`  ${color(step.icon)} ${step.msg} ${c.dim(`(${elapsed})`)}`);
        }
        lastStatus = data.status;
        lastProgressUpdate = Date.now();
      } else if (Date.now() - lastProgressUpdate > 10000 && data.status !== 'complete') {
        // Reassurance message every 10s if no status change
        console.log(`  ${c.dim(`  Still working... (${elapsed})`)}`);
        lastProgressUpdate = Date.now();
      }

      // Check for completion
      if (data.status === 'complete' && data.result) {
        console.log();
        return data.result as ScanResult;
      }

      // Check for error
      if (data.status === 'error') {
        const errorMsg = data.error || 'Analysis failed';
        if (errorMsg.includes('Could not fetch')) {
          throw new Error(`Could not reach ${targetUrl}. The site may block automated requests or require authentication.`);
        }
        if (errorMsg.includes('timeout') || errorMsg.includes('timed out')) {
          throw new Error(`The site took too long to respond. Try a simpler page or check if the URL is correct.`);
        }
        throw new Error(errorMsg);
      }
    } catch (pollErr: any) {
      // If it's our own thrown error, re-throw
      if (pollErr.message && !pollErr.message.includes('timed out') && pollErr.message !== 'Request timed out') {
        throw pollErr;
      }
      // Otherwise transient network issue, keep polling
    }
  }

  throw new Error('Scan timed out after 2 minutes.');
}

async function runSyncScan(targetUrl: string): Promise<ScanResult> {
  console.log();
  console.log(`  ${c.dim("Scanning")} ${c.cyan(targetUrl)}`);
  
  const startTime = Date.now();
  const progressInterval = setInterval(() => {
    const elapsed = formatElapsed(Date.now() - startTime);
    process.stdout.write(c.dim(`.`));
  }, 3000);

  try {
    const response = await httpPost(
      `${API_BASE}/api/trpc/try.analyzeUrl`,
      { json: { url: targetUrl } }
    );

    clearInterval(progressInterval);
    console.log();

    if (response.status !== 200) {
      let errorMsg = 'Analysis failed';
      try {
        const err = JSON.parse(response.body);
        if (err?.error?.json?.message) errorMsg = err.error.json.message;
        else if (err?.error?.message) errorMsg = err.error.message;
      } catch {}
      throw new Error(errorMsg);
    }

    const parsed = JSON.parse(response.body);
    const result: ScanResult = parsed.result?.data?.json || parsed.result?.data || parsed;

    if (!result.overallScore && result.overallScore !== 0) {
      throw new Error('Unexpected response format');
    }

    return result;
  } catch (err) {
    clearInterval(progressInterval);
    console.log();
    throw err;
  }
}

// ─── Compare Command ────────────────────────────────────────────────────

async function runCompare(url1: string, url2: string, jsonOutput: boolean): Promise<void> {
  // Normalize URLs
  let targetUrl1 = url1.trim();
  let targetUrl2 = url2.trim();
  if (!targetUrl1.startsWith("http")) targetUrl1 = `https://${targetUrl1}`;
  if (!targetUrl2.startsWith("http")) targetUrl2 = `https://${targetUrl2}`;

  // Validate URLs
  try {
    new URL(targetUrl1);
    new URL(targetUrl2);
  } catch {
    console.error(`Invalid URL(s).`);
    console.error(`Usage: gravito-eval compare https://site1.com https://site2.com`);
    process.exit(1);
  }

  console.log();
  console.log(c.bold("  Gravito Eval — Comparison"));
  console.log(c.dim("  " + "─".repeat(50)));
  console.log();
  console.log(`  Scanning ${c.cyan(shortDomain(targetUrl1))} and ${c.cyan(shortDomain(targetUrl2))}...`);
  console.log();

  // Run both scans
  let result1: ScanResult;
  let result2: ScanResult;

  try {
    // Run scans sequentially to avoid overwhelming the server
    console.log(`  ${c.cyan("◐")} Analyzing ${c.bold(shortDomain(targetUrl1))}...`);
    result1 = await runScanQuiet(targetUrl1);
    console.log(`  ${c.green("✓")} ${shortDomain(targetUrl1)}: ${scoreColor(result1.overallScore)(String(result1.overallScore) + "/100")} ${gradeEmoji(result1.grade)}`);
    console.log();

    console.log(`  ${c.cyan("◐")} Analyzing ${c.bold(shortDomain(targetUrl2))}...`);
    result2 = await runScanQuiet(targetUrl2);
    console.log(`  ${c.green("✓")} ${shortDomain(targetUrl2)}: ${scoreColor(result2.overallScore)(String(result2.overallScore) + "/100")} ${gradeEmoji(result2.grade)}`);
    console.log();
  } catch (err: any) {
    console.error(`\n  ${c.red("Error:")} ${err.message}`);
    console.error(`  One or both sites could not be analyzed.`);
    process.exit(1);
  }

  if (jsonOutput) {
    console.log(JSON.stringify({
      siteA: { url: result1.url, score: result1.overallScore, grade: result1.grade, issues: result1.issues },
      siteB: { url: result2.url, score: result2.overallScore, grade: result2.grade, issues: result2.issues },
      winner: result1.overallScore >= result2.overallScore ? shortDomain(targetUrl1) : shortDomain(targetUrl2),
      scoreDiff: Math.abs(result1.overallScore - result2.overallScore),
    }, null, 2));
    return;
  }

  // Print comparison
  printComparison(result1, result2);
}

async function runScanQuiet(url: string): Promise<ScanResult> {
  // Try prefetched first, then async, then sync
  try {
    return await runPrefetchedScanQuiet(url);
  } catch {
    try {
      return await runAsyncScanQuiet(url);
    } catch {
      return await runSyncScanQuiet(url);
    }
  }
}

async function runAsyncScanQuiet(url: string): Promise<ScanResult> {
  const startResponse = await httpPost(
    `${API_BASE}/api/trpc/try.startScan`,
    { json: { url } }
  );

  if (startResponse.status !== 200) {
    throw new Error(`Failed to start scan`);
  }

  const startParsed = JSON.parse(startResponse.body);
  const jobId = startParsed.result?.data?.json?.jobId;
  if (!jobId) throw new Error('No job ID');

  for (let i = 0; i < 60; i++) {
    await sleep(2000);

    try {
      const pollResponse = await httpGet(
        `${API_BASE}/api/trpc/try.getScanStatus?input=${encodeURIComponent(JSON.stringify({ json: { jobId } }))}`
      );

      if (pollResponse.status !== 200) continue;

      const pollParsed = JSON.parse(pollResponse.body);
      const data = pollParsed.result?.data?.json || pollParsed.result?.data;
      if (!data) continue;

      if (data.status === 'complete' && data.result) {
        return data.result as ScanResult;
      }

      if (data.status === 'error') {
        throw new Error(data.error || 'Analysis failed');
      }
    } catch (err: any) {
      if (err.message && err.message !== 'Request timed out') throw err;
    }
  }

  throw new Error('Scan timed out');
}

async function runSyncScanQuiet(url: string): Promise<ScanResult> {
  const response = await httpPost(
    `${API_BASE}/api/trpc/try.analyzeUrl`,
    { json: { url } }
  );

  if (response.status !== 200) {
    throw new Error('Analysis failed');
  }

  const parsed = JSON.parse(response.body);
  return parsed.result?.data?.json || parsed.result?.data || parsed;
}

function printComparison(a: ScanResult, b: ScanResult): void {
  const domainA = shortDomain(a.url);
  const domainB = shortDomain(b.url);
  const issuesA = filterIssuesForDisplay(a.issues);
  const issuesB = filterIssuesForDisplay(b.issues);

  console.log(c.bold("  Head-to-Head"));
  console.log(c.dim("  " + "═".repeat(50)));
  console.log();

  // Side-by-side scores
  const scA = scoreColor(a.overallScore);
  const scB = scoreColor(b.overallScore);

  console.log(`  ${c.bold(domainA)}`);
  console.log(`  ${bar(a.overallScore, 25)}  ${scA(c.bold(String(a.overallScore)))}${c.dim("/100")} ${gradeEmoji(a.grade)} ${a.grade}`);
  console.log();
  console.log(`  ${c.bold(domainB)}`);
  console.log(`  ${bar(b.overallScore, 25)}  ${scB(c.bold(String(b.overallScore)))}${c.dim("/100")} ${gradeEmoji(b.grade)} ${b.grade}`);
  console.log();

  // Score difference
  const diff = Math.abs(a.overallScore - b.overallScore);
  const winner = a.overallScore >= b.overallScore ? domainA : domainB;
  const loser = a.overallScore >= b.overallScore ? domainB : domainA;

  if (diff === 0) {
    console.log(`  ${c.bold("Result:")} ${c.yellow("Tie")} — both sites scored equally`);
  } else {
    console.log(`  ${c.bold("Winner:")} ${c.green(winner)} ${c.dim(`(+${diff} points over ${loser})`)}`);
  }
  console.log();

  // Key differences
  console.log(c.bold("  Key Differences"));
  console.log(c.dim("  " + "─".repeat(50)));
  console.log();

  // Compare issue categories
  const categoriesA = new Set(issuesA.map(i => i.category));
  const categoriesB = new Set(issuesB.map(i => i.category));

  // Issues only in A
  const onlyInA = issuesA.filter(i => !categoriesB.has(i.category));
  // Issues only in B
  const onlyInB = issuesB.filter(i => !categoriesA.has(i.category));
  // Shared categories
  const shared = issuesA.filter(i => categoriesB.has(i.category));

  if (onlyInA.length > 0) {
    console.log(`  ${c.red("Only")} ${c.bold(domainA)} ${c.red("has:")}`);
    for (const issue of onlyInA.slice(0, 3)) {
      console.log(`    ${severityBadge(issue.severity)} ${issue.title}`);
    }
    console.log();
  }

  if (onlyInB.length > 0) {
    console.log(`  ${c.red("Only")} ${c.bold(domainB)} ${c.red("has:")}`);
    for (const issue of onlyInB.slice(0, 3)) {
      console.log(`    ${severityBadge(issue.severity)} ${issue.title}`);
    }
    console.log();
  }

  if (shared.length > 0) {
    console.log(`  ${c.yellow("Both sites have:")}`);
    const sharedCategories = [...new Set(shared.map(i => i.title))].slice(0, 3);
    for (const title of sharedCategories) {
      console.log(`    ${c.yellow("~")} ${title}`);
    }
    console.log();
  }

  // High-severity comparison
  const highA = issuesA.filter(i => i.severity === 'high' || i.severity === 'critical').length;
  const highB = issuesB.filter(i => i.severity === 'high' || i.severity === 'critical').length;

  console.log(c.bold("  Issue Summary"));
  console.log(c.dim("  " + "─".repeat(50)));
  console.log(`  ${c.bold(domainA)}: ${issuesA.length} issues (${highA} high-severity)`);
  console.log(`  ${c.bold(domainB)}: ${issuesB.length} issues (${highB} high-severity)`);
  console.log();

  // Surprising gap
  if (diff >= 15) {
    const higherSite = a.overallScore >= b.overallScore ? a : b;
    const lowerSite = a.overallScore >= b.overallScore ? b : a;
    const higherDomain = a.overallScore >= b.overallScore ? domainA : domainB;
    const lowerDomain = a.overallScore >= b.overallScore ? domainB : domainA;

    console.log(c.bold("  Notable Gap"));
    console.log(c.dim("  " + "─".repeat(50)));
    console.log(`  ${higherDomain} scores ${diff} points higher than ${lowerDomain}.`);

    // Find the biggest category difference
    const lowerHighIssues = filterIssuesForDisplay(lowerSite.issues).filter(i => i.severity === 'high');
    if (lowerHighIssues.length > 0) {
      console.log(`  The biggest driver: ${lowerHighIssues[0].title.toLowerCase()}.`);
    }
    console.log();
  }

  // Share links
  console.log(c.dim("  " + "─".repeat(50)));
  if (a.reportId && a.reportId !== 'demo') {
    console.log(`  ${c.dim("Share:")} ${c.cyan(`${SHARE_BASE}/${a.reportId}`)} ${c.dim(`(${domainA})`)}`);
  }
  if (b.reportId && b.reportId !== 'demo') {
    console.log(`  ${c.dim("Share:")} ${c.cyan(`${SHARE_BASE}/${b.reportId}`)} ${c.dim(`(${domainB})`)}`);
  }
  console.log();

  // Next step
  console.log(c.dim("  Compare your site to a competitor:"));
  console.log(c.dim("  npx gravito-eval compare https://your-site.com https://competitor.com"));
  console.log();
}

// ─── Demo Command ────────────────────────────────────────────────────────

function runDemo(): void {
  console.log();
  console.log(c.bold("  Gravito Eval — Demo"));
  console.log(c.dim("  " + "─".repeat(50)));
  console.log();
  console.log(
    `  Gravito scans any website and tells you:`
  );
  console.log(
    `  ${c.cyan("1.")} What issues a content reviewer would flag`
  );
  console.log(`  ${c.cyan("2.")} What additional problems most reviewers miss`);
  console.log(
    `  ${c.cyan("3.")} How your site compares to others in your industry`
  );
  console.log();
  console.log(c.dim("  " + "─".repeat(50)));
  console.log();
  console.log(c.bold("  Example: Scanning a SaaS landing page"));
  console.log();

  // Simulated output
  const demoResult: ScanResult = {
    url: "https://example-saas.com",
    pageTitle: "Example SaaS — Project Management for Teams",
    overallScore: 64,
    grade: "D",
    riskLevel: "medium",
    summary:
      "This page has 4 high-priority issues that weaken trust and conversion. Fixing them would meaningfully improve both quality and user confidence.",
    issues: [
      {
        category: "unsubstantiated_claim",
        severity: "high",
        title: "Unsubstantiated Performance Claim",
        description:
          '"Trusted by 10,000+ teams" — no source, no verification, no link to evidence',
        fix: "Add a source link or replace with verifiable metric",
        location: "Hero section",
      },
      {
        category: "missing_disclosure",
        severity: "high",
        title: "Missing AI Disclosure",
        description:
          'Uses "AI-powered" in headline but no transparency about how AI is used or what data it processes',
        fix: "Add an AI transparency section or link to AI usage policy",
        location: "Above the fold",
      },
      {
        category: "content_safety",
        severity: "medium",
        title: "Absolute Language Without Qualification",
        description:
          '"The fastest project management tool" — superlative claim without comparative data',
        fix: 'Qualify with "one of the fastest" or add benchmark data',
        location: "Features section",
      },
      {
        category: "trust_transparency",
        severity: "medium",
        title: "Cookie Consent Missing",
        description:
          "No cookie consent banner detected. Required under GDPR/ePrivacy for EU visitors.",
        fix: "Implement a cookie consent mechanism before tracking scripts load",
        location: "Global",
      },
      {
        category: "brand_consistency",
        severity: "low",
        title: "Inconsistent Messaging Tone",
        description:
          "Hero uses casual tone, pricing page uses formal/legal tone — creates cognitive dissonance",
        fix: "Align tone across all pages to match brand voice guidelines",
        location: "Multiple pages",
      },
    ],
    projection: {
      riskLevel: "medium",
      summary:
        "This page is functional but has 4 issues that weaken its effectiveness. Fixing them would meaningfully improve trust and conversion.",
      potentialImpacts: [
        "Customer trust erosion from unsubstantiated claims",
        "Transparency gaps that erode user confidence",
      ],
      timeToFix: "30–60 minutes",
    },
    rewrittenExcerpt: "",
    claimsDetected: 6,
    claimsVerified: 2,
    patternsDetected: [
      "overclaiming",
      "missing_disclaimers",
      "unsubstantiated_claims",
    ],
    analysisTimeMs: 4200,
    engineUsed: "Gravito Engine (Demo)",
    reportId: "demo",
    benchmark: {
      percentileRank: 42,
      industryCategory: "saas_marketing",
      industryLabel: "SaaS Marketing Pages",
      industryAvg: 62,
      insight:
        "This page falls below the median for SaaS marketing pages. Competitors with better scores are building more trust with the same audience.",
    },
  };

  printScanResult(demoResult);

  console.log(c.dim("  " + "═".repeat(50)));
  console.log();
  console.log(c.bold("  How it works"));
  console.log();
  console.log(
    `  ${c.cyan("→")} Gravito fetches the page and extracts content`
  );
  console.log(
    `  ${c.cyan("→")} Runs analysis across 5 quality frameworks`
  );
  console.log(
    `  ${c.cyan("→")} Compares against industry benchmarks`
  );
  console.log(
    `  ${c.cyan("→")} Identifies issues a human reviewer would flag`
  );
  console.log(
    `  ${c.cyan("→")} Finds additional issues humans typically miss`
  );
  console.log();
  console.log(c.dim("  " + "═".repeat(50)));
  console.log();
  console.log(c.bold("  Try it on a real site:"));
  console.log();
  console.log(`  ${c.cyan("npx gravito-eval scan https://stripe.com")}`);
  console.log(`  ${c.cyan("npx gravito-eval scan https://openai.com")}`);
  console.log(`  ${c.cyan("npx gravito-eval scan https://your-site.com")}`);
  console.log();
  console.log(c.bold("  Or compare two sites:"));
  console.log();
  console.log(`  ${c.cyan("npx gravito-eval compare https://your-site.com https://competitor.com")}`);
  console.log();
}

// ─── Run Command (existing) ──────────────────────────────────────────────

function printResult(result: EvalResult): void {
  const d = result.detection;
  const r = result.ranking;

  console.log();
  console.log(c.bold("  Gravito Eval Results"));
  console.log(c.dim("  " + "─".repeat(50)));
  console.log();

  console.log(`  ${c.dim("Recall:")}     ${scoreColor(d.recall * 100)(pct(d.recall))}`);
  console.log(`  ${c.dim("Precision:")}  ${scoreColor(d.precision * 100)(pct(d.precision))}`);
  console.log(`  ${c.dim("F1:")}         ${scoreColor(d.f1 * 100)(pct(d.f1))}`);
  console.log();

  console.log(`  ${c.dim("Top-3 Agreement:")} ${scoreColor(r.top3Overlap * 100)(pct(r.top3Overlap))}`);

  if (result.novelSignal) {
    console.log(
      `  ${c.dim("Novel Signal:")}    ${c.magenta(pct(result.novelSignal.validatedNovelRate))} ${c.dim("(validated)")}`
    );
  }

  console.log();

  console.log(c.bold("  Interpretation"));
  console.log(c.dim("  " + "─".repeat(50)));
  printInterpretation(result);
  console.log();

  // Subtle next step
  console.log(c.dim("  " + "─".repeat(50)));
  console.log(c.dim("  Try scanning a live site:"));
  console.log(c.dim("  npx gravito-eval scan https://your-site.com"));
  console.log();
}

function printInterpretation(result: EvalResult): void {
  const d = result.detection;

  if (d.recall >= 0.7) {
    console.log(`  ${c.green("✓")} Strong alignment with human judgment`);
  } else if (d.recall >= 0.5) {
    console.log(`  ${c.yellow("~")} Moderate alignment — some human findings missed`);
  } else {
    console.log(`  ${c.red("✗")} Low alignment — many human findings missed`);
  }

  if (result.novelSignal) {
    const rate = result.novelSignal.validatedNovelRate;
    if (rate >= 0.4) {
      console.log(`  ${c.magenta("◆")} AI found significant issues humans missed`);
    } else if (rate >= 0.2) {
      console.log(`  ${c.magenta("◆")} AI found some issues humans missed`);
    }
  }

  // Verdict
  const verdictMap: Record<string, string> = {
    PASS: c.green("PASS"),
    PARTIAL: c.yellow("PARTIAL"),
    FAIL: c.red("FAIL"),
    INSUFFICIENT_DATA: c.dim("INSUFFICIENT DATA"),
  };
  console.log(`  ${c.dim("Verdict:")} ${verdictMap[result.verdict] || result.verdict}`);
}

// ─── Explain Mode ────────────────────────────────────────────────────────

function printExplain(result: EvalResult): void {
  console.log(c.bold("  Detailed Reasoning"));
  console.log(c.dim("  " + "─".repeat(50)));
  console.log();

  if (result.matches.length > 0) {
    console.log(c.bold("  Matched (AI ↔ Human):"));
    for (const m of result.matches) {
      console.log();
      console.log(`  ${c.cyan("AI:")}    "${m.aiIssue.description}"`);
      console.log(`  ${c.green("Human:")} "${m.humanIssue.description}"`);
      console.log(
        `  ${c.dim("Why:")}   ${m.matchType} match (${Math.round(m.similarity * 100)}% similar)`
      );
    }
    console.log();
  }

  if (result.aiOnly.length > 0) {
    console.log(c.bold("  Novel (AI found, humans didn't):"));
    for (const f of result.aiOnly) {
      console.log(`  ${c.magenta("→")} "${f.description}"`);
    }
    console.log();
  }

  if (result.humanOnly.length > 0) {
    console.log(c.bold("  Missed (humans found, AI didn't):"));
    for (const f of result.humanOnly) {
      console.log(`  ${c.red("✗")} "${f.description}"`);
    }
    console.log();
  }
}

// ─── Data Loading ────────────────────────────────────────────────────────

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

// ─── Main ────────────────────────────────────────────────────────────────

function showHelp(): void {
  console.log(`
${c.bold("Gravito Eval")} — Scan any website for content quality issues

${c.bold("Usage:")}
  gravito-eval scan <url>                     ${c.dim("Scan a live URL")}
  gravito-eval compare <url1> <url2>          ${c.dim("Compare two sites side-by-side")}
  gravito-eval demo                           ${c.dim("See a demo with explanations")}
  gravito-eval run <path>                     ${c.dim("Evaluate local findings")}

${c.bold("Scan flags:")}
  --json                                      ${c.dim("Output raw JSON")}

${c.bold("Run flags:")}
  --explain                                   ${c.dim("Show detailed match reasoning")}
  --json                                      ${c.dim("Output raw JSON")}
  --no-telemetry                              ${c.dim("Disable anonymous tracking")}

${c.bold("Examples:")}
  ${c.cyan("gravito-eval scan https://stripe.com")}        ${c.dim("Scan Stripe's homepage")}
  ${c.cyan("gravito-eval compare stripe.com github.com")}  ${c.dim("Compare two sites")}
  ${c.cyan("gravito-eval scan https://your-site.com")}     ${c.dim("Scan your own site")}
  ${c.cyan("gravito-eval demo")}                           ${c.dim("See what the output looks like")}
  ${c.cyan("gravito-eval run ./examples/basic")}           ${c.dim("Evaluate local data")}
`);
}

async function main(): Promise<void> {
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

  const command = args[0];

  // ── scan <url> ──
  if (command === "scan") {
    if (!args[1]) {
      console.error(`Missing URL.`);
      console.error(`Usage: gravito-eval scan https://example.com`);
      process.exit(1);
    }

    trackRun("scan");

    const jsonOutput = args.includes("--json");
    await runScan(args[1], jsonOutput);

    setTimeout(() => process.exit(0), 100);
    return;
  }

  // ── compare <url1> <url2> ──
  if (command === "compare") {
    if (!args[1] || !args[2]) {
      console.error(`Missing URL(s).`);
      console.error(`Usage: gravito-eval compare https://site1.com https://site2.com`);
      process.exit(1);
    }

    trackRun("compare");

    const jsonOutput = args.includes("--json");
    await runCompare(args[1], args[2], jsonOutput);

    setTimeout(() => process.exit(0), 100);
    return;
  }

  // ── demo ──
  if (command === "demo") {
    trackRun("demo");
    runDemo();
    setTimeout(() => process.exit(0), 100);
    return;
  }

  // ── run <path> ──
  if (command === "run") {
    if (!args[1]) {
      console.error(`Missing path.`);
      console.error(`Usage: gravito-eval run <path>`);
      process.exit(1);
    }

    const jsonOutput = args.includes("--json");
    const explainMode = args.includes("--explain");

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

    setTimeout(() => process.exit(0), 100);
    return;
  }

  // Unknown command
  console.error(`Unknown command: ${command}`);
  console.error();
  console.error(`Run: gravito-eval --help`);
  process.exit(1);
}

main().catch((err) => {
  console.error(`Fatal: ${err.message}`);
  process.exit(1);
});
