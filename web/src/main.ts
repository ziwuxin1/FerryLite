// Homepage and tool load independently; landing visits do not initialize WASM.
import './page-transition.css';
import { enterTool, installToolTransition } from './page-transition';

const root = document.querySelector<HTMLDivElement>('#app');
if (!root) throw new Error('#app 未找到');
try { document.documentElement.dataset.theme = localStorage.getItem('ferry-landing-theme') === 'light' ? 'light' : 'dark'; }
catch { document.documentElement.dataset.theme = 'dark'; }
async function boot(): Promise<void> {
  if (/^\/app\/?$/.test(location.pathname)) {
    document.title = 'YAML 配置工具 · FerryLite 小渡';
    document.querySelector('link[rel="canonical"]')?.setAttribute('href', 'https://ferrylite.cc/app');
    const loading = document.createElement('div');
    loading.className = 'page-loader';
    loading.setAttribute('role', 'status');
    loading.textContent = '正在打开 YAML 配置工具…';
    root!.replaceChildren(loading);
    await import('./tool');
    enterTool(root!);
  } else {
    const { renderLanding } = await import('./landing');
    renderLanding(root!);
    installToolTransition(root!);
  }
  document.documentElement.dataset.pageReady = 'true';
}
void boot().catch(() => {
  root!.replaceChildren();
  const p = document.createElement('p');
  p.textContent = '页面加载失败，请检查网络后重试。';
  const retry = document.createElement('button');
  retry.textContent = '重新加载';
  retry.onclick = () => location.reload();
  root!.append(p, retry);
});
