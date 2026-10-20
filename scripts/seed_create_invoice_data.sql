-- Seed comprehensive billing rates and unbilled validated waybills for Accountant Create Invoice testing
USE FOMS_DB;
GO

-- 1. SEED BILLING RATES FOR ALL CLIENTS ACROSS ALL REGIONS
-- Client 1: Lazada Philippines
IF NOT EXISTS (SELECT 1 FROM ClientRates WHERE client_id = 1 AND delivery_area = 'NCR')
    INSERT INTO ClientRates (client_id, service_type, delivery_area, minimum_kg, minimum_rate, excess_rate_per_kg, valuation_rate, fuel_surcharge_rate, effective_from, is_active, created_at, updated_at)
    VALUES (1, 'Standard Delivery', 'NCR', 5.0, 120.00, 20.00, 0.01, 0.05, DATEADD(month, -3, CAST(GETUTCDATE() AS date)), 1, SYSUTCDATETIME(), SYSUTCDATETIME());

IF NOT EXISTS (SELECT 1 FROM ClientRates WHERE client_id = 1 AND delivery_area = 'Luzon')
    INSERT INTO ClientRates (client_id, service_type, delivery_area, minimum_kg, minimum_rate, excess_rate_per_kg, valuation_rate, fuel_surcharge_rate, effective_from, is_active, created_at, updated_at)
    VALUES (1, 'Standard Delivery', 'Luzon', 5.0, 180.00, 30.00, 0.01, 0.08, DATEADD(month, -3, CAST(GETUTCDATE() AS date)), 1, SYSUTCDATETIME(), SYSUTCDATETIME());

IF NOT EXISTS (SELECT 1 FROM ClientRates WHERE client_id = 1 AND delivery_area = 'Visayas')
    INSERT INTO ClientRates (client_id, service_type, delivery_area, minimum_kg, minimum_rate, excess_rate_per_kg, valuation_rate, fuel_surcharge_rate, effective_from, is_active, created_at, updated_at)
    VALUES (1, 'Standard Delivery', 'Visayas', 5.0, 220.00, 40.00, 0.015, 0.10, DATEADD(month, -3, CAST(GETUTCDATE() AS date)), 1, SYSUTCDATETIME(), SYSUTCDATETIME());

IF NOT EXISTS (SELECT 1 FROM ClientRates WHERE client_id = 1 AND delivery_area = 'Mindanao')
    INSERT INTO ClientRates (client_id, service_type, delivery_area, minimum_kg, minimum_rate, excess_rate_per_kg, valuation_rate, fuel_surcharge_rate, effective_from, is_active, created_at, updated_at)
    VALUES (1, 'Standard Delivery', 'Mindanao', 5.0, 260.00, 50.00, 0.015, 0.12, DATEADD(month, -3, CAST(GETUTCDATE() AS date)), 1, SYSUTCDATETIME(), SYSUTCDATETIME());

-- Client 2: Shopee Philippines
IF NOT EXISTS (SELECT 1 FROM ClientRates WHERE client_id = 2 AND delivery_area = 'NCR')
    INSERT INTO ClientRates (client_id, service_type, delivery_area, minimum_kg, minimum_rate, excess_rate_per_kg, valuation_rate, fuel_surcharge_rate, effective_from, is_active, created_at, updated_at)
    VALUES (2, 'Standard Delivery', 'NCR', 5.0, 110.00, 18.00, 0.01, 0.05, DATEADD(month, -2, CAST(GETUTCDATE() AS date)), 1, SYSUTCDATETIME(), SYSUTCDATETIME());

IF NOT EXISTS (SELECT 1 FROM ClientRates WHERE client_id = 2 AND delivery_area = 'Luzon')
    INSERT INTO ClientRates (client_id, service_type, delivery_area, minimum_kg, minimum_rate, excess_rate_per_kg, valuation_rate, fuel_surcharge_rate, effective_from, is_active, created_at, updated_at)
    VALUES (2, 'Standard Delivery', 'Luzon', 5.0, 170.00, 28.00, 0.01, 0.08, DATEADD(month, -2, CAST(GETUTCDATE() AS date)), 1, SYSUTCDATETIME(), SYSUTCDATETIME());

IF NOT EXISTS (SELECT 1 FROM ClientRates WHERE client_id = 2 AND delivery_area = 'Visayas')
    INSERT INTO ClientRates (client_id, service_type, delivery_area, minimum_kg, minimum_rate, excess_rate_per_kg, valuation_rate, fuel_surcharge_rate, effective_from, is_active, created_at, updated_at)
    VALUES (2, 'Standard Delivery', 'Visayas', 5.0, 210.00, 38.00, 0.015, 0.10, DATEADD(month, -2, CAST(GETUTCDATE() AS date)), 1, SYSUTCDATETIME(), SYSUTCDATETIME());

IF NOT EXISTS (SELECT 1 FROM ClientRates WHERE client_id = 2 AND delivery_area = 'Mindanao')
    INSERT INTO ClientRates (client_id, service_type, delivery_area, minimum_kg, minimum_rate, excess_rate_per_kg, valuation_rate, fuel_surcharge_rate, effective_from, is_active, created_at, updated_at)
    VALUES (2, 'Standard Delivery', 'Mindanao', 5.0, 250.00, 48.00, 0.015, 0.12, DATEADD(month, -2, CAST(GETUTCDATE() AS date)), 1, SYSUTCDATETIME(), SYSUTCDATETIME());

-- Client 3: TikTok Shop Philippines
IF NOT EXISTS (SELECT 1 FROM ClientRates WHERE client_id = 3 AND delivery_area = 'NCR')
    INSERT INTO ClientRates (client_id, service_type, delivery_area, minimum_kg, minimum_rate, excess_rate_per_kg, valuation_rate, fuel_surcharge_rate, effective_from, is_active, created_at, updated_at)
    VALUES (3, 'Standard Delivery', 'NCR', 5.0, 105.00, 20.00, 0.01, 0.05, DATEADD(month, -2, CAST(GETUTCDATE() AS date)), 1, SYSUTCDATETIME(), SYSUTCDATETIME());

IF NOT EXISTS (SELECT 1 FROM ClientRates WHERE client_id = 3 AND delivery_area = 'Luzon')
    INSERT INTO ClientRates (client_id, service_type, delivery_area, minimum_kg, minimum_rate, excess_rate_per_kg, valuation_rate, fuel_surcharge_rate, effective_from, is_active, created_at, updated_at)
    VALUES (3, 'Standard Delivery', 'Luzon', 5.0, 165.00, 30.00, 0.01, 0.08, DATEADD(month, -2, CAST(GETUTCDATE() AS date)), 1, SYSUTCDATETIME(), SYSUTCDATETIME());

IF NOT EXISTS (SELECT 1 FROM ClientRates WHERE client_id = 3 AND delivery_area = 'Visayas')
    INSERT INTO ClientRates (client_id, service_type, delivery_area, minimum_kg, minimum_rate, excess_rate_per_kg, valuation_rate, fuel_surcharge_rate, effective_from, is_active, created_at, updated_at)
    VALUES (3, 'Standard Delivery', 'Visayas', 5.0, 205.00, 38.00, 0.015, 0.10, DATEADD(month, -2, CAST(GETUTCDATE() AS date)), 1, SYSUTCDATETIME(), SYSUTCDATETIME());

IF NOT EXISTS (SELECT 1 FROM ClientRates WHERE client_id = 3 AND delivery_area = 'Mindanao')
    INSERT INTO ClientRates (client_id, service_type, delivery_area, minimum_kg, minimum_rate, excess_rate_per_kg, valuation_rate, fuel_surcharge_rate, effective_from, is_active, created_at, updated_at)
    VALUES (3, 'Standard Delivery', 'Mindanao', 5.0, 245.00, 48.00, 0.015, 0.12, DATEADD(month, -2, CAST(GETUTCDATE() AS date)), 1, SYSUTCDATETIME(), SYSUTCDATETIME());

-- Client 4: Zalora Philippines
IF NOT EXISTS (SELECT 1 FROM ClientRates WHERE client_id = 4 AND delivery_area = 'NCR')
    INSERT INTO ClientRates (client_id, service_type, delivery_area, minimum_kg, minimum_rate, excess_rate_per_kg, valuation_rate, fuel_surcharge_rate, effective_from, is_active, created_at, updated_at)
    VALUES (4, 'Standard Delivery', 'NCR', 5.0, 115.00, 22.00, 0.01, 0.05, DATEADD(month, -3, CAST(GETUTCDATE() AS date)), 1, SYSUTCDATETIME(), SYSUTCDATETIME());

IF NOT EXISTS (SELECT 1 FROM ClientRates WHERE client_id = 4 AND delivery_area = 'Luzon')
    INSERT INTO ClientRates (client_id, service_type, delivery_area, minimum_kg, minimum_rate, excess_rate_per_kg, valuation_rate, fuel_surcharge_rate, effective_from, is_active, created_at, updated_at)
    VALUES (4, 'Standard Delivery', 'Luzon', 5.0, 175.00, 32.00, 0.01, 0.08, DATEADD(month, -3, CAST(GETUTCDATE() AS date)), 1, SYSUTCDATETIME(), SYSUTCDATETIME());

IF NOT EXISTS (SELECT 1 FROM ClientRates WHERE client_id = 4 AND delivery_area = 'Visayas')
    INSERT INTO ClientRates (client_id, service_type, delivery_area, minimum_kg, minimum_rate, excess_rate_per_kg, valuation_rate, fuel_surcharge_rate, effective_from, is_active, created_at, updated_at)
    VALUES (4, 'Standard Delivery', 'Visayas', 5.0, 215.00, 42.00, 0.015, 0.10, DATEADD(month, -3, CAST(GETUTCDATE() AS date)), 1, SYSUTCDATETIME(), SYSUTCDATETIME());

IF NOT EXISTS (SELECT 1 FROM ClientRates WHERE client_id = 4 AND delivery_area = 'Mindanao')
    INSERT INTO ClientRates (client_id, service_type, delivery_area, minimum_kg, minimum_rate, excess_rate_per_kg, valuation_rate, fuel_surcharge_rate, effective_from, is_active, created_at, updated_at)
    VALUES (4, 'Standard Delivery', 'Mindanao', 5.0, 255.00, 50.00, 0.015, 0.12, DATEADD(month, -3, CAST(GETUTCDATE() AS date)), 1, SYSUTCDATETIME(), SYSUTCDATETIME());

-- Client 5: Test Client Company
IF NOT EXISTS (SELECT 1 FROM ClientRates WHERE client_id = 5 AND delivery_area = 'Luzon')
    INSERT INTO ClientRates (client_id, service_type, delivery_area, minimum_kg, minimum_rate, excess_rate_per_kg, valuation_rate, fuel_surcharge_rate, effective_from, is_active, created_at, updated_at)
    VALUES (5, 'Standard Delivery', 'Luzon', 5.0, 150.00, 30.00, 0.01, 0.08, DATEADD(month, -2, CAST(GETUTCDATE() AS date)), 1, SYSUTCDATETIME(), SYSUTCDATETIME());

IF NOT EXISTS (SELECT 1 FROM ClientRates WHERE client_id = 5 AND delivery_area = 'Visayas')
    INSERT INTO ClientRates (client_id, service_type, delivery_area, minimum_kg, minimum_rate, excess_rate_per_kg, valuation_rate, fuel_surcharge_rate, effective_from, is_active, created_at, updated_at)
    VALUES (5, 'Standard Delivery', 'Visayas', 5.0, 200.00, 40.00, 0.015, 0.10, DATEADD(month, -2, CAST(GETUTCDATE() AS date)), 1, SYSUTCDATETIME(), SYSUTCDATETIME());

IF NOT EXISTS (SELECT 1 FROM ClientRates WHERE client_id = 5 AND delivery_area = 'Mindanao')
    INSERT INTO ClientRates (client_id, service_type, delivery_area, minimum_kg, minimum_rate, excess_rate_per_kg, valuation_rate, fuel_surcharge_rate, effective_from, is_active, created_at, updated_at)
    VALUES (5, 'Standard Delivery', 'Mindanao', 5.0, 250.00, 50.00, 0.015, 0.12, DATEADD(month, -2, CAST(GETUTCDATE() AS date)), 1, SYSUTCDATETIME(), SYSUTCDATETIME());


-- 2. SEED UNBILLED VALIDATED WAYBILLS FOR TESTING CREATE INVOICE

-- For Zalora Philippines (client_id = 4)
IF NOT EXISTS (SELECT 1 FROM Waybills WHERE waybill_number = 'WB-VAL-90008')
    INSERT INTO Waybills (waybill_number, client_id, origin, destination, delivery_area, actual_weight, declared_value, delivery_status, pod_status, is_billed, invoice_no, created_at, updated_at)
    VALUES ('WB-VAL-90008', 4, 'Manila Hub', 'Bonifacio Global City, Taguig', 'NCR', 6.2, 4200.00, 'Delivered', 'Validated', 0, NULL, DATEADD(day, -2, SYSUTCDATETIME()), SYSUTCDATETIME());

IF NOT EXISTS (SELECT 1 FROM Waybills WHERE waybill_number = 'WB-VAL-90009')
    INSERT INTO Waybills (waybill_number, client_id, origin, destination, delivery_area, actual_weight, declared_value, delivery_status, pod_status, is_billed, invoice_no, created_at, updated_at)
    VALUES ('WB-VAL-90009', 4, 'Clark Hub', 'San Fernando, Pampanga', 'Luzon', 12.0, 7800.00, 'Delivered', 'Validated', 0, NULL, DATEADD(day, -3, SYSUTCDATETIME()), SYSUTCDATETIME());

IF NOT EXISTS (SELECT 1 FROM Waybills WHERE waybill_number = 'WB-VAL-90010')
    INSERT INTO Waybills (waybill_number, client_id, origin, destination, delivery_area, actual_weight, declared_value, delivery_status, pod_status, is_billed, invoice_no, created_at, updated_at)
    VALUES ('WB-VAL-90010', 4, 'Cebu Hub', 'Cebu Central, Cebu City', 'Visayas', 8.5, 5500.00, 'Delivered', 'Validated', 0, NULL, DATEADD(day, -3, SYSUTCDATETIME()), SYSUTCDATETIME());

IF NOT EXISTS (SELECT 1 FROM Waybills WHERE waybill_number = 'WB-VAL-90011')
    INSERT INTO Waybills (waybill_number, client_id, origin, destination, delivery_area, actual_weight, declared_value, delivery_status, pod_status, is_billed, invoice_no, created_at, updated_at)
    VALUES ('WB-VAL-90011', 4, 'Davao Hub', 'Davao Central, Davao City', 'Mindanao', 15.0, 11000.00, 'Delivered', 'Validated', 0, NULL, DATEADD(day, -4, SYSUTCDATETIME()), SYSUTCDATETIME());

IF NOT EXISTS (SELECT 1 FROM Waybills WHERE waybill_number = 'WB-VAL-90012')
    INSERT INTO Waybills (waybill_number, client_id, origin, destination, delivery_area, actual_weight, declared_value, delivery_status, pod_status, is_billed, invoice_no, created_at, updated_at)
    VALUES ('WB-VAL-90012', 4, 'Manila Hub', 'Ortigas Center, Pasig City', 'NCR', 3.8, 2900.00, 'Delivered', 'Validated', 0, NULL, DATEADD(day, -1, SYSUTCDATETIME()), SYSUTCDATETIME());

IF NOT EXISTS (SELECT 1 FROM Waybills WHERE waybill_number = 'WB-VAL-90013')
    INSERT INTO Waybills (waybill_number, client_id, origin, destination, delivery_area, actual_weight, declared_value, delivery_status, pod_status, is_billed, invoice_no, created_at, updated_at)
    VALUES ('WB-VAL-90013', 4, 'Laguna Hub', 'Lipa City, Batangas', 'Luzon', 7.5, 3600.00, 'Delivered', 'Validated', 0, NULL, DATEADD(day, -2, SYSUTCDATETIME()), SYSUTCDATETIME());

-- For Shopee Philippines (client_id = 2)
IF NOT EXISTS (SELECT 1 FROM Waybills WHERE waybill_number = 'WB-VAL-90014')
    INSERT INTO Waybills (waybill_number, client_id, origin, destination, delivery_area, actual_weight, declared_value, delivery_status, pod_status, is_billed, invoice_no, created_at, updated_at)
    VALUES ('WB-VAL-90014', 2, 'Cebu Hub', 'Bacolod City, Negros Occidental', 'Visayas', 9.0, 3200.00, 'Delivered', 'Validated', 0, NULL, DATEADD(day, -2, SYSUTCDATETIME()), SYSUTCDATETIME());

IF NOT EXISTS (SELECT 1 FROM Waybills WHERE waybill_number = 'WB-VAL-90015')
    INSERT INTO Waybills (waybill_number, client_id, origin, destination, delivery_area, actual_weight, declared_value, delivery_status, pod_status, is_billed, invoice_no, created_at, updated_at)
    VALUES ('WB-VAL-90015', 2, 'Davao Hub', 'Cagayan de Oro City', 'Mindanao', 14.2, 5800.00, 'Delivered', 'Validated', 0, NULL, DATEADD(day, -3, SYSUTCDATETIME()), SYSUTCDATETIME());

IF NOT EXISTS (SELECT 1 FROM Waybills WHERE waybill_number = 'WB-VAL-90016')
    INSERT INTO Waybills (waybill_number, client_id, origin, destination, delivery_area, actual_weight, declared_value, delivery_status, pod_status, is_billed, invoice_no, created_at, updated_at)
    VALUES ('WB-VAL-90016', 2, 'Manila Hub', 'Quezon City', 'NCR', 5.5, 2400.00, 'Delivered', 'Validated', 0, NULL, DATEADD(day, -1, SYSUTCDATETIME()), SYSUTCDATETIME());

-- For TikTok Shop Philippines (client_id = 3)
IF NOT EXISTS (SELECT 1 FROM Waybills WHERE waybill_number = 'WB-VAL-90017')
    INSERT INTO Waybills (waybill_number, client_id, origin, destination, delivery_area, actual_weight, declared_value, delivery_status, pod_status, is_billed, invoice_no, created_at, updated_at)
    VALUES ('WB-VAL-90017', 3, 'Clark Hub', 'Baguio City, Benguet', 'Luzon', 8.4, 3600.00, 'Delivered', 'Validated', 0, NULL, DATEADD(day, -2, SYSUTCDATETIME()), SYSUTCDATETIME());

IF NOT EXISTS (SELECT 1 FROM Waybills WHERE waybill_number = 'WB-VAL-90018')
    INSERT INTO Waybills (waybill_number, client_id, origin, destination, delivery_area, actual_weight, declared_value, delivery_status, pod_status, is_billed, invoice_no, created_at, updated_at)
    VALUES ('WB-VAL-90018', 3, 'Cebu Hub', 'Iloilo City', 'Visayas', 11.0, 4900.00, 'Delivered', 'Validated', 0, NULL, DATEADD(day, -3, SYSUTCDATETIME()), SYSUTCDATETIME());

IF NOT EXISTS (SELECT 1 FROM Waybills WHERE waybill_number = 'WB-VAL-90019')
    INSERT INTO Waybills (waybill_number, client_id, origin, destination, delivery_area, actual_weight, declared_value, delivery_status, pod_status, is_billed, invoice_no, created_at, updated_at)
    VALUES ('WB-VAL-90019', 3, 'Manila Hub', 'Mandaluyong City', 'NCR', 4.2, 1950.00, 'Delivered', 'Validated', 0, NULL, DATEADD(day, -1, SYSUTCDATETIME()), SYSUTCDATETIME());

-- For Lazada Philippines (client_id = 1)
IF NOT EXISTS (SELECT 1 FROM Waybills WHERE waybill_number = 'WB-VAL-90020')
    INSERT INTO Waybills (waybill_number, client_id, origin, destination, delivery_area, actual_weight, declared_value, delivery_status, pod_status, is_billed, invoice_no, created_at, updated_at)
    VALUES ('WB-VAL-90020', 1, 'Laguna Hub', 'Calamba City, Laguna', 'Luzon', 9.8, 4100.00, 'Delivered', 'Validated', 0, NULL, DATEADD(day, -2, SYSUTCDATETIME()), SYSUTCDATETIME());

IF NOT EXISTS (SELECT 1 FROM Waybills WHERE waybill_number = 'WB-VAL-90021')
    INSERT INTO Waybills (waybill_number, client_id, origin, destination, delivery_area, actual_weight, declared_value, delivery_status, pod_status, is_billed, invoice_no, created_at, updated_at)
    VALUES ('WB-VAL-90021', 1, 'Davao Hub', 'General Santos City', 'Mindanao', 16.5, 8700.00, 'Delivered', 'Validated', 0, NULL, DATEADD(day, -3, SYSUTCDATETIME()), SYSUTCDATETIME());

PRINT 'Successfully seeded billing rates and unbilled validated waybills!';
GO
