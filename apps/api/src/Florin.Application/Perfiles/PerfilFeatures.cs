using FluentValidation;
using Florin.Application.Common;
using Florin.Application.Common.Interfaces;
using Florin.Domain.Jugadores;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace Florin.Application.Perfiles;

public record PerfilDto(Guid Id, string Apodo, string EscenarioPreferido, bool Zurdo,
    int MejorHito, long MejorDinero, int PartidasJugadas);

/// <summary>
/// Todo lo de perfil trabaja siempre sobre el perfil de QUIEN LLAMA, sacado del
/// token. No hay endpoint que reciba un id de perfil ajeno: así no hay forma de
/// leer ni tocar el de otro.
/// </summary>
public static class PerfilDeSesion
{
    public static async Task<PerfilJugador> ObtenerAsync(
        IApplicationDbContext db, ICurrentUser actual, CancellationToken ct)
    {
        var userId = actual.UserId ?? throw new UnauthorizedAppException("No autenticado.");
        return await db.Perfiles.FirstOrDefaultAsync(p => p.UserId == userId, ct)
            ?? throw new NotFoundException("Este usuario todavía no tiene perfil.");
    }
}

/* ---- leer el perfil propio ---- */
public record GetMiPerfilQuery : IRequest<PerfilDto>;

public class GetMiPerfilQueryHandler(IApplicationDbContext db, ICurrentUser actual)
    : IRequestHandler<GetMiPerfilQuery, PerfilDto>
{
    public async Task<PerfilDto> Handle(GetMiPerfilQuery request, CancellationToken ct)
    {
        var p = await PerfilDeSesion.ObtenerAsync(db, actual, ct);
        return new PerfilDto(p.Id, p.Apodo, p.EscenarioPreferido, p.Zurdo,
            p.MejorHito, p.MejorDinero, p.PartidasJugadas);
    }
}

/* ---- editarlo ---- */
public record EditarPerfilCommand(string Apodo, string EscenarioPreferido, bool Zurdo) : IRequest<PerfilDto>;

public class EditarPerfilCommandValidator : AbstractValidator<EditarPerfilCommand>
{
    private static readonly string[] Escenarios = ["barrio", "colegio", "playa", "desierto"];

    public EditarPerfilCommandValidator()
    {
        RuleFor(x => x.Apodo).NotEmpty().MinimumLength(3).MaximumLength(24);
        RuleFor(x => x.EscenarioPreferido).Must(e => Escenarios.Contains(e))
            .WithMessage("Ese escenario no existe.");
    }
}

public class EditarPerfilCommandHandler(IApplicationDbContext db, ICurrentUser actual)
    : IRequestHandler<EditarPerfilCommand, PerfilDto>
{
    public async Task<PerfilDto> Handle(EditarPerfilCommand request, CancellationToken ct)
    {
        var p = await PerfilDeSesion.ObtenerAsync(db, actual, ct);
        var apodo = request.Apodo.Trim();
        if (await db.Perfiles.AnyAsync(o => o.Apodo == apodo && o.Id != p.Id, ct))
            throw new AppException("Ese apodo ya está tomado.");

        p.Editar(apodo, request.EscenarioPreferido, request.Zurdo);
        await db.SaveChangesAsync(ct);
        return new PerfilDto(p.Id, p.Apodo, p.EscenarioPreferido, p.Zurdo,
            p.MejorHito, p.MejorDinero, p.PartidasJugadas);
    }
}

/* ---- ranking: lo único que mira perfiles ajenos, y solo lo público ---- */
public record RankingItemDto(string Apodo, long MejorDinero, int MejorHito);
public record GetRankingQuery(int Page = 1, int PageSize = 20) : IRequest<PagedResult<RankingItemDto>>;

public class GetRankingQueryHandler(IApplicationDbContext db)
    : IRequestHandler<GetRankingQuery, PagedResult<RankingItemDto>>
{
    public async Task<PagedResult<RankingItemDto>> Handle(GetRankingQuery request, CancellationToken ct)
    {
        var (page, size) = PagedResult<RankingItemDto>.Normalize(request.Page, request.PageSize);
        var q = db.Perfiles.AsNoTracking().Where(p => p.MejorDinero > 0);
        var total = await q.CountAsync(ct);
        var items = await q.OrderByDescending(p => p.MejorDinero)
            .Skip((page - 1) * size).Take(size)
            .Select(p => new RankingItemDto(p.Apodo, p.MejorDinero, p.MejorHito))
            .ToListAsync(ct);
        return new PagedResult<RankingItemDto>(items, total, page, size);
    }
}
