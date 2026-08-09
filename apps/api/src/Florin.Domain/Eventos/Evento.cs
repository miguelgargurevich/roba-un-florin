using Florin.Domain.Common;

namespace Florin.Domain.Eventos;

/// <summary>
/// Una fiesta programada: a tal hora, durante tantos minutos, la pasarela de
/// todos los que estén jugando trae los Florines que eligió el admin.
///
/// `Florines` va como JSON y no como filas aparte a propósito: es una lista
/// corta que solo se lee entera, nunca se consulta por partes, y así crear un
/// evento es una sola escritura.
/// </summary>
public class Evento : Entity
{
    public string Nombre { get; private set; } = null!;
    public DateTime EmpiezaEn { get; private set; }
    public int DuraSegundos { get; private set; }
    /// <summary>`[{"tier":15,"variante":"galaxia"}, …]`, lo que baja por la pasarela.</summary>
    public string Florines { get; private set; } = "[]";
    /// <summary>El de regalo para todo el que se conecte, o null si no hay.</summary>
    public int? RegaloTier { get; private set; }
    public string? RegaloVariante { get; private set; }
    public bool Cancelado { get; private set; }
    public Guid CreadoPor { get; private set; }

    public DateTime TerminaEn => EmpiezaEn.AddSeconds(DuraSegundos);

    private Evento() { }

    public Evento(string nombre, DateTime empiezaEn, int duraSegundos, string florines,
                  int? regaloTier, string? regaloVariante, Guid creadoPor)
    {
        if (string.IsNullOrWhiteSpace(nombre)) throw new DomainException("La fiesta necesita un nombre.");
        if (duraSegundos < 30) throw new DomainException("Una fiesta de menos de medio minuto no la ve nadie.");
        if (string.IsNullOrWhiteSpace(florines) || florines == "[]")
            throw new DomainException("Elige al menos un Florín para la pasarela.");
        Nombre = nombre.Trim();
        /* En UTC siempre: el cliente convierte a la hora del que mira. Guardarlo
           en hora local haría que el mismo evento empezara a horas distintas
           según dónde corra el servidor. */
        EmpiezaEn = empiezaEn.ToUniversalTime();
        DuraSegundos = duraSegundos;
        Florines = florines;
        RegaloTier = regaloTier;
        RegaloVariante = regaloVariante;
        CreadoPor = creadoPor;
    }

    public void Cancelar() { Cancelado = true; Touch(); }
}

/// <summary>
/// Que este perfil ya recogió el regalo de este evento. Existe para que el
/// regalo sea UNA vez y no una por recarga de página.
/// </summary>
public class EventoRegaloEntregado : Entity
{
    public Guid EventoId { get; private set; }
    public Guid PerfilId { get; private set; }
    public DateTime Cuando { get; private set; } = DateTime.UtcNow;

    private EventoRegaloEntregado() { }
    public EventoRegaloEntregado(Guid eventoId, Guid perfilId)
    {
        EventoId = eventoId;
        PerfilId = perfilId;
    }
}
