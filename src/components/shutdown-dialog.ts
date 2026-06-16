// 模块3 UI：二次确认对话框。见设计 §5.3 / §6.3。
import { el } from "../dom";

/** 弹出「一键安全关闭」二次确认。勾选后方可点「确认关闭」。 */
export function openShutdownDialog(onConfirmed: () => void): void {
  const overlay = el("div", { class: "overlay" });

  const checkbox = el("input", { type: "checkbox" }) as HTMLInputElement;
  const confirmBtn = el("button", { class: "btn danger", disabled: true }, [
    "确认关闭",
  ]) as HTMLButtonElement;
  const waitBtn = el("button", { class: "btn" }, ["再等等"]);

  checkbox.addEventListener("change", () => {
    confirmBtn.disabled = !checkbox.checked;
  });
  confirmBtn.addEventListener("click", () => {
    overlay.remove();
    onConfirmed();
  });
  waitBtn.addEventListener("click", () => overlay.remove());

  const dialog = el("div", { class: "dialog" }, [
    el("h3", {}, ["一键安全关闭"]),
    el("p", { class: "warn-text" }, [
      "⚠️ 确认前请检查：claude.ai 网页是否已关闭？未关闭可能仍在联网。",
    ]),
    el("label", { class: "checkbox-row" }, [
      checkbox,
      el("span", {}, ["我已确认 claude.ai 网页已关闭"]),
    ]),
    el("div", { class: "dialog-actions" }, [waitBtn, confirmBtn]),
  ]);

  overlay.append(dialog);
  document.body.append(overlay);
}
