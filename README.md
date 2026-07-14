# Adzone POS

Adzone is now structured as a real full-stack Node.js application:

- Next.js frontend (App Router)
- Express API server
- Prisma ORM with PostgreSQL
- JWT authentication
- Environment-driven admin bootstrap
- Transaction-safe sales and inventory updates

## Admin Login

The backend creates or refreshes the configured admin user from `.env` on startup.

- Email: `aathilducky@gmail.com`
- Password: `cyber123/A`

## Local Development

1. Install dependencies:
   `npm install`
2. Start and prepare local PostgreSQL:
   `npm run db:start`
3. Generate the Prisma client:
   `npm run db:generate`
4. Apply the database schema:
   `npm run db:push`
5. Seed starter data:
   `npm run db:seed`
6. Start the app:
   `npm run dev`

Shortcut:

`npm run db:setup`

Notes:

- `npm run db:start` uses the local PostgreSQL service, not Docker.
- It may prompt for your `sudo` password the first time so it can start PostgreSQL and create the local `adzone` database.

The application runs on `http://localhost:3000`.

## Environment Variables

See `.env.example` for the supported variables.

Important values:

- `DATABASE_URL`
- `JWT_SECRET`
- `ADMIN_USER_NAME`
- `ADMIN_USER_EMAIL`
- `ADMIN_USER_PASSWORD`
- `ADMIN_RESET_PASSWORD_ON_BOOT`
- `NEXT_PUBLIC_API_URL`
