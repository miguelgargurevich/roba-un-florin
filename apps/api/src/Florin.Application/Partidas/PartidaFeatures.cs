using FluentValidation;
using Florin.Application.Common;
using Florin.Application.Common.Interfaces;
using Florin.Application.Perfiles;
using Florin.Domain.Jugadores;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace Florin.Application.Partidas;

public record PartidaDto(string Escenario, long Dinero, int Hito, double Segundos,
    string Estado, DateTime? ActualizadoEn);

/* ---- leer la partida guardada ---- */
public record GetMiPartidaQuery : IRequest<PartidaDto?>;

public class GetMiPartidaQueryHandler(IApplicationDbContext db, ICurrentUser actual)
    : IRequestHandler<GetMiPartidaQuery, PartidaDto?>
{
    public async Task<PartidaDto?> Handle(GetMiPartidaQuery request, CancellationToken ct)
    {
        var perfil = await PerfilDeSesion.ObtenerAsync(db, actual, ct);
        var partida = await db.Partidas.AsNoTracking()
            .FirstOrDefaultAsync(p => p.PerfilId == perfil.Id, ct);
        return partida is null ? null
            : new PartidaDto(partida.Escenario, partida.Dinero, partida.Hito, partida.Segundos,
                partida.Estado, partida.UpdatedAt ?? partida.CreatedAt);
    }
}

/* ---- guardarla ---- */
public record GuardarPartidaCommand(string Escenario, long Dinero, int Hito, double Segundos, string Estado)
    : IRequest<Unit>;

public class GuardarPartidaCommandValidator : AbstractValidator<GuardarPartidaCommand>
{
    private static readonly string[] Escenarios = ["barrio", "colegio", "playa", "desierto"];

    public GuardarPartidaCommandValidator()
    {
        RuleFor(x => x.Escenario).Must(e => Escenarios.Contains(e)).WithMessage("Ese escenario no existe.");
        RuleFor(x => x.Dinero).GreaterThanOrEqualTo(0);
        RuleFor(x => x.Hito).InclusiveBetween(0, 10_000);
        RuleFor(x => x.Segundos).GreaterThanOrEqualTo(0);
        // Un estado de partida ronda las decenas de KB; el tope corta cualquier
        // intento de usar el guardado como almacenamiento gratis.
        RuleFor(x => x.Estado).NotEmpty().MaximumLength(512_000)
            .WithMessage("El estado de la partida es demasiado grande.");
    }
}

public class GuardarPartidaCommandHandler(IApplicationDbContext db, ICurrentUser actual)
    : IRequestHandler<GuardarPartidaCommand, Unit>
{
    public async Task<Unit> Handle(GuardarPartidaCommand request, CancellationToken ct)
    {
        var perfil = await PerfilDeSesion.ObtenerAsync(db, actual, ct);
        var partida = await db.Partidas.FirstOrDefaultAsync(p => p.PerfilId == perfil.Id, ct);

        if (partida is null)
        {
            db.Partidas.Add(new PartidaGuardada(perfil.Id, request.Escenario, request.Dinero,
                request.Hito, request.Segundos, request.Estado));
            perfil.ContarPartida();
        }
        else
        {
            partida.Actualizar(request.Escenario, request.Dinero, request.Hito, request.Segundos, request.Estado);
        }

        // Las marcas solo suben. Hoy vienen del cliente, así que son un dato
        // suyo, no una verdad: cuando el servidor simule, saldrán de ahí.
        perfil.RegistrarMarcas(request.Dinero, request.Hito);
        await db.SaveChangesAsync(ct);
        return Unit.Value;
    }
}
