use std::io;
use std::mem;
use std::os::windows::io::{AsRawHandle, FromRawHandle, OwnedHandle};
use std::os::windows::process::CommandExt as _;
use std::ptr;
use tokio::process::Child;
use windows_sys::Win32::Foundation::INVALID_HANDLE_VALUE;
use windows_sys::Win32::System::Diagnostics::ToolHelp::{
    CreateToolhelp32Snapshot, Thread32First, Thread32Next, TH32CS_SNAPTHREAD, THREADENTRY32,
};
use windows_sys::Win32::System::JobObjects::{
    AssignProcessToJobObject, CreateJobObjectW, JobObjectExtendedLimitInformation,
    SetInformationJobObject, TerminateJobObject, JOBOBJECT_EXTENDED_LIMIT_INFORMATION,
    JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE,
};
use windows_sys::Win32::System::Threading::{
    OpenThread, ResumeThread, CREATE_SUSPENDED, THREAD_SUSPEND_RESUME,
};

pub(crate) fn configure_suspended(command: &mut tokio::process::Command) {
    command.as_std_mut().creation_flags(CREATE_SUSPENDED);
}

/// Per-child Windows process-tree ownership. Closing this handle terminates
/// the helper and every descendant the kernel associated with it.
pub(crate) struct KillOnDropJob {
    handle: OwnedHandle,
}

impl KillOnDropJob {
    pub(crate) fn assign_suspended_and_resume(child: &Child) -> io::Result<Self> {
        let pid = child.id().ok_or_else(|| {
            io::Error::new(
                io::ErrorKind::InvalidInput,
                "spawned helper has no Windows process id",
            )
        })?;
        let job = Self::assign(child)?;
        if let Err(error) = resume_process_threads(pid) {
            let _ = job.terminate();
            return Err(error);
        }
        Ok(job)
    }

    pub(crate) fn assign(child: &Child) -> io::Result<Self> {
        let process = child.raw_handle().ok_or_else(|| {
            io::Error::new(
                io::ErrorKind::InvalidInput,
                "spawned helper has no Windows process handle",
            )
        })?;
        let job = Self::create()?;
        if unsafe { AssignProcessToJobObject(job.handle.as_raw_handle().cast(), process.cast()) }
            == 0
        {
            return Err(io::Error::last_os_error());
        }
        Ok(job)
    }

    fn create() -> io::Result<Self> {
        let raw_handle = unsafe { CreateJobObjectW(ptr::null(), ptr::null()) };
        if raw_handle.is_null() {
            return Err(io::Error::last_os_error());
        }
        let handle = unsafe { OwnedHandle::from_raw_handle(raw_handle) };

        let mut limits: JOBOBJECT_EXTENDED_LIMIT_INFORMATION = unsafe { mem::zeroed() };
        limits.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
        let configured = unsafe {
            SetInformationJobObject(
                handle.as_raw_handle().cast(),
                JobObjectExtendedLimitInformation,
                (&limits as *const JOBOBJECT_EXTENDED_LIMIT_INFORMATION).cast(),
                mem::size_of::<JOBOBJECT_EXTENDED_LIMIT_INFORMATION>() as u32,
            )
        };
        if configured == 0 {
            return Err(io::Error::last_os_error());
        }
        Ok(Self { handle })
    }

    pub(crate) fn terminate(&self) -> io::Result<()> {
        if unsafe { TerminateJobObject(self.handle.as_raw_handle().cast(), 1) } == 0 {
            Err(io::Error::last_os_error())
        } else {
            Ok(())
        }
    }
}

fn resume_process_threads(pid: u32) -> io::Result<()> {
    let snapshot = unsafe { CreateToolhelp32Snapshot(TH32CS_SNAPTHREAD, 0) };
    if snapshot == INVALID_HANDLE_VALUE {
        return Err(io::Error::last_os_error());
    }
    let snapshot = unsafe { OwnedHandle::from_raw_handle(snapshot) };
    let mut entry = THREADENTRY32 {
        dwSize: mem::size_of::<THREADENTRY32>() as u32,
        ..Default::default()
    };
    if unsafe { Thread32First(snapshot.as_raw_handle().cast(), &mut entry) } == 0 {
        return Err(io::Error::last_os_error());
    }

    let mut resumed = 0_u32;
    loop {
        if entry.th32OwnerProcessID == pid {
            let raw_thread = unsafe { OpenThread(THREAD_SUSPEND_RESUME, 0, entry.th32ThreadID) };
            if raw_thread.is_null() {
                return Err(io::Error::last_os_error());
            }
            let thread = unsafe { OwnedHandle::from_raw_handle(raw_thread) };
            let previous_count = unsafe { ResumeThread(thread.as_raw_handle().cast()) };
            if previous_count == u32::MAX {
                return Err(io::Error::last_os_error());
            }
            if previous_count == 0 {
                return Err(io::Error::other(
                    "spawned helper thread was not suspended before Job Object assignment",
                ));
            }
            resumed += 1;
        }
        if unsafe { Thread32Next(snapshot.as_raw_handle().cast(), &mut entry) } == 0 {
            break;
        }
    }

    if resumed == 0 {
        Err(io::Error::new(
            io::ErrorKind::NotFound,
            "could not locate the suspended helper thread",
        ))
    } else {
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use windows_sys::Win32::Foundation::WAIT_OBJECT_0;
    use windows_sys::Win32::System::Threading::WaitForSingleObject;

    #[test]
    fn job_ownership_can_cross_async_send_boundaries() {
        fn assert_send<T: Send>() {}
        assert_send::<KillOnDropJob>();
    }

    #[tokio::test]
    async fn terminating_a_job_ends_its_helper_without_polling_sleeps() {
        let mut command = tokio::process::Command::new("cmd.exe");
        command
            .args(["/D", "/S", "/C", "ping -t 127.0.0.1 >NUL"])
            .kill_on_drop(true);
        configure_suspended(&mut command);
        let mut child = command.spawn().expect("spawn suspended Windows helper");
        let process = child.raw_handle().expect("child process handle");
        let job = KillOnDropJob::assign_suspended_and_resume(&child)
            .expect("assign helper job before resuming it");

        job.terminate().expect("terminate job");
        assert_eq!(
            unsafe { WaitForSingleObject(process.cast(), 5_000) },
            WAIT_OBJECT_0
        );
        child.wait().await.expect("reap helper");
    }
}
