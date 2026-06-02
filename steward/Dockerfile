FROM node:20-alpine

WORKDIR /app

COPY package.json .
RUN npm install --omit=dev

COPY server.js .
COPY public/ public/
COPY data.default.json .
COPY run.sh /run.sh
RUN chmod +x /run.sh

CMD ["/run.sh"]
