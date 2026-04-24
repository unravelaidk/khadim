use crate::error::AppError;
use futures_util::StreamExt;

pub async fn for_each_sse_event<F>(response: reqwest::Response, mut on_event: F) -> Result<(), AppError>
where
    F: FnMut(String) -> Result<(), AppError>,
{
    let mut stream = response.bytes_stream();
    let mut buffer = String::new();

    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(AppError::from)?;
        buffer.push_str(&String::from_utf8_lossy(&chunk));

        while let Some(index) = buffer.find("\n\n") {
            let raw = buffer[..index].to_string();
            buffer = buffer[index + 2..].to_string();

            let data = raw
                .lines()
                .filter_map(|line| line.strip_prefix("data:"))
                .map(|line| line.trim_start().to_string())
                .collect::<Vec<_>>();

            if !data.is_empty() {
                on_event(data.join("\n"))?;
            }
        }
    }

    if !buffer.trim().is_empty() {
        let data = buffer
            .lines()
            .filter_map(|line| line.strip_prefix("data:"))
            .map(|line| line.trim_start().to_string())
            .collect::<Vec<_>>();
        if !data.is_empty() {
            on_event(data.join("\n"))?;
        }
    }

    Ok(())
}
