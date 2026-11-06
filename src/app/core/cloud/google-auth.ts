import { DOCUMENT, inject, Injectable } from '@angular/core';

/**
 * The Web OAuth client (SPEC §16.3). Client IDs are public by design: this one
 * ships in the page, and no secret is involved anywhere.
 */
export const GOOGLE_CLIENT_ID = '628279263342-3nmnu95hcltp8n2vau77fnmtciodou9s.apps.googleusercontent.com';

export const DRIVE_APPDATA_SCOPE = 'https://www.googleapis.com/auth/drive.appdata';

const GIS_SCRIPT = 'https://accounts.google.com/gsi/client';

/** Refuse a token this close to expiry, so it can't die between two Drive calls. */
const EXPIRY_MARGIN_MS = 60_000;

interface TokenResponse {
  readonly access_token?: string;
  readonly expires_in?: number | string;
  readonly error?: string;
}

interface GoogleOAuth2 {
  initTokenClient(config: {
    client_id: string;
    scope: string;
    prompt: string;
    callback: (response: TokenResponse) => void;
    error_callback: (error: { type?: string }) => void;
  }): { requestAccessToken(): void };
  hasGrantedAllScopes(response: TokenResponse, scope: string): boolean;
}

declare global {
  interface Window {
    google?: { accounts?: { oauth2?: GoogleOAuth2 } };
  }
}

export type GoogleAuthErrorKind = 'unreachable' | 'cancelled' | 'scope-denied';

export class GoogleAuthError extends Error {
  constructor(readonly kind: GoogleAuthErrorKind) {
    super(kind);
    this.name = 'GoogleAuthError';
  }
}

/**
 * Sign-in through Google Identity Services. The access token lives in memory
 * only, so it is gone on reload, and a still-valid one is reused without a popup.
 */
@Injectable({ providedIn: 'root' })
export class GoogleAuth {
  private readonly document = inject(DOCUMENT);

  private script: Promise<void> | null = null;
  private token: { readonly value: string; readonly expiresAt: number } | null = null;

  /** Load the GIS script once. A failed load is retried by the next call. */
  preload(): Promise<void> {
    this.script ??= new Promise<void>((resolve, reject) => {
      const script = this.document.createElement('script');
      script.src = GIS_SCRIPT;
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => {
        script.remove();
        this.script = null;
        reject(new GoogleAuthError('unreachable'));
      };
      this.document.head.appendChild(script);
    });
    return this.script;
  }

  /**
   * A valid access token, signing in if needed. Call it straight from a click
   * handler: with the script already preloaded the popup opens synchronously,
   * which is what keeps browsers from blocking it.
   */
  getToken(): Promise<string> {
    if (this.token && Date.now() < this.token.expiresAt - EXPIRY_MARGIN_MS) {
      return Promise.resolve(this.token.value);
    }
    const oauth2 = this.oauth2();
    return oauth2 ? this.signIn(oauth2) : this.preload().then(() => this.signInAfterLoad());
  }

  /** Forget the token, after Drive has rejected it. */
  clearToken(): void {
    this.token = null;
  }

  private oauth2(): GoogleOAuth2 | undefined {
    return this.document.defaultView?.google?.accounts?.oauth2;
  }

  private signInAfterLoad(): Promise<string> {
    const oauth2 = this.oauth2();
    return oauth2 ? this.signIn(oauth2) : Promise.reject(new GoogleAuthError('unreachable'));
  }

  private signIn(oauth2: GoogleOAuth2): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      oauth2
        .initTokenClient({
          client_id: GOOGLE_CLIENT_ID,
          scope: DRIVE_APPDATA_SCOPE,
          // Only ask for consent the first time, not on every sign-in.
          prompt: '',
          callback: (response) => {
            if (response.error || !response.access_token) {
              reject(new GoogleAuthError('cancelled'));
            } else if (!oauth2.hasGrantedAllScopes(response, DRIVE_APPDATA_SCOPE)) {
              reject(new GoogleAuthError('scope-denied'));
            } else {
              this.token = {
                value: response.access_token,
                expiresAt: Date.now() + Number(response.expires_in ?? 0) * 1000,
              };
              resolve(response.access_token);
            }
          },
          error_callback: () => reject(new GoogleAuthError('cancelled')),
        })
        .requestAccessToken();
    });
  }
}
