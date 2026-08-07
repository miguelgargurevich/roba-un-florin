using Florin.Domain.Identity;
using Florin.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace Florin.Infrastructure.Seeding;

/// <summary>
/// Corre en cada arranque y solo agrega lo que falta, así que es seguro repetirlo.
/// Siembra los permisos desde Permissions.All: eso cierra el círculo con las
/// policies del host, que salen del mismo catálogo.
/// </summary>
public class DatabaseSeeder(ApplicationDbContext db)
{
    public async Task SeedAsync(CancellationToken ct = default)
    {
        await SeedPermisosAsync(ct);
        await SeedRolesAsync(ct);
        await SeedRolePermissionsAsync(ct);
    }

    private async Task SeedPermisosAsync(CancellationToken ct)
    {
        var existentes = await db.Permissions.Select(p => p.Code).ToListAsync(ct);
        var faltan = Permissions.All.Where(kv => !existentes.Contains(kv.Key))
            .Select(kv => new Permission(kv.Key, kv.Value)).ToList();
        if (faltan.Count == 0) return;
        db.Permissions.AddRange(faltan);
        await db.SaveChangesAsync(ct);
    }

    private async Task SeedRolesAsync(CancellationToken ct)
    {
        var deseados = new Dictionary<string, string>
        {
            [Roles.Jugador] = "Jugador",
            [Roles.Admin]   = "Administrador",
        };
        var existentes = await db.Roles.Select(r => r.Code).ToListAsync(ct);
        var faltan = deseados.Where(kv => !existentes.Contains(kv.Key))
            .Select(kv => new Role(kv.Key, kv.Value)).ToList();
        if (faltan.Count == 0) return;
        db.Roles.AddRange(faltan);
        await db.SaveChangesAsync(ct);
    }

    private async Task SeedRolePermissionsAsync(CancellationToken ct)
    {
        var roles = await db.Roles.ToDictionaryAsync(r => r.Code, ct);
        var permisos = await db.Permissions.ToDictionaryAsync(p => p.Code, ct);
        var yaHay = await db.RolePermissions.Select(rp => new { rp.RoleId, rp.PermissionId }).ToListAsync(ct);

        void Conceder(string rol, IEnumerable<string> codigos)
        {
            if (!roles.TryGetValue(rol, out var r)) return;
            foreach (var code in codigos)
            {
                if (!permisos.TryGetValue(code, out var p)) continue;
                if (yaHay.Any(x => x.RoleId == r.Id && x.PermissionId == p.Id)) continue;
                db.RolePermissions.Add(new RolePermission(r.Id, p.Id));
            }
        }

        Conceder(Roles.Jugador, Permissions.DeJugador);
        Conceder(Roles.Admin, Permissions.All.Keys);      // el admin lo puede todo
        await db.SaveChangesAsync(ct);
    }
}
