import { ensureSkinStylesheet } from './skin-stylesheet';

describe('ensureSkinStylesheet', () => {
  const links = (skin: string) => document.head.querySelectorAll(`link[data-skin="${skin}"]`);

  it('adds one relative <link> per skin and reuses it', () => {
    const first = ensureSkinStylesheet('abyss', 10);
    const again = ensureSkinStylesheet('abyss', 10);
    expect(again).toBe(first);
    expect(links('abyss').length).toBe(1);
    expect(links('abyss')[0].getAttribute('href')).toBe('skin-abyss.css');
  });

  it('resolves when the sheet loads', async () => {
    const pending = ensureSkinStylesheet('comp', 60_000);
    links('comp')[0].dispatchEvent(new Event('load'));
    await expect(pending).resolves.toBeUndefined();
  });

  it('never blocks: a sheet that does not answer resolves on the timeout', async () => {
    await expect(ensureSkinStylesheet('midnight-channel', 5)).resolves.toBeUndefined();
  });
});
