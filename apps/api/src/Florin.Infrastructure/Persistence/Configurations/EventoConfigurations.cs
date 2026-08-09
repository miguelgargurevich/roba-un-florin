using Florin.Domain.Eventos;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Florin.Infrastructure.Persistence.Configurations;

public class EventoConfiguration : IEntityTypeConfiguration<Evento>
{
    public void Configure(EntityTypeBuilder<Evento> b)
    {
        b.ToTable("eventos");
        b.HasKey(x => x.Id);
        b.Property(x => x.Nombre).HasMaxLength(60).IsRequired();
        b.Property(x => x.Florines).HasColumnType("jsonb").IsRequired();
        b.Property(x => x.RegaloVariante).HasMaxLength(20);
        // La consulta de siempre es "¿hay fiesta ahora?": por hora de inicio.
        b.HasIndex(x => x.EmpiezaEn);
    }
}

public class EventoRegaloEntregadoConfiguration : IEntityTypeConfiguration<EventoRegaloEntregado>
{
    public void Configure(EntityTypeBuilder<EventoRegaloEntregado> b)
    {
        b.ToTable("evento_regalos");
        b.HasKey(x => x.Id);
        // Uno por fiesta y por jugador: es lo que hace que el regalo no se
        // pueda repetir recargando la página.
        b.HasIndex(x => new { x.EventoId, x.PerfilId }).IsUnique();
    }
}
