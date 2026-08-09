using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Florin.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class Eventos : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "evento_regalos",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    EventoId = table.Column<Guid>(type: "uuid", nullable: false),
                    PerfilId = table.Column<Guid>(type: "uuid", nullable: false),
                    Cuando = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_evento_regalos", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "eventos",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    Nombre = table.Column<string>(type: "character varying(60)", maxLength: 60, nullable: false),
                    EmpiezaEn = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    DuraSegundos = table.Column<int>(type: "integer", nullable: false),
                    Florines = table.Column<string>(type: "jsonb", nullable: false),
                    RegaloTier = table.Column<int>(type: "integer", nullable: true),
                    RegaloVariante = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: true),
                    Cancelado = table.Column<bool>(type: "boolean", nullable: false),
                    CreadoPor = table.Column<Guid>(type: "uuid", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_eventos", x => x.Id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_evento_regalos_EventoId_PerfilId",
                table: "evento_regalos",
                columns: new[] { "EventoId", "PerfilId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_eventos_EmpiezaEn",
                table: "eventos",
                column: "EmpiezaEn");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "evento_regalos");

            migrationBuilder.DropTable(
                name: "eventos");
        }
    }
}
