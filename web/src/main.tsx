/**
 * Web 入口：挂载 React 应用，并引入 React Flow 样式与画布样式
 * （esbuild 会把 import 的 CSS 打包成 dist/web/canvas.css）。
 *
 * 凭证处理：fragment 里的 secret 写入 sessionStorage 后立即从地址栏移除；
 * 刷新文档时从 sessionStorage 取回。API 请求一律用 Bearer 发送，不依赖 cookie
 * （画布被 DSH 主面板以 iframe 承载时，第三方上下文可能丢弃 SameSite cookie）。
 */
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@xyflow/react/dist/style.css'
import './tokens.css'
import './styles.css'
import App from './App'
import { setCanvasSecret } from './auth'

const SECRET_KEY = 'dsh-canvas-secret'

function readSecret(): string {
  const fromHash = location.hash.slice(1)
  if (fromHash) {
    try {
      sessionStorage.setItem(SECRET_KEY, fromHash)
    } catch {
      /* 第三方存储被禁用时退化为仅本次加载可用 */
    }
    return fromHash
  }
  try {
    return sessionStorage.getItem(SECRET_KEY) ?? ''
  } catch {
    return ''
  }
}

async function start(): Promise<void> {
  const rootEl = document.getElementById('root')
  if (!rootEl) return
  const ws = new URLSearchParams(location.search).get('ws')
  const secret = readSecret()
  setCanvasSecret(secret)
  if (secret) {
    try {
      const res = await fetch(`${location.pathname}api/auth`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'X-DSH-Canvas': '1' },
        body: JSON.stringify({ ws, secret }),
      })
      // cookie 只是同源直开时的兼容路径；失败不阻塞，后续请求用 Bearer。
      if (!res.ok) console.warn(`dsh-canvas: cookie 授权失败（${res.status}），改用 Bearer 认证`)
    } catch (error) {
      console.warn('dsh-canvas: cookie 授权请求失败，改用 Bearer 认证', error)
    }
    // 移除地址栏里的凭证；sessionStorage 已保存，刷新可继续使用。
    history.replaceState(null, '', location.pathname + location.search)
  }
  createRoot(rootEl).render(<StrictMode><App /></StrictMode>)
}
void start().catch(() => {
  const rootEl = document.getElementById('root')
  if (rootEl) rootEl.textContent = '画布授权失败，请重新打开画布。'
})
