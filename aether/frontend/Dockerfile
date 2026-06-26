FROM node:20-slim

WORKDIR /frontend

# Copy package descriptors
COPY package.json package-lock.json* ./

# Install dependencies
RUN npm install

# Copy project files
COPY . .

# Set environment variables for build
ENV NEXT_PUBLIC_API_URL=http://localhost:8000
ENV PORT=3000

# Build Next.js app
RUN npm run build

EXPOSE 3000

CMD ["npm", "run", "start"]
