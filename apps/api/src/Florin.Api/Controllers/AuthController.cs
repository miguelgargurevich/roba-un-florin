using Florin.Application.Auth;
using Florin.Application.Auth.Login;
using Florin.Application.Auth.Refresh;
using Florin.Application.Auth.Registro;
using Florin.Application.Common.Interfaces;
using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;

namespace Florin.Api.Controllers;

[ApiController]
[Route("api/v1/auth")]
public class AuthController(ISender mediator) : ControllerBase
{
    [HttpPost("registro")]
    [AllowAnonymous]
    [EnableRateLimiting("auth")]
    public async Task<IActionResult> Registro(RegistrarCommand command, CancellationToken ct)
        => Ok(await mediator.Send(command, ct));

    [HttpPost("login")]
    [AllowAnonymous]
    [EnableRateLimiting("auth")]
    public async Task<IActionResult> Login(LoginCommand command, CancellationToken ct)
        => Ok(await mediator.Send(command, ct));

    [HttpPost("refresh")]
    [AllowAnonymous]
    [EnableRateLimiting("auth")]
    public async Task<IActionResult> Refresh(RefreshTokenCommand command, CancellationToken ct)
        => Ok(await mediator.Send(command, ct));

    [HttpGet("me")]
    [Authorize]
    public IActionResult Me([FromServices] ICurrentUser actual)
        => Ok(new UserDto(actual.UserId!.Value, actual.Email ?? "", actual.Apodo ?? "",
            actual.Roles, actual.Permissions));
}
