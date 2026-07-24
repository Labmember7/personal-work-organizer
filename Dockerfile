# Builds Windows portable .exe + Linux AppImage in one container, no local wine/mono needed.
FROM electronuserland/builder:wine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

CMD ["npm", "run", "dist:all"]
