import type { AgentMessage } from "@mariozechner/pi-agent-core";
import type { ImageContent, Message, TextContent } from "@mariozechner/pi-ai";

type Attachment = {
  type: "image" | "document";
  fileName: string;
  mimeType: string;
  content: string;
  extractedText?: string;
};

type UserMessageWithAttachments = {
  role: "user-with-attachments";
  content: string | (TextContent | ImageContent)[];
  timestamp: number;
  attachments?: Attachment[];
};

type ArtifactMessage = {
  role: "artifact";
};

declare module "@mariozechner/pi-agent-core" {
  interface CustomAgentMessages {
    "user-with-attachments": UserMessageWithAttachments;
    artifact: ArtifactMessage;
  }
}

function isUserMessageWithAttachments(msg: AgentMessage): msg is UserMessageWithAttachments {
  return msg.role === "user-with-attachments";
}

function isArtifactMessage(msg: AgentMessage): msg is ArtifactMessage {
  return msg.role === "artifact";
}

function convertAttachments(attachments: Attachment[]): (TextContent | ImageContent)[] {
  const content: (TextContent | ImageContent)[] = [];

  for (const attachment of attachments) {
    if (attachment.type === "image") {
      content.push({
        type: "image",
        data: attachment.content,
        mimeType: attachment.mimeType,
      });
    } else if (attachment.type === "document" && attachment.extractedText) {
      content.push({
        type: "text",
        text: `\n\n[Document: ${attachment.fileName}]\n${attachment.extractedText}`,
      });
    }
  }

  return content;
}

export function defaultConvertToLlm(messages: AgentMessage[]): Message[] {
  return messages
    .filter((message) => !isArtifactMessage(message))
    .map((message) => {
      if (isUserMessageWithAttachments(message)) {
        const content: (TextContent | ImageContent)[] = typeof message.content === "string"
          ? [{ type: "text", text: message.content }]
          : [...message.content];

        if (message.attachments?.length) {
          content.push(...convertAttachments(message.attachments));
        }

        return {
          role: "user",
          content,
          timestamp: message.timestamp,
        } satisfies Message;
      }

      if (message.role === "user" || message.role === "assistant" || message.role === "toolResult") {
        return message;
      }

      return null;
    })
    .filter((message): message is Message => message !== null);
}
