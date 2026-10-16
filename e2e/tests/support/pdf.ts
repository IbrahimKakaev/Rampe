import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

export interface PdfContent {
  readonly pages: number;
  /** The text of every page, spaces collapsed. */
  readonly text: string;
  /** True for a tagged PDF: its content is marked with a structure. */
  readonly marked: boolean;
  /** The roles found in the structure tree, such as H1, Table or TH. */
  readonly roles: ReadonlySet<string>;
  /** The document language, as the PDF declares it. */
  readonly language: string | null;
}

interface StructNode {
  readonly role?: string;
  readonly children?: readonly StructNode[];
}

function collectRoles(node: StructNode | null, roles: Set<string>): void {
  if (node === null) {
    return;
  }
  if (node.role !== undefined) {
    roles.add(node.role);
  }
  for (const child of node.children ?? []) {
    collectRoles(child, roles);
  }
}

/** Reads a PDF as a screen reader would get it: its text, its structure and its language. */
export async function readPdf(bytes: Buffer): Promise<PdfContent> {
  const loading = getDocument({ data: new Uint8Array(bytes), disableFontFace: true });
  const document = await loading.promise;
  try {
    const texts: string[] = [];
    const roles = new Set<string>();
    for (let number = 1; number <= document.numPages; number += 1) {
      const page = await document.getPage(number);
      const content = await page.getTextContent();
      texts.push(content.items.map((item) => ('str' in item ? item.str : '')).join(' '));
      collectRoles((await page.getStructTree()) as StructNode | null, roles);
    }
    const { info } = await document.getMetadata();
    // pdfjs declares an object but returns a Map (pdf.worker.mjs, #readMarkInfo): both are read.
    const markInfo: unknown = await document.getMarkInfo();
    const marked =
      markInfo instanceof Map
        ? markInfo.get('Marked') === true
        : (markInfo as { Marked?: unknown } | null)?.Marked === true;
    const language = (info as { Language?: unknown }).Language;
    return {
      pages: document.numPages,
      text: texts.join(' ').replace(/\s+/g, ' '),
      marked,
      roles,
      language: typeof language === 'string' ? language : null,
    };
  } finally {
    await loading.destroy();
  }
}
