import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  // Only migration commands read it; the application builds its own connection.
  datasource: { url: process.env['DATABASE_URL'] ?? 'postgresql://unused@localhost/unused' },
});
