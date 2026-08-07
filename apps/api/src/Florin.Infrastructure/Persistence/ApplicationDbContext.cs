using System.Reflection;
using Florin.Application.Common.Interfaces;
using Florin.Domain.Identity;
using Florin.Domain.Jugadores;
using Microsoft.EntityFrameworkCore;

namespace Florin.Infrastructure.Persistence;

public class ApplicationDbContext(DbContextOptions<ApplicationDbContext> options)
    : DbContext(options), IApplicationDbContext
{
    public DbSet<User> Users => Set<User>();
    public DbSet<Role> Roles => Set<Role>();
    public DbSet<Permission> Permissions => Set<Permission>();
    public DbSet<UserRole> UserRoles => Set<UserRole>();
    public DbSet<RolePermission> RolePermissions => Set<RolePermission>();
    public DbSet<RefreshToken> RefreshTokens => Set<RefreshToken>();

    public DbSet<PerfilJugador> Perfiles => Set<PerfilJugador>();
    public DbSet<PartidaGuardada> Partidas => Set<PartidaGuardada>();
    public DbSet<AlbumEntrada> Album => Set<AlbumEntrada>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.ApplyConfigurationsFromAssembly(Assembly.GetExecutingAssembly());
        base.OnModelCreating(modelBuilder);
    }
}
