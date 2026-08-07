namespace Florin.Application.Common;

public class AppException(string message) : Exception(message);               // → 400
public class NotFoundException(string message) : Exception(message);          // → 404
public class UnauthorizedAppException(string message) : Exception(message);   // → 401
public class ForbiddenAppException(string message) : Exception(message);      // → 403

public class ValidationAppException(IDictionary<string, string[]> errors)     // → 400 con detalle
    : Exception("Se encontraron uno o más errores de validación.")
{
    public IDictionary<string, string[]> Errors { get; } = errors;
}
