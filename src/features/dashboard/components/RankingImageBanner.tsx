// 资产走 Vite import 进 /assets/ 哈希命名空间 —— public/dashboard/ 目录曾与
// SPA 路由 /dashboard 撞车，nginx 目录补斜杠 301 泄漏内部端口（#100 冒烟发现）。
import ambientBanner from '@/assets/modelgo-web3-ambient.png'

export function RankingImageBanner() {
  return (
    <section className="relative mb-8 overflow-hidden rounded-lg border border-mg-border bg-mg-bg-0 shadow-[0_18px_44px_rgba(15,23,42,0.10)]">
      <img
        src={ambientBanner}
        alt=""
        className="block aspect-[21/9] w-full object-cover"
        loading="lazy"
      />
      <div className="absolute inset-0 flex items-center justify-end bg-gradient-to-r from-transparent via-transparent to-black/20 p-8 sm:p-10">
        <div className="max-w-[420px] text-right">
          <p className="mb-2 text-xs font-bold uppercase tracking-[0.22em] text-white/62">ModelGo AI Gateway</p>
          <h3 className="text-2xl font-black tracking-normal text-white sm:text-4xl">One Gateway. Every Model.</h3>
        </div>
      </div>
    </section>
  )
}
