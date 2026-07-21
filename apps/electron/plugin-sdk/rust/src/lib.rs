use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::cell::RefCell;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PluginInfo {
    pub id: String,
    pub name: String,
    pub version: String,
    pub api_version: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HarnessCapability {
    pub id: String,
    pub name: String,
    pub description: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub icon: Option<String>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct Capabilities {
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub harnesses: Vec<HarnessCapability>,
}

pub trait Plugin {
    fn info() -> PluginInfo;
    fn capabilities() -> Capabilities;
    fn call(operation: &str, input: Value) -> Result<Value, String>;
}

thread_local! {
    static OUTPUT: RefCell<Vec<u8>> = const { RefCell::new(Vec::new()) };
}

#[doc(hidden)]
pub fn encode_output(value: &Value) -> i64 {
    let bytes = serde_json::to_vec(value).unwrap_or_else(|error| {
        format!(r#"{{"ok":false,"error":"SDK serialization failed: {error}"}}"#).into_bytes()
    });
    OUTPUT.with(|output| {
        let mut output = output.borrow_mut();
        *output = bytes;
        ((output.as_ptr() as u64) << 32 | output.len() as u64) as i64
    })
}

#[doc(hidden)]
pub unsafe fn input_string(pointer: i32, length: i32) -> Result<String, String> {
    if pointer < 0 || length < 0 {
        return Err("Host passed an invalid input buffer".to_string());
    }
    let bytes = std::slice::from_raw_parts(pointer as *const u8, length as usize);
    std::str::from_utf8(bytes)
        .map(str::to_owned)
        .map_err(|error| format!("Host input is not UTF-8: {error}"))
}

#[macro_export]
macro_rules! export_plugin {
    ($plugin:ty) => {
        #[no_mangle]
        pub extern "C" fn khadim_abi_version() -> i32 { 1 }

        #[no_mangle]
        pub extern "C" fn khadim_alloc(length: i32) -> i32 {
            if length < 0 { return -1; }
            let bytes = vec![0u8; length as usize].into_boxed_slice();
            Box::into_raw(bytes) as *mut u8 as i32
        }

        #[no_mangle]
        pub unsafe extern "C" fn khadim_dealloc(pointer: i32, length: i32) {
            if pointer >= 0 && length >= 0 {
                let slice = core::ptr::slice_from_raw_parts_mut(pointer as *mut u8, length as usize);
                drop(Box::from_raw(slice));
            }
        }

        #[no_mangle]
        pub extern "C" fn khadim_plugin_info() -> i64 {
            $crate::encode_output(&serde_json::to_value(<$plugin as $crate::Plugin>::info()).unwrap())
        }

        #[no_mangle]
        pub extern "C" fn khadim_capabilities() -> i64 {
            $crate::encode_output(&serde_json::to_value(<$plugin as $crate::Plugin>::capabilities()).unwrap())
        }

        #[no_mangle]
        pub unsafe extern "C" fn khadim_call(
            operation_pointer: i32,
            operation_length: i32,
            input_pointer: i32,
            input_length: i32,
        ) -> i64 {
            let result = (|| {
                let operation = $crate::input_string(operation_pointer, operation_length)?;
                let input = $crate::input_string(input_pointer, input_length)?;
                let value = serde_json::from_str(&input).map_err(|error| format!("Invalid JSON input: {error}"))?;
                <$plugin as $crate::Plugin>::call(&operation, value)
            })();
            let envelope = match result {
                Ok(value) => serde_json::json!({ "ok": true, "value": value }),
                Err(error) => serde_json::json!({ "ok": false, "error": error }),
            };
            $crate::encode_output(&envelope)
        }
    };
}

pub fn require_object(value: Value) -> Result<serde_json::Map<String, Value>, String> {
    value.as_object().cloned().ok_or_else(|| "Plugin input must be a JSON object".to_string())
}

pub fn error(message: impl Into<String>) -> Value {
    json!({ "error": message.into() })
}
