// A thin, first-party local telemetry collector.
//
// POST /v1/traces , append the posted NDJSON body (one span per line) to a file
// and answer 202. It TOLERATES unknown fields (it never validates the payload
// shape , forward-compat is the whole point: a newer emitter that adds a field
// must not 4xx an older collector). Binds 127.0.0.1:4318 by default (localhost
// only). Zero dependencies beyond node:http/fs.
//
// This is the sink the emitter's httpSink POSTs to when a maintainer arms a real
// endpoint (CONSORT_TELEMETRY_ENDPOINT + the sign-off flag). Run it with
// `npm run collector`; drive a sample trace at it with `npm run simulate-run`.

import * as fs from "node:fs";
import * as http from "node:http";
import * as path from "node:path";
import { isCliEntry } from "@databricks-solutions/lakebase-scm-utils/util";

export interface CollectorOptions {
  /** NDJSON file the posted lines are appended to. */
  outFile: string;
  host?: string;
  port?: number;
}

export interface RunningCollector {
  server: http.Server;
  /** The bound base URL (with the actual port, useful when port 0 was requested). */
  url: string;
  port: number;
  close(): Promise<void>;
}

/** Append the posted NDJSON lines to the out file. Tolerant: blank lines are
 *  skipped, and any write error is swallowed (the collector still answers 202). */
function appendLines(outFile: string, body: string): void {
  const lines = body.split("\n").map((l) => l.trim()).filter((l) => l.length > 0);
  if (lines.length === 0) return;
  try {
    fs.mkdirSync(path.dirname(path.resolve(outFile)), { recursive: true });
    fs.appendFileSync(outFile, lines.join("\n") + "\n", "utf8");
  } catch {
    /* tolerate: never fail the ingest on a disk error */
  }
}

/** Create (but do not start) the collector HTTP server. */
export function createCollector(opts: CollectorOptions): http.Server {
  return http.createServer((req, res) => {
    if (req.method === "POST" && (req.url === "/v1/traces" || req.url === "/v1/traces/")) {
      const chunks: Buffer[] = [];
      req.on("data", (c: Buffer) => chunks.push(c));
      req.on("end", () => {
        // Never validate the shape: unknown fields are tolerated -> 202.
        appendLines(opts.outFile, Buffer.concat(chunks).toString("utf8"));
        res.writeHead(202, { "content-type": "application/json" });
        res.end(JSON.stringify({ accepted: true }));
      });
      req.on("error", () => {
        res.writeHead(202, { "content-type": "application/json" });
        res.end(JSON.stringify({ accepted: true }));
      });
      return;
    }
    res.writeHead(404, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "not found" }));
  });
}

/** Start the collector and resolve once it is listening. */
export async function startCollector(opts: CollectorOptions): Promise<RunningCollector> {
  const host = opts.host ?? "127.0.0.1";
  const requestedPort = opts.port ?? 4318;
  const server = createCollector(opts);
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(requestedPort, host, () => {
      server.removeListener("error", reject);
      resolve();
    });
  });
  const addr = server.address();
  const port = typeof addr === "object" && addr ? addr.port : requestedPort;
  return {
    server,
    url: `http://${host}:${port}`,
    port,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

if (isCliEntry(import.meta.url)) {
  const outFile = process.env.CONSORT_TELEMETRY_OUT?.trim() || "consort-telemetry.ndjson";
  const port = Number(process.env.CONSORT_TELEMETRY_PORT ?? 4318);
  void startCollector({ outFile, port }).then((c) => {
    process.stderr.write(`[collector] listening on ${c.url}/v1/traces , appending to ${outFile}\n`);
  });
}
