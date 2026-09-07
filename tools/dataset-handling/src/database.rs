use log::error;
use rustls::crypto::ring::default_provider;
use tokio_postgres::{config::SslMode, Client, NoTls};
use tokio_postgres_rustls::MakeRustlsConnect;

use crate::gtfs::GtfsError;

/// Connects to the database and checks for PostGIS extension.
/// Returns a client if successful.
pub async fn connect_and_check_postgis(db_url: &str) -> Result<Client, GtfsError> {
    // Install the Rustls crypto provider once. This is idempotent when another
    // application component has already selected the same provider.
    let _ = default_provider().install_default();
    let config = db_url.parse::<tokio_postgres::Config>()?;
    let client = if config.get_ssl_mode() == SslMode::Disable {
        let (client, connection) = config.connect(NoTls).await?;
        tokio::spawn(async move {
            if let Err(e) = connection.await {
                error!("Database connection error: {}", e);
            }
        });
        client
    } else {
        let (client, connection) = config
            .connect(MakeRustlsConnect::with_webpki_roots())
            .await?;
        tokio::spawn(async move {
            if let Err(e) = connection.await {
                error!("Database connection error: {}", e);
            }
        });
        client
    };

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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_postgres_ssl_modes_for_transport_selection() {
        let disabled = "host=localhost sslmode=disable"
            .parse::<tokio_postgres::Config>()
            .unwrap();
        let required = "host=localhost sslmode=require"
            .parse::<tokio_postgres::Config>()
            .unwrap();

        assert_eq!(disabled.get_ssl_mode(), SslMode::Disable);
        assert_eq!(required.get_ssl_mode(), SslMode::Require);
    }
}
