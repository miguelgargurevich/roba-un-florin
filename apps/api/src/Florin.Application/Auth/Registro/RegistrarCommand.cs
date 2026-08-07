using FluentValidation;
using Florin.Application.Common;
using Florin.Application.Common.Interfaces;
using Florin.Domain.Identity;
using Florin.Domain.Jugadores;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace Florin.Application.Auth.Registro;

/// <summary>
/// Un juego necesita que la gente se pueda registrar sola. Al hacerlo se crea la
/// cuenta, se le da el rol de jugador y se le monta el perfil de una vez: así
/// nunca existe una cuenta sin perfil.
/// </summary>
public record RegistrarCommand(string Email, string Password, string Apodo) : IRequest<AuthResponse>;

public class RegistrarCommandValidator : AbstractValidator<RegistrarCommand>
{
    public RegistrarCommandValidator()
    {
        RuleFor(x => x.Email).NotEmpty().EmailAddress().MaximumLength(160);
        RuleFor(x => x.Password).NotEmpty().MinimumLength(8).MaximumLength(128)
            .WithMessage("La contraseña debe tener al menos 8 caracteres.");
        RuleFor(x => x.Apodo).NotEmpty().MinimumLength(3).MaximumLength(24);
    }
}

public class RegistrarCommandHandler(
    IApplicationDbContext db, IPasswordHasher hasher, IJwtTokenGenerator jwt, IJwtSettings settings)
    : IRequestHandler<RegistrarCommand, AuthResponse>
{
    public async Task<AuthResponse> Handle(RegistrarCommand request, CancellationToken ct)
    {
        var email = request.Email.Trim().ToLowerInvariant();
        if (await db.Users.AnyAsync(u => u.Email == email, ct))
            throw new AppException("Ya hay una cuenta con ese correo.");

        var apodo = request.Apodo.Trim();
        if (await db.Perfiles.AnyAsync(p => p.Apodo == apodo, ct))
            throw new AppException("Ese apodo ya está tomado.");

        var user = new User(email, hasher.Hash(request.Password), apodo);
        db.Users.Add(user);

        var rolJugador = await db.Roles.FirstOrDefaultAsync(r => r.Code == Roles.Jugador, ct)
            ?? throw new AppException("Falta el rol de jugador: la base no está sembrada.");
        db.UserRoles.Add(new UserRole(user.Id, rolJugador.Id));
        db.Perfiles.Add(new PerfilJugador(user.Id, apodo));

        await db.SaveChangesAsync(ct);
        return await AuthQueries.EmitirAsync(db, jwt, settings, user, ct);
    }
}
