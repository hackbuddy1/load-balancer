FROM node:18

WORKDIR /app

COPY server3.js .

CMD ["node", "server3.js"]


