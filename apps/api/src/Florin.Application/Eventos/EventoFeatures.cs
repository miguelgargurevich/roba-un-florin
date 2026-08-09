using System.Text.Json;
using FluentValidation;
using Florin.Application.Common;
using Florin.Application.Common.Interfaces;
using Florin.Application.Perfiles;
using Florin.Domain.Eventos;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace Florin.Application.Eventos;

/* Las fiestas: el admin programa una y, a esa hora, a todo el que esté jugando
   le baja por la pasarela lo que él eligió. El servidor no simula nada — solo
   dice "hay fiesta, esto es lo que baja y hasta cuándo"— y cada cliente lo
   aplica en su partida. */

public record FlorinDeFiesta(int Tier, string? Variante);

public record EventoDto(
    Guid Id, string Nombre, DateTime EmpiezaEn, DateTime TerminaEn, int DuraSegundos,
    IReadOnlyList<FlorinDeFiesta> Florines, FlorinDeFiesta? Regalo, bool Cancelado);

/// <summary>Lo que ve el cliente: la fiesta de AHORA, y la siguiente si no hay.</summary>
public record EventoVivoDto(EventoDto? Ahora, int SegundosQueQuedan, EventoDto? Siguiente,
                            int SegundosParaLaSiguiente, bool RegaloPendiente);

internal static class Fiestas
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    public static IReadOnlyList<FlorinDeFiesta> Leer(string json)
        => JsonSerializer.Deserialize<List<FlorinDeFiesta>>(json, Json) ?? [];

    public static string Escribir(IEnumerable<FlorinDeFiesta> florines)
        => JsonSerializer.Serialize(florines, Json);

    public static EventoDto ADto(Evento e) => new(
        e.Id, e.Nombre, e.EmpiezaEn, e.TerminaEn, e.DuraSegundos, Leer(e.Florines),
        e.RegaloTier is null ? null : new FlorinDeFiesta(e.RegaloTier.Value, e.RegaloVariante),
        e.Cancelado);
}

/* ---- lo que pregunta cualquier jugador ---- */

public record GetEventoVivoQuery : IRequest<EventoVivoDto>;

public class GetEventoVivoQueryHandler(IApplicationDbContext db, ICurrentUser actual)
    : IRequestHandler<GetEventoVivoQuery, EventoVivoDto>
{
    public async Task<EventoVivoDto> Handle(GetEventoVivoQuery request, CancellationToken ct)
    {
        var ahora = DateTime.UtcNow;
        /* Una ventana corta alrededor de ahora: no hace falta traerse el
           histórico para contestar "¿hay fiesta?". */
        var cerca = await db.Eventos.AsNoTracking()
            .Where(e => !e.Cancelado && e.EmpiezaEn > ahora.AddHours(-6) && e.EmpiezaEn < ahora.AddDays(14))
            .OrderBy(e => e.EmpiezaEn)
            .ToListAsync(ct);

        var viva = cerca.FirstOrDefault(e => e.EmpiezaEn <= ahora && e.TerminaEn > ahora);
        var proxima = cerca.FirstOrDefault(e => e.EmpiezaEn > ahora);

        var pendiente = false;
        if (viva is not null && viva.RegaloTier is not null && actual.UserId is not null)
        {
            var perfil = await PerfilDeSesion.ObtenerAsync(db, actual, ct);
            pendiente = !await db.EventoRegalos
                .AnyAsync(r => r.EventoId == viva.Id && r.PerfilId == perfil.Id, ct);
        }

        return new EventoVivoDto(
            viva is null ? null : Fiestas.ADto(viva),
            viva is null ? 0 : (int)Math.Max(0, (viva.TerminaEn - ahora).TotalSeconds),
            proxima is null ? null : Fiestas.ADto(proxima),
            proxima is null ? 0 : (int)Math.Max(0, (proxima.EmpiezaEn - ahora).TotalSeconds),
            pendiente);
    }
}

/// <summary>Recoger el regalo de la fiesta viva. Una sola vez por jugador.</summary>
public record RecogerRegaloCommand(Guid EventoId) : IRequest<FlorinDeFiesta?>;

public class RecogerRegaloCommandHandler(IApplicationDbContext db, ICurrentUser actual)
    : IRequestHandler<RecogerRegaloCommand, FlorinDeFiesta?>
{
    public async Task<FlorinDeFiesta?> Handle(RecogerRegaloCommand request, CancellationToken ct)
    {
        var e = await db.Eventos.FirstOrDefaultAsync(x => x.Id == request.EventoId, ct)
                ?? throw new NotFoundException("Esa fiesta no existe.");
        var ahora = DateTime.UtcNow;
        if (e.Cancelado || e.EmpiezaEn > ahora || e.TerminaEn <= ahora)
            throw new AppException("Esa fiesta no está en marcha.");
        if (e.RegaloTier is null) return null;

        var perfil = await PerfilDeSesion.ObtenerAsync(db, actual, ct);
        var yaLoTiene = await db.EventoRegalos
            .AnyAsync(r => r.EventoId == e.Id && r.PerfilId == perfil.Id, ct);
        if (yaLoTiene) return null;               // null = no hay nada que darte

        db.EventoRegalos.Add(new EventoRegaloEntregado(e.Id, perfil.Id));
        await db.SaveChangesAsync(ct);
        return new FlorinDeFiesta(e.RegaloTier.Value, e.RegaloVariante);
    }
}

/* ---- lo que hace el admin ---- */

public record ProgramarEventoCommand(
    string Nombre, DateTime EmpiezaEn, int DuraSegundos,
    IReadOnlyList<FlorinDeFiesta> Florines, FlorinDeFiesta? Regalo) : IRequest<EventoDto>;

public class ProgramarEventoCommandValidator : AbstractValidator<ProgramarEventoCommand>
{
    public ProgramarEventoCommandValidator()
    {
        RuleFor(x => x.Nombre).NotEmpty().MaximumLength(60);
        RuleFor(x => x.DuraSegundos).InclusiveBetween(30, 6 * 60 * 60);
        RuleFor(x => x.Florines).NotEmpty().WithMessage("Elige al menos un Florín para la pasarela.");
        RuleForEach(x => x.Florines).ChildRules(f =>
        {
            // El tope sigue al catálogo del motor (TIERS): dieciséis rarezas.
            f.RuleFor(x => x.Tier).InclusiveBetween(0, 15);
        });
        RuleFor(x => x.Regalo!.Tier).InclusiveBetween(0, 15).When(x => x.Regalo is not null);
    }
}

public class ProgramarEventoCommandHandler(IApplicationDbContext db, ICurrentUser actual)
    : IRequestHandler<ProgramarEventoCommand, EventoDto>
{
    public async Task<EventoDto> Handle(ProgramarEventoCommand request, CancellationToken ct)
    {
        var evento = new Evento(
            request.Nombre, request.EmpiezaEn, request.DuraSegundos,
            Fiestas.Escribir(request.Florines),
            request.Regalo?.Tier, request.Regalo?.Variante,
            actual.UserId ?? Guid.Empty);
        db.Eventos.Add(evento);
        await db.SaveChangesAsync(ct);
        return Fiestas.ADto(evento);
    }
}

public record ListarEventosQuery : IRequest<IReadOnlyList<EventoDto>>;

public class ListarEventosQueryHandler(IApplicationDbContext db)
    : IRequestHandler<ListarEventosQuery, IReadOnlyList<EventoDto>>
{
    public async Task<IReadOnlyList<EventoDto>> Handle(ListarEventosQuery request, CancellationToken ct)
    {
        var desde = DateTime.UtcNow.AddDays(-7);
        var filas = await db.Eventos.AsNoTracking()
            .Where(e => e.EmpiezaEn > desde)
            .OrderBy(e => e.EmpiezaEn)
            .ToListAsync(ct);
        return filas.Select(Fiestas.ADto).ToList();
    }
}

public record CancelarEventoCommand(Guid Id) : IRequest;

public class CancelarEventoCommandHandler(IApplicationDbContext db)
    : IRequestHandler<CancelarEventoCommand>
{
    public async Task Handle(CancelarEventoCommand request, CancellationToken ct)
    {
        var e = await db.Eventos.FirstOrDefaultAsync(x => x.Id == request.Id, ct)
                ?? throw new NotFoundException("Esa fiesta no existe.");
        e.Cancelar();
        await db.SaveChangesAsync(ct);
    }
}
