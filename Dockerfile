# --- STAGE 1: BUILD (Optimized for full compilation) ---
# ใช้ base image ที่มี build tools ครบถ้วน (กลับไปใช้ Tag หลัก)
FROM node:20 AS build
WORKDIR /app

# Explicitly set the private environment variables required for SvelteKit's 
# $env/static/private import during the build process (Vite/Rollup).
# *การใช้ ENV ใน Stage BUILD ยังคงจำเป็นสำหรับ SvelteKit*
ENV DB_HOST=192.168.111.52
ENV DB_PORT=3308
ENV DB_USER=root
ENV DB_PASSWORD=Anji@12345
ENV DB_DATABASE=asset_control_db

# **FIX: รวมการ Copy และ Install ใน Layer เดียวกัน เพื่อหลีกเลี่ยงปัญหาการลิงก์**
# 1. คัดลอก package files และ source code ทั้งหมด
COPY . .

# 2. ติดตั้ง dependencies ทั้งหมด รวมถึง devDependencies เพื่อให้ SvelteKit build ได้สำเร็จ
RUN npm install

# สร้างโครงสร้างไดเร็กทอรี uploads ใน static (ถ้ายังไม่มี)
RUN mkdir -p static/uploads

# **FIX: ล้างไฟล์ชั่วคราวของ SvelteKit ก่อน Build**
RUN rm -rf .svelte-kit

# Build the SvelteKit application for a Node environment
# *ตอนนี้ build จะรันใน base image ที่มีเครื่องมือครบถ้วน*
RUN npm run build

# --- STAGE 2: PRODUCTION (Lean Runtime Environment) ---
# เปลี่ยนไปใช้ base image ที่ "slim" ซึ่งเหมาะกับการรัน Node.js production ที่สุด (กลับไปใช้ Tag หลัก)
FROM node:20-slim AS production
WORKDIR /app

# สำหรับ runtime environment
ENV NODE_ENV=production
ENV PORT=3000

# 1. คัดลอกเฉพาะไฟล์ที่จำเป็นในการรัน Build artifact
COPY --from=build /app/build ./build
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/static ./static

# **FIX: คัดลอก node_modules ที่ถูกคอมไพล์แล้วจาก Stage 1 เพื่อความเสถียรสูงสุด**
COPY --from=build /app/node_modules ./node_modules

EXPOSE 3000

# The command to run the Node.js server produced by adapter-node
CMD [ "node", "build/index.js" ]