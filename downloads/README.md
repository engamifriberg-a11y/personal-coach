# תיקיית קובצי התקנה

כל קובץ שיונח כאן יוצג אוטומטית בעמוד `/download.html` ככפתור הורדה אמיתי,
עם שם, גודל ותאריך עדכון. כל עוד התיקייה ריקה, העמוד אומר במפורש שאין קובץ -
ולא מוצג קישור מומצא.

סוגי קבצים שמותרים להצגה: `.apk`, `.aab`, `.ipa`, `.zip`.

## איך מפיקים קובץ

ראו `packaging/README.md`. בקצרה, לאנדרואיד:

```
npm i -g @bubblewrap/cli
cd packaging/bubblewrap
bubblewrap init --manifest=https://YOUR-DOMAIN/manifest.webmanifest
bubblewrap build
```

ואז להעתיק את `app-release-signed.apk` לכאן.

## אזהרה

אל תעלו לכאן קובץ שלא אתם בניתם וחתמתם. התקנה מ-APK עוקפת את בדיקות החנות,
והמשתמש מאשר אותה ידנית על בסיס אמון במפעיל האתר.
