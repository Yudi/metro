use clap::{Parser, Subcommand};
use std::error::Error;
mod database;
mod gtfs;

#[derive(Parser)]
#[command(author, version, about, long_about = None)]
struct Args {
    #[command(subcommand)]
    command: Commands,
}

#[derive(Subcommand, Debug, Clone)]
enum Commands {
    /// Write dataset to database
    DatabaseImporter(DatabaseImporterArgs),
}

#[derive(Parser, Debug, Clone)]
pub struct DatabaseImporterArgs {
    /// Path to shapes.txt
    #[arg(long)]
    shapes_path: String,
    /// SRID for geometries
    #[arg(long, default_value = "4326")]
    srid: i32,
    /// PostgreSQL schema containing the GTFS tables
    #[arg(long, default_value = "external_gtfs")]
    schema: String,
}

fn main() -> Result<(), Box<dyn Error>> {
    let args: Args = Args::parse();
    env_logger::init();

    match args.command {
        Commands::DatabaseImporter(import_args) => {
            let db_url = std::env::var("DATABASE_URL").map_err(|_| {
                "DATABASE_URL environment variable is required for database-importer"
            })?;
            let rt = tokio::runtime::Runtime::new()?;
            rt.block_on(gtfs::process_gtfs_shapes(
                &import_args.shapes_path,
                &db_url,
                import_args.srid,
                &import_args.schema,
            ))?;
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn database_url_is_not_accepted_as_a_command_line_argument() {
        let result = Args::try_parse_from([
            "metro-dataset-handling",
            "database-importer",
            "--shapes-path",
            "shapes.txt",
            "--db-url",
            "postgresql://user:secret@example.invalid/db",
        ]);

        assert!(result.is_err());
    }
}
