using Florin.Domain.Jugadores;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Florin.Infrastructure.Persistence.Configurations;

public class PerfilJugadorConfiguration : IEntityTypeConfiguration<PerfilJugador>
{
    public void Configure(EntityTypeBuilder<PerfilJugador> b)
    {
        b.ToTable("perfiles");
        b.HasKey(x => x.Id);
        b.Property(x => x.Apodo).HasMaxLength(24).IsRequired();
        b.Property(x => x.EscenarioPreferido).HasMaxLength(20).IsRequired();
        b.HasIndex(x => x.UserId).IsUnique();     // un perfil por cuenta
        b.HasIndex(x => x.Apodo).IsUnique();
        b.HasIndex(x => x.MejorDinero);           // lo ordena el ranking
    }
}

public class PartidaGuardadaConfiguration : IEntityTypeConfiguration<PartidaGuardada>
{
    public void Configure(EntityTypeBuilder<PartidaGuardada> b)
    {
        b.ToTable("partidas");
        b.HasKey(x => x.Id);
        b.Property(x => x.Escenario).HasMaxLength(20).IsRequired();
        // El estado del motor va como jsonb: es JSON de verdad y algún día se
        // querrá consultar por dentro sin sacarlo entero.
        b.Property(x => x.Estado).HasColumnType("jsonb").IsRequired();
        b.HasIndex(x => x.PerfilId).IsUnique();   // una partida en curso por jugador
    }
}

public class AlbumEntradaConfiguration : IEntityTypeConfiguration<AlbumEntrada>
{
    public void Configure(EntityTypeBuilder<AlbumEntrada> b)
    {
        b.ToTable("album");
        b.HasKey(x => x.Id);
        b.Property(x => x.Variante).HasMaxLength(20).IsRequired();
        // La combinación es única: el álbum guarda la primera vez, no cuántas.
        b.HasIndex(x => new { x.PerfilId, x.Tier, x.Variante }).IsUnique();
    }
}
