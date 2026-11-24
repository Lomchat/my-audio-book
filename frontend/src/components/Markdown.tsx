import { Fragment, type ReactNode } from 'react'
import { Link } from 'react-router'
import { FileText } from 'lucide-react'

const INLINE = /(\*\*[^*]+\*\*|`[^`]+`|\[#\d+(?: @\d+(?::\d{2}){1,2})?\])/g
const CITE = /^\[#(\d+)(?: @(\d+(?::\d{2}){1,2}))?\]$/

function toSeconds(stamp: string): number {
  return stamp.split(':').reduce((acc, p) => acc * 60 + Number(p), 0)
}

function Citation({ id, stamp, titles }: { id: number; stamp?: string; titles: Map<number, string> }) {
  const title = titles.get(id)
  const to = `/app/r/${id}${stamp ? `?t=${toSeconds(stamp)}` : ''}`
  return (
    <Link
      to={to}
      title={title}
      className="mx-0.5 inline-flex max-w-[16rem] items-center gap-1 whitespace-nowrap rounded-full border border-brand/30 bg-brand-soft px-2 py-px align-baseline text-xs font-medium text-brand-text no-underline transition hover:border-brand"
    >
      <FileText className="size-3 shrink-0" aria-hidden />
      <span className="min-w-0 truncate">{title ? title : `#${id}`}</span>
      {stamp && <span className="tnum shrink-0 opacity-80">·&nbsp;{stamp}</span>}
    </Link>
  )
}

function inline(text: string, titles: Map<number, string>): ReactNode[] {
  return text.split(INLINE).map((part, i) => {
    if (!part) return null
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) return <strong key={i}>{part.slice(2, -2)}</strong>
    if (part.startsWith('`') && part.endsWith('`') && part.length > 2)
      return (
        <code key={i} className="rounded-md bg-subtle px-1.5 py-0.5 font-mono text-[0.85em]">
          {part.slice(1, -1)}
        </code>
      )
    const m = CITE.exec(part)
    if (m) return <Citation key={i} id={Number(m[1])} stamp={m[2]} titles={titles} />
    return <Fragment key={i}>{part}</Fragment>
  })
}

type Block = { type: 'p' | 'ul' | 'ol'; lines: string[] }

function parse(src: string): Block[] {
  const blocks: Block[] = []
  for (const raw of src.split('\n')) {
    const line = raw.trimEnd()
    if (!line.trim()) {
      blocks.push({ type: 'p', lines: [] })
      continue
    }
    const ul = /^\s*[-*•]\s+(.*)$/.exec(line)
    const ol = /^\s*\d+[.)]\s+(.*)$/.exec(line)
    const type = ul ? 'ul' : ol ? 'ol' : 'p'
    const text = ul?.[1] ?? ol?.[1] ?? line
    const last = blocks[blocks.length - 1]
    if (last && last.type === type && last.lines.length) last.lines.push(text)
    else blocks.push({ type, lines: [text] })
  }
  return blocks.filter((b) => b.lines.length)
}

/** Tiny markdown subset rendered as React elements: paragraphs, lists, bold, code, citations. */
export function Markdown({ text, titles }: { text: string; titles: Map<number, string> }) {
  return (
    <div dir="auto" className="space-y-2.5 leading-relaxed">
      {parse(text).map((b, i) =>
        b.type === 'p' ? (
          <p key={i}>{b.lines.flatMap((l, j) => [j ? <br key={`b${j}`} /> : null, ...inline(l, titles)])}</p>
        ) : b.type === 'ul' ? (
          <ul key={i} className="list-disc space-y-1 ps-5">
            {b.lines.map((l, j) => (
              <li key={j}>{inline(l, titles)}</li>
            ))}
          </ul>
        ) : (
          <ol key={i} className="list-decimal space-y-1 ps-5">
            {b.lines.map((l, j) => (
              <li key={j}>{inline(l, titles)}</li>
            ))}
          </ol>
        ),
      )}
    </div>
  )
}
