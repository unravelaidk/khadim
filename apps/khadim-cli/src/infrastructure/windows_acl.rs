use std::fs;
use std::io;
use std::os::windows::fs::{MetadataExt as _, OpenOptionsExt as _};
use std::os::windows::io::AsRawHandle as _;
use std::path::Path;
use std::ptr;
use windows_sys::Win32::Foundation::LocalFree;
use windows_sys::Win32::Security::Authorization::{
    ConvertStringSecurityDescriptorToSecurityDescriptorW, SetSecurityInfo, SDDL_REVISION_1,
    SE_FILE_OBJECT,
};
use windows_sys::Win32::Security::{
    GetSecurityDescriptorDacl, ACL, DACL_SECURITY_INFORMATION, PROTECTED_DACL_SECURITY_INFORMATION,
    PSECURITY_DESCRIPTOR,
};
use windows_sys::Win32::Storage::FileSystem::{
    FILE_ATTRIBUTE_REPARSE_POINT, FILE_FLAG_BACKUP_SEMANTICS, FILE_FLAG_OPEN_REPARSE_POINT,
    FILE_SHARE_DELETE, FILE_SHARE_READ, FILE_SHARE_WRITE, READ_CONTROL, WRITE_DAC,
};

// Owner Rights (OW) follows the object owner without embedding a mutable user
// name or domain SID. System and the local Administrators group retain recovery
// access. Directory ACEs inherit to both child files and child directories, so
// newly-created temporary files are private before any secret content is
// written to them.
const PRIVATE_FILE_SDDL: &str = "D:P(A;;FA;;;OW)(A;;FA;;;SY)(A;;FA;;;BA)";
const PRIVATE_DIRECTORY_SDDL: &str = "D:P(A;OICI;FA;;;OW)(A;OICI;FA;;;SY)(A;OICI;FA;;;BA)";

struct LocalSecurityDescriptor(PSECURITY_DESCRIPTOR);

impl Drop for LocalSecurityDescriptor {
    fn drop(&mut self) {
        if !self.0.is_null() {
            // SAFETY: ConvertStringSecurityDescriptorToSecurityDescriptorW
            // allocates this descriptor with LocalAlloc and ownership remains
            // with this wrapper until drop.
            unsafe {
                LocalFree(self.0.cast());
            }
        }
    }
}

fn descriptor_from_sddl(sddl: &str) -> io::Result<LocalSecurityDescriptor> {
    let encoded: Vec<u16> = sddl.encode_utf16().chain(Some(0)).collect();
    let mut descriptor = ptr::null_mut();
    // SAFETY: `encoded` is NUL-terminated and alive for the call. Windows
    // initializes `descriptor` on success and documents LocalFree ownership.
    let converted = unsafe {
        ConvertStringSecurityDescriptorToSecurityDescriptorW(
            encoded.as_ptr(),
            SDDL_REVISION_1,
            &mut descriptor,
            ptr::null_mut(),
        )
    };
    if converted == 0 {
        Err(io::Error::last_os_error())
    } else {
        Ok(LocalSecurityDescriptor(descriptor))
    }
}

fn open_for_acl(path: &Path, directory: bool) -> io::Result<fs::File> {
    let metadata = fs::symlink_metadata(path)?;
    let correct_kind = metadata.file_attributes() & FILE_ATTRIBUTE_REPARSE_POINT == 0
        && if directory {
            metadata.is_dir()
        } else {
            metadata.is_file()
        };
    if !correct_kind {
        return Err(io::Error::new(
            io::ErrorKind::InvalidInput,
            format!(
                "private storage path is not a regular {}: {}",
                if directory { "directory" } else { "file" },
                path.display()
            ),
        ));
    }

    let mut options = fs::OpenOptions::new();
    options
        // `read(true)` satisfies OpenOptions validation; access_mode replaces
        // GENERIC_READ with only the ACL rights the operation needs.
        .read(true)
        .access_mode(READ_CONTROL | WRITE_DAC)
        .share_mode(FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE)
        // Do not follow a reparse point swapped into a legacy broad directory.
        .custom_flags(
            FILE_FLAG_OPEN_REPARSE_POINT
                | if directory {
                    FILE_FLAG_BACKUP_SEMANTICS
                } else {
                    0
                },
        );
    options.open(path)
}

fn descriptor_dacl(descriptor: PSECURITY_DESCRIPTOR) -> io::Result<*mut ACL> {
    let mut present = 0;
    let mut defaulted = 0;
    let mut dacl = ptr::null_mut();
    // SAFETY: the descriptor is valid and alive; each output points to writable
    // storage. The returned ACL is borrowed from the descriptor.
    let read =
        unsafe { GetSecurityDescriptorDacl(descriptor, &mut present, &mut dacl, &mut defaulted) };
    if read == 0 {
        return Err(io::Error::last_os_error());
    }
    if present == 0 || dacl.is_null() {
        return Err(io::Error::new(
            io::ErrorKind::InvalidData,
            "private security descriptor contains no DACL",
        ));
    }
    Ok(dacl)
}

fn apply_sddl(path: &Path, sddl: &str, directory: bool) -> io::Result<()> {
    let descriptor = descriptor_from_sddl(sddl)?;
    let dacl = descriptor_dacl(descriptor.0)?;
    let file = open_for_acl(path, directory)?;
    let security_information = DACL_SECURITY_INFORMATION | PROTECTED_DACL_SECURITY_INFORMATION;
    // SAFETY: the File owns a valid filesystem handle and the descriptor keeps
    // `dacl` alive for the call. SetSecurityInfo copies the ACL.
    let status = unsafe {
        SetSecurityInfo(
            file.as_raw_handle().cast(),
            SE_FILE_OBJECT,
            security_information,
            ptr::null_mut(),
            ptr::null_mut(),
            dacl,
            ptr::null_mut(),
        )
    };
    if status == 0 {
        Ok(())
    } else {
        Err(io::Error::from_raw_os_error(status as i32))
    }
}

pub(crate) fn protect_directory(path: &Path) -> io::Result<()> {
    apply_sddl(path, PRIVATE_DIRECTORY_SDDL, true)
}

pub(crate) fn protect_file(path: &Path) -> io::Result<()> {
    apply_sddl(path, PRIVATE_FILE_SDDL, false)
}

#[cfg(test)]
mod tests {
    use super::*;
    use windows_sys::Win32::Security::Authorization::GetSecurityInfo;
    use windows_sys::Win32::Security::{
        GetAce, GetSecurityDescriptorControl, IsWellKnownSid, WinBuiltinAdministratorsSid,
        WinCreatorOwnerRightsSid, WinLocalSystemSid, ACCESS_ALLOWED_ACE, ACL,
        CONTAINER_INHERIT_ACE, OBJECT_INHERIT_ACE, SE_DACL_PROTECTED,
    };
    use windows_sys::Win32::Storage::FileSystem::FILE_ALL_ACCESS;

    struct ObservedAcl {
        descriptor: LocalSecurityDescriptor,
        dacl: *mut ACL,
    }

    impl ObservedAcl {
        fn read(path: &Path, directory: bool) -> Self {
            let file = open_for_acl(path, directory).expect("open filesystem ACL");
            let mut descriptor = ptr::null_mut();
            let mut dacl = ptr::null_mut();
            // SAFETY: the file handle and output pointers are valid.
            // The returned descriptor owns the DACL and is LocalFree-managed.
            let status = unsafe {
                GetSecurityInfo(
                    file.as_raw_handle().cast(),
                    SE_FILE_OBJECT,
                    DACL_SECURITY_INFORMATION,
                    ptr::null_mut(),
                    ptr::null_mut(),
                    &mut dacl,
                    ptr::null_mut(),
                    &mut descriptor,
                )
            };
            assert_eq!(
                status,
                0,
                "read filesystem DACL: {}",
                io::Error::from_raw_os_error(status as i32)
            );
            assert!(!descriptor.is_null());
            assert!(!dacl.is_null());
            Self {
                descriptor: LocalSecurityDescriptor(descriptor),
                dacl,
            }
        }

        fn assert_private(&self, expected_ace_flags: u8) {
            let mut control = 0;
            let mut revision = 0;
            // SAFETY: the descriptor is owned by `self` and both outputs live
            // for the call.
            assert_ne!(
                unsafe {
                    GetSecurityDescriptorControl(self.descriptor.0, &mut control, &mut revision)
                },
                0
            );
            assert_ne!(
                control & SE_DACL_PROTECTED,
                0,
                "DACL must reject inheritance"
            );

            // Exactly the three approved principals must remain. An
            // ACCESS_ALLOWED_ACE stores its variable-length SID at SidStart.
            assert_eq!(unsafe { (*self.dacl).AceCount }, 3);
            let mut owner_rights = 0;
            let mut local_system = 0;
            let mut administrators = 0;
            for index in 0..3 {
                let mut raw_ace = ptr::null_mut();
                // SAFETY: the index is below AceCount and `raw_ace` is a valid
                // out pointer.
                assert_ne!(unsafe { GetAce(self.dacl, index, &mut raw_ace) }, 0);
                let ace = raw_ace.cast::<ACCESS_ALLOWED_ACE>();
                // ACCESS_ALLOWED_ACE_TYPE is zero in the Win32 ABI.
                assert_eq!(unsafe { (*ace).Header.AceType }, 0);
                assert_eq!(unsafe { (*ace).Header.AceFlags }, expected_ace_flags);
                assert_eq!(unsafe { (*ace).Mask }, FILE_ALL_ACCESS);
                let sid = unsafe { ptr::addr_of_mut!((*ace).SidStart).cast() };
                if unsafe { IsWellKnownSid(sid, WinCreatorOwnerRightsSid) } != 0 {
                    owner_rights += 1;
                } else if unsafe { IsWellKnownSid(sid, WinLocalSystemSid) } != 0 {
                    local_system += 1;
                } else if unsafe { IsWellKnownSid(sid, WinBuiltinAdministratorsSid) } != 0 {
                    administrators += 1;
                } else {
                    panic!("unapproved SID in private DACL");
                }
            }
            assert_eq!((owner_rights, local_system, administrators), (1, 1, 1));
        }
    }

    #[test]
    fn private_acl_replaces_inherited_or_world_access_for_directories_and_files() {
        let temp = tempfile::tempdir().expect("temp dir");
        let private_dir = temp.path().join("private ünicode");
        fs::create_dir(&private_dir).expect("create private dir candidate");
        apply_sddl(&private_dir, "D:(A;OICI;FA;;;WD)", true).expect("seed world directory ACL");

        protect_directory(&private_dir).expect("protect directory");
        ObservedAcl::read(&private_dir, true)
            .assert_private((OBJECT_INHERIT_ACE | CONTAINER_INHERIT_ACE) as u8);

        let private_file = private_dir.join("secret ünicode.json");
        fs::write(&private_file, b"secret").expect("create private file candidate");
        apply_sddl(&private_file, "D:(A;;FA;;;WD)", false).expect("seed world file ACL");

        protect_file(&private_file).expect("protect file");
        ObservedAcl::read(&private_file, false).assert_private(0);
    }
}
