# ---------- Stage 1: фронтенд ----------
FROM node:22-alpine AS frontend
WORKDIR /front
COPY front/package*.json ./
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi
COPY front/ ./
RUN npm run build

# ---------- Stage 2: бэкенд ----------
FROM eclipse-temurin:25-jdk AS backend
WORKDIR /backend
COPY backend/gradlew ./
COPY backend/gradle ./gradle
COPY backend/build.gradle backend/settings.gradle ./
RUN sed -i 's/\r$//' gradlew && chmod +x gradlew && ./gradlew --no-daemon dependencies > /dev/null
COPY backend/src ./src
COPY --from=frontend /front/dist ./src/main/resources/static
RUN ./gradlew --no-daemon bootJar -x test && cp "$(ls build/libs/*.jar | grep -v -- '-plain.jar' | head -n1)" /backend/app.jar

# ---------- Stage 3: запуск ----------
FROM eclipse-temurin:25-jre
WORKDIR /app
RUN useradd --system --uid 1001 appuser
COPY --from=backend /backend/app.jar app.jar
USER appuser
EXPOSE 8080
ENV JAVA_OPTS="-XX:MaxRAMPercentage=65 -XX:+ExitOnOutOfMemoryError"
ENTRYPOINT ["sh", "-c", "exec java $JAVA_OPTS -jar app.jar"]