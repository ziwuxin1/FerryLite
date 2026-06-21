// 模块1 UI：配置生成表单。见设计 §5.1 / §6.1。支持可选添加多个机场（名字 + 订阅地址）。
import { api } from "../api";
import type { GenerateInput, Protocol } from "../api";
import { el } from "../dom";
import { save } from "@tauri-apps/plugin-dialog";

interface AirportRow {
  wrapper: HTMLElement;
  name: HTMLInputElement;
  url: HTMLInputElement;
}

export function renderConfigView(root: HTMLElement, onDone: () => void): void {
  const status = el("div", { class: "status-line" });

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
  const exitIp = textInput("留空=用 server；住宅代理网关≠出口时填真实出口IP");
  const importLink = textInput("socks://...  粘贴分享链接，点右边自动填充");
  const port = textInput("443");
  port.type = "number";
  port.value = "443";
  const username = textInput("NovProxy 用户名");
  const password = textInput("NovProxy 密码");
  password.type = "password";
  const tls = el("input", { type: "checkbox" }) as HTMLInputElement;

  // 独立 IP 启用开关：关掉则不填、不生成独立IP节点，Claude 直接走机场美国节点。
  const enableIndep = el("input", { type: "checkbox" }) as HTMLInputElement;
  enableIndep.checked = true;
  const indepBody = el("div", {}, [
    el("div", { class: "field" }, [
      el("label", {}, ["从分享链接导入（socks://，自动填充）"]),
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
    field(
      "实际出口IP（基准·可选）",
      exitIp,
      "住宅代理常「入口网关域名 ≠ 真实出口IP」。先点一次体检看回显IP，若是干净的美国住宅IP，把它填到这里再重新生成，第2步即可通过；留空则用上面的 server 当基准。",
    ),
    el("div", { class: "row-2" }, [field("用户名", username), field("密码", password)]),
    el("label", { class: "checkbox-row" }, [
      tls,
      el("span", {}, ["对端是 HTTPS 代理（仅协议选 http 时可能需要勾选）"]),
    ]),
  ]);
  enableIndep.onchange = (): void => {
    indepBody.style.display = enableIndep.checked ? "" : "none";
  };

  // 傻瓜式分流（APP 级 · 折叠分类）：左勾=走代理；右「中转」开=独立IP(含中转)、关=机场；不勾=直连。
  const APP_CATALOG: { cat: string; apps: { key: string; label: string; on: boolean; relay: boolean }[] }[] = [
    {
      cat: "AI 服务",
      apps: [
        { key: "chatgpt", label: "ChatGPT", on: true, relay: true },
        { key: "gemini", label: "Gemini", on: true, relay: true },
        { key: "perplexity", label: "Perplexity", on: true, relay: true },
        { key: "metaai", label: "Meta AI", on: true, relay: true },
        { key: "copilot", label: "Copilot", on: true, relay: true },
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
      cat: "国外流媒体（默认走香港节点 · 中转开则走独立IP）",
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
      cat: "美股券商",
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
      cat: "加密货币 · 美国合规（走美国独立IP）",
      apps: [
        { key: "coinbase", label: "Coinbase", on: true, relay: true },
        { key: "kraken", label: "Kraken", on: true, relay: true },
        { key: "geminiex", label: "Gemini 交易所", on: true, relay: true },
        { key: "cryptocom", label: "Crypto.com", on: true, relay: true },
      ],
    },
    {
      cat: "加密货币 · 海外所（走台湾 · 美国IP用不了）",
      apps: [
        { key: "binance", label: "Binance 币安", on: true, relay: false },
        { key: "okx", label: "OKX 欧易", on: true, relay: false },
        { key: "bybit", label: "Bybit", on: true, relay: false },
        { key: "kucoin", label: "KuCoin", on: true, relay: false },
        { key: "gate", label: "Gate.io", on: true, relay: false },
        { key: "bitget", label: "Bitget", on: true, relay: false },
      ],
    },
    { cat: "Perforce（不走中转 · 走机场）", apps: [{ key: "perforce", label: "Perforce 服务器", on: true, relay: false }] },
    { cat: "Parsec（远程桌面 / 串流 · 走独立IP）", apps: [{ key: "parsec", label: "Parsec 远程桌面", on: true, relay: true }] },
    {
      cat: "社交（默认中转关 · 内容向）",
      apps: [
        { key: "tiktok", label: "TikTok（需美国中转·区域检测严）", on: true, relay: true },
        { key: "telegram", label: "Telegram", on: true, relay: false },
        { key: "twitter", label: "Twitter(X)", on: true, relay: false },
        { key: "whatsapp", label: "WhatsApp", on: true, relay: false },
        { key: "facebook", label: "Facebook", on: true, relay: false },
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
      cat: "专业 / 设计（默认中转关 · 图多省流量）",
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
      ],
    },
    {
      cat: "美国银行（建议保持中转开）",
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
      cat: "贷款 / 房贷（建议保持中转开）",
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
      cat: "美国保险 · 车险 / 房屋险（建议保持中转开）",
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
      cat: "美国购物（默认走机场 · 仅 Amazon 中转）",
      apps: [
        { key: "amazon", label: "Amazon（中转开 · 账号支付）", on: true, relay: true },
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
      cat: "政府 / 生活",
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
      cat: "游戏（默认中转关 · 走机场低延迟）",
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
  const appControls: { key: string; name: string; on: HTMLInputElement; relay: HTMLInputElement }[] = [];
  // 各分类「全选」框的刷新器：全局全选/反选后调用，让分类框跟随。
  const catAllUpdaters: (() => void)[] = [];
  const splitSections = APP_CATALOG.map((c) => {
    const inner = el("div", { class: "acc-inner" });
    const catOns: HTMLInputElement[] = [];
    for (const a of c.apps) {
      const on = el("input", { type: "checkbox" }) as HTMLInputElement;
      on.checked = a.on;
      const relay = el("input", { type: "checkbox" }) as HTMLInputElement;
      relay.checked = a.relay;
      // 策略组名 = 标签去掉「（…）」注解（如 "Google（搜索…）" → "Google"）。
      appControls.push({ key: a.key, name: a.label.split("（")[0].trim(), on, relay });
      catOns.push(on);
      inner.append(
        el(
          "div",
          { style: "display:flex;justify-content:space-between;align-items:center;padding:5px 0 5px 14px" },
          [
            el("label", { class: "checkbox-row" }, [on, el("span", {}, [a.label])]),
            el("label", { class: "checkbox-row", style: "opacity:.85" }, [
              el("span", { class: "field-hint", style: "margin:0 6px 0 0" }, ["中转"]),
              relay,
            ]),
          ],
        ),
      );
    }
    // 分类「全选」框：勾/取消本分类所有 APP 的「走代理」；半选=部分勾。点它不触发折叠。
    const catAll = el("input", { type: "checkbox", title: "全选 / 取消本分类" }) as HTMLInputElement;
    const updateCatAll = (): void => {
      const n = catOns.filter((o) => o.checked).length;
      catAll.checked = n === catOns.length;
      catAll.indeterminate = n > 0 && n < catOns.length;
    };
    catAll.onclick = (e: MouseEvent): void => {
      e.stopPropagation();
      for (const o of catOns) o.checked = catAll.checked;
    };
    for (const o of catOns) o.addEventListener("change", updateCatAll);
    updateCatAll();
    catAllUpdaters.push(updateCatAll);
    const arrow = el("span", { class: "acc-arrow" }, ["▸"]);
    const body = el("div", { class: "acc-body" }, [inner]); // 下拉动画容器（grid-rows 0fr↔1fr）
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
      [catAll, arrow, c.cat],
    );
    return el("div", {}, [header, body]);
  });
  const selectAll = el(
    "button",
    {
      class: "btn btn-sm",
      onclick: (): void => {
        for (const c of appControls) {
          c.on.checked = true;
          c.relay.checked = true;
        }
        catAllUpdaters.forEach((f) => f());
      },
    },
    ["一键全选（APP + 中转）"],
  );
  const invertAll = el(
    "button",
    {
      class: "btn btn-sm",
      onclick: (): void => {
        for (const c of appControls) {
          c.on.checked = !c.on.checked;
          c.relay.checked = !c.relay.checked;
        }
        catAllUpdaters.forEach((f) => f());
      },
    },
    ["一键反选（APP + 中转）"],
  );
  const splitCard = el("div", { class: "card" }, [
    el("h2", {}, ["分流选择（每个 APP 一个独立策略组 · 生成后在 zashboard 里逐个切换出口）"]),
    el("div", { class: "field-hint" }, [
      "左勾 = 该 APP 生成独立策略组（可在 zashboard 切 美国独立IP / 香港 / 台湾 / 各国）；右「中转」开 = 默认走美国独立IP，关 = 默认机场美国（流媒体香港·离岸加密台湾）；不勾 = 不单列、走兜底。",
    ]),
    el("div", { class: "btn-row", style: "margin: 14px 0 12px" }, [selectAll, invertAll]),
    ...splitSections,
  ]);

  const submit = el("button", { class: "btn primary block", onclick: onSubmit }, [
    "生成配置并另存为 .yaml",
  ]) as HTMLButtonElement;

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

  async function onSubmit(): Promise<void> {
    submit.disabled = true;
    setStatus("正在生成与校验…");
    const parsedPort = parseInt(port.value, 10);
    const airports = airportRows
      .map((r) => ({ name: r.name.value.trim(), url: r.url.value.trim() }))
      .filter((a) => a.name !== "" || a.url !== "");
    const payload: GenerateInput = {
      airports,
      independentNodes: enableIndep.checked
        ? [
            {
              name: nodeName.value.trim() || "美国独立IP",
              protocol: protocol.value as Protocol,
              server: server.value.trim(),
              port: Number.isFinite(parsedPort) ? parsedPort : 0,
              username: username.value,
              password: password.value,
              tls: tls.checked,
              exitIp: exitIp.value.trim(),
              dialerProxy: "美国-中转",
            },
          ]
        : [],
      splitApps: appControls
        .filter((c) => c.on.checked)
        .map((c) => ({ key: c.key, relay: c.relay.checked, name: c.name })),
    };
    try {
      const result = await api.generateConfig(payload);
      setStatus("✅ 校验通过，请选择保存位置…", "ok");
      const path = await save({
        title: "保存成品 Clash 配置",
        defaultPath: result.suggestedFileName,
        filters: [{ name: "Clash 配置", extensions: ["yaml", "yml"] }],
      });
      if (!path) {
        setStatus("已取消保存（配置未写入）。", "warn");
        return;
      }
      const cfg = await api.saveGenerated({
        path,
        yaml: result.yaml,
        exitBasisIp: result.exitBasisIp,
        proxyEndpoint: result.proxyEndpoint,
        clashApiUrl: result.clashApiUrl,
        clashSecret: result.clashSecret,
        lastUpdated: new Date().toISOString(),
      });
      setStatus(
        `✅ 已保存到：${cfg.generatedYamlPath}\n请把它拖进 ClashMi，再回主页点「一键代理」。`,
        "ok",
      );
      window.setTimeout(onDone, 1600);
    } catch (e) {
      setStatus(`❌ ${String(e)}`, "err");
    } finally {
      submit.disabled = false;
    }
  }

  const view = el("div", {}, [
    el("div", { class: "topbar" }, [
      el("div", {}, [
        el("h1", {}, ["配置生成"]),
        el("div", { class: "sub" }, ["首次使用 / 换 IP 时填写；生成成品 yaml 后拖进 ClashMi。"]),
      ]),
      el("button", { class: "btn", onclick: onDone }, ["← 返回状态盘"]),
    ]),
    el("div", { class: "card" }, [
      el("h2", {}, ["机场订阅（可多个）"]),
      airportList,
      el("div", { class: "btn-row" }, [
        el("button", { class: "btn btn-sm", onclick: () => addAirportRow() }, ["+ 添加机场"]),
      ]),
      el("div", { class: "field-hint", style: "margin-top: 12px" }, [
        "每个机场一个名字 + 订阅链接；至少一个机场，且需含美国节点（独立 IP 的链式中转要靠它）。",
      ]),
    ]),
    el("div", { class: "card" }, [
      el("label", { class: "checkbox-row" }, [
        enableIndep,
        el("span", {}, ["启用独立 IP（美国静态家宽 · 账密代理）"]),
      ]),
      el("div", { class: "field-hint" }, [
        "没有独立 IP 就关掉它 —— Claude 等将直接走机场美国节点（不做独立IP出口校验）。",
      ]),
      indepBody,
    ]),
    splitCard,
    el("div", { class: "card" }, [submit, status]),
  ]);
  root.append(view);
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
  const { username, password } = decodeUserinfo(m[1]);
  const hostport = m[2];
  const hi = hostport.lastIndexOf(":");
  if (hi < 0) return null;
  const server = hostport.slice(0, hi).trim();
  const port = hostport.slice(hi + 1).trim();
  if (!server || !port) return null;
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
