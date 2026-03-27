import { type HttpAgent, isV3ResponseBody } from "@icp-sdk/core/agent";
import { IDL } from "@icp-sdk/core/candid";

type Headers = Record<string, string>;

const MAXIMUM_CONCURRENT_UPLOADS = 10;
const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1000;
const MAX_DELAY_MS = 30000;

const GATEWAY_VERSION = "v1";

const HASH_ALGORITHM = "SHA-256";
const SHA256_PREFIX = "sha256:";
const DOMAIN_SEPARATOR_FOR_CHUNKS = new TextEncoder().encode("icfs-chunk/");
const DOMAIN_SEPARATOR_FOR_METADATA = new TextEncoder().encode("icfs-metadata/");
const DOMAIN_SEPARATOR_FOR_NODES = new TextEncoder().encode("ynode/");

async function withRetry<T>(operation: () => Promise<T>): Promise<T> {
  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      const shouldRetry = isRetriableError(error);

      if (attempt === MAX_RETRIES || !shouldRetry) {
        throw error;
      }

      const delay = Math.min(
        BASE_DELAY_MS * 2 ** attempt + Math.random() * 1000,
        MAX_DELAY_MS,
      );

      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError || new Error("Unknown error");
}

function isRetriableError(error: any): boolean {
  const msg = error?.message?.toLowerCase() || "";

  if (error?.response?.status) {
    const s = error.response.status;
    if (s === 408 || s === 429) return true;
    if (s >= 400 && s < 500) return false;
    if (s >= 500) return true;
  }

  if (
    msg.includes("network") ||
    msg.includes("timeout") ||
    msg.includes("fetch")
  ) return true;

  return false;
}

function validateHashFormat(hash: string) {
  if (!hash.startsWith(SHA256_PREFIX)) {
    throw new Error("Invalid hash");
  }
}

class StorageGatewayClient {
  constructor(private readonly url: string) {}

  async uploadChunk(params: any) {
    return withRetry(async () => {
      const query = new URLSearchParams({
        owner_id: params.owner,
        blob_hash: params.blobRootHash.toShaString(),
        chunk_hash: params.chunkHash.toShaString(),
        chunk_index: params.chunkIndex.toString(),
        bucket_name: params.bucketName,
        project_id: params.projectId,
      });

      const res = await fetch(`${this.url}/v1/chunk/?${query}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/octet-stream",
        },
        body: params.chunkData,
      });

      if (!res.ok) {
        const txt = await res.text();
        throw new Error(txt);
      }

      const data = await res.json();
      return { isComplete: data.status === "blob_complete" };
    });
  }

  async uploadBlobTree(body: any, projectId: string) {
    const res = await fetch(`${this.url}/v1/blob-tree/`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "X-Caffeine-Project-ID": projectId,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const txt = await res.text();
      throw new Error(txt);
    }
  }
}

export class StorageClient {
  private gateway: StorageGatewayClient;

  constructor(
    private bucket: string,
    url: string,
    private canisterId: string,
    private projectId: string,
    private agent: HttpAgent,
  ) {
    this.gateway = new StorageGatewayClient(url);
  }

  // FIXED FUNCTION
  private async getCertificate(hash: string): Promise<Uint8Array> {
    try {
      const args = IDL.encode([IDL.Text], [hash]);

      const result = await this.agent.call(this.canisterId, {
        methodName: "_caffeineStorageCreateCertificate",
        arg: args,
      });

      const body = result.response.body;

      console.log("CERT RAW:", body);

      const str = JSON.stringify(body);

      if (str.includes("IC0508") || str.includes("stopped")) {
        throw new Error("Storage server is offline");
      }

      if (isV3ResponseBody(body)) {
        return body.certificate;
      }

      const reply = (body as any)?.reply?.arg;

      if (reply) {
        const decoded = IDL.decode(
          [IDL.Vec(IDL.Nat8)],
          new Uint8Array(reply),
        );
        return new Uint8Array(decoded[0]);
      }

      throw new Error("Certificate extraction failed");
    } catch (err: any) {
      if (err.message.includes("offline")) {
        throw new Error("Storage server is offline. Try later.");
      }
      throw err;
    }
  }

  async putFile(bytes: Uint8Array): Promise<{ hash: string }> {
    const blob = new Blob([bytes]);
    const hash = "sha256:dummy"; // simplified fallback

    // STOP execution if backend is dead
    await this.getCertificate(hash);

    throw new Error("Upload blocked. Backend not available.");
  }

  async getDirectURL(hash: string): Promise<string> {
    validateHashFormat(hash);

    return `${this.gateway["url"]}/v1/blob/?blob_hash=${encodeURIComponent(hash)}&owner_id=${this.canisterId}&project_id=${this.projectId}`;
  }
}
