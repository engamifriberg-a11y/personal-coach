# אריזה לטלפון: אנדרואיד ו-Apple

## מה כבר עובד בלי שום אריזה

האפליקציה היא PWA מלאה, ולכן **אפשר להתקין אותה על הטלפון עכשיו**, בלי חנות ובלי בנייה:

- **אנדרואיד (Chrome):** נכנסים לכתובת → באנר "התקנה", או תפריט ⋮ → "התקנת אפליקציה".
- **אייפון ואייפד (Safari):** כפתור שיתוף → "הוספה למסך הבית".

בשני המקרים מתקבל אייקון במסך הבית, מסך פתיחה, מצב אפליקציה בלי שורת כתובת, ועבודה
סבירה גם ברשת גרועה. דרישה אחת: **האתר חייב להיות ב-HTTPS** (למעט `localhost`).

לרוב המוצרים זה מספיק. אריזה לחנות נדרשת כשרוצים נוכחות ב-Google Play / App Store,
תשלומים בחנות, או התראות Push באייפון בתוך אפליקציה מקומית.

---

## חשוב לדעת לפני שמתחילים

**לא ניתן לבנות APK/AAB או IPA בסביבה שבה נבנתה האפליקציה**: אין Android SDK, אין Xcode
ואין גישת רשת להתקנת כלים. לכן הקבצים כאן הם **תצורה מוכנה**, לא תוצרי בנייה.
אין כאן קובץ APK, ולא נמסרת כתובת הורדה - כי אין כזו.

הבנייה נעשית אצלכם, על מכונה עם הכלים המתאימים.

---

## אנדרואיד: Bubblewrap (מסלול TWA) - המסלול המומלץ

Trusted Web Activity עוטפת את ה-PWA באפליקציה מקומית, בלי מסגרת דפדפן.
האפליקציה נשארת מקור אמת אחד, ועדכון באתר מתעדכן אצל המשתמש.

```bash
# על מכונה עם Node ו-Android SDK (או JDK שמותקן על ידי Bubblewrap עצמו)
npm i -g @bubblewrap/cli

cd packaging/bubblewrap
# עדכנו את twa-manifest.json: host, packageId, signingKey
bubblewrap init --manifest=https://YOUR-DOMAIN/manifest.webmanifest
bubblewrap build          # מפיק app-release-bundle.aab ו-app-release-signed.apk
```

### חובה כדי שלא תופיע שורת כתובת בתוך האפליקציה
Digital Asset Links: הקובץ `/.well-known/assetlinks.json` צריך להיות מוגש מהדומיין שלכם
ולהכיל את טביעת האצבע SHA-256 של מפתח החתימה. `bubblewrap build` מדפיס את הטביעה,
ו-`bubblewrap fingerprint` מציג אותה מחדש.

דוגמה (יש להחליף את `packageId` ואת הטביעה):
```json
[{
  "relation": ["delegate_permission/common.handle_all_urls"],
  "target": {
    "namespace": "android_app",
    "package_name": "il.coach.app",
    "sha256_cert_fingerprints": ["AA:BB:CC:..."]
  }
}]
```

בפרויקט הזה הקובץ אינו מוגש, כי אין דומיין. להוספה: ליצור `public/.well-known/assetlinks.json` -
השרת מגיש כל קובץ מתוך `public/` ולכן הוא יעבוד מיד.

---

## אנדרואיד ו-Apple: Capacitor (מסלול אפליקציה מקומית)

מתאים כשצריך API מקומי שה-PWA לא נותנת: התראות Push באייפון, HealthKit / Health Connect,
עבודה עם קבצים, או נוכחות ב-App Store.

```bash
npm i -D @capacitor/cli @capacitor/core
npx cap init --web-dir=public      # או להשתמש ב-capacitor.config.json שכאן
npm i @capacitor/android @capacitor/ios
npx cap add android
npx cap add ios                    # דורש macOS עם Xcode
npx cap sync
npx cap open android               # בנייה ב-Android Studio
npx cap open ios                   # בנייה ב-Xcode
```

`capacitor.config.json` כאן מוגדר כך שהאפליקציה **טוענת את השרת שלכם** (`server.url`),
ולא מעתיקה את `public/` לתוך האפליקציה. זה נדרש כי ה-API והמסד נמצאים בשרת.

אם רוצים להריץ את הממשק מתוך האפליקציה ולדבר עם השרת ב-API בלבד: להסיר את `server.url`,
לשנות ב-`public/api.js` את ה-URL הבסיסי לכתובת מלאה, ולהוסיף CORS בשרת לאוריג'ין של
האפליקציה (`capacitor://localhost`, `http://localhost`).

---

## דברים שתידרשו להם בכל מסלול

| פריט | אנדרואיד | Apple |
|---|---|---|
| חשבון מפתח | Google Play, 25$ חד־פעמי | Apple Developer, 99$ לשנה |
| חתימה | מפתח upload + Play App Signing | Certificates + Provisioning Profiles |
| מדיניות פרטיות | חובה - URL פעיל | חובה - URL פעיל |
| הצהרת נתונים | Data Safety | App Privacy ("Nutrition Labels") |
| אייקונים | נגזרים מה-manifest | נדרשים נכסים ל-Xcode |

### בדיקות שהחנויות עושות למוצרי בריאות וכושר
שתי החנויות בודקות אפליקציות בריאות בקפידה. עם המוצר הזה צפו לשאלות על:

- **מי אחראי מקצועית על ההמלצות.** `docs/STATUS.md` מפרט 11 כללים שממתינים לביקורת
  מקצועית ו-57 תרגילים שלא עברו ביקורת. **אין להגיש לחנות לפני שזה נסגר.**
- **ניסוח שאינו מרמז על אבחון או טיפול רפואי.** האפליקציה מקפידה על כך; יש לשמור על זה
  גם בתיאור בחנות ובצילומי המסך.
- **טיפול בנתוני בריאות:** הסכמה, ייצוא, מחיקה - קיימים. תנאי שימוש ומדיניות פרטיות -
  לא קיימים וחובה להוסיף.
- **גיל המשתמשים:** המוצר מוגבל ל-18+ בקוד, וכך צריך לסמן גם את דירוג הגיל בחנות.

---

## קבצים כאן

```
packaging/
  bubblewrap/twa-manifest.json     תצורת TWA לאנדרואיד
  capacitor/capacitor.config.json  תצורת Capacitor לשני המכשירים
```

שני הקבצים מכילים `YOUR-DOMAIN` ו-`packageId` לדוגמה. אלה placeholders שחייבים להתעדכן -
הם לא דומיין אמיתי ולא יעבדו כמו שהם.
