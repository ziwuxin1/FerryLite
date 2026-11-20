import '@fontsource-variable/space-grotesk';
import './landing.css';
import logo from '../../assets/ferrylite-brand/ferrylite-logo.svg';
const repo = 'https://github.com/ziwuxin1/FerryLite';
const release = `${repo}/releases/tag/v1.5.1`;
const arrow = '<span aria-hidden="true">↗</span>';
const start = '<a class="button" href="/app">开始生成 YAML <span aria-hidden="true">→</span></a>';
export function renderLanding(root: HTMLElement): void {
  document.body.classList.add('landing-page');
  let stored: string | null = null;
  try { stored = localStorage.getItem('ferry-landing-theme'); } catch { /* Optional storage. */ }
  let theme = stored === 'light' ? 'light' : 'dark';
  document.documentElement.dataset.theme = theme;
  root.innerHTML = `
  <a class="skip-link" href="#main">跳至主要内容</a>
  <header class="site-header wrap">
    <a class="wordmark" href="/" aria-label="FerryLite 小渡首页"><img src="${logo}" width="38" height="38" alt=""><span>FerryLite <small>小渡</small></span></a>
    <nav aria-label="主导航"><a href="#features">功能</a><a href="#downloads">下载</a><a href="#changelog">更新日志</a></nav>
    <div class="header-actions"><a class="github-link" href="${repo}" target="_blank" rel="noopener noreferrer">GitHub ${arrow}</a><button class="theme-toggle" type="button" aria-label="切换主题"></button>${start}</div>
  </header>
  <main id="main">
    <section class="hero wrap" aria-labelledby="hero-title"><div class="hero-copy">
      <a class="release-link" href="#changelog">免费使用，源码开放 <span aria-hidden="true">→</span></a>
      <h1 id="hero-title">配置少一点折腾，<br><span>上网多一分从容。</span></h1>
      <p>把订阅、节点和分流整理成一份 YAML。<br>在浏览器里生成，带到电脑和路由器上用。</p>
      <div class="hero-actions">${start}<a class="text-link" href="#downloads">下载桌面版 <span aria-hidden="true">↓</span></a></div>
    </div><div class="hero-art" aria-hidden="true"><div class="logo-orbit"></div><div class="logo-orbit orbit-inner"></div><img src="${logo}" width="360" height="360" alt="" fetchpriority="high"></div></section>
    <div class="compatibility wrap"><span>为你的配置工作流而生</span><div><span>Mihomo / Clash Meta</span><span>Windows / macOS / Linux</span><span>OpenClash / Nikki</span></div></div>
    <section class="section wrap" id="features" aria-labelledby="features-title">
      <h2 id="features-title">从填写，到一份能用的配置。</h2><p class="section-intro">不必从空白文件开始，也不用放弃对每一条规则的掌控。</p>
      <div class="feature-layout"><figure class="product-preview"><div class="preview-bar"><span>FerryLite / 配置生成器</span><a href="/app">打开工具 ${arrow}</a></div><img src="/generator-preview.jpg" width="1265" height="712" alt="FerryLite 实际配置界面：选择导出版本、填写订阅并管理应用分流" loading="lazy"><figcaption>真实工具界面。生成与导入编辑，都在同一个地方。</figcaption></figure>
      <div class="feature-list"><article><h3>订阅和节点，一起整理</h3><p>添加多个机场订阅，按需接入独立家宽代理，为不同服务选择出口。</p></article><article><h3>分流规则，自己做主</h3><p>按应用选择分流，自建策略组，补全或编辑站点域名。</p></article><article><h3>先预览，再导出</h3><p>生成后检查 YAML 源码，也可以导入已有文件，继续编辑和校验。</p></article></div></div>
      <div class="privacy-strip"><div><h3>你的配置，留在你的设备上。</h3><p>订阅地址和代理凭据在本地处理，不上传到 FerryLite 服务器。</p></div><a href="#privacy">了解数据处理 <span aria-hidden="true">→</span></a></div>
    </section>
    <section class="download-section" id="downloads" aria-labelledby="download-title"><div class="wrap section"><h2 id="download-title">打开就能用。也可以带走。</h2><p class="section-intro">在线生成，或下载 Windows 免安装版，选择适合你的方式。</p>
      <div class="download-grid"><article class="download-card"><div class="download-meta"><span>网页版</span><span>无需安装</span></div><h3>在浏览器里开始</h3><p>电脑或手机浏览器均可访问。生成电脑配置，或为 OpenClash、Nikki 导出路由器配置。</p>${start}<small>支持生成、导入与编辑 YAML</small></article>
      <article class="download-card"><div class="download-meta"><span>Windows</span><span>v1.5.1</span></div><h3>小巧的桌面工具</h3><p>Windows 10 / 11，x64 免安装版。下载后直接运行，需要 Microsoft Edge WebView2 Runtime。</p><a class="button button-secondary" href="${repo}/releases/download/v1.5.1/FerryLite-1.5.1-windows-x64.exe">下载 Windows 版 <span aria-hidden="true">↓</span></a><small>EXE · 3.57 MB <a href="${release}" target="_blank" rel="noopener noreferrer">版本详情 ${arrow}</a></small></article></div>
      <p class="download-note">macOS 和 Linux 可直接使用网页版。FerryLite 生成配置文件，实际连接由你的 Mihomo / Clash Meta 客户端负责。</p>
    </div></section>
    <section class="section wrap changelog" id="changelog" aria-labelledby="changelog-title"><div class="changelog-heading"><h2 id="changelog-title">每一步，都记在这里。</h2><p class="section-intro">更新日志</p><a class="text-link" href="${repo}/releases" target="_blank" rel="noopener noreferrer">GitHub Releases ${arrow}</a></div><div class="releases">
      <article class="release"><div class="release-meta"><time datetime="2026-11-20">2026.11.20</time><span class="release-tag">网页 · Windows v1.5.1</span></div><h3>机场换入口，不再全部超时</h3><ul><li>机场节点列表每 10 分钟自动刷新，入口更换后无需手动处理。</li><li>直连拉不到订阅时，自动改走仍可用的机场节点更新。</li><li>局域网地址始终直连，TUN 模式下访问路由器、NAS 不再绕行机场。</li></ul><p class="release-note">已导出的旧配置不会自动更新，需要重新生成并导入客户端。</p><a class="text-link" href="${release}" target="_blank" rel="noopener noreferrer">查看完整更新 ${arrow}</a></article>
      <article class="release"><div class="release-meta"><time datetime="2026-10-31">2026.10.31</time><span class="release-tag">网页更新</span></div><h3>新首页，更清晰的开始</h3><ul><li>新增产品首页、下载入口与更新日志，点击按钮即可进入 YAML 工具。</li><li>网页新生成的配置默认开启 HTTP、TLS、QUIC 域名嗅探，尝试识别纯 IP 连接。</li><li>保留配置生成、导入编辑和本地分流草稿。</li></ul><p class="release-note">已导出的旧配置不会自动更新，需要重新生成并导入客户端。</p></article>
      <article class="release"><div class="release-meta"><time datetime="2026-10-30">2026.10.30</time><span class="release-tag">Windows v1.5.0</span></div><h3>生成与编辑，桌面网页同步</h3><ul><li>桌面版同步网页界面、YAML 编辑器与生成核心。</li><li>支持源码预览、语法校验、字段补全和策略组编辑。</li><li>提供 Windows x64 免安装程序。</li></ul><a class="text-link" href="${repo}/releases/tag/v1.5.0" target="_blank" rel="noopener noreferrer">查看完整更新 ${arrow}</a></article>
    </div></section>
    <section class="section wrap faq" aria-labelledby="faq-title"><h2 id="faq-title">常见问题，先看这里。</h2><div class="questions">
      <details><summary>FerryLite 是代理客户端吗？</summary><p>FerryLite 是 YAML 配置生成和编辑工具，不提供节点、订阅或网络连接服务。导出后，请将配置导入支持 Mihomo / Clash Meta 的客户端或路由器插件。</p></details>
      <details><summary>已有 YAML，可以直接修改吗？</summary><p>可以。进入工具后，点击「导入 / 编辑 YAML」，选择本地文件，即可编辑源码、策略组和站点域名，检查后再导出。</p></details>
      <details id="privacy"><summary>订阅地址和密码会保存到哪里？</summary><p>生成与编辑在本地完成，订阅地址和代理凭据不上传到 FerryLite 服务器。分流草稿保存在当前浏览器，不包含订阅地址和代理密码；导出的 YAML 会包含凭据，请妥善保管。加载站点 Logo 时，图标服务会收到对应站点的域名。</p></details>
      <details><summary>电脑版与路由器版有什么区别？</summary><p>工具会为不同设备生成对应的 TUN、DNS 和监听设置。选择与你实际使用环境一致的导出版本，导入后检查客户端或路由器插件的覆写设置。</p></details>
    </div></section>
    <section class="closing wrap"><div><h2>下一份配置，从这里开始。</h2><p>让小渡帮你整理好。</p></div>${start}</section>
  </main>
  <footer class="site-footer wrap"><div><a class="wordmark" href="/"><img src="${logo}" width="30" height="30" alt=""><span>FerryLite <small>小渡</small></span></a><p>免费开源的 YAML 配置工具</p></div><div class="footer-links"><a href="${repo}" target="_blank" rel="noopener noreferrer">源码</a><a href="${repo}/issues" target="_blank" rel="noopener noreferrer">问题反馈</a><a href="${repo}/blob/main/LICENSE" target="_blank" rel="noopener noreferrer">MIT License</a><span>© 2026 FerryLite</span></div></footer>`;
  const toggle = root.querySelector<HTMLButtonElement>('.theme-toggle')!;
  function applyTheme(): void {
    document.documentElement.dataset.theme = theme;
    toggle.textContent = theme === 'dark' ? '浅色' : '深色';
    toggle.setAttribute('aria-label', `切换为${theme === 'dark' ? '浅色' : '深色'}模式`);
  }
  applyTheme();
  toggle.onclick = () => {
    theme = theme === 'dark' ? 'light' : 'dark'; applyTheme();
    try { localStorage.setItem('ferry-landing-theme', theme); } catch { /* Optional storage. */ }
  };
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const expanders = new Map<HTMLDetailsElement, (open: boolean, animate?: boolean) => void>();
  root.querySelectorAll<HTMLDetailsElement>('.questions details').forEach(details => {
    const summary = details.querySelector('summary')!;
    const symbol = document.createElement('span');
    symbol.className = 'faq-symbol';
    symbol.setAttribute('aria-hidden', 'true');
    summary.append(symbol);
    let expanded = details.open;
    let animation: Animation | null = null;
    const settle = (): void => {
      details.open = expanded;
      animation?.cancel();
      animation = null;
      details.style.overflow = '';
    };
    const setExpanded = (open: boolean, animate = true): void => {
      const start = details.getBoundingClientRect().height;
      animation?.cancel();
      animation = null;
      expanded = open;
      details.dataset.expanded = String(expanded);
      summary.setAttribute('aria-expanded', String(expanded));
      details.open = expanded;
      const end = details.getBoundingClientRect().height;
      if (!animate || reducedMotion.matches || start === end) { settle(); return; }
      // Keep content rendered through closing; native details state settles afterward.
      details.open = true;
      details.style.overflow = 'hidden';
      animation = details.animate([{ height: `${start}px` }, { height: `${end}px` }], {
        duration: 280, easing: 'cubic-bezier(0.22, 1, 0.36, 1)', fill: 'both',
      });
      animation.onfinish = settle;
    };
    details.dataset.expanded = String(expanded);
    summary.setAttribute('aria-expanded', String(expanded));
    summary.addEventListener('click', event => {
      event.preventDefault();
      setExpanded(!expanded);
    });
    reducedMotion.addEventListener('change', () => { if (reducedMotion.matches) settle(); });
    expanders.set(details, setExpanded);
  });
  function revealHash(): void {
    if (!location.hash) return;
    const target = document.getElementById(location.hash.slice(1));
    if (target instanceof HTMLDetailsElement) expanders.get(target)?.(true, false);
    target?.scrollIntoView();
  }
  window.addEventListener('hashchange', revealHash);
  requestAnimationFrame(revealHash);
}
