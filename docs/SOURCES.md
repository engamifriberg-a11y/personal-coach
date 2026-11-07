# מקורות מקצועיים וכללים

הקובץ הזה הוא התיעוד האנושי של `src/domain/sources.ts`, שהוא מקור האמת בקוד.
כל כלל שם נושא: מזהה, ניסוח, מקורות, גרסה, מצב ביקורת והערה.

**כלל יסוד:** אין סף מספרי בקוד בלי מקור מתועד. כלל שאינו נשען על מקור מצוטט מסומן
`pending_review`, מוצג בממשק כ"ממתין לביקורת מקצועית", ולא מוצג כמאושר.

---

## מקורות

### ארגון הבריאות העולמי, 2020 - פעילות גופנית והתנהגות יושבנית
Bull FC, Al-Ansari SS, Biddle S, et al. *World Health Organization 2020 guidelines on physical activity
and sedentary behaviour.* Br J Sports Med. 2020;54(24):1451-1462.
doi:[10.1136/bjsports-2020-102955](https://doi.org/10.1136/bjsports-2020-102955)
נבדק על ידינו: 2026-11-06.

מה נגזר ממנו בקוד:
- יעד שבועי של 150-300 דקות פעילות בעצימות מתונה, או 75-150 דקות בעצימות מרץ, או שילוב שקול.
- פעילות לחיזוק שרירים לכלל קבוצות השרירים הגדולות, לפחות פעמיים בשבוע.
- העיקרון שמעט פעילות טוב ממצב של היעדר פעילות - ולכן היעד מוצג כיעד להתקדמות ולא כעומס
  פתיחה חובה למתחיל.
- קיומן של המלצות ייחודיות להריון ולתקופה שלאחר הלידה - ומכאן שההתאמה דורשת גורם מקצועי.

### מיפלין-סנט ג׳ור, 1990 - אומדן הוצאה אנרגטית במנוחה
Mifflin MD, St Jeor ST, Hill LA, Scott BJ, Daugherty SA, Koh YO. *A new predictive equation for resting
energy expenditure in healthy individuals.* Am J Clin Nutr. 1990;51(2):241-247.
doi:[10.1093/ajcn/51.2.241](https://doi.org/10.1093/ajcn/51.2.241)
נבדק על ידינו: 2026-11-06.

הנוסחה כפי שהיא מיושמת ב-`src/domain/energy.ts`:
```
גברים: 10 × משקל(ק"ג) + 6.25 × גובה(ס"מ) − 5 × גיל + 5
נשים:  10 × משקל(ק"ג) + 6.25 × גובה(ס"מ) − 5 × גיל − 161
TDEE = BMR × מקדם פעילות (1.2 / 1.375 / 1.55 / 1.725 / 1.9)
```
הנוסחה פותחה על מבוגרים בריאים ואינה מתחשבת בהרכב גוף. מקדמי הפעילות נלווים לה בשימוש
המקובל ואינם חלק מהמשוואה המקורית - וזה מוצג למשתמש בהנחות החישוב.

### Frankenfield ועמיתים, 2005 - השוואת נוסחאות אומדן
Frankenfield D, Roth-Yousey L, Compher C. *Comparison of predictive equations for resting metabolic rate
in healthy nonobese and obese adults: a systematic review.* J Am Diet Assoc. 2005;105(5):775-789.
doi:[10.1016/j.jada.2005.02.005](https://doi.org/10.1016/j.jada.2005.02.005)
נבדק על ידינו: 2026-11-06.

הבסיס לכך שאנחנו מציגים את האומדן כטווח ולא כמספר בודד. **רוחב הטווח שבחרנו להציג
(±10%, ו-±15% כשנתון המין לא נמסר) הוא החלטה מוצרית שלנו** וממתין לביקורת דיאטן.

### PAR-Q+ ו-ePARmed-X+ - סינון מקדים לפעילות גופנית
Warburton DER, Jamnik VK, Bredin SSD, Gledhill N, et al. *The Physical Activity Readiness Questionnaire
for Everyone (PAR-Q+) and electronic Physical Activity Readiness Medical Examination (ePARmed-X+).*
Health & Fitness Journal of Canada. [eparmedx.com](https://eparmedx.com/)
נבדק על ידינו: 2026-11-06.

הבסיס לעקרון הסינון המקדים: שאלות כלליות שתשובה חיובית עליהן מפעילה בירור נוסף או הפניה
להערכה מקצועית, במקום פסילה אוטומטית מפעילות. **הניסוח העברי בקוד הוא שלנו ולא תרגום
רשמי של השאלון, וטרם עבר ביקורת מקצועית מטעמנו.**

### USDA FoodData Central - ערכים תזונתיים
U.S. Department of Agriculture, Agricultural Research Service. *FoodData Central.*
[fdc.nal.usda.gov](https://fdc.nal.usda.gov/)
נבדק על ידינו: 2026-11-06.

נתוני הרכב המזון של USDA הם נחלת הכלל ואינם מוגנים בזכויות יוצרים; אין צורך בהרשאה לשימוש,
ו-USDA מבקש שיצוין FoodData Central כמקור הנתונים. הציטוט המוצע:
`U.S. Department of Agriculture, Agricultural Research Service. FoodData Central, fdc.nal.usda.gov.`

**חשוב:** 54 פריטי המזון ב-`src/content/foods.ts` הוזנו **ידנית** כקבוצת זרע מייצגת, ולא יובאו
אוטומטית מה-API. לכל פריט נשמר שדה `dataSourceRef` עם תיאור הפריט המקביל במאגר.
לפני שימוש בייצור נדרש ייבוא מאומת מול FDC. ראו `docs/STATUS.md`.

---

## כללים שהם החלטת מוצר ולא סף מקצועי

אלה מסומנים בקוד במפורש, ומוצגים למשתמש ולמנהל כממתינים לביקורת:

| כלל | מה הוא קובע | למה הוא לא מצוטט ממקור |
|---|---|---|
| `nutrition.deficit_bounds` | גרעון 10-20%; רצפות 1500/1200/1300 קק"ל | ספי זהירות מוצריים. **חובה ביקורת דיאטן קליני** |
| `nutrition.surplus_bounds` | עודף 5-15% | אותו דבר |
| `nutrition.rate_realism` | עד כ-1% ממשקל הגוף בשבוע | סף מוצרי לבחינת מציאותיות |
| `nutrition.uncertainty_range` | ±10% / ±15% | רוחב התצוגה הוא בחירה שלנו |
| `plan.beginner_rampup` | פתיחה ב-40% מיעד הדקות | עקרון ההדרגתיות מ-WHO; האחוז שלנו |
| `safety.max_rpe_beginner` | מתחיל ב-RPE 5-7 | פרקטיקה מקובלת, לא סף מצוטט |
| `safety.cardiac_restricted` | תקרת RPE 5 עד אישור רפואי | החלטת זהירות שלנו |
| `plan.progression_double` | פרוגרסיה כפולה | פרקטיקה מקובלת |
| `plan.reassess_triggers` | כאב/עייפות/ירידה בביצועים → הערכה מחדש | פרקטיקה מקובלת |
| `safety.active_injury_area` | מיפוי אזור גוף → דפוסי תנועה חסומים | המיפוי שלנו; **נדרשת ביקורת פיזיותרפיסט** |
| `safety.eating_disorder_history` | חסימת יעדי קלוריות ומעקב משקל | כלל הגנה מוצרי |

---

## תוכן התרגילים

57 התרגילים ב-`src/content/exercises-*.ts` - הוראות ביצוע, נשימה, טעויות נפוצות ודגשי בטיחות -
נכתבו על בסיס פרקטיקה מקובלת של אימון התנגדות. **כולם מסומנים `professionallyReviewed: false`**
ומוצגים בממשק כ"ממתין לביקורת מקצועית".

פאנל הניהול מאפשר לסמן תרגיל כבדוק, עם שם הבודק ותאריך, ורק אז הוא נספר כ"מוכן".
