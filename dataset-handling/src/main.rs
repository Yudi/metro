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
    /// Database connection string
    #[arg(
        long,
        default_value = "host=localhost user=postgres password=postgres dbname=postgres"
    )]
    db_url: String,
    /// SRID for geometries
    #[arg(long, default_value = "4326")]
    srid: i32,
}

fn main() -> Result<(), Box<dyn Error>> {
    let args: Args = Args::parse();
    env_logger::init();

    match args.command {
        Commands::DatabaseImporter(import_args) => {
            let rt = tokio::runtime::Runtime::new()?;
            rt.block_on(gtfs::process_gtfs_shapes(
                &import_args.shapes_path,
                &import_args.db_url,
                import_args.srid,
            ))?;
        }
    }
    Ok(())
}
