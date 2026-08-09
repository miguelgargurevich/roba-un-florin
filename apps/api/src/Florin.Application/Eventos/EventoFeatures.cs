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

public record AnuncioDto(Guid Id, string Texto, DateTime EmpiezaEn, DateTime TerminaEn,
                         int DuraSegundos, bool Cancelado);

/// <summary>Lo que ve el cliente: la fiesta de AHORA, la siguiente si no hay, y
/// el aviso que el admin tenga puesto. Todo en la MISMA respuesta: los clientes
/// ya preguntan por esto cada minuto y no hacía falta un sondeo más.</summary>
public record EventoVivoDto(EventoDto? Ahora, int SegundosQueQuedan, EventoDto? Siguiente,
                            int SegundosParaLaSiguiente, bool RegaloPendiente,
                            AnuncioDto? Anuncio, int SegundosDeAnuncio);

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

        /* El aviso más reciente que esté vivo: si el admin manda dos seguidos,
           manda el último — corregir un mensaje es escribir otro. */
        var aviso = await db.Anuncios.AsNoTracking()
            .Where(a => !a.Cancelado && a.EmpiezaEn <= ahora)
            .OrderByDescending(a => a.EmpiezaEn)
            .FirstOrDefaultAsync(a => a.EmpiezaEn.AddSeconds(a.DuraSegundos) > ahora, ct);

        return new EventoVivoDto(
            viva is null ? null : Fiestas.ADto(viva),
            viva is null ? 0 : (int)Math.Max(0, (viva.TerminaEn - ahora).TotalSeconds),
            proxima is null ? null : Fiestas.ADto(proxima),
            proxima is null ? 0 : (int)Math.Max(0, (proxima.EmpiezaEn - ahora).TotalSeconds),
            pendiente,
            aviso is null ? null : Avisos.ADto(aviso),
            aviso is null ? 0 : (int)Math.Max(0, (aviso.TerminaEn - ahora).TotalSeconds));
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


/* ---- los avisos del admin ---- */

internal static class Avisos
{
    public static AnuncioDto ADto(Anuncio a) =>
        new(a.Id, a.Texto, a.EmpiezaEn, a.TerminaEn, a.DuraSegundos, a.Cancelado);
}

public record EnviarAnuncioCommand(string Texto, int DuraSegundos, DateTime? EmpiezaEn)
    : IRequest<AnuncioDto>;

public class EnviarAnuncioCommandValidator : AbstractValidator<EnviarAnuncioCommand>
{
    public EnviarAnuncioCommandValidator()
    {
        RuleFor(x => x.Texto).NotEmpty().MaximumLength(280);
        RuleFor(x => x.DuraSegundos).InclusiveBetween(10, 24 * 60 * 60);
    }
}

public class EnviarAnuncioCommandHandler(IApplicationDbContext db, ICurrentUser actual)
    : IRequestHandler<EnviarAnuncioCommand, AnuncioDto>
{
    public async Task<AnuncioDto> Handle(EnviarAnuncioCommand request, CancellationToken ct)
    {
        var a = new Anuncio(request.Texto, request.EmpiezaEn, request.DuraSegundos,
                            actual.UserId ?? Guid.Empty);
        db.Anuncios.Add(a);
        await db.SaveChangesAsync(ct);
        return Avisos.ADto(a);
    }
}

public record ListarAnunciosQuery : IRequest<IReadOnlyList<AnuncioDto>>;

public class ListarAnunciosQueryHandler(IApplicationDbContext db)
    : IRequestHandler<ListarAnunciosQuery, IReadOnlyList<AnuncioDto>>
{
    public async Task<IReadOnlyList<AnuncioDto>> Handle(ListarAnunciosQuery request, CancellationToken ct)
    {
        var desde = DateTime.UtcNow.AddDays(-3);
        var filas = await db.Anuncios.AsNoTracking()
            .Where(a => a.EmpiezaEn > desde)
            .OrderByDescending(a => a.EmpiezaEn)
            .Take(20)
            .ToListAsync(ct);
        return filas.Select(Avisos.ADto).ToList();
    }
}

public record CancelarAnuncioCommand(Guid Id) : IRequest;

public class CancelarAnuncioCommandHandler(IApplicationDbContext db)
    : IRequestHandler<CancelarAnuncioCommand>
{
    public async Task Handle(CancelarAnuncioCommand request, CancellationToken ct)
    {
        var a = await db.Anuncios.FirstOrDefaultAsync(x => x.Id == request.Id, ct)
                ?? throw new NotFoundException("Ese aviso no existe.");
        a.Cancelar();
        await db.SaveChangesAsync(ct);
    }
}
