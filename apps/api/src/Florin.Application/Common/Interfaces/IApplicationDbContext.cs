using Florin.Domain.Identity;
using Florin.Domain.Jugadores;
using Microsoft.EntityFrameworkCore;

namespace Florin.Application.Common.Interfaces;

public interface IApplicationDbContext
{
    DbSet<User> Users { get; }
    DbSet<Role> Roles { get; }
    DbSet<Permission> Permissions { get; }
    DbSet<UserRole> UserRoles { get; }
    DbSet<RolePermission> RolePermissions { get; }
    DbSet<RefreshToken> RefreshTokens { get; }

    DbSet<PerfilJugador> Perfiles { get; }
    DbSet<PartidaGuardada> Partidas { get; }
    DbSet<AlbumEntrada> Album { get; }

    Task<int> SaveChangesAsync(CancellationToken cancellationToken = default);
}
