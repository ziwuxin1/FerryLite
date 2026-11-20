import { el } from "../dom";

interface ConfigDesign {
  view: HTMLElement;
  target: HTMLSelectElement;
  targetCard: HTMLElement;
  dnsOverride: HTMLInputElement;
  dnsCard: HTMLElement;
  airportList: HTMLElement;
  mysteryPanel: HTMLElement;
  storageStatus: HTMLElement;
  indepCard: HTMLElement;
  indepBody: HTMLElement;
  enableIndep: HTMLInputElement;
  taiwanCard: HTMLElement;
  twBody: HTMLElement;
  enableTaiwan: HTMLInputElement;
  splitCard: HTMLElement;
  customCard: HTMLElement;
  submit: HTMLButtonElement;
  status: HTMLElement;
  selected: () => { count: number; total: number };
}

/** Reuse the live controls and handlers; presentation never copies configuration state. */
export function applyConfigDesign(p: ConfigDesign): () => void {
  p.view.classList.add("guided-config");
  const step = (card: HTMLElement, number: number, title?: string) => {
    card.id = `config-step-${number}`;
    const heading = card.querySelector("h2");
    if (heading) {
      if (title) heading.textContent = title;
      heading.prepend(el("span", { class: "step-number", "aria-hidden": "true" }, [String(number).padStart(2, "0")]));
    }
  };
  step(p.targetCard, 1);
  step(p.dnsCard, 2);
  const airportCard = p.airportList.parentElement!;
  step(airportCard, 3, "机场订阅");
  airportCard.classList.add("airport-card");
  p.airportList.classList.add("airport-list");
  step(p.indepCard, 4);
  const ipSection = el("section", { id: "config-step-4", class: "ip-section", "aria-label": "独立 IP" });
  p.indepCard.before(ipSection);
  p.indepCard.removeAttribute("id");
  ipSection.append(p.indepCard, p.taiwanCard);
  p.taiwanCard.querySelector("h2")!.prepend(el("span", { class: "step-number", "aria-hidden": "true" }, ["04"]));
  step(p.splitCard, 5, "分流选择");
  step(p.customCard, 6);
  p.customCard.classList.add("custom-routing-card");
  p.splitCard.classList.add("routing-card");

  // Card radios mirror the existing select, including router DNS constraints.
  p.target.setAttribute("aria-label", "配置将运行在哪里？");
  p.target.parentElement!.hidden = true;
  const radios: HTMLInputElement[] = [];
  const choices = el("div", { class: "target-choices", role: "radiogroup", "aria-label": "导出版本" });
  for (const [value, name, sub] of [["pc", "电脑版", "Windows / macOS / Linux"], ["nikki", "路由器版", "OpenClash / Nikki"]]) {
    const radio = el("input", { type: "radio", name: "export-target", value }) as HTMLInputElement;
    radios.push(radio);
    radio.onchange = () => {
      if (radio.checked) { p.target.value = value; p.target.dispatchEvent(new Event("change", { bubbles: true })); }
    };
    choices.append(el("label", { class: "target-choice" }, [radio, el("span", {}, [el("strong", {}, [name]), el("small", {}, [sub])])]));
  }
  p.targetCard.querySelector("h2")!.after(choices);

  const switchLabel = (input: HTMLInputElement, label: string) => {
    input.classList.add("config-switch");
    input.setAttribute("aria-label", label);
    return input;
  };
  p.dnsCard.replaceChildren(el("div", { class: "dns-layout" }, [
    el("div", {}, [el("h2", {}, [el("span", { class: "step-number", "aria-hidden": "true" }, ["02"]), "DNS 覆写"]),
      el("p", { class: "field-hint" }, ["默认开启 · fake-ip 接管 DNS。机场要求关闭 DNS 覆写时取消勾选；路由器版由插件接管，保持开启。"])]),
    switchLabel(p.dnsOverride, "DNS 覆写"),
  ]));

  const collapses: { card: HTMLElement; collapse: HTMLElement; input: HTMLInputElement }[] = [];
  for (const [card, body, input, label] of [
    [p.indepCard, p.indepBody, p.enableIndep, "启用机场美国 → 美国独立家宽"],
    [p.taiwanCard, p.twBody, p.enableTaiwan, "启用机场台湾 → 台湾独立家宽"],
  ] as const) {
    card.classList.add("ip-card");
    const heading = card.querySelector("h2")!;
    const chain = card.querySelector(".checkbox-row")!;
    const hint = card.querySelector(":scope > .field-hint")!;
    chain.replaceChildren(label.replace("启用", "")); chain.className = "ip-chain";
    const head = el("div", { class: "ip-card-head" }, [el("div", {}, [heading, chain, hint]), switchLabel(input, label)]);
    body.style.display = "";
    body.classList.add("ip-fields");
    const collapse = el("div", { class: "ip-collapse" }, [el("div", { class: "ip-collapse-inner" }, [body])]);
    card.replaceChildren(head, collapse);
    collapses.push({ card, collapse, input });
  }

  p.mysteryPanel.removeAttribute("style");
  p.mysteryPanel.classList.add("unlock-card");
  const unlockHeading = p.mysteryPanel.querySelector("h2")!;
  const unlockHint = p.mysteryPanel.querySelector(".field-hint")!;
  const unlockCopy = el("div", { class: "unlock-copy" }, [unlockHeading, unlockHint]);
  p.mysteryPanel.prepend(unlockCopy);
  p.mysteryPanel.querySelector<HTMLElement>(".btn-row")!.removeAttribute("style");
  p.mysteryPanel.querySelector<HTMLInputElement>("input")!.removeAttribute("style");
  const resetRow = p.storageStatus.nextElementSibling as HTMLElement;
  const draftRow = el("div", { class: "draft-status-row" });
  p.storageStatus.before(draftRow);
  draftRow.append(p.storageStatus, resetRow);
  resetRow.classList.add("reset-action"); resetRow.removeAttribute("style");

  const instructions = [...p.splitCard.querySelectorAll(":scope > .field-hint")];
  const info = el("div", { class: "routing-instructions" }, instructions);
  const routingCount = el("span", { class: "routing-summary" });
  const routingHeading = p.splitCard.querySelector("h2")!;
  routingHeading.append(routingCount);
  routingHeading.after(el("p", { class: "routing-description" }, ["每个 APP 一个独立策略组 · 生成后在 zashboard 里逐个切换出口"]), info);

  // Keep generation and validation inline at the end of the form.
  p.submit.parentElement!.classList.add("generate-actions");
  p.status.setAttribute("role", "status");
  p.status.setAttribute("aria-live", "polite");

  const refresh = () => {
    for (const radio of radios) radio.checked = radio.value === p.target.value;
    for (const { card, collapse, input } of collapses) {
      collapse.classList.toggle("is-open", input.checked);
      collapse.inert = !input.checked;
      card.classList.toggle("is-enabled", input.checked);
      input.setAttribute("aria-expanded", String(input.checked));
    }
    const selected = p.selected();
    routingCount.textContent = `已选 ${selected.count} / ${selected.total} APP`;
  };
  p.view.addEventListener("change", refresh);
  refresh();
  return refresh;
}
