// Validate references before they reach the browser/terminal, including split chunks.
export class CitationFilter {
  private pending = '';
  private ticks = 0;
  private fenced = false;
  private inlineDelimiter = 0;
  invalidCount = 0;
  constructor(private known: (n: number) => boolean) {}
  push(delta: string): string {
    let output = '';
    for (const char of delta) {
      if (char === '`' && !this.pending) { this.ticks++; output += char; continue; }
      if (this.ticks) {
        if (this.ticks >= 3 && !this.inlineDelimiter) this.fenced = !this.fenced;
        else if (!this.fenced) this.inlineDelimiter = this.inlineDelimiter === this.ticks ? 0 : this.inlineDelimiter || this.ticks;
        this.ticks = 0;
      }
      if (this.fenced || this.inlineDelimiter) { output += char; continue; }
      if (this.pending) {
        this.pending += char;
        if (char === ']') {
          const match = /^\[(s?\d+(?:\s*,\s*s?\d+)*)\]$/i.exec(this.pending);
          output += match ? match[1].split(',').map(value => {
            const n = Number(value.trim().replace(/^s/i, ''));
            if (Number.isSafeInteger(n) && n > 0 && this.known(n)) return `[${n}]`;
            this.invalidCount++; return '[unverified source]';
          }).join('') : this.pending;
          this.pending = '';
        } else if (!/^\[(?:s?\d*(?:\s*,\s*s?\d*)*)?$/i.test(this.pending)) {
          if (char === '[') { output += this.pending.slice(0,-1); this.pending = '['; }
          else { output += this.pending; this.pending = ''; }
        }
      } else if (char === '[') this.pending = '[';
      else output += char;
    }
    return output;
  }
  flush(): string {
    const tail = this.pending;
    this.pending = '';
    if (/^\[s?\d/i.test(tail)) { this.invalidCount++; return '[unverified source]'; }
    return tail;
  }
}
export function validateCitations(text: string, known: (n: number) => boolean): string {
  const filter = new CitationFilter(known);
  return filter.push(text) + filter.flush();
}
