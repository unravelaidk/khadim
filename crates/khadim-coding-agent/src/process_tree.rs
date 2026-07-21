//! Registry for process groups owned by active tools.
//!
//! Individual tools still own drop guards and timeout cleanup. The registry is
//! the process-wide emergency path used by a managed CLI when its launcher
//! disappears: tool shells/helpers deliberately run in process groups separate
//! from the CLI, so killing only the CLI group would otherwise orphan them.

#[cfg(unix)]
use std::collections::HashSet;
#[cfg(unix)]
use std::sync::{Mutex, OnceLock};

#[cfg(unix)]
#[derive(Default)]
struct ProcessGroupRegistry {
    groups: HashSet<u32>,
    shutting_down: bool,
}

#[cfg(unix)]
fn registry() -> &'static Mutex<ProcessGroupRegistry> {
    static REGISTRY: OnceLock<Mutex<ProcessGroupRegistry>> = OnceLock::new();
    REGISTRY.get_or_init(|| Mutex::new(ProcessGroupRegistry::default()))
}

#[cfg(unix)]
fn kill_group(pid: u32) {
    // SAFETY: callers only pass positive PIDs created as dedicated
    // process-group leaders by Khadim's tool launchers.
    unsafe {
        libc::kill(-(pid as i32), libc::SIGKILL);
    }
}

/// Register a child PID that is also the leader of its dedicated process
/// group. Returns whether an emergency-shutdown registration was installed.
#[doc(hidden)]
pub fn register(pid: Option<u32>) -> bool {
    #[cfg(unix)]
    if let Some(pid) = pid.filter(|pid| *pid > 1 && *pid <= i32::MAX as u32) {
        let mut registry = registry()
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        if registry.shutting_down {
            // EOF shutdown has started but this child won the narrow race
            // between spawn and registration. Kill it synchronously instead
            // of allowing a newly separated process group to escape.
            drop(registry);
            kill_group(pid);
            return false;
        }
        registry.groups.insert(pid);
        return true;
    }

    #[cfg(not(unix))]
    let _ = pid;
    false
}

#[doc(hidden)]
pub fn unregister(pid: Option<u32>, registered: bool) {
    if !registered {
        return;
    }
    #[cfg(unix)]
    if let Some(pid) = pid {
        registry()
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
            .groups
            .remove(&pid);
    }
    #[cfg(not(unix))]
    let _ = pid;
}

/// Hard-stop every active tool process group before a managed CLI terminates.
/// This function is synchronous because the parent watcher runs on a dedicated
/// OS thread and must remain useful even if the async runtime is wedged.
#[doc(hidden)]
pub fn terminate_all() {
    #[cfg(unix)]
    {
        let groups = {
            let mut registry = registry()
                .lock()
                .unwrap_or_else(|poisoned| poisoned.into_inner());
            registry.shutting_down = true;
            registry.groups.iter().copied().collect::<Vec<_>>()
        };
        for pid in groups {
            kill_group(pid);
        }
    }
}
