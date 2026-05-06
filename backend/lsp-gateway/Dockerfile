FROM node:22-alpine
WORKDIR /app

# Install language servers
RUN npm install -g typescript typescript-language-server
RUN apk add --no-cache clang clang-extra-tools python3 py3-pip rust cargo && \
    pip3 install --break-system-packages python-lsp-server && \
    cargo install rust-analyzer

RUN npm install -g pnpm
COPY package.json pnpm-lock.yaml* ./
RUN pnpm install --frozen-lockfile
COPY . .
EXPOSE 1235
CMD ["node", "--experimental-strip-types", "src/index.ts"]
