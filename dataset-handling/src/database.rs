use tokio_postgres::{Client, NoTls};
use log::error;

use crate::gtfs::GtfsError;

/// Connects to the database and checks for PostGIS extension.
/// Returns a client if successful.
pub async fn connect_and_check_postgis(db_url: &str) -> Result<Client, GtfsError> {
    let (client, connection) = tokio_postgres::connect(db_url, NoTls).await?;
    tokio::spawn(async move {
        if let Err(e) = connection.await {
            error!("Database connection error: {}", e);
        }
    });

    // Check for PostGIS
    let postgis_check = client
        .query_one("SELECT PostGIS_Version() IS NOT NULL", &[])
        .await?;
    let has_postgis: bool = postgis_check.get(0);
    if !has_postgis {
        return Err(GtfsError::InvalidData(
            "PostGIS extension not available".to_string(),
        ));
    }

    Ok(client)
}