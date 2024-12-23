FROM node:20-alpine

WORKDIR /app

# Copy source code
COPY . .
RUN npm install

# Build the application
RUN npm run build

EXPOSE 3000

CMD ["npm", "run", "start"]
