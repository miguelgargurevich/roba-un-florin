using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Florin.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class Anuncios : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "anuncios",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    Texto = table.Column<string>(type: "character varying(280)", maxLength: 280, nullable: false),
                    EmpiezaEn = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    DuraSegundos = table.Column<int>(type: "integer", nullable: false),
                    Cancelado = table.Column<bool>(type: "boolean", nullable: false),
                    CreadoPor = table.Column<Guid>(type: "uuid", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_anuncios", x => x.Id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_anuncios_EmpiezaEn",
                table: "anuncios",
                column: "EmpiezaEn");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "anuncios");
        }
    }
}
