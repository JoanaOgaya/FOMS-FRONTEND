// ============================================================================
// MongoDB Initialization for FOMS Trends & Unstructured Analytics Database
// Database: foms_trends_db
// Role: Time-series snapshots, AI scan logs, raw OCR logs, activity telemetry
// ============================================================================

db = db.getSiblingDB('foms_trends_db');

// 1. finance_trends (Time-series collection for weekly/daily financial metric snapshots)
try {
  db.createCollection("finance_trends", {
    timeseries: {
      timeField: "recordedAt",
      metaField: "metadata",
      granularity: "hours"
    }
  });
} catch (e) {
  print("finance_trends collection already exists or timeseries created.");
}

db.finance_trends.createIndex({ "metadata.trendType": 1, "recordedAt": -1 });
db.finance_trends.createIndex({ "metadata.clientId": 1, "recordedAt": -1 });

// Sample document for finance_trends
db.finance_trends.insertOne({
  recordedAt: new Date(),
  metadata: {
    trendType: "WEEKLY_CASH_FLOW",
    clientId: "CA-001",
    department: "Logistics"
  },
  metrics: {
    totalBilled: 142500.00,
    totalCollected: 98000.00,
    outstandingAR: 44500.00,
    collectionEfficiencyRate: 68.77,
    averageDSO: 28.5
  }
});

// 2. ai_scan_logs (Unstructured OCR logs, bounding boxes, file metadata)
db.createCollection("ai_scan_logs");
db.ai_scan_logs.createIndex({ "scanId": 1 }, { unique: true });
db.ai_scan_logs.createIndex({ "documentType": 1, "scannedAt": -1 });
db.ai_scan_logs.createIndex({ "status": 1 });

// Sample document for ai_scan_logs
db.ai_scan_logs.insertOne({
  scanId: "SCAN-2026-0001",
  fileName: "OfficialReceipt_OR-2026-001.png",
  fileMime: "image/png",
  fileSizeBytes: 245120,
  uploadedBy: "EMP-001",
  scannedAt: new Date(),
  documentType: "OFFICIAL_RECEIPT",
  isAllowed: true,
  confidenceScore: 0.98,
  status: "PROCESSED",
  extractedFields: {
    officialReceiptNumber: "OR-2026-001",
    amount: 15000.00,
    dateIssued: "2026-08-25",
    companyName: "SpeedEx Logistics Inc.",
    clientName: "Shopee Express",
    paymentReference: "SP-PAY-98124"
  },
  ocrRawTokens: [
    { text: "OFFICIAL RECEIPT", confidence: 0.99, bbox: [50, 20, 200, 45] },
    { text: "OR No. 2026-001", confidence: 0.97, bbox: [210, 20, 350, 45] },
    { text: "PHP 15,000.00", confidence: 0.99, bbox: [250, 180, 380, 210] }
  ]
});

// 3. activity_logs (Telemetry, system access logs, high-throughput event trail)
db.createCollection("activity_logs");
db.activity_logs.createIndex({ "userId": 1, "timestamp": -1 });
db.activity_logs.createIndex({ "action": 1 });
db.activity_logs.createIndex({ "timestamp": -1 });

// Sample document for activity_logs
db.activity_logs.insertOne({
  logId: "ACT-2026-0001",
  userId: "EMP-001",
  userRole: "Financial Manager",
  action: "LOGIN_SUCCESS",
  module: "Auth",
  ipAddress: "127.0.0.1",
  userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
  timestamp: new Date(),
  payloadSummary: {
    method: "JWT_BEARER",
    sessionDuration: 1800
  }
});

print("MongoDB foms_trends_db initialized successfully with collections: finance_trends, ai_scan_logs, activity_logs.");
