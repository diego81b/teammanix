import { defineConfig } from '@mikro-orm/postgresql';
import { Migrator } from '@mikro-orm/migrations';

export default defineConfig({
  clientUrl: process.env.DATABASE_URL ?? 'postgres://teammanix:devpassword@localhost:5432/teammanix',
  entities: ['./dist/src/**/*.entity.js'],
  entitiesTs: ['./src/**/*.entity.ts'],
  // Under jest and ts-node sources are loaded; in production it starts from dist.
  preferTs: process.env.NODE_ENV !== 'production',
  extensions: [Migrator],
  migrations: {
    path: './dist/src/migrations',
    pathTs: './src/migrations',
    glob: '!(*.d).{js,ts}',
    transactional: true,
    emit: 'ts',
    snapshot: true,
  },
  debug: process.env.NODE_ENV !== 'production',
});
