use khadim_ai_core::error::AppError;

/// Install the managed-launcher lifetime boundary.
///
/// The descriptor is the read end of an inherited pipe. The launcher retains
/// the write end; when it exits, EOF hard-terminates this process and every
/// descendant started in its dedicated process group/job object. Omitting the
/// descriptor preserves the normal standalone CLI lifecycle.
pub fn install(parent_watch_fd: Option<i32>) -> Result<(), AppError> {
    let Some(fd) = parent_watch_fd else {
        return Ok(());
    };

    imp::install(fd).map_err(|error| {
        AppError::process_spawn(format!(
            "Failed to install parent lifecycle watcher on descriptor {fd}: {error}"
        ))
    })
}

#[cfg(unix)]
mod imp {
    use std::fs::File;
    use std::io::{self, Read};
    use std::os::fd::{FromRawFd, RawFd};
    use std::thread;

    pub fn install(fd: RawFd) -> io::Result<()> {
        validate_descriptor(fd)?;
        let process_group = create_dedicated_process_group()?;

        // SAFETY: the launcher transferred ownership of this inherited read
        // descriptor to the CLI. No other Rust value in this process owns it.
        let mut parent_watch = unsafe { File::from_raw_fd(fd) };
        thread::Builder::new()
            .name("khadim-parent-watch".to_string())
            .spawn(move || {
                let mut byte = [0_u8; 1];
                loop {
                    match parent_watch.read(&mut byte) {
                        Ok(0) => terminate_process_group(process_group),
                        Ok(_) => {}
                        Err(error) if error.kind() == io::ErrorKind::Interrupted => {}
                        Err(_) => terminate_process_group(process_group),
                    }
                }
            })?;
        Ok(())
    }

    fn validate_descriptor(fd: RawFd) -> io::Result<()> {
        // SAFETY: F_GETFD only inspects the descriptor and does not access a
        // pointer. The parser has already excluded negative values.
        if unsafe { libc::fcntl(fd, libc::F_GETFD) } == -1 {
            return Err(io::Error::last_os_error());
        }
        Ok(())
    }

    fn create_dedicated_process_group() -> io::Result<libc::pid_t> {
        // SAFETY: zero arguments mean the current process and a group whose ID
        // equals its PID. This prevents the watcher from ever targeting the
        // launcher's or an interactive shell's process group.
        let result = unsafe { libc::setpgid(0, 0) };
        let pid = unsafe { libc::getpid() };
        let process_group = unsafe { libc::getpgrp() };
        if result == -1 && process_group != pid {
            return Err(io::Error::last_os_error());
        }
        if process_group != pid {
            return Err(io::Error::other(
                "CLI did not become leader of its dedicated process group",
            ));
        }
        Ok(pid)
    }

    fn terminate_process_group(process_group: libc::pid_t) -> ! {
        // Tool shells and local VLA helpers own separate process groups so
        // their normal timeouts can target descendants without killing the
        // CLI. Tear those groups down explicitly before SIGKILL prevents Rust
        // drop guards from running.
        khadim_coding_agent::process_tree::terminate_all();
        // SAFETY: installation proves that process_group is this process's PID
        // and process-group ID. A negative PID targets exactly that group.
        unsafe {
            libc::kill(-process_group, libc::SIGKILL);
            // SIGKILL normally prevents return. If delivery fails or is
            // delayed, still terminate without running destructors.
            libc::_exit(125);
        }
    }
}

#[cfg(windows)]
mod imp {
    use std::ffi::c_void;
    use std::fs::File;
    use std::io::{self, Read};
    use std::mem;
    use std::os::windows::io::FromRawHandle;
    use std::ptr;
    use std::sync::OnceLock;
    use std::thread;
    use windows_sys::Win32::Foundation::{
        CloseHandle, DuplicateHandle, DUPLICATE_SAME_ACCESS, HANDLE, INVALID_HANDLE_VALUE,
    };
    use windows_sys::Win32::System::JobObjects::{
        AssignProcessToJobObject, CreateJobObjectW, JobObjectExtendedLimitInformation,
        SetInformationJobObject, JOBOBJECT_EXTENDED_LIMIT_INFORMATION,
        JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE,
    };
    use windows_sys::Win32::System::Threading::GetCurrentProcess;

    static JOB_HANDLE: OnceLock<usize> = OnceLock::new();

    pub fn install(fd: i32) -> io::Result<()> {
        let parent_watch = duplicate_descriptor_handle(fd)?;
        install_kill_on_close_job()?;

        thread::Builder::new()
            .name("khadim-parent-watch".to_string())
            .spawn(move || monitor(parent_watch))?;
        Ok(())
    }

    fn duplicate_descriptor_handle(fd: i32) -> io::Result<File> {
        // `_get_osfhandle` borrows the handle owned by the inherited CRT file
        // descriptor. Duplicate it before giving ownership to `File`.
        let source = unsafe { libc::get_osfhandle(fd) } as HANDLE;
        if source == INVALID_HANDLE_VALUE {
            return Err(io::Error::last_os_error());
        }

        let process = unsafe { GetCurrentProcess() };
        let mut duplicate: HANDLE = ptr::null_mut();
        let succeeded = unsafe {
            DuplicateHandle(
                process,
                source,
                process,
                &mut duplicate,
                0,
                0,
                DUPLICATE_SAME_ACCESS,
            )
        };
        if succeeded == 0 {
            return Err(io::Error::last_os_error());
        }

        // SAFETY: DuplicateHandle returned a distinct owned pipe handle.
        Ok(unsafe { File::from_raw_handle(duplicate.cast::<c_void>()) })
    }

    fn install_kill_on_close_job() -> io::Result<()> {
        let job = unsafe { CreateJobObjectW(ptr::null(), ptr::null()) };
        if job.is_null() {
            return Err(io::Error::last_os_error());
        }

        let result = configure_and_assign_job(job);
        if result.is_err() {
            unsafe {
                CloseHandle(job);
            }
            return result;
        }

        // Keep the final job handle alive until process teardown. Statics are
        // not dropped, so Windows closes it only while terminating the process;
        // KILL_ON_JOB_CLOSE then terminates all remaining descendants.
        if JOB_HANDLE.set(job as usize).is_err() {
            unsafe {
                CloseHandle(job);
            }
            return Err(io::Error::new(
                io::ErrorKind::AlreadyExists,
                "parent lifecycle job is already installed",
            ));
        }
        Ok(())
    }

    fn configure_and_assign_job(job: HANDLE) -> io::Result<()> {
        let mut limits: JOBOBJECT_EXTENDED_LIMIT_INFORMATION = unsafe { mem::zeroed() };
        limits.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
        let configured = unsafe {
            SetInformationJobObject(
                job,
                JobObjectExtendedLimitInformation,
                (&limits as *const JOBOBJECT_EXTENDED_LIMIT_INFORMATION).cast(),
                mem::size_of::<JOBOBJECT_EXTENDED_LIMIT_INFORMATION>() as u32,
            )
        };
        if configured == 0 {
            return Err(io::Error::last_os_error());
        }

        let assigned = unsafe { AssignProcessToJobObject(job, GetCurrentProcess()) };
        if assigned == 0 {
            return Err(io::Error::last_os_error());
        }
        Ok(())
    }

    fn monitor(mut parent_watch: File) -> ! {
        let mut byte = [0_u8; 1];
        loop {
            match parent_watch.read(&mut byte) {
                Ok(0) => std::process::exit(125),
                Ok(_) => {}
                Err(error) if error.kind() == io::ErrorKind::Interrupted => {}
                Err(_) => std::process::exit(125),
            }
        }
    }
}

#[cfg(not(any(unix, windows)))]
mod imp {
    use std::io;

    pub fn install(_fd: i32) -> io::Result<()> {
        Err(io::Error::new(
            io::ErrorKind::Unsupported,
            "parent lifecycle watching is unsupported on this platform",
        ))
    }
}
