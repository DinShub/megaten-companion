import { TestBed } from '@angular/core/testing';

import { DRIVE_APPDATA_SCOPE, GoogleAuth, GoogleAuthError } from './google-auth';

type TokenCallback = (response: { access_token?: string; expires_in?: number; error?: string }) => void;

/** Stands in for the `google` global the GIS script installs. */
function fakeGoogle(granted = true) {
  const state = {
    requests: 0,
    scope: '',
    respond: (() => undefined) as TokenCallback,
    fail: (() => undefined) as (error: { type?: string }) => void,
  };
  window.google = {
    accounts: {
      oauth2: {
        initTokenClient(config) {
          state.scope = config.scope;
          state.respond = config.callback;
          state.fail = config.error_callback;
          return { requestAccessToken: () => void state.requests++ };
        },
        hasGrantedAllScopes: () => granted,
      },
    },
  };
  return state;
}

const scripts = () => document.head.querySelectorAll('script[src*="accounts.google.com"]');

describe('GoogleAuth', () => {
  let auth: GoogleAuth;

  beforeEach(() => {
    auth = TestBed.inject(GoogleAuth);
  });

  afterEach(() => {
    delete window.google;
    scripts().forEach((s) => s.remove());
    TestBed.resetTestingModule();
  });

  async function kind(promise: Promise<unknown>): Promise<string> {
    const err = await promise.then(
      () => null,
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(GoogleAuthError);
    return (err as GoogleAuthError).kind;
  }

  it('adds the script once, however often it is preloaded', () => {
    void auth.preload();
    void auth.preload();
    expect(scripts().length).toBe(1);
  });

  it('retries the script after a failed load', async () => {
    const first = auth.preload();
    (scripts()[0] as HTMLScriptElement).dispatchEvent(new Event('error'));
    expect(await kind(first)).toBe('unreachable');
    expect(scripts().length).toBe(0);

    void auth.preload();
    expect(scripts().length).toBe(1);
  });

  it('opens the popup synchronously when the script is already loaded', () => {
    const google = fakeGoogle();
    void auth.getToken();
    expect(google.requests).toBe(1);
    expect(google.scope).toBe(DRIVE_APPDATA_SCOPE);
  });

  it('signs in after the script loads when pressed before it finished', async () => {
    const token = auth.getToken();
    const google = fakeGoogle();
    (scripts()[0] as HTMLScriptElement).dispatchEvent(new Event('load'));
    await Promise.resolve();
    await Promise.resolve();
    google.respond({ access_token: 'tok', expires_in: 3600 });
    expect(await token).toBe('tok');
  });

  it('reuses a valid token without another popup', async () => {
    const google = fakeGoogle();
    const first = auth.getToken();
    google.respond({ access_token: 'tok', expires_in: 3600 });
    await first;

    expect(await auth.getToken()).toBe('tok');
    expect(google.requests).toBe(1);
  });

  it('signs in again once the token is close to expiry', async () => {
    const google = fakeGoogle();
    const first = auth.getToken();
    google.respond({ access_token: 'tok', expires_in: 30 });
    await first;

    void auth.getToken();
    expect(google.requests).toBe(2);
  });

  it('signs in again after the token is cleared', async () => {
    const google = fakeGoogle();
    const first = auth.getToken();
    google.respond({ access_token: 'tok', expires_in: 3600 });
    await first;

    auth.clearToken();
    void auth.getToken();
    expect(google.requests).toBe(2);
  });

  it('reports a closed or blocked popup as cancelled', async () => {
    const google = fakeGoogle();
    const token = auth.getToken();
    google.fail({ type: 'popup_closed' });
    expect(await kind(token)).toBe('cancelled');
  });

  it('reports a refused consent as cancelled', async () => {
    const google = fakeGoogle();
    const token = auth.getToken();
    google.respond({ error: 'access_denied' });
    expect(await kind(token)).toBe('cancelled');
  });

  it('reports an unticked Drive scope, and keeps no token', async () => {
    const google = fakeGoogle(false);
    const token = auth.getToken();
    google.respond({ access_token: 'tok', expires_in: 3600 });
    expect(await kind(token)).toBe('scope-denied');

    void auth.getToken();
    expect(google.requests).toBe(2);
  });
});
