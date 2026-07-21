import { FileCode, FileText, Image, Table, X } from "@phosphor-icons/react";
import type { ChatAttachment } from "../../../shared/types";

function attachmentKind(name: string, type: string): "code" | "data" | "image" | "document" {
  const extension = name.split(".").pop()?.toLowerCase() ?? "";
  if (type.startsWith("image/")) return "image";
  if (["csv", "tsv", "xls", "xlsx"].includes(extension)) return "data";
  if (["js", "jsx", "ts", "tsx", "css", "html", "json", "py", "rs", "go", "java", "sh", "sql", "xml", "yaml", "yml"].includes(extension)) return "code";
  return "document";
}

export function AttachmentBadge({ attachment, removable }: { attachment: ChatAttachment; removable?: () => void }): React.JSX.Element {
  const kind = attachmentKind(attachment.name, attachment.type);
  const extension = attachment.name.includes(".") ? attachment.name.split(".").pop()?.toUpperCase() : "FILE";
  return (
    <span className={`attachment-badge ${kind}`}>
      <span className="attachment-type-icon">{kind === "code" ? <FileCode size={16} weight="regular" /> : kind === "data" ? <Table size={16} weight="regular" /> : kind === "image" ? <Image size={16} weight="regular" /> : <FileText size={16} weight="regular" />}</span>
      <span className="attachment-name"><strong>{attachment.name}</strong><small>{extension}</small></span>
      {removable && <button onClick={removable} aria-label={`Remove ${attachment.name}`}><X size={12} /></button>}
    </span>
  );
}
