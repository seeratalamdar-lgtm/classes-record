module.exports = {
  apps: [{
    name: 'classes-record',
    script: 'server/serve.js',
    cwd: '/home/ubuntu/apps/classes-record/classes-record-app',
    env: {
      DATABASE_URL: 'postgresql://classesuser:Classes2026x@localhost:5432/classesdb',
      PORT: '3000',
      EXPO_PUBLIC_DOMAIN: 'schoolcollege.online',
      NODE_ENV: 'production',
      GMAIL_USER: 'noreply.schoolcollege.online@gmail.com',
      GMAIL_PASS: 'tzpcbplxcyefworb',
      ANTHROPIC_API_KEY: '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'
    }
  }]
}
