namespace Florin.Application.Auth;

/// <summary>
/// Lo que el cliente sabe de su propia sesión. Aquí no hay nombre y apellido: en
/// el juego a uno lo conocen por el apodo, que es lo que guarda `User.FullName`.
/// </summary>
public record UserDto(Guid Id, string Email, string Apodo,
    IReadOnlyCollection<string> Roles, IReadOnlyCollection<string> Permissions);

public record AuthResponse(string AccessToken, string RefreshToken, DateTime ExpiresAt,
    bool MustChangePassword, UserDto User);
