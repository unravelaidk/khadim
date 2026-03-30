If the user asks to "parse a PDF", "read this document", "extract text from a PDF",
"summarize this PDF", "analyze this document", or provides a URL ending in .pdf, .docx,
.xlsx, .pptx, or similar — use the `parse_document` tool.

## Capabilities

- **PDF text extraction** with spatial layout preservation
- **OCR** for scanned/image-based documents (set `ocrEnabled: true`)
- **Page targeting** to parse only specific pages from large documents
- Supports PDFs natively; DOCX, XLSX, PPTX when converted to PDF

## Usage Guidelines

1. **Always use a direct URL** to the file. If the user gives a Google Drive sharing
   link or similar, explain that a direct download URL is needed.
2. **For large documents** (50+ pages), use `targetPages` to focus on the relevant
   section first, then expand if needed.
3. **Enable OCR only when needed** — it is slower. Use it for scanned documents,
   image-heavy PDFs, or when initial extraction returns little/no text.
4. **After parsing**, summarize the key points unless the user asked for the raw text.
   Offer to go deeper into specific sections.

## Examples

```
// Basic PDF parsing
parse_document({ url: "https://example.com/report.pdf" })

// Parse specific pages of a large document
parse_document({ url: "https://example.com/textbook.pdf", targetPages: "1-10" })

// Scanned document with OCR
parse_document({ url: "https://example.com/scan.pdf", ocrEnabled: true })
```

## Combining with Other Tools

- **Web Search + Parse**: Search for a topic, find a PDF source, then parse it.
- **Parse + Slides**: Parse a document, then create a presentation summarizing it.
- **Parse + Code**: Extract data from a document and use it in code.
