import {
  createActor,
  type backendInterface,
  type CreateActorOptions,
  ExternalBlob,
} from "./backend";
import { StorageClient } from "./utils/StorageClient";
import { HttpAgent } from "@icp-sdk/core/agent";

const STORAGE_URL = "https://blob.caffeine.ai";
const DEFAULT_BUCKET_NAME = "default-bucket";
const DEFAULT_PROJECT_ID = "0000000-0000-0000-0000-00000000000";

interface JsonConfig {
  backend_host: string;
  backend_canister_id: string;
  project_id: string;
  ii_derivation_origin: string;
}

interface Config {
  backend_host?: string;
  backend_canister_id: string;
  storage_gateway_url: string;
  bucket_name: string;
  project_id: string;
  ii_derivation_origin?: string;
}

let configCache: Config | null = null;

export async function loadConfig(): Promise<Config> {
  if (configCache) return configCache;

  const backendCanisterId = process.env.CANISTER_ID_BACKEND;
  const envBaseUrl = process.env.BASE_URL || "/";
  const baseUrl = envBaseUrl.endsWith("/") ? envBaseUrl : `${envBaseUrl}/`;

  try {
    const response = await fetch(`${baseUrl}env.json`);
    const config = (await response.json()) as JsonConfig;

    if (!backendCanisterId && config.backend_canister_id === "undefined") {
      throw new Error("CANISTER_ID_BACKEND is not set");
    }

    const fullConfig: Config = {
      backend_host:
        config.backend_host === "undefined" ? undefined : config.backend_host,
      backend_canister_id:
        config.backend_canister_id === "undefined"
          ? backendCanisterId!
          : config.backend_canister_id,
      storage_gateway_url: STORAGE_URL,
      bucket_name: DEFAULT_BUCKET_NAME,
      project_id:
        config.project_id !== "undefined"
          ? config.project_id
          : DEFAULT_PROJECT_ID,
      ii_derivation_origin:
        config.ii_derivation_origin === "undefined"
          ? undefined
          : config.ii_derivation_origin,
    };

    console.log("CONFIG LOADED:", fullConfig);

    configCache = fullConfig;
    return fullConfig;
  } catch (err) {
    console.error("CONFIG LOAD FAILED:", err);

    if (!backendCanisterId) {
      throw new Error("CANISTER_ID_BACKEND is not set");
    }

    return {
      backend_host: undefined,
      backend_canister_id: backendCanisterId,
      storage_gateway_url: STORAGE_URL,
      bucket_name: DEFAULT_BUCKET_NAME,
      project_id: DEFAULT_PROJECT_ID,
      ii_derivation_origin: undefined,
    };
  }
}

function extractAgentErrorMessage(error: string): string {
  const match = error.match(/with message:\s*'([^']+)'/s);
  return match ? match[1] : error;
}

function processError(e: unknown): never {
  if (e && typeof e === "object" && "message" in e) {
    const msg = extractAgentErrorMessage(String(e.message));

    if (msg.includes("IC0508")) {
      throw new Error("Storage backend is stopped");
    }

    throw new Error(msg);
  }
  throw e;
}

async function maybeLoadMockBackend(): Promise<backendInterface | null> {
  if (import.meta.env.VITE_USE_MOCK !== "true") return null;

  try {
    const mockModules = import.meta.glob("./mocks/backend.{ts,tsx,js,jsx}");
    const path = Object.keys(mockModules)[0];
    if (!path) return null;

    const mod = (await mockModules[path]()) as {
      mockBackend?: backendInterface;
    };

    return mod.mockBackend ?? null;
  } catch {
    return null;
  }
}

export async function createActorWithConfig(
  options?: CreateActorOptions,
): Promise<backendInterface> {
  const mock = await maybeLoadMockBackend();
  if (mock) return mock;

  const config = await loadConfig();

  const agent = new HttpAgent({
    ...(options?.agentOptions || {}),
    host: config.backend_host,
  });

  if (config.backend_host?.includes("localhost")) {
    await agent.fetchRootKey().catch(console.error);
  }

  const storageClient = new StorageClient(
    config.bucket_name,
    config.storage_gateway_url,
    config.backend_canister_id,
    config.project_id,
    agent,
  );

  const SENTINEL = "!caf!";

  const uploadFile = async (file: ExternalBlob): Promise<Uint8Array> => {
    console.log("Uploading file to:", config.storage_gateway_url);

    try {
      const { hash } = await storageClient.putFile(
        await file.getBytes(),
        file.onProgress,
      );

      return new TextEncoder().encode(SENTINEL + hash);
    } catch (err) {
      console.error("UPLOAD ERROR:", err);
      throw err;
    }
  };

  const downloadFile = async (bytes: Uint8Array): Promise<ExternalBlob> => {
    const decoded = new TextDecoder().decode(bytes);
    const hash = decoded.replace(SENTINEL, "");

    const url = await storageClient.getDirectURL(hash);

    console.log("Downloading from:", url);

    return ExternalBlob.fromURL(url);
  };

  return createActor(
    config.backend_canister_id,
    uploadFile,
    downloadFile,
    {
      ...options,
      agent,
      processError,
    },
  );
}
