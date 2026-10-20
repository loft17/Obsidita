export interface TagMatch {
  line: number;
  idx: number;
  text: string;
}

export interface NoteLink {
  target: string;
  embed: boolean;
  markdown: boolean;
}

export function findTags(lines: readonly string[]): TagMatch[];
export function findLinks(content: string): NoteLink[];
export function linkFileName(link: NoteLink): string;
export function resolveLink(link: NoteLink, notePath: string, paths: readonly string[]): string | null;
