import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { config } from "../../config.js";

export interface ObjectStorage {
  put(key: string, body: Buffer, contentType: string): Promise<void>;
  get(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
}

function localStorage(root: string): ObjectStorage {
  const base = resolve(root);
  const pathFor = (key: string) => {
    const path = resolve(base, key);
    if (!path.startsWith(base)) throw new Error("Invalid storage key");
    return path;
  };
  return {
    async put(key, body) {
      const path = pathFor(key);
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, body);
    },
    async get(key) {
      return readFile(pathFor(key));
    },
    async delete(key) {
      await rm(pathFor(key), { force: true });
    },
  };
}

function s3Storage(): ObjectStorage {
  const client = new S3Client({
    region: config.s3.region,
    endpoint: config.s3.endpoint || undefined,
    forcePathStyle: Boolean(config.s3.endpoint),
    credentials: {
      accessKeyId: config.s3.accessKeyId,
      secretAccessKey: config.s3.secretAccessKey,
    },
  });
  const bucket = config.s3.bucket;
  return {
    async put(key, body, contentType) {
      await client.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: contentType }));
    },
    async get(key) {
      const response = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
      const bytes = await response.Body?.transformToByteArray();
      if (!bytes) throw new Error("Empty object");
      return Buffer.from(bytes);
    },
    async delete(key) {
      await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
    },
  };
}

let singleton: ObjectStorage | undefined;

export function storage(): ObjectStorage {
  if (!singleton) {
    singleton = config.s3.bucket ? s3Storage() : localStorage(config.localStorageDir);
  }
  return singleton;
}
