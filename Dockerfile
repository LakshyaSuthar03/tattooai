FROM node:current-alpine3.23
WORKDIR ./frontend
COPY package*.json ./
RUN npm install
COPY . .
EXPOSE 5173
CMD ["npm", "run", "dev"]