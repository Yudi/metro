use crate::database::connect_and_check_postgis;
use anyhow::Result;
use csv::ReaderBuilder;
use geo::{LineString, Point};
use log::{info, warn};
use rayon::prelude::*;
use std::collections::{HashMap, HashSet};
use thiserror::Error;

#[derive(Error, Debug)]
pub enum GtfsError {
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),
    #[error("CSV error: {0}")]
    Csv(#[from] csv::Error),
    #[error("DB error: {0}")]
    Db(#[from] tokio_postgres::Error),
    #[error("Invalid data: {0}")]
    InvalidData(String),
}

#[derive(Debug, Clone)]
struct ShapePoint {
    lat: f64,
    lon: f64,
    sequence: u32,
}

/// Reads and parses GTFS shapes from a CSV file.
/// Validates latitude (-90 to 90), longitude (-180 to 180), and sequence (>=0).
/// Groups points by shape_id and ensures sequence uniqueness per shape.
fn read_shapes(file_path: &str) -> Result<HashMap<String, Vec<ShapePoint>>, GtfsError> {
    info!("Reading GTFS shapes from {}", file_path);
    let mut rdr = ReaderBuilder::new()
        .has_headers(true)
        .from_path(file_path)?;

    let mut records: Vec<(String, ShapePoint)> = Vec::new();
    let mut shape_sequences: HashMap<String, HashSet<u32>> = HashMap::new();
    let mut skipped_records = 0;
    let mut total_points = 0;

    for (row_index, result) in rdr.records().enumerate() {
        let rec = match result {
            Ok(record) => record,
            Err(error) => {
                warn!(
                    "Skipping malformed shapes.txt row {}: {}",
                    row_index + 2,
                    error
                );
                skipped_records += 1;
                continue;
            }
        };
        let shape_id = rec.get(0).unwrap_or("").trim().to_string();
        let lat_s = rec.get(1).unwrap_or("");
        let lon_s = rec.get(2).unwrap_or("");
        let seq_s = rec.get(3).unwrap_or("");

        if shape_id.is_empty() {
            warn!("Skipping record with empty shape_id");
            skipped_records += 1;
            continue;
        }

        let lat = match lat_s.trim().parse::<f64>() {
            Ok(value) => value,
            Err(_) => {
                warn!("Skipping row with invalid latitude: {}", lat_s);
                skipped_records += 1;
                continue;
            }
        };
        let lon = match lon_s.trim().parse::<f64>() {
            Ok(value) => value,
            Err(_) => {
                warn!("Skipping row with invalid longitude: {}", lon_s);
                skipped_records += 1;
                continue;
            }
        };
        let sequence = match seq_s.trim().parse::<u32>() {
            Ok(value) => value,
            Err(_) => {
                warn!("Skipping row with invalid sequence: {}", seq_s);
                skipped_records += 1;
                continue;
            }
        };

        if !(-90.0..=90.0).contains(&lat) {
            warn!("Skipping row with latitude out of range: {}", lat);
            skipped_records += 1;
            continue;
        }
        if !(-180.0..=180.0).contains(&lon) {
            warn!("Skipping row with longitude out of range: {}", lon);
            skipped_records += 1;
            continue;
        }

        let seq_set = shape_sequences.entry(shape_id.clone()).or_default();
        if !seq_set.insert(sequence) {
            warn!(
                "Skipping duplicate sequence {} for shape_id {}",
                sequence, shape_id
            );
            skipped_records += 1;
            continue;
        }

        records.push((shape_id, ShapePoint { lat, lon, sequence }));
        total_points += 1;
    }

    // Parallel grouping
    let grouped: HashMap<String, Vec<ShapePoint>> = records
        .into_par_iter()
        .fold(
            HashMap::<String, Vec<ShapePoint>>::new,
            |mut acc, (sid, sp)| {
                acc.entry(sid).or_default().push(sp);
                acc
            },
        )
        .reduce(HashMap::<String, Vec<ShapePoint>>::new, |mut a, b| {
            for (k, mut v) in b {
                a.entry(k).or_default().append(&mut v);
            }
            a
        });

    info!(
        "Successfully read {} shapes with {} total points from {}. Skipped {} invalid records.",
        grouped.len(),
        total_points,
        file_path,
        skipped_records
    );
    Ok(grouped)
}

/// Converts grouped shape points to LineString geometries.
/// Sorts points by sequence for each shape.
fn shapes_to_linestrings(
    shapes: &HashMap<String, Vec<ShapePoint>>,
) -> HashMap<String, LineString<f64>> {
    let linestrings: HashMap<String, LineString<f64>> = shapes
        .par_iter()
        .filter_map(|(shape_id, points)| {
            let mut sorted_points = points.clone();
            sorted_points.sort_by_key(|p| p.sequence);
            if sorted_points.len() < 2 {
                warn!(
                    "Skipping shape_id {} because fewer than two valid points remain",
                    shape_id
                );
                return None;
            }
            let coords: Vec<Point<f64>> = sorted_points
                .iter()
                .map(|p| Point::new(p.lon, p.lat))
                .collect();
            Some((shape_id.clone(), LineString::from(coords)))
        })
        .collect();
    info!(
        "Successfully converted {} shapes to LineString geometries",
        linestrings.len()
    );
    linestrings
}

// Note: insertion and syncing is done inside `process_gtfs_shapes` using a transaction

/// Processes GTFS shapes: reads from CSV, converts to geometries, and syncs to PostGIS.
/// Checks for PostGIS extension and uses the specified SRID.
/// Performs batched inserts for performance.
pub async fn process_gtfs_shapes(
    shapes_path: &str,
    db_url: &str,
    srid: i32,
    schema: &str,
) -> Result<(), GtfsError> {
    if schema.is_empty()
        || !schema
            .chars()
            .all(|character| character.is_ascii_alphanumeric() || character == '_')
    {
        return Err(GtfsError::InvalidData(format!(
            "Invalid PostgreSQL schema name: {}",
            schema
        )));
    }

    info!("Starting GTFS shapes processing for {}", shapes_path);
    let shapes = read_shapes(shapes_path)?;
    let linestrings = shapes_to_linestrings(&shapes);
    if linestrings.is_empty() {
        return Err(GtfsError::InvalidData(
            "shapes.txt contains no usable shapes".to_string(),
        ));
    }

    let mut client = connect_and_check_postgis(db_url).await?;
    info!("Successfully connected to PostGIS");

    let create_table_query = format!(
        "CREATE TABLE IF NOT EXISTS \"{}\".\"SPTrans_Shape\" (
        shape_id text PRIMARY KEY,
        geom GEOMETRY(LINESTRING, {}) NOT NULL
    )",
        schema, srid
    );
    client.execute(&create_table_query, &[]).await?;
    info!(
        "Created SPTrans_Shape table if not exists with SRID {}",
        srid
    );

    // Start transaction
    let tx = client.transaction().await?;
    info!("Started database transaction");

    // Create staging table
    tx.execute(
        "CREATE TEMP TABLE staging_shapes (shape_id TEXT PRIMARY KEY) ON COMMIT DROP",
        &[],
    )
    .await?;
    info!("Created temporary staging table");

    // Prepare insert statement for batching
    let insert_query = format!(
        "INSERT INTO \"{}\".\"SPTrans_Shape\" (shape_id, geom) VALUES ($1, ST_GeomFromText($2, $3)) ON CONFLICT (shape_id) DO UPDATE SET geom = EXCLUDED.geom",
        schema
    );
    let insert_stmt = tx.prepare(&insert_query).await?;
    let staging_stmt = tx
        .prepare("INSERT INTO staging_shapes (shape_id) VALUES ($1) ON CONFLICT DO NOTHING")
        .await?;
    info!("Prepared insert and staging statements");

    let mut inserted_count = 0;

    // Batch inserts
    for (shape_id, linestring) in linestrings.iter() {
        let wkt = format!(
            "LINESTRING({})",
            linestring
                .points()
                .map(|p| format!("{} {}", p.x(), p.y()))
                .collect::<Vec<_>>()
                .join(", ")
        );
        tx.execute(&insert_stmt, &[shape_id, &wkt, &srid]).await?;
        tx.execute(&staging_stmt, &[shape_id]).await?;
        inserted_count += 1;
    }
    info!("Inserted/updated {} shapes", inserted_count);

    // Delete missing shapes
    let delete_query = format!(
        "DELETE FROM \"{}\".\"SPTrans_Shape\" WHERE shape_id NOT IN (SELECT shape_id FROM staging_shapes)",
        schema
    );
    let delete_result = tx.execute(&delete_query, &[]).await?;
    let deleted_count = delete_result as usize;
    info!("Deleted {} obsolete shapes", deleted_count);

    tx.commit().await?;
    info!("Transaction committed successfully. Synced {} shapes to PostGIS (inserted: {}, deleted: {}).", linestrings.len(), inserted_count, deleted_count);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;
    use tempfile::NamedTempFile;

    #[test]
    fn test_read_shapes_valid() {
        let mut file = NamedTempFile::new().unwrap();
        writeln!(file, "shape_id,shape_pt_lat,shape_pt_lon,shape_pt_sequence").unwrap();
        writeln!(file, "shape1,40.7128,-74.0060,1").unwrap();
        writeln!(file, "shape1,40.7130,-74.0070,2").unwrap();

        let shapes = read_shapes(file.path().to_str().unwrap()).unwrap();
        assert_eq!(shapes.len(), 1);
        assert_eq!(shapes["shape1"].len(), 2);
    }

    #[test]
    fn test_read_shapes_skips_invalid_lat() {
        let mut file = NamedTempFile::new().unwrap();
        writeln!(file, "shape_id,shape_pt_lat,shape_pt_lon,shape_pt_sequence").unwrap();
        writeln!(file, "shape1,100.0,-74.0060,1").unwrap();

        writeln!(file, "shape2,40.7128,-74.0060,1").unwrap();
        writeln!(file, "shape2,40.7130,-74.0070,2").unwrap();

        let shapes = read_shapes(file.path().to_str().unwrap()).unwrap();
        assert_eq!(shapes.len(), 1);
        assert_eq!(shapes["shape2"].len(), 2);
    }

    #[test]
    fn test_read_shapes_skips_duplicate_sequence() {
        let mut file = NamedTempFile::new().unwrap();
        writeln!(file, "shape_id,shape_pt_lat,shape_pt_lon,shape_pt_sequence").unwrap();
        writeln!(file, "shape1,40.7128,-74.0060,1").unwrap();
        writeln!(file, "shape1,40.7130,-74.0070,1").unwrap();

        writeln!(file, "shape1,40.7140,-74.0080,2").unwrap();

        let shapes = read_shapes(file.path().to_str().unwrap()).unwrap();
        assert_eq!(shapes["shape1"].len(), 2);
    }

    #[test]
    fn test_shapes_to_linestrings_skips_incomplete_shapes() {
        let shapes = HashMap::from([
            (
                "incomplete".to_string(),
                vec![ShapePoint {
                    lat: 1.0,
                    lon: 1.0,
                    sequence: 1,
                }],
            ),
            (
                "valid".to_string(),
                vec![
                    ShapePoint {
                        lat: 1.0,
                        lon: 1.0,
                        sequence: 1,
                    },
                    ShapePoint {
                        lat: 2.0,
                        lon: 2.0,
                        sequence: 2,
                    },
                ],
            ),
        ]);

        let lines = shapes_to_linestrings(&shapes);
        assert!(!lines.contains_key("incomplete"));
        assert!(lines.contains_key("valid"));
    }
}
