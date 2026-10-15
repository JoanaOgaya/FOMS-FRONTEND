-- Link existing waybills to existing invoices
UPDATE Waybills SET invoice_no = 'INV-2026-007', is_billed = 1, pod_status = 'Billed' WHERE waybill_number IN ('WB-NCR-88491', 'WB-NCR-88492');
UPDATE Invoices SET WaybillIds = 'WB-NCR-88491,WB-NCR-88492' WHERE InvoiceNo = 'INV-2026-007';

UPDATE Waybills SET invoice_no = 'INV-2026-009', is_billed = 1, pod_status = 'Billed' WHERE waybill_number = 'WB-NCR-88493';
UPDATE Invoices SET WaybillIds = 'WB-NCR-88493' WHERE InvoiceNo = 'INV-2026-009';

-- Insert additional waybills if not exist
IF NOT EXISTS (SELECT 1 FROM Waybills WHERE waybill_number = 'WB-NCR-88496')
    INSERT INTO Waybills (waybill_number, client_id, origin, destination, delivery_area, actual_weight, declared_value, delivery_status, pod_status, is_billed, invoice_no, created_at, updated_at)
    VALUES ('WB-NCR-88496', 1, 'Manila Hub', 'Pasig City', 'NCR', 5.0, 1500.00, 'Delivered', 'Billed', 1, 'INV-2026-010', DATEADD(day, -4, SYSUTCDATETIME()), SYSUTCDATETIME());
UPDATE Waybills SET invoice_no = 'INV-2026-010', is_billed = 1, pod_status = 'Billed' WHERE waybill_number = 'WB-NCR-88496';
UPDATE Invoices SET WaybillIds = 'WB-NCR-88496' WHERE InvoiceNo = 'INV-2026-010';

IF NOT EXISTS (SELECT 1 FROM Waybills WHERE waybill_number = 'WB-NCR-88497')
    INSERT INTO Waybills (waybill_number, client_id, origin, destination, delivery_area, actual_weight, declared_value, delivery_status, pod_status, is_billed, invoice_no, created_at, updated_at)
    VALUES ('WB-NCR-88497', 1, 'Manila Hub', 'Taguig City', 'NCR', 5.5, 2000.00, 'Delivered', 'Billed', 1, 'INV-2026-004', DATEADD(day, -6, SYSUTCDATETIME()), SYSUTCDATETIME());
UPDATE Waybills SET invoice_no = 'INV-2026-004', is_billed = 1, pod_status = 'Billed' WHERE waybill_number = 'WB-NCR-88497';
UPDATE Invoices SET WaybillIds = 'WB-NCR-88497' WHERE InvoiceNo = 'INV-2026-004';

IF NOT EXISTS (SELECT 1 FROM Waybills WHERE waybill_number = 'WB-NCR-88498')
    INSERT INTO Waybills (waybill_number, client_id, origin, destination, delivery_area, actual_weight, declared_value, delivery_status, pod_status, is_billed, invoice_no, created_at, updated_at)
    VALUES ('WB-NCR-88498', 1, 'Manila Hub', 'Makati City', 'NCR', 10.0, 3500.00, 'Delivered', 'Billed', 1, 'INV-2026-008', DATEADD(day, -5, SYSUTCDATETIME()), SYSUTCDATETIME());
IF NOT EXISTS (SELECT 1 FROM Waybills WHERE waybill_number = 'WB-NCR-88499')
    INSERT INTO Waybills (waybill_number, client_id, origin, destination, delivery_area, actual_weight, declared_value, delivery_status, pod_status, is_billed, invoice_no, created_at, updated_at)
    VALUES ('WB-NCR-88499', 1, 'Manila Hub', 'Caloocan City', 'NCR', 9.5, 3000.00, 'Delivered', 'Billed', 1, 'INV-2026-008', DATEADD(day, -5, SYSUTCDATETIME()), SYSUTCDATETIME());
UPDATE Waybills SET invoice_no = 'INV-2026-008', is_billed = 1, pod_status = 'Billed' WHERE waybill_number IN ('WB-NCR-88498', 'WB-NCR-88499');
UPDATE Invoices SET WaybillIds = 'WB-NCR-88498,WB-NCR-88499' WHERE InvoiceNo = 'INV-2026-008';

IF NOT EXISTS (SELECT 1 FROM Waybills WHERE waybill_number = 'WB-LZD-00101')
    INSERT INTO Waybills (waybill_number, client_id, origin, destination, delivery_area, actual_weight, declared_value, delivery_status, pod_status, is_billed, invoice_no, created_at, updated_at)
    VALUES ('WB-LZD-00101', 1, 'Manila Hub', 'Cebu Central', 'Visayas', 45.0, 25000.00, 'Delivered', 'Billed', 1, 'LZD-2026-0001', DATEADD(day, -12, SYSUTCDATETIME()), SYSUTCDATETIME());
IF NOT EXISTS (SELECT 1 FROM Waybills WHERE waybill_number = 'WB-LZD-00102')
    INSERT INTO Waybills (waybill_number, client_id, origin, destination, delivery_area, actual_weight, declared_value, delivery_status, pod_status, is_billed, invoice_no, created_at, updated_at)
    VALUES ('WB-LZD-00102', 1, 'Manila Hub', 'Davao Central', 'Mindanao', 38.0, 25000.00, 'Delivered', 'Billed', 1, 'LZD-2026-0001', DATEADD(day, -12, SYSUTCDATETIME()), SYSUTCDATETIME());
UPDATE Waybills SET invoice_no = 'LZD-2026-0001', is_billed = 1, pod_status = 'Billed' WHERE waybill_number IN ('WB-LZD-00101', 'WB-LZD-00102');
UPDATE Invoices SET WaybillIds = 'WB-LZD-00101,WB-LZD-00102' WHERE InvoiceNo = 'LZD-2026-0001';

IF NOT EXISTS (SELECT 1 FROM Waybills WHERE waybill_number = 'WB-LZD-00103')
    INSERT INTO Waybills (waybill_number, client_id, origin, destination, delivery_area, actual_weight, declared_value, delivery_status, pod_status, is_billed, invoice_no, created_at, updated_at)
    VALUES ('WB-LZD-00103', 1, 'Manila Hub', 'Iloilo City', 'Visayas', 28.0, 15000.00, 'Delivered', 'Billed', 1, 'BI-2026-0001', DATEADD(day, -8, SYSUTCDATETIME()), SYSUTCDATETIME());
IF NOT EXISTS (SELECT 1 FROM Waybills WHERE waybill_number = 'WB-LZD-00104')
    INSERT INTO Waybills (waybill_number, client_id, origin, destination, delivery_area, actual_weight, declared_value, delivery_status, pod_status, is_billed, invoice_no, created_at, updated_at)
    VALUES ('WB-LZD-00104', 1, 'Manila Hub', 'Cagayan de Oro', 'Mindanao', 22.5, 15000.00, 'Delivered', 'Billed', 1, 'BI-2026-0001', DATEADD(day, -8, SYSUTCDATETIME()), SYSUTCDATETIME());
UPDATE Waybills SET invoice_no = 'BI-2026-0001', is_billed = 1, pod_status = 'Billed' WHERE waybill_number IN ('WB-LZD-00103', 'WB-LZD-00104');
UPDATE Invoices SET WaybillIds = 'WB-LZD-00103,WB-LZD-00104' WHERE InvoiceNo = 'BI-2026-0001';

UPDATE Waybills SET invoice_no = 'SHP-2026-0001', is_billed = 1, pod_status = 'Billed' WHERE waybill_number IN ('WB-NCR-88494', 'WB-NCR-88495');
UPDATE Invoices SET WaybillIds = 'WB-NCR-88494,WB-NCR-88495' WHERE InvoiceNo = 'SHP-2026-0001';

-- Seed fresh unbilled validated waybills so user can create invoices smoothly
IF NOT EXISTS (SELECT 1 FROM Waybills WHERE waybill_number = 'WB-VAL-90001')
    INSERT INTO Waybills (waybill_number, client_id, origin, destination, delivery_area, actual_weight, declared_value, delivery_status, pod_status, is_billed, invoice_no, created_at, updated_at)
    VALUES 
    ('WB-VAL-90001', 1, 'Manila Hub', 'Quezon City', 'NCR', 8.5, 2500.00, 'Delivered', 'Validated', 0, NULL, DATEADD(day, -1, SYSUTCDATETIME()), SYSUTCDATETIME()),
    ('WB-VAL-90002', 1, 'Manila Hub', 'Mandaluyong City', 'NCR', 11.0, 3200.00, 'Delivered', 'Validated', 0, NULL, DATEADD(day, -1, SYSUTCDATETIME()), SYSUTCDATETIME()),
    ('WB-VAL-90003', 1, 'Cebu Hub', 'Lapu-Lapu City', 'Visayas', 14.5, 4500.00, 'Delivered', 'Validated', 0, NULL, DATEADD(day, -2, SYSUTCDATETIME()), SYSUTCDATETIME()),
    ('WB-VAL-90004', 2, 'Manila Hub', 'Pasig City', 'NCR', 7.2, 1800.00, 'Delivered', 'Validated', 0, NULL, DATEADD(day, -1, SYSUTCDATETIME()), SYSUTCDATETIME()),
    ('WB-VAL-90005', 2, 'Clark Hub', 'Angeles City', 'Luzon', 18.0, 6000.00, 'Delivered', 'Validated', 0, NULL, DATEADD(day, -2, SYSUTCDATETIME()), SYSUTCDATETIME()),
    ('WB-VAL-90006', 3, 'Manila Hub', 'Taguig BGC', 'NCR', 5.0, 2000.00, 'Delivered', 'Validated', 0, NULL, DATEADD(day, -1, SYSUTCDATETIME()), SYSUTCDATETIME()),
    ('WB-VAL-90007', 4, 'Manila Hub', 'Makati CBD', 'NCR', 4.5, 3500.00, 'Delivered', 'Validated', 0, NULL, DATEADD(day, -1, SYSUTCDATETIME()), SYSUTCDATETIME());
