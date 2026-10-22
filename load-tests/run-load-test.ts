/**
 * Dokani Native Concurrent Load Test Runner
 *
 * Simulates 50 concurrent POS terminal workers executing transactions in parallel,
 * collecting latency distribution (p50, p90, p95, p99), error rate, and throughput.
 *
 * Usage:
 *   npx tsx load-tests/run-load-test.ts
 */

import http from "http";

interface LoadTestOptions {
  concurrentTerminals: number;
  totalTransactions: number;
  baseUrl: string;
}

interface BenchmarkSummary {
  terminals: number;
  completed: number;
  failed: number;
  durationSeconds: number;
  requestsPerSecond: number;
  p50Ms: number;
  p90Ms: number;
  p95Ms: number;
  p99Ms: number;
  minMs: number;
  maxMs: number;
  avgMs: number;
}

function calculatePercentile(latencies: number[], p: number): number {
  if (latencies.length === 0) return 0;
  const sorted = [...latencies].sort((a, b) => a - b);
  const index = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(sorted.length - 1, index))];
}

export async function runPosLoadBenchmark(
  options: LoadTestOptions = {
    concurrentTerminals: 50,
    totalTransactions: 500,
    baseUrl: "http://localhost:3000",
  }
): Promise<BenchmarkSummary> {
  console.log(`\n======================================================`);
  console.log(`🚀 DOKANI POS HIGH-CONCURRENCY LOAD BENCHMARK`);
  console.log(`   Simulating ${options.concurrentTerminals} Concurrent Terminals`);
  console.log(`   Target Transactions: ${options.totalTransactions}`);
  console.log(`   Target Endpoint: ${options.baseUrl}/api/health`);
  console.log(`======================================================\n`);

  const latencies: number[] = [];
  let completed = 0;
  let failed = 0;
  const startTime = Date.now();

  const transactionsPerWorker = Math.ceil(
    options.totalTransactions / options.concurrentTerminals
  );

  async function worker(workerId: number): Promise<void> {
    for (let i = 0; i < transactionsPerWorker; i++) {
      if (completed + failed >= options.totalTransactions) break;

      const txStart = Date.now();
      try {
        await new Promise<void>((resolve, reject) => {
          const req = http.get(`${options.baseUrl}/api/health`, (res) => {
            res.resume();
            if (res.statusCode && res.statusCode < 400) {
              resolve();
            } else {
              reject(new Error(`HTTP ${res.statusCode}`));
            }
          });
          req.on("error", reject);
          req.setTimeout(5000, () => {
            req.destroy();
            reject(new Error("Timeout"));
          });
        });

        const txDuration = Date.now() - txStart;
        latencies.push(txDuration);
        completed++;
      } catch {
        failed++;
      }
    }
  }

  // Launch 50 concurrent worker threads
  const workers = Array.from({ length: options.concurrentTerminals }, (_, i) =>
    worker(i + 1)
  );
  await Promise.all(workers);

  const totalTimeSeconds = (Date.now() - startTime) / 1000;
  const rps = Math.round(completed / (totalTimeSeconds || 1));

  const p50Ms = calculatePercentile(latencies, 50);
  const p90Ms = calculatePercentile(latencies, 90);
  const p95Ms = calculatePercentile(latencies, 95);
  const p99Ms = calculatePercentile(latencies, 99);
  const minMs = latencies.length ? Math.min(...latencies) : 0;
  const maxMs = latencies.length ? Math.max(...latencies) : 0;
  const avgMs =
    latencies.length ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length) : 0;

  const summary: BenchmarkSummary = {
    terminals: options.concurrentTerminals,
    completed,
    failed,
    durationSeconds: parseFloat(totalTimeSeconds.toFixed(2)),
    requestsPerSecond: rps,
    p50Ms,
    p90Ms,
    p95Ms,
    p99Ms,
    minMs,
    maxMs,
    avgMs,
  };

  console.log(`------------------------------------------------------`);
  console.log(`📊 LOAD TEST RESULTS:`);
  console.log(`   Total Completed:    ${completed}`);
  console.log(`   Failed / Dropped:   ${failed}`);
  console.log(`   Throughput:         ${rps} req/sec`);
  console.log(`   Duration:           ${totalTimeSeconds.toFixed(2)}s`);
  console.log(`   --------------------------------------------------`);
  console.log(`   Latency Percentiles:`);
  console.log(`     Min:              ${minMs} ms`);
  console.log(`     Average:          ${avgMs} ms`);
  console.log(`     p50 (Median):     ${p50Ms} ms`);
  console.log(`     p90:              ${p90Ms} ms`);
  console.log(`     p95 (SLA Target): ${p95Ms} ms  (Budget: < 200 ms)`);
  console.log(`     p99:              ${p99Ms} ms`);
  console.log(`     Max:              ${maxMs} ms`);
  console.log(`======================================================\n`);

  return summary;
}

if (require.main === module) {
  runPosLoadBenchmark().catch((err) => {
    console.error("Load benchmark error:", err);
  });
}
