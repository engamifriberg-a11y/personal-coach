// מאגר מזון זרע.
//
// מקור הנתונים: USDA FoodData Central (נחלת הכלל; USDA מבקש לציין את FoodData Central כמקור).
// חשוב: הערכים כאן הוזנו ידנית כקבוצת זרע מייצגת ולא יובאו אוטומטית מה-API.
// לפני שימוש בייצור נדרש ייבוא מאומת מול FDC. ראו כלל nutrition.data_source ו-docs/STATUS.md.
//
// כל ערך הוא לכל 100 גרם, ושדה state מציין האם מדובר בחומר גולמי או במזון מבושל.

import type { Allergen, FoodItem } from '../domain/types.ts';

type Tag = FoodItem['tags'][number];

function food(
  id: string,
  nameHe: string,
  nameEn: string,
  kcal: number,
  proteinG: number,
  fatG: number,
  carbsG: number,
  fiberG: number,
  state: FoodItem['state'],
  allergens: Allergen[],
  tags: Tag[],
  costLevel: FoodItem['costLevel'],
  dataSourceRef: string,
): FoodItem {
  return {
    id,
    nameHe,
    nameEn,
    kcal,
    proteinG,
    fatG,
    carbsG,
    fiberG,
    state,
    allergens,
    tags,
    costLevel,
    dataSourceId: 'usda_fdc',
    dataSourceRef,
  };
}

const VEGAN: Tag[] = ['vegan', 'vegetarian', 'pescatarian', 'kosher_pareve', 'lactose_free'];
const VEGAN_GF: Tag[] = [...VEGAN, 'gluten_free'];

export const FOODS: FoodItem[] = [
  // ---------- חלבון מן החי ----------
  food('chicken_breast', 'חזה עוף', 'Chicken breast', 165, 31, 3.6, 0, 0, 'cooked', [], ['kosher_meat', 'gluten_free', 'lactose_free'], 'medium', 'FDC: Chicken, broilers or fryers, breast, meat only, cooked, roasted'),
  food('chicken_thigh', 'שוקיים עוף', 'Chicken thigh', 209, 26, 11, 0, 0, 'cooked', [], ['kosher_meat', 'gluten_free', 'lactose_free'], 'low', 'FDC: Chicken, thigh, meat only, cooked'),
  food('turkey_breast', 'חזה הודו', 'Turkey breast', 147, 30, 2, 0, 0, 'cooked', [], ['kosher_meat', 'gluten_free', 'lactose_free'], 'medium', 'FDC: Turkey, breast, meat only, cooked'),
  food('beef_lean', 'בקר רזה', 'Lean ground beef', 217, 26, 12, 0, 0, 'cooked', [], ['kosher_meat', 'gluten_free', 'lactose_free'], 'high', 'FDC: Beef, ground, 90% lean, cooked'),
  food('salmon', 'סלמון', 'Salmon', 206, 22, 12, 0, 0, 'cooked', ['fish'], ['pescatarian', 'kosher_pareve', 'gluten_free', 'lactose_free'], 'high', 'FDC: Fish, salmon, Atlantic, farmed, cooked'),
  food('tuna_can', 'טונה בשימורים במים', 'Canned tuna in water', 116, 26, 1, 0, 0, 'as_sold', ['fish'], ['pescatarian', 'kosher_pareve', 'gluten_free', 'lactose_free'], 'low', 'FDC: Fish, tuna, light, canned in water, drained'),
  food('tilapia', 'אמנון (טילפיה)', 'Tilapia', 129, 26, 2.7, 0, 0, 'cooked', ['fish'], ['pescatarian', 'kosher_pareve', 'gluten_free', 'lactose_free'], 'medium', 'FDC: Fish, tilapia, cooked, dry heat'),
  food('egg', 'ביצה', 'Egg', 143, 12.6, 9.5, 0.7, 0, 'raw', ['eggs'], ['vegetarian', 'pescatarian', 'kosher_pareve', 'gluten_free'], 'low', 'FDC: Egg, whole, raw, fresh'),
  food('egg_white', 'חלבון ביצה', 'Egg white', 52, 11, 0.2, 0.7, 0, 'raw', ['eggs'], ['vegetarian', 'pescatarian', 'kosher_pareve', 'gluten_free', 'lactose_free'], 'low', 'FDC: Egg, white, raw, fresh'),

  // ---------- חלבי ----------
  food('cottage_5', 'קוטג׳ 5%', 'Cottage cheese 5%', 103, 11, 4.8, 3.4, 0, 'as_sold', ['milk'], ['vegetarian', 'kosher_dairy', 'gluten_free'], 'low', 'FDC: Cheese, cottage, lowfat'),
  food('greek_yogurt', 'יוגורט יווני 2%', 'Greek yogurt 2%', 73, 9.9, 1.9, 3.9, 0, 'as_sold', ['milk'], ['vegetarian', 'kosher_dairy', 'gluten_free'], 'medium', 'FDC: Yogurt, Greek, plain, lowfat'),
  food('white_cheese_5', 'גבינה לבנה 5%', 'White soft cheese 5%', 95, 10, 5, 3.5, 0, 'as_sold', ['milk'], ['vegetarian', 'kosher_dairy', 'gluten_free'], 'low', 'FDC: Cheese, quark / soft white cheese (ערך מקורב)'),
  food('milk_3', 'חלב 3%', 'Milk 3%', 61, 3.3, 3.3, 4.8, 0, 'as_sold', ['milk'], ['vegetarian', 'kosher_dairy', 'gluten_free'], 'low', 'FDC: Milk, whole, 3.25% milkfat'),
  food('yellow_cheese_28', 'גבינה צהובה 28%', 'Hard cheese 28%', 350, 25, 28, 1.3, 0, 'as_sold', ['milk'], ['vegetarian', 'kosher_dairy', 'gluten_free'], 'medium', 'FDC: Cheese, cheddar (ערך מקורב ל-28% שומן)'),

  // ---------- חלבון צמחי ----------
  food('tofu_firm', 'טופו קשה', 'Firm tofu', 144, 17, 9, 2.8, 2.3, 'as_sold', ['soy'], VEGAN_GF, 'medium', 'FDC: Tofu, firm, prepared with calcium sulfate'),
  food('edamame', 'אדממה', 'Edamame', 121, 12, 5, 9, 5, 'cooked', ['soy'], VEGAN_GF, 'medium', 'FDC: Edamame, frozen, prepared'),
  food('lentils_cooked', 'עדשים מבושלות', 'Cooked lentils', 116, 9, 0.4, 20, 8, 'cooked', [], VEGAN_GF, 'low', 'FDC: Lentils, mature seeds, cooked, boiled'),
  food('chickpeas_cooked', 'חומוס גרגירים מבושל', 'Cooked chickpeas', 164, 8.9, 2.6, 27, 7.6, 'cooked', [], VEGAN_GF, 'low', 'FDC: Chickpeas, mature seeds, cooked, boiled'),
  food('black_beans', 'שעועית שחורה מבושלת', 'Cooked black beans', 132, 8.9, 0.5, 24, 8.7, 'cooked', [], VEGAN_GF, 'low', 'FDC: Beans, black, mature seeds, cooked'),
  food('soy_protein_isolate', 'אבקת חלבון סויה', 'Soy protein isolate', 335, 80, 3.4, 7, 2, 'as_sold', ['soy'], VEGAN_GF, 'medium', 'FDC: Soy protein isolate'),
  food('whey_protein', 'אבקת חלבון מי גבינה', 'Whey protein powder', 370, 78, 4, 8, 1, 'as_sold', ['milk'], ['vegetarian', 'kosher_dairy', 'gluten_free'], 'high', 'FDC: Whey protein powder isolate (ערך מקורב; משתנה בין מוצרים)'),
  food('seitan', 'סייטן', 'Seitan', 141, 25, 1.9, 14, 1, 'cooked', ['wheat_gluten'], ['vegan', 'vegetarian', 'pescatarian', 'kosher_pareve', 'lactose_free'], 'medium', 'FDC: Wheat gluten based product (ערך מקורב)'),

  // ---------- פחמימות ----------
  food('white_rice_cooked', 'אורז לבן מבושל', 'Cooked white rice', 130, 2.7, 0.3, 28, 0.4, 'cooked', [], VEGAN_GF, 'low', 'FDC: Rice, white, long-grain, cooked'),
  food('brown_rice_cooked', 'אורז מלא מבושל', 'Cooked brown rice', 123, 2.7, 1, 26, 1.6, 'cooked', [], VEGAN_GF, 'low', 'FDC: Rice, brown, long-grain, cooked'),
  food('pasta_cooked', 'פסטה מבושלת', 'Cooked pasta', 158, 5.8, 0.9, 31, 1.8, 'cooked', ['wheat_gluten'], ['vegan', 'vegetarian', 'pescatarian', 'kosher_pareve', 'lactose_free'], 'low', 'FDC: Pasta, cooked, enriched'),
  food('potato_cooked', 'תפוח אדמה מבושל', 'Boiled potato', 87, 2, 0.1, 20, 1.8, 'cooked', [], VEGAN_GF, 'low', 'FDC: Potatoes, boiled, without skin'),
  food('sweet_potato', 'בטטה אפויה', 'Baked sweet potato', 90, 2, 0.1, 21, 3.3, 'cooked', [], VEGAN_GF, 'low', 'FDC: Sweet potato, cooked, baked in skin'),
  food('oats_dry', 'שיבולת שועל (יבש)', 'Dry oats', 389, 16.9, 6.9, 66, 10.6, 'raw', [], VEGAN, 'low', 'FDC: Oats, whole grain'),
  food('bread_whole', 'לחם מחיטה מלאה', 'Whole wheat bread', 247, 13, 3.4, 41, 7, 'as_sold', ['wheat_gluten'], ['vegan', 'vegetarian', 'pescatarian', 'kosher_pareve', 'lactose_free'], 'low', 'FDC: Bread, whole-wheat, commercially prepared'),
  food('pita_whole', 'פיתה מלאה', 'Whole wheat pita', 266, 9.8, 2.6, 55, 7.4, 'as_sold', ['wheat_gluten'], ['vegan', 'vegetarian', 'pescatarian', 'kosher_pareve', 'lactose_free'], 'low', 'FDC: Bread, pita, whole-wheat'),
  food('couscous_cooked', 'קוסקוס מבושל', 'Cooked couscous', 112, 3.8, 0.2, 23, 1.4, 'cooked', ['wheat_gluten'], ['vegan', 'vegetarian', 'pescatarian', 'kosher_pareve', 'lactose_free'], 'low', 'FDC: Couscous, cooked'),
  food('quinoa_cooked', 'קינואה מבושלת', 'Cooked quinoa', 120, 4.4, 1.9, 21, 2.8, 'cooked', [], VEGAN_GF, 'medium', 'FDC: Quinoa, cooked'),
  food('tortilla_corn', 'טורטייה תירס', 'Corn tortilla', 218, 5.7, 2.9, 45, 6.3, 'as_sold', [], VEGAN_GF, 'low', 'FDC: Tortillas, ready-to-bake or -fry, corn'),

  // ---------- שומנים ----------
  food('olive_oil', 'שמן זית', 'Olive oil', 884, 0, 100, 0, 0, 'as_sold', [], VEGAN_GF, 'medium', 'FDC: Oil, olive, salad or cooking'),
  food('tahini', 'טחינה גולמית', 'Tahini', 595, 17, 53, 21, 9.3, 'as_sold', ['sesame'], VEGAN_GF, 'low', 'FDC: Seeds, sesame butter, tahini'),
  food('almonds', 'שקדים', 'Almonds', 579, 21, 50, 22, 12.5, 'raw', ['tree_nuts'], VEGAN_GF, 'high', 'FDC: Nuts, almonds'),
  food('walnuts', 'אגוזי מלך', 'Walnuts', 654, 15, 65, 14, 6.7, 'raw', ['tree_nuts'], VEGAN_GF, 'high', 'FDC: Nuts, walnuts, english'),
  food('peanut_butter', 'חמאת בוטנים', 'Peanut butter', 588, 25, 50, 20, 6, 'as_sold', ['peanuts'], VEGAN_GF, 'low', 'FDC: Peanut butter, smooth style'),
  food('avocado', 'אבוקדו', 'Avocado', 160, 2, 15, 9, 6.7, 'raw', [], VEGAN_GF, 'medium', 'FDC: Avocados, raw, all commercial varieties'),

  // ---------- ירקות ----------
  food('broccoli', 'ברוקולי', 'Broccoli', 35, 2.4, 0.4, 7, 3.3, 'cooked', [], VEGAN_GF, 'low', 'FDC: Broccoli, cooked, boiled, drained'),
  food('cucumber', 'מלפפון', 'Cucumber', 15, 0.7, 0.1, 3.6, 0.5, 'raw', [], VEGAN_GF, 'low', 'FDC: Cucumber, with peel, raw'),
  food('tomato', 'עגבנייה', 'Tomato', 18, 0.9, 0.2, 3.9, 1.2, 'raw', [], VEGAN_GF, 'low', 'FDC: Tomatoes, red, ripe, raw'),
  food('lettuce', 'חסה', 'Lettuce', 15, 1.4, 0.2, 2.9, 1.3, 'raw', [], VEGAN_GF, 'low', 'FDC: Lettuce, romaine, raw'),
  food('pepper_red', 'פלפל אדום', 'Red bell pepper', 31, 1, 0.3, 6, 2.1, 'raw', [], VEGAN_GF, 'low', 'FDC: Peppers, sweet, red, raw'),
  food('onion', 'בצל', 'Onion', 40, 1.1, 0.1, 9.3, 1.7, 'raw', [], VEGAN_GF, 'low', 'FDC: Onions, raw'),
  food('carrot', 'גזר', 'Carrot', 41, 0.9, 0.2, 10, 2.8, 'raw', [], VEGAN_GF, 'low', 'FDC: Carrots, raw'),
  food('zucchini', 'קישוא', 'Zucchini', 17, 1.2, 0.3, 3.1, 1, 'raw', [], VEGAN_GF, 'low', 'FDC: Squash, summer, zucchini, raw'),
  food('spinach', 'תרד', 'Spinach', 23, 2.9, 0.4, 3.6, 2.2, 'raw', [], VEGAN_GF, 'low', 'FDC: Spinach, raw'),
  food('mixed_salad', 'סלט ירקות מעורב', 'Mixed vegetable salad', 25, 1, 0.2, 5, 1.8, 'raw', [], VEGAN_GF, 'low', 'חישוב מצרפי מפריטי FDC (מלפפון, עגבנייה, פלפל, בצל)'),

  // ---------- פירות ----------
  food('banana', 'בננה', 'Banana', 89, 1.1, 0.3, 23, 2.6, 'raw', [], VEGAN_GF, 'low', 'FDC: Bananas, raw'),
  food('apple', 'תפוח', 'Apple', 52, 0.3, 0.2, 14, 2.4, 'raw', [], VEGAN_GF, 'low', 'FDC: Apples, raw, with skin'),
  food('orange', 'תפוז', 'Orange', 47, 0.9, 0.1, 12, 2.4, 'raw', [], VEGAN_GF, 'low', 'FDC: Oranges, raw, all commercial varieties'),
  food('blueberries', 'אוכמניות', 'Blueberries', 57, 0.7, 0.3, 14, 2.4, 'raw', [], VEGAN_GF, 'high', 'FDC: Blueberries, raw'),
  food('date', 'תמרים', 'Dates', 282, 2.5, 0.4, 75, 8, 'as_sold', [], VEGAN_GF, 'medium', 'FDC: Dates, deglet noor'),
];

const FOODS_BY_ID = new Map(FOODS.map((f) => [f.id, f]));

export function getFood(id: string): FoodItem | undefined {
  return FOODS_BY_ID.get(id);
}

export function requireFood(id: string): FoodItem {
  const f = FOODS_BY_ID.get(id);
  if (!f) throw new Error(`פריט מזון לא קיים: ${id}`);
  return f;
}

export const ALLERGEN_LABELS_HE: Record<Allergen, string> = {
  milk: 'חלב',
  eggs: 'ביצים',
  peanuts: 'בוטנים',
  tree_nuts: 'אגוזים',
  sesame: 'שומשום',
  soy: 'סויה',
  wheat_gluten: 'חיטה/גלוטן',
  fish: 'דגים',
  shellfish: 'פירות ים',
};

export const STATE_LABELS_HE: Record<FoodItem['state'], string> = {
  raw: 'גולמי',
  cooked: 'מבושל',
  as_sold: 'כפי שנמכר',
};
