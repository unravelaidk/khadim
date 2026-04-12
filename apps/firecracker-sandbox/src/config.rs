#[derive(Debug, Clone)]
pub struct Config {
    pub port: u16,
    pub firecracker_binary: String,
    pub runtime_dir: String,
    pub startup_timeout_ms: u64,
    pub guest_agent_port: u16,
    pub guest_agent_wait_timeout_ms: u64,
    pub firecracker_id_flag: bool,
    pub boot_args: String,
    pub tap_device: Option<String>,
    pub host_ip: Option<String>,
    pub guest_mac: String,
    pub guest_ip: Option<String>,
    pub default_vcpu_count: u8,
    pub default_memory_mib: u32,
    pub default_kernel_image: Option<String>,
    pub default_rootfs_image: Option<String>,
}

impl Config {
    pub fn from_env() -> Self {
        Self {
            port: read_u16("PORT", 4100),
            firecracker_binary: read_string("FIRECRACKER_BIN", "firecracker"),
            runtime_dir: read_string("FIRECRACKER_RUNTIME_DIR", "/tmp/khadim-firecracker"),
            startup_timeout_ms: read_u64("FIRECRACKER_STARTUP_TIMEOUT_MS", 5000),
            guest_agent_port: read_u16("FIRECRACKER_GUEST_AGENT_PORT", 4020),
            guest_agent_wait_timeout_ms: read_u64("FIRECRACKER_GUEST_AGENT_WAIT_TIMEOUT_MS", 15000),
            firecracker_id_flag: read_bool("FIRECRACKER_USE_ID_FLAG", true),
            boot_args: read_string(
                "FIRECRACKER_BOOT_ARGS",
                "console=ttyS0 reboot=k panic=1 pci=off",
            ),
            tap_device: read_optional("FIRECRACKER_TAP_DEVICE"),
            host_ip: read_optional("FIRECRACKER_HOST_IP"),
            guest_mac: read_string("FIRECRACKER_GUEST_MAC", "06:00:AC:10:00:02"),
            guest_ip: read_optional("FIRECRACKER_GUEST_IP"),
            default_vcpu_count: read_u8("FIRECRACKER_DEFAULT_VCPU", 2),
            default_memory_mib: read_u32("FIRECRACKER_DEFAULT_MEMORY_MIB", 2048),
            default_kernel_image: read_optional("FIRECRACKER_KERNEL_IMAGE"),
            default_rootfs_image: read_optional("FIRECRACKER_ROOTFS_IMAGE"),
        }
    }
}

fn read_optional(name: &str) -> Option<String> {
    std::env::var(name).ok().filter(|value| !value.is_empty())
}

fn read_string(name: &str, default: &str) -> String {
    std::env::var(name).unwrap_or_else(|_| default.to_string())
}

fn read_u16(name: &str, default: u16) -> u16 {
    std::env::var(name)
        .ok()
        .and_then(|value| value.parse::<u16>().ok())
        .unwrap_or(default)
}

fn read_u8(name: &str, default: u8) -> u8 {
    std::env::var(name)
        .ok()
        .and_then(|value| value.parse::<u8>().ok())
        .unwrap_or(default)
}

fn read_u32(name: &str, default: u32) -> u32 {
    std::env::var(name)
        .ok()
        .and_then(|value| value.parse::<u32>().ok())
        .unwrap_or(default)
}

fn read_u64(name: &str, default: u64) -> u64 {
    std::env::var(name)
        .ok()
        .and_then(|value| value.parse::<u64>().ok())
        .unwrap_or(default)
}

fn read_bool(name: &str, default: bool) -> bool {
    std::env::var(name)
        .ok()
        .and_then(|value| match value.trim().to_ascii_lowercase().as_str() {
            "1" | "true" | "yes" | "on" => Some(true),
            "0" | "false" | "no" | "off" => Some(false),
            _ => None,
        })
        .unwrap_or(default)
}
