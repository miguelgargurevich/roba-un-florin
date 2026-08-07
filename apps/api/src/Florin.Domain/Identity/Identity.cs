using Florin.Domain.Common;

namespace Florin.Domain.Identity;

public class User : Entity
{
    public string Email { get; private set; } = null!;
    public string PasswordHash { get; private set; } = null!;
    public string FullName { get; private set; } = null!;
    public bool IsActive { get; private set; } = true;

    public string Initials => string.Concat(FullName.Split(' ', StringSplitOptions.RemoveEmptyEntries)
        .Take(2).Select(p => p[0])).ToUpperInvariant();

    public ICollection<UserRole> UserRoles { get; private set; } = new List<UserRole>();

    private User() { }
    public User(string email, string passwordHash, string fullName)
    {
        Email = email.Trim().ToLowerInvariant();
        PasswordHash = passwordHash;
        FullName = fullName.Trim();
    }

    public void CambiarPassword(string hash) { PasswordHash = hash; Touch(); }
    public void Desactivar() { IsActive = false; Touch(); }
}

public class Role : Entity
{
    public string Code { get; private set; } = null!;
    public string Name { get; private set; } = null!;
    public ICollection<RolePermission> RolePermissions { get; private set; } = new List<RolePermission>();
    private Role() { }
    public Role(string code, string name) { Code = code; Name = name; }
}

public class Permission : Entity
{
    public string Code { get; private set; } = null!;
    public string Description { get; private set; } = null!;
    public ICollection<RolePermission> RolePermissions { get; private set; } = new List<RolePermission>();
    private Permission() { }
    public Permission(string code, string description) { Code = code; Description = description; }
}

public class UserRole : Entity
{
    public Guid UserId { get; private set; }
    public Guid RoleId { get; private set; }
    private UserRole() { }
    public UserRole(Guid userId, Guid roleId) { UserId = userId; RoleId = roleId; }
}

public class RolePermission : Entity
{
    public Guid RoleId { get; private set; }
    public Guid PermissionId { get; private set; }
    private RolePermission() { }
    public RolePermission(Guid roleId, Guid permissionId) { RoleId = roleId; PermissionId = permissionId; }
}

public class RefreshToken : Entity
{
    public Guid UserId { get; private set; }
    public string Token { get; private set; } = null!;
    public DateTime ExpiresAt { get; private set; }
    public DateTime? RevokedAt { get; private set; }
    public bool IsActive => RevokedAt is null && DateTime.UtcNow < ExpiresAt;
    private RefreshToken() { }
    public RefreshToken(Guid userId, string token, DateTime expiresAt)
    { UserId = userId; Token = token; ExpiresAt = expiresAt; }
    public void Revoke() => RevokedAt = DateTime.UtcNow;
}
