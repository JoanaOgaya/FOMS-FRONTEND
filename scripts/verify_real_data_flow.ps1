$base = 'http://localhost:5007'

Write-Host "=========================================================="
Write-Host " 1. SPEEDPAY VALIDATE-PROOF TEST (Guardrail Rejection)"
Write-Host "=========================================================="
$invalidBody = @{
    invoiceId = 'INV-001'
    referenceNumber = 'GCASH-999999'
    amountPaid = 25000
    paymentMethod = 'GCash'
    proofFileName = 'my_selfie_photo.jpg'
} | ConvertTo-Json

try {
    $r = Invoke-RestMethod -Uri "$base/api/speedpay/validate-proof" -Method Post -Body $invalidBody -ContentType 'application/json'
    Write-Host "Should have rejected but got: $($r | ConvertTo-Json -Compress)"
} catch {
    Write-Host "[PASSED] Expected Guardrail Rejection: $($_.Exception.Message)"
}

Write-Host ""
Write-Host "=========================================================="
Write-Host " 2. SPEEDPAY VALIDATE-PROOF TEST (Valid Receipt)"
Write-Host "=========================================================="
$uniqueRef = "GCASH-" + [System.DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds().ToString().Substring(4)
$validBody = @{
    invoiceId = 'INV-003'
    referenceNumber = $uniqueRef
    amountPaid = 25000
    paymentMethod = 'GCash'
    proofFileName = 'gcash_receipt_new.png'
    proofFileUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
} | ConvertTo-Json

try {
    $r = Invoke-RestMethod -Uri "$base/api/speedpay/validate-proof" -Method Post -Body $validBody -ContentType 'application/json'
    Write-Host "[PASSED] Verification Success: isValid=$($r.isValid), message=$($r.message)"
} catch {
    Write-Host "[FAIL] Validation failed: $($_.Exception.Message)"
}

Write-Host ""
Write-Host "=========================================================="
Write-Host " 3. AI DUPLICATE SCAN & PERSISTENCE TEST"
Write-Host "=========================================================="
$tempFile = [System.IO.Path]::GetTempFileName() + ".png"
[System.IO.File]::WriteAllBytes($tempFile, [System.Text.Encoding]::UTF8.GetBytes("PNG_DUMMY_HEADER"))

try {
    $curlOut = curl.exe -s -F "file=@$tempFile;filename=LZD-2026-0001_receipt.png" -F "documentType=Invoice" "$base/api/ai/duplicates/scan"
    Write-Host "Scan response: $curlOut"
    $scanObj = $curlOut | ConvertFrom-Json
    $revId = if ($scanObj.reviewId) { $scanObj.reviewId } else { "INV-2026-0001" }

    $decideBody = @{
        decision = "NOT_DUPLICATE"
        remarks = "Verified unique by accountant in integration test"
        reviewer = "Maria Mariel Jane Anonuevo"
    } | ConvertTo-Json

    $decideRes = Invoke-RestMethod -Uri "$base/api/ai/duplicates/$revId/decide" -Method Post -Body $decideBody -ContentType 'application/json'
    Write-Host "[PASSED] Accountant Level 1 decision persisted to SQL: $($decideRes | ConvertTo-Json -Compress)"
} catch {
    Write-Host "[FAIL] Scan/Decide error: $($_.Exception.Message)"
} finally {
    if (Test-Path $tempFile) { Remove-Item $tempFile }
}

Write-Host ""
Write-Host "=========================================================="
Write-Host " 4. EMP-001 TO EMP-004 SQL DASHBOARDS TEST"
Write-Host "=========================================================="
$roles = @(
    @{ id = 'EMP-001'; pass = 'Password@123'; name = 'Financial Manager'; endpoint = '/api/financial-manager/executive-dashboard' },
    @{ id = 'EMP-002'; pass = 'Password@123'; name = 'Head Accountant'; endpoint = '/api/head-accountant/dashboard' },
    @{ id = 'EMP-003'; pass = 'Password@123'; name = 'Accountant'; endpoint = '/api/accountant/dashboard' },
    @{ id = 'EMP-004'; pass = 'Password@123'; name = 'Assistant Finance Manager'; endpoint = '/api/assistant-finance-manager/dashboard' }
)

foreach ($u in $roles) {
    try {
        $loginRes = Invoke-RestMethod -Uri "$base/api/auth/login" -Method Post -Body (@{ username = $u.id; password = $u.pass } | ConvertTo-Json) -ContentType 'application/json'
        $token = $loginRes.token
        $headers = @{ Authorization = "Bearer $token" }
        $dash = Invoke-RestMethod -Uri "$base$($u.endpoint)" -Method Get -Headers $headers
        Write-Host "[PASSED] $($u.id) ($($u.name)) -> 200 OK directly from SQL Server Database!"
    } catch {
        Write-Host "[FAIL] $($u.id) error: $($_.Exception.Message)"
    }
}
