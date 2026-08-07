using Florin.Application.Partidas;
using Florin.Domain.Identity;
using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Florin.Api.Controllers;

[ApiController]
[Route("api/v1/partida")]
[Authorize]
public class PartidaController(ISender mediator) : ControllerBase
{
    [HttpGet]
    [Authorize(Policy = Permissions.PartidaLeer)]
    public async Task<IActionResult> Mia(CancellationToken ct)
    {
        var partida = await mediator.Send(new GetMiPartidaQuery(), ct);
        return partida is null ? NoContent() : Ok(partida);
    }

    [HttpPut]
    [Authorize(Policy = Permissions.PartidaGuardar)]
    public async Task<IActionResult> Guardar(GuardarPartidaCommand command, CancellationToken ct)
    {
        await mediator.Send(command, ct);
        return NoContent();
    }
}
