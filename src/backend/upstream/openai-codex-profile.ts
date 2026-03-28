import fs from "node:fs";
import path from "node:path";
import type { OAuthTokens } from "../auth/token-store.js";

export type OpenAICodexProfile = {
  auth_mode: "chatgpt";
  tokens: {
    access_token: string;
    refresh_token?: string;
    id_token?: string;
    account_id?: string;
  };
  last_refresh: string;
  expires_at: string;
  email?: string;
};

export function readOpenAICodexProfile(filePath: string): OAuthTokens | null {
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf8")) as Partial<OpenAICodexProfile>;
    if (
      parsed.auth_mode !== "chatgpt" ||
      !parsed.tokens ||
      typeof parsed.tokens.access_token !== "string" ||
      typeof parsed.last_refresh !== "string" ||
      typeof parsed.expires_at !== "string"
    ) {
      return null;
    }

    return {
      accessToken: parsed.tokens.access_token,
      refreshToken: parsed.tokens.refresh_token,
      idToken: parsed.tokens.id_token,
      accountId: parsed.tokens.account_id,
      expiresAt: parsed.expires_at,
      email: parsed.email,
      lastRefreshAt: parsed.last_refresh,
      profileStored: true,
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

export function writeOpenAICodexProfile(filePath: string, tokens: OAuthTokens): void {
  const directory = path.dirname(filePath);
  fs.mkdirSync(directory, { recursive: true });
  const payload: OpenAICodexProfile = {
    auth_mode: "chatgpt",
    tokens: {
      access_token: tokens.accessToken,
      refresh_token: tokens.refreshToken,
      id_token: tokens.idToken,
      account_id: tokens.accountId,
    },
    last_refresh: tokens.lastRefreshAt ?? new Date().toISOString(),
    expires_at: tokens.expiresAt,
    email: tokens.email,
  };
  const tmpPath = `${filePath}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(payload, null, 2));
  fs.renameSync(tmpPath, filePath);
}
