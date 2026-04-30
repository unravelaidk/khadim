use std::collections::HashMap;

#[test]
fn test_wasm_module_loads_and_has_exports() {
    let home = std::env::var("HOME").unwrap();
    let wasm_path = format!("{home}/.local/share/khadim/plugins/hello-world/plugin.wasm");

    if !std::path::Path::new(&wasm_path).exists() {
        eprintln!("Skipping: {wasm_path} not found");
        return;
    }

    let wasm_bytes = std::fs::read(&wasm_path).unwrap();
    eprintln!("Read {} bytes", wasm_bytes.len());

    let engine = wasmtime::Engine::default();
    let module = wasmtime::Module::new(&engine, &wasm_bytes).unwrap();

    let export_names: Vec<String> = module.exports().map(|e| e.name().to_string()).collect();
    eprintln!("Exports: {:?}", export_names);

    assert!(
        export_names.contains(&"memory".to_string()),
        "Missing 'memory' export"
    );
    assert!(
        export_names.contains(&"__alloc".to_string()),
        "Missing '__alloc' export"
    );
    assert!(
        export_names.contains(&"khadim_info".to_string()),
        "Missing 'khadim_info' export"
    );
    assert!(
        export_names.contains(&"khadim_list_tools".to_string()),
        "Missing 'khadim_list_tools' export"
    );
    assert!(
        export_names.contains(&"khadim_execute_tool".to_string()),
        "Missing 'khadim_execute_tool' export"
    );

    let import_names: Vec<String> = module
        .imports()
        .map(|i| format!("{}::{}", i.module(), i.name()))
        .collect();
    eprintln!("Imports: {:?}", import_names);

    // Now try to instantiate
    let mut linker = wasmtime::Linker::new(&engine);
    let mut store = wasmtime::Store::new(&engine, ());

    // The module should have no imports (it's a standalone plugin)
    let instance = linker.instantiate(&mut store, &module);
    match &instance {
        Ok(_) => eprintln!("Instance created OK"),
        Err(e) => eprintln!("Instance failed: {e}"),
    }
    let instance = instance.unwrap();

    // Unpack i64: high 32 = ptr, low 32 = len
    fn unpack(packed: i64) -> (usize, usize) {
        let ptr = (packed >> 32) as u32 as usize;
        let len = (packed & 0xFFFF_FFFF) as u32 as usize;
        (ptr, len)
    }

    // Try calling khadim_info  (returns i64)
    let info_fn = instance
        .get_typed_func::<(), i64>(&mut store, "khadim_info")
        .unwrap();
    let packed = info_fn.call(&mut store, ()).unwrap();
    let (ptr, len) = unpack(packed);
    eprintln!("khadim_info returned ptr={ptr}, len={len}");

    let memory = instance.get_memory(&mut store, "memory").unwrap();
    let data = memory.data(&store);
    let json_str = std::str::from_utf8(&data[ptr..ptr + len]).unwrap();
    eprintln!("Plugin info: {json_str}");

    let info: serde_json::Value = serde_json::from_str(json_str).unwrap();
    assert_eq!(info["name"], "hello-world");

    // Try calling khadim_list_tools
    let list_fn = instance
        .get_typed_func::<(), i64>(&mut store, "khadim_list_tools")
        .unwrap();
    let packed = list_fn.call(&mut store, ()).unwrap();
    let (ptr, len) = unpack(packed);
    let data = memory.data(&store);
    let json_str = std::str::from_utf8(&data[ptr..ptr + len]).unwrap();
    eprintln!("Plugin tools: {json_str}");

    let tools: Vec<serde_json::Value> = serde_json::from_str(json_str).unwrap();
    assert_eq!(tools.len(), 3);
    assert_eq!(tools[0]["name"], "greet");
    assert_eq!(tools[1]["name"], "count_words");
    assert_eq!(tools[2]["name"], "reverse");

    // Try executing a tool
    let exec_fn = instance
        .get_typed_func::<(i32, i32, i32, i32), i64>(&mut store, "khadim_execute_tool")
        .unwrap();
    let alloc_fn = instance
        .get_typed_func::<i32, i32>(&mut store, "__alloc")
        .unwrap();

    let tool_name = b"greet";
    let args = br#"{"name":"Hanan","style":"pirate"}"#;

    let name_ptr = alloc_fn.call(&mut store, tool_name.len() as i32).unwrap();
    memory.data_mut(&mut store)[name_ptr as usize..name_ptr as usize + tool_name.len()]
        .copy_from_slice(tool_name);

    let args_ptr = alloc_fn.call(&mut store, args.len() as i32).unwrap();
    memory.data_mut(&mut store)[args_ptr as usize..args_ptr as usize + args.len()]
        .copy_from_slice(args);

    let packed = exec_fn
        .call(
            &mut store,
            (
                name_ptr,
                tool_name.len() as i32,
                args_ptr,
                args.len() as i32,
            ),
        )
        .unwrap();
    let (ptr, len) = unpack(packed);
    let data = memory.data(&store);
    let result_str = std::str::from_utf8(&data[ptr..ptr + len]).unwrap();
    eprintln!("Execute result: {result_str}");

    let result: serde_json::Value = serde_json::from_str(result_str).unwrap();
    assert_eq!(result["is_error"], false);
    assert!(result["content"].as_str().unwrap().contains("Hanan"));
    assert!(result["content"].as_str().unwrap().contains("Ahoy"));
}
