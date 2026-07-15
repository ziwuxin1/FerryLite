// 模块6 UI：状态盘主面板，串起模块 2/3/4/5。见设计 §6.6。
// 状态盘是主页：未生成配置时也能进入（体检/启动/关闭置灰 + 提示），让启动功能从一开始可见。
import { api } from "../api";
import type { AppConfig } from "../api";
import { el, toast } from "../dom";
import { openShutdownDialog } from "../components/shutdown-dialog";
import { openUrl } from "@tauri-apps/plugin-opener";
import { open, ask } from "@tauri-apps/plugin-dialog";

type StepState = "idle" | "run" | "ok" | "err" | "warn";

interface Step {
  row: HTMLElement;
  set: (state: StepState, msg?: string) => void;
}

function makeStep(title: string): Step {
  const icon = el("span", { class: "step-icon" }, ["○"]);
  const msg = el("div", { class: "step-msg" });
  const row = el("div", { class: "step" }, [
    icon,
    el("div", { class: "step-body" }, [el("div", { class: "step-text" }, [title]), msg]),
  ]);
  function set(state: StepState, m = ""): void {
    icon.textContent =
      state === "run"
        ? "⏳"
        : state === "ok"
          ? "✅"
          : state === "err"
            ? "❌"
            : state === "warn"
              ? "⚠️"
              : "○";
    row.className = `step ${state === "idle" ? "" : state}`;
    msg.textContent = m;
  }
  return { row, set };
}

export function renderDashboardView(
  root: HTMLElement,
  config: AppConfig | null,
  onEditConfig: () => void,
  onReload: () => void,
): void {
  const stepClash = makeStep("1. 检查 ClashMi（Clash API 可达）");
  const stepIp = makeStep("2. 验证出口 IP == 基准 IP（安全兜底）");
  const stepLink = makeStep("3. 独立 IP 链路体检（延迟 / 稳定性）");

  const btnCode = launchBtn("启动 Claude Code", onLaunchCode);
  const btnDesktop = launchBtn("启动桌面 App", onLaunchDesktop);
  const btnWeb = launchBtn("打开网页 claude.ai", onLaunchWeb);
  const launchButtons: HTMLButtonElement[] = [btnCode, btnDesktop, btnWeb];

  const linkInfo = el("div", { class: "link-info" }, ["独立 IP 出口：尚未体检。"]);
  const proxyBtn = el("button", { class: "btn primary block", onclick: onProxyCheck }, [
    "一键代理（体检放行）",
  ]) as HTMLButtonElement;
  const retestBtn = el("button", { class: "btn", onclick: onRetestLink }, [
    "测试独立 IP",
  ]) as HTMLButtonElement;
  const ping0Btn = el("button", { class: "btn", onclick: onPing0 }, [
    "在浏览器查看 IP 纯净度",
  ]) as HTMLButtonElement;
  const shutdownBtn = el("button", { class: "btn danger block", onclick: onShutdown }, [
    "一键安全关闭",
  ]) as HTMLButtonElement;
  // DNS 覆写一键切换：直接改成品 yaml 的 dns.enable（免重新生成），机场公告要求关闭时用。
  const dnsInfo = el("div", { class: "link-info" }, [
    config
      ? `当前状态：${config.dnsOverride ? "开（fake-ip 接管 DNS）" : "关（dns.enable: false）"}`
      : "尚未配置。",
  ]);
  const dnsToggleBtn = el("button", { class: "btn block", onclick: onToggleDns }, [
    config?.dnsOverride ? "关闭 DNS 覆写" : "打开 DNS 覆写",
  ]) as HTMLButtonElement;
  // 出口IP校准：第2步失败但回显是有效公网IP时显示，一键把"检测到的出口IP"设为基准
  // （住宅代理"入口网关域名≠真实出口IP"的常见情况，省去重新生成/重填表单）。
  let lastEcho = "";
  const calibrateBtn = el(
    "button",
    { class: "btn primary block", style: "display:none;margin-top:10px", onclick: onCalibrate },
    ["把出口IP设为基准并放行"],
  ) as HTMLButtonElement;

  setLaunchEnabled(false);
  if (!config) {
    // 未配置：体检 / 复测 / 关闭都依赖 config，先禁用；配置生成与导入入口保持可用。
    proxyBtn.disabled = true;
    retestBtn.disabled = true;
    shutdownBtn.disabled = true;
    dnsToggleBtn.disabled = true;
  }

  function launchBtn(label: string, handler: () => void): HTMLButtonElement {
    return el("button", { class: "btn", onclick: handler }, [label]) as HTMLButtonElement;
  }
  function setLaunchEnabled(on: boolean): void {
    for (const b of launchButtons) b.disabled = !on;
  }

  async function onProxyCheck(): Promise<void> {
    if (!config) return;
    proxyBtn.disabled = true;
    setLaunchEnabled(false);
    stepClash.set("idle");
    stepIp.set("idle");
    stepLink.set("idle");
    calibrateBtn.style.display = "none";

    try {
      stepClash.set("run", "正在请求 Clash API…");
      stepClash.set("ok", await api.checkClash());
    } catch (e) {
      stepClash.set("err", String(e));
      proxyBtn.disabled = false;
      return;
    }

    try {
      stepIp.set("run", "正在经 Claude 路径检测出口 IP…");
      const report = await api.verifyExitIp();
      if (!report.matched) {
        stepIp.set("err", report.message);
        // 回显是有效 IPv4 → 给一键"设为基准"按钮（住宅代理网关≠出口时一键搞定，免重新生成）。
        if (/^\d{1,3}(\.\d{1,3}){3}$/.test(report.echoIp)) {
          lastEcho = report.echoIp;
          calibrateBtn.textContent = `✅ 出口 ${report.echoIp} 是我的IP → 设为基准并放行`;
          calibrateBtn.style.display = "";
        }
        proxyBtn.disabled = false;
        return;
      }
      stepIp.set("ok", report.message);
    } catch (e) {
      stepIp.set("err", String(e));
      proxyBtn.disabled = false;
      return;
    }

    try {
      stepLink.set("run", "正在连发小请求测稳定性…");
      const link = await api.linkHealth();
      stepLink.set(link.success > 0 ? "ok" : "warn", link.message);
      linkInfo.textContent = link.message;
    } catch (e) {
      stepLink.set("warn", String(e));
    }

    setLaunchEnabled(true);
    toast("✅ 体检通过，可以启动 Claude 了", "ok");
    proxyBtn.disabled = false;
  }

  async function onLaunchCode(): Promise<void> {
    try {
      const pid = await api.launchClaudeCode();
      toast(`已启动 Claude Code（PID ${pid}）`, "ok");
    } catch (e) {
      toast(String(e), "err");
    }
  }
  async function onLaunchDesktop(): Promise<void> {
    try {
      await api.launchClaudeDesktop();
      toast("已启动 Claude 桌面 App", "ok");
    } catch (e) {
      toast(String(e), "err");
    }
  }
  async function onLaunchWeb(): Promise<void> {
    try {
      await openUrl("https://claude.ai");
    } catch (e) {
      toast(String(e), "err");
    }
  }
  async function onCalibrate(): Promise<void> {
    if (!lastEcho) return;
    calibrateBtn.disabled = true;
    try {
      await api.setExitBasis(lastEcho);
      calibrateBtn.style.display = "none";
      toast(`已把基准设为 ${lastEcho}，重新体检中…`, "ok");
      await onProxyCheck();
    } catch (e) {
      toast(String(e), "err");
      calibrateBtn.disabled = false;
    }
  }
  async function onRetestLink(): Promise<void> {
    if (!config) return;
    linkInfo.textContent = "正在复测…";
    try {
      linkInfo.textContent = (await api.linkHealth()).message;
    } catch (e) {
      linkInfo.textContent = String(e);
    }
  }
  async function onPing0(): Promise<void> {
    try {
      await openUrl("https://ping0.cc");
    } catch (e) {
      toast(String(e), "err");
    }
  }
  // DNS 覆写切换：改成品 yaml 的 dns.enable 并回写 config.json；改完需重新拖进 ClashMi。
  async function onToggleDns(): Promise<void> {
    if (!config) return;
    const target = !config.dnsOverride;
    dnsToggleBtn.disabled = true;
    try {
      await api.setDnsOverride(target);
      toast(
        `✅ DNS 覆写已${target ? "打开" : "关闭"}，请把成品 yaml 重新拖进 ClashMi 生效`,
        "ok",
      );
      onReload();
    } catch (e) {
      toast(String(e), "err");
      dnsToggleBtn.disabled = false;
    }
  }

  function onShutdown(): void {
    if (!config) return;
    openShutdownDialog(async () => {
      try {
        const report = await api.safeShutdown();
        toast(report.details.join("　"), "ok");
      } catch (e) {
        toast(String(e), "err");
      }
      stepClash.set("idle");
      stepIp.set("idle");
      stepLink.set("idle");
      linkInfo.textContent = "独立 IP 出口：尚未体检。";
      setLaunchEnabled(false);
    });
  }

  // 导入已有成品 yaml（学生拿老师的 yaml 直接用，免再填表单）。
  async function onImportYaml(): Promise<void> {
    try {
      const path = await open({
        multiple: false,
        filters: [{ name: "Clash 配置", extensions: ["yaml", "yml"] }],
      });
      if (typeof path !== "string") return; // 取消
      await api.importYaml(path, new Date().toISOString());
      toast("✅ 已导入配置", "ok");
      onReload();
    } catch (e) {
      toast(String(e), "err");
    }
  }

  // 清除当前配置（删 config.json，回到未配置；不动磁盘上的 yaml 文件）。
  async function onClearConfig(): Promise<void> {
    try {
      const yes = await ask("确定清除当前配置吗？只清空软件记录，不会删除你的 yaml 文件。", {
        title: "清除配置",
        kind: "warning",
      });
      if (!yes) return;
      await api.clearConfig();
      toast("已清除配置", "ok");
      onReload();
    } catch (e) {
      toast(String(e), "err");
    }
  }

  const configBody =
    config !== null
      ? el("div", {}, [
          el("div", { class: "kv" }, [
            el("b", {}, ["基准出口 IP"]),
            el("span", {}, [config.exitBasisIp]),
            el("b", {}, ["本地代理端点"]),
            el("span", {}, [config.proxyEndpoint]),
            el("b", {}, ["Clash API"]),
            el("span", {}, [config.clashApi.url]),
            el("b", {}, ["成品 yaml"]),
            el("span", {}, [config.generatedYamlPath]),
            el("b", {}, ["DNS 覆写"]),
            el("span", {}, [config.dnsOverride ? "开（fake-ip）" : "关（dns.enable: false）"]),
            el("b", {}, ["更新时间"]),
            el("span", {}, [formatTime(config.lastUpdated)]),
          ]),
          el("div", { class: "detail-block" }, [
            el("div", { class: "detail-title" }, [`机场（${(config.airports ?? []).length}）`]),
            ...(config.airports ?? []).map((a) =>
              el("div", { class: "detail-line" }, [`${a.name}　${a.url}`]),
            ),
          ]),
          el("div", { class: "detail-block" }, [
            el("div", { class: "detail-title" }, ["中转站独立 IP"]),
            ...(config.nodes ?? []).map((n) =>
              el("div", { class: "detail-line" }, [
                `${n.name}　${n.server}${n.port ? ":" + n.port : ""}　(${n.protocol})`,
              ]),
            ),
          ]),
        ])
      : el("div", { class: "hint" }, [
          "尚未配置。两种方式：① 右上「配置生成」从头填；② 下方「导入已有 yaml」直接导入已生成的成品（推荐学生用）。",
        ]);

  // 品牌 LOGO（RAFT 式：粗体描边「Ferry」+ 倾斜小船徽标）。
  const brandBadge = el("span", { class: "brand-badge" });
  brandBadge.innerHTML =
    '<svg viewBox="0 0 32 32" width="20" height="20" aria-hidden="true"><path d="M5 18h22l-3 7H8z" fill="#161616"/><rect x="11" y="9" width="10" height="9" fill="#161616"/><rect x="13.2" y="11.4" width="2.4" height="2.4" fill="#f5c518"/><rect x="16.6" y="11.4" width="2.4" height="2.4" fill="#f5c518"/></svg>';
  const brand = el("div", { class: "brand" }, [
    brandBadge,
    el("span", { class: "brand-mark" }, ["Ferry"]),
    el("span", { class: "brand-tag" }, ["· 链式代理"]),
  ]);
  const children: (Node | string)[] = [
    el("div", { class: "topbar" }, [
      el("div", {}, [
        brand,
        el("div", { class: "sub" }, [
          "专为回国设计的智能分流，稳稳处理美国急事",
        ]),
      ]),
      el("div", { class: "btn-row" }, [
        el("button", { class: "btn", onclick: onImportYaml }, ["导入已有 yaml"]),
        ...(config
          ? [el("button", { class: "btn", onclick: onClearConfig }, ["清除 yaml"])]
          : []),
        el("button", { class: config ? "btn" : "btn primary", onclick: onEditConfig }, [
          "配置生成 / 换 IP",
        ]),
      ]),
    ]),
  ];

  if (!config) {
    children.push(
      el("div", { class: "card banner" }, [
        "⚠️ 尚未配置：点右上角「配置生成」新建，或下方「导入已有 yaml」导入老师 / 上次生成的配置。配置就绪后体检与启动按钮才开放。",
      ]),
    );
  }

  children.push(
    el("div", { class: "cards" }, [
      el("div", { class: "card" }, [el("h2", {}, ["当前配置"]), configBody]),
      el("div", { class: "card" }, [
        el("h2", {}, ["启动前体检"]),
        proxyBtn,
        el("div", {}, [stepClash.row, stepIp.row, stepLink.row]),
        calibrateBtn,
      ]),
      el("div", { class: "card" }, [
        el("h2", {}, ["启动 Claude（体检通过后可用）"]),
        el("div", { class: "btn-row" }, [btnCode, btnDesktop, btnWeb]),
      ]),
      el("div", { class: "card" }, [
        el("h2", {}, ["独立 IP 链路 / IP 纯净度"]),
        linkInfo,
        el("div", { class: "btn-row" }, [retestBtn, ping0Btn]),
      ]),
      el("div", { class: "card" }, [
        el("h2", {}, ["DNS 覆写"]),
        dnsInfo,
        dnsToggleBtn,
        el("div", { class: "hint" }, [
          "机场公告要求「关闭 DNS 覆写」时点一下即可：直接改成品 yaml 里的 dns.enable，不用重新生成；改完把 yaml 重新拖进 ClashMi 重新导入才生效。",
        ]),
      ]),
      el("div", { class: "card" }, [
        el("h2", {}, ["关闭"]),
        shutdownBtn,
        el("div", { class: "hint" }, [
          "只结束 Claude Code / 桌面 App 进程；不动浏览器、不动 ClashMi / TUN。",
        ]),
      ]),
    ]),
  );

  root.append(el("div", {}, children));
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
}
