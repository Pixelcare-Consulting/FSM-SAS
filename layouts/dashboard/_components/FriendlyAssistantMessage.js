import styles from './FriendlyAssistantMessage.module.css';

/** Remove common markdown artifacts so the chat never shows raw ### or ** */
function stripInlineNoise(s) {
  return s
    .replace(/\*\*([^*]*)\*\*/g, '$1')
    .replace(/__([^_]*)__/g, '$1')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function cleanLine(line) {
  let s = line.trim();
  s = s.replace(/^#{1,6}\s+/, '');
  s = s.replace(/^>\s*/, '');
  if (/^\s*[-*_]{3,}\s*$/.test(s)) return '';
  return stripInlineNoise(s);
}

function parseBulletLine(line) {
  const trimmed = line.trim();
  const m = trimmed.match(/^[\-*•]\s+(.+)$/);
  return m ? stripInlineNoise(m[1]) : null;
}

function parseNumberedLine(line) {
  const trimmed = line.trim();
  const m = trimmed.match(/^\d+\.\s*(.+)$/);
  return m ? stripInlineNoise(m[1]) : null;
}

/**
 * Renders assistant text as plain, readable blocks (paragraphs, lists, short tips).
 * Strips leftover Markdown so users never see ### or **.
 */
export default function FriendlyAssistantMessage({ text }) {
  const rawBlocks = (text || '')
    .trim()
    .split(/\n\n+/)
    .map((b) => b.trim())
    .filter(Boolean);

  if (!rawBlocks.length) {
    return null;
  }

  const nodes = [];

  rawBlocks.forEach((block, blockIdx) => {
    const lines = block.split('\n').map((l) => l.trim()).filter((l) => l.length > 0);
    if (!lines.length) return;

    const bulletItems = lines.map(parseBulletLine);
    const isAllBullets =
      lines.length >= 1 && bulletItems.every((x) => x != null && x.length > 0);

    const numberedItems = lines.map(parseNumberedLine);
    const isAllNumbered =
      lines.length >= 1 && numberedItems.every((x) => x != null && x.length > 0);

    if (isAllBullets) {
      nodes.push(
        <ul key={`b-${blockIdx}`} className={styles.list}>
          {bulletItems.map((item, j) => (
            <li key={j}>{item}</li>
          ))}
        </ul>
      );
      return;
    }

    if (isAllNumbered) {
      nodes.push(
        <ol key={`n-${blockIdx}`} className={styles.list}>
          {numberedItems.map((item, j) => (
            <li key={j}>{item}</li>
          ))}
        </ol>
      );
      return;
    }

    const merged = lines.map(cleanLine).filter((l) => l.length > 0);
    if (!merged.length) return;

    const first = merged[0];
    const isNote =
      /^(note|tip|important)\s*:/i.test(first) && merged.length >= 1;

    if (isNote) {
      nodes.push(
        <div key={`t-${blockIdx}`} className={styles.note} role="note">
          {merged.map((line, j) => (
            <p key={j} className={styles.noteLine}>
              {line}
            </p>
          ))}
        </div>
      );
      return;
    }

    if (merged.length === 1) {
      nodes.push(
        <p key={`p-${blockIdx}`} className={styles.para}>
          {merged[0]}
        </p>
      );
      return;
    }

    nodes.push(
      <p key={`p-${blockIdx}`} className={styles.para}>
        {merged.map((line, j) => (
          <span key={j}>
            {j > 0 ? <br /> : null}
            {line}
          </span>
        ))}
      </p>
    );
  });

  return <div className={styles.root}>{nodes}</div>;
}
