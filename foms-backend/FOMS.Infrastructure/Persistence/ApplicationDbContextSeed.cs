using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using Microsoft.EntityFrameworkCore;
using FOMS.Domain.Entities;

namespace FOMS.Infrastructure.Persistence;

public static class ApplicationDbContextSeed
{
    public static async Task SeedSampleDataAsync(ApplicationDbContext context)
    {
        // ==================== Employees ====================
        var demoEmployees = new List<Employee>
        {
            new Employee
            {
                Id = "EMP-001",
                Name = "Crystalyn Joyce C. Fajardo",
                Role = "Finance Manager",
                Email = "crystalyn@foms.local",
                SystemAccess = "Finance Operation Service",
                Status = "Active",
                IsActive = true,
                Username = "EMP-001",
                PasswordHash = FOMS.Application.Services.AuthService.HashPassword("Password@123"),
            },
            new Employee
            {
                Id = "EMP-002",
                Name = "Misty",
                Role = "Head Accountant",
                Email = "misty@foms.local",
                SystemAccess = "Finance Operation Service",
                Status = "Active",
                IsActive = true,
                Username = "EMP-002",
                PasswordHash = FOMS.Application.Services.AuthService.HashPassword("Password@123")
            },
            new Employee
            {
                Id = "EMP-003",
                Name = "Maria Mariel Jane Anonuevo",
                Role = "Accountant",
                Email = "mariel@foms.local",
                SystemAccess = "Finance Operation Service",
                Status = "Active",
                IsActive = true,
                Username = "EMP-003",
                PasswordHash = FOMS.Application.Services.AuthService.HashPassword("Password@123")
            },
            new Employee
            {
                Id = "EMP-004",
                Name = "Joana Marie Ogaya",
                Role = "Assistant Financial Manager",
                Email = "joana@foms.local",
                SystemAccess = "Finance Operation Service",
                Status = "Active",
                IsActive = true,
                Username = "EMP-004",
                PasswordHash = FOMS.Application.Services.AuthService.HashPassword("Password@123")
            }
        };
        foreach (var demoEmployee in demoEmployees)
        {
            var existingEmployee = await context.Employees.FirstOrDefaultAsync(e => e.Id == demoEmployee.Id);
            if (existingEmployee != null)
            {
                existingEmployee.Name = demoEmployee.Name;
                existingEmployee.Role = demoEmployee.Role;
                existingEmployee.Email = demoEmployee.Email;
                existingEmployee.SystemAccess = demoEmployee.SystemAccess;
                existingEmployee.Status = demoEmployee.Status;
                existingEmployee.IsActive = demoEmployee.IsActive;
                existingEmployee.Username = demoEmployee.Username;
                if (!existingEmployee.PasswordHash.StartsWith("PBKDF2$"))
                {
                    existingEmployee.PasswordHash = demoEmployee.PasswordHash;
                }
            }
            else
            {
                context.Employees.Add(demoEmployee);
            }
        }

        // ==================== Clients ====================
        var demoClients = new List<Client>
        {
            new Client
            {
                Id = "CA-001",
                ClientCode = "CA-001",
                Name = "Lazada Philippines",
                BusinessName = "Lazada PH",
                ContactPerson = "John Doe",
                ContactNumber = "09171234567",
                Email = "contact@lazada.com",
                Address = "Manila, Philippines",
                Tin = "123-456-789",
                CreditLimit = 500000m,
                CurrentBalance = 53200m
            },
            new Client
            {
                Id = "CA-002",
                ClientCode = "CA-002",
                Name = "Shopee Philippines",
                BusinessName = "Shopee PH",
                ContactPerson = "Jane Smith",
                ContactNumber = "09179876543",
                Email = "contact@shopee.com",
                Address = "Cebu, Philippines",
                Tin = "987-654-321",
                CreditLimit = 300000m,
                CurrentBalance = 0m,
                Status = "Active"
            },
            new Client
            {
                Id = "CA-003",
                ClientCode = "CA-003",
                Name = "TikTok Shop Philippines",
                BusinessName = "TikTok Shop PH",
                ContactPerson = "David Lee",
                ContactNumber = "09173334444",
                Email = "billing@tiktok.com",
                Address = "Taguig, Philippines",
                Tin = "456-789-123",
                CreditLimit = 400000m,
                CurrentBalance = 15000m,
                Status = "Active"
            },
            new Client
            {
                Id = "CA-004",
                ClientCode = "CA-004",
                Name = "Zalora Philippines",
                BusinessName = "Zalora PH",
                ContactPerson = "Robert Tan",
                ContactNumber = "09185551234",
                Email = "finance@zalora.com.ph",
                Address = "Muntinlupa City, Metro Manila",
                Tin = "321-654-987",
                CreditLimit = 250000m,
                CurrentBalance = 0m,
                Status = "Inactive"
            }
        };
        foreach (var client in demoClients)
        {
            var existing = await context.Clients.FirstOrDefaultAsync(c => c.Id == client.Id);
            if (existing != null)
            {
                existing.Name = client.Name;
                existing.BusinessName = client.BusinessName;
                existing.ContactPerson = client.ContactPerson;
                existing.ContactNumber = client.ContactNumber;
                existing.Email = client.Email;
                existing.Address = client.Address;
                existing.Tin = client.Tin;
                existing.CreditLimit = client.CreditLimit;
                existing.CurrentBalance = client.CurrentBalance;
                existing.Status = client.Status;
            }
            else
            {
                context.Clients.Add(client);
            }
        }
        try
        {
            await context.Database.ExecuteSqlRawAsync(
                "UPDATE Clients SET client_id = 1, client_code = 'CA-001', company_name = 'Lazada Philippines' WHERE Id = 'CA-001' AND (client_id IS NULL OR company_name IS NULL);" +
                "UPDATE Clients SET client_id = 2, client_code = 'CA-002', company_name = 'Shopee Philippines' WHERE Id = 'CA-002' AND (client_id IS NULL OR company_name IS NULL);" +
                "UPDATE Clients SET client_id = 3, client_code = 'CA-003', company_name = 'TikTok Shop Philippines' WHERE Id = 'CA-003' AND (client_id IS NULL OR company_name IS NULL);" +
                "UPDATE Clients SET client_id = 4, client_code = 'CA-004', company_name = 'Zalora Philippines' WHERE Id = 'CA-004' AND (client_id IS NULL OR company_name IS NULL);"
            );
        }
        catch { }

        var demoInvoices = new List<Invoice>
        {
            new Invoice
            {
                Id = "INV-001",
                InvoiceNo = "LZD-2026-0001",
                ClientId = "CA-001",
                ClientName = "Lazada Philippines",
                BillingDate = DateTime.UtcNow.AddDays(-10).ToString("yyyy-MM-dd"),
                DueDate = DateTime.UtcNow.AddDays(20).ToString("yyyy-MM-dd"),
                TotalAmount = 50000m,
                AmountPaid = 0m,
                Balance = 50000m,
                PaymentStatus = "Draft",
                PaymentValidationStatus = "Draft"
            },
            new Invoice
            {
                Id = "INV-002",
                InvoiceNo = "BI-2026-0001",
                ClientId = "CA-001",
                ClientName = "Lazada Philippines",
                BillingDate = DateTime.UtcNow.AddDays(-5).ToString("yyyy-MM-dd"),
                DueDate = DateTime.UtcNow.AddDays(25).ToString("yyyy-MM-dd"),
                TotalAmount = 30000m,
                AmountPaid = 0m,
                Balance = 30000m,
                PaymentStatus = "Pending Approval",
                PaymentValidationStatus = "Pending Approval"
            },
            new Invoice
            {
                Id = "INV-003",
                InvoiceNo = "SHP-2026-0001",
                ClientId = "CA-002",
                ClientName = "Shopee Philippines",
                BillingDate = DateTime.UtcNow.AddDays(-3).ToString("yyyy-MM-dd"),
                DueDate = DateTime.UtcNow.AddDays(14).ToString("yyyy-MM-dd"),
                TotalAmount = 42500m,
                AmountPaid = 0m,
                Balance = 42500m,
                PaymentStatus = "Needs Revision",
                PaymentValidationStatus = "Needs Revision",
                Description = "Returned for tax computation revision"
            }
        };
        foreach (var invoice in demoInvoices)
        {
            var existing = await context.Invoices.FirstOrDefaultAsync(i => i.Id == invoice.Id);
            if (existing != null)
            {
                existing.InvoiceNo = invoice.InvoiceNo;
                existing.ClientId = invoice.ClientId;
                existing.ClientName = invoice.ClientName;
                existing.BillingDate = invoice.BillingDate;
                existing.DueDate = invoice.DueDate;
                existing.TotalAmount = invoice.TotalAmount;
                existing.AmountPaid = invoice.AmountPaid;
                existing.Balance = invoice.Balance;
                existing.PaymentStatus = invoice.PaymentStatus;
                existing.PaymentValidationStatus = invoice.PaymentValidationStatus;
                existing.Description = invoice.Description;
            }
            else
            {
                context.Invoices.Add(invoice);
            }
        }

        // ==================== Shipment Records ====================
        var demoShipments = new List<ShipmentRecord>
        {
            new ShipmentRecord
            {
                Id = "SR-001",
                ClientId = "CA-001",
                Cost = 7500m,
                Status = "Pending Validation"
            }
        };
        foreach (var shipment in demoShipments)
        {
            var existing = await context.ShipmentRecords.FirstOrDefaultAsync(s => s.Id == shipment.Id);
            if (existing != null)
            {
                existing.ClientId = shipment.ClientId;
                existing.Cost = shipment.Cost;
                existing.Status = shipment.Status;
            }
            else
            {
                context.ShipmentRecords.Add(shipment);
            }
        }

        // ==================== Cash Flow Transactions ====================
        var demoCashFlows = new List<CashFlowTransaction>
        {
            new CashFlowTransaction
            {
                Id = Guid.NewGuid().ToString(),
                Type = "Inflow",
                Category = "Collection",
                Amount = 50000m,
                ReferenceNo = "OR-2026-INIT",
                Description = "Initial cash collection",
                Date = DateTime.UtcNow.ToString("yyyy-MM-dd"),
            },
            new CashFlowTransaction
            {
                Id = Guid.NewGuid().ToString(),
                Type = "Outflow",
                Category = "Fuel",
                Amount = 3500m,
                ReferenceNo = "OR-2026-FUEL",
                Description = "Fleet expense for XYZ-1234",
                Date = DateTime.UtcNow.ToString("yyyy-MM-dd"),
            }
        };
        foreach (var cf in demoCashFlows)
        {
            var exists = await context.CashFlowTransactions.FirstOrDefaultAsync(c => c.ReferenceNo == cf.ReferenceNo);
            if (exists == null)
            {
                context.CashFlowTransactions.Add(cf);
            }
        }

        // ==================== Payments ====================
        var demoPayments = new List<Payment>
        {
            new Payment
            {
                Id = "PAY-001",
                InvoiceId = "INV-001",
                InvoiceNo = "LZD-2026-0001",
                ClientId = "CA-001",
                ClientName = "Lazada Philippines",
                Amount = 50000m,
                Flow = "inflow",
                PaymentMethod = "Bank Transfer",
                ReferenceNumber = "OR-2026-TEST",
                PaymentStatus = "Pending Finance Validation",
                SubmittedAt = DateTime.UtcNow
            },
            new Payment
            {
                Id = "PAY-002",
                InvoiceId = "INV-002",
                InvoiceNo = "BI-2026-0001",
                ClientId = "CA-001",
                ClientName = "Lazada Philippines",
                Amount = 15000m,
                Flow = "outflow",
                PaymentMethod = "Bank Transfer",
                ReferenceNumber = "DISB-2026-0042",
                PaymentStatus = "Validated",
                RecordedBy = "Crystalyn Joyce C. Fajardo",
                SubmittedAt = DateTime.UtcNow.AddDays(-1)
            }
        };
        foreach (var p in demoPayments)
        {
            var existing = await context.Payments.FirstOrDefaultAsync(pay => pay.Id == p.Id);
            if (existing != null)
            {
                existing.Flow = p.Flow;
                existing.Amount = p.Amount;
                existing.PaymentStatus = p.PaymentStatus;
                existing.RecordedBy = p.RecordedBy;
            }
            else
            {
                context.Payments.Add(p);
            }
        }

        await context.SaveChangesAsync();
    }
}
