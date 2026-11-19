# متطلبات نظام لا يمكن تثبيتها عبر npm: ffmpeg/ffprobe لازم لأوامر المكالمات
# ذات الوسائط (مكالمة · مكالمة-جماعية · غرفة · انضمام-مكالمة · معاينة-مكالمة).
FROM node:22-slim

RUN apt-get update \
 && apt-get install -y --no-install-recommends ffmpeg ca-certificates \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json ./
RUN npm install --no-audit --no-fund

COPY . .

ENV NODE_ENV=production
CMD ["node", "index.js"]
