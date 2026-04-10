mod api;
mod app_state;
mod config;
mod error;
mod models;
mod runtime;

use std::net::SocketAddr;

use app_state::AppState;
use axum::Router;
use tokio::net::TcpListener;
use tower_http::{cors::CorsLayer, trace::TraceLayer};
use tracing::info;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "khadim_firecracker_sandbox=info,tower_http=info".into()),
        )
        .init();

    let config = config::Config::from_env();
    let addr = SocketAddr::from(([0, 0, 0, 0], config.port));
    let state = AppState::new(config.clone());

    let app = Router::new()
        .merge(api::router())
        .layer(TraceLayer::new_for_http())
        .layer(CorsLayer::permissive())
        .with_state(state);

    let listener = TcpListener::bind(addr).await?;
    info!(port = config.port, "firecracker sandbox control plane listening");
    axum::serve(listener, app).await?;

    Ok(())
}
