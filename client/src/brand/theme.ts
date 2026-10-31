import type { ThemeConfig } from 'antd'

/**
 * Brightloop brand tokens. Change colours here, not in pages.
 *
 * pine      deep panels (sidebar, login)
 * green     primary actions, links, active states
 * marigold  anything due / renewing / needs attention soon
 * sage      app background
 * slate     body text
 */
export const brand = {
  pine: '#16352C',
  pineSoft: '#1E463A',
  green: '#1F6B52',
  mint: '#9FD8BF',
  marigold: '#E9A23B',
  sage: '#F2F5F3',
  slate: '#1D2A25',
  line: '#DCE4E0',
  fontDisplay: "'Bricolage Grotesque Variable', 'Segoe UI', sans-serif",
  fontBody: "'Onest Variable', 'Segoe UI', system-ui, sans-serif",
}

export const antdTheme: ThemeConfig = {
  token: {
    colorPrimary: brand.green,
    colorLink: brand.green,
    colorInfo: brand.green,
    // Warning text (tags, alerts) must stay readable on light backgrounds, so it's a deeper amber.
    // Marigold itself is still used for rings, bars and borders via brand.marigold.
    colorWarning: '#9A6408',
    colorError: '#C2261B', // readable red for danger buttons and error text
    colorText: brand.slate,
    // Secondary and placeholder greys darkened to pass WCAG AA (4.5:1) on white.
    colorTextSecondary: '#56655E',
    colorTextDescription: '#56655E',
    colorTextTertiary: '#63726B',
    colorTextPlaceholder: '#66756E',
    colorBgLayout: brand.sage,
    colorBorderSecondary: brand.line,
    fontFamily: brand.fontBody,
    borderRadius: 6,
    borderRadiusLG: 10,
  },
  components: {
    Layout: { siderBg: brand.pine, headerBg: '#FFFFFF', bodyBg: brand.sage, triggerBg: brand.pineSoft },
    Menu: {
      darkItemBg: brand.pine,
      darkSubMenuItemBg: brand.pine,
      darkItemColor: 'rgba(255,255,255,0.72)',
      darkItemHoverColor: '#FFFFFF',
      darkItemSelectedBg: brand.pineSoft,
      darkItemSelectedColor: '#FFFFFF',
      darkGroupTitleColor: 'rgba(159,216,191,0.75)',
      itemBorderRadius: 6,
    },
    Table: { headerBg: '#F7F9F8', headerColor: '#4A5A53', rowHoverBg: '#F4F8F6' },
    Card: { borderRadiusLG: 10 },
    Typography: { titleMarginBottom: 0 },
  },
}
