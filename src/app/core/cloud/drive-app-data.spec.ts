import {
  DRIVE_BACKUP_FILENAME,
  DriveError,
  type FetchFn,
  findBackupFile,
  loadBackupFile,
  saveBackupFile,
} from './drive-app-data';

interface Call {
  readonly url: string;
  readonly init: RequestInit | undefined;
}

/** A `fetch` that answers from a queue and records what it was asked. */
function fakeFetch(...responses: readonly (Response | Error)[]) {
  const calls: Call[] = [];
  const queue = [...responses];
  const fetchFn: FetchFn = async (url, init) => {
    calls.push({ url, init });
    const next = queue.shift();
    if (!next) throw new Error('unexpected request');
    if (next instanceof Error) throw next;
    return next;
  };
  return { fetchFn, calls };
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const found = (...ids: readonly string[]) => json({ files: ids.map((id) => ({ id })) });

async function failure(promise: Promise<unknown>): Promise<DriveError> {
  const err = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(DriveError);
  return err as DriveError;
}

describe('drive-app-data', () => {
  it('looks in the app-data space, newest first, with the token', async () => {
    const { fetchFn, calls } = fakeFetch(found('newest', 'older'));
    expect(await findBackupFile(fetchFn, 'tok')).toBe('newest');

    const url = new URL(calls[0].url);
    expect(url.searchParams.get('spaces')).toBe('appDataFolder');
    expect(url.searchParams.get('orderBy')).toBe('modifiedTime desc');
    expect(url.searchParams.get('q')).toContain(DRIVE_BACKUP_FILENAME);
    expect(calls[0].init?.headers).toEqual({ Authorization: 'Bearer tok' });
  });

  it('creates the file in the app-data folder the first time', async () => {
    const { fetchFn, calls } = fakeFetch(found(), json({ id: 'new' }));
    await saveBackupFile(fetchFn, 'tok', '{"a":1}');

    const { url, init } = calls[1];
    expect(url).toContain('uploadType=multipart');
    expect(init?.method).toBe('POST');
    expect(init?.body).toContain('"parents":["appDataFolder"]');
    expect(init?.body).toContain(`"name":"${DRIVE_BACKUP_FILENAME}"`);
    expect(init?.body).toContain('{"a":1}');
  });

  it('overwrites the existing file on later saves', async () => {
    const { fetchFn, calls } = fakeFetch(found('abc'), json({ id: 'abc' }));
    await saveBackupFile(fetchFn, 'tok', '{"a":2}');

    const { url, init } = calls[1];
    expect(url).toContain('/files/abc?uploadType=media');
    expect(init?.method).toBe('PATCH');
    expect(init?.body).toBe('{"a":2}');
  });

  it('downloads the newest file’s content', async () => {
    const { fetchFn, calls } = fakeFetch(found('abc', 'old'), new Response('the backup'));
    expect(await loadBackupFile(fetchFn, 'tok')).toBe('the backup');
    expect(calls[1].url).toContain('/files/abc?alt=media');
  });

  it('reports not-found when nothing has been saved', async () => {
    const { fetchFn, calls } = fakeFetch(found());
    expect((await failure(loadBackupFile(fetchFn, 'tok'))).kind).toBe('not-found');
    expect(calls.length).toBe(1);
  });

  it.each([
    [401, 'unauthorized'],
    [403, 'forbidden'],
    [404, 'not-found'],
    [500, 'failed'],
  ])('maps HTTP %i to %s, with Drive’s own message', async (status, kind) => {
    const { fetchFn } = fakeFetch(json({ error: { message: 'Drive says no' } }, status));
    const err = await failure(findBackupFile(fetchFn, 'tok'));
    expect(err.kind).toBe(kind);
    expect(err.reason).toBe('Drive says no');
  });

  it('falls back to the status when the error body isn’t JSON', async () => {
    const { fetchFn } = fakeFetch(new Response('<html>', { status: 503 }));
    expect((await failure(findBackupFile(fetchFn, 'tok'))).reason).toBe('HTTP 503');
  });

  it('maps a network failure to failed', async () => {
    const { fetchFn } = fakeFetch(new TypeError('Failed to fetch'));
    const err = await failure(saveBackupFile(fetchFn, 'tok', '{}'));
    expect(err.kind).toBe('failed');
    expect(err.reason).toBe('Failed to fetch');
  });
});
