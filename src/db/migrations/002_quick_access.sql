-- מיגרציה 002: תמיכה בכניסה מהירה עם שם חופשי וקוד גישה משותף.
--
-- display_name שומר את השם שהמשתמש הזין (כולל עברית ורווחים), בעוד שה-email
-- נגזר ממנו כמזהה יציב. כך כל שם מקבל חשבון נפרד עם בידוד נתונים מלא.

ALTER TABLE users ADD COLUMN display_name TEXT;

-- מסמן חשבון שנוצר דרך כניסה מהירה. חשבונות כאלה אינם מתאימים לשימוש ציבורי:
-- מי שמכיר את קוד הגישה יכול להיכנס בכל שם. ראו docs/STATUS.md
ALTER TABLE users ADD COLUMN via_access_code INTEGER NOT NULL DEFAULT 0;
