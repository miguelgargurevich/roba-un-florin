using System.Text.Json;
using System.Text.Json.Serialization;
using Florin.Application.Common;

namespace Florin.Api.Middleware;

public class ExceptionHandlingMiddleware(RequestDelegate next, ILogger<ExceptionHandlingMiddleware> logger)
{
    public async Task InvokeAsync(HttpContext context)
    {
        try { await next(context); }
        catch (Exception ex) { await HandleAsync(context, ex); }
    }

    private async Task HandleAsync(HttpContext context, Exception ex)
    {
        var (status, title, errors) = ex switch
        {
            ValidationAppException v   => (StatusCodes.Status400BadRequest, v.Message, v.Errors),
            AppException a             => (StatusCodes.Status400BadRequest, a.Message, null),
            NotFoundException n        => (StatusCodes.Status404NotFound, n.Message, null),
            UnauthorizedAppException u => (StatusCodes.Status401Unauthorized, u.Message, null),
            ForbiddenAppException f    => (StatusCodes.Status403Forbidden, f.Message, null),
            _ => (StatusCodes.Status500InternalServerError, "Ocurrió un error inesperado.",
                  (IDictionary<string, string[]>?)null),
        };

        // Los 500 se registran enteros, pero al cliente solo le llega el título:
        // los detalles de un fallo interno no salen por la API.
        if (status == StatusCodes.Status500InternalServerError) logger.LogError(ex, "Error no controlado");

        context.Response.StatusCode = status;
        context.Response.ContentType = "application/json";
        var payload = JsonSerializer.Serialize(new { status, title, errors },
            new JsonSerializerOptions { DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull });
        await context.Response.WriteAsync(payload);
    }
}
