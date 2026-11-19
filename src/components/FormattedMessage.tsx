import React from 'react';

interface FormattedMessageProps {
  content: string;
}

function renderInline(text: string, keyPrefix: string): React.ReactNode[] {
  const tokenRegex =
    /(\*\*\*[^*\n]+\*\*\*|\*\*[^*\n]+\*\*|__[^_\n]+__|<u>[^<\n]+<\/u>|\*[^*\n]+\*|`[^`\n]+`)/g;

  const nodes: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let idx = 0;

  while ((match = tokenRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index));
    }

    const token = match[0];
    const key = `${keyPrefix}-${idx++}`;

    if (token.startsWith('***') && token.endsWith('***')) {
      nodes.push(
        <strong key={key} className="font-semibold italic text-[#f3eee4]">
          {renderInline(token.slice(3, -3), `${key}-bi`)}
        </strong>
      );
    } else if (token.startsWith('**') && token.endsWith('**')) {
      nodes.push(
        <strong key={key} className="font-semibold text-[#f3eee4]">
          {renderInline(token.slice(2, -2), `${key}-b`)}
        </strong>
      );
    } else if (token.startsWith('__') && token.endsWith('__')) {
      nodes.push(
        <span key={key} className="underline decoration-[#d4af37]/80 underline-offset-2 text-[#f3eee4]">
          {renderInline(token.slice(2, -2), `${key}-u`)}
        </span>
      );
    } else if (token.startsWith('<u>') && token.endsWith('</u>')) {
      nodes.push(
        <span key={key} className="underline decoration-[#d4af37]/80 underline-offset-2 text-[#f3eee4]">
          {renderInline(token.slice(3, -4), `${key}-uh`)}
        </span>
      );
    } else if (token.startsWith('*') && token.endsWith('*')) {
      nodes.push(
        <em key={key} className="italic text-[#eadfcf]">
          {renderInline(token.slice(1, -1), `${key}-i`)}
        </em>
      );
    } else if (token.startsWith('`') && token.endsWith('`')) {
      nodes.push(
        <code
          key={key}
          className="font-mono text-xs bg-[#14110e] border border-[#2f2923] text-[#e8d59a] px-1.5 py-0.5 rounded"
        >
          {token.slice(1, -1)}
        </code>
      );
    } else {
      nodes.push(token);
    }

    lastIndex = tokenRegex.lastIndex;
  }

  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }

  return nodes;
}

export const FormattedMessage: React.FC<FormattedMessageProps> = ({ content }) => {
  const lines = content.split(/\r?\n/);
  const blocks: React.ReactNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    if (!trimmed) {
      i++;
      continue;
    }

    if (/^[-*_]{3,}$/.test(trimmed)) {
      blocks.push(<hr key={`hr-${i}`} className="border-[#2f2923] my-2" />);
      i++;
      continue;
    }

    const headingMatch = trimmed.match(/^(#{1,3})\s+(.+)$/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const headingClass =
        level === 1
          ? 'font-display text-base font-bold text-[#d4af37] pt-1'
          : level === 2
          ? 'font-display text-sm font-bold text-[#d4af37] pt-1'
          : 'text-sm font-semibold text-[#e8d59a] pt-0.5';
      blocks.push(
        <p key={`h-${i}`} className={headingClass}>
          {renderInline(headingMatch[2], `h-${i}`)}
        </p>
      );
      i++;
      continue;
    }

    if (trimmed.startsWith('> ')) {
      const quoteLines: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith('> ')) {
        quoteLines.push(lines[i].trim().slice(2));
        i++;
      }
      blocks.push(
        <blockquote
          key={`q-${i}`}
          className="pl-3 border-l-2 border-[#d4af37]/60 text-[#cfc5b7] italic space-y-1"
        >
          {quoteLines.map((ql, qIdx) => (
            <p key={`ql-${qIdx}`}>{renderInline(ql, `q-${i}-${qIdx}`)}</p>
          ))}
        </blockquote>
      );
      continue;
    }

    if (/^(?:[-*•])\s+/.test(trimmed)) {
      const items: string[] = [];
      while (i < lines.length && /^(?:[-*•])\s+/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^(?:[-*•])\s+/, ''));
        i++;
      }
      blocks.push(
        <ul key={`ul-${i}`} className="list-disc pl-5 space-y-1 marker:text-[#d4af37]">
          {items.map((item, itemIdx) => (
            <li key={`li-${itemIdx}`}>{renderInline(item, `ul-${i}-${itemIdx}`)}</li>
          ))}
        </ul>
      );
      continue;
    }

    if (/^\d+[.)]\s+/.test(trimmed)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+[.)]\s+/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^\d+[.)]\s+/, ''));
        i++;
      }
      blocks.push(
        <ol key={`ol-${i}`} className="list-decimal pl-5 space-y-1 marker:text-[#d4af37]">
          {items.map((item, itemIdx) => (
            <li key={`oli-${itemIdx}`}>{renderInline(item, `ol-${i}-${itemIdx}`)}</li>
          ))}
        </ol>
      );
      continue;
    }

    // Collect contiguous paragraph lines until blank line or structural marker
    const paraLines: string[] = [];
    while (i < lines.length) {
      const cur = lines[i].trim();
      if (
        !cur ||
        /^#{1,3}\s+/.test(cur) ||
        cur.startsWith('> ') ||
        /^(?:[-*•])\s+/.test(cur) ||
        /^\d+[.)]\s+/.test(cur) ||
        /^[-*_]{3,}$/.test(cur)
      ) {
        break;
      }
      paraLines.push(cur);
      i++;
    }

    blocks.push(
      <p key={`p-${i}`}>
        {paraLines.map((pl, pIdx) => (
          <React.Fragment key={`pl-${pIdx}`}>
            {pIdx > 0 && <br />}
            {renderInline(pl, `p-${i}-${pIdx}`)}
          </React.Fragment>
        ))}
      </p>
    );
  }

  return <div className="space-y-2 leading-relaxed">{blocks}</div>;
};
