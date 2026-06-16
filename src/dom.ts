// 极简 DOM 助手：避免引入框架，保持 exe 体积小。

type Child = Node | string;
type AttrValue = string | number | boolean | EventListenerOrEventListenerObject | undefined;
type Attrs = Record<string, AttrValue>;

/**
 * 创建元素。attrs 支持：class、html（innerHTML）、onXxx（事件）、布尔属性（true 时设置）、
 * 其余按普通属性处理。
 */
export function el(tag: string, attrs: Attrs = {}, children: Child[] = []): HTMLElement {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === undefined || value === false) continue;
    if (key.startsWith("on") && typeof value === "function") {
      node.addEventListener(key.slice(2).toLowerCase(), value as EventListener);
    } else if (key === "class") {
      node.className = String(value);
    } else if (key === "html") {
      node.innerHTML = String(value);
    } else if (value === true) {
      node.setAttribute(key, "");
    } else {
      node.setAttribute(key, String(value));
    }
  }
  for (const child of children) {
    node.append(typeof child === "string" ? document.createTextNode(child) : child);
  }
  return node;
}

/** 短暂浮层提示。 */
export function toast(message: string, kind: "ok" | "err" | "info" = "info"): void {
  const node = el("div", { class: `toast ${kind}` }, [message]);
  document.body.append(node);
  window.setTimeout(() => node.classList.add("show"), 10);
  window.setTimeout(() => {
    node.classList.remove("show");
    window.setTimeout(() => node.remove(), 300);
  }, 3400);
}
