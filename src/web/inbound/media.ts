import type { proto, WAMessage } from "@whiskeysockets/baileys";
import { downloadMediaMessage, normalizeMessageContent } from "@whiskeysockets/baileys";
import type { createWaSocket } from "../session.js";
import { logVerbose } from "../../globals.js";

const MAX_MEDIA_DOWNLOAD_ATTEMPTS = 3;
const MEDIA_DOWNLOAD_RETRY_DELAY_MS = 300;

function unwrapMessage(message: proto.IMessage | undefined): proto.IMessage | undefined {
  const normalized = normalizeMessageContent(message);
  return normalized;
}

function asBuffer(data: unknown): Buffer | undefined {
  if (Buffer.isBuffer(data)) {
    return data;
  }
  if (data instanceof Uint8Array) {
    return Buffer.from(data);
  }
  return undefined;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function downloadInboundMedia(
  msg: proto.IWebMessageInfo,
  sock: Awaited<ReturnType<typeof createWaSocket>>,
): Promise<{ buffer: Buffer; mimetype?: string; fileName?: string } | undefined> {
  const message = unwrapMessage(msg.message as proto.IMessage | undefined);
  if (!message) {
    return undefined;
  }
  const mimetype =
    message.imageMessage?.mimetype ??
    message.videoMessage?.mimetype ??
    message.documentMessage?.mimetype ??
    message.audioMessage?.mimetype ??
    message.stickerMessage?.mimetype ??
    undefined;
  const fileName = message.documentMessage?.fileName ?? undefined;
  if (
    !message.imageMessage &&
    !message.videoMessage &&
    !message.documentMessage &&
    !message.audioMessage &&
    !message.stickerMessage
  ) {
    return undefined;
  }

  const messageId = msg.key?.id ?? "<unknown>";
  for (let attempt = 1; attempt <= MAX_MEDIA_DOWNLOAD_ATTEMPTS; attempt += 1) {
    try {
      const downloaded = await downloadMediaMessage(
        msg as WAMessage,
        "buffer",
        {},
        {
          reuploadRequest: sock.updateMediaMessage,
          logger: sock.logger,
        },
      );
      const buffer = asBuffer(downloaded);
      if (buffer && buffer.byteLength > 0) {
        return { buffer, mimetype, fileName };
      }
      logVerbose(
        `downloadMediaMessage returned empty payload for ${messageId} (attempt ${attempt}/${MAX_MEDIA_DOWNLOAD_ATTEMPTS})`,
      );
    } catch (err) {
      logVerbose(
        `downloadMediaMessage failed for ${messageId} (attempt ${attempt}/${MAX_MEDIA_DOWNLOAD_ATTEMPTS}): ${String(err)}`,
      );
    }
    if (attempt < MAX_MEDIA_DOWNLOAD_ATTEMPTS) {
      await delay(MEDIA_DOWNLOAD_RETRY_DELAY_MS);
    }
  }
  return undefined;
}
