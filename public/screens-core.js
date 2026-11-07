// מסכי הליבה: הרשמה, שאלון, דשבורד, לוח שבועי ואימון פעיל.
import { api, ApiError, state, refreshMe, loadActivePlan, loadProfile, loadMeta, saveSet, flushQueue, pendingCount } from './api.js';
import {
  el, mount, frag, card, note, noteList, field, input, numberInput, select, chipGroup, segmented, button,
  stat, badge, ring, progressBar, accordion, listItem, toast, sheet, lineChart, DAY_NAMES, fmtTime, clear,
} from './ui.js';

// ============================ הרשמה והתחברות ============================

export async function renderAuth(ctx) {
  const wrap = el('div', { class: 'stack' });
  let quickAllowed = true;
  try {
    const me = await api.get('/api/me');
    quickAllowed = me.quickAccess !== false;
  } catch {
    quickAllowed = true;
  }

  // ---------- כניסה מהירה: שם חופשי + קוד גישה ----------
  const nameInput = input({ type: 'text', autocomplete: 'name', placeholder: 'איך לקרוא לך?', required: true });
  const codeInput = input({ type: 'password', autocomplete: 'current-password', placeholder: 'קוד הגישה', required: true });
  const quickConsent = el('input', { type: 'checkbox' });
  const quickSubmit = button('כניסה', { variant: 'primary', block: true, size: 'lg', type: 'submit' });

  const quickForm = el('form', { class: 'stack', onsubmit: async (e) => {
    e.preventDefault();
    if (!quickConsent.checked) {
      toast('בלי אישור לשמירת נתוני בריאות לא נוכל לבנות תוכנית אישית.', 'error');
      return;
    }
    quickSubmit.disabled = true;
    try {
      const res = await api.post('/api/auth/access', {
        name: nameInput.value.trim(),
        code: codeInput.value,
        consentHealthData: quickConsent.checked,
        consentAi: false,
      });
      await refreshMe();
      toast(res.isNew ? `נעים להכיר, ${res.user.displayName}.` : `ברוך שחזרת, ${res.user.displayName}.`, 'ok');
      ctx.navigate(state.hasProfile ? '/' : '/questionnaire');
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      quickSubmit.disabled = false;
    }
  } }, [
    field('שם', nameInput, 'כל שם יעבוד. אותו שם יחזיר אותך לאותם נתונים.'),
    field('קוד גישה', codeInput),
    el('label', { class: 'switch-row' }, [
      quickConsent,
      el('span', { class: 'switch-row__text' }, [
        el('strong', { text: 'אני מאשר שמירת נתוני בריאות' }),
        'גיל, משקל, מגבלות והעדפות תזונה. בלי זה אי אפשר לבנות תוכנית אישית. ' +
          'אפשר לבטל בכל רגע, ואפשר למחוק הכול.',
      ]),
    ]),
    quickSubmit,
    note(
      'הקוד משותף לכל מי שקיבל אותו. לכן מי שמכיר אותו יכול להיכנס גם בשם שלך. ' +
        'למצב הזה יש מקום בקבוצה סגורה; לשימוש אמיתי כדאי חשבון עם אימייל וסיסמה.',
      'warn',
    ),
  ]);

  // ---------- חשבון עם אימייל ----------
  const mode = { value: 'login' };
  const emailInput = input({ type: 'email', autocomplete: 'email', placeholder: 'you@example.com', required: true });
  const passInput = input({ type: 'password', autocomplete: 'current-password', placeholder: '10 תווים לפחות', required: true });
  const consentHealth = el('input', { type: 'checkbox' });
  const consentAi = el('input', { type: 'checkbox' });

  const consentBlock = el('div', { class: 'stack stack--tight' }, [
    el('label', { class: 'switch-row' }, [
      consentHealth,
      el('span', { class: 'switch-row__text' }, [
        el('strong', { text: 'אני מאשר שמירת נתוני בריאות' }),
        'גיל, משקל, מגבלות, פציעות והעדפות תזונה. בלי האישור הזה אי אפשר לבנות תוכנית אישית. ' +
          'אפשר לבטל בכל רגע, ואפשר למחוק את החשבון וכל הנתונים.',
      ]),
    ]),
    el('label', { class: 'switch-row' }, [
      consentAi,
      el('span', { class: 'switch-row__text' }, [
        el('strong', { text: 'שימוש ב-AI לניסוח הסברים (אופציונלי)' }),
        'התוכנית עצמה נבנית תמיד על ידי מנוע כללים מקומי. אם תאשרו, נשלח לספק חיצוני עובדות מספריות בלבד - ' +
          'בלי שם, בלי אימייל ובלי טקסט רפואי. בלי אישור, האפליקציה עובדת במלואה עם ניסוח מקומי.',
      ]),
    ]),
  ]);

  const submit = button('התחברות', { variant: 'primary', block: true, size: 'lg' });

  const form = el('form', { class: 'stack', onsubmit: async (e) => {
    e.preventDefault();
    submit.disabled = true;
    try {
      const body = { email: emailInput.value.trim(), password: passInput.value };
      if (mode.value === 'register') {
        body.consentHealthData = consentHealth.checked;
        body.consentAi = consentAi.checked;
        if (!consentHealth.checked) {
          toast('בלי אישור לשמירת נתוני בריאות לא נוכל לבנות תוכנית. אפשר להירשם ולאשר אחר כך בהגדרות.', 'error');
        }
        await api.post('/api/auth/register', body);
      } else {
        await api.post('/api/auth/login', body);
      }
      await refreshMe();
      ctx.navigate(state.hasProfile ? '/' : '/questionnaire');
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      submit.disabled = false;
    }
  } }, [
    field('אימייל', emailInput),
    field('סיסמה', passInput, 'לפחות 10 תווים, עם אותיות וספרות.'),
    consentBlock,
    submit,
  ]);

  const emailToggle = segmented(
    [
      { value: 'login', label: 'התחברות' },
      { value: 'register', label: 'הרשמה' },
    ],
    {
      value: 'login',
      onSelect: (v) => {
        mode.value = v;
        submit.textContent = v === 'register' ? 'יצירת חשבון' : 'התחברות';
        passInput.setAttribute('autocomplete', v === 'register' ? 'new-password' : 'current-password');
        consentBlock.hidden = v !== 'register';
      },
    },
  );
  consentBlock.hidden = true;

  const emailCard = card({}, [emailToggle, el('div', { style: 'height:12px' }), form]);
  const quickCard = card({}, [quickForm]);

  // מתג בין שני סוגי הכניסה. כניסה מהירה היא ברירת המחדל כשהיא מופעלת.
  const methodToggle = quickAllowed
    ? segmented(
        [
          { value: 'quick', label: 'כניסה מהירה' },
          { value: 'email', label: 'חשבון עם אימייל' },
        ],
        {
          value: 'quick',
          onSelect: (v) => {
            quickCard.hidden = v !== 'quick';
            emailCard.hidden = v !== 'email';
          },
        },
      )
    : null;
  if (quickAllowed) emailCard.hidden = true;
  else quickCard.hidden = true;

  mount(wrap,
    el('div', { class: 'hero' }, [
      el('div', { class: 'hero__eyebrow', text: 'אימונים ותזונה בעברית' }),
      el('div', { class: 'hero__title', text: 'מאמן אישי' }),
      el('div', { text: 'תוכנית שמתאימה לציוד, לזמן ולמגבלות שלך - ומתעדכנת לפי מה שאתה מבצע בפועל.' }),
    ]),
    methodToggle,
    quickCard,
    emailCard,
    note(
      'האפליקציה מיועדת למבוגרים בריאים מגיל 18 ומעלה, ונותנת הנחיות אימון ותזונה כלליות. ' +
        'היא אינה אבחון, טיפול או ייעוץ רפואי, ואינה מחליפה בדיקה.',
      'warn',
    ),
    el('div', { class: 'app-footer' }, [
      el('a', { href: '/', text: 'לאתר' }),
      el('span', { text: ' · ' }),
      el('a', { href: '/privacy', text: 'מה נשמר ואיך' }),
      el('div', { class: 'app-footer__copy', text: '© 2026 רון בר. כל הזכויות שמורות.' }),
    ]),
  );
  return wrap;
}

// ================================= שאלון =================================

const STEP_TITLES = [
  'מה המטרה',
  'נתונים בסיסיים',
  'ניסיון וזמינות',
  'מקום וציוד',
  'בריאות ומגבלות',
  'סדר היום',
  'תזונה',
  'סיכום',
];

export async function renderQuestionnaire(ctx) {
  const meta = await loadMeta();
  let draft = {};
  let step = 0;
  try {
    const saved = await api.get('/api/questionnaire/draft');
    draft = saved.data ?? {};
    step = Math.min(saved.step ?? 0, STEP_TITLES.length - 1);
  } catch {
    /* אין טיוטה */
  }

  const host = el('div', { class: 'stack' });

  const saveDraft = async () => {
    try {
      await api.post('/api/questionnaire/draft', { step, data: draft });
    } catch (err) {
      if (err instanceof ApiError && err.status === 403) {
        toast(err.message, 'error');
      }
    }
  };

  const steps = el('div', { class: 'steps' }, STEP_TITLES.map(() => el('div', { class: 'steps__dot' })));

  const render = () => {
    clear(host);
    [...steps.children].forEach((d, i) => {
      d.className = `steps__dot ${i < step ? 'is-done' : i === step ? 'is-current' : ''}`.trim();
    });
    mount(host, 
      steps,
      el('div', { class: 'row row--between' }, [
        el('h1', { text: STEP_TITLES[step] }),
        badge(`${step + 1} מתוך ${STEP_TITLES.length}`),
      ]),
      stepBody(),
      el('div', { class: 'btn-row' }, [
        step > 0 ? button('חזרה', { variant: 'ghost', onClick: () => { step--; render(); } }) : null,
        step < STEP_TITLES.length - 1
          ? button('המשך', { variant: 'primary', onClick: async () => { step++; await saveDraft(); render(); } })
          : button('בניית התוכנית', { variant: 'primary', size: 'lg', onClick: finish }),
      ]),
      note('אפשר לעצור כאן ולהמשיך מאוחר יותר - התשובות נשמרות אוטומטית.', 'info'),
    );
    window.scrollTo({ top: 0, behavior: 'instant' });
  };

  const opt = (values, labels) => values.map((v) => ({ value: v, label: labels[v] ?? v }));

  const GOAL_LABELS = {
    weight_loss: 'ירידה במשקל',
    fat_loss_recomp: 'הפחתת שומן וחיטוב',
    muscle_gain: 'בניית מסת שריר',
    strength: 'שיפור כוח',
    endurance: 'שיפור סיבולת',
    maintain: 'שמירה על כושר',
  };
  const EXP_LABELS = { beginner: 'מתחיל', novice: 'מתחיל מתקדם', intermediate: 'בינוני', advanced: 'מתקדם' };
  const ACT_LABELS = {
    sedentary: 'יושבני',
    light: 'פעילות קלה',
    moderate: 'פעילות בינונית',
    active: 'פעיל',
    very_active: 'פעיל מאוד',
  };
  const LOC_LABELS = { home: 'בית', gym: 'חדר כושר', outdoor: 'בחוץ' };
  const JOINT_LABELS = {
    knee: 'ברך', hip: 'ירך', lower_back: 'גב תחתון', shoulder: 'כתף',
    elbow: 'מרפק', wrist: 'שורש יד', neck: 'צוואר', ankle: 'קרסול',
  };
  const FLAG_LABELS = {
    pregnant: 'הריון',
    breastfeeding: 'הנקה',
    eating_disorder_history: 'היסטוריה של הפרעת אכילה',
    cardiac_condition: 'מצב לבבי',
    uncontrolled_hypertension: 'לחץ דם לא מאוזן',
    diabetes: 'סוכרת',
    chest_pain_at_rest_or_exertion: 'כאב בחזה במנוחה או במאמץ',
    dizziness_or_fainting: 'סחרחורת או עילפון',
    unusual_shortness_of_breath: 'קוצר נשימה חריג',
    recent_surgery_3m: 'ניתוח בשלושת החודשים האחרונים',
    active_injury: 'פציעה פעילה',
    chronic_kidney_disease: 'מחלת כליות כרונית',
    medication_affecting_exercise: 'תרופות שמשפיעות על פעילות או תזונה',
  };
  const DIET_LABELS = {
    omnivore: 'אוכל הכל', vegetarian: 'צמחוני', vegan: 'טבעוני', pescatarian: 'פסקטריאני',
    kosher: 'כשר', halal: 'חלאל', gluten_free: 'בלי גלוטן', lactose_free: 'בלי לקטוז',
  };
  const ALLERGEN_LABELS = {
    milk: 'חלב', eggs: 'ביצים', peanuts: 'בוטנים', tree_nuts: 'אגוזים', sesame: 'שומשום',
    soy: 'סויה', wheat_gluten: 'חיטה/גלוטן', fish: 'דגים', shellfish: 'פירות ים',
  };

  function stepBody() {
    switch (step) {
      case 0: {
        const goals = chipGroup(opt(meta_goals(), GOAL_LABELS), {
          multi: false,
          selected: draft.primaryGoal ? [draft.primaryGoal] : [],
          onToggle: (v) => { draft.primaryGoal = v[0]; },
        });
        const secondary = chipGroup(opt(meta_goals(), GOAL_LABELS), {
          selected: draft.secondaryGoals ?? [],
          onToggle: (v) => { draft.secondaryGoals = v; },
        });
        const tw = numberInput({ value: draft.targetWeightKg ?? '', placeholder: 'לא חובה', min: 30, max: 300, step: 0.5,
          oninput: (e) => { draft.targetWeightKg = e.target.value || undefined; } });
        const weeks = numberInput({ value: draft.targetWeeks ?? '', placeholder: 'לא חובה', min: 1, max: 260,
          oninput: (e) => { draft.targetWeeks = e.target.value || undefined; } });
        return el('div', { class: 'stack' }, [
          card('יעד ראשי', [goals.node, el('p', { class: 'tiny muted', text: 'היעד הראשי קובע את מבנה התוכנית, הנפח והעצימות.' })]),
          card('יעדים משניים (אפשר לדלג)', [secondary.node]),
          card('משקל יעד וטווח זמן', [
            el('div', { class: 'stack stack--tight' }, [
              field('משקל יעד (ק"ג)', tw),
              field('בתוך כמה שבועות', weeks),
            ]),
            note('לא נבטיח תוצאה או מועד. אם הקצב שתבחרו לא מציאותי - נגיד זאת ונציע חלופה.', 'warn'),
          ]),
        ]);
      }
      case 1: {
        const age = numberInput({ value: draft.ageYears ?? '', min: 10, max: 100, required: true,
          oninput: (e) => { draft.ageYears = e.target.value; } });
        const height = numberInput({ value: draft.heightCm ?? '', min: 120, max: 230,
          oninput: (e) => { draft.heightCm = e.target.value; } });
        const weight = numberInput({ value: draft.weightKg ?? '', min: 30, max: 300, step: 0.1,
          oninput: (e) => { draft.weightKg = e.target.value; } });
        const sexSel = segmented(
          [
            { value: 'male', label: 'גבר' },
            { value: 'female', label: 'אישה' },
          ],
          { value: draft.sex, onSelect: (v) => { draft.sex = v; draft.sexSkipped = false; skipBox.checked = false; } },
        );
        const skipBox = el('input', { type: 'checkbox', checked: draft.sexSkipped === true,
          onchange: (e) => { draft.sexSkipped = e.target.checked; } });
        return el('div', { class: 'stack' }, [
          card('גיל, גובה ומשקל', [
            el('div', { class: 'stack stack--tight' }, [
              field('גיל', age),
              field('גובה (ס"מ)', height),
              field('משקל נוכחי (ק"ג)', weight),
            ]),
          ]),
          card('נתון לחישוב אנרגיה', [
            el('p', { class: 'tiny dim', text:
              'נוסחת אומדן האנרגיה שאנחנו משתמשים בה (מיפלין-סנט ג׳ור, 1990) מקבלת גיל, גובה, משקל ומין. ' +
              'לכן אנחנו שואלים את הנתון הזה - לא לשום שימוש אחר.' }),
            sexSel,
            el('label', { class: 'switch-row', style: 'margin-top:10px' }, [
              skipBox,
              el('span', { class: 'switch-row__text' }, [
                el('strong', { text: 'מעדיף לא לענות' }),
                'נחשב את שתי הגרסאות של הנוסחה ונציג טווח רחב יותר (±15% במקום ±10%). ' +
                  'כל שאר האפליקציה עובדת בדיוק אותו דבר.',
              ]),
            ]),
          ]),
          note(
            'גיל, גובה ומשקל לבדם אינם מספיקים לתוכנית מדויקת - הם נותנים נקודת פתיחה. ' +
              'הדיוק מגיע מההתאמות לאורך הזמן, לפי מה שתבצע בפועל.',
            'info',
          ),
        ]);
      }
      case 2: {
        const exp = chipGroup(opt(['beginner', 'novice', 'intermediate', 'advanced'], EXP_LABELS), {
          multi: false, selected: draft.experience ? [draft.experience] : [],
          onToggle: (v) => { draft.experience = v[0]; },
        });
        const act = chipGroup(opt(['sedentary', 'light', 'moderate', 'active', 'very_active'], ACT_LABELS), {
          multi: false, selected: draft.dailyActivity ? [draft.dailyActivity] : [],
          onToggle: (v) => { draft.dailyActivity = v[0]; },
        });
        const sessions = select(
          [1, 2, 3, 4, 5, 6].map((n) => ({ value: n, label: `${n} בשבוע`, selected: Number(draft.sessionsPerWeek) === n })),
          { onchange: (e) => { draft.sessionsPerWeek = Number(e.target.value); } },
        );
        const minutes = select(
          [20, 30, 40, 45, 60, 75, 90].map((n) => ({ value: n, label: `${n} דקות`, selected: Number(draft.minutesPerSession) === n })),
          { onchange: (e) => { draft.minutesPerSession = Number(e.target.value); } },
        );
        draft.sessionsPerWeek ??= 3;
        draft.minutesPerSession ??= 45;
        return el('div', { class: 'stack' }, [
          card('ניסיון באימוני התנגדות', [exp.node]),
          card('רמת פעילות ביום־יום', [act.node, el('p', { class: 'tiny muted', text: 'זה הקלט למקדם הפעילות באומדן האנרגיה.' })]),
          card('זמינות', [
            el('div', { class: 'stack stack--tight' }, [
              field('מספר אימונים', sessions),
              field('זמן פנוי לאימון', minutes),
            ]),
            note('עדיף להצהיר על מה שבאמת אפשרי. תוכנית של 3 אימונים שמתבצעת עדיפה על 5 שלא.', 'info'),
          ]),
        ]);
      }
      case 3: {
        const equipGroup = { current: null };
        const loc = chipGroup(opt(['home', 'gym', 'outdoor'], LOC_LABELS), {
          multi: false, selected: draft.location ? [draft.location] : [],
          onToggle: (v) => {
            draft.location = v[0];
            const defaults = meta.defaultEquipmentByLocation?.[v[0]] ?? [];
            draft.equipment = defaults;
            if (equipGroup.current) {
              const fresh = buildEquip();
              equipGroup.current.replaceWith(fresh);
              equipGroup.current = fresh;
            }
          },
        });
        function buildEquip() {
          const g = chipGroup(
            Object.entries(meta.labels.equipment).map(([v, l]) => ({ value: v, label: l })),
            { selected: draft.equipment ?? [], onToggle: (v) => { draft.equipment = v; } },
          );
          return g.node;
        }
        equipGroup.current = buildEquip();
        return el('div', { class: 'stack' }, [
          card('איפה מתאמנים', [loc.node]),
          card('ציוד זמין', [
            equipGroup.current,
            el('p', { class: 'tiny muted', text: 'בחירת מקום מסמנת ציוד ברירת מחדל - אפשר לשנות. התוכנית תיבנה רק ממה שמסומן.' }),
          ]),
        ]);
      }
      case 4: {
        draft.limitations ??= [];
        const limitHost = el('div', { class: 'stack stack--tight' });
        const renderLimits = () => {
          clear(limitHost);
          draft.limitations.forEach((lim, i) => {
            limitHost.append(
              el('div', { class: 'card card--flat row row--between' }, [
                el('div', {}, [
                  el('div', { text: JOINT_LABELS[lim.area] ?? lim.area, style: 'font-weight:650' }),
                  el('div', { class: 'tiny muted', text:
                    lim.severity === 'severe' ? 'חמורה - תרגילים שמעמיסים את האזור לא ייכללו'
                    : lim.severity === 'moderate' ? 'בינונית - עצימות מוגבלת והעדפה לחלופות'
                    : 'קלה - נשים דגש על טכניקה' }),
                ]),
                button('הסרה', { variant: 'ghost', size: 'sm', onClick: () => { draft.limitations.splice(i, 1); renderLimits(); } }),
              ]),
            );
          });
          if (draft.limitations.length === 0) limitHost.append(el('p', { class: 'tiny muted', text: 'לא הוספת מגבלות.' }));
        };
        renderLimits();

        const areaSel = select(Object.entries(JOINT_LABELS).map(([v, l]) => ({ value: v, label: l })));
        const sevSel = select([
          { value: 'mild', label: 'קלה' },
          { value: 'moderate', label: 'בינונית' },
          { value: 'severe', label: 'חמורה' },
        ]);
        const flags = chipGroup(Object.entries(FLAG_LABELS).map(([v, l]) => ({ value: v, label: l })), {
          selected: draft.healthFlags ?? [],
          onToggle: (v) => { draft.healthFlags = v; },
        });
        const meds = el('textarea', { placeholder: 'שדה רשות', value: draft.medicationsNote ?? '',
          oninput: (e) => { draft.medicationsNote = e.target.value; } });

        return el('div', { class: 'stack' }, [
          card('מצבים בריאותיים', [
            flags.node,
            note(
              'חלק מהסימונים יעצרו יצירת המלצות ויסבירו מה נדרש כדי להמשיך. זה לא עונש - זה המקום שבו ' +
                'צריך גורם מקצועי ולא אלגוריתם.',
              'warn',
            ),
          ]),
          card('פציעות ומגבלות תנועה', [
            limitHost,
            el('div', { class: 'row', style: 'margin-top:10px;gap:8px' }, [
              el('div', { class: 'grow' }, [areaSel]),
              el('div', { class: 'grow' }, [sevSel]),
              button('הוספה', { size: 'sm', onClick: () => {
                draft.limitations.push({ area: areaSel.value, severity: sevSel.value });
                renderLimits();
              } }),
            ]),
          ]),
          card('תרופות (רשות)', [
            el('p', { class: 'tiny dim', text:
              'אם יש תרופות שעשויות להשפיע על פעילות או על תזונה, כדאי שנדע כדי להציג אזהרות מתאימות. ' +
              'איננו נותנים הוראות לגבי תרופות ואיננו משנים מינון. אפשר לדלג.' }),
            meds,
          ]),
        ]);
      }
      case 5: {
        const t = (key, def) => el('input', { type: 'time', value: draft[key] ?? def,
          oninput: (e) => { draft[key] = e.target.value; } });
        draft.wakeTime ??= '07:00';
        draft.sleepTime ??= '23:00';
        return el('div', { class: 'stack' }, [
          card('שעות', [
            el('div', { class: 'stack stack--tight' }, [
              field('שעת קימה', t('wakeTime', '07:00')),
              field('שעת שינה', t('sleepTime', '23:00')),
              field('תחילת עבודה (רשות)', t('workStart', '')),
              field('סוף עבודה (רשות)', t('workEnd', '')),
              field('שעת אימון מועדפת (רשות)', t('preferredTrainingTime', '')),
            ]),
          ]),
          note('השעות ישמשו להצעת זמני ארוחות. הן הצעה גמישה - אין שעה שהיא תנאי לירידה במשקל או לבניית שריר.', 'info'),
        ]);
      }
      case 6: {
        const diets = chipGroup(Object.entries(DIET_LABELS).map(([v, l]) => ({ value: v, label: l })), {
          selected: draft.dietPatterns ?? [],
          onToggle: (v) => { draft.dietPatterns = v; },
        });
        const allergens = chipGroup(Object.entries(ALLERGEN_LABELS).map(([v, l]) => ({ value: v, label: l })), {
          selected: draft.allergens ?? [],
          onToggle: (v) => { draft.allergens = v; },
        });
        draft.mealsPerDay ??= 3;
        draft.prepMinutesPerDay ??= 30;
        draft.budgetLevel ??= 'medium';
        return el('div', { class: 'stack' }, [
          card('העדפות תזונה', [diets.node]),
          card('אלרגיות ורגישויות', [
            allergens.node,
            note('מה שתסמנו כאן יסונן לחלוטין מהתפריט ומרשימת הקניות. עדיין חובה לקרוא תוויות על מוצרים מעובדים.', 'warn'),
          ]),
          card('מסגרת מעשית', [
            el('div', { class: 'stack stack--tight' }, [
              field('מספר ארוחות ביום', select([2, 3, 4, 5].map((n) => ({ value: n, label: String(n), selected: draft.mealsPerDay === n })),
                { onchange: (e) => { draft.mealsPerDay = Number(e.target.value); } })),
              field('זמן הכנה ביום (דקות)', select([10, 20, 30, 45, 60, 90].map((n) => ({ value: n, label: String(n), selected: draft.prepMinutesPerDay === n })),
                { onchange: (e) => { draft.prepMinutesPerDay = Number(e.target.value); } })),
              field('תקציב מזון', segmented([
                { value: 'low', label: 'חסכוני' },
                { value: 'medium', label: 'בינוני' },
                { value: 'high', label: 'גבוה' },
              ], { value: draft.budgetLevel, onSelect: (v) => { draft.budgetLevel = v; } })),
            ]),
          ]),
        ]);
      }
      default: {
        const missing = [];
        if (!draft.primaryGoal) missing.push('יעד ראשי');
        if (!draft.ageYears) missing.push('גיל');
        if (!draft.heightCm) missing.push('גובה');
        if (!draft.weightKg) missing.push('משקל');
        if (!draft.experience) missing.push('ניסיון');
        if (!draft.dailyActivity) missing.push('רמת פעילות');
        if (!draft.location) missing.push('מקום אימון');
        if (!draft.sex && !draft.sexSkipped) missing.push('נתון לחישוב אנרגיה (או סימון דילוג)');
        return el('div', { class: 'stack' }, [
          missing.length > 0
            ? noteList(missing, 'warn', 'חסרים שדות חובה:')
            : note('הכל מוכן. נבנה עכשיו תוכנית לפי מה שמסרת, ונציג גם מה הופעל ומדוע.', 'teal'),
          card('מה שמסרת', [
            el('dl', { class: 'kv' }, [
              el('dt', { text: 'יעד' }), el('dd', { text: GOAL_LABELS[draft.primaryGoal] ?? '—' }),
              el('dt', { text: 'ניסיון' }), el('dd', { text: EXP_LABELS[draft.experience] ?? '—' }),
              el('dt', { text: 'זמינות' }), el('dd', { text: `${draft.sessionsPerWeek ?? '—'} אימונים × ${draft.minutesPerSession ?? '—'} דקות` }),
              el('dt', { text: 'מקום' }), el('dd', { text: LOC_LABELS[draft.location] ?? '—' }),
              el('dt', { text: 'ציוד' }), el('dd', { text: (draft.equipment ?? []).map((e2) => meta.labels.equipment[e2] ?? e2).join(', ') || 'משקל גוף' }),
              el('dt', { text: 'מגבלות' }), el('dd', { text: (draft.limitations ?? []).map((l) => JOINT_LABELS[l.area]).join(', ') || 'אין' }),
              el('dt', { text: 'תזונה' }), el('dd', { text: (draft.dietPatterns ?? []).map((d) => DIET_LABELS[d]).join(', ') || 'ללא הגבלות' }),
            ]),
          ]),
        ]);
      }
    }
  }

  function meta_goals() {
    return ['weight_loss', 'fat_loss_recomp', 'muscle_gain', 'strength', 'endurance', 'maintain'];
  }

  async function finish() {
    try {
      const payload = { ...draft };
      payload.sexSkipped = draft.sexSkipped === true;
      if (!payload.sexSkipped && !payload.sex) {
        toast('צריך לבחור נתון לחישוב אנרגיה, או לסמן שמעדיפים לא לענות.', 'error');
        step = 1;
        render();
        return;
      }
      if (payload.sexSkipped) payload.sex = 'unspecified';
      const result = await api.post('/api/profile', payload);
      state.profile = result.profile;
      state.safety = result.safety;

      if (!result.safety.allowTrainingPlan) {
        showSafetyStop(result.safety, result.realism);
        return;
      }
      if (!result.realism.realistic) {
        sheet('לגבי היעד שהגדרת', [
          note(result.realism.messageHe, 'warn'),
          button('הבנתי, נמשיך', { variant: 'primary', block: true, onClick: async () => {
            document.querySelector('.sheet-backdrop')?.remove();
            document.body.style.overflow = '';
            await generate();
          } }),
        ]);
        return;
      }
      await generate();
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  async function generate() {
    try {
      toast('בונה תוכנית...');
      await api.post('/api/plan/generate');
      await refreshMe();
      ctx.navigate('/');
    } catch (err) {
      if (err instanceof ApiError && err.status === 409 && err.details?.safety) {
        showSafetyStop(err.details.safety);
        return;
      }
      toast(err.message, 'error');
    }
  }

  function showSafetyStop(safety, realism) {
    clear(host);
    mount(host, 
      el('h1', { text: 'כאן אנחנו עוצרים' }),
      noteList(safety.messagesHe, 'danger', 'מה שסימנת מחייב הערכה מקצועית:'),
      card('מה אפשר לעשות עכשיו', [
        el('ul', {}, [
          el('li', { text: 'לעבור על ספריית התרגילים ולקרוא הוראות ביצוע ודגשי בטיחות.' }),
          el('li', { text: 'לתעד מדידות והרגשה, כדי שיהיה מה להראות לגורם המטפל.' }),
          el('li', { text: 'לחזור לכאן אחרי שיש אישור או הנחיות, ולעדכן את השאלון.' }),
        ]),
      ]),
      el('div', { class: 'btn-row' }, [
        button('לספריית התרגילים', { variant: 'primary', onClick: () => ctx.navigate('/library') }),
        button('עריכת השאלון', { variant: 'ghost', onClick: () => { step = 4; render(); } }),
      ]),
      realism && !realism.realistic ? note(realism.messageHe, 'warn') : null,
    );
  }

  render();
  return host;
}

// =============================== דשבורד ===============================

export async function renderDashboard(ctx) {
  const [{ plan }, profileData] = await Promise.all([loadActivePlan(), loadProfile()]);
  const sent = await flushQueue().catch(() => 0);
  if (sent > 0) toast(`${sent} סטים שנשמרו מקומית נשלחו לשרת.`, 'ok');

  const wrap = el('div', { class: 'stack' });

  if (!profileData.profile) {
    mount(wrap, 
      note('עוד לא השלמת את השאלון. בלי זה אין על מה לבנות תוכנית.', 'warn'),
      button('למילוי השאלון', { variant: 'primary', block: true, size: 'lg', onClick: () => ctx.navigate('/questionnaire') }),
    );
    return wrap;
  }

  const safety = profileData.safety;

  if (!plan) {
    mount(wrap, 
      !safety.allowTrainingPlan
        ? noteList(safety.messagesHe, 'danger', 'לא נוצרה תוכנית אימונים:')
        : note('אין עוד תוכנית פעילה.', 'info'),
      safety.allowTrainingPlan
        ? button('בניית תוכנית', { variant: 'primary', block: true, size: 'lg', onClick: async () => {
            try {
              await api.post('/api/plan/generate');
              toast('התוכנית נבנתה.', 'ok');
              ctx.navigate('/');
            } catch (err) { toast(err.message, 'error'); }
          } })
        : button('לספריית התרגילים', { variant: 'ghost', block: true, onClick: () => ctx.navigate('/library') }),
    );
    return wrap;
  }

  // האימון הבא: היום, או הקרוב ביותר אחרי היום
  const today = new Date().getDay();
  const upcoming = [...plan.workouts].sort((a, b) => {
    const da = (a.dayIndex - today + 7) % 7;
    const db = (b.dayIndex - today + 7) % 7;
    return da - db;
  })[0];
  const isToday = upcoming.dayIndex === today;

  const open = await api.get('/api/workout/open').catch(() => ({ session: null }));

  mount(wrap, 
    el('div', { class: 'hero' }, [
      el('div', { class: 'hero__eyebrow', text: isToday ? 'האימון של היום' : `האימון הבא - יום ${DAY_NAMES[upcoming.dayIndex]}` }),
      el('div', { class: 'hero__title', text: upcoming.titleHe }),
      el('div', { class: 'hero__meta' }, [
        el('span', { text: `≈ ${upcoming.estimatedMinutes} דקות` }),
        el('span', { text: `${mainCount(upcoming)} תרגילים` }),
        el('span', { text: `גרסת תוכנית ${plan.version}` }),
      ]),
      el('div', { style: 'margin-top:14px' }, [
        button(open.session ? 'המשך האימון שנשמר' : 'התחלת האימון', {
          variant: 'teal', size: 'lg', block: true,
          onClick: () => ctx.navigate(`/workout/${upcoming.dayIndex}`),
        }),
      ]),
    ]),
  );

  if (pendingCount() > 0) {
    mount(wrap, note(`${pendingCount()} סטים ממתינים לשליחה (נשמרו מקומית בזמן שלא הייתה רשת). הם יישלחו אוטומטית.`, 'warn'));
  }

  if (safety.messagesHe?.length) {
    mount(wrap, accordion('הנחיות בטיחות שחלות עליך', [el('ul', {}, safety.messagesHe.map((m) => el('li', { text: m })))], badge('חשוב', 'warn')));
  }

  // תזונה של היום
  const nutrition = await api.get('/api/nutrition').catch(() => ({ plan: null }));
  if (nutrition.plan && !nutrition.plan.blocked) {
    const day = nutrition.plan.days[new Date().getDay() % nutrition.plan.days.length];
    mount(wrap, 
      card({ title: 'הארוחות של היום', aside: badge(`${day.totals.kcal} קק"ל`) }, [
        el('div', { class: 'list' }, day.meals.map(({ meal, timing }) =>
          listItem({
            title: `${meal.nameHe} · ${timing.suggestedTime}`,
            sub: meal.components.map((c) => c.householdHe ?? `${c.grams} גרם`).join(' · '),
            onClick: () => ctx.navigate('/nutrition'),
          }),
        )),
        el('p', { class: 'tiny muted', text: 'השעות הן הצעה גמישה ולא תנאי להצלחה.' }),
      ]),
    );
  } else if (nutrition.plan?.blocked) {
    mount(wrap, noteList(nutrition.plan.blockedReasonsHe, 'warn', 'תוכנית התזונה לא נבנתה:'));
  }

  // התמדה
  const progress = await api.get('/api/progress').catch(() => null);
  if (progress) {
    mount(wrap, 
      card('התמדה בארבעה השבועות האחרונים', [
        el('div', { class: 'row', style: 'gap:18px' }, [
          ring(progress.adherence.percent ?? 0, `${progress.adherence.percent ?? 0}%`, 'מהתוכנית'),
          el('div', { class: 'grow stack stack--tight' }, [
            el('div', { text: `${progress.adherence.completedLast4Weeks} אימונים הושלמו מתוך ${progress.adherence.plannedLast4Weeks} מתוכננים` }),
            el('p', { class: 'tiny muted', text: progress.adherence.noteHe }),
          ]),
        ]),
      ]),
    );
  }

  mount(wrap, 
    el('div', { class: 'btn-row' }, [
      button('לוח אימונים שבועי', { variant: 'ghost', onClick: () => ctx.navigate('/week') }),
      button('מעקב התקדמות', { variant: 'ghost', onClick: () => ctx.navigate('/progress') }),
    ]),
  );
  return wrap;
}

function mainCount(workout) {
  return workout.blocks.filter((b) => b.kind === 'main').reduce((n, b) => n + b.exercises.length, 0);
}

// ============================ לוח שבועי ============================

export async function renderWeek(ctx) {
  const { plan } = await loadActivePlan();
  const wrap = el('div', { class: 'stack' });
  if (!plan) {
    mount(wrap, note('אין תוכנית פעילה.', 'warn'));
    return wrap;
  }
  const byDay = new Map(plan.workouts.map((w) => [w.dayIndex, w]));

  mount(wrap, 
    card({ title: `תוכנית - גרסה ${plan.version}`, aside: badge(plan.rationale.split) }, [
      el('p', { class: 'card__body', text: plan.rationale.summaryHe }),
      el('div', { class: 'stats', style: 'margin-top:12px' }, [
        stat(plan.workouts.length, 'אימונים בשבוע'),
        stat(plan.weeklyAerobicMinutesPrescribed, 'דקות אירובי כרגע'),
        stat(plan.weeklyAerobicMinutesTarget, 'יעד אירובי'),
      ]),
      progressBar((plan.weeklyAerobicMinutesPrescribed / plan.weeklyAerobicMinutesTarget) * 100, true),
      el('p', { class: 'tiny muted', text: 'יעד הפעילות השבועי הוא יעד להתקדמות, לא דרישת פתיחה.' }),
    ]),
  );

  const week = el('div', { class: 'week' });
  for (let d = 0; d < 7; d++) {
    const w = byDay.get(d);
    if (!w) {
      week.append(el('div', { class: 'day day--rest' }, [
        el('div', { class: 'day__badge', text: DAY_NAMES[d].slice(0, 2) }),
        el('div', { class: 'grow' }, [
          el('div', { text: `יום ${DAY_NAMES[d]}` }),
          el('div', { class: 'tiny muted', text: 'מנוחה או פעילות קלה - הליכה נחשבת' }),
        ]),
      ]));
      continue;
    }
    week.append(el('div', { class: 'day' }, [
      el('div', { class: 'day__badge', text: DAY_NAMES[d].slice(0, 2) }),
      el('div', { class: 'grow' }, [
        el('div', { text: w.titleHe, style: 'font-weight:650' }),
        el('div', { class: 'tiny muted', text: `${mainCount(w)} תרגילים · ≈${w.estimatedMinutes} דקות` }),
      ]),
      button('פתיחה', { size: 'sm', onClick: () => ctx.navigate(`/workout/${d}`) }),
    ]));
  }
  mount(wrap, week);

  if (plan.notesHe?.length) {
    mount(wrap, accordion('הערות לתוכנית', [el('ul', {}, plan.notesHe.map((n2) => el('li', { text: n2 })))]));
  }
  if (state.planRules?.length) {
    mount(wrap, 
      accordion(
        'הכללים שהופעלו והמקורות שלהם',
        state.planRules.map((r) =>
          el('div', { style: 'margin-bottom:12px' }, [
            el('div', { class: 'row', style: 'gap:6px' }, [
              el('strong', { text: r.rule.titleHe }),
              r.approved ? badge('מקור מתועד', 'teal') : badge('ממתין לביקורת', 'warn'),
            ]),
            el('p', { class: 'tiny', text: r.rule.statementHe }),
            ...r.sources.map((s) => el('p', { class: 'tiny muted', text: s.citation })),
            r.rule.reviewNoteHe ? el('p', { class: 'tiny muted', text: `הערה: ${r.rule.reviewNoteHe}` }) : null,
          ]),
        ),
        badge(`${state.planRules.length}`),
      ),
    );
  }
  return wrap;
}

// ============================ אימון פעיל ============================

export async function renderWorkout(ctx, dayIndex) {
  const started = await api.post('/api/workout/start', { dayIndex: Number(dayIndex) });
  const session = started.session;
  const workout = started.workout;
  await loadActivePlan();

  const wrap = el('div', { class: 'stack' });
  if (started.resumed) {
    mount(wrap, note('חזרנו לאימון שנשמר. כל מה שהוזן קודם נשמר.', 'teal'));
  }

  // --- טיימר מנוחה ---
  let timerId = null;
  let remaining = 0;
  const timerValue = el('div', { class: 'timer__value', text: '00:00' });
  const timerBox = el('div', { class: 'timer' }, [
    timerValue,
    el('div', { class: 'tiny muted', text: 'טיימר מנוחה' }),
    el('div', { class: 'btn-row', style: 'margin-top:8px;width:100%' }, [
      button('-15', { size: 'sm', variant: 'ghost', onClick: () => setTimer(remaining - 15) }),
      button('עצור', { size: 'sm', variant: 'ghost', onClick: () => stopTimer() }),
      button('+15', { size: 'sm', variant: 'ghost', onClick: () => setTimer(remaining + 15) }),
    ]),
  ]);
  function tick() {
    remaining--;
    timerValue.textContent = fmtTime(remaining);
    if (remaining <= 0) {
      stopTimer();
      timerValue.textContent = 'סיום';
      if (navigator.vibrate) navigator.vibrate([120, 60, 120]);
      toast('זמן המנוחה נגמר - אפשר להתחיל את הסט הבא.', 'ok');
    }
  }
  function setTimer(seconds) {
    remaining = Math.max(0, seconds);
    timerValue.textContent = fmtTime(remaining);
    if (remaining > 0 && !timerId) {
      timerId = setInterval(tick, 1000);
      timerBox.classList.add('timer--active');
    }
  }
  function stopTimer() {
    if (timerId) clearInterval(timerId);
    timerId = null;
    timerBox.classList.remove('timer--active');
  }
  ctx.onLeave(() => stopTimer());

  // --- כותרת דביקה ---
  const progressText = el('div', { class: 'tiny muted' });
  const head = el('div', { class: 'workout-head' }, [
    el('div', { class: 'row row--between' }, [
      el('div', {}, [el('strong', { text: workout.titleHe }), progressText]),
      el('div', { class: 'row', style: 'gap:6px' }, [
        button('השהיה', { size: 'sm', variant: 'ghost', onClick: async () => {
          await api.post(`/api/workout/${session.id}/pause`, {});
          toast('האימון הושהה ונשמר. אפשר לחזור אליו מתי שתרצו.', 'ok');
          ctx.navigate('/');
        } }),
        button('כאב?', { size: 'sm', variant: 'danger', onClick: openSymptomSheet }),
      ]),
    ]),
  ]);
  mount(wrap, head);

  const doneSets = new Map();
  const totalPlannedSets = workout.blocks
    .filter((b) => b.kind === 'main')
    .reduce((n, b) => n + b.exercises.reduce((m, e2) => m + e2.prescription.sets, 0), 0);
  const updateProgress = () => {
    const done = [...doneSets.values()].reduce((n, s) => n + s.size, 0);
    progressText.textContent = `${done} מתוך ${totalPlannedSets} סטים בחלק העיקרי`;
  };
  updateProgress();

  // --- בלוקים ---
  for (const [bi, block] of workout.blocks.entries()) {
    if (block.exercises.length === 0) continue;
    const blockNode = el('div', { class: 'stack stack--tight' }, [
      el('div', { class: 'row row--between' }, [
        el('h2', { text: block.titleHe }),
        badge(block.kind === 'main' ? 'חלק עיקרי' : block.kind === 'warmup' ? 'חימום' : block.kind === 'conditioning' ? 'אירובי' : 'סיום'),
      ]),
    ]);

    for (const [ei, pe] of block.exercises.entries()) {
      blockNode.append(exerciseCard(pe, bi, ei, block.kind));
    }
    mount(wrap, blockNode);
  }

  mount(wrap, 
    timerBox,
    button('סיום אימון', { variant: 'primary', size: 'lg', block: true, onClick: completeWorkout }),
  );

  function exerciseCard(pe, blockIndex, exerciseIndex, blockKind) {
    const ex = state.exercises.get(pe.exerciseId);
    const name = ex?.nameHe ?? pe.exerciseId;
    const p = pe.prescription;
    const setsHost = el('div', { class: 'stack stack--tight' });
    const key = pe.exerciseId;
    doneSets.set(key, doneSets.get(key) ?? new Set());

    const prescriptionLine = p.repRange
      ? `${p.sets} סטים × ${p.repRange[0]}-${p.repRange[1]} חזרות · מנוחה ${p.restSec} שנ׳`
      : `${p.sets} סטים × ${p.durationSec} שנ׳ · מנוחה ${p.restSec} שנ׳`;

    if (blockKind === 'main') {
      setsHost.append(
        el('div', { class: 'set-grid' }, [
          el('div', { class: 'set-grid__head', text: '#' }),
          el('div', { class: 'set-grid__head', text: p.repRange ? 'ק"ג' : 'שנ׳' }),
          el('div', { class: 'set-grid__head', text: p.repRange ? 'חזרות' : 'הערה' }),
          el('div', { class: 'set-grid__head', text: 'RPE' }),
          el('div', { class: 'set-grid__head', text: '✓' }),
        ]),
      );
      for (let s = 1; s <= p.sets; s++) {
        const weight = numberInput({ placeholder: '—', step: 0.5, min: 0, 'aria-label': `משקל סט ${s}` });
        const reps = numberInput({ placeholder: p.repRange ? String(p.repRange[0]) : String(p.durationSec ?? ''), min: 0, 'aria-label': `חזרות סט ${s}` });
        const rpe = numberInput({ placeholder: String(p.intensity.rpe?.[1] ?? ''), min: 1, max: 10, 'aria-label': `תחושת מאמץ סט ${s}` });
        const ok = el('button', { type: 'button', class: 'set-grid__ok', text: '✓', 'aria-label': `שמירת סט ${s}`,
          onclick: async () => {
            try {
              await saveSet(session.id, {
                exerciseId: pe.exerciseId,
                setNumber: s,
                weightKg: weight.value ? Number(weight.value) : undefined,
                reps: reps.value ? Number(reps.value) : undefined,
                rpe: rpe.value ? Number(rpe.value) : undefined,
              });
              ok.classList.add('is-done');
              doneSets.get(key).add(s);
              updateProgress();
              if (s < p.sets) setTimer(p.restSec);
              await api.post(`/api/workout/${session.id}/cursor`, { blockIndex, exerciseIndex, setNumber: Math.min(s + 1, p.sets) }).catch(() => {});
            } catch (err) {
              ok.classList.add('is-done');
              doneSets.get(key).add(s);
              updateProgress();
              toast('אין רשת כרגע - הסט נשמר במכשיר ויישלח אוטומטית כשהחיבור יחזור.', 'error');
            }
          } });
        setsHost.append(el('div', { class: 'set-grid' }, [
          el('div', { class: 'set-grid__head', text: String(s) }),
          weight, reps, rpe, ok,
        ]));
      }
    }

    const mediaBlock = ex
      ? ex.mediaReady
        ? el('div', { class: 'note note--teal' }, [el('div', { text: 'סרטון הדגמה זמין במסך התרגיל.' })])
        : el('p', { class: 'tiny muted', text: ex.mediaFallbackHe ?? '' })
      : null;

    return card({ title: name, aside: badge(prescriptionLine) }, [
      el('p', { class: 'tiny dim', text: p.intensity.explanationHe }),
      pe.noteHe ? note(pe.noteHe, 'warn') : null,
      setsHost,
      accordion('איך מבצעים', [
        ex ? el('ol', {}, ex.stepsHe.map((s2) => el('li', { text: s2 }))) : null,
        ex ? el('p', { class: 'tiny', text: `נשימה: ${ex.breathingHe}` }) : null,
        ex && ex.commonMistakesHe.length ? el('p', { class: 'tiny muted', text: 'טעויות נפוצות: ' + ex.commonMistakesHe.join(' ') }) : null,
        el('p', { class: 'tiny muted', text: p.startingLoadGuidanceHe }),
        mediaBlock,
      ]),
      el('div', { class: 'btn-row' }, [
        button('החלפת תרגיל', { size: 'sm', variant: 'ghost', onClick: () => openSubstitutes(pe.exerciseId) }),
        button('דילוג', { size: 'sm', variant: 'ghost', onClick: async () => {
          await api.post(`/api/workout/${session.id}/skip`, { exerciseId: pe.exerciseId });
          toast('סומן כמדולג.', 'ok');
        } }),
      ]),
    ]);
  }

  async function openSubstitutes(exerciseId) {
    try {
      const data = await api.get(`/api/workout/${session.id}/substitutes/${exerciseId}`);
      const { close } = sheet('חלופות לתרגיל', [
        note(data.noteHe, 'info'),
        el('div', { class: 'list' }, data.substitutes.map((s) =>
          listItem({
            title: s.exercise.nameHe,
            sub: s.reasonHe,
            onClick: async () => {
              await api.post(`/api/workout/${session.id}/substitute`, { exerciseId, newExerciseId: s.exercise.id });
              close();
              toast(`הוחלף ל${s.exercise.nameHe}. רענן את המסך כדי לראות את ההנחיות החדשות.`, 'ok');
            },
          }),
        )),
      ]);
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  function openSymptomSheet() {
    const options = [
      { value: 'chest_pain', label: 'כאב בחזה' },
      { value: 'dizziness', label: 'סחרחורת או עילפון' },
      { value: 'shortness_of_breath', label: 'קוצר נשימה חריג' },
      { value: 'joint_pain', label: 'כאב במפרק או בשריר' },
      { value: 'other_discomfort', label: 'אי־נוחות אחרת' },
    ];
    const { close } = sheet('מה אתה מרגיש?', [
      note('אם זה כאב בחזה, סחרחורת או קוצר נשימה חריג - עצור את האימון עכשיו ואל תחכה לאפליקציה.', 'danger'),
      el('div', { class: 'list' }, options.map((o) =>
        listItem({
          title: o.label,
          onClick: async () => {
            try {
              const res = await api.post(`/api/workout/${session.id}/symptom`, { symptom: o.value });
              close();
              if (res.stop) {
                sheet('הפסק את האימון', [
                  note(res.messageHe, 'danger'),
                  button('הבנתי', { variant: 'primary', block: true, onClick: () => ctx.navigate('/') }),
                ]);
              } else {
                toast(res.messageHe, 'error');
              }
            } catch (err) { toast(err.message, 'error'); }
          },
        }),
      )),
    ]);
  }

  async function completeWorkout() {
    try {
      stopTimer();
      const rpeInput = numberInput({ min: 1, max: 10, placeholder: '1-10' });
      const { close } = sheet('סיום אימון', [
        field('איך הרגיש האימון בסך הכל? (RPE)', rpeInput, '1 = קל מאוד, 10 = לא היה אפשר יותר.'),
        button('שמירה וסיום', { variant: 'primary', block: true, onClick: async () => {
          const result = await api.post(`/api/workout/${session.id}/complete`, {
            sessionRpe: rpeInput.value ? Number(rpeInput.value) : undefined,
          });
          close();
          showSummary(result);
        } }),
      ]);
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  function showSummary(result) {
    const s = result.summary;
    sheet('סיכום האימון', [
      el('div', { class: 'stats' }, [
        stat(s.totalSets, 'סטים'),
        stat(s.totalVolumeKg || '—', 'נפח (ק"ג)'),
        stat(`${s.durationMinutes}`, 'דקות'),
      ]),
      note(s.comparisonHe, s.painReported ? 'warn' : 'teal'),
      result.progression.length > 0
        ? card('מה מוצע לאימון הבא', result.progression.map((p) =>
            el('div', { style: 'margin-bottom:10px' }, [
              el('div', { class: 'row', style: 'gap:6px' }, [
                el('strong', { text: state.exercises.get(p.exerciseId)?.nameHe ?? p.exerciseId }),
                badge(
                  p.action === 'increase_load' ? 'העלאת עומס'
                  : p.action === 'reduce_load' ? 'הורדת עומס'
                  : p.action === 'reassess' ? 'הערכה מחדש'
                  : p.action === 'stop_and_refer' ? 'עצירה' : 'שמירה על העומס',
                  p.action === 'increase_load' ? 'teal' : p.action === 'hold' ? '' : 'warn',
                ),
              ]),
              el('p', { class: 'tiny', text: p.messageHe }),
            ]),
          ))
        : null,
      button('חזרה לדשבורד', { variant: 'primary', block: true, onClick: () => ctx.navigate('/') }),
    ]);
  }

  return wrap;
}
