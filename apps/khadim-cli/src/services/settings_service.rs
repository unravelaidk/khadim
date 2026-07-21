use crate::domain::settings::StoredSettings;
use khadim_ai_core::error::AppError;
use std::ffi::OsString;
use std::fs;
use std::io::{self, Write};
use std::path::{Path, PathBuf};

pub(crate) fn create_private_dir_all(path: &Path) -> io::Result<()> {
    fs::create_dir_all(path)?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt as _;
        fs::set_permissions(path, fs::Permissions::from_mode(0o700))?;
    }
    #[cfg(windows)]
    crate::infrastructure::windows_acl::protect_directory(path)?;
    Ok(())
}

pub(crate) fn atomic_write_private(path: &Path, content: &[u8]) -> io::Result<()> {
    let parent = path.parent().ok_or_else(|| {
        io::Error::new(
            io::ErrorKind::InvalidInput,
            "private file path has no parent",
        )
    })?;
    create_private_dir_all(parent)?;
    let mut temp_file = tempfile::NamedTempFile::new_in(parent)?;
    make_file_private(temp_file.as_file(), temp_file.path())?;
    temp_file.write_all(content)?;
    temp_file.as_file().sync_all()?;
    temp_file.persist(path).map_err(|error| error.error)?;
    // Defend against filesystems whose replacement primitive does not retain
    // the temporary file's security descriptor.
    make_path_private(path)?;
    Ok(())
}

pub(crate) fn make_file_private(file: &fs::File, path: &Path) -> io::Result<()> {
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt as _;
        let _ = path;
        file.set_permissions(fs::Permissions::from_mode(0o600))?;
    }
    #[cfg(windows)]
    {
        let _ = file;
        crate::infrastructure::windows_acl::protect_file(path)?;
    }
    #[cfg(not(any(unix, windows)))]
    let _ = (file, path);
    Ok(())
}

pub(crate) fn make_path_private(path: &Path) -> io::Result<()> {
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt as _;
        fs::set_permissions(path, fs::Permissions::from_mode(0o600))?;
    }
    #[cfg(windows)]
    crate::infrastructure::windows_acl::protect_file(path)?;
    #[cfg(not(any(unix, windows)))]
    let _ = path;
    Ok(())
}

/// Harden a legacy private file before reading it. Returns false when the file
/// does not exist yet. ACL/permission errors are intentionally propagated so
/// callers never consume or append secrets through a broadly-accessible file.
pub(crate) fn secure_existing_private_file(path: &Path) -> io::Result<bool> {
    match fs::metadata(path) {
        Ok(_) => {
            make_path_private(path)?;
            Ok(true)
        }
        Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(false),
        Err(error) => Err(error),
    }
}

fn config_base_dir(explicit: Option<OsString>, system: Option<PathBuf>) -> Option<PathBuf> {
    explicit
        .filter(|value| !value.is_empty())
        .map(PathBuf::from)
        .or(system)
}

pub fn khadim_config_dir() -> Result<PathBuf, AppError> {
    let base_dir = config_base_dir(std::env::var_os("KHADIM_CONFIG_HOME"), dirs::config_dir())
        .ok_or_else(|| AppError::io("Cannot determine config directory"))?;
    let dir = base_dir.join("khadim");
    create_private_dir_all(&dir)?;
    Ok(dir)
}

pub fn settings_path() -> Result<PathBuf, AppError> {
    Ok(khadim_config_dir()?.join("cli-settings.json"))
}

pub fn load_settings() -> Result<StoredSettings, AppError> {
    let path = settings_path()?;
    if !secure_existing_private_file(&path)
        .map_err(|err| AppError::io(format!("Failed to secure CLI settings: {err}")))?
    {
        return Ok(StoredSettings::default());
    }
    let mut settings = match fs::read_to_string(path) {
        Ok(content) => serde_json::from_str::<StoredSettings>(&content)
            .map_err(|err| AppError::io(format!("Failed to parse CLI settings: {err}")))?,
        // The file can be concurrently removed after the metadata check.
        Err(err) if err.kind() == io::ErrorKind::NotFound => StoredSettings::default(),
        Err(err) => return Err(AppError::io(format!("Failed to read CLI settings: {err}"))),
    };
    settings.migrate_legacy_key();
    Ok(settings)
}

pub fn save_settings(settings: &StoredSettings) -> Result<(), AppError> {
    let path = settings_path()?;
    // Fail closed when an existing settings file cannot be secured/read. A
    // save must not silently replace a suspicious reparse point or discard
    // credentials merely because the privacy hardening step failed.
    let mut merged = load_settings()?;
    merged.provider = settings.provider.clone();
    merged.model_id = settings.model_id.clone();
    merged.api_key = None;
    merged.theme_family = settings.theme_family.clone();
    merged.theme_variant = settings.theme_variant.clone();
    merged.system_prompt = settings.system_prompt.clone();
    merged.search_provider = settings.search_provider.clone();
    // `settings` is always derived from a freshly loaded snapshot. Replace
    // maps rather than only merging them so explicit `clear` commands can
    // actually remove credentials.
    merged.api_keys = settings.api_keys.clone();
    merged.search_api_keys = settings.search_api_keys.clone();
    let content = serde_json::to_string_pretty(&merged)
        .map_err(|err| AppError::io(format!("Failed to encode CLI settings: {err}")))?;
    atomic_write_private(&path, format!("{content}\n").as_bytes())
        .map_err(|err| AppError::io(format!("Failed to write CLI settings: {err}")))?;
    Ok(())
}

/// Build effective settings by merging config overrides with stored settings.
pub fn effective_settings(
    config: &crate::args::CliConfig,
    settings: &StoredSettings,
) -> StoredSettings {
    let mut effective = StoredSettings {
        provider: config
            .provider
            .clone()
            .or_else(|| settings.provider.clone()),
        model_id: config.model.clone().or_else(|| settings.model_id.clone()),
        api_key: None,
        api_keys: settings.api_keys.clone(),
        theme_family: settings.theme_family.clone(),
        theme_variant: settings.theme_variant.clone(),
        system_prompt: config
            .system_prompt
            .clone()
            .or_else(|| settings.system_prompt.clone()),
        search_provider: config
            .search_provider
            .clone()
            .or_else(|| settings.search_provider.clone()),
        search_api_keys: settings.search_api_keys.clone(),
    };
    if let (Some(ref provider), Some(ref key)) =
        (settings.provider.clone(), settings.api_key.clone())
    {
        if !key.trim().is_empty() && !effective.api_keys.contains_key(provider) {
            effective.api_keys.insert(provider.clone(), key.clone());
        }
    }
    effective
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn explicit_config_home_is_platform_independent_and_takes_precedence() {
        let explicit = OsString::from("workspace with ünicode/config");
        let system = PathBuf::from("system-config");

        assert_eq!(
            config_base_dir(Some(explicit.clone()), Some(system.clone())),
            Some(PathBuf::from(explicit))
        );
        assert_eq!(
            config_base_dir(Some(OsString::new()), Some(system.clone())),
            Some(system)
        );
        assert_eq!(config_base_dir(None, None), None);
    }

    #[test]
    fn private_atomic_write_replaces_existing_content() {
        let temp = tempfile::tempdir().expect("temp dir");
        let private_dir = temp.path().join("private");
        let path = private_dir.join("settings.json");

        atomic_write_private(&path, b"first").expect("first write");
        atomic_write_private(&path, b"second").expect("replacement write");

        assert_eq!(fs::read(&path).expect("read settings"), b"second");
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt as _;
            assert_eq!(
                fs::metadata(&private_dir)
                    .expect("dir metadata")
                    .permissions()
                    .mode()
                    & 0o777,
                0o700
            );
            assert_eq!(
                fs::metadata(&path)
                    .expect("file metadata")
                    .permissions()
                    .mode()
                    & 0o777,
                0o600
            );
        }
    }

    #[cfg(unix)]
    #[test]
    fn existing_private_file_is_hardened_before_a_caller_reads_it() {
        use std::os::unix::fs::PermissionsExt as _;

        let temp = tempfile::tempdir().expect("temp dir");
        let path = temp.path().join("legacy-settings.json");
        fs::write(&path, b"secret").expect("seed legacy settings");
        fs::set_permissions(&path, fs::Permissions::from_mode(0o666))
            .expect("seed broad permissions");

        assert!(secure_existing_private_file(&path).expect("harden legacy settings"));
        assert_eq!(
            fs::metadata(&path)
                .expect("settings metadata")
                .permissions()
                .mode()
                & 0o777,
            0o600
        );
        assert!(!secure_existing_private_file(&temp.path().join("missing"))
            .expect("missing private file"));
    }
}
