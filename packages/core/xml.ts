// A small, tolerant XML parser — enough for MusicXML (elements, attributes, text; comments,
// processing instructions, DOCTYPE and CDATA handled). Pure TypeScript so it runs anywhere,
// including React Native, which has no DOMParser.

export type XmlElement = {
  name: string;
  attrs: Record<string, string>;
  children: XmlElement[];
  text: string;
};

const ENTITIES: Record<string, string> = { lt: "<", gt: ">", amp: "&", quot: '"', apos: "'" };

function decode(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e: string) => {
    if (e[0] === "#") {
      const code = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : m;
    }
    return ENTITIES[e] ?? m;
  });
}

export function parseXml(src: string): XmlElement {
  const root: XmlElement = { name: "#document", attrs: {}, children: [], text: "" };
  const stack: XmlElement[] = [root];
  let i = 0;
  const n = src.length;
  while (i < n) {
    const lt = src.indexOf("<", i);
    const textEnd = lt === -1 ? n : lt;
    if (textEnd > i) stack[stack.length - 1].text += decode(src.slice(i, textEnd));
    if (lt === -1) break;
    if (src.startsWith("<!--", lt)) {
      const end = src.indexOf("-->", lt + 4);
      i = end === -1 ? n : end + 3;
    } else if (src.startsWith("<![CDATA[", lt)) {
      const end = src.indexOf("]]>", lt + 9);
      stack[stack.length - 1].text += src.slice(lt + 9, end === -1 ? n : end);
      i = end === -1 ? n : end + 3;
    } else if (src.startsWith("<?", lt)) {
      const end = src.indexOf("?>", lt + 2);
      i = end === -1 ? n : end + 2;
    } else if (src.startsWith("<!", lt)) {
      // DOCTYPE (possibly with an internal subset in [...])
      let depth = 0;
      let j = lt + 2;
      for (; j < n; j++) {
        if (src[j] === "[") depth++;
        else if (src[j] === "]") depth--;
        else if (src[j] === ">" && depth <= 0) break;
      }
      i = j + 1;
    } else if (src[lt + 1] === "/") {
      const end = src.indexOf(">", lt);
      const name = src.slice(lt + 2, end).trim();
      // Pop to the matching element (tolerating a stray close tag).
      for (let k = stack.length - 1; k > 0; k--) {
        if (stack[k].name === name) {
          stack.length = k;
          break;
        }
      }
      i = end === -1 ? n : end + 1;
    } else {
      // Start tag: find its end, skipping ">" inside quoted attribute values.
      let j = lt + 1;
      let quote: string | null = null;
      for (; j < n; j++) {
        const c = src[j];
        if (quote) {
          if (c === quote) quote = null;
        } else if (c === '"' || c === "'") quote = c;
        else if (c === ">") break;
      }
      let body = src.slice(lt + 1, j);
      const selfClosing = body.endsWith("/");
      if (selfClosing) body = body.slice(0, -1);
      const nameMatch = /^[^\s/>]+/.exec(body);
      const el: XmlElement = { name: nameMatch ? nameMatch[0] : "", attrs: {}, children: [], text: "" };
      const attrRe = /([^\s=]+)\s*=\s*("([^"]*)"|'([^']*)')/g;
      let a: RegExpExecArray | null;
      const rest = body.slice(el.name.length);
      while ((a = attrRe.exec(rest))) el.attrs[a[1]] = decode(a[3] ?? a[4] ?? "");
      stack[stack.length - 1].children.push(el);
      if (!selfClosing) stack.push(el);
      i = j + 1;
    }
  }
  return root;
}

/** First child element with this name. */
export function child(el: XmlElement | undefined, name: string): XmlElement | undefined {
  return el?.children.find((c) => c.name === name);
}

/** All child elements with this name. */
export function children(el: XmlElement | undefined, name: string): XmlElement[] {
  return el ? el.children.filter((c) => c.name === name) : [];
}

/** Trimmed text of a child element (or of the element itself with no name). */
export function textOf(el: XmlElement | undefined, name?: string): string {
  const target = name ? child(el, name) : el;
  return target ? target.text.trim() : "";
}

/** First descendant with this name (depth-first). */
export function find(el: XmlElement | undefined, name: string): XmlElement | undefined {
  if (!el) return undefined;
  for (const c of el.children) {
    if (c.name === name) return c;
    const deep = find(c, name);
    if (deep) return deep;
  }
  return undefined;
}
