FROM node:24-alpine
WORKDIR /app
# copy full repo into container
COPY . /app
WORKDIR /app/test
RUN apk add --no-cache --virtual .build-deps \
    build-base python3 make git && \
    apk add --no-cache chromium nss freetype harfbuzz ttf-freefont fontconfig
# install utilities to fetch fonts and refresh font cache
RUN apk add --no-cache wget unzip

# Download Noto Sans CJK SC (subset) for Chinese glyphs and install
RUN mkdir -p /usr/share/fonts/noto && \
    wget -q -O /tmp/noto.zip https://noto-website-2.storage.googleapis.com/pkgs/NotoSansCJKsc-hinted.zip && \
    unzip -q /tmp/noto.zip -d /tmp/noto && \
    cp /tmp/noto/*.otf /usr/share/fonts/noto/ || true && \
    fc-cache -f -v || true && \
    rm -rf /tmp/noto /tmp/noto.zip
# Prevent Puppeteer from attempting to download Chromium during npm install
ENV PUPPETEER_SKIP_DOWNLOAD=true

RUN npm install --no-audit --no-fund && \
    apk del .build-deps

# ensure Chromium path is available to the test script
ENV CHROMIUM_PATH=/usr/bin/chromium-browser

CMD ["node", "run_test.js"]
