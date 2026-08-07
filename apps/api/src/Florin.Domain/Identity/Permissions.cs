namespace Florin.Domain.Identity;

/// <summary>
/// Catálogo de permisos: fuente única de la que salen las policies del host, las
/// filas sembradas en la base y los atributos [Authorize(Policy = ...)].
/// </summary>
public static class Permissions
{
    public const string PerfilLeer     = "perfil.leer";
    public const string PerfilEditar   = "perfil.editar";
    public const string PartidaLeer    = "partida.leer";
    public const string PartidaGuardar = "partida.guardar";
    public const string AlbumLeer      = "album.leer";
    public const string AlbumRegistrar = "album.registrar";
    public const string UsersManage    = "users.manage";

    public static readonly IReadOnlyDictionary<string, string> All = new Dictionary<string, string>
    {
        [PerfilLeer]     = "Ver el perfil propio",
        [PerfilEditar]   = "Editar el perfil propio",
        [PartidaLeer]    = "Leer la partida guardada",
        [PartidaGuardar] = "Guardar la partida en la nube",
        [AlbumLeer]      = "Ver el álbum de Florines",
        [AlbumRegistrar] = "Registrar un Florín en el álbum",
        [UsersManage]    = "Administrar usuarios, roles y permisos",
    };

    /// <summary>Lo que se le da a cualquiera que se registra a jugar.</summary>
    public static readonly string[] DeJugador =
        [PerfilLeer, PerfilEditar, PartidaLeer, PartidaGuardar, AlbumLeer, AlbumRegistrar];
}

public static class Roles
{
    public const string Jugador = "jugador";
    public const string Admin   = "admin";
}
