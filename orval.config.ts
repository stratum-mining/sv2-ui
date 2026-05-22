import { defineConfig } from 'orval';

export default defineConfig({
  api: {
    input: 'shared/openapi.json',
    output: {
      target: 'src/types/api-generated.ts',
      client: 'react-query',
    },
  },
});
