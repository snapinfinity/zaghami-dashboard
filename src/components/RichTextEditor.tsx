import React, { useCallback, useRef } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import { StarterKit } from '@tiptap/starter-kit';
import { Underline } from '@tiptap/extension-underline';
import { Link } from '@tiptap/extension-link';
import { Image } from '@tiptap/extension-image';
import { TextAlign } from '@tiptap/extension-text-align';
import { TextStyle } from '@tiptap/extension-text-style';
import { Highlight } from '@tiptap/extension-highlight';
import { Placeholder } from '@tiptap/extension-placeholder';
import { Table } from '@tiptap/extension-table';
import { TableRow } from '@tiptap/extension-table-row';
import { TableCell } from '@tiptap/extension-table-cell';
import { TableHeader } from '@tiptap/extension-table-header';
import { ref as storageRef, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { storage } from '../lib/firebase';
import './RichTextEditor.css';

// ── Icons (inline SVG to avoid extra deps) ─────────────────────────────────

const Icon = ({ d, size = 16 }: { d: string; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d={d} />
  </svg>
);

const ICONS = {
  bold: 'M6 4h8a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z M6 12h9a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z',
  italic: 'M19 4h-9M14 20H5M15 4 9 20',
  underline: 'M6 3v7a6 6 0 0 0 6 6 6 6 0 0 0 6-6V3M4 21h16',
  strike: 'M16 4H9a3 3 0 0 0-2.83 4M3 12h18M7.5 19.5c.64.64 1.52 1 2.44 1A4.5 4.5 0 0 0 14.5 16',
  h1: 'M4 12h8M4 6h8M4 18h8M20 6v12M17 9l3-3 3 3',
  h2: 'M4 12h8M4 6h8M4 18h8',
  ul: 'M9 6h11M9 12h11M9 18h11M4 6h1M4 12h1M4 18h1',
  ol: 'M10 6h11M10 12h11M10 18h11M4 6H3l1-1v3M3 17c0-1 1-2 1-2s-1 0-1-1 1-1 2-1 1 1 1 1',
  quote: 'M3 21c3 0 7-1 7-8V5c0-1.25-.756-2.017-2-2H4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 .008-1 1.031V20c0 1 0 1 1 1z M15 21c3 0 7-1 7-8V5c0-1.25-.757-2.017-2-2h-4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2h.75c0 2.25.25 4-2.75 4v3c0 1 0 1 1 1z',
  hr: 'M3 12h18',
  link: 'M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71',
  unlink: 'M18.84 12.25l1.72-1.71h-.02a5.004 5.004 0 0 0 .12-7.07 5.006 5.006 0 0 0-6.95 0l-1.72 1.71M5.17 11.75l-1.71 1.71a5.004 5.004 0 0 0 0 7.07 5.006 5.006 0 0 0 6.95 0l1.71-1.71M8 2H4a2 2 0 0 0-2 2v4',
  image: 'M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7M16 5h6M19 2v6M8.5 10.5a1 1 0 1 0 0-2 1 1 0 0 0 0 2zM21 15l-5-5L5 20',
  alignLeft: 'M21 6H3M15 12H3M17 18H3',
  alignCenter: 'M21 6H3M17 12H7M19 18H5',
  alignRight: 'M21 6H3M21 12H9M21 18H11',
  table: 'M9 3H5a2 2 0 0 0-2 2v4m6-6h10a2 2 0 0 1 2 2v4M9 3v18m0 0h10a2 2 0 0 0 2-2V9M9 21H5a2 2 0 0 1-2-2V9m0 0h18',
  toc: 'M3 5h8M3 9h4M3 13h8M3 17h4M14 5h7M14 9h7M14 13h7M14 17h7',
  highlight: 'M9 11l-6 6v3h3l6-6M22 5.5a2.12 2.12 0 0 1 0 3l-1.5 1.5-3-3L19 5.5a2.12 2.12 0 0 1 3 0z',
  undo: 'M9 14 4 9l5-5M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5v0a5.5 5.5 0 0 1-5.5 5.5H11',
  redo: 'M15 14l5-5-5-5M19 9H8.5A5.5 5.5 0 0 0 3 14.5v0A5.5 5.5 0 0 0 8.5 20H13',
  code: 'M16 18l6-6-6-6M8 6l-6 6 6 6',
};

// ── Toolbar Button ─────────────────────────────────────────────────────────

interface TBtnProps {
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  title: string;
  children: React.ReactNode;
}

const TBtn: React.FC<TBtnProps> = ({ onClick, active, disabled, title, children }) => (
  <button
    type="button"
    onMouseDown={(e) => { e.preventDefault(); onClick(); }}
    disabled={disabled}
    title={title}
    className={`rte-btn${active ? ' rte-btn--active' : ''}${disabled ? ' rte-btn--disabled' : ''}`}
  >
    {children}
  </button>
);

// ── Separator ─────────────────────────────────────────────────────────────

const Sep = () => <div className="rte-sep" />;

// ── Main Component ─────────────────────────────────────────────────────────

interface Props {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  rtl?: boolean;
}

export const RichTextEditor: React.FC<Props> = ({ value, onChange, placeholder, rtl = false }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = React.useState(false);
  const [linkUrl, setLinkUrl] = React.useState('');
  const [showLinkInput, setShowLinkInput] = React.useState(false);
  const [showTOC, setShowTOC] = React.useState(false);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3, 4, 5, 6] },
      }),
      Underline,
      TextStyle,
      Highlight.configure({ multicolor: true }),
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Link.configure({ openOnClick: false, autolink: true }),
      Image.configure({ inline: false, allowBase64: true }),
      Table.configure({ resizable: true }),
      TableRow,
      TableHeader,
      TableCell,
      Placeholder.configure({ placeholder: placeholder || 'Start writing your article...' }),
    ],
    content: value,
    onUpdate({ editor }) {
      onChange(editor.getHTML());
    },
    editorProps: {
      attributes: {
        class: rtl ? 'rte-editor rtl' : 'rte-editor',
        dir: rtl ? 'rtl' : 'ltr',
      },
    },
  });

  // Sync external value when switching tabs
  React.useEffect(() => {
    if (editor && value !== editor.getHTML()) {
      editor.commands.setContent(value || '', { emitUpdate: false });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, rtl]);

  // ── Image upload ─────────────────────────────────────────────────────────

  const handleInlineImageUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!editor || !e.target.files?.[0]) return;
    const file = e.target.files[0];
    setUploading(true);
    try {
      const sRef = storageRef(storage, `blog_inline/${Date.now()}_${file.name}`);
      const task = uploadBytesResumable(sRef, file);
      await new Promise<void>((resolve, reject) => {
        task.on('state_changed', null, reject, resolve);
      });
      const url = await getDownloadURL(task.snapshot.ref);
      editor.chain().focus().setImage({ src: url, alt: file.name }).run();
    } catch (err) {
      console.error('Inline image upload failed', err);
    }
    setUploading(false);
    e.target.value = '';
  }, [editor]);

  // ── Table of Contents ────────────────────────────────────────────────────

  const headings = React.useMemo(() => {
    if (!editor) return [];
    const items: { level: number; text: string }[] = [];
    editor.state.doc.descendants((node) => {
      if (node.type.name === 'heading') {
        items.push({ level: node.attrs.level as number, text: node.textContent });
      }
    });
    return items;
  }, [editor, editor?.state]);

  // ── Link helpers ─────────────────────────────────────────────────────────

  const applyLink = () => {
    if (!editor) return;
    if (linkUrl.trim()) {
      editor.chain().focus().setLink({ href: linkUrl.trim() }).run();
    }
    setShowLinkInput(false);
    setLinkUrl('');
  };

  if (!editor) return null;

  return (
    <div className={`rte-wrapper${rtl ? ' rte-wrapper--rtl' : ''}`}>
      {/* ── Toolbar ── */}
      <div className="rte-toolbar">
        {/* History */}
        <TBtn onClick={() => editor.chain().focus().undo().run()} disabled={!editor.can().undo()} title="Undo (Ctrl+Z)">
          <Icon d={ICONS.undo} />
        </TBtn>
        <TBtn onClick={() => editor.chain().focus().redo().run()} disabled={!editor.can().redo()} title="Redo (Ctrl+Y)">
          <Icon d={ICONS.redo} />
        </TBtn>

        <Sep />

        {/* Headings */}
        {([1, 2, 3, 4, 5, 6] as const).map((level) => (
          <TBtn
            key={level}
            onClick={() => editor.chain().focus().toggleHeading({ level }).run()}
            active={editor.isActive('heading', { level })}
            title={`Heading ${level}`}
          >
            <span style={{ fontWeight: 700, fontSize: level <= 2 ? '0.8rem' : '0.72rem', lineHeight: 1 }}>
              H{level}
            </span>
          </TBtn>
        ))}

        <Sep />

        {/* Inline formatting */}
        <TBtn onClick={() => editor.chain().focus().toggleBold().run()} active={editor.isActive('bold')} title="Bold (Ctrl+B)">
          <Icon d={ICONS.bold} />
        </TBtn>
        <TBtn onClick={() => editor.chain().focus().toggleItalic().run()} active={editor.isActive('italic')} title="Italic (Ctrl+I)">
          <Icon d={ICONS.italic} />
        </TBtn>
        <TBtn onClick={() => editor.chain().focus().toggleUnderline().run()} active={editor.isActive('underline')} title="Underline (Ctrl+U)">
          <Icon d={ICONS.underline} />
        </TBtn>
        <TBtn onClick={() => editor.chain().focus().toggleStrike().run()} active={editor.isActive('strike')} title="Strikethrough">
          <Icon d={ICONS.strike} />
        </TBtn>
        <TBtn onClick={() => editor.chain().focus().toggleCode().run()} active={editor.isActive('code')} title="Inline Code">
          <Icon d={ICONS.code} />
        </TBtn>
        <TBtn onClick={() => editor.chain().focus().toggleHighlight().run()} active={editor.isActive('highlight')} title="Highlight">
          <Icon d={ICONS.highlight} />
        </TBtn>

        <Sep />

        {/* Alignment */}
        <TBtn onClick={() => editor.chain().focus().setTextAlign('left').run()} active={editor.isActive({ textAlign: 'left' })} title="Align Left">
          <Icon d={ICONS.alignLeft} />
        </TBtn>
        <TBtn onClick={() => editor.chain().focus().setTextAlign('center').run()} active={editor.isActive({ textAlign: 'center' })} title="Align Center">
          <Icon d={ICONS.alignCenter} />
        </TBtn>
        <TBtn onClick={() => editor.chain().focus().setTextAlign('right').run()} active={editor.isActive({ textAlign: 'right' })} title="Align Right">
          <Icon d={ICONS.alignRight} />
        </TBtn>

        <Sep />

        {/* Lists */}
        <TBtn onClick={() => editor.chain().focus().toggleBulletList().run()} active={editor.isActive('bulletList')} title="Unordered List">
          <Icon d={ICONS.ul} />
        </TBtn>
        <TBtn onClick={() => editor.chain().focus().toggleOrderedList().run()} active={editor.isActive('orderedList')} title="Ordered List">
          <Icon d={ICONS.ol} />
        </TBtn>

        <Sep />

        {/* Block elements */}
        <TBtn onClick={() => editor.chain().focus().toggleBlockquote().run()} active={editor.isActive('blockquote')} title="Quote">
          <Icon d={ICONS.quote} />
        </TBtn>
        <TBtn onClick={() => editor.chain().focus().toggleCodeBlock().run()} active={editor.isActive('codeBlock')} title="Code Block">
          <span style={{ fontSize: '0.7rem', fontWeight: 700 }}>{'{}'}</span>
        </TBtn>
        <TBtn onClick={() => editor.chain().focus().setHorizontalRule().run()} title="Horizontal Rule">
          <Icon d={ICONS.hr} />
        </TBtn>

        <Sep />

        {/* Link */}
        <TBtn
          onClick={() => {
            if (editor.isActive('link')) {
              editor.chain().focus().unsetLink().run();
            } else {
              setShowLinkInput(v => !v);
            }
          }}
          active={editor.isActive('link')}
          title={editor.isActive('link') ? 'Remove Link' : 'Add Link'}
        >
          <Icon d={editor.isActive('link') ? ICONS.unlink : ICONS.link} />
        </TBtn>

        {/* Inline image */}
        <TBtn
          onClick={() => fileInputRef.current?.click()}
          title={uploading ? 'Uploading...' : 'Insert Image'}
          disabled={uploading}
        >
          {uploading ? (
            <span style={{ fontSize: '0.65rem', fontWeight: 700 }}>...</span>
          ) : (
            <Icon d={ICONS.image} />
          )}
        </TBtn>
        <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleInlineImageUpload} />

        {/* Table */}
        <TBtn
          onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}
          title="Insert Table"
          active={editor.isActive('table')}
        >
          <Icon d={ICONS.table} />
        </TBtn>

        <Sep />

        {/* Line break */}
        <TBtn onClick={() => editor.chain().focus().setHardBreak().run()} title="Hard Line Break (Shift+Enter)">
          <span style={{ fontSize: '0.7rem', fontWeight: 700 }}>↵</span>
        </TBtn>

        {/* Table of Contents */}
        <TBtn onClick={() => setShowTOC(v => !v)} active={showTOC} title="Table of Contents">
          <Icon d={ICONS.toc} />
        </TBtn>
      </div>

      {/* ── Link input bar ── */}
      {showLinkInput && (
        <div className="rte-link-bar">
          <input
            className="rte-link-input"
            type="url"
            placeholder="https://example.com"
            value={linkUrl}
            onChange={e => setLinkUrl(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') applyLink(); if (e.key === 'Escape') setShowLinkInput(false); }}
            autoFocus
          />
          <button type="button" className="rte-link-apply" onClick={applyLink}>Apply</button>
          <button type="button" className="rte-link-cancel" onClick={() => { setShowLinkInput(false); setLinkUrl(''); }}>Cancel</button>
        </div>
      )}

      {/* ── Table of Contents panel ── */}
      {showTOC && headings.length > 0 && (
        <div className="rte-toc">
          <p className="rte-toc-title">Table of Contents</p>
          <div className="rte-toc-generated">
            {headings.map((h, i) => (
              <div key={i} className="rte-toc-item" style={{ paddingLeft: `${(h.level - 1) * 1}rem` }}>
                <span className="rte-toc-bullet">{'#'.repeat(h.level)}</span>
                <span>{h.text}</span>
              </div>
            ))}
          </div>
        </div>
      )}


      {/* ── Editor content area ── */}
      <EditorContent editor={editor} />

      {/* ── Table controls (shown when cursor is in table) ── */}
      {editor.isActive('table') && (
        <div className="rte-table-controls">
          <button type="button" className="rte-tbl-btn" onMouseDown={e => { e.preventDefault(); editor.chain().focus().addColumnBefore().run(); }}>+ Col Before</button>
          <button type="button" className="rte-tbl-btn" onMouseDown={e => { e.preventDefault(); editor.chain().focus().addColumnAfter().run(); }}>+ Col After</button>
          <button type="button" className="rte-tbl-btn" onMouseDown={e => { e.preventDefault(); editor.chain().focus().addRowBefore().run(); }}>+ Row Before</button>
          <button type="button" className="rte-tbl-btn" onMouseDown={e => { e.preventDefault(); editor.chain().focus().addRowAfter().run(); }}>+ Row After</button>
          <button type="button" className="rte-tbl-btn rte-tbl-btn--danger" onMouseDown={e => { e.preventDefault(); editor.chain().focus().deleteColumn().run(); }}>Del Col</button>
          <button type="button" className="rte-tbl-btn rte-tbl-btn--danger" onMouseDown={e => { e.preventDefault(); editor.chain().focus().deleteRow().run(); }}>Del Row</button>
          <button type="button" className="rte-tbl-btn rte-tbl-btn--danger" onMouseDown={e => { e.preventDefault(); editor.chain().focus().deleteTable().run(); }}>Del Table</button>
        </div>
      )}
    </div>
  );
};
