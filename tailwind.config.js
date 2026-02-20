// tailwind.config.js
module.exports = {
  content: [
    './app/views/**/*.html.erb',
    './app/helpers/**/*.rb',
    './app/assets/stylesheets/**/*.css',
    './app/javascript/**/*.js'
  ],
  theme: {
    extend: {
      colors: {
        'basketball-orange': '#FF6B35',
        'court-blue': '#1E3A5F',
        'highlight-yellow': '#F7B801',
      },
    },
  },
  plugins: [
    require('daisyui'),
  ],
  daisyui: {
    themes: [
      {
        basketball: {
          "primary": "#FF6B35",          // 농구공 오렌지
          "primary-content": "#FFFFFF",
          "secondary": "#1E3A5F",        // 딥 네이비
          "secondary-content": "#FFFFFF",
          "accent": "#10B981",           // 에메랄드 그린
          "accent-content": "#FFFFFF",
          "neutral": "#1F2937",          // 차콜 그레이
          "neutral-content": "#F3F4F6",
          "base-100": "#FFFFFF",         // 화이트 배경
          "base-200": "#F8FAFC",         // 쿨 그레이
          "base-300": "#E2E8F0",         // 보더 그레이
          "base-content": "#0F172A",     // 진한 텍스트
          "info": "#3B82F6",
          "success": "#22C55E",
          "warning": "#F59E0B",
          "error": "#EF4444",
        },
      },
    ],
  },
}
