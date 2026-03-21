/**
 * Optional anonymous telemetry for gravito-eval.
 *
 * Tracks: timestamp, package version, command name.
 * No PII. No findings data. No IP logging.
 *
 * Disable with: GRAVITO_TELEMETRY=0 or --no-telemetry flag.
 */

import * as https from "https";
import * as fs from "fs";
import * as path from "path";

const TELEMETRY_ENDPOINT = "https://gravito.ai/api/telemetry/eval";

function isDisabled(): boolean {
  return (
    process.env.GRAVITO_TELEMETRY === "0" ||
    process.env.GRAVITO_TELEMETRY === "false" ||
    process.env.DO_NOT_TRACK === "1" ||
    process.argv.includes("--no-telemetry")
  );
}

function getVersion(): string {
  try {
    let dir = __dirname;
    while (!fs.existsSync(path.join(dir, "package.json"))) {
      const parent = path.dirname(dir);
      if (parent === dir) return "unknown";
      dir = parent;
    }
    const pkg = JSON.parse(
      fs.readFileSync(path.join(dir, "package.json"), "utf-8")
    );
    return pkg.version || "unknown";
  } catch {
    return "unknown";
  }
}

export function trackRun(command: string): void {
  if (isDisabled()) return;

  const payload = JSON.stringify({
    timestamp: new Date().toISOString(),
    version: getVersion(),
    command,
  });

  try {
    const url = new URL(TELEMETRY_ENDPOINT);
    const req = https.request(
      {
        hostname: url.hostname,
        port: 443,
        path: url.pathname,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(payload),
        },
        timeout: 2000,
      },
      () => {
        // Intentionally ignore response
      }
    );

    req.on("error", () => {
      // Silently fail — telemetry must never block the CLI
    });

    req.write(payload);
    req.end();

    // Unref so the process can exit without waiting
    req.socket?.unref?.();
  } catch {
    // Silently fail
  }
}
