// PRODUCTION CONFIG — always uses server/serve.js + PostgreSQL
// DO NOT change script to server.js (that is Oracle/legacy)
module.exports = {
  apps: [{
    name: "classes-record",
    script: "./server/serve.js",
    instances: 4,
    exec_mode: "cluster",
    env: {
      PORT: "3000",
      HOST: "127.0.0.1",
      NODE_ENV: "production",
      DATABASE_URL: "postgresql://classesuser:Classes2026x@localhost:5432/classesdb",
      EXPO_PUBLIC_DOMAIN: "schoolcollege.online"
    }
  }]
}
