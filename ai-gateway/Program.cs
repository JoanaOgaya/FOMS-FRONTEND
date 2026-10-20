using System;
using System.Collections.Generic;
using System.Linq;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;

var builder = WebApplication.CreateBuilder(args);

// Add services
builder.Services.AddCors(options =>
{
    options.AddDefaultPolicy(policy =>
    {
        policy.AllowAnyOrigin()
              .AllowAnyMethod()
              .AllowAnyHeader();
    });
});

builder.Services.AddHttpClient("AiServiceClient", client =>
{
    var aiServiceUrl = builder.Configuration["AI_SERVICE_URL"] ?? "http://foms-ai-service:8000";
    client.BaseAddress = new Uri(aiServiceUrl);
});

var app = builder.Build();

app.UseCors();

// Secure backend API Key to talk to Python AI Service
var aiServiceApiKey = builder.Configuration["AI_SERVICE_API_KEY"] ?? "change-me";

// Centralized permission matrix mapping as defined by the RBAC specification
var RolePermissionsMatrix = new Dictionary<string, string[]>
{
    { "Financial Manager", new[] {
        "ai.dashboard.view", "ai.duplicate.view", "ai.duplicate.review", "ai.duplicate.scan",
        "ai.collection.view", "ai.collection.generate", "ai.collection.validate", 
        "ai.recommendation.view", "ai.recommendation.decide", "ai.recommendation.export",
        "ai.reports.view", "ai.reports.export", "ai.audit.view", "ai.system.health.view"
    }},
    { "Head Accountant", new[] {
        "ai.dashboard.view", "ai.duplicate.view", "ai.duplicate.review", "ai.duplicate.scan",
        "ai.collection.view", "ai.collection.generate", "ai.recommendation.view", 
        "ai.recommendation.decide", "ai.reports.view", "ai.audit.view_limited"
    }},
    { "Accountant", new[] {
        "ai.dashboard.view", "ai.duplicate.view", "ai.duplicate.review", "ai.duplicate.scan",
        "ai.collection.view", "ai.collection.generate", "ai.recommendation.view", 
        "ai.reports.view", "ai.audit.view_limited"
    }},
    { "Coordinator", new[] {
        "ai.dashboard.view_limited", "ai.duplicate.waybill.view", "ai.duplicate.view", "ai.duplicate.scan"
    }},
    { "Assistant of Financial Manager", new[] {
        "ai.dashboard.view_limited", "ai.reports.view_limited", "ai.audit.view_limited", "ai.duplicate.view", "ai.duplicate.scan"
    }},
    { "Client", Array.Empty<string>() }
};

// JWT and local dev token helper mapping roles to explicit usernames & claim arrays
(string Username, string Role, string[] Permissions, string ClientId, string AccountType, string PasswordVersion) DecodeOrMockToken(string? authHeader)
{
    if (string.IsNullOrEmpty(authHeader) || !authHeader.StartsWith("Bearer ", StringComparison.OrdinalIgnoreCase))
    {
        return ("anonymous", "Anonymous", Array.Empty<string>(), "", "", "");
    }

    var token = authHeader.Substring(7).Trim();

    // Mapping for developer quick simulation tokens
    if (token == "fm-token") return ("financial_manager_user", "Financial Manager", RolePermissionsMatrix["Financial Manager"], "", "Staff", "2");
    if (token == "accountant-token") return ("head_accountant_user", "Head Accountant", RolePermissionsMatrix["Head Accountant"], "", "Staff", "2");
    if (token == "staff-accountant-token") return ("accountant_user", "Accountant", RolePermissionsMatrix["Accountant"], "", "Staff", "2");
    if (token == "coordinator-token") return ("coordinator_user", "Coordinator", RolePermissionsMatrix["Coordinator"], "", "Staff", "2");
    if (token == "assistant-token") return ("assistant_fm_user", "Assistant of Financial Manager", RolePermissionsMatrix["Assistant of Financial Manager"], "", "Staff", "2");
    if (token == "client-token") return ("client_user", "Client", RolePermissionsMatrix["Client"], "JD-001", "Client", "2");

    // Standard JWT Base64 Decoding (no external NuGet packages needed)
    try
    {
        var parts = token.Split('.');
        if (parts.Length == 3)
        {
            var payload = parts[1];
            // Normalize base64 padding
            payload = payload.Replace('-', '+').Replace('_', '/');
            switch (payload.Length % 4)
            {
                case 2: payload += "=="; break;
                case 3: payload += "="; break;
            }
            var bytes = Convert.FromBase64String(payload);
            var jsonString = Encoding.UTF8.GetString(bytes);
            using var doc = JsonDocument.Parse(jsonString);
            var root = doc.RootElement;

            string username = "unknown";
            if (root.TryGetProperty("unique_name", out var nameProp)) username = nameProp.GetString() ?? "unknown";
            else if (root.TryGetProperty("sub", out var subProp)) username = subProp.GetString() ?? "unknown";
            else if (root.TryGetProperty("name", out var nProp)) username = nProp.GetString() ?? "unknown";

            string role = "Client"; // Default to safest restricted role
            if (root.TryGetProperty("role", out var roleProp)) role = roleProp.GetString() ?? "Client";
            else if (root.TryGetProperty("http://schemas.microsoft.com/ws/2008/06/identity/claims/role", out var urlRoleProp)) role = urlRoleProp.GetString() ?? "Client";

            string clientId = "";
            if (root.TryGetProperty("client_id", out var clientProp)) clientId = clientProp.GetString() ?? "";

            string accountType = "";
            if (root.TryGetProperty("account_type", out var accountProp)) accountType = accountProp.GetString() ?? "";

            string passwordVersion = "";
            if (root.TryGetProperty("password_version", out var pwProp)) passwordVersion = pwProp.GetString() ?? "";
            else if (root.TryGetProperty("PasswordVersion", out var pwProp2)) passwordVersion = pwProp2.GetString() ?? "";

            // Extract explicit permissions from token array if present
            List<string> decodedPermissions = new List<string>();
            if (root.TryGetProperty("permissions", out var permsProp) && permsProp.ValueKind == JsonValueKind.Array)
            {
                foreach (var element in permsProp.EnumerateArray())
                {
                    var val = element.GetString();
                    if (!string.IsNullOrEmpty(val)) decodedPermissions.Add(val);
                }
            }

            // Fallback to local role matrix if no permissions array was embedded in the incoming claim token
            string[] finalPermissions = decodedPermissions.Count > 0 
                ? decodedPermissions.ToArray() 
                : (RolePermissionsMatrix.TryGetValue(role, out var mapVal) ? mapVal : Array.Empty<string>());

            return (username, role, finalPermissions, clientId, accountType, passwordVersion);
        }
    }
    catch
    {
        // Fail-safe to anonymous if corrupt JWT
    }

    return ("anonymous", "Anonymous", Array.Empty<string>(), "", "", "");
}

// Proxy Endpoint
app.Map("/{*path}", async (string? path, HttpContext context, IHttpClientFactory clientFactory) =>
{
    path ??= "";

    // Normalize path to strip leading "api/ai/" or "api/ai" if present (handles both Vite dev proxy and production Nginx routing)
    if (path.StartsWith("api/ai/", StringComparison.OrdinalIgnoreCase))
    {
        path = path.Substring(7);
    }
    else if (path.Equals("api/ai", StringComparison.OrdinalIgnoreCase))
    {
        path = "";
    }

    // 1. Authenticate user from Bearer Token
    string? authHeader = context.Request.Headers["Authorization"];
    var (username, role, permissions, clientId, accountType, passwordVersion) = DecodeOrMockToken(authHeader);

    var pathLower = path.ToLowerInvariant();

    // 2. Enforce Authentication check
    if (role == "Anonymous" && !pathLower.StartsWith("auth/login"))
    {
        context.Response.StatusCode = 401;
        await context.Response.WriteAsJsonAsync(new { code = "UNAUTHORIZED", message = "Authentication token is missing or invalid." });
        return;
    }

    // Block Clients completely from non-data fetching routes, or enforce password flow
    if (role == "Client" && !pathLower.StartsWith("auth/change-password"))
    {
        // Require clients to have changed their password (password_version > 1) if they are accessing data.
        if (passwordVersion == "1")
        {
            context.Response.StatusCode = 403;
            await context.Response.WriteAsJsonAsync(new { code = "MUST_CHANGE_PASSWORD", message = "Access denied: Password must be changed before accessing AI features." });
            return;
        }
    }

    // 3. Resolve path-based permission checks (RBAC validation)
    string requiredPermission = "";

    if (pathLower.StartsWith("dashboard/summary") || 
        pathLower.StartsWith("dashboard/recent-activity") || 
        pathLower.StartsWith("dashboard/trends") || 
        pathLower.StartsWith("trends"))
    {
        requiredPermission = "ai.dashboard.view";
    }
    else if (pathLower.StartsWith("dashboard/attention-accounts") || 
             pathLower.StartsWith("collection-priorities") || 
             pathLower.StartsWith("collection-recommendations") ||
             pathLower.StartsWith("collection/priorities") ||
             pathLower.StartsWith("collection/readiness"))
    {
        if (pathLower.EndsWith("review") && context.Request.Method == "POST")
        {
            requiredPermission = "ai.collection.validate";
        }
        else
        {
            requiredPermission = "ai.collection.view";
        }
    }
    else if (pathLower.StartsWith("recommendations"))
    {
        if (pathLower.Contains("decision") && context.Request.Method == "POST")
        {
            requiredPermission = "ai.collection.validate";
        }
        else if (pathLower.Contains("summary") || pathLower.Contains("export"))
        {
            requiredPermission = "ai.reports.view";
        }
        else
        {
            requiredPermission = "ai.collection.view";
        }
    }
    else if (pathLower.StartsWith("duplicates"))
    {
        if (pathLower.Contains("review") || pathLower.Contains("run"))
        {
            requiredPermission = "ai.duplicate.review";
        }
        else
        {
            requiredPermission = "ai.duplicate.view";
        }
    }
    else if (pathLower.StartsWith("collection-reports") || pathLower.StartsWith("reports"))
    {
        requiredPermission = "ai.reports.view";
    }
    else if (pathLower.StartsWith("review-history") || pathLower.StartsWith("audit-trail"))
    {
        requiredPermission = "ai.audit.view";
    }

    // Verify claims against permission requirements
    bool hasPermission = false;
    if (string.IsNullOrEmpty(requiredPermission))
    {
        hasPermission = true; // Allowed paths: /me, /permissions, health
    }
    else
    {
        hasPermission = permissions.Contains(requiredPermission);
        
        // Match specific limited fallbacks as defined by the RBAC matrix
        if (!hasPermission)
        {
            if (role == "Client")
            {
                // Allow clients to access read-only data endpoints, Python backend will filter by client_id
                if ((pathLower.StartsWith("collection-priorities") || pathLower.StartsWith("duplicates")) && context.Request.Method == "GET")
                {
                    hasPermission = true;
                }
            }
            else if (requiredPermission == "ai.dashboard.view" && permissions.Contains("ai.dashboard.view_limited"))
            {
                hasPermission = true;
            }
            else if (requiredPermission == "ai.duplicate.view" && permissions.Contains("ai.duplicate.waybill.view"))
            {
                hasPermission = true;
            }
            else if (requiredPermission == "ai.reports.view" && permissions.Contains("ai.reports.view_limited"))
            {
                hasPermission = true;
            }
            else if (requiredPermission == "ai.audit.view" && (permissions.Contains("ai.audit.view_limited") || permissions.Contains("ai.reports.view"))) // Accountant/Assistant FM audit view fallback
            {
                hasPermission = true;
            }
        }
    }

    if (!hasPermission)
    {
        context.Response.StatusCode = 403;
        await context.Response.WriteAsJsonAsync(new { 
            code = "FORBIDDEN", 
            message = $"Access denied: User '{username}' does not have the required permission scope: '{requiredPermission}'" 
        });
        return;
    }

    // 4. Prepare proxy request to Python FastAPI Backend
    var client = clientFactory.CreateClient("AiServiceClient");
    
    // Construct target URL
    var queryString = context.Request.QueryString.Value;
    var targetPath = $"api/ai/{path}{queryString}";
    
    var proxyRequest = new HttpRequestMessage(new HttpMethod(context.Request.Method), targetPath);

    // Copy request body if present
    if (context.Request.ContentLength > 0 || context.Request.Headers.ContainsKey("Transfer-Encoding"))
    {
        var streamContent = new StreamContent(context.Request.Body);
        proxyRequest.Content = streamContent;
        if (context.Request.ContentType != null)
        {
            proxyRequest.Content.Headers.ContentType = MediaTypeHeaderValue.Parse(context.Request.ContentType);
        }
    }

    // Inject Security Service Credentials and User Context Headers
    proxyRequest.Headers.Add("X-API-Key", aiServiceApiKey);
    proxyRequest.Headers.Add("X-User-Username", username);
    proxyRequest.Headers.Add("X-User-Role", role);
    proxyRequest.Headers.Add("X-Client-Id", clientId);
    proxyRequest.Headers.Add("X-Account-Type", accountType);
    proxyRequest.Headers.Add("X-Password-Version", passwordVersion);

    try
    {
        // Send request to internal AI Service
        var response = await client.SendAsync(proxyRequest, HttpCompletionOption.ResponseHeadersRead);

        // Copy response headers and status code back to client
        context.Response.StatusCode = (int)response.StatusCode;
        foreach (var header in response.Headers)
        {
            context.Response.Headers[header.Key] = header.Value.ToArray();
        }
        foreach (var header in response.Content.Headers)
        {
            context.Response.Headers[header.Key] = header.Value.ToArray();
        }

        // Copy body content
        await response.Content.CopyToAsync(context.Response.Body);
    }
    catch (HttpRequestException ex)
    {
        context.Response.StatusCode = 503;
        await context.Response.WriteAsJsonAsync(new
        {
            code = "AI_SERVICE_UNAVAILABLE",
            message = "The financial intelligence AI backend service is currently offline or undergoing maintenance.",
            details = ex.Message,
            traceId = $"ERR-GW-{DateTime.UtcNow.Ticks}"
        });
    }
});

app.Run();

public static class ReferenceNormalizer
{
    public static string Normalize(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
            return string.Empty;

        var normalized = value
            .Trim()
            .ToUpperInvariant()
            .Replace("_", "-");

        normalized = System.Text.RegularExpressions.Regex.Replace(normalized, @"\s+", "-");
        normalized = System.Text.RegularExpressions.Regex.Replace(normalized, @"-+", "-");
        normalized = System.Text.RegularExpressions.Regex.Replace(normalized, @"[^A-Z0-9\-]", "");

        return normalized;
    }
}
