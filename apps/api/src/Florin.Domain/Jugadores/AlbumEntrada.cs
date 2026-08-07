using Florin.Domain.Common;

namespace Florin.Domain.Jugadores;

/// <summary>
/// Un Florín que este jugador llegó a tener alguna vez. Filas y no un JSON,
/// porque el álbum es justo lo que se va a querer consultar y comparar entre
/// jugadores más adelante.
/// </summary>
public class AlbumEntrada : Entity
{
    public Guid PerfilId { get; private set; }
    public int Tier { get; private set; }
    /// <summary>"base", "brillante" o "arcoiris".</summary>
    public string Variante { get; private set; } = "base";
    public DateTime PrimeraVez { get; private set; } = DateTime.UtcNow;

    private AlbumEntrada() { }
    public AlbumEntrada(Guid perfilId, int tier, string? variante)
    {
        if (tier < 0) throw new DomainException("Rareza inválida.");
        PerfilId = perfilId;
        Tier = tier;
        Variante = string.IsNullOrWhiteSpace(variante) ? "base" : variante;
    }
}
