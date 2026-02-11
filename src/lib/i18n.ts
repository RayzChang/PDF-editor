import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import zhTW from '../locales/zh-TW.json';
import zhCN from '../locales/zh-CN.json';
import en from '../locales/en.json';
import vi from '../locales/vi.json';

const resources = {
  'zh-TW': { translation: zhTW },
  'zh-CN': { translation: zhCN },
  en: { translation: en },
  vi: { translation: vi },
};

i18n
  .use(initReactI18next)
  .init({
    resources,
    lng: 'zh-TW',
    fallbackLng: 'en',
    interpolation: {
      escapeValue: false,
    },
  });

export default i18n;
