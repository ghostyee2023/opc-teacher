// 通用工具:ID 生成、时间格式化、讲义 HTML 渲染

export function newId() {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

/** 生成 6 位课堂码,排除易混淆字符 */
export function generateClassroomCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i += 1) code += alphabet[Math.floor(Math.random() * alphabet.length)];
  return code;
}

export function formatTime(totalSeconds: number) {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(safe / 60).toString().padStart(2, "0");
  const seconds = (safe % 60).toString().padStart(2, "0");
  return `${minutes}:${seconds}`;
}

/** 复制文本:clipboard API 失败时降级 execCommand;返回是否成功 */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const helper = document.createElement("textarea");
      helper.value = text;
      helper.style.position = "fixed";
      helper.style.opacity = "0";
      document.body.appendChild(helper);
      helper.select();
      const ok = document.execCommand("copy");
      helper.remove();
      return ok;
    } catch {
      return false;
    }
  }
}

export function relativeTime(at: number) {
  const delta = Math.floor((Date.now() - at) / 1000);
  if (delta < 50) return "刚刚";
  if (delta < 3600) return `${Math.floor(delta / 60)} 分钟前`;
  return new Date(at).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
}

export type SlideContent = { title: string; description: string; task: string; prompt: string };

/** 生成原型讲义 iframe 内容(未嵌入外部 PPT HTML 时使用) */
export function getSlideHtml(content: SlideContent, chapter: number, slide: number) {
  const slides = [
    `<div class="slide-eyebrow">${content.title} · 第 ${chapter} 章</div><h1>${content.title}</h1><p>${content.description}</p><div class="slide-meta"><span>讲义导入预览</span><span>HTML course package</span></div>`,
    `<div class="slide-eyebrow">课堂练习</div><h2>${content.task}</h2><div class="slide-grid"><div><b>目标</b><p>把需求说清楚,让输出可以被执行和复核。</p></div><div><b>小组协作</b><p>先讨论,再由组长代表提交最终版本。</p></div></div><div class="slide-callout">完成后请回到课堂点击"我完成了"</div>`,
    `<div class="slide-eyebrow">可复制提示词</div><h2>从角色、目标到输出标准</h2><div class="slide-prompt">${content.prompt}</div><div class="slide-footer">复制后替换其中的业务场景,开始你们的改写。</div>`,
  ];
  return `<!doctype html><html lang="zh-CN"><head><meta charset="UTF-8" /><style>*{box-sizing:border-box}html,body{height:100%}body{margin:0;font-family:-apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif;background:#f7fbfa;color:#17312e}.slide{height:100%;min-height:236px;padding:44px 56px;display:flex;flex-direction:column;justify-content:center;background:radial-gradient(circle at 90% 5%,rgba(40,174,155,.14),transparent 36%),linear-gradient(135deg,#fbfefd 0%,#edf8f5 100%)}.slide-eyebrow{font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:#087f73;font-weight:700;margin-bottom:18px}.slide h1{font-size:46px;line-height:1.05;letter-spacing:-.06em;margin:0 0 17px;max-width:680px}.slide h2{font-size:32px;line-height:1.2;letter-spacing:-.045em;margin:0 0 26px;max-width:650px}.slide p{font-size:16px;line-height:1.7;color:#66807b;max-width:650px;margin:0}.slide-meta,.slide-footer{display:flex;justify-content:space-between;gap:10px;margin-top:auto;padding-top:27px;border-top:1px solid rgba(8,127,115,.16);font-size:11px;color:#79928d}.slide-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px}.slide-grid>div{padding:16px;border:1px solid rgba(8,127,115,.16);border-radius:12px;background:rgba(255,255,255,.6)}.slide-grid b{display:block;font-size:13px;color:#087f73;margin-bottom:8px}.slide-grid p{font-size:13px;line-height:1.5}.slide-callout{margin-top:20px;padding:12px 14px;border-radius:9px;background:#dff1ed;color:#075f57;font-size:13px;font-weight:650}.slide-prompt{padding:19px;border:1px solid rgba(8,127,115,.18);border-radius:12px;background:rgba(255,255,255,.72);font-size:17px;line-height:1.7}.slide-footer{justify-content:flex-start}</style></head><body><main class="slide">${slides[slide]}</main></body></html>`;
}
