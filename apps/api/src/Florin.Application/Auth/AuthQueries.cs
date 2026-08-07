using Florin.Application.Common.Interfaces;
using Microsoft.EntityFrameworkCore;

namespace Florin.Application.Auth;

public static class AuthQueries
{
    public static async Task<(string[] roles, string[] permissions)> LoadRolesAndPermissionsAsync(
        IApplicationDbContext db, Guid userId, CancellationToken ct)
    {
        var roleIds = await db.UserRoles.Where(ur => ur.UserId == userId).Select(ur => ur.RoleId).ToListAsync(ct);
        var roles = await db.Roles.Where(r => roleIds.Contains(r.Id)).Select(r => r.Code).ToArrayAsync(ct);
        var permIds = await db.RolePermissions.Where(rp => roleIds.Contains(rp.RoleId))
            .Select(rp => rp.PermissionId).Distinct().ToListAsync(ct);
        var permissions = await db.Permissions.Where(p => permIds.Contains(p.Id)).Select(p => p.Code).ToArrayAsync(ct);
        return (roles, permissions);
    }

    /// <summary>Emite el par de tokens y deja el refresh guardado. Lo comparten login, registro y refresh.</summary>
    public static async Task<AuthResponse> EmitirAsync(IApplicationDbContext db, IJwtTokenGenerator jwt,
        IJwtSettings settings, Domain.Identity.User user, CancellationToken ct)
    {
        var (roles, permissions) = await LoadRolesAndPermissionsAsync(db, user.Id, ct);
        var access = jwt.GenerateAccessToken(user, roles, permissions);
        var refresh = jwt.GenerateRefreshToken();
        db.RefreshTokens.Add(new Domain.Identity.RefreshToken(
            user.Id, refresh, DateTime.UtcNow.AddDays(settings.RefreshTokenDays)));
        await db.SaveChangesAsync(ct);
        var dto = new UserDto(user.Id, user.Email, user.FullName, roles, permissions);
        return new AuthResponse(access.Value, refresh, access.ExpiresAt, false, dto);
    }
}
