FROM node:20-alpine
WORKDIR /app

COPY package.json package-lock.json ./
COPY client/package.json client/
COPY server/package.json server/
RUN npm ci --include=dev

COPY . .
RUN npm run build

ENV PORT=3000
EXPOSE 3000
CMD ["npm", "start"]