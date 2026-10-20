export default {
  extends: '../shared/base.config.ts',
  output: '../app/out/override.generated.json',
  openapi: {
    info: { title: 'Override API', version: '3.0.0' },
  },
};
