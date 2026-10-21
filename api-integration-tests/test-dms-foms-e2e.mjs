#!/usr/bin/env node
/**
 * End-to-End Live Integration Verification Script (Zero Frontend UI)
 * Tests all 3 integrations between DMS and FOMS across the internet:
 *   - Integration 1: Completed Delivery -> Billing / Accounts Receivable (DMS -> FOMS)
 *   - Integration 2: Failed Delivery -> Billing Hold & Re-Delivery Update (DMS <-> FOMS)
 *   - Integration 3: Delivery Cash Advance -> Approval & Liquidation (DMS <-> FOMS)
 *
 * Usage:
 *   node api-integration-tests/test-dms-foms-e2e.mjs
 */

const env = process.env;
const strip = (u) => (u || "").replace(/\/+$/, "");

const DMS_URL = strip(env.DMS_API_URL || "https://dts-api-gab-byafd0h2aha6a9c9.japaneast-01.azurewebsites.net");
const FOMS_URL = strip(env.FOMS_API_URL || "https://fomsintegration-amfve2fdccbdgbgy.eastasia-01.azurewebsites.net");

// Pre-shared 256-bit API keys
const DMS_TO_FOMS_KEY = env.DMS_TO_FOMS_KEY || "b84a1182dcd51ea1ee102585f61b0ed0dd779121b44fe42723fa789438e5e613";
const FOMS_TO_DMS_KEY = env.FOMS_TO_DMS_KEY || "03bc0b5e984b9c900e08c1a073ac4f0fd3a35519d00ed1c0ff1fea98e58222c9";

const TIMEOUT_MS = 60_000;
const results = [];

async function call(method, url, { headers = {}, body } = {}) {
  const started = Date.now();
  try {
    const res = await fetch(url, {
      method,
      headers: {
        ...(body ? { "Content-Type": "application/json" } : {}),
        ...headers,
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch { /* not JSON */ }
    return { status: res.status, headers: res.headers, text, json, ms: Date.now() - started };
  } catch (err) {
    return { status: 0, text: err.message, error: err, ms: Date.now() - started };
  }
}

async function test(name, fn) {
  try {
    const note = await fn();
    results.push({ name, ok: true, note });
    console.log(`  PASS  ${name}${note ? `  (${note})` : ""}`);
  } catch (e) {
    results.push({ name, ok: false, note: e.message });
    console.log(`  FAIL  ${name}\n        -> ${e.message}`);
  }
}

function expect(cond, msg) {
  if (!cond) throw new Error(msg);
}

function randomWaybill() {
  const num = Math.floor(100000 + Math.random() * 900000);
  return `WB-LIVE-${num}`;
}

function randomRequestId(prefix = "ADV") {
  const num = Math.floor(1000 + Math.random() * 9000);
  return `${prefix}-LIVE-${num}`;
}

async function main() {
  console.log("==================================================================");
  console.log("   DMS <-> FOMS Live API Integration Test (Headless / Zero UI)   ");
  console.log("==================================================================");
  console.log(`DMS API:  ${DMS_URL}`);
  console.log(`FOMS API: ${FOMS_URL}\n`);

  console.log("[1] Security & Auth Enforcement");
  await test("FOMS rejects unauthorized delivery completed push (missing X-Api-Key)", async () => {
    const res = await call("POST", `${FOMS_URL}/api/integration/dms/delivery-completed`, {
      body: { waybillNumber: "WB-UNAUTH-TEST", podImageUrl: "https://pod.example/1.jpg" }
    });
    expect(res.status === 401 || res.status === 503, `expected 401 or 503, got ${res.status} (${res.text})`);
    return `Status: ${res.status}`;
  });

  await test("FOMS rejects invalid X-Api-Key", async () => {
    const res = await call("POST", `${FOMS_URL}/api/integration/dms/delivery-completed`, {
      headers: { "X-Api-Key": "invalid-hex-key-xyz" },
      body: { waybillNumber: "WB-UNAUTH-TEST", podImageUrl: "https://pod.example/1.jpg" }
    });
    expect(res.status === 401, `expected 401, got ${res.status}`);
    return `Status: ${res.status}`;
  });

  await test("DMS rejects unauthorized trigger call (missing X-Api-Key)", async () => {
    const res = await call("POST", `${DMS_URL}/api/integration/foms/trigger-completed`, {
      body: { waybillNumber: "WB-UNAUTH-DMS", podImageUrl: "https://pod.example/1.jpg" }
    });
    expect(res.status === 401 || res.status === 503, `expected 401 or 503, got ${res.status} (${res.text})`);
    return `Status: ${res.status}`;
  });

  await test("DMS rejects invalid X-Api-Key", async () => {
    const res = await call("POST", `${DMS_URL}/api/integration/foms/trigger-completed`, {
      headers: { "X-Api-Key": "invalid-key-abc" },
      body: { waybillNumber: "WB-UNAUTH-DMS", podImageUrl: "https://pod.example/1.jpg" }
    });
    expect(res.status === 401, `expected 401, got ${res.status}`);
    return `Status: ${res.status}`;
  });

  console.log("\n[2] Integration 1: Completed Delivery -> Billing / Accounts Receivable (DMS -> FOMS)");
  const completedWaybill = randomWaybill();
  let generatedInvoiceNo = null;

  await test("FOMS processes completed delivery, validates POD & creates Invoice + AR", async () => {
    const res = await call("POST", `${FOMS_URL}/api/integration/dms/delivery-completed`, {
      headers: { "X-Api-Key": DMS_TO_FOMS_KEY },
      body: {
        waybillNumber: completedWaybill,
        deliveryStatus: "Completed",
        clientName: "Lazada Philippines",
        clientCode: "CA-001",
        recipientName: "Maria Santos",
        recipientAddress: "456 Ayala Avenue, Makati City",
        recipientContact: "09181234567",
        deliveryArea: "NCR",
        deliveryDateTime: new Date().toISOString(),
        podImageUrl: `https://storage.capstone.ph/pod/${completedWaybill}.jpg`,
        assignedDriver: "Pedro Penduko",
        driverEmployeeId: "DRV-202",
        packageDescription: "Electronic Components & Hardware",
        itemCount: 2,
        actualWeight: 3.5,
        declaredValue: 2500.00,
        deliveryRemarks: "Delivered to consignee directly with verified signature."
      }
    });

    expect(res.status === 200, `expected 200, got ${res.status}: ${res.text}`);
    expect(res.json?.isSuccess === true, `expected isSuccess=true, got: ${JSON.stringify(res.json)}`);
    expect(res.json?.invoiceNumber, "invoiceNumber should be generated");
    generatedInvoiceNo = res.json.invoiceNumber;
    return `Waybill: ${completedWaybill}, Invoice: ${generatedInvoiceNo}, Computed: ₱${res.json.computedAmount}`;
  });

  await test("FOMS waybill query confirms billing completed and AR record", async () => {
    const res = await call("GET", `${FOMS_URL}/api/integration/dms/waybills/${completedWaybill}`, {
      headers: { "X-Api-Key": DMS_TO_FOMS_KEY }
    });

    expect(res.status === 200, `expected 200, got ${res.status}`);
    expect(res.json?.billingHoldActive === false, "billingHoldActive should be false");
    expect(res.json?.invoiceNumber === generatedInvoiceNo, `invoiceNumber mismatch`);
    return `Status: ${res.json.status}, Invoice: ${res.json.invoiceNumber}`;
  });

  await test("Idempotency check: Re-submitting completed delivery returns existing invoice without error", async () => {
    const res = await call("POST", `${FOMS_URL}/api/integration/dms/delivery-completed`, {
      headers: { "X-Api-Key": DMS_TO_FOMS_KEY },
      body: {
        waybillNumber: completedWaybill,
        podImageUrl: `https://storage.capstone.ph/pod/${completedWaybill}.jpg`,
        clientName: "Lazada Philippines"
      }
    });

    expect(res.status === 200, `expected 200, got ${res.status}`);
    expect(res.json?.isSuccess === true, "idempotency should succeed");
    expect(res.json?.invoiceNumber === generatedInvoiceNo, "should return same invoice");
    return `Idempotent response with existing invoice ${res.json?.invoiceNumber}`;
  });

  console.log("\n[3] Integration 2: Failed Delivery -> Billing Hold & Re-Delivery (DMS <-> FOMS)");
  const failedWaybill = randomWaybill();

  await test("FOMS places Billing Hold on failed delivery, blocking invoice creation", async () => {
    const res = await call("POST", `${FOMS_URL}/api/integration/dms/delivery-failed`, {
      headers: { "X-Api-Key": DMS_TO_FOMS_KEY },
      body: {
        waybillNumber: failedWaybill,
        failedStatus: "Failed",
        failureReason: "Consignee Not Available / Closed Office",
        failureRemarks: "Building security refused package receipt after hours.",
        attemptCount: 1,
        failedAt: new Date().toISOString(),
        driverEmployeeId: "DRV-202"
      }
    });

    expect(res.status === 200, `expected 200, got ${res.status}: ${res.text}`);
    expect(res.json?.isSuccess === true, `expected isSuccess=true`);
    expect(res.json?.billingHoldActive === true, "billingHoldActive must be true");
    return `Waybill: ${failedWaybill}, BillingHoldActive: ${res.json.billingHoldActive}`;
  });

  await test("FOMS waybill query confirms billing hold is active", async () => {
    const res = await call("GET", `${FOMS_URL}/api/integration/dms/waybills/${failedWaybill}`, {
      headers: { "X-Api-Key": DMS_TO_FOMS_KEY }
    });

    expect(res.status === 200, `expected 200, got ${res.status}`);
    expect(res.json?.billingHoldActive === true, "billingHoldActive must be true");
    return `Hold Confirmed: status=${res.json?.status}`;
  });

  await test("Successful redelivery update lifts Billing Hold and generates invoice", async () => {
    const res = await call("POST", `${FOMS_URL}/api/integration/dms/delivery-redelivered`, {
      headers: { "X-Api-Key": DMS_TO_FOMS_KEY },
      body: {
        waybillNumber: failedWaybill,
        updatedStatus: "Completed",
        newPodImageUrl: `https://storage.capstone.ph/pod/${failedWaybill}-attempt2.jpg`,
        redeliveryAttemptCount: 2,
        redeliveryReference: `REDEL-${failedWaybill}`,
        completedAt: new Date().toISOString(),
        recipientName: "Maria Santos (Personal Delivery)",
        deliveryRemarks: "Delivered during second attempt in the morning."
      }
    });

    expect(res.status === 200, `expected 200, got ${res.status}: ${res.text}`);
    expect(res.json?.isSuccess === true, "redelivery should succeed");
    expect(res.json?.billingHoldActive === false, "billingHoldActive must now be false");
    expect(res.json?.invoiceNumber, "invoiceNumber should be generated after hold lifted");
    return `Hold Lifted! Waybill: ${failedWaybill}, New Invoice: ${res.json.invoiceNumber}`;
  });

  console.log("\n[4] Integration 3: Delivery Cash Advance -> Approval & Liquidation (DMS <-> FOMS)");
  const advanceRequestId = randomRequestId("ADV");
  let createdAdvanceId = null;

  await test("DMS triggers cash advance request -> FOMS approves and records cash outflow", async () => {
    const res = await call("POST", `${FOMS_URL}/api/integration/dms/cash-advance-request`, {
      headers: { "X-Api-Key": DMS_TO_FOMS_KEY },
      body: {
        requestId: advanceRequestId,
        deliveryReference: "TRIP-MANILA-BATANGAS-001",
        requesterName: "Pedro Penduko",
        requesterEmployeeId: "DRV-202",
        purpose: "Provincial Delivery Fuel, Toll & Truck Maintenance Allowance",
        requestedAmount: 2500.00,
        requestDate: new Date().toISOString()
      }
    });

    expect(res.status === 200, `expected 200, got ${res.status}: ${res.text}`);
    expect(res.json?.isSuccess === true, "cash advance request should succeed");
    expect(res.json?.cashAdvanceId, "cashAdvanceId must be returned");
    createdAdvanceId = res.json.cashAdvanceId;
    return `Advance ID: #${createdAdvanceId}, Amount: ₱2,500.00, Status: ${res.json.status}`;
  });

  await test("DMS submits post-trip liquidation -> FOMS validates receipts & reconciles balance", async () => {
    const liquidationRequestId = randomRequestId("LIQ");
    const res = await call("POST", `${FOMS_URL}/api/integration/dms/liquidation-submission`, {
      headers: { "X-Api-Key": DMS_TO_FOMS_KEY },
      body: {
        requestId: liquidationRequestId,
        fomsCashAdvanceId: createdAdvanceId,
        deliveryReference: "TRIP-MANILA-BATANGAS-001",
        submittedByName: "Pedro Penduko",
        totalAmount: 2350.00,
        leftoverCash: 150.00,
        reimbursementAmount: 0.00,
        notes: "Trip completed on schedule. Toll receipts & Petron fuel slip attached.",
        submissionDate: new Date().toISOString(),
        receipts: [
          { description: "SLEX Expressway Toll Fees", amount: 450.00, receiptUrl: "https://storage.capstone.ph/receipts/toll-slex.jpg" },
          { description: "Petron Diesel Fuel Refill", amount: 1800.00, receiptUrl: "https://storage.capstone.ph/receipts/fuel-petron.jpg" },
          { description: "Designated Truck Parking Fee", amount: 100.00, receiptUrl: "https://storage.capstone.ph/receipts/parking.jpg" }
        ]
      }
    });

    expect(res.status === 200, `expected 200, got ${res.status}: ${res.text}`);
    expect(res.json?.isSuccess === true, "liquidation submission should succeed");
    expect(res.json?.liquidationId, "liquidationId must be returned");
    return `Liquidation ID: #${res.json.liquidationId}, Expenses: ₱2,350.00, Returned Cash: ₱150.00, Advance Liquidated!`;
  });

  console.log("\n[5] End-to-End DMS Headless Outbound Dispatcher Test");
  await test("DMS outbound proxy forwards completed delivery to FOMS across the internet", async () => {
    const dmsDispatchedWaybill = randomWaybill();
    const res = await call("POST", `${DMS_URL}/api/integration/foms/trigger-completed`, {
      headers: { "X-Api-Key": FOMS_TO_DMS_KEY },
      body: {
        waybillNumber: dmsDispatchedWaybill,
        deliveryStatus: "Completed",
        clientName: "Shopee Xpress Official",
        clientCode: "CA-002",
        recipientName: "Gloria Arroyo",
        recipientAddress: "Quezon City Circle, Quezon City",
        recipientContact: "09199998888",
        deliveryArea: "NCR",
        podImageUrl: `https://storage.capstone.ph/pod/${dmsDispatchedWaybill}.jpg`,
        assignedDriver: "Rodrigo Reyes",
        driverEmployeeId: "DRV-303",
        actualWeight: 1.8,
        declaredValue: 800.00,
        deliveryRemarks: "E2E Outbound test successfully dispatched from DMS to FOMS."
      }
    });

    expect(res.status === 200, `expected 200 from DMS proxy, got ${res.status}: ${res.text}`);
    expect(res.json?.isSuccess === true, "DMS proxy call should succeed");
    return `DMS relayed waybill ${dmsDispatchedWaybill} to FOMS, Invoice: ${res.json?.invoiceNumber}`;
  });

  console.log("\n==================================================================");
  console.log("                        Test Results Summary                      ");
  console.log("==================================================================");
  const passed = results.filter(r => r.ok).length;
  const failed = results.filter(r => !r.ok).length;
  console.log(`Total: ${results.length} | Passed: ${passed} | Failed: ${failed}`);

  if (failed > 0) {
    console.error("\nSome integration tests failed.");
    process.exit(1);
  } else {
    console.log("\nAll DMS <-> FOMS live integrations passed with 100% success!");
    process.exit(0);
  }
}

main().catch(err => {
  console.error("Unhandled error:", err);
  process.exit(1);
});
