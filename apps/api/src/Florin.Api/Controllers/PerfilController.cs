using Florin.Application.Perfiles;
using Florin.Domain.Identity;
using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Florin.Api.Controllers;

[ApiController]
[Route("api/v1/perfil")]
[Authorize]
public class PerfilController(ISender mediator) : ControllerBase
{
    [HttpGet]
    [Authorize(Policy = Permissions.PerfilLeer)]
    public async Task<IActionResult> Mio(CancellationToken ct)
        => Ok(await mediator.Send(new GetMiPerfilQuery(), ct));

    [HttpPut]
    [Authorize(Policy = Permissions.PerfilEditar)]
    public async Task<IActionResult> Editar(EditarPerfilCommand command, CancellationToken ct)
        => Ok(await mediator.Send(command, ct));

    [HttpGet("ranking")]
    [AllowAnonymous]
    public async Task<IActionResult> Ranking([FromQuery] int page, [FromQuery] int pageSize, CancellationToken ct)
        => Ok(await mediator.Send(new GetRankingQuery(page == 0 ? 1 : page, pageSize == 0 ? 20 : pageSize), ct));
}
