import { EditorView } from "codemirror";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { tags } from "@lezer/highlight";

// CSS variables update in place, preserving edits, selection and undo history.
export const yamlTheme = [
  EditorView.theme({
    "&": { backgroundColor: "var(--panel-2, #fff)", color: "var(--ink, #161616)" },
    ".cm-content": { caretColor: "var(--ink, #161616)" },
    ".cm-cursor, .cm-dropCursor": { borderLeftColor: "var(--ink, #161616)" },
    ".cm-gutters": { backgroundColor: "var(--panel, #fffdf7)", color: "var(--muted, #6b6b60)", borderRightColor: "var(--divider, #ddd)" },
    ".cm-activeLine, .cm-activeLineGutter": { backgroundColor: "var(--code-active, #00000008)" },
    "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection": { backgroundColor: "var(--code-selection, #d9e3ff)" },
    ".cm-selectionMatch": { backgroundColor: "var(--yellow-soft, #fdeaa6)" },
    ".cm-panels, .cm-tooltip": { backgroundColor: "var(--panel, #fffdf7)", color: "var(--ink, #161616)", borderColor: "var(--border, #161616)" },
    ".cm-searchMatch": { backgroundColor: "var(--yellow-soft, #fdeaa6)", outline: "1px solid var(--yellow, #f5c518)" },
    ".cm-tooltip-autocomplete > ul > li[aria-selected]": { backgroundColor: "var(--code-selection, #d9e3ff)", color: "var(--ink, #161616)" },
    ".cm-button": { backgroundImage: "none", backgroundColor: "var(--panel-2, #fff)", color: "var(--ink, #161616)", borderColor: "var(--border, #161616)" },
  }),
  syntaxHighlighting(HighlightStyle.define([
    { tag: [tags.propertyName, tags.attributeName], color: "var(--code-key, #653398)" },
    { tag: [tags.string, tags.special(tags.string)], color: "var(--code-string, #216c35)" },
    { tag: [tags.number, tags.bool, tags.null], color: "var(--code-number, #925000)" },
    { tag: [tags.keyword, tags.meta, tags.typeName, tags.labelName], color: "var(--code-keyword, #1753a0)" },
    { tag: tags.comment, color: "var(--code-comment, #6b6b60)", fontStyle: "italic" },
  ])),
];
