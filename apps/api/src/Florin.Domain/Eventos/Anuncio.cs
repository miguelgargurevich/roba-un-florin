using Florin.Domain.Common;

namespace Florin.Domain.Eventos;

/// <summary>
/// Un mensaje del admin a todo el que esté con el juego abierto: "en cinco
/// minutos empieza", "servidor en mantenimiento", "gracias por jugar".
///
/// Vive aparte de <see cref="Evento"/> aunque viaje en la misma respuesta: un
/// aviso no reparte Florines ni cambia la pasarela, solo se lee. Mezclarlos
/// habría obligado a inventar una fiesta vacía cada vez que hay algo que decir.
/// </summary>
public class Anuncio : Entity
{
    public string Texto { get; private set; } = null!;
    public DateTime EmpiezaEn { get; private set; }
    public int DuraSegundos { get; private set; }
    public bool Cancelado { get; private set; }
    public Guid CreadoPor { get; private set; }

    public DateTime TerminaEn => EmpiezaEn.AddSeconds(DuraSegundos);

    private Anuncio() { }

    public Anuncio(string texto, DateTime? empiezaEn, int duraSegundos, Guid creadoPor)
    {
        if (string.IsNullOrWhiteSpace(texto)) throw new DomainException("Un aviso vacío no dice nada.");
        if (duraSegundos < 10) throw new DomainException("Menos de diez segundos no lo lee nadie.");
        Texto = texto.Trim();
        // Sin hora, ahora mismo: lo normal al escribir un aviso es mandarlo ya.
        EmpiezaEn = (empiezaEn ?? DateTime.UtcNow).ToUniversalTime();
        DuraSegundos = duraSegundos;
        CreadoPor = creadoPor;
    }

    public void Cancelar() { Cancelado = true; Touch(); }
}
