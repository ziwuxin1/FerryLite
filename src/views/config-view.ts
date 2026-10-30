// 模块1 UI：配置生成表单。见设计 §5.1 / §6.1。支持可选添加多个机场（名字 + 订阅地址）。
import type { GenerateInput, GenerateResult, Protocol } from "../api";
import { el } from "../dom";
import { platform } from "../platform";
import type { GroupDomainEdit } from "../yaml-editor";
import type { CategorySite } from "./category-sites";
import { canIncludeApp, isExclusiveApp, matchesExclusiveCode } from "../exclusive-options";
import { SITE_CATALOG } from "../site-catalog";
import { domainLogo } from "./site-logo";
import { loadRoutingDraft, saveRoutingDraft, clearRoutingDraft } from "../routing-draft";
import type { SavedCustomGroup, SavedCategorySite } from "../routing-draft";

interface AirportRow {
  wrapper: HTMLElement;
  name: HTMLInputElement;
  url: HTMLInputElement;
}

export function renderConfigView(root: HTMLElement): void {
  const status = el("div", { class: "status-line" });
  let exclusiveUnlocked = false;
  let persistDraft = (): void => {};
  const storageStatus = el("div", { class: "field-hint", role: "status", "aria-live": "polite" });
  const siteRestorers = new Map<string, (sites: SavedCategorySite[]) => Promise<void>>();

  // DNS 覆写开关（默认开）：机场公告要求「关闭 DNS 覆写」时取消勾选 → 生成的 dns.enable: false。
  const dnsOverride = el("input", { type: "checkbox" }) as HTMLInputElement;
  dnsOverride.checked = true;

  const target = selectInput([["pc", "电脑版 · Windows / macOS / Linux"], ["nikki", "路由器版 · Clash YAML"]]);
  const targetHint = el("div", { class: "field-hint" });
  const targetNotice = el("div", { class: "status-line warn", role: "status", "aria-live": "polite" });
  let targetRevision = 0;
  let refreshExportState = (): void => {};
  const controllerSecret = crypto.randomUUID().replaceAll("-", "");
  const exchangeOnly = el("input", { type: "checkbox" }) as HTMLInputElement;
  const enableTaiwan = el("input", { type: "checkbox" }) as HTMLInputElement;
  const twServer = textInput("台湾家宽代理服务器 / 网关域名");
  const twPort = textInput("1337");
  twPort.type = "number";
  twPort.value = "1337";
  const twProtocol = selectInput([["socks5", "SOCKS5（TCP）"], ["http", "HTTP / HTTPS"]]);
  const twUser = textInput("台湾家宽用户名");
  const twPassword = textInput("台湾家宽密码");
  twPassword.type = "password";
  const twTls = el("input", { type: "checkbox" }) as HTMLInputElement;
  const twLink = textInput("粘贴 socks:// 或 socks5:// 分享链接");
  const exchangeKeys = new Set(["binance", "okx", "bybit", "kucoin", "gate", "bitget"]);
  const twBody = el("div", { style: "display:none" }, [
    field("从分享链接导入", twLink),
    el("button", { class: "btn btn-sm", onclick: () => {
      const parsed = parseSocksLink(twLink.value);
      if (!parsed) { setStatus("无法解析台湾家宽分享链接，请检查格式。", "err"); return; }
      twProtocol.value = "socks5";
      twServer.value = parsed.server;
      twPort.value = parsed.port;
      twUser.value = parsed.username;
      twPassword.value = parsed.password;
      setStatus("台湾家宽连接信息已填充。", "ok");
    } }, ["解析并填充"]),
    field("台湾家宽服务器", twServer),
    el("div", { class: "row-2" }, [field("协议", twProtocol), field("端口", twPort)]),
    el("div", { class: "row-2" }, [field("用户名", twUser), field("密码", twPassword)]),
    el("label", { class: "checkbox-row" }, [twTls, "HTTPS 代理（仅 HTTP 协议）"]),
    el("div", { class: "field-hint" }, ["设备 → 机场台湾节点 → 台湾独立家宽 → 所选国际交易所。导入后在「台湾-中转」选台湾节点；首次默认拒绝，避免空组或选错出口。家宽不可用时连接失败，不切机场或直连。"]),
    el("label", { class: "checkbox-row" }, [exchangeOnly, "精简模式：所选国际交易所 + 台湾影音，其余直连"]),
    el("div", { class: "field-hint" }, ["出口核验：访问 https://api4.ipify.org，对照家宽供应商提供的出口 IP。"]),
  ]);
  const taiwanCard = el("div", { class: "card" }, [
    el("h2", {}, ["台湾独立 IP · 交易所链式代理"]),
    el("label", { class: "checkbox-row" }, [enableTaiwan, "启用机场台湾 → 台湾独立家宽"]),
    el("div", { class: "field-hint" }, ["支持币安、OKX、Bybit、Bitget、Gate、KuCoin；与美国独立 IP 分开配置。开启后下方所选国际交易所固定使用台湾家宽。"]),
    twBody,
  ]);
  const targetCard = el("div", { class: "card" }, [
    el("h2", {}, ["导出版本"]), field("配置将运行在哪里？", target), targetHint, targetNotice,
  ]);
  const updateTarget = (): void => {
    const nikki = target.value === "nikki";
    dnsOverride.disabled = nikki;
    if (nikki) dnsOverride.checked = true;
    targetHint.textContent = nikki
      ? "导出 Ferry-Router.yaml：适用于 OpenClash、Nikki 等支持 Mihomo / Clash Meta 配置的路由器插件。导入后由插件管理路由、防火墙和 DNS 劫持，并检查运行模式与覆写设置。"
      : "导出 Ferry-Desktop.yaml：适用于 Windows、macOS、Linux 上支持 Mihomo / Clash Meta 配置的 Clash 客户端。导入后按需启用系统代理或 TUN，并检查客户端覆写设置。";
  };
  target.onchange = () => { updateTarget(); targetRevision++; refreshExportState(); };
  updateTarget();

  // ---- 机场（可多个）----
  const airportRows: AirportRow[] = [];
  const airportList = el("div", {});

  function addAirportRow(name = "", url = ""): void {
    const nameInput = textInput("机场名字（如 Nice）");
    nameInput.value = name;
    const urlInput = textInput("http://机场域名/s/xxxxxxxx");
    urlInput.value = url;
    const row: AirportRow = {
      wrapper: el("div", { class: "airport-row" }),
      name: nameInput,
      url: urlInput,
    };
    const removeBtn = el("button", { class: "btn btn-sm", onclick: () => removeAirportRow(row) }, [
      "删除",
    ]);
    row.wrapper.append(
      el("div", { class: "row-2" }, [field("机场名字", nameInput), field("订阅链接", urlInput)]),
      removeBtn,
    );
    airportRows.push(row);
    airportList.append(row.wrapper);
  }

  function removeAirportRow(row: AirportRow): void {
    if (airportRows.length <= 1) return; // 至少保留一个机场
    const i = airportRows.indexOf(row);
    if (i >= 0) {
      airportRows.splice(i, 1);
      row.wrapper.remove();
    }
  }

  addAirportRow();

  // ---- 独立 IP 节点 ----
  const nodeName = textInput("美国独立IP");
  nodeName.value = "美国独立IP";
  const protocol = selectInput([
    ["socks5", "socks5"],
    ["http", "http"],
  ]);
  const server = textInput("207.97.137.112");
  const importLink = textInput("粘贴 socks:// 或 socks5:// 分享链接");
  const port = textInput("443");
  port.type = "number";
  port.value = "443";
  const username = textInput("NovProxy 用户名");
  const password = textInput("NovProxy 密码");
  password.type = "password";
  const tls = el("input", { type: "checkbox" }) as HTMLInputElement;

  // 独立 IP 启用开关：默认关（多数用户没有独立IP）；关=不填、不生成独立IP节点，相关流量直接走机场美国节点。
  const enableIndep = el("input", { type: "checkbox" }) as HTMLInputElement;
  enableIndep.checked = false;
  const indepBody = el("div", {}, [
    el("div", { class: "field" }, [
      el("label", {}, ["从分享链接导入"]),
      importLink,
      el("div", { class: "btn-row", style: "margin-top:10px" }, [
        el("button", { class: "btn btn-sm", onclick: onParseLink }, ["解析并填充"]),
      ]),
      el("div", { class: "field-hint" }, [
        "粘贴 socks 分享链接 → 自动填下面的 server / 端口 / 用户名 / 密码（解析在本机完成，不外传）。",
      ]),
    ]),
    field("节点名称", nodeName),
    el("div", { class: "row-2" }, [field("协议", protocol), field("端口", port)]),
    field("独立 IP server（IP 或域名）", server),
    el("div", { class: "row-2" }, [field("用户名", username), field("密码", password)]),
    el("label", { class: "checkbox-row" }, [
      tls,
      el("span", {}, ["对端是 HTTPS 代理（仅协议选 http 时可能需要勾选）"]),
    ]),
  ]);
  enableIndep.onchange = (): void => {
    indepBody.style.display = enableIndep.checked ? "" : "none";
    updateUsRelay(true);
  };
  indepBody.style.display = "none"; // 初始与「默认不启用」一致



  // 左侧创建 APP 策略组，右侧选择美国独立 IP 默认出口；国际交易所另走台湾。
  const APP_CATALOG: { cat: string; apps: { key: string; label: string; on: boolean; relay: boolean }[] }[] = [
    {
      cat: "AI 服务（需美国独立家宽 IP · TapNow 默认走香港）",
      apps: [
        { key: "chatgpt", label: "ChatGPT", on: true, relay: true },
        { key: "gemini", label: "Gemini", on: true, relay: true },
        { key: "perplexity", label: "Perplexity", on: true, relay: true },
        { key: "metaai", label: "Meta AI", on: true, relay: true },
        { key: "copilot", label: "Copilot", on: true, relay: true },
        { key: "tapnow", label: "TapNow（AI 视觉创作 · 默认走香港）", on: true, relay: false },
        { key: "midjourney", label: "Midjourney", on: true, relay: true },
        { key: "grok", label: "Grok（xAI）", on: true, relay: true },
        { key: "cursor", label: "Cursor（AI 编程 IDE）", on: true, relay: true },
      ],
    },
    {
      // 自家官网：走代理加速（默认香港-自动，组内可随时切到美国/日本/新加坡等 -自动）。
      cat: "自家官网（默认走香港自动 · 可切其他国家）",
      apps: [
        { key: "maxsacademy", label: "Max's Academy 官网（maxsacademy.com）", on: true, relay: false },
      ],
    },
    {
      cat: "谷歌 / 苹果 / 微软（大厂·走机场即可）",
      apps: [
        { key: "google", label: "Google（搜索 / Gmail / Drive / Play）", on: true, relay: false },
        { key: "apple", label: "Apple", on: true, relay: false },
        { key: "microsoft", label: "Microsoft", on: true, relay: false },
      ],
    },
    {
      cat: "国外流媒体（默认走香港节点 · 勾选后默认走美国独立 IP）",
      apps: [
        { key: "youtube", label: "YouTube", on: true, relay: false },
        { key: "netflix", label: "Netflix", on: true, relay: false },
        { key: "disney", label: "Disney+", on: true, relay: false },
        { key: "hbo", label: "HBO Max", on: true, relay: false },
        { key: "spotify", label: "Spotify", on: true, relay: false },
        { key: "twitch", label: "Twitch", on: true, relay: false },
      ],
    },
    {
      cat: "美股券商（需美国独立家宽 IP）",
      apps: [
        { key: "robinhood", label: "Robinhood", on: true, relay: true },
        { key: "webull", label: "微牛 Webull", on: true, relay: true },
        { key: "ibkr", label: "盈透 IBKR", on: true, relay: true },
        { key: "schwab", label: "嘉信 Schwab", on: true, relay: true },
        { key: "fidelity", label: "富达 Fidelity", on: true, relay: true },
        { key: "etrade", label: "E*TRADE", on: true, relay: true },
        { key: "vanguard", label: "Vanguard 先锋", on: true, relay: true },
        { key: "merrill", label: "美林 Merrill", on: true, relay: true },
      ],
    },
    {
      cat: "加密货币 · 美国平台（需美国独立家宽 IP）",
      apps: [
        { key: "coinbase", label: "Coinbase", on: true, relay: true },
        { key: "kraken", label: "Kraken", on: true, relay: true },
        { key: "geminiex", label: "Gemini 交易所", on: true, relay: true },
        { key: "cryptocom", label: "Crypto.com", on: true, relay: true },
      ],
    },
    {
      cat: "加密货币 · 海外所（需台湾独立家宽 IP）",
      apps: [
        { key: "binance", label: "Binance 币安", on: true, relay: false },
        { key: "okx", label: "OKX 欧易", on: true, relay: false },
        { key: "bybit", label: "Bybit", on: true, relay: false },
        { key: "kucoin", label: "KuCoin", on: true, relay: false },
        { key: "gate", label: "Gate.io", on: true, relay: false },
        { key: "bitget", label: "Bitget", on: true, relay: false },
      ],
    },
    { cat: "Perforce（默认走机场）", apps: [{ key: "perforce", label: "Perforce 服务器", on: true, relay: false }] },
    { cat: "Parsec（远程桌面 / 串流 · 无需独立家宽 IP）", apps: [{ key: "parsec", label: "Parsec 远程桌面", on: true, relay: false }] },
    {
      cat: "社交（默认不选美国独立 IP · 内容向）",
      apps: [
        { key: "tiktok", label: "TikTok（默认美国独立 IP）", on: true, relay: true },
        { key: "telegram", label: "Telegram", on: true, relay: false },
        { key: "twitter", label: "Twitter(X)", on: true, relay: false },
        { key: "whatsapp", label: "WhatsApp", on: true, relay: false },
        { key: "facebook", label: "Facebook", on: true, relay: false },
        { key: "instagram", label: "Instagram", on: true, relay: false },
        { key: "discord", label: "Discord（含语音域名）", on: true, relay: false },
        { key: "reddit", label: "Reddit", on: true, relay: false },
      ],
    },
    {
      cat: "开发（程序员常用 · 默认走机场）",
      apps: [
        { key: "github", label: "GitHub", on: true, relay: false },
        { key: "gitlab", label: "GitLab", on: true, relay: false },
        { key: "stackoverflow", label: "Stack Overflow", on: true, relay: false },
        { key: "npm", label: "npm", on: true, relay: false },
        { key: "dockerhub", label: "Docker Hub", on: true, relay: false },
        { key: "pypi", label: "PyPI", on: true, relay: false },
        { key: "huggingface", label: "Hugging Face", on: true, relay: false },
        { key: "vercel", label: "Vercel", on: true, relay: false },
        { key: "netlify", label: "Netlify", on: true, relay: false },
        { key: "atlassian", label: "Jira / Atlassian", on: true, relay: false },
        { key: "bitbucket", label: "Bitbucket", on: true, relay: false },
        { key: "replit", label: "Replit", on: true, relay: false },
      ],
    },
    {
      cat: "专业 / 设计（默认不选美国独立 IP · 图多省流量）",
      apps: [
        { key: "artstation", label: "ArtStation", on: true, relay: false },
        { key: "pinterest", label: "Pinterest", on: true, relay: false },
        { key: "behance", label: "Behance", on: true, relay: false },
        { key: "sketchfab", label: "Sketchfab", on: true, relay: false },
        { key: "cgtrader", label: "CGTrader", on: true, relay: false },
        { key: "turbosquid", label: "TurboSquid", on: true, relay: false },
        { key: "quixel", label: "Quixel Megascans", on: true, relay: false },
        { key: "gumroad", label: "Gumroad", on: true, relay: false },
        { key: "deviantart", label: "DeviantArt", on: true, relay: false },
        { key: "dribbble", label: "Dribbble", on: true, relay: false },
        { key: "adobe", label: "Adobe Creative Cloud", on: true, relay: false },
        { key: "unrealengine", label: "Unreal Engine", on: true, relay: false },
        { key: "fab", label: "FAB（Epic 素材市场）", on: true, relay: false },
        { key: "unity", label: "Unity", on: true, relay: false },
        { key: "therookies", label: "The Rookies（therookies.co）", on: true, relay: false },
        { key: "figma", label: "Figma", on: true, relay: false },
      ],
    },
    {
      cat: "美国银行（需美国独立家宽 IP）",
      apps: [
        { key: "chase", label: "Chase 大通", on: true, relay: true },
        { key: "boa", label: "Bank of America", on: true, relay: true },
        { key: "wellsfargo", label: "Wells Fargo", on: true, relay: true },
        { key: "citi", label: "Citibank 花旗", on: true, relay: true },
        { key: "capitalone", label: "Capital One", on: true, relay: true },
        { key: "amex", label: "American Express", on: true, relay: true },
        { key: "discover", label: "Discover", on: true, relay: true },
        { key: "usbank", label: "U.S. Bank", on: true, relay: true },
        { key: "pnc", label: "PNC", on: true, relay: true },
        { key: "ally", label: "Ally Bank", on: true, relay: true },
      ],
    },
    {
      cat: "贷款 / 房贷（需美国独立家宽 IP）",
      apps: [
        { key: "shellpoint", label: "Shellpoint Mortgage", on: true, relay: true },
        { key: "newrez", label: "NewRez", on: true, relay: true },
        { key: "rocket", label: "Rocket Mortgage / Quicken", on: true, relay: true },
        { key: "mrcooper", label: "Mr. Cooper", on: true, relay: true },
        { key: "pennymac", label: "PennyMac", on: true, relay: true },
        { key: "freedommtg", label: "Freedom Mortgage", on: true, relay: true },
        { key: "loandepot", label: "loanDepot", on: true, relay: true },
        { key: "sofi", label: "SoFi", on: true, relay: true },
        { key: "sls", label: "SLS 贷款服务", on: true, relay: true },
        { key: "carrington", label: "Carrington", on: true, relay: true },
        { key: "salliemae", label: "Sallie Mae（学贷）", on: true, relay: true },
        { key: "navient", label: "Navient（学贷）", on: true, relay: true },
      ],
    },
    {
      cat: "美国保险 · 车险 / 房屋险（需美国独立家宽 IP）",
      apps: [
        { key: "statefarm", label: "State Farm", on: true, relay: true },
        { key: "geico", label: "GEICO", on: true, relay: true },
        { key: "progressive", label: "Progressive", on: true, relay: true },
        { key: "allstate", label: "Allstate", on: true, relay: true },
        { key: "usaa", label: "USAA（军人）", on: true, relay: true },
        { key: "libertymutual", label: "Liberty Mutual", on: true, relay: true },
        { key: "farmers", label: "Farmers", on: true, relay: true },
        { key: "nationwide", label: "Nationwide", on: true, relay: true },
        { key: "travelers", label: "Travelers", on: true, relay: true },
        { key: "amfam", label: "American Family", on: true, relay: true },
        { key: "erie", label: "Erie", on: true, relay: true },
        { key: "thehartford", label: "The Hartford", on: true, relay: true },
        { key: "mercury", label: "Mercury", on: true, relay: true },
        { key: "lemonade", label: "Lemonade（房屋/租客）", on: true, relay: true },
        { key: "hippo", label: "Hippo（房屋）", on: true, relay: true },
      ],
    },
    {
      cat: "美国购物（Amazon / Expedia 需美国独立家宽 IP · 其他走机场）",
      apps: [
        { key: "amazon", label: "Amazon（默认美国独立 IP）", on: true, relay: true },
        { key: "ebay", label: "eBay", on: true, relay: false },
        { key: "walmart", label: "Walmart", on: true, relay: false },
        { key: "bestbuy", label: "Best Buy", on: true, relay: false },
        { key: "target", label: "Target", on: true, relay: false },
        { key: "costco", label: "Costco", on: true, relay: false },
        { key: "newegg", label: "Newegg", on: true, relay: false },
        { key: "homedepot", label: "Home Depot", on: true, relay: false },
        { key: "expedia", label: "Expedia（旅行 / 酒店机票）", on: true, relay: true },
      ],
    },
    {
      cat: "政府 / 生活（需美国独立家宽 IP）",
      apps: [
        { key: "irs", label: "IRS 国税局", on: true, relay: true },
        { key: "usps", label: "USPS 邮政", on: true, relay: true },
        { key: "uscis", label: "USCIS 移民局", on: true, relay: true },
        { key: "ssa", label: "SSA 社保", on: true, relay: true },
        { key: "idme", label: "ID.me", on: true, relay: true },
        { key: "logingov", label: "Login.gov", on: true, relay: true },
      ],
    },
    {
      cat: "游戏（默认不选美国独立 IP · 走机场低延迟）",
      apps: [
        { key: "steam", label: "Steam", on: true, relay: false },
        { key: "epic", label: "Epic Games", on: true, relay: false },
        { key: "ea", label: "EA", on: true, relay: false },
        { key: "blizzard", label: "Blizzard 暴雪", on: true, relay: false },
        { key: "ubisoft", label: "Ubisoft 育碧", on: true, relay: false },
        { key: "playstation", label: "PlayStation", on: true, relay: false },
        { key: "nintendo", label: "Nintendo 任天堂", on: true, relay: false },
        { key: "riot", label: "Riot 拳头", on: true, relay: false },
      ],
    },
  ];
  const domainEdits = new Map<string, GroupDomainEdit>();
  let baselinePromise: Promise<string> | null = null;
  const domainChange = () => { setStatus("策略组域名已修改，请重新生成 YAML 应用更改。", "warn"); persistDraft(); };
  const domainBaseline = () => {
    if (!baselinePromise) baselinePromise = platform().generateConfig({
      airports: [{ name: "DomainCatalog", url: "https://example.test/sub" }], independentNodes: [],
      splitApps: APP_CATALOG.flatMap(c => c.apps.map(a => ({ key: a.key, name: a.label.split("（")[0].trim(), relay: false }))),
    }).then(result => result.yaml).catch(error => { baselinePromise = null; throw error; });
    return baselinePromise;
  };
  const appControls: { key: string; name: string; on: HTMLInputElement; relay: HTMLInputElement; relayLabel: HTMLElement }[] = [];
  const categorySites: CategorySite[] = [];
  // 各分类「全选」框的刷新器：全局全选/反选后调用，让分类框跟随。
  const catAllUpdaters: (() => void)[] = [];
  const splitSections = APP_CATALOG.map((c) => {
    const inner = el("div", { class: "acc-inner" });
    const catOns: HTMLInputElement[] = [];
    for (const a of c.apps) {
      const name = a.label.split("（")[0].trim();
      const managerHost = el("div", { class: "group-domain-manager", id: `domains-${a.key}`, hidden: true });
      let manager: ReturnType<typeof import("./group-domain-manager").renderGroupDomainManager> | null = null;
      const manageButton = el("button", { type: "button", class: "btn btn-sm", "aria-label": `管理 ${name} 域名`, "aria-expanded": "false", "aria-controls": `domains-${a.key}`, onclick: async () => {
        if (manager) { manager.toggle(); return; }
        manageButton.disabled = true;
        managerHost.hidden = false;
        managerHost.textContent = "正在加载默认域名…";
        try {
          const [module, baseline] = await Promise.all([import("./group-domain-manager"), domainBaseline()]);
          managerHost.replaceChildren();
          manager = module.renderGroupDomainManager(managerHost, [{ name }], baseline, domainEdits, domainChange, open => {
            manageButton.setAttribute("aria-expanded", String(open));
            manageButton.textContent = open ? "收起域名" : "管理域名";
          }, isExclusiveApp(a.key) && exclusiveUnlocked);
        } catch (e) { managerHost.textContent = `加载失败：${(e as Error).message}。请再次点击管理域名重试。`; }
        finally { manageButton.disabled = false; }
      } }, ["管理域名"]) as HTMLButtonElement;
      const on = el("input", { type: "checkbox" }) as HTMLInputElement;
      on.checked = a.on && canIncludeApp(a.key, exclusiveUnlocked);
      on.disabled = isExclusiveApp(a.key);
      const relay = el("input", { type: "checkbox" }) as HTMLInputElement;
      relay.checked = false;
      relay.disabled = true;
      relay.setAttribute("aria-label", `${a.label}：美国独立 IP 中转`);
      const relayLabel = el("label", { class: "checkbox-row", style: "display:none;opacity:.85;flex-shrink:0;margin-left:12px" }, [
        el("span", { class: "field-hint", style: "margin:0 6px 0 0" }, ["美国独立 IP 中转"]), relay,
      ]);
      // 策略组名 = 标签去掉「（…）」注解（如 "Google（搜索…）" → "Google"）。
      appControls.push({ key: a.key, name: a.label.split("（")[0].trim(), on, relay, relayLabel });
      catOns.push(on);
      const appRow = el("div", { "data-group-name": name });
      appRow.append(
        el(
          "div",
          { style: "display:flex;justify-content:space-between;align-items:center;padding:5px 0 5px 14px" },
          [
            el("label", { class: "checkbox-row" }, [on, domainLogo(a.key === "perforce" ? "perforce.com" : SITE_CATALOG.find(site => site.key === a.key)?.domains[0] ?? ""), el("span", {}, [a.label])]),
            el("div", { class: "btn-row", style: "justify-content:flex-end;gap:8px" }, [
              exchangeKeys.has(a.key) ? el("span", { class: "field-hint", style: "margin:0;white-space:nowrap" }, ["台湾出口（单独配置）"]) : relayLabel,
              manageButton,
            ]),
          ],
        ), managerHost,
      );
      inner.append(appRow);
    }
    // 分类「全选」框：勾/取消本分类所有 APP 的「走代理」；半选=部分勾。点它不触发折叠。
    const catAll = el("input", { type: "checkbox", title: "全选 / 取消本分类" }) as HTMLInputElement;
    const updateCatAll = (): void => {
      const controls = [...catOns, ...categorySites.filter(s => s.category === c.cat).map(s => s.enabled)];
      const n = controls.filter((o) => o.checked).length;
      catAll.checked = n === controls.length;
      catAll.indeterminate = n > 0 && n < controls.length;
    };
    catAll.onclick = (e: MouseEvent): void => {
      e.stopPropagation();
      for (const o of catOns) o.checked = catAll.checked;
      for (const site of categorySites.filter(s => s.category === c.cat)) site.enabled.checked = catAll.checked;
      persistDraft();
    };
    for (const o of catOns) o.addEventListener("change", updateCatAll);
    updateCatAll();
    catAllUpdaters.push(updateCatAll);
    const arrow = el("span", { class: "acc-arrow" }, ["▸"]);
    const body = el("div", { class: "acc-body" }, [inner]); // 下拉动画容器（grid-rows 0fr↔1fr）
    let adder: ReturnType<typeof import("./category-sites").categorySiteAdder> | undefined;
    const getAdder = async () => {
      if (!adder) adder = (await import("./category-sites")).categorySiteAdder(inner, c.cat, categorySites, {
        names: () => [...appControls.map(a => a.name), ...categorySites.map(s => s.name), ...customRows.map(r => `自定义 · ${r.saved?.name ?? r.name.value.trim()}`)],
        defaultExit: c.apps.some(a => exchangeKeys.has(a.key)) ? "台湾-自动" : c.apps.some(a => a.relay) ? "美国-自动" : "香港-自动",
        changed: domainChange, selectionChanged: updateCatAll, edits: domainEdits,
      });
      return adder;
    };
    siteRestorers.set(c.cat, async saved => { (await getAdder()).restore(saved); });
    const addSite = el("button", { type: "button", class: "btn btn-sm", "aria-label": `${c.cat}：添加站点`, style: "flex-shrink:0", onclick: async (event: Event) => {
      event.stopPropagation();
      addSite.disabled = true;
      try {
        body.classList.add("open"); arrow.classList.add("acc-arrow--open");
        (await getAdder()).open();
      } catch(error) { setStatus(`无法打开添加站点：${(error as Error).message}`, "err"); }
      finally { addSite.disabled = false; }
    } }, ["＋ 添加站点"]) as HTMLButtonElement;
    const header = el(
      "div",
      {
        style:
          "display:flex;align-items:center;gap:8px;cursor:pointer;font-weight:700;font-size:15px;padding:10px 0;border-top:2px solid #161616",
        onclick: (): void => {
          const open = body.classList.toggle("open");
          arrow.classList.toggle("acc-arrow--open", open);
        },
      },
      [catAll, arrow, el("span", { style: "flex:1" }, [c.cat]), addSite],
    );
    return el("div", { hidden: c.apps.some(a => isExclusiveApp(a.key)) }, [header, body]);
  });
  function updateUsRelay(restoreDefaults = false): void {
    const enabled = enableIndep.checked && !exchangeOnly.checked;
    selectAll.textContent = enabled ? "一键全选（APP + 美国独立 IP 中转）" : "一键全选 APP";
    invertAll.textContent = enabled ? "一键反选（APP + 美国独立 IP 中转）" : "一键反选 APP";
    for (const c of appControls) {
      c.relay.disabled = !enabled || exchangeKeys.has(c.key) || !canIncludeApp(c.key, exclusiveUnlocked);
      c.relayLabel.style.display = c.relay.disabled ? "none" : "";
      if (c.relay.disabled) c.relay.checked = false;
      else if (restoreDefaults) c.relay.checked = APP_CATALOG.flatMap((cat) => cat.apps).find((a) => a.key === c.key)?.relay ?? false;
    }
  }
  const selectAll = el(
    "button",
    {
      class: "btn btn-sm",
      onclick: (): void => {
        for (const c of appControls) {
          if (!canIncludeApp(c.key, exclusiveUnlocked)) continue;
          c.on.checked = true;
          c.relay.checked = !c.relay.disabled;
        }
        for (const site of categorySites) site.enabled.checked = true;
        for (const group of customRows) group.enabled.checked = true;
        catAllUpdaters.forEach((f) => f());
        persistDraft();
      },
    },
    ["一键全选 APP"],
  );
  const invertAll = el(
    "button",
    {
      class: "btn btn-sm",
      onclick: (): void => {
        for (const c of appControls) {
          if (!canIncludeApp(c.key, exclusiveUnlocked)) continue;
          c.on.checked = !c.on.checked;
          c.relay.checked = !c.relay.disabled && !c.relay.checked;
        }
        for (const site of categorySites) site.enabled.checked = !site.enabled.checked;
        for (const group of customRows) group.enabled.checked = !group.enabled.checked;
        catAllUpdaters.forEach((f) => f());
        persistDraft();
      },
    },
    ["一键反选 APP"],
  );
  const mysteryCode = el("input", { type: "password", "aria-label": "神秘代码", placeholder: "输入神秘代码", autocomplete: "off", inputmode: "numeric", "data-1p-ignore": "true", "data-lpignore": "true" }) as HTMLInputElement;
  const unlockStatus = el("div", { class: "status-line", role: "status", "aria-live": "polite" });
  const unlock = el("button", { type: "button", class: "btn primary", onclick: async () => {
    unlock.disabled = true;
    try {
      if (!await matchesExclusiveCode(mysteryCode.value)) { unlockStatus.textContent = "神秘代码不正确，请重试。"; unlockStatus.className = "status-line err"; return; }
      exclusiveUnlocked = true;
      for (const c of appControls.filter(c => isExclusiveApp(c.key))) { c.on.disabled = false; c.on.checked = true; }
      splitSections.forEach((section, i) => { section.hidden = !exclusiveUnlocked && APP_CATALOG[i].apps.some(a => isExclusiveApp(a.key)); });
      catAllUpdaters.forEach(fn => fn()); updateUsRelay();
      mysteryCode.value = ""; mysteryCode.hidden = true; unlock.hidden = true;
      unlockStatus.textContent = "麦壳思专属配置已解锁：自家官网、Perforce。刷新页面或一键 Reset 后重新隐藏。";
      unlockStatus.className = "status-line ok";
      setStatus("已解锁专属配置，请重新生成 YAML 应用更改。", "ok");
    } catch { unlockStatus.textContent = "暂时无法校验代码，请刷新后重试。"; }
    finally { unlock.disabled = false; }
  } }, ["解锁专属配置"]) as HTMLButtonElement;
  mysteryCode.onkeydown = (event) => { if (event.key === "Enter") { event.preventDefault(); unlock.click(); } };
  mysteryCode.style.cssText = "flex:1;min-width:180px;max-width:420px;min-height:44px;box-sizing:border-box;padding:10px 14px;border:2px solid #161616;border-radius:8px;font:inherit;background:#fff";
  const mysteryPanel = el("div", { class: "card", style: "background:#fff2b3;border:3px solid #161616" }, [
    el("h2", {}, ["麦壳思专属解锁"]),
    el("div", { class: "field-hint" }, ["在下方输入神秘代码，解锁麦壳思专属配置。"]),
    el("div", { class: "btn-row", style: "margin-top:12px;align-items:center;flex-wrap:wrap" }, [mysteryCode, unlock]), unlockStatus,
  ]);
  const splitCard = el("div", { class: "card" }, [
    el("h2", {}, ["分流选择（每个 APP 一个独立策略组 · 生成后在 zashboard 里逐个切换出口）"]),
    el("div", { class: "field-hint" }, ["标注“需独立家宽 IP”的分类，请先在上方启用并填写对应地区的独立家宽代理。"]),
    el("div", { class: "field-hint" }, [
      "默认按各服务的常规出口分流（Apple / Microsoft 默认直连）。启用并填写美国家宽后，才显示美国独立 IP 中转选项；勾选后默认走「机场美国节点 → 美国独立 IP → 该 APP」，取消则恢复该服务的常规出口。客户端已保存的选择可能覆盖初始默认出口。",
    ]),
    el("div", { class: "field-hint" }, [
      "国际交易所使用台湾出口：启用台湾家宽后固定走「机场台湾节点 → 台湾独立家宽」；未启用时默认走机场台湾节点，不受美国独立 IP 中转开关影响。未勾选的 APP 按其余规则分流。",
    ]),
    el("div", { class: "btn-row", style: "margin: 14px 0 12px" }, [selectAll, invertAll]),
    ...splitSections,
  ]);

  type CustomGroup = NonNullable<GenerateInput["customGroups"]>[number];
  const customRows: { id: string; wrapper: HTMLElement; name: HTMLInputElement; enabled: HTMLInputElement; saved?: CustomGroup; pending: () => boolean; prompt: () => void }[] = [];
  const createdCustomList = el("div", { "aria-label": "已创建的自定义策略组" });
  splitCard.append(createdCustomList);
  const customList = el("div", {});
  const countryOptions: [string, string][] = [["us", "美国"], ["hk", "香港"], ["tw", "台湾"], ["jp", "日本"], ["sg", "新加坡"], ["kr", "韩国"], ["gb", "英国"], ["de", "德国"], ["fr", "法国"], ["ca", "加拿大"], ["au", "澳大利亚"], ["nl", "荷兰"]];
  function addCustomGroup(restored?: SavedCustomGroup): void {
    const name = textInput("例如：工作网站、日本购物");
    const country = selectInput(countryOptions);
    country.setAttribute("aria-label", "自定义默认国家线路");
    const wrapper = el("div", { style: "border-top:2px solid #161616;padding-top:16px;margin-top:16px" });
    const enabled = el("input", { type: "checkbox" }) as HTMLInputElement;
    enabled.checked = true;
    const categoryId = restored?.id ?? `custom-${crypto.randomUUID()}`;
    const groupTitle = el("span", { style: "flex:1" });
    const catAll = el("input", { type: "checkbox", title: "全选 / 取消本分类" }) as HTMLInputElement;
    const emptyHint = el("div", { class: "field-hint", style: "padding:12px 14px" }, ["暂无站点。点击右侧「＋ 添加站点」，再填写网站名称和域名。"]);
    const refreshSelection = () => {
      const children = categorySites.filter(s => s.category === categoryId);
      emptyHint.hidden = children.length > 0;
      if (children.length) enabled.checked = children.some(s => s.enabled.checked);
      const controls = children.length ? children.map(s => s.enabled) : [enabled];
      const count = controls.filter(c => c.checked).length;
      catAll.checked = count === controls.length;
      catAll.indeterminate = count > 0 && count < controls.length;
    };
    catAll.onclick = event => {
      event.stopPropagation(); enabled.checked = catAll.checked;
      for (const site of categorySites.filter(s => s.category === categoryId)) site.enabled.checked = catAll.checked;
      refreshSelection(); domainChange();
    };
    const arrow = el("span", { class: "acc-arrow" }, ["▸"]);
    const inner = el("div", { class: "acc-inner" }, [emptyHint]);
    const body = el("div", { class: "acc-body" }, [inner]);
    const setOpen = (open: boolean) => { body.classList.toggle("open", open); arrow.classList.toggle("acc-arrow--open", open); summary.setAttribute("aria-expanded", String(open)); };
    const settings = el("button", { type: "button", class: "btn btn-sm", onclick: (event: Event) => {
      event.stopPropagation(); setOpen(true); wrapper.hidden = !wrapper.hidden;
    } }, ["设置"]);
    let adder: ReturnType<typeof import("./category-sites").categorySiteAdder> | undefined;
    const getAdder = async () => {
      if (!adder) adder = (await import("./category-sites")).categorySiteAdder(inner, categoryId, categorySites, {
        names: () => [...appControls.map(a => a.name), ...categorySites.map(s => s.name), ...customRows.map(r => `自定义 · ${r.saved?.name ?? r.name.value.trim()}`)],
        get defaultExit() { return `自定义线路 · ${countryOptions.find(c => c[0] === row.saved?.country)?.[1] ?? "美国"}`; },
        exitValue: label => `自定义线路 · ${label}`, displayName: () => row.saved?.name ?? name.value,
        changed: domainChange, selectionChanged: refreshSelection, edits: domainEdits,
      });
      return adder;
    };
    siteRestorers.set(categoryId, async saved => { (await getAdder()).restore(saved); });
    const addSite = el("button", { type: "button", class: "btn btn-sm", style: "flex-shrink:0", onclick: async (event: Event) => {
      event.stopPropagation(); setOpen(true); addSite.disabled = true;
      try {
        (await getAdder()).open();
      } catch (error) { setStatus(`无法添加站点：${(error as Error).message}`, "err"); }
      finally { addSite.disabled = false; }
    } }, ["＋ 添加站点"]) as HTMLButtonElement;
    const summary = el("div", { role: "button", tabindex: "0", "aria-expanded": "false", style: "display:flex;align-items:center;gap:8px;cursor:pointer;font-weight:700;font-size:15px;padding:10px 0;border-top:2px solid #161616", onclick: () => setOpen(!body.classList.contains("open")), onkeydown: (raw: Event) => {
      const event = raw as KeyboardEvent;
      if (event.target === summary && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); setOpen(!body.classList.contains("open")); }
    } }, [catAll, arrow, groupTitle, settings, addSite]);
    const section = el("div", {}, [summary, body]);
    const message = el("div", { class: "status-line", role: "status", "aria-live": "polite" }, ["先填写名称并选择默认线路，创建后再添加站点和域名。"]);
    const readGroup = (): CustomGroup => ({ name: name.value.trim(), country: country.value, exact: false, domains: [] });
    const row: typeof customRows[number] = {
      id: categoryId, wrapper, name, enabled,
      pending: () => !row.saved || JSON.stringify(readGroup()) !== JSON.stringify(row.saved),
      prompt: () => {
        if (row.saved) { setOpen(true); wrapper.hidden = false; }
        message.className = "status-line warn";
        message.textContent = row.saved ? "修改尚未保存，请点击「保存修改」。" : "请先填写名称并点击「创建策略组」，或删除此草稿。";
      },
    };
    const save = el("button", { type: "button", class: "btn primary", onclick: async () => {
      save.disabled = true;
      const candidate = readGroup();
      try {
        if (categorySites.some(s => s.name === `自定义 · ${candidate.name}`)) throw new Error("策略组名称已存在，请更换名称。");
        await platform().generateConfig({ airports: [{ name: "CustomValidation", url: "https://example.test/sub" }], independentNodes: [], splitApps: [],
          customGroups: [...customRows.filter(r => r !== row && r.saved).map(r => r.saved!), candidate] });
        if (!customRows.includes(row)) return;
        if (JSON.stringify(readGroup()) !== JSON.stringify(candidate)) { row.prompt(); return; }
        const wasCreated = !!row.saved;
        row.saved = candidate;
        groupTitle.textContent = `自定义 · ${candidate.name}`;
        catAll.setAttribute("aria-label", `自定义 · ${candidate.name}：全选 / 取消本分类`);
        addSite.setAttribute("aria-label", `自定义 · ${candidate.name}：添加站点`);
        settings.setAttribute("aria-label", `设置 自定义 · ${candidate.name}`);
        name.value = candidate.name;
        save.textContent = "保存修改";
        message.className = "status-line ok";
        message.textContent = `已${wasCreated ? "保存" : "创建"}「自定义 · ${candidate.name}」。点击分类右侧「＋ 添加站点」添加域名。默认线路用于之后新增的站点，已有站点可单独调整。`;
        if (!wasCreated) {
          wrapper.style.cssText = "padding:12px 0";
          inner.append(wrapper);
          createdCustomList.append(section);
          catAllUpdaters.push(refreshSelection);
        }
        wrapper.hidden = true;
        refreshSelection(); setOpen(true);
        setStatus(message.textContent, "ok");
        summary.focus({ preventScroll: true });
        section.scrollIntoView({ behavior: "smooth", block: "center" });
        persistDraft();
      } catch (error) {
        message.className = "status-line err";
        message.textContent = error instanceof Error ? error.message : String(error);
      } finally { save.disabled = false; }
    } }, ["创建策略组"]) as HTMLButtonElement;
    for (const input of [name, country]) input.addEventListener("input", () => { if (row.pending()) row.prompt(); });
    wrapper.append(field("策略组名称", name), field("默认国家 / 地区线路", country),
      el("div", { class: "btn-row" }, [save, el("button", { type: "button", class: "btn btn-sm", onclick: () => {
        customRows.splice(customRows.indexOf(row), 1);
        siteRestorers.delete(categoryId);
        for (let i = categorySites.length - 1; i >= 0; i--) if (categorySites[i].category === categoryId) { domainEdits.delete(categorySites[i].name); categorySites.splice(i, 1); }
        const refreshIndex = catAllUpdaters.indexOf(refreshSelection); if (refreshIndex >= 0) catAllUpdaters.splice(refreshIndex, 1);
        wrapper.remove(); section.remove(); domainChange();
      } }, ["删除此分类及站点"])]), message);
    customRows.push(row);
    customList.append(wrapper);
    if (restored) {
      row.saved = { name: restored.name, country: restored.country, exact: false, domains: [] };
      name.value = restored.name; country.value = restored.country; enabled.checked = restored.enabled;
      groupTitle.textContent = `自定义 · ${restored.name}`;
      catAll.setAttribute("aria-label", `自定义 · ${restored.name}：全选 / 取消本分类`);
      addSite.setAttribute("aria-label", `自定义 · ${restored.name}：添加站点`);
      settings.setAttribute("aria-label", `设置 自定义 · ${restored.name}`);
      save.textContent = "保存修改";
      wrapper.style.cssText = "padding:12px 0"; wrapper.hidden = true;
      inner.append(wrapper); createdCustomList.append(section); catAllUpdaters.push(refreshSelection);
      refreshSelection(); setOpen(true);
    }
  }
  const customCard = el("div", { class: "card" }, [
    el("h2", {}, ["自定义域名分流"]),
    el("div", { class: "field-hint" }, ["先填写策略组名称、选择默认线路并创建，不需要填写域名。创建后会出现在上方「游戏」下方，再点击「＋ 添加站点」添加网站和域名。"]),
    el("div", { class: "field-hint" }, ["站点的「管理域名」支持补全、添加、删除和 Reset；名称与线路在「设置」中调整。线路使用机场节点，订阅需包含所选国家节点。"]),
    customList,
    el("div", { class: "btn-row", style: "margin-top:14px" }, [el("button", { class: "btn btn-sm", onclick: () => addCustomGroup() }, ["+ 添加自定义策略组"])]),
  ]);

  const submit = el("button", { class: "btn primary block", onclick: onSubmit }, [
    platform().kind === "desktop" ? "生成配置并另存为 .yaml" : "生成并预览 YAML",
  ]) as HTMLButtonElement;
  let editableResult: { yaml: string; filename: string } | null = null;
  let generatedResult: GenerateResult | null = null;
  let generatedRevision = -1;
  const exportIsCurrent = (): boolean => !!generatedResult && generatedRevision === targetRevision && generatedResult.target === target.value;
  let generatedSource = "";
  const editGenerated = el("button", { class: "btn block", disabled: true, onclick: () => {
    if (editableResult && exportIsCurrent()) window.dispatchEvent(new CustomEvent("ferry:edit-yaml", { detail: editableResult }));
  } }, ["继续编辑本次 YAML · 追加站点 / 调整策略组"]) as HTMLButtonElement;
  const previewMeta = el("div", { class: "field-hint" });
  const previewHost = el("div", { class: "yaml-source-editor" });
  const previewStatus = el("div", { class: "status-line", role: "status", "aria-live": "polite" });
  function updateSource(source: string): void {
    if (!generatedResult) return;
    generatedResult = { ...generatedResult, yaml: source };
    editableResult = { yaml: source, filename: generatedResult.suggestedFileName };
    previewMeta.textContent = `${generatedResult.suggestedFileName} · ${source.split("\n").length} 行 · ${(new TextEncoder().encode(source).length / 1024).toFixed(1)} KB${source !== generatedSource ? " · 已修改" : ""}`;
    previewStatus.textContent = source !== generatedSource ? "代码已修改，复制、下载和策略组编辑均使用当前内容。" : "";
    previewStatus.className = "status-line";
    refreshExportState();
  }
  function previewMessage(message: string, error = false): void {
    previewStatus.textContent = message;
    previewStatus.className = `status-line ${error ? "err" : "ok"}`;
  }
  let preview: ReturnType<typeof import("./yaml-preview").createYamlPreview> | null = null;
  const downloadYaml = el("button", { class: "btn primary", onclick: async () => {
    if (!generatedResult || !exportIsCurrent()) return;
    try {
      const result = { ...generatedResult };
      const { inspectYaml } = await import("../yaml-editor");
      const errors = inspectYaml(result.yaml).filter(p => p.severity === "error");
      if (errors.length) throw new Error(`请先修正：${errors[0].message}`);
      if (!exportIsCurrent() || result.target !== target.value) return;
      const done = await platform().saveResult(result);
      if (done) previewMessage(`✅ ${done}`);
    } catch (e) { previewMessage(`下载失败：${(e as Error).message}`, true); }
  } }, ["下载此 YAML"]) as HTMLButtonElement;
  const copyYaml = el("button", { class: "btn", onclick: async () => {
    if (!generatedResult || !exportIsCurrent()) return;
    try { await navigator.clipboard.writeText(generatedResult.yaml); previewMessage("已复制当前完整 YAML（包含代码修改）。"); }
    catch { previewMessage("浏览器未允许复制，请在编辑区选择代码复制，或下载文件。", true); }
  } }, ["复制完整代码"]) as HTMLButtonElement;
  refreshExportState = (): void => {
    const label = target.value === "nikki" ? "路由器版 · Ferry-Router.yaml" : "电脑版 · Ferry-Desktop.yaml";
    const stale = !!generatedResult && !exportIsCurrent();
    targetNotice.textContent = stale
      ? `配置已更改，当前导出为${label}。请重新点击「生成并预览 YAML」，旧预览暂不可下载。`
      : "";
    downloadYaml.disabled = copyYaml.disabled = editGenerated.disabled = !exportIsCurrent();
    downloadYaml.textContent = stale ? "请先重新生成 YAML" : generatedResult ? `下载 ${generatedResult.suggestedFileName}` : "下载此 YAML";
    if (stale) previewMessage(targetNotice.textContent, true);
  };
  const previewCard = el("div", { class: "card", style: "display:none" }, [
    el("h2", {}, ["YAML 预览与编辑"]), previewMeta,
    el("div", { class: "field-hint" }, ["可直接修改代码，支持行号、高亮、错误提示、折叠、Ctrl+F 搜索和 Ctrl+Z 撤销。复制与下载使用当前代码；代码修改不会回填上方表单，重新生成会替换编辑内容。刷新或关闭页面前请下载保存。"]),
    el("div", { class: "btn-row", style: "margin:12px 0" }, [downloadYaml, copyYaml]),
    previewStatus, previewHost, editGenerated,
  ]);

  function setStatus(msg: string, kind: "" | "ok" | "err" | "warn" = ""): void {
    status.textContent = msg;
    status.className = `status-line ${kind}`;
  }

  function onParseLink(): void {
    const parsed = parseSocksLink(importLink.value);
    if (!parsed) {
      setStatus("❌ 链接解析失败：请确认是 socks:// 开头的分享链接。", "err");
      return;
    }
    // 只填连接信息；节点名保持「美国独立IP」（名字必须含「独立」，否则会被中转组循环引用）。
    protocol.value = "socks5";
    server.value = parsed.server;
    port.value = parsed.port;
    username.value = parsed.username;
    password.value = parsed.password;
    setStatus(`✅ 已填充：${parsed.server}:${parsed.port}（账号密码已自动填好）`, "ok");
  }

  async function generateCurrent(): Promise<GenerateResult> {
    const parsedPort = Number(port.value);
    const airports = airportRows
      .map((r) => ({ name: r.name.value.trim(), url: r.url.value.trim() }))
      .filter((a) => a.name !== "" || a.url !== "");
    const payload: GenerateInput = {
      target: target.value as "pc" | "nikki",
      controllerSecret,
      exchangeOnly: enableTaiwan.checked && exchangeOnly.checked,
      taiwanNode: enableTaiwan.checked ? {
        name: "台湾独立IP", protocol: twProtocol.value as Protocol,
        server: twServer.value.trim(), port: Number(twPort.value) || 0,
        username: twUser.value, password: twPassword.value, tls: twTls.checked,
        dialerProxy: "台湾-中转",
      } : null,
      airports,
      // 按开关决定是否生成美国独立 IP；精简模式不使用美国链路。
      independentNodes:
        !exchangeOnly.checked && enableIndep.checked
          ? [
              {
                name: nodeName.value.trim() || "美国独立IP",
                protocol: protocol.value as Protocol,
                server: server.value.trim(),
                port: Number.isFinite(parsedPort) ? parsedPort : 0,
                username: username.value,
                password: password.value,
                tls: tls.checked,
                dialerProxy: "美国-中转",
              },
            ]
          : [],
      // 精简模式只提交所选国际交易所。
      splitApps: appControls
        .filter((c) => c.on.checked && canIncludeApp(c.key, exclusiveUnlocked) && (!exchangeOnly.checked || exchangeKeys.has(c.key)))
        .map((c) => ({ key: c.key, relay: enableIndep.checked && !c.relay.disabled && c.relay.checked, name: c.name })),
      dnsOverride: dnsOverride.checked,
      customGroups: customRows.filter(r => r.enabled.checked).map(r => r.saved!),
    };
    let result = await platform().generateConfig(payload);
    if (domainEdits.size) {
      const { applyGroupDomainEdits } = await import("../yaml-editor");
      result = { ...result, yaml: applyGroupDomainEdits(result.yaml, domainEdits) };
    }
    const enabledSites = categorySites.filter(s => s.enabled.checked && (!exchangeOnly.checked || APP_CATALOG.find(c => c.cat === s.category)?.apps.some(a => exchangeKeys.has(a.key))));
    if (enabledSites.length) {
      const { applyAddedSites, applyGroupDomainEdits } = await import("../yaml-editor");
      result = { ...result, yaml: applyAddedSites(result.yaml, enabledSites) };
      const siteEdits = new Map([...domainEdits].filter(([name]) => enabledSites.some(site => site.name === name)));
      result = { ...result, yaml: applyGroupDomainEdits(result.yaml, siteEdits) };
    }
    return result;
  }

  async function onSubmit(): Promise<void> {
    const pendingGroup = customRows.find(r => r.pending());
    if (pendingGroup) {
      pendingGroup.prompt();
      setStatus("请先创建或保存自定义策略组，再生成 YAML。", "warn");
      pendingGroup.wrapper.scrollIntoView({ behavior: "smooth", block: "center" });
      pendingGroup.name.focus({ preventScroll: true });
      return;
    }
    if (platform().kind === "web" && generatedResult && generatedResult.yaml !== generatedSource && !window.confirm("重新生成将替换当前修改过的 YAML。是否继续？")) return;
    submit.disabled = true;
    setStatus("正在生成与校验…");
    try {
      const requestRevision = targetRevision;
      const result = await generateCurrent();
      generatedResult = result;
      generatedRevision = requestRevision;
      generatedSource = result.yaml;
      editableResult = { yaml: result.yaml, filename: result.suggestedFileName };
      editGenerated.disabled = false;
      if (platform().kind === "web") {
        previewCard.style.display = "";
        updateSource(result.yaml);
        if (preview) preview.setSource(result.yaml);
        else {
          const fallback = el("textarea", { "aria-label": "YAML 预览与编辑", spellcheck: "false", style: "width:100%;min-height:420px;font-family:Consolas,monospace" }) as HTMLTextAreaElement;
          fallback.value = result.yaml;
          fallback.oninput = () => updateSource(fallback.value);
          previewHost.replaceChildren(fallback);
          try { preview = (await import("./yaml-preview")).createYamlPreview(previewHost, fallback.value, updateSource); }
          catch { /* Keep the editable textarea available when the code editor cannot load. */ }
        }
        setStatus("✅ 已生成并通过校验。可在下方直接预览、编辑，再下载 YAML。", "ok");
        refreshExportState();
        if (!exportIsCurrent()) setStatus("生成期间切换了导出版本，请重新生成当前版本。", "warn");
        previewCard.scrollIntoView({ behavior: "smooth", block: "start" });
        return;
      }
      if (!exportIsCurrent()) { setStatus("生成期间切换了导出版本，请重新生成当前版本。", "warn"); return; }
      setStatus("✅ 校验通过，正在落地…", "ok");
      // 落地方式由平台决定：桌面版弹保存对话框写盘，网页版直接触发下载。
      const done = await platform().saveResult(result);
      if (!done) {
        setStatus("已取消保存（配置未写入）。", "warn");
        return;
      }
      setStatus("✅ " + done, "ok");
      // Keep export and verification instructions visible; return via the header.
    } catch (e) {
      setStatus(`❌ ${e instanceof Error ? e.message : String(e)}`, "err");
    } finally {
      submit.disabled = false;
    }
  }

  // 美国独立 IP 配置卡片。
  const indepCard = el("div", { class: "card" }, [
    el("h2", {}, ["美国独立 IP · 静态家宽代理"]),
    el("label", { class: "checkbox-row" }, [
      enableIndep,
      el("span", {}, ["启用机场美国 → 美国独立家宽"]),
    ]),
    el("div", { class: "field-hint" }, [
      "默认关闭。未启用时，所有美国独立 IP 中转开关均关闭，按各服务的常规出口分流。启用后需填写有效的美国家宽连接信息。",
    ]),
    indepBody,
  ]);

  // DNS 覆写卡片：默认开（fake-ip 接管 DNS）；机场线路调整公告要求关闭时取消勾选。
  const dnsCard = el("div", { class: "card" }, [
    el("label", { class: "checkbox-row" }, [
      dnsOverride,
      el("span", { style: "font-weight:700" }, ["DNS 覆写（默认开 · fake-ip 接管 DNS）"]),
    ]),
    el("div", { class: "field-hint" }, [
      "机场公告要求「关闭 DNS 覆写」时取消勾选，再生成并导入客户端：配置中的 dns.enable 将设为 false。",
    ]),
  ]);

  const updateTaiwan = (): void => {
    twBody.style.display = enableTaiwan.checked ? "" : "none";
    if (!enableTaiwan.checked) exchangeOnly.checked = false;
    indepCard.style.display = exchangeOnly.checked ? "none" : "";
    updateUsRelay();
    splitSections.forEach((sec, i) => {
      sec.style.display = exchangeOnly.checked && !APP_CATALOG[i].apps.some((a) => exchangeKeys.has(a.key)) ? "none" : "";
    });
  };
  enableTaiwan.onchange = updateTaiwan;
  exchangeOnly.onchange = updateTaiwan;

  const topbar = platform().kind === "desktop" ? [
    el("div", { class: "topbar" }, [
      el("div", {}, [
        el("h1", {}, ["FerryLite · YAML 配置生成"]),
        el("div", { class: "sub" }, ["填写机场与独立 IP，生成后导入电脑或路由器的 Clash 客户端（Mihomo / Clash Meta 内核）。"]),
      ]),
    ]),
  ] : [];

  const view = el("div", {}, [
    ...topbar,
    mysteryPanel,
    storageStatus,
    el("div", { class: "btn-row", style: "justify-content:flex-end;margin-bottom:16px" }, [el("button", { type: "button", class: "btn", onclick: () => {
      if (!window.confirm("一键 Reset 将清空机场订阅、独立 IP、自定义域名和当前 YAML 编辑，恢复全部默认选项。已下载文件不受影响。是否继续？")) return;
      try { clearRoutingDraft(window.localStorage); }
      catch { setStatus("浏览器未允许清除本地保存，请检查浏览器存储权限后重试。", "err"); return; }
      preview?.destroy(); root.replaceChildren(); renderConfigView(root); window.scrollTo({ top: 0 });
    } }, ["一键 Reset · 恢复默认"])]),
    targetCard,
    dnsCard,
    el("div", { class: "card" }, [
      el("h2", {}, ["机场订阅（可多个）"]),
      airportList,
      el("div", { class: "btn-row" }, [
        el("button", { class: "btn btn-sm", onclick: () => addAirportRow() }, ["+ 添加机场"]),
      ]),
      el("div", { class: "field-hint", style: "margin-top: 12px" }, [
        "每个机场一个名字 + Mihomo 格式订阅链接；台湾家宽需含台湾节点，美国家宽需含美国节点。节点实际地区需自行核对。",
      ]),
    ]),
    indepCard,
    taiwanCard,
    splitCard,
    customCard,
    el("div", { class: "card" }, [submit, status]),
    ...(platform().kind === "web" ? [previewCard] : []),
  ]);
  root.append(view);
  let restoring = true;
  persistDraft = () => {
    if (restoring) return;
    try {
      saveRoutingDraft(window.localStorage, {
        version: 1,
        groups: customRows.filter(r => r.saved).map(r => ({ id: r.id, name: r.saved!.name, country: r.saved!.country, enabled: r.enabled.checked })),
        sites: categorySites.map(s => ({ name: s.name, domains: [...s.domains], upstream: s.upstream, category: s.category, enabled: s.enabled.checked })),
        edits: [...domainEdits], apps: appControls.map(c => [c.key, c.on.checked]),
        target: target.value as "pc" | "nikki", dnsOverride: dnsOverride.checked,
      });
      storageStatus.textContent = "已自动保存分流配置到当前浏览器，刷新后恢复。订阅、代理密码和 YAML 编辑需另行保存。";
      storageStatus.className = "status-line ok";
    } catch {
      storageStatus.textContent = "本地保存失败（可能是存储空间或权限限制）。刷新前请下载 YAML 保存配置。";
      storageStatus.className = "status-line err";
    }
  };
  view.addEventListener("change", persistDraft);
  async function restoreDraft(): Promise<void> {
    view.inert = true;
    try {
      const draft = loadRoutingDraft(window.localStorage);
      if (!draft) {
        storageStatus.textContent = "已创建的策略组、站点和域名修改会自动保存在当前浏览器。一键 Reset 会清除保存。";
        return;
      }
      storageStatus.textContent = "正在恢复本地保存的分流配置…";
      for (const [name, edit] of draft.edits) domainEdits.set(name, edit);
      for (const saved of draft.groups) addCustomGroup(saved);
      for (const category of new Set(draft.sites.map(s => s.category))) {
        const restoreSites = siteRestorers.get(category);
        if (!restoreSites) throw new Error("保存的站点分类已不存在");
        await restoreSites(draft.sites.filter(s => s.category === category));
      }
      for (const [key, checked] of draft.apps) {
        const control = appControls.find(c => c.key === key);
        if (control && canIncludeApp(key, exclusiveUnlocked)) control.on.checked = checked;
      }
      target.value = draft.target; dnsOverride.checked = draft.dnsOverride; updateTarget();
      catAllUpdaters.forEach(update => update());
      storageStatus.textContent = `已恢复本地分流配置：${draft.groups.length} 个自定义组、${draft.sites.length} 个新增站点，包含域名修改和勾选状态。`;
      storageStatus.className = "status-line ok";
    } catch {
      storageStatus.textContent = "本地配置恢复失败，原保存记录未覆盖。可使用已有 YAML 导入恢复，或一键 Reset 清除异常记录。";
      storageStatus.className = "status-line err";
      // Avoid replacing a valid saved record with a partial reconstruction.
      persistDraft = () => {};
    } finally { restoring = false; view.inert = false; }
  }
  void restoreDraft();
}

// 解析 socks 分享链接：socks://base64(user:pass)@host:port#备注 → 各字段。
function parseSocksLink(raw: string): {
  server: string;
  port: string;
  username: string;
  password: string;
} | null {
  const link = raw.trim();
  const m = link.match(/^socks5?:\/\/([^@]+)@([^#?]+)/i);
  if (!m) return null;
  let credentials: { username: string; password: string };
  try { credentials = decodeUserinfo(m[1]); } catch { return null; }
  const { username, password } = credentials;
  const hostport = m[2];
  const hi = hostport.lastIndexOf(":");
  if (hi < 0) return null;
  const server = hostport.slice(0, hi).trim().replace(/^\[|\]$/g, "");
  const port = hostport.slice(hi + 1).trim();
  if (!server || !/^\d+$/.test(port) || Number(port) < 1 || Number(port) > 65535 || !username || !password) return null;
  return { server, port, username, password };
}

// userinfo 多为 base64(可能 base64url) 的 "user:pass"；解不出就按原文当 user:pass。
function decodeUserinfo(rawUserinfo: string): { username: string; password: string } {
  let s = decodeURIComponent(rawUserinfo);
  try {
    const b = atob(s.replace(/-/g, "+").replace(/_/g, "/"));
    if (b.includes(":") && /^[\x20-\x7e]+$/.test(b)) s = b;
  } catch {
    /* 非 base64：按原文处理 */
  }
  const ci = s.indexOf(":");
  return ci >= 0
    ? { username: s.slice(0, ci), password: s.slice(ci + 1) }
    : { username: s, password: "" };
}

function textInput(placeholder: string): HTMLInputElement {
  return el("input", { type: "text", placeholder }) as HTMLInputElement;
}

function selectInput(options: [string, string][]): HTMLSelectElement {
  const sel = el("select") as HTMLSelectElement;
  for (const [value, label] of options) {
    sel.append(el("option", { value }, [label]));
  }
  return sel;
}

function field(label: string, control: HTMLElement, hint?: string): HTMLElement {
  const children: (Node | string)[] = [el("label", {}, [label]), control];
  if (hint) children.push(el("div", { class: "field-hint" }, [hint]));
  return el("div", { class: "field" }, children);
}
