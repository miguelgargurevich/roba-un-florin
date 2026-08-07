using FluentValidation;
using Florin.Application.Common;
using Florin.Application.Common.Interfaces;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace Florin.Application.Auth.Refresh;

public record RefreshTokenCommand(string RefreshToken) : IRequest<AuthResponse>;

public class RefreshTokenCommandValidator : AbstractValidator<RefreshTokenCommand>
{
    public RefreshTokenCommandValidator() => RuleFor(x => x.RefreshToken).NotEmpty();
}

public class RefreshTokenCommandHandler(
    IApplicationDbContext db, IJwtTokenGenerator jwt, IJwtSettings settings)
    : IRequestHandler<RefreshTokenCommand, AuthResponse>
{
    public async Task<AuthResponse> Handle(RefreshTokenCommand request, CancellationToken ct)
    {
        var token = await db.RefreshTokens.FirstOrDefaultAsync(t => t.Token == request.RefreshToken, ct);
        if (token is null || !token.IsActive)
            throw new UnauthorizedAppException("Sesión inválida o expirada.");

        var user = await db.Users.FirstOrDefaultAsync(u => u.Id == token.UserId, ct);
        if (user is null || !user.IsActive) throw new UnauthorizedAppException("Usuario no disponible.");

        token.Revoke();                       // rotación: el usado no vale más
        return await AuthQueries.EmitirAsync(db, jwt, settings, user, ct);
    }
}
