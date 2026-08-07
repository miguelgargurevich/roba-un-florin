using FluentValidation;
using Florin.Application.Common.Interfaces;
using Florin.Application.Perfiles;
using Florin.Domain.Jugadores;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace Florin.Application.Album;

public record AlbumEntradaDto(int Tier, string Variante, DateTime PrimeraVez);

public record GetMiAlbumQuery : IRequest<IReadOnlyList<AlbumEntradaDto>>;

public class GetMiAlbumQueryHandler(IApplicationDbContext db, ICurrentUser actual)
    : IRequestHandler<GetMiAlbumQuery, IReadOnlyList<AlbumEntradaDto>>
{
    public async Task<IReadOnlyList<AlbumEntradaDto>> Handle(GetMiAlbumQuery request, CancellationToken ct)
    {
        var perfil = await PerfilDeSesion.ObtenerAsync(db, actual, ct);
        return await db.Album.AsNoTracking()
            .Where(a => a.PerfilId == perfil.Id)
            .OrderBy(a => a.Tier).ThenBy(a => a.Variante)
            .Select(a => new AlbumEntradaDto(a.Tier, a.Variante, a.PrimeraVez))
            .ToListAsync(ct);
    }
}

/// <summary>Registrar es idempotente: el álbum guarda la PRIMERA vez, no cuántas.</summary>
public record RegistrarEnAlbumCommand(int Tier, string? Variante) : IRequest<bool>;

public class RegistrarEnAlbumCommandValidator : AbstractValidator<RegistrarEnAlbumCommand>
{
    private static readonly string[] Variantes = ["base", "brillante", "arcoiris"];

    public RegistrarEnAlbumCommandValidator()
    {
        RuleFor(x => x.Tier).InclusiveBetween(0, 6);
        RuleFor(x => x.Variante!).Must(v => Variantes.Contains(v))
            .When(x => x.Variante is not null)
            .WithMessage("Esa variante no existe.");
    }
}

public class RegistrarEnAlbumCommandHandler(IApplicationDbContext db, ICurrentUser actual)
    : IRequestHandler<RegistrarEnAlbumCommand, bool>
{
    public async Task<bool> Handle(RegistrarEnAlbumCommand request, CancellationToken ct)
    {
        var perfil = await PerfilDeSesion.ObtenerAsync(db, actual, ct);
        var variante = string.IsNullOrWhiteSpace(request.Variante) ? "base" : request.Variante;

        var yaEstaba = await db.Album.AnyAsync(
            a => a.PerfilId == perfil.Id && a.Tier == request.Tier && a.Variante == variante, ct);
        if (yaEstaba) return false;

        db.Album.Add(new AlbumEntrada(perfil.Id, request.Tier, variante));
        await db.SaveChangesAsync(ct);
        return true;                    // true = era nuevo en el álbum
    }
}
