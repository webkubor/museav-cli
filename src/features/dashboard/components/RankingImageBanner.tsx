export function RankingImageBanner() {
  return (
    <section className="relative mb-8 overflow-hidden rounded-[22px] border border-mg-border bg-mg-surface shadow-[0_18px_44px_rgba(15,23,42,0.10)]">
      <img
        src="/dashboard/modelgo-web3-ambient.png"
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
