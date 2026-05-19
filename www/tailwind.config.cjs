module.exports = {
    content: [
        './index.html',
        './src/**/*.{ts,tsx,js,jsx}'
    ],
    theme: {
        extend: {
            fontFamily: {
                sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'sans-serif'],
            },
            colors: {
                n8n: {
                    bg:       '#0f0f1a',
                    surface:  '#13131f',
                    panel:    '#1e1e30',
                    border:   '#2d2d4a',
                    muted:    '#3a3a5c',
                    subtle:   '#5555aa',
                    text:     '#9999cc',
                    bright:   '#e0e0ff',
                    accent:   '#ff6d5a',
                    pink:     '#ff4d8d',
                    green:    '#50fa7b',
                    orange:   '#ffb86c',
                    purple:   '#6e6eff',
                }
            },
            animation: {
                'spin-slow':   'spin-slow 1.4s linear infinite',
                'slide-in':    'slide-in-right 0.25s ease both',
                'fade-up':     'fade-up 0.2s ease both',
                'toast':       'toast-in 0.3s cubic-bezier(0.34,1.56,0.64,1) both',
            },
            keyframes: {
                'spin-slow': {
                    from: { transform: 'rotate(0deg)' },
                    to:   { transform: 'rotate(360deg)' },
                },
                'slide-in-right': {
                    from: { transform: 'translateX(20px)', opacity: '0' },
                    to:   { transform: 'translateX(0)',    opacity: '1' },
                },
                'fade-up': {
                    from: { transform: 'translateY(8px)', opacity: '0' },
                    to:   { transform: 'translateY(0)',   opacity: '1' },
                },
                'toast-in': {
                    from: { transform: 'translateY(16px) scale(0.95)', opacity: '0' },
                    to:   { transform: 'translateY(0)    scale(1)',    opacity: '1' },
                },
            },
        }
    },
    plugins: []
}
