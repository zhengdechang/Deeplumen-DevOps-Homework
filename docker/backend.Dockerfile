FROM node:20-alpine

WORKDIR /app

# Install only runtime dependencies so the image stays small and reproducible.
COPY apps/backend/package.json ./package.json
RUN npm install --omit=dev

COPY apps/backend/server.js ./server.js

ENV PORT=8080
EXPOSE 8080

CMD ["npm", "start"]