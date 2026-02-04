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
        'court-blue': '#004E89',
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
          "primary": "#FF6B35",      // 농구공 오렌지
          "secondary": "#004E89",    // 코트 블루
          "accent": "#F7B801",       // 하이라이트 옐로우
          "neutral": "#2C2C2C",      // 다크 그레이
          "base-100": "#FFFFFF",     // 화이트 배경
          "info": "#3ABFF8",
          "success": "#36D399",
          "warning": "#FBBD23",
          "error": "#F87272",
        },
      },
    ],
  },
}
