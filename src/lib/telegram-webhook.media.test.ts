import { describe, expect, test } from "bun:test";

import { mediaFrom, type TelegramMessage } from "./telegram-webhook.server";

function photoMessage(widths: number[]): TelegramMessage {
  return {
    message_id: 1,
    date: 1_700_000_000,
    chat: { id: -1001234, type: "supergroup", title: "Past Uhud" },
    photo: widths.map((width, index) => ({
      file_id: `photo-${index}`,
      file_unique_id: `unique-${index}`,
      width,
      height: width,
    })),
  };
}

describe("mediaFrom accepts images as evidence", () => {
  test("photo message: largest size is the file, smaller size is the thumbnail", () => {
    const media = mediaFrom(photoMessage([320, 800, 1280]));
    expect(media).not.toBeNull();
    expect(media?.mediaType).toBe("photo");
    expect(media?.fileId).toBe("photo-2");
    expect(media?.thumbnailFileId).not.toBe("photo-2");
    expect(media?.durationSeconds).toBeNull();
  });

  test("single-size photo still saves with no thumbnail", () => {
    const media = mediaFrom(photoMessage([640]));
    expect(media?.mediaType).toBe("photo");
    expect(media?.fileId).toBe("photo-0");
    expect(media?.thumbnailFileId).toBeNull();
  });

  test("image document (image/* mime) is accepted", () => {
    const media = mediaFrom({
      message_id: 2,
      date: 1_700_000_000,
      chat: { id: -1001234, type: "supergroup" },
      document: {
        file_id: "img-doc-1",
        file_unique_id: "img-unique-1",
        mime_type: "image/jpeg",
        file_size: 120_000,
      },
    });
    expect(media?.mediaType).toBe("image_document");
    expect(media?.fileId).toBe("img-doc-1");
  });

  test("video message still accepted", () => {
    const media = mediaFrom({
      message_id: 3,
      date: 1_700_000_000,
      chat: { id: -1001234, type: "supergroup" },
      video: {
        file_id: "vid-1",
        file_unique_id: "vid-unique-1",
        duration: 12,
      },
    });
    expect(media?.mediaType).toBe("video");
  });

  test("non-media message returns null", () => {
    expect(
      mediaFrom({
        message_id: 4,
        date: 1_700_000_000,
        chat: { id: -1001234, type: "supergroup" },
        text: "9107",
      }),
    ).toBeNull();
    expect(mediaFrom(undefined)).toBeNull();
  });
});
