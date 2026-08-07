using Florin.Domain.Common;

namespace Florin.Domain.Jugadores;

/// <summary>
/// Lo que el juego sabe de una persona más allá de su cuenta: cómo se hace
/// llamar, hasta dónde llegó y qué escenario prefiere.
/// </summary>
public class PerfilJugador : Entity
{
    public Guid UserId { get; private set; }
    public string Apodo { get; private set; } = null!;
    public string EscenarioPreferido { get; private set; } = "barrio";
    /// <summary>El hito más alto alcanzado alguna vez; no baja aunque empieces de nuevo.</summary>
    public int MejorHito { get; private set; }
    /// <summary>El dinero más alto alcanzado alguna vez. Lo usa el ranking.</summary>
    public long MejorDinero { get; private set; }
    public int PartidasJugadas { get; private set; }
    public bool Zurdo { get; private set; }

    private PerfilJugador() { }
    public PerfilJugador(Guid userId, string apodo)
    {
        UserId = userId;
        Apodo = apodo.Trim();
    }

    public void Editar(string apodo, string escenarioPreferido, bool zurdo)
    {
        if (string.IsNullOrWhiteSpace(apodo)) throw new DomainException("El apodo no puede estar vacío.");
        Apodo = apodo.Trim();
        EscenarioPreferido = escenarioPreferido;
        Zurdo = zurdo;
        Touch();
    }

    /// <summary>Las marcas solo suben: reiniciar una partida no borra lo logrado.</summary>
    public void RegistrarMarcas(long dinero, int hito)
    {
        if (dinero > MejorDinero) MejorDinero = dinero;
        if (hito > MejorHito) MejorHito = hito;
        Touch();
    }

    public void ContarPartida() { PartidasJugadas++; Touch(); }
}
