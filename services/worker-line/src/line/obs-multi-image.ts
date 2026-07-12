import { Buffer } from "node:buffer";

/** Max images per grid (LINE app allows more; cap for UI/safety). */
export const MAX_IMAGES_PER_MESSAGE = 10;

/**
 * Build X-Talk-Meta header value for multi-image grid uploads.
 * Ported from CHRLINE createTalkMeta (GID / GSEQ / GTOTAL).
 */
function buildTalkMeta(hmap: Record<string, string>): string {
  // Thrift binary: struct field id=18, type MAP<string,string>.
  //   [13, 0, 18, 11, 11] = MAP field header (id 0x0012, keyType 11, valType 11)
  //   i32 entry count, then per-entry (len+key)(len+value), then a single
  //   struct-stop byte (0x00) AFTER the loop.
  const sqrdBase = [13, 0, 18, 11, 11];
  const keys = Object.keys(hmap);
  const sqrd: number[] = [...sqrdBase, ...i32Bytes(keys.length)];
  for (const key of keys) {
    sqrd.push(...stringBytes(key));
    sqrd.push(...stringBytes(hmap[key]!));
  }
  sqrd.push(0);
  const data = Buffer.from(sqrd);
  const msg = JSON.stringify({ message: data.toString("base64") });
  return Buffer.from(msg, "utf8").toString("base64");
}

function i32Bytes(n: number): number[] {
  return [(n >> 24) & 0xff, (n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

function stringBytes(s: string): number[] {
  const buf = Buffer.from(s, "utf8");
  return [...i32Bytes(buf.length), ...buf];
}

type PlainObsClient = {
  base?: {
    obs?: {
      uploadObjectForService?: (options: {
        data: Blob;
        oType: string;
        obsPath: string;
        params?: Record<string, string | undefined>;
        filename?: string;
        addHeaders?: Record<string, string>;
      }) => Promise<{ objId: string; objHash: string; headers: Headers }>;
      client?: {
        authToken?: string;
        getReqseq?: (category: string) => Promise<number>;
      };
    };
  };
};

export type ImageUploadInput = {
  bytes: Buffer;
  filename: string;
  mimeType: string;
};

async function uploadPlainImageViaObs(
  client: PlainObsClient,
  to: string,
  image: ImageUploadInput,
  talkMeta?: string,
): Promise<{ objId: string; headers: Headers }> {
  const obs = client.base?.obs;
  const obsClient = obs?.client;
  if (!obs?.uploadObjectForService || !obsClient?.authToken || !obsClient.getReqseq) {
    throw new Error("Plain OBS upload prerequisites missing");
  }

  const ext = image.filename.includes(".")
    ? image.filename.split(".").pop()!
    : "jpg";
  const uploadName = image.filename || `line.${ext}`;
  const reqseqValue = await obsClient.getReqseq("talk");
  const param: Record<string, string | undefined> = {
    ver: "2.0",
    name: uploadName,
    type: "image",
    oid: "reqseq",
    tomid: to,
    reqseq: reqseqValue.toString(),
    cat: "original",
  };
  const toType: "talk" | "g2" =
    to[0] === "m" || to[0] === "t" ? "g2" : "talk";
  const blob = new Blob([image.bytes], { type: image.mimeType });

  const { objId, headers } = await obs.uploadObjectForService({
    data: blob,
    oType: "image",
    obsPath: `${toType}/m/reqseq`,
    filename: param.name,
    params: param,
    addHeaders: talkMeta ? { "X-Talk-Meta": talkMeta } : undefined,
  });

  if (!objId) {
    throw new Error("OBS upload returned empty objId");
  }
  return { objId, headers };
}

/**
 * TalkService grid (groups 'c' / 1:1 'u'): the OBS response returns
 * `x-line-message-gid` on the first upload via the X-Talk-Meta header; that
 * server GID is reused for the remaining images so they render as one grid.
 */
async function uploadMultipleImagesAsGrid(
  client: PlainObsClient,
  to: string,
  images: ImageUploadInput[],
): Promise<{ gid?: string; messageIds: string[] }> {
  const total = images.length;
  let gid: string | undefined;
  const messageIds: string[] = [];

  for (let i = 0; i < images.length; i++) {
    const talkMeta = buildTalkMeta({
      GID: gid ?? "0",
      GSEQ: String(i + 1),
      GTOTAL: String(total),
    });
    const result = await uploadPlainImageViaObs(
      client,
      to,
      images[i]!,
      talkMeta,
    );
    messageIds.push(result.objId);
    if (i === 0) {
      gid = result.headers.get("x-line-message-gid") ?? undefined;
    }
  }

  return { gid, messageIds };
}

async function uploadSeparate(
  client: PlainObsClient,
  to: string,
  images: ImageUploadInput[],
): Promise<string[]> {
  const messageIds: string[] = [];
  for (const image of images) {
    const single = await uploadPlainImageViaObs(client, to, image);
    messageIds.push(single.objId);
  }
  return messageIds;
}

/**
 * Upload one or more images to a chat.
 *
 * - Groups / 1:1 (TalkService): multiple images render as one grid bubble via
 *   the X-Talk-Meta header (server assigns the GID on the first upload).
 * - OpenChats (SquareService / g2): the g2 OBS endpoint ignores X-Talk-Meta and
 *   SquareService.sendMessage is text-only, so image grids are NOT available to
 *   external clients — images are sent individually instead.
 */
export async function uploadMultipleImagesPlainViaObs(
  client: PlainObsClient,
  to: string,
  images: ImageUploadInput[],
): Promise<{ gid?: string; messageIds: string[]; grid: boolean }> {
  if (images.length === 0) {
    return { messageIds: [], grid: false };
  }

  if (images.length === 1) {
    const single = await uploadPlainImageViaObs(client, to, images[0]!);
    return { messageIds: [single.objId], grid: false };
  }

  // OpenChat (square) has no external grid mechanism: send images separately.
  const isSquare = to[0] === "m" || to[0] === "t";
  if (isSquare) {
    const messageIds = await uploadSeparate(client, to, images);
    return { messageIds, grid: false };
  }

  try {
    const grid = await uploadMultipleImagesAsGrid(client, to, images);
    return { ...grid, grid: true };
  } catch (err) {
    console.warn(
      `[obs] grid upload failed for ${to}, falling back to separate uploads:`,
      err instanceof Error ? err.message : err,
    );
    const messageIds = await uploadSeparate(client, to, images);
    return { messageIds, grid: false };
  }
}
