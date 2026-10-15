# =====================================================================
# FOMS End-to-End Database & Role Integration Verification
# =====================================================================

$ErrorActionPreference = "Continue"

Write-Host ""
Write-Host "======================================================================" -ForegroundColor Cyan
Write-Host "   FOMS End-to-End Database Integration & Verification" -ForegroundColor Cyan
Write-Host "======================================================================" -ForegroundColor Cyan
Write-Host ""

$PassedCount = 0
$FailedCount = 0

function Check-Result($category, $testName, $passed, $info = "") {
    if ($passed) {
        Write-Host " [PASS] [$category] $testName" -ForegroundColor Green
        if ($info) { Write-Host "        $info" -ForegroundColor DarkGray }
        $script:PassedCount++
    } else {
        Write-Host " [FAIL] [$category] $testName" -ForegroundColor Red
        if ($info) { Write-Host "        $info" -ForegroundColor Yellow }
        $script:FailedCount++
    }
}

# ---------------------------------------------------------------------
# 1. Direct Database Layer
# ---------------------------------------------------------------------
Write-Host "--- 1. Direct Database Connection Layer ---" -ForegroundColor Yellow

# MSSQL (FOMS_DB)
try {
    $conn = New-Object System.Data.SqlClient.SqlConnection("Server=localhost\SQLEXPRESS;Database=FOMS_DB;Integrated Security=True;TrustServerCertificate=True;")
    $conn.Open()
    $cmd = $conn.CreateCommand()
    $cmd.CommandText = "SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_TYPE='BASE TABLE'"
    $tableCount = $cmd.ExecuteScalar()
    $cmd.CommandText = "SELECT COUNT(*) FROM Users"
    $userCount = $cmd.ExecuteScalar()
    $cmd.CommandText = "SELECT COUNT(*) FROM Clients"
    $clientCount = $cmd.ExecuteScalar()
    $cmd.CommandText = "SELECT COUNT(*) FROM Invoices"
    $invoiceCount = $cmd.ExecuteScalar()
    $cmd.CommandText = "SELECT COUNT(*) FROM Payments"
    $paymentCount = $cmd.ExecuteScalar()
    $conn.Close()

    Check-Result "MSSQL" "FOMS_DB Connection & Core Tables" $true "Tables: $tableCount | Users: $userCount | Clients: $clientCount | Invoices: $invoiceCount | Payments: $paymentCount"
} catch {
    Check-Result "MSSQL" "FOMS_DB Connection & Core Tables" $false $_.Exception.Message
}

# PostgreSQL (foms_ai_results)
try {
    $pgRaw = docker exec -i foms-postgres psql -U postgres -d foms_ai_results -t -c "SELECT count(*) FROM information_schema.tables WHERE table_schema='public';" 2>$null
    $pgCount = ($pgRaw | Out-String).Trim()
    if ($pgCount -match "^\d+$" -and [int]$pgCount -gt 0) {
        $auditRaw = docker exec -i foms-postgres psql -U postgres -d foms_ai_results -t -c "SELECT count(*) FROM audit_logs;" 2>$null
        $auditCount = ($auditRaw | Out-String).Trim()
        Check-Result "Postgres" "foms_ai_results Connection & Tables" $true "Public Tables: $pgCount | Audit Logs: $auditCount"
    } else {
        Check-Result "Postgres" "foms_ai_results Connection & Tables" $false "Returned: $pgCount"
    }
} catch {
    Check-Result "Postgres" "foms_ai_results Connection & Tables" $false $_.Exception.Message
}

# MongoDB (foms_trends_db)
try {
    $mongoPass = "mongo_password_2026"
    $mRaw = docker exec -i foms-mongodb mongosh -u root -p $mongoPass --authenticationDatabase admin --eval "db.getSiblingDB('foms_trends_db').getCollectionNames().length" 2>$null
    $collCount = ($mRaw | Select-String -Pattern "^\d+$" | Select-Object -Last 1).Line.Trim()
    if ($collCount -match "^\d+$" -and [int]$collCount -gt 0) {
        Check-Result "MongoDB" "foms_trends_db Connection & Collections" $true "Active Collections: $collCount"
    } else {
        Check-Result "MongoDB" "foms_trends_db Connection & Collections" $false "Returned: $mRaw"
    }
} catch {
    Check-Result "MongoDB" "foms_trends_db Connection & Collections" $false $_.Exception.Message
}

Write-Host ""
# ---------------------------------------------------------------------
# 2. Services Health & Database Controller Layer
# ---------------------------------------------------------------------
Write-Host "--- 2. Backend Services & Health Controllers Layer ---" -ForegroundColor Yellow

# FOMS.Api (.NET 9 on 5007)
try {
    $swagger = Invoke-RestMethod -Uri "http://localhost:5007/swagger/v1/swagger.json" -Method Get -TimeoutSec 5 -ErrorAction Stop
    Check-Result "API" "FOMS.Api Swagger (Port 5007)" $true "Title: $($swagger.info.title) v$($swagger.info.version)"
} catch {
    Check-Result "API" "FOMS.Api Swagger (Port 5007)" $false $_.Exception.Message
}

# Database Health Check
try {
    $dbHealth = Invoke-RestMethod -Uri "http://localhost:5007/api/health/database" -Method Get -TimeoutSec 5 -ErrorAction Stop
    Check-Result "HealthController" "GET /api/health/database" $dbHealth.success "Status: $($dbHealth.status) | Database: $($dbHealth.database) | Provider: $($dbHealth.provider)"
} catch {
    Check-Result "HealthController" "GET /api/health/database" $false $_.Exception.Message
}

# Role Access Health Checks
$healthRoles = @(
    @{ Name = "Financial Manager"; Endpoint = "financial-manager" },
    @{ Name = "Head Accountant"; Endpoint = "head-accountant" },
    @{ Name = "Accountant"; Endpoint = "accountant" },
    @{ Name = "Assistant Finance Manager"; Endpoint = "assistant-finance-manager" }
)

foreach ($hr in $healthRoles) {
    try {
        $res = Invoke-RestMethod -Uri "http://localhost:5007/api/health/$($hr.Endpoint)" -Method Get -TimeoutSec 5 -ErrorAction Stop
        Check-Result "HealthController" "GET /api/health/$($hr.Endpoint)" $res.success "Employee: $($res.employeeNumber) | Role: $($res.role) | Active: $($res.isActive)"
    } catch {
        Check-Result "HealthController" "GET /api/health/$($hr.Endpoint)" $false $_.Exception.Message
    }
}

# AI Service (FastAPI on 8000)
try {
    $aiHealth = Invoke-RestMethod -Uri "http://127.0.0.1:8000/health/ready" -Method Get -TimeoutSec 5 -ErrorAction Stop
    $aiOk = ($aiHealth.status -eq "READY" -and $aiHealth.postgres -eq "CONNECTED" -and $aiHealth.mongodb -eq "CONNECTED")
    Check-Result "AI Service" "FastAPI Health & Database Links (Port 8000)" $aiOk "Status: $($aiHealth.status) | Postgres: $($aiHealth.postgres) | MongoDB: $($aiHealth.mongodb)"
} catch {
    Check-Result "AI Service" "FastAPI Health & Database Links (Port 8000)" $false $_.Exception.Message
}

Write-Host ""
# ---------------------------------------------------------------------
# 3. Role-Based End-to-End Workflows & Data Retrieval
# ---------------------------------------------------------------------
Write-Host "--- 3. End-to-End Role Workflows (Live SQL Server Queries) ---" -ForegroundColor Yellow

$users = @(
    @{ Username = "EMP-001"; Role = "Financial Manager" },
    @{ Username = "EMP-002"; Role = "Head Accountant" },
    @{ Username = "EMP-003"; Role = "Accountant" },
    @{ Username = "EMP-004"; Role = "Assistant Finance Manager" }
)

$tokens = @{}

foreach ($u in $users) {
    try {
        $body = @{ username = $u.Username; password = "Password@123" } | ConvertTo-Json
        $resp = Invoke-RestMethod -Uri "http://localhost:5007/api/auth/login" -Method Post -Body $body -ContentType "application/json" -TimeoutSec 5 -ErrorAction Stop
        if ($resp.success -and $resp.data.accessToken) {
            $tokens[$u.Username] = $resp.data.accessToken
            $name = if ($resp.data.fullName) { $resp.data.fullName } else { $resp.data.username }
            $r = if ($resp.data.role) { $resp.data.role } else { $u.Role }
            Check-Result "Auth" "Login $($u.Username) ($($u.Role))" $true "Name: $name | Role: $r"
        } else {
            Check-Result "Auth" "Login $($u.Username) ($($u.Role))" $false "Failed login response"
        }
    } catch {
        Check-Result "Auth" "Login $($u.Username) ($($u.Role))" $false $_.Exception.Message
    }
}

# Test EMP-001 (Financial Manager) Live Data
if ($tokens.ContainsKey("EMP-001")) {
    $tok = $tokens["EMP-001"]
    $headers = @{ Authorization = "Bearer $tok" }
    try {
        $clients = Invoke-RestMethod -Uri "http://localhost:5007/api/clients" -Method Get -Headers $headers -TimeoutSec 5 -ErrorAction Stop
        Check-Result "EMP-001" "GET /api/clients (Live DB)" $true "Retrieved $($clients.Count) clients from FOMS_DB"
    } catch {
        Check-Result "EMP-001" "GET /api/clients (Live DB)" $false $_.Exception.Message
    }
}

# Test EMP-002 (Head Accountant) Live Data
if ($tokens.ContainsKey("EMP-002")) {
    $tok = $tokens["EMP-002"]
    $headers = @{ Authorization = "Bearer $tok" }
    try {
        $dash = Invoke-RestMethod -Uri "http://localhost:5007/api/head-accountant/dashboard" -Method Get -Headers $headers -TimeoutSec 5 -ErrorAction Stop
        Check-Result "EMP-002" "GET /api/head-accountant/dashboard" $true "Invoices: $($dash.totalInvoices) | AR Balance: $($dash.totalReceivable) | BV Pending: $($dash.pendingBillingValidations)"
    } catch {
        Check-Result "EMP-002" "GET /api/head-accountant/dashboard" $false $_.Exception.Message
    }

    try {
        $invoices = Invoke-RestMethod -Uri "http://localhost:5007/api/head-accountant/invoices" -Method Get -Headers $headers -TimeoutSec 5 -ErrorAction Stop
        Check-Result "EMP-002" "GET /api/head-accountant/invoices" $true "Retrieved $($invoices.Count) invoices"
    } catch {
        Check-Result "EMP-002" "GET /api/head-accountant/invoices" $false $_.Exception.Message
    }

    try {
        $ar = Invoke-RestMethod -Uri "http://localhost:5007/api/head-accountant/accounts-receivable" -Method Get -Headers $headers -TimeoutSec 5 -ErrorAction Stop
        Check-Result "EMP-002" "GET /api/head-accountant/accounts-receivable" $true "Retrieved $($ar.Count) receivable accounts"
    } catch {
        Check-Result "EMP-002" "GET /api/head-accountant/accounts-receivable" $false $_.Exception.Message
    }

    try {
        $bv = Invoke-RestMethod -Uri "http://localhost:5007/api/head-accountant/billing-validation" -Method Get -Headers $headers -TimeoutSec 5 -ErrorAction Stop
        Check-Result "EMP-002" "GET /api/head-accountant/billing-validation" $true "Retrieved $($bv.Count) billing validation records"
    } catch {
        Check-Result "EMP-002" "GET /api/head-accountant/billing-validation" $false $_.Exception.Message
    }

    try {
        $settle = Invoke-RestMethod -Uri "http://localhost:5007/api/head-accountant/settlements" -Method Get -Headers $headers -TimeoutSec 5 -ErrorAction Stop
        Check-Result "EMP-002" "GET /api/head-accountant/settlements" $true "Retrieved $($settle.Count) settlements"
    } catch {
        Check-Result "EMP-002" "GET /api/head-accountant/settlements" $false $_.Exception.Message
    }
}

# Test EMP-003 (Accountant) Live Data
if ($tokens.ContainsKey("EMP-003")) {
    $tok = $tokens["EMP-003"]
    $headers = @{ Authorization = "Bearer $tok" }
    try {
        $dash = Invoke-RestMethod -Uri "http://localhost:5007/api/accountant/dashboard" -Method Get -Headers $headers -TimeoutSec 5 -ErrorAction Stop
        Check-Result "EMP-003" "GET /api/accountant/dashboard" $true "Invoices: $($dash.totalInvoices) | Pending Invoices: $($dash.pendingInvoices) | BV Pending: $($dash.pendingBillingValidations)"
    } catch {
        Check-Result "EMP-003" "GET /api/accountant/dashboard" $false $_.Exception.Message
    }

    try {
        $invoices = Invoke-RestMethod -Uri "http://localhost:5007/api/accountant/invoices" -Method Get -Headers $headers -TimeoutSec 5 -ErrorAction Stop
        Check-Result "EMP-003" "GET /api/accountant/invoices" $true "Retrieved $($invoices.Count) invoices"
    } catch {
        Check-Result "EMP-003" "GET /api/accountant/invoices" $false $_.Exception.Message
    }

    try {
        $payments = Invoke-RestMethod -Uri "http://localhost:5007/api/accountant/payments" -Method Get -Headers $headers -TimeoutSec 5 -ErrorAction Stop
        Check-Result "EMP-003" "GET /api/accountant/payments" $true "Retrieved $($payments.Count) payment records"
    } catch {
        Check-Result "EMP-003" "GET /api/accountant/payments" $false $_.Exception.Message
    }

    try {
        $ors = Invoke-RestMethod -Uri "http://localhost:5007/api/accountant/official-receipts" -Method Get -Headers $headers -TimeoutSec 5 -ErrorAction Stop
        Check-Result "EMP-003" "GET /api/accountant/official-receipts" $true "Official receipts endpoint operational"
    } catch {
        Check-Result "EMP-003" "GET /api/accountant/official-receipts" $false $_.Exception.Message
    }
}

# Test EMP-004 (Assistant Finance Manager) Live Data
if ($tokens.ContainsKey("EMP-004")) {
    $tok = $tokens["EMP-004"]
    $headers = @{ Authorization = "Bearer $tok" }
    try {
        $dash = Invoke-RestMethod -Uri "http://localhost:5007/api/assistant-finance-manager/dashboard" -Method Get -Headers $headers -TimeoutSec 5 -ErrorAction Stop
        Check-Result "EMP-004" "GET /api/assistant-finance-manager/dashboard" $true "Pending Liquidations: $($dash.pendingLiquidations) | Flagged Docs: $($dash.flaggedDocuments)"
    } catch {
        Check-Result "EMP-004" "GET /api/assistant-finance-manager/dashboard" $false $_.Exception.Message
    }

    try {
        $liq = Invoke-RestMethod -Uri "http://localhost:5007/api/assistant-finance-manager/liquidations" -Method Get -Headers $headers -TimeoutSec 5 -ErrorAction Stop
        Check-Result "EMP-004" "GET /api/assistant-finance-manager/liquidations" $true "Retrieved $($liq.Count) liquidations"
    } catch {
        Check-Result "EMP-004" "GET /api/assistant-finance-manager/liquidations" $false $_.Exception.Message
    }

    try {
        $dups = Invoke-RestMethod -Uri "http://localhost:5007/api/assistant-finance-manager/ai/unique-documents" -Method Get -Headers $headers -TimeoutSec 5 -ErrorAction Stop
        Check-Result "EMP-004" "GET /api/assistant-finance-manager/ai/unique-documents" $true "Retrieved $($dups.Count) verified unique documents"
    } catch {
        Check-Result "EMP-004" "GET /api/assistant-finance-manager/ai/unique-documents" $false $_.Exception.Message
    }

    try {
        $rev = Invoke-RestMethod -Uri "http://localhost:5007/api/assistant-finance-manager/review-history" -Method Get -Headers $headers -TimeoutSec 5 -ErrorAction Stop
        Check-Result "EMP-004" "GET /api/assistant-finance-manager/review-history" $true "Retrieved $($rev.Count) review history items"
    } catch {
        Check-Result "EMP-004" "GET /api/assistant-finance-manager/review-history" $false $_.Exception.Message
    }
}

Write-Host ""
# ---------------------------------------------------------------------
# 4. SpeedPay Client Portal End-to-End
# ---------------------------------------------------------------------
Write-Host "--- 4. SpeedPay Client Portal End-to-End ---" -ForegroundColor Yellow

# Test SpeedPay Invoices
try {
    $spInvoices = Invoke-RestMethod -Uri "http://localhost:5007/api/speedpay/invoices" -Method Get -TimeoutSec 5 -ErrorAction Stop
    Check-Result "SpeedPay" "GET /api/speedpay/invoices" $true "Retrieved $($spInvoices.Count) portal invoices from live DB"
} catch {
    Check-Result "SpeedPay" "GET /api/speedpay/invoices" $false $_.Exception.Message
}

# Test SpeedPay Transactions
try {
    $spTx = Invoke-RestMethod -Uri "http://localhost:5007/api/speedpay/transactions" -Method Get -TimeoutSec 5 -ErrorAction Stop
    Check-Result "SpeedPay" "GET /api/speedpay/transactions" $true "Retrieved $($spTx.Count) payment transactions from live DB"
} catch {
    Check-Result "SpeedPay" "GET /api/speedpay/transactions" $false $_.Exception.Message
}

# Test SpeedPay Client Lookup
try {
    # Get active client codes from EMP-001 query
    $firstClientCode = if ($clients -and $clients.Count -gt 0) { $clients[0].clientCode } else { "CL-001" }
    $lookup = Invoke-RestMethod -Uri "http://localhost:5007/api/clients/lookup/$firstClientCode" -Method Get -TimeoutSec 5 -ErrorAction Stop
    $clientName = if ($lookup.name) { $lookup.name } else { $lookup.businessName }
    $invCount = if ($lookup.invoices) { $lookup.invoices.Count } else { 0 }
    Check-Result "SpeedPay" "GET /api/clients/lookup/$firstClientCode" $true "Client: $clientName ($firstClientCode) | Balance: $($lookup.currentBalance) | Invoices: $invCount"
} catch {
    Check-Result "SpeedPay" "GET /api/clients/lookup/$firstClientCode" $false $_.Exception.Message
}

Write-Host ""
Write-Host "======================================================================" -ForegroundColor Cyan
Write-Host "   SUMMARY: $PassedCount Passed, $FailedCount Failed" -ForegroundColor $(if ($FailedCount -eq 0) { "Green" } else { "Red" })
Write-Host "======================================================================" -ForegroundColor Cyan
Write-Host ""
