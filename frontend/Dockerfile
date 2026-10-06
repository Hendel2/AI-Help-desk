# Imagem de DESENVOLVIMENTO do frontend (servidor Vite com hot reload).
# Node 22 LTS atende ao requisito de engines do package.json (^22.22.2).
FROM node:22-alpine

WORKDIR /app

# Dependências primeiro, a partir do lockfile, para aproveitar o cache de camadas.
COPY package.json package-lock.json ./
RUN npm ci

COPY . .

EXPOSE 5173

CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]
