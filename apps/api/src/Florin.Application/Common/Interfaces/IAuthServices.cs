using Florin.Domain.Identity;

namespace Florin.Application.Common.Interfaces;

public record AccessToken(string Value, DateTime ExpiresAt);

public interface IJwtTokenGenerator
{
    AccessToken GenerateAccessToken(User user, IEnumerable<string> roles, IEnumerable<string> permissions);
    string GenerateRefreshToken();
}

public interface IJwtSettings
{
    string Issuer { get; }
    string Audience { get; }
    string Secret { get; }
    int AccessTokenMinutes { get; }
    int RefreshTokenDays { get; }
}

public interface IPasswordHasher
{
    string Hash(string password);
    bool Verify(string password, string hash);
}
