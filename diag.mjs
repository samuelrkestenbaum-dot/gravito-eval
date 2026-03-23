import https from "https";

const url = "https://empathiq-api-hbjrlavx.manus.space/api/trpc/try.analyzeUrl";
const payload = JSON.stringify({ json: { url: "https://stripe.com" } });
const parsed = new URL(url);

console.log("Starting request to:", parsed.hostname, parsed.pathname);
console.log("Payload length:", Buffer.byteLength(payload));
console.log("Time:", new Date().toISOString());

const req = https.request(
  {
    hostname: parsed.hostname,
    port: 443,
    path: parsed.pathname,
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Content-Length": Buffer.byteLength(payload),
      "User-Agent": "gravito-eval-cli",
    },
    timeout: 120000,
  },
  (res) => {
    console.log("Got response, status:", res.statusCode);
    console.log("Headers:", JSON.stringify(res.headers).substring(0, 200));
    let body = "";
    res.on("data", (chunk) => {
      body += chunk.toString();
      process.stdout.write(".");
    });
    res.on("end", () => {
      console.log("\nResponse length:", body.length);
      console.log("Time:", new Date().toISOString());
      if (res.statusCode === 200) {
        try {
          const parsed = JSON.parse(body);
          const result = parsed.result?.data?.json;
          console.log("Score:", result?.overallScore);
          console.log("Grade:", result?.grade);
          console.log("Issues:", result?.issues?.length);
          console.log("ReportId:", result?.reportId);
        } catch (e) {
          console.log("Parse error:", e.message);
          console.log("Body preview:", body.substring(0, 300));
        }
      } else {
        console.log("Error body:", body.substring(0, 500));
      }
    });
  }
);

req.on("error", (e) => {
  console.error("Request error:", e.message);
  console.error("Error code:", e.code);
  console.error("Time:", new Date().toISOString());
});

req.on("timeout", () => {
  console.error("Request timeout at:", new Date().toISOString());
  req.destroy();
});

req.on("socket", (socket) => {
  console.log("Socket assigned at:", new Date().toISOString());
  socket.on("connect", () => console.log("Socket connected at:", new Date().toISOString()));
  socket.on("secureConnect", () => console.log("TLS connected at:", new Date().toISOString()));
});

req.write(payload);
req.end();
console.log("Request sent at:", new Date().toISOString());
