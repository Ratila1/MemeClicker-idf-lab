# ---------- Frontend build ----------
FROM node:22-alpine AS frontend
WORKDIR /front
COPY front/package*.json ./
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi
COPY front/ ./
RUN npm run build

# ---------- Backend build ----------
FROM eclipse-temurin:25-jdk AS backend-build
WORKDIR /backend
COPY backend/gradlew ./
COPY backend/gradle ./gradle
COPY backend/build.gradle backend/settings.gradle ./
RUN sed -i 's/\r$//' gradlew && chmod +x gradlew && ./gradlew --no-daemon dependencies > /dev/null
COPY backend/src ./src
COPY --from=frontend /front/dist ./src/main/resources/static
RUN ./gradlew --no-daemon bootJar -x test \
    && cp "$(find build/libs -maxdepth 1 -name '*.jar' ! -name '*-plain.jar' | head -n 1)" /backend/app.jar

# ---------- Runtime ----------
FROM eclipse-temurin:25-jre
WORKDIR /app
RUN useradd --system --uid 1001 appuser
COPY --from=backend-build --chown=appuser:appuser /backend/app.jar ./app.jar
USER appuser
EXPOSE 8080
ENV JAVA_OPTS="-XX:MaxRAMPercentage=65 -XX:+ExitOnOutOfMemoryError"
ENTRYPOINT ["sh", "-c", "exec java $JAVA_OPTS -jar /app/app.jar"]
