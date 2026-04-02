Use LiteParse whenever the user asks to parse, read, extract text from, summarize, or analyze a PDF.

Use the `parse_document` tool for this.

## When To Use It

- The user shares a PDF URL.
- The user points to a local PDF file path in the workspace.
- The user wants raw text extraction before summarization.
- The user needs a specific page range from a larger PDF.
- The PDF looks scanned or image-based and may need OCR.

## Tool Contract

`parse_document({ url?, path?, targetPages?, ocrEnabled? })`

- Provide exactly one of `url` or `path`.
- Use `targetPages` for large PDFs when only part of the file matters.
- Set `ocrEnabled: true` only for scanned PDFs or when normal extraction returns little text.

## Examples

```ts
parse_document({ url: "https://example.com/report.pdf" })
parse_document({ path: "/home/hanan/Documents/repo/khadim/files/report.pdf" })
parse_document({ url: "https://example.com/report.pdf", targetPages: "3-8" })
parse_document({ path: "./files/scan.pdf", ocrEnabled: true })
```

## Behavior

- Parse first, then summarize unless the user asked for raw output.
- If the PDF is large, start with the most relevant pages instead of the whole file.
- If both `url` and `path` are available, choose one and do not pass both.
