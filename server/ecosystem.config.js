module.exports = {
  apps: [{
    name: 'classes-record',
    script: 'serve.js',
    env: {
      DATABASE_URL: 'postgresql://classesuser:Classes2026x@localhost:5432/classesdb'
    }
  }]
};
