import { create } from 'zustand'
import {
  getMarket,
  getInitialLang,
  getMarketDefaultLang,
  type Market,
  type Lang,
} from '@/lib/market'

interface LangState {
  lang: Lang
  market: Market
  setLang: (lang: Lang) => void
  setMarket: (market: Market) => void
}

const initialMarket = getMarket()
const initialLang = getInitialLang()

export const useLangStore = create<LangState>()((set) => ({
  lang: initialLang,
  market: initialMarket,
  setLang: (lang) => {
    localStorage.setItem('mg-lang', lang)
    set({ lang })
  },
  setMarket: (market) => {
    const lang = getMarketDefaultLang(market)
    set({ market, lang })
  },
}))
