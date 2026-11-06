/**
 * One file in the hidden `appDataFolder` of the signed-in user's Google Drive,
 * over plain `fetch` (SPEC §16.4). Pure — no Angular — and the `fetch` is passed
 * in, so every response path tests without Google.
 */

export const DRIVE_BACKUP_FILENAME = 'megaten-companion-backup.json';

const API = 'https://www.googleapis.com/drive/v3/files';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files';
const BOUNDARY = 'megaten-companion-backup-part';

export type FetchFn = (url: string, init?: RequestInit) => Promise<Response>;

export type DriveErrorKind = 'unauthorized' | 'forbidden' | 'not-found' | 'failed';

/** A Drive request that didn't succeed. `reason` is safe to show the user. */
export class DriveError extends Error {
  constructor(
    readonly kind: DriveErrorKind,
    readonly reason: string,
  ) {
    super(reason);
    this.name = 'DriveError';
  }
}

/** The backup file's id (the newest, should duplicates ever exist), or null. */
export async function findBackupFile(fetchFn: FetchFn, token: string): Promise<string | null> {
  const query = new URLSearchParams({
    spaces: 'appDataFolder',
    q: `name='${DRIVE_BACKUP_FILENAME}' and trashed=false`,
    orderBy: 'modifiedTime desc',
    fields: 'files(id,modifiedTime)',
  });
  const response = await send(fetchFn, `${API}?${query}`, { headers: auth(token) });
  const body = (await response.json()) as { files?: readonly { id: string }[] };
  return body.files?.[0]?.id ?? null;
}

/** Overwrite the backup file with `text`, creating it the first time. */
export async function saveBackupFile(fetchFn: FetchFn, token: string, text: string): Promise<void> {
  const id = await findBackupFile(fetchFn, token);
  if (id !== null) {
    await send(fetchFn, `${UPLOAD}/${id}?uploadType=media`, {
      method: 'PATCH',
      headers: { ...auth(token), 'Content-Type': 'application/json' },
      body: text,
    });
    return;
  }
  const metadata = JSON.stringify({ name: DRIVE_BACKUP_FILENAME, parents: ['appDataFolder'] });
  await send(fetchFn, `${UPLOAD}?uploadType=multipart`, {
    method: 'POST',
    headers: { ...auth(token), 'Content-Type': `multipart/related; boundary=${BOUNDARY}` },
    body:
      `--${BOUNDARY}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n` +
      `--${BOUNDARY}\r\nContent-Type: application/json\r\n\r\n${text}\r\n` +
      `--${BOUNDARY}--`,
  });
}

/** The backup file's text. Throws a `not-found` {@link DriveError} when there is none. */
export async function loadBackupFile(fetchFn: FetchFn, token: string): Promise<string> {
  const id = await findBackupFile(fetchFn, token);
  if (id === null) throw new DriveError('not-found', 'no backup file');
  const response = await send(fetchFn, `${API}/${id}?alt=media`, { headers: auth(token) });
  return response.text();
}

function auth(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` };
}

async function send(fetchFn: FetchFn, url: string, init: RequestInit): Promise<Response> {
  let response: Response;
  try {
    response = await fetchFn(url, init);
  } catch (err) {
    throw new DriveError('failed', err instanceof Error ? err.message : String(err));
  }
  if (response.ok) return response;
  const reason = await errorReason(response);
  if (response.status === 401) throw new DriveError('unauthorized', reason);
  if (response.status === 403) throw new DriveError('forbidden', reason);
  if (response.status === 404) throw new DriveError('not-found', reason);
  throw new DriveError('failed', reason);
}

/** Drive's own error text when the body has one, otherwise the status. */
async function errorReason(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: { message?: unknown } };
    if (typeof body.error?.message === 'string' && body.error.message) return body.error.message;
  } catch {
    /* not JSON: fall through to the status */
  }
  return `HTTP ${response.status}`;
}
