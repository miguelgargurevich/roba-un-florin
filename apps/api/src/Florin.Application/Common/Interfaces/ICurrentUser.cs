namespace Florin.Application.Common.Interfaces;

public interface ICurrentUser
{
    Guid? UserId { get; }
    string? Email { get; }
    /// <summary>Cómo se llama en el juego. Viene en el token, no hace falta ir a la base.</summary>
    string? Apodo { get; }
    IReadOnlyCollection<string> Roles { get; }
    IReadOnlyCollection<string> Permissions { get; }
    bool IsAuthenticated { get; }
    bool HasPermission(string permission);
}
