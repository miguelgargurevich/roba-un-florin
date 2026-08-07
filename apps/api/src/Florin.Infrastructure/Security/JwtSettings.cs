using Florin.Application.Common.Interfaces;

namespace Florin.Infrastructure.Security;

public class JwtSettings : IJwtSettings
{
    public string Issuer { get; set; } = "florin";
    public string Audience { get; set; } = "florin";
    public string Secret { get; set; } = "";      // viene por entorno o user-secrets
    public int AccessTokenMinutes { get; set; } = 30;
    public int RefreshTokenDays { get; set; } = 30;
}
