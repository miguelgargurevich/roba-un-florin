using Florin.Application.Eventos;
using Florin.Domain.Identity;
using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Florin.Api.Controllers;

/// <summary>
/// Las fiestas. Consultar la de ahora lo puede hacer cualquiera —hasta sin
/// cuenta, porque el juego se puede jugar sin registrarse—; programarlas, solo
/// quien tenga el permiso.
/// </summary>
[ApiController]
[Route("api/v1/eventos")]
public class EventosController(ISender mediator) : ControllerBase
{
    [HttpGet("vivo")]
    [AllowAnonymous]
    public async Task<IActionResult> Vivo(CancellationToken ct)
        => Ok(await mediator.Send(new GetEventoVivoQuery(), ct));

    [HttpPost("{id:guid}/regalo")]
    [Authorize]
    public async Task<IActionResult> Regalo(Guid id, CancellationToken ct)
        => Ok(new { florin = await mediator.Send(new RecogerRegaloCommand(id), ct) });

    [HttpGet]
    [Authorize(Policy = Permissions.EventosGestion)]
    public async Task<IActionResult> Listar(CancellationToken ct)
        => Ok(await mediator.Send(new ListarEventosQuery(), ct));

    [HttpPost]
    [Authorize(Policy = Permissions.EventosGestion)]
    public async Task<IActionResult> Programar(ProgramarEventoCommand command, CancellationToken ct)
        => Ok(await mediator.Send(command, ct));

    [HttpDelete("{id:guid}")]
    [Authorize(Policy = Permissions.EventosGestion)]
    public async Task<IActionResult> Cancelar(Guid id, CancellationToken ct)
    {
        await mediator.Send(new CancelarEventoCommand(id), ct);
        return NoContent();
    }

    /* Los avisos. Van bajo /eventos porque salen por la misma puerta —el
       `GET vivo` los trae con la fiesta— y los gobierna el mismo permiso. */

    [HttpPost("anuncios")]
    [Authorize(Policy = Permissions.EventosGestion)]
    public async Task<IActionResult> Anunciar(EnviarAnuncioCommand command, CancellationToken ct)
        => Ok(await mediator.Send(command, ct));

    [HttpGet("anuncios")]
    [Authorize(Policy = Permissions.EventosGestion)]
    public async Task<IActionResult> ListarAnuncios(CancellationToken ct)
        => Ok(await mediator.Send(new ListarAnunciosQuery(), ct));

    [HttpDelete("anuncios/{id:guid}")]
    [Authorize(Policy = Permissions.EventosGestion)]
    public async Task<IActionResult> CancelarAnuncio(Guid id, CancellationToken ct)
    {
        await mediator.Send(new CancelarAnuncioCommand(id), ct);
        return NoContent();
    }
}
