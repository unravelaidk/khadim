pub fn try_repair_json(raw: &str) -> Option<serde_json::Value> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return None;
    }

    if let Ok(value) = serde_json::from_str::<serde_json::Value>(trimmed) {
        return Some(value);
    }

    let mut in_string = false;
    let mut escape = false;
    let mut brace_depth: i32 = 0;
    let mut bracket_depth: i32 = 0;

    for ch in trimmed.chars() {
        if escape {
            escape = false;
            continue;
        }
        if ch == '\\' && in_string {
            escape = true;
            continue;
        }
        if ch == '"' {
            in_string = !in_string;
            continue;
        }
        if !in_string {
            match ch {
                '{' => brace_depth += 1,
                '}' => brace_depth -= 1,
                '[' => bracket_depth += 1,
                ']' => bracket_depth -= 1,
                _ => {}
            }
        }
    }

    let mut repaired = trimmed.to_string();
    if in_string {
        repaired.push('"');
    }
    for _ in 0..bracket_depth {
        repaired.push(']');
    }
    for _ in 0..brace_depth {
        repaired.push('}');
    }

    serde_json::from_str::<serde_json::Value>(&repaired).ok()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn valid_json_is_returned_unchanged() {
        let v = try_repair_json(r#"{"key": "value"}"#).unwrap();
        assert_eq!(v["key"], "value");
    }

    #[test]
    fn empty_string_returns_none() {
        assert!(try_repair_json("").is_none());
        assert!(try_repair_json("   ").is_none());
    }

    #[test]
    fn unclosed_object_is_repaired() {
        let v = try_repair_json(r#"{"a": 1"#).unwrap();
        assert_eq!(v["a"], 1);
    }

    #[test]
    fn unclosed_array_is_repaired() {
        let v = try_repair_json(r#"[1, 2, 3"#).unwrap();
        assert_eq!(v[0], 1);
        assert_eq!(v[2], 3);
    }

    #[test]
    fn nested_unclosed_is_repaired() {
        let v = try_repair_json(r#"{"a": {"b": 1}"#).unwrap();
        assert_eq!(v["a"]["b"], 1);
    }

    #[test]
    fn unclosed_string_in_object_is_repaired() {
        // Truncated mid-string value
        let v = try_repair_json(r#"{"msg": "hello"#).unwrap();
        assert!(v["msg"].as_str().unwrap().starts_with("hello"));
    }

    #[test]
    fn valid_array_is_returned() {
        let v = try_repair_json("[1,2,3]").unwrap();
        assert_eq!(v.as_array().unwrap().len(), 3);
    }

    #[test]
    fn completely_invalid_returns_none() {
        assert!(try_repair_json("not json at all !!!").is_none());
    }
}
