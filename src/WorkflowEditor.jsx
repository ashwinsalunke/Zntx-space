import React, { useEffect, useRef } from "react";
import { Node, mergeAttributes } from "@tiptap/core";
import { EditorContent, useEditor, useEditorState } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import { TableKit } from "@tiptap/extension-table";
import {
  Bold,
  Italic,
  Underline,
  Strikethrough,
  List,
  ListOrdered,
  Undo2,
  Redo2,
  Table2,
  Quote,
} from "lucide-react";

export const ResearchCitation = Node.create({
  name: "researchCitation",
  group: "inline",
  inline: true,
  atom: true,
  addAttributes: () => ({
    sourceId: {
      default: "",
      parseHTML: (element) => element.getAttribute("data-source-id"),
      renderHTML: (attrs) => ({ "data-source-id": attrs.sourceId }),
    },
  }),
  parseHTML: () => [{ tag: 'span[data-type="research-citation"]' }],
  renderHTML({ node, HTMLAttributes }) {
    const id = String(node.attrs.sourceId || "");
    return [
      "span",
      mergeAttributes(HTMLAttributes, {
        "data-type": "research-citation",
        class: "rf-citation",
        title: `Source ${id}`,
        role: "link",
        tabindex: "0",
      }),
      `[${/^S\d+$/.test(id) ? id.slice(1) : "?"}]`,
    ];
  },
  renderText: ({ node }) => `[[cite:${node.attrs.sourceId}]]`,
});

export const workflowExtensions = () => [
  StarterKit.configure({
    heading: { levels: [1, 2, 3] },
    link: { openOnClick: false, autolink: false },
  }),
  Placeholder.configure({
    placeholder:
      "Write here, or generate your first draft from the selected sources…",
  }),
  TableKit.configure({ table: { resizable: false } }),
  ResearchCitation,
];

export default function WorkflowEditor({
  document,
  revision,
  onChange,
  onReady,
  disabled = false,
  sources = [],
}) {
  const callback = useRef(onChange);
  callback.current = onChange;
  const editor = useEditor({
    extensions: workflowExtensions(),
    content: document,
    immediatelyRender: false,
    editable: !disabled,
    editorProps: {
      attributes: {
        class: "rf-prose",
        "aria-label": "Research paper editor",
        role: "textbox",
        "aria-multiline": "true",
      },
      handleClick(view, pos, event) {
        const id = event.target
          .closest?.('[data-type="research-citation"]')
          ?.getAttribute("data-source-id");
        if (!id) return false;
        documentRef(id);
        return true;
      },
      handleKeyDown(view, event) {
        if (
          event.key === "Enter" &&
          event.target.matches?.('[data-type="research-citation"]')
        ) {
          documentRef(event.target.getAttribute("data-source-id"));
          return true;
        }
        return false;
      },
    },
    onUpdate: ({ editor: current }) => callback.current(current.getJSON()),
  });
  function documentRef(id) {
    globalThis.document
      .getElementById(`workflow-ref-${id}`)
      ?.scrollIntoView({
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "instant"
          : "smooth",
        block: "center",
      });
  }
  useEffect(() => {
    onReady?.(editor);
    return () => onReady?.(null);
  }, [editor]);
  useEffect(() => {
    if (editor && document)
      editor.commands.setContent(document, { emitUpdate: false });
  }, [editor, revision]);
  useEffect(() => {
    editor?.setEditable(!disabled);
  }, [editor, disabled]);
  const state = useEditorState({
    editor,
    selector: ({ editor: current }) =>
      current
        ? {
            bold: current.isActive("bold"),
            italic: current.isActive("italic"),
            bullets: current.isActive("bulletList"),
            ordered: current.isActive("orderedList"),
            heading: current.isActive("heading") ? current.getAttributes("heading").level : 0,
            underline: current.isActive("underline"),
            strike: current.isActive("strike"),
            table: current.isActive("table"),
            undo: current.can().undo(),
            redo: current.can().redo(),
          }
        : {},
  });
  const action = (
    title,
    Icon,
    command,
    active = false,
    unavailable = false,
  ) => (
    <button
      type="button"
      title={title}
      aria-label={title}
      aria-pressed={active}
      disabled={!editor || disabled || unavailable}
      onClick={() => command(editor.chain().focus()).run()}
    >
      <Icon size={17} />
    </button>
  );
  return (
    <div className="rf-editor-shell">
      <div className="rf-editor-toolbar" aria-label="Document formatting">
        <select
          aria-label="Paragraph style"
          disabled={!editor || disabled}
          value={state?.heading ? String(state.heading) : "paragraph"}
          onChange={(event) =>
            event.target.value !== "paragraph"
              ? editor.chain().focus().setHeading({ level: Number(event.target.value) }).run()
              : editor.chain().focus().setParagraph().run()
          }
        >
          <option value="paragraph">Normal text</option>
          <option value="1">Heading 1</option>
          <option value="2">Heading 2</option>
          <option value="3">Heading 3</option>
        </select>
        {action("Bold", Bold, (c) => c.toggleBold(), state?.bold)}
        {action("Italic", Italic, (c) => c.toggleItalic(), state?.italic)}
        {action("Underline", Underline, (c) => c.toggleUnderline(), state?.underline)}
        {action("Strikethrough", Strikethrough, (c) => c.toggleStrike(), state?.strike)}
        <span className="rf-toolbar-divider" />
        {action(
          "Bullet list",
          List,
          (c) => c.toggleBulletList(),
          state?.bullets,
        )}
        {action(
          "Numbered list",
          ListOrdered,
          (c) => c.toggleOrderedList(),
          state?.ordered,
        )}
        {action(
          state?.table ? "Remove table" : "Insert table",
          Table2,
          (c) =>
            state?.table
              ? c.deleteTable()
              : c.insertTable({ rows: 3, cols: 3, withHeaderRow: true }),
          state?.table,
        )}
        <select
          aria-label="Insert source citation"
          value=""
          disabled={!editor || disabled || !sources.length}
          onChange={(event) => {
            if (event.target.value)
              editor
                .chain()
                .focus()
                .insertContent({
                  type: "researchCitation",
                  attrs: { sourceId: event.target.value },
                })
                .run();
          }}
        >
          <option value="">Cite a source</option>
          {sources.map((s) => (
            <option value={s.evidenceId} key={s.evidenceId}>
              [{s.evidenceId.slice(1)}] {s.title.slice(0, 65)}
            </option>
          ))}
        </select>
        <span className="rf-toolbar-divider" />
        {action("Undo", Undo2, (c) => c.undo(), false, !state?.undo)}
        {action("Redo", Redo2, (c) => c.redo(), false, !state?.redo)}
      </div>
      <EditorContent editor={editor} />
    </div>
  );
}
