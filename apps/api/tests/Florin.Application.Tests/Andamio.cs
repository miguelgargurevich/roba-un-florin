using Florin.Application;
using Florin.Application.Common.Interfaces;
using Florin.Domain.Identity;
using Florin.Domain.Jugadores;
using Florin.Infrastructure.Persistence;
using MediatR;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace Florin.Application.Tests;

/// <summary>Un usuario cualquiera de mentira, para no depender del token real.</summary>
public class UsuarioFalso : ICurrentUser
{
    public Guid? UserId { get; set; }
    public string? Email { get; set; } = "test@florin.test";
    public string? Apodo { get; set; } = "Test";
    public IReadOnlyCollection<string> Roles { get; set; } = [Domain.Identity.Roles.Jugador];
    public IReadOnlyCollection<string> Permissions { get; set; } = Domain.Identity.Permissions.DeJugador;
    public bool IsAuthenticated => UserId is not null;
    public bool HasPermission(string permission) => Permissions.Contains(permission);
}

/// <summary>
/// Monta MediatR con los handlers reales sobre una base en memoria. Se prueba lo
/// mismo que corre en producción — incluido el ValidationBehavior — sin Postgres.
/// </summary>
public sealed class Andamio : IDisposable
{
    public UsuarioFalso Actual { get; } = new();
    public ApplicationDbContext Db { get; }
    public ISender Mediator { get; }
    private readonly ServiceProvider _sp;

    public Andamio()
    {
        var opciones = new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseInMemoryDatabase($"florin-{Guid.NewGuid()}")
            .ConfigureWarnings(w => w.Ignore(
                Microsoft.EntityFrameworkCore.Diagnostics.InMemoryEventId.TransactionIgnoredWarning))
            .Options;
        Db = new ApplicationDbContext(opciones);

        var servicios = new ServiceCollection();
        servicios.AddApplication();
        servicios.AddSingleton<IApplicationDbContext>(Db);
        servicios.AddSingleton<ICurrentUser>(Actual);
        _sp = servicios.BuildServiceProvider();
        Mediator = _sp.GetRequiredService<ISender>();
    }

    /// <summary>Crea cuenta + perfil y deja la sesión puesta en ese jugador.</summary>
    public PerfilJugador ConJugador(string apodo = "Migue", bool sesion = true)
    {
        var user = new User($"{apodo.ToLowerInvariant()}@florin.test", "hash", apodo);
        var perfil = new PerfilJugador(user.Id, apodo);
        Db.Users.Add(user);
        Db.Perfiles.Add(perfil);
        Db.SaveChanges();
        if (sesion) Actual.UserId = user.Id;
        return perfil;
    }

    public void EntraComo(PerfilJugador perfil) => Actual.UserId = perfil.UserId;

    public void Dispose() { Db.Dispose(); _sp.Dispose(); }
}
