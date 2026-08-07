using FluentValidation;
using Florin.Application.Common;
using Florin.Application.Common.Interfaces;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace Florin.Application.Auth.Login;

public record LoginCommand(string Email, string Password) : IRequest<AuthResponse>;

public class LoginCommandValidator : AbstractValidator<LoginCommand>
{
    public LoginCommandValidator()
    {
        RuleFor(x => x.Email).NotEmpty().EmailAddress().MaximumLength(160);
        RuleFor(x => x.Password).NotEmpty();
    }
}

public class LoginCommandHandler(
    IApplicationDbContext db, IPasswordHasher hasher, IJwtTokenGenerator jwt, IJwtSettings settings)
    : IRequestHandler<LoginCommand, AuthResponse>
{
    public async Task<AuthResponse> Handle(LoginCommand request, CancellationToken ct)
    {
        var email = request.Email.Trim().ToLowerInvariant();
        var user = await db.Users.FirstOrDefaultAsync(u => u.Email == email, ct);

        // Mismo mensaje para "no existe" y "password mala": no se le dice a nadie
        // qué correos están registrados.
        if (user is null || !hasher.Verify(request.Password, user.PasswordHash))
            throw new UnauthorizedAppException("Correo o contraseña incorrectos.");
        if (!user.IsActive) throw new UnauthorizedAppException("Esta cuenta está deshabilitada.");

        return await AuthQueries.EmitirAsync(db, jwt, settings, user, ct);
    }
}
