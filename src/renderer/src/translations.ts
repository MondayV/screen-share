import { loadLocale } from '../../i18n/i18n-util.sync'
import { i18nObject } from '../../i18n/i18n-util'
import type { Locales } from '../../i18n/i18n-types'
import { setSignalServer } from './Utils'

const settings = await window.PcConnectApi.getSettings()

const locale = (settings?.language as Locales) || 'zh'

loadLocale(locale)
export const L = i18nObject(locale)

// Auto-configure signaling server from settings
if ((settings as any)?.serverUrl) {
  setSignalServer((settings as any).serverUrl)
}
