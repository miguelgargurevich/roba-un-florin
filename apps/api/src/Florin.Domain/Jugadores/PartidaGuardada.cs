using Florin.Domain.Common;

namespace Florin.Domain.Jugadores;

/// <summary>
/// La partida en curso, guardada en la nube. `Estado` es el estado del motor
/// serializado tal cual: por eso el motor tuvo que dejar de usar referencias
/// entre objetos y pasar a ids.
///
/// Ojo: hoy el cliente es quien manda el estado, así que esto es un guardado, no
/// una verdad. Cuando el servidor corra la simulación, este mismo campo pasa a
/// escribirlo el servidor y deja de aceptarse del cliente.
/// </summary>
public class PartidaGuardada : Entity
{
    public Guid PerfilId { get; private set; }
    public string Escenario { get; private set; } = "barrio";
    public long Dinero { get; private set; }
    public int Hito { get; private set; }
    public double Segundos { get; private set; }
    public string Estado { get; private set; } = "{}";

    private PartidaGuardada() { }
    public PartidaGuardada(Guid perfilId, string escenario, long dinero, int hito, double segundos, string estado)
    {
        PerfilId = perfilId;
        Actualizar(escenario, dinero, hito, segundos, estado);
    }

    public void Actualizar(string escenario, long dinero, int hito, double segundos, string estado)
    {
        if (string.IsNullOrWhiteSpace(estado)) throw new DomainException("El estado no puede ir vacío.");
        Escenario = escenario;
        Dinero = dinero;
        Hito = hito;
        Segundos = segundos;
        Estado = estado;
        Touch();
    }
}
