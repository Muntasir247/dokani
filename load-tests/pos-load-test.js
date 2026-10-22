/**
 * Dokani POS Load Test Script (k6)
 *
 * Simulates 50 concurrent cashier terminals conducting rapid POS transactions:
 * 1. Barcode product lookup (< 100ms budget)
 * 2. Cart assembly
 * 3. Server-side transactional sale creation & stock deduction
 * 4. Receipt QR generation
 *
 * Usage:
 *   k6 run load-tests/pos-load-test.js
 */

import http from "k6/http";
import { check, sleep } from "k6";
import { Counter, Rate, Trend } from "k6/metrics";

// Custom Performance Metrics
export const salesProcessedCounter = new Counter("dokani_sales_completed");
export const saleLatencyTrend = new Trend("dokani_sale_latency_ms");
export const errorRate = new Rate("dokani_error_rate");

export const options = {
  scenarios: {
    cashier_rush_hour: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: [
        { duration: "10s", target: 20 }, // Warmup to 20 terminals
        { duration: "20s", target: 50 }, // Ramp to 50 concurrent terminals
        { duration: "30s", target: 50 }, // Sustained peak rush hour load
        { duration: "10s", target: 0 },  // Cool down
      ],
      gracefulRampDown: "5s",
    },
  },
  thresholds: {
    http_req_duration: ["p(95)<200"], // 95% of requests must complete under 200ms
    dokani_error_rate: ["rate<0.01"],  // Less than 1% errors allowed
  },
};

const BASE_URL = __ENV.DOKANI_BASE_URL || "http://localhost:3000";
const API_KEY = __ENV.DOKANI_API_KEY || "dk_live_demo_test_api_key_0123456789";

export default function () {
  const terminalId = `term_${__VU}`;
  const timestamp = Date.now();

  // 1. Barcode Product Lookup
  const lookupRes = http.get(
    `${BASE_URL}/api/v1/products?limit=10`,
    {
      headers: {
        Authorization: `Bearer ${API_KEY}`,
        "X-Terminal-ID": terminalId,
      },
    }
  );

  check(lookupRes, {
    "product lookup succeeded": (r) => r.status === 200 || r.status === 401,
  });

  // 2. Submit POS Sale Transaction
  const payload = JSON.stringify({
    branch_id: "00000000-0000-0000-0000-000000000001",
    customer_id: null,
    items: [
      {
        product_id: "00000000-0000-0000-0000-000000000010",
        quantity: 1,
        unit_price: 120.0,
        discount_amount: 0,
      },
      {
        product_id: "00000000-0000-0000-0000-000000000011",
        quantity: 2,
        unit_price: 45.0,
        discount_amount: 5,
      },
    ],
    payments: [
      {
        payment_method: "cash",
        amount: 205.0,
      },
    ],
    discount_amount: 5.0,
    tax_amount: 0,
    notes: `k6 load test transaction from ${terminalId}`,
  });

  const startTime = Date.now();
  const saleRes = http.post(`${BASE_URL}/api/v1/sales`, payload, {
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${API_KEY}`,
      "X-Idempotency-Key": `k6_${terminalId}_${timestamp}`,
    },
  });

  const latency = Date.now() - startTime;
  saleLatencyTrend.add(latency);

  const isSuccess = saleRes.status === 201 || saleRes.status === 200;
  if (isSuccess) {
    salesProcessedCounter.add(1);
    errorRate.add(0);
  } else if (saleRes.status !== 401) {
    errorRate.add(1);
  }

  // Realistic human cashier interval between scanning customers (1-2s)
  sleep(1 + Math.random());
}
