use axum::{http::StatusCode, response::IntoResponse, Json};
use serde::Serialize;
use thiserror::Error;

#[derive(Debug, Error)]
pub enum AppError {
    #[error("sandbox not found")]
    NotFound,
    #[error("not implemented: {0}")]
    NotImplemented(String),
    #[error("unsupported substrate: {0}")]
    UnsupportedSubstrate(String),
    #[error("bad request: {0}")]
    BadRequest(String),
    #[error("runtime error: {0}")]
    Runtime(String),
    #[error(transparent)]
    Io(#[from] std::io::Error),
    #[error(transparent)]
    Json(#[from] serde_json::Error),
}

#[derive(Serialize)]
struct ErrorBody {
    error: String,
}

impl IntoResponse for AppError {
    fn into_response(self) -> axum::response::Response {
        let status = match self {
            Self::NotFound => StatusCode::NOT_FOUND,
            Self::NotImplemented(_) => StatusCode::NOT_IMPLEMENTED,
            Self::UnsupportedSubstrate(_) | Self::BadRequest(_) => StatusCode::BAD_REQUEST,
            Self::Runtime(_) | Self::Io(_) | Self::Json(_) => StatusCode::INTERNAL_SERVER_ERROR,
        };

        let body = Json(ErrorBody {
            error: self.to_string(),
        });

        (status, body).into_response()
    }
}
