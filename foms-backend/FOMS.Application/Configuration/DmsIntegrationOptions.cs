namespace FOMS.Application.Configuration;

public class DmsIntegrationOptions
{
    public const string SectionName = "DmsIntegration";

    /// <summary>
    /// Base URL of the DMS API in Azure (e.g. https://dts-api-gab-byafd0h2aha6a9c9.japaneast-01.azurewebsites.net)
    /// </summary>
    public string? BaseUrl { get; set; }

    /// <summary>
    /// API key expected from DMS when DMS pushes delivery events or advance requests to FOMS.
    /// Env: DmsIntegration__InboundApiKey
    /// </summary>
    public string? InboundApiKey { get; set; }

    /// <summary>
    /// API key presented in X-Api-Key when FOMS calls DMS.
    /// Env: DmsIntegration__OutboundApiKey
    /// </summary>
    public string? OutboundApiKey { get; set; }

    public bool CanCallDms =>
        !string.IsNullOrWhiteSpace(BaseUrl) && !string.IsNullOrWhiteSpace(OutboundApiKey);
}
