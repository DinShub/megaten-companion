/**
 * Renders a model reply to HTML. Model output is untrusted and the API key sits in
 * this page's storage, so this is an allow-list: every character is escaped first
 * and only the tags written below can appear. Links and images are deliberately
 * not rendered, so a reply can't send anything anywhere.
 */
export function renderMarkdown(source: string): string {
  const out: string[] = [];
  const lines = source.replace(/\r\n?/g, '\n').split('\n');

  for (let i = 0; i < lines.length; ) {
    const line = lines[i];

    if (line.trim() === '') {
      i++;
      continue;
    }
    if (line.trimStart().startsWith('```')) {
      const body: string[] = [];
      for (i++; i < lines.length && !lines[i].trimStart().startsWith('```'); i++) body.push(lines[i]);
      i++; // the closing fence, which a reply still streaming may not have yet
      out.push(`<pre><code>${escapeHtml(body.join('\n'))}</code></pre>`);
      continue;
    }
    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading) {
      // Inside a chat bubble, every heading is a small one.
      out.push(`<h4>${inline(heading[2])}</h4>`);
      i++;
      continue;
    }
    if (/^\s*(---+|\*\*\*+)\s*$/.test(line)) {
      out.push('<hr>');
      i++;
      continue;
    }
    if (isTableRow(line) && i + 1 < lines.length && isTableDivider(lines[i + 1])) {
      const head = cells(line);
      const rows: string[][] = [];
      for (i += 2; i < lines.length && isTableRow(lines[i]); i++) rows.push(cells(lines[i]));
      out.push(
        '<div class="ai-table"><table><thead><tr>' +
          head.map((c) => `<th>${inline(c)}</th>`).join('') +
          '</tr></thead><tbody>' +
          rows.map((row) => `<tr>${row.map((c) => `<td>${inline(c)}</td>`).join('')}</tr>`).join('') +
          '</tbody></table></div>',
      );
      continue;
    }
    const listKind = listKindOf(line);
    if (listKind) {
      const items: string[] = [];
      for (; i < lines.length && listKindOf(lines[i]) === listKind; i++) {
        items.push(`<li>${inline(lines[i].replace(LIST_MARKER, ''))}</li>`);
      }
      out.push(`<${listKind}>${items.join('')}</${listKind}>`);
      continue;
    }

    const para: string[] = [];
    for (; i < lines.length && lines[i].trim() !== '' && !startsBlock(lines, i); i++) para.push(lines[i].trim());
    if (para.length === 0) para.push(lines[i++].trim()); // never stall on an unclaimed line
    out.push(`<p>${inline(para.join(' '))}</p>`);
  }
  return out.join('');
}

const LIST_MARKER = /^\s*(?:[-*+]|\d+[.)])\s+/;

function listKindOf(line: string): 'ul' | 'ol' | null {
  if (/^\s*[-*+]\s+/.test(line)) return 'ul';
  if (/^\s*\d+[.)]\s+/.test(line)) return 'ol';
  return null;
}

function isTableRow(line: string): boolean {
  return line.trim().startsWith('|') && line.trim().length > 1;
}

function isTableDivider(line: string): boolean {
  return /^\s*\|?[\s:|-]*-[\s:|-]*\|?\s*$/.test(line) && line.includes('|');
}

function cells(line: string): string[] {
  return line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());
}

function startsBlock(lines: readonly string[], i: number): boolean {
  const line = lines[i];
  return (
    line.trimStart().startsWith('```') ||
    /^#{1,6}\s/.test(line) ||
    listKindOf(line) !== null ||
    (isTableRow(line) && i + 1 < lines.length && isTableDivider(lines[i + 1]))
  );
}

/** Inline code first, so its contents stay literal, then bold and italics on the rest. */
function inline(raw: string): string {
  return raw
    .split(/(`[^`]+`)/g)
    .map((part) =>
      part.length > 2 && part.startsWith('`') && part.endsWith('`')
        ? `<code>${escapeHtml(part.slice(1, -1))}</code>`
        : escapeHtml(part)
            .replace(/\*\*(?=\S)(.+?)(?<=\S)\*\*/g, '<strong>$1</strong>')
            .replace(/(^|[^*\w])\*(?=\S)([^*]+?)(?<=\S)\*(?![*\w])/g, '$1<em>$2</em>'),
    )
    .join('');
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
