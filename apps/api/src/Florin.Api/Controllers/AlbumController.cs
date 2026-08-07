using Florin.Application.Album;
using Florin.Domain.Identity;
using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Florin.Api.Controllers;

[ApiController]
[Route("api/v1/album")]
[Authorize]
public class AlbumController(ISender mediator) : ControllerBase
{
    [HttpGet]
    [Authorize(Policy = Permissions.AlbumLeer)]
    public async Task<IActionResult> Mio(CancellationToken ct)
        => Ok(await mediator.Send(new GetMiAlbumQuery(), ct));

    [HttpPost]
    [Authorize(Policy = Permissions.AlbumRegistrar)]
    public async Task<IActionResult> Registrar(RegistrarEnAlbumCommand command, CancellationToken ct)
        => Ok(new { nuevo = await mediator.Send(command, ct) });
}
