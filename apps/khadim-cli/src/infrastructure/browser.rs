use std::ffi::OsString;
use std::io;
use std::process::{Command, Stdio};

struct BrowserCommand {
    program: &'static str,
    arguments: Vec<OsString>,
}

fn browser_command_for(platform: &str, url: &str) -> BrowserCommand {
    match platform {
        "macos" => BrowserCommand {
            program: "open",
            arguments: vec![url.into()],
        },
        // `start` is a cmd.exe built-in, not an executable. Spawning it
        // directly always fails on Windows. rundll32 invokes the registered
        // URL protocol handler without putting an untrusted URL through a
        // command-shell parser.
        "windows" => BrowserCommand {
            program: "rundll32.exe",
            arguments: vec!["url.dll,FileProtocolHandler".into(), url.into()],
        },
        _ => BrowserCommand {
            program: "xdg-open",
            arguments: vec![url.into()],
        },
    }
}

fn launch_browser(
    platform: &str,
    url: &str,
    spawn: impl FnOnce(&BrowserCommand) -> io::Result<()>,
) -> io::Result<()> {
    let specification = browser_command_for(platform, url);
    spawn(&specification)
}

/// Open a URL in the default system browser. A successful result means the
/// platform launcher started; callers should still display the URL as a
/// manual fallback because the registered browser can reject it later.
pub fn open_url(url: &str) -> io::Result<()> {
    launch_browser(std::env::consts::OS, url, |specification| {
        Command::new(specification.program)
            .args(&specification.arguments)
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn()
            .map(|_| ())
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn browser_commands_are_native_executables_on_every_desktop_os() {
        let url = "https://example.test/oauth?state=a&value=two words";

        let macos = browser_command_for("macos", url);
        assert_eq!(macos.program, "open");
        assert_eq!(macos.arguments, [OsString::from(url)]);

        let linux = browser_command_for("linux", url);
        assert_eq!(linux.program, "xdg-open");
        assert_eq!(linux.arguments, [OsString::from(url)]);

        let windows = browser_command_for("windows", url);
        assert_eq!(windows.program, "rundll32.exe");
        assert_eq!(
            windows.arguments,
            [
                OsString::from("url.dll,FileProtocolHandler"),
                OsString::from(url),
            ]
        );
    }

    #[test]
    fn launcher_failures_are_returned_to_the_caller() {
        let error = launch_browser("linux", "https://example.test", |_| {
            Err(io::Error::new(io::ErrorKind::NotFound, "missing opener"))
        })
        .expect_err("launcher error must be visible");

        assert_eq!(error.kind(), io::ErrorKind::NotFound);
        assert_eq!(error.to_string(), "missing opener");
    }
}
