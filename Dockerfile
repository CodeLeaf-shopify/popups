FROM node:22-alpine AS base
WORKDIR /app
RUN apk add --no-cache openssl

FROM base AS build

COPY package.json package-lock.json ./
COPY extensions/leaf-popups-embed/package.json ./extensions/leaf-popups-embed/package.json

RUN npm ci

COPY . .

RUN npx prisma generate && npm run build

FROM base AS production

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000

COPY package.json package-lock.json ./
COPY extensions/leaf-popups-embed/package.json ./extensions/leaf-popups-embed/package.json
COPY prisma ./prisma

RUN npm ci --omit=dev \
  && npx prisma generate \
  && npm cache clean --force

COPY --from=build /app/build ./build
COPY extensions/leaf-popups-embed/assets ./extensions/leaf-popups-embed/assets

EXPOSE 3000

CMD ["npm", "run", "docker-start"]
