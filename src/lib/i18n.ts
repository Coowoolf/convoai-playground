import zhTranslations from '@/i18n/zh.json'
import enTranslations from '@/i18n/en.json'

export type Locale = 'zh' | 'en'
export type TranslationKey = keyof typeof zhTranslations

const translations = {
    zh: zhTranslations,
    en: enTranslations,
}

export function getTranslation(locale: Locale) {
    return translations[locale]
}

export function t(locale: Locale, key: string): string {
    const keys = key.split('.')
    let result: unknown = translations[locale]

    for (const k of keys) {
        if (result && typeof result === 'object' && k in result) {
            result = (result as Record<string, unknown>)[k]
        } else {
            return key // 返回原 key 作为 fallback
        }
    }

    return typeof result === 'string' ? result : key
}
