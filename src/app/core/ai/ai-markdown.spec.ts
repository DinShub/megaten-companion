import { renderMarkdown } from './ai-markdown';

describe('renderMarkdown', () => {
  it('renders the formatting a chat reply uses', () => {
    expect(renderMarkdown('**Bold** and *soft* and `code`')).toBe('<p><strong>Bold</strong> and <em>soft</em> and <code>code</code></p>');
    expect(renderMarkdown('- one\n- two')).toBe('<ul><li>one</li><li>two</li></ul>');
    expect(renderMarkdown('1. one\n2. two')).toBe('<ol><li>one</li><li>two</li></ol>');
    expect(renderMarkdown('## Plan')).toBe('<h4>Plan</h4>');
  });

  it('renders a table', () => {
    const html = renderMarkdown('| Name | Lv |\n|---|---|\n| Arsene | 1 |');
    expect(html).toContain('<th>Name</th>');
    expect(html).toContain('<td>Arsene</td>');
  });

  it('separates a paragraph from the list right after it', () => {
    expect(renderMarkdown('Try these:\n- A')).toBe('<p>Try these:</p><ul><li>A</li></ul>');
  });

  it('escapes HTML everywhere, so a reply cannot inject markup', () => {
    for (const attack of [
      '<img src=x onerror=alert(1)>',
      '**<script>alert(1)</script>**',
      '- <svg onload=alert(1)>',
      '| <b onclick=x>a</b> |\n|---|\n| <i>b</i> |',
      '```\n<script>alert(1)</script>\n```',
      '`<script>`',
      '# <script>alert(1)</script>',
    ]) {
      const html = renderMarkdown(attack);
      expect(html).not.toMatch(/<(img|script|svg|b |i>)/);
      expect(html).toContain('&lt;');
    }
  });

  it('does not render links or images', () => {
    const html = renderMarkdown('[click](https://evil.example) ![x](https://evil.example/a.png)');
    expect(html).not.toContain('<a');
    expect(html).not.toContain('<img');
    expect(html).not.toContain('href');
  });

  it('copes with a reply that is still streaming', () => {
    expect(renderMarkdown('```\nunfinished')).toBe('<pre><code>unfinished</code></pre>');
    expect(renderMarkdown('half **bold')).toBe('<p>half **bold</p>');
    expect(renderMarkdown('| only a pipe row')).toBe('<p>| only a pipe row</p>');
    expect(renderMarkdown('')).toBe('');
  });
});
