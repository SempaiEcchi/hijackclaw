import fs from "node:fs";
import {
  readOpenAICodexProfile,
  writeOpenAICodexProfile,
} from "../upstream/openai-codex-profile.js";

export type OAuthTokens = {
  accessToken: string;
  refreshToken?: string;
  idToken?: string;
  expiresAt: string;
  email?: string;
  accountId?: string;
  lastRefreshAt?: string;
  profileStored?: boolean;
};

export interface TokenStore {
  get(): OAuthTokens | null;
  set(tokens: OAuthTokens): void;
  clear(): void;
  isPersistent?(): boolean;
}

export class InMemoryTokenStore implements TokenStore {
  private tokens: OAuthTokens | null = null;

  get(): OAuthTokens | null {
    return this.tokens ? { ...this.tokens } : null;
  }

  set(tokens: OAuthTokens): void {
    this.tokens = { ...tokens };
  }

  clear(): void {
    this.tokens = null;
  }

  isPersistent(): boolean {
    return false;
  }
}

export class FileTokenStore implements TokenStore {
  private tokens: OAuthTokens | null = null;

  constructor(private readonly filePath: string) {
    this.tokens = readOpenAICodexProfile(this.filePath);
  }

  get(): OAuthTokens | null {
    return this.tokens ? { ...this.tokens } : null;
  }

  set(tokens: OAuthTokens): void {
    const normalized: OAuthTokens = {
      ...tokens,
      lastRefreshAt: tokens.lastRefreshAt ?? new Date().toISOString(),
      profileStored: true,
    };
    writeOpenAICodexProfile(this.filePath, normalized);
    this.tokens = normalized;
  }

  clear(): void {
    this.tokens = null;
    try {
      fs.unlinkSync(this.filePath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        throw error;
      }
    }
  }

  isPersistent(): boolean {
    return true;
  }
}

export function isTokenExpired(
  tokens: OAuthTokens,
  now: Date,
  skewMs = 60_000,
): boolean {
  return Date.parse(tokens.expiresAt) - now.getTime() <= skewMs;
}
