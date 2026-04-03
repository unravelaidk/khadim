use serde::Serialize;

/// Unified error type for all Tauri commands.
/// Serializes to a JSON object with `kind` and `message` so the frontend
/// can pattern-match on `kind` without parsing strings.
#[derive(Debug, Serialize, Clone)]
pub struct AppError {
    pub kind: ErrorKind,
    pub message: String,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "snake_case")]
pub enum ErrorKind {
    Database,
    NotFound,
    ProcessSpawn,
    ProcessKill,
    HealthCheck,
    Git,
    Io,
    InvalidInput,
    BackendBusy,
}

impl AppError {
    pub fn db(msg: impl Into<String>) -> Self {
        Self {
            kind: ErrorKind::Database,
            message: msg.into(),
        }
    }

    pub fn not_found(msg: impl Into<String>) -> Self {
        Self {
            kind: ErrorKind::NotFound,
            message: msg.into(),
        }
    }

    pub fn process_spawn(msg: impl Into<String>) -> Self {
        Self {
            kind: ErrorKind::ProcessSpawn,
            message: msg.into(),
        }
    }

    pub fn process_kill(msg: impl Into<String>) -> Self {
        Self {
            kind: ErrorKind::ProcessKill,
            message: msg.into(),
        }
    }

    pub fn health(msg: impl Into<String>) -> Self {
        Self {
            kind: ErrorKind::HealthCheck,
            message: msg.into(),
        }
    }

    pub fn git(msg: impl Into<String>) -> Self {
        Self {
            kind: ErrorKind::Git,
            message: msg.into(),
        }
    }

    pub fn io(msg: impl Into<String>) -> Self {
        Self {
            kind: ErrorKind::Io,
            message: msg.into(),
        }
    }

    pub fn invalid_input(msg: impl Into<String>) -> Self {
        Self {
            kind: ErrorKind::InvalidInput,
            message: msg.into(),
        }
    }

    pub fn backend_busy(msg: impl Into<String>) -> Self {
        Self {
            kind: ErrorKind::BackendBusy,
            message: msg.into(),
        }
    }
}

impl std::fmt::Display for AppError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{:?}: {}", self.kind, self.message)
    }
}

impl std::error::Error for AppError {}

impl From<rusqlite::Error> for AppError {
    fn from(e: rusqlite::Error) -> Self {
        Self::db(e.to_string())
    }
}

impl From<std::io::Error> for AppError {
    fn from(e: std::io::Error) -> Self {
        Self::io(e.to_string())
    }
}

impl From<reqwest::Error> for AppError {
    fn from(e: reqwest::Error) -> Self {
        Self::health(e.to_string())
    }
}
