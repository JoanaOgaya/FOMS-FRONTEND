using System.Threading.Tasks;
using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using FOMS.Application.Features;

namespace FOMS.Api.Controllers;

[Route("api/adjustments")]
[Route("api/v1/adjustments")]
[Route("adjustments")]
public class AdjustmentsController : ApiControllerBase
{
    /// <summary>
    /// GET /api/v1/adjustments â€” Returns all payment adjustments, newest first.
    /// Accessible by Accountant and Bookkeeper.
    /// </summary>
    [Authorize]
    [HttpGet]
    public async Task<IActionResult> GetAdjustments()
    {
        var list = await Mediator.Send(new AdjustmentFeatures.GetAdjustmentsQuery());
        var mapped = list.Select(a => new
        {
            id = a.Id,
            type = a.AdjustmentType == "Credit" ? "Credit Memo" : "Adjustment",
            amount = a.Amount,
            reason = a.Reason,
            referenceNo = a.Id,
            status = a.Status == "Pending" ? "Pending Approval" : a.Status,
            affectedRecordId = a.InvoiceNo,
            clientId = "CA-001",
            createdAt = !string.IsNullOrEmpty(a.DateRequested) ? a.DateRequested : DateTime.UtcNow.ToString("yyyy-MM-dd"),
            createdBy = !string.IsNullOrEmpty(a.AdjustedBy) ? a.AdjustedBy : "Bookkeeper",
            remarks = a.Reason,
            a.InvoiceNo,
            a.AdjustmentType,
            a.AdjustedBy,
            a.DateRequested,
            a.ApprovedBy,
            a.DateApproved
        }).ToList();
        return Ok(mapped);
    }

    public class CreateAdjustmentDto
    {
        public string? InvoiceNo { get; set; }
        public string? AffectedRecordId { get; set; }
        public string? AdjustmentType { get; set; }
        public string? Type { get; set; }
        public decimal Amount { get; set; }
        public string? Reason { get; set; }
        public string? ReferenceNo { get; set; }
        public string? ClientId { get; set; }
        public string? AdjustedBy { get; set; }
        public string? ApprovedBy { get; set; }
    }

    /// <summary>
    /// POST /api/v1/adjustments — Create a new pending adjustment request.
    /// Bookkeepers submit; Accountants also allowed to create.
    /// </summary>
    [Authorize]
    [HttpPost]
    public async Task<IActionResult> Create([FromBody] CreateAdjustmentDto dto)
    {
        var user = User.FindFirst("name")?.Value ?? User.FindFirst(ClaimTypes.Name)?.Value ?? "Unknown User";
        var invoiceNo = !string.IsNullOrWhiteSpace(dto.InvoiceNo) ? dto.InvoiceNo : (dto.AffectedRecordId ?? string.Empty);
        var rawType = !string.IsNullOrWhiteSpace(dto.AdjustmentType) ? dto.AdjustmentType : (dto.Type ?? "Credit");

        var command = new AdjustmentFeatures.CreateAdjustmentCommand(
            InvoiceNo: invoiceNo,
            AdjustmentType: rawType,
            Amount: dto.Amount,
            Reason: dto.Reason ?? string.Empty,
            AdjustedBy: user,
            ApprovedBy: dto.ApprovedBy ?? string.Empty
        );

        try
        {
            var result = await Mediator.Send(command);
            if (result == null)
                return NotFound(new { message = $"Invoice '{invoiceNo}' not found. Please check the invoice number." });

            var response = new
            {
                id = result.Id,
                type = result.AdjustmentType == "Credit" ? "Credit Memo" : "Adjustment",
                amount = result.Amount,
                reason = result.Reason,
                referenceNo = !string.IsNullOrEmpty(dto.ReferenceNo) ? dto.ReferenceNo : result.Id,
                status = result.Status == "Pending" ? "Pending Approval" : result.Status,
                affectedRecordId = result.InvoiceNo,
                clientId = dto.ClientId ?? "CA-001",
                createdAt = result.DateRequested,
                createdBy = result.AdjustedBy,
                remarks = result.Reason
            };

            return Ok(response);
        }
        catch (FOMS.Application.Exceptions.ValidationException valEx)
        {
            var msg = string.Join("; ", valEx.Errors.SelectMany(e => e.Value));
            if (string.IsNullOrWhiteSpace(msg)) msg = valEx.Message;
            return BadRequest(new { message = msg, errors = valEx.Errors });
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { message = ex.Message });
        }
        catch (Exception ex)
        {
            return BadRequest(new { message = ex.Message });
        }
    }

    /// <summary>
    /// PUT /api/v1/adjustments/{id}/approve â€” Accountant approves an adjustment.
    /// Applies the balance change to the invoice.
    /// </summary>
    [Authorize]
    [HttpPut("{id}/approve")]
    [HttpPost("{id}/approve")]
    public async Task<IActionResult> Approve(string id)
    {
        var user = User.FindFirst("name")?.Value ?? User.FindFirst(ClaimTypes.Name)?.Value ?? "Unknown User";
        var result = await Mediator.Send(new AdjustmentFeatures.ApproveAdjustmentCommand(id, user));
        if (result == null)
            return NotFound(new { message = "Adjustment not found or is no longer pending." });

        return Ok(result);
    }

    /// <summary>
    /// PUT or POST /api/v1/adjustments/{id}/reject — Accountant rejects a pending adjustment.
    /// No balance change is applied.
    /// </summary>
    [Authorize]
    [HttpPut("{id}/reject")]
    [HttpPost("{id}/reject")]
    public async Task<IActionResult> Reject(string id)
    {
        var user = User.FindFirst("name")?.Value ?? User.FindFirst(ClaimTypes.Name)?.Value ?? "Unknown User";
        var result = await Mediator.Send(new AdjustmentFeatures.RejectAdjustmentCommand(id, user));
        if (result == null)
            return NotFound(new { message = "Adjustment not found or is no longer pending." });

        return Ok(result);
    }

    /// <summary>
    /// DELETE /api/v1/adjustments/{id} â€” Delete a Pending adjustment (Bookkeeper or Accountant).
    /// Cannot delete already Approved or Rejected adjustments.
    /// </summary>
    [Authorize]
    [HttpDelete("{id}")]
    public async Task<IActionResult> Delete(string id)
    {
        var user = User.FindFirst("name")?.Value ?? User.FindFirst(ClaimTypes.Name)?.Value ?? "Unknown User";
        var result = await Mediator.Send(new AdjustmentFeatures.DeleteAdjustmentCommand(id, user));
        if (!result)
            return NotFound(new { message = "Adjustment not found or has already been processed (Approved/Rejected)." });

        return Ok(new { success = true });
    }
}
