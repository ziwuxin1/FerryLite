import { basicSetup, EditorView } from "codemirror";
import { yaml } from "@codemirror/lang-yaml";
import { linter, lintGutter } from "@codemirror/lint";
import { inspectYaml } from "../yaml-editor";

export function createYamlPreview(host: HTMLElement, source: string, onChange: (source: string) => void) {
  host.replaceChildren();
  const view = new EditorView({ parent: host, doc: source, extensions: [
    basicSetup, yaml(), lintGutter(),
    linter(view => inspectYaml(view.state.doc.toString()).map(p => ({ ...p, from: Math.min(p.from, view.state.doc.length), to: Math.min(Math.max(p.from, p.to), view.state.doc.length) })), { delay: 700 }),
    EditorView.updateListener.of(update => { if (update.docChanged) onChange(update.state.doc.toString()); }),
    EditorView.contentAttributes.of({ "aria-label": "YAML 预览与编辑", spellcheck: "false" }),
    EditorView.theme({
      "&": { maxHeight: "560px", fontSize: "13px", backgroundColor: "#fff" },
      ".cm-scroller": { overflow: "auto", minHeight: "280px" },
      ".cm-content": { fontFamily: "Consolas, monospace" },
    }),
  ] });
  return {
    destroy() { view.destroy(); },
    setSource(next: string) { view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: next } }); },
  };
}
