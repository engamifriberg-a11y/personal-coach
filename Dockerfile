# תמונת הרצה לאפליקציה.
#
# אין תלויות npm להרצה, ולכן אין שלב npm install ואין שלב build:
# Node 22 מריץ את קובצי ה-TypeScript ישירות בהפשטת טיפוסים.
#
# הנתונים נשמרים ב-/data, שצריך להיות דיסק מתמיד (volume) אצל המארח.
# בלי דיסק מתמיד, כל פריסה מחדש תמחק חשבונות, תוכניות ואימונים.

FROM node:22-alpine

# tini מטפל באיתותים כראוי, כדי שכיבוי מסודר יעבוד ו-SQLite ייסגר נקי
RUN apk add --no-cache tini

WORKDIR /app

# קוד המקור בלבד. ראו .dockerignore
COPY package.json ./
COPY src ./src
COPY public ./public
COPY www ./www
COPY scripts ./scripts

# תיקיית הנתונים ותיקיית קובצי ההתקנה, בבעלות המשתמש שאינו root.
# קובץ APK שרוצים להציג באתר: להוסיף ל-downloads/ במאגר, או למפות לכאן volume.
RUN mkdir -p /data /app/downloads && chown -R node:node /data /app
USER node

ENV NODE_ENV=production \
    PORT=3000 \
    SQLITE_PATH=/data/coach.db \
    TRUST_PROXY=1

EXPOSE 3000

# בדיקת בריאות מול נתיב פומבי שאינו דורש התחברות
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/site-info').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "--experimental-strip-types", "--no-warnings", "src/server/index.ts"]
