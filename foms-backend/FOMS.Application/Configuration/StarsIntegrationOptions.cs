namespace FOMS.Application.Configuration;

public class StarsIntegrationOptions
{
    public const string SectionName = "StarsIntegration";

    /// <summary>
    /// Base URL of the STARS API in Azure (e.g. https://stars-h8bgfbhghzbdc9fd.southeastasia-01.azurewebsites.net)
    /// </summary>
    public string? StarsBaseUrl { get; set; }

    /// <summary>
    /// API key expected from STARS when STARS sends invoice endorsement completion callbacks.
    /// Env: StarsIntegration__InboundApiKey
    /// </summary>
    public string? InboundApiKey { get; set; }

    /// <summary>
    /// API key presented in X-Api-Key when FOMS calls STARS.
    /// Env: StarsIntegration__OutboundApiKey
    /// </summary>
    public string? OutboundApiKey { get; set; }

    public bool CanCallStars =>
        !string.IsNullOrWhiteSpace(StarsBaseUrl) && !string.IsNullOrWhiteSpace(OutboundApiKey);
}
