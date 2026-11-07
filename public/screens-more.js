// מסכים נוספים: ספריית תרגילים, תזונה, מעקב, פרופיל והגדרות, פאנל ניהול.
import { api, state, loadMeta, refreshMe, loadActivePlan } from './api.js';
import {
  el, mount, card, note, noteList, field, input, numberInput, select, chipGroup, segmented, button,
  stat, badge, ring, progressBar, accordion, listItem, toast, sheet, lineChart, barChart,
  DAY_NAMES, fmtDate, clear,
} from './ui.js';

// =========================== ספריית תרגילים ===========================

export async function renderLibrary(ctx) {
  const meta = await loadMeta();
  const wrap = el('div', { class: 'stack' });
  const results = el('div', { class: 'list' });
  const filters = { search: '', pattern: '', muscle: '', difficulty: '', equipment: [] };

  const searchBox = input({ type: 'text', placeholder: 'חיפוש תרגיל בעברית או באנגלית', oninput: (e) => {
    filters.search = e.target.value;
    debounceLoad();
  } });

  const patternSel = select(
    [{ value: '', label: 'כל דפוסי התנועה' }, ...Object.entries(meta.labels.patterns).map(([v, l]) => ({ value: v, label: l }))],
    { onchange: (e) => { filters.pattern = e.target.value; load(); } },
  );
  const muscleSel = select(
    [{ value: '', label: 'כל השרירים' }, ...Object.entries(meta.labels.muscles).map(([v, l]) => ({ value: v, label: l }))],
    { onchange: (e) => { filters.muscle = e.target.value; load(); } },
  );
  const diffSeg = segmented(
    [
      { value: '', label: 'הכל' },
      { value: 'easy', label: 'קל' },
      { value: 'moderate', label: 'בינוני' },
      { value: 'hard', label: 'מתקדם' },
    ],
    { value: '', onSelect: (v) => { filters.difficulty = v; load(); } },
  );
  const equipChips = chipGroup(
    Object.entries(meta.labels.equipment).map(([v, l]) => ({ value: v, label: l })),
    { onToggle: (v) => { filters.equipment = v; load(); } },
  );

  let timer = null;
  const debounceLoad = () => {
    clearTimeout(timer);
    timer = setTimeout(load, 250);
  };

  async function load() {
    const q = new URLSearchParams();
    if (filters.search) q.set('search', filters.search);
    if (filters.pattern) q.set('pattern', filters.pattern);
    if (filters.muscle) q.set('muscle', filters.muscle);
    if (filters.difficulty) q.set('difficulty', filters.difficulty);
    if (filters.equipment.length) q.set('equipment', filters.equipment.join(','));
    const data = await api.get(`/api/exercises?${q.toString()}`);
    for (const ex of data.exercises) state.exercises.set(ex.id, ex);
    clear(results);
    if (data.exercises.length === 0) {
      results.append(note('אין תרגילים שעונים על הסינון. נסו להוריד מסנן אחד.', 'info'));
      return;
    }
    for (const ex of data.exercises) {
      results.append(
        listItem({
          title: ex.nameHe,
          sub: `${meta.labels.patterns[ex.pattern]} · ${ex.primaryMuscles.map((m) => meta.labels.muscles[m]).join(', ')} · ${meta.labels.difficulty[ex.difficulty]}`,
          onClick: () => openExercise(ex.id),
          aside: ex.mediaReady ? badge('סרטון', 'teal') : badge('הוראות כתובות'),
        }),
      );
    }
  }

  async function openExercise(id) {
    const { exercise: ex } = await api.get(`/api/exercises/${id}`);
    const body = [
      el('div', { class: 'row row--wrap', style: 'gap:6px' }, [
        badge(meta.labels.patterns[ex.pattern]),
        badge(meta.labels.difficulty[ex.difficulty]),
        ...ex.equipment.map((eq) => badge(meta.labels.equipment[eq] ?? eq)),
        ex.professionallyReviewed ? badge('עבר ביקורת מקצועית', 'teal') : badge('ממתין לביקורת מקצועית', 'warn'),
      ]),
      el('p', { class: 'tiny muted', text: `שם באנגלית: ${ex.nameEn}` }),
    ];

    if (ex.mediaReady && ex.media?.url) {
      const video = el('video', {
        src: ex.media.url, controls: true, playsinline: true, preload: 'metadata',
        style: 'width:100%;border-radius:16px;background:#000',
      });
      video.addEventListener('error', () => {
        video.replaceWith(note(
          'הסרטון לא נטען. ההוראות הכתובות למטה הן המקור המלא לביצוע התרגיל.', 'warn',
        ));
      });
      body.push(video, el('p', { class: 'tiny muted', text:
        `מקור: ${ex.media.source} · בעלים: ${ex.media.owner} · רישיון: ${ex.media.license}` }));
    } else {
      body.push(note(ex.mediaFallbackHe ?? 'אין סרטון מאומת לתרגיל הזה.', 'warn'));
    }

    body.push(
      card('ביצוע', [el('ol', {}, ex.stepsHe.map((s) => el('li', { text: s })))]),
      card('נשימה', [el('p', { text: ex.breathingHe })]),
      card('טעויות נפוצות', [el('ul', {}, ex.commonMistakesHe.map((s) => el('li', { text: s })))]),
      ex.safetyNotesHe.length ? noteList(ex.safetyNotesHe, 'warn', 'דגשי בטיחות:') : null,
    );
    if (ex.easierVariant) {
      body.push(card(`גרסה קלה: ${ex.easierVariant.nameHe}`, [el('p', { text: ex.easierVariant.howItDiffersHe })]));
    }
    if (ex.harderVariant) {
      body.push(card(`גרסה מתקדמת: ${ex.harderVariant.nameHe}`, [el('p', { text: ex.harderVariant.howItDiffersHe })]));
    }
    if (!ex.professionallyReviewed && ex.reviewNote) {
      body.push(note(ex.reviewNote, 'warn', 'סטטוס תוכן:'));
    }
    sheet(ex.nameHe, body.filter(Boolean));
  }

  mount(wrap, 
    card('סינון', [
      el('div', { class: 'stack stack--tight' }, [
        searchBox,
        patternSel,
        muscleSel,
        diffSeg,
        accordion('סינון לפי ציוד', [equipChips.node]),
      ]),
    ]),
    el('div', { class: 'row row--between' }, [
      el('h2', { text: 'תרגילים' }),
      badge(`${meta.libraryStats.total} בספרייה`),
    ]),
    results,
    note(
      `${meta.libraryStats.withoutMedia} מתוך ${meta.libraryStats.total} התרגילים מוצגים כרגע בהוראות כתובות בלבד. ` +
        'סרטון מתווסף רק כשיש נכס שמותר להטמיע, עם מקור ורישיון מתועדים, ואחרי בדיקה שהוא תואם לגרסת התרגיל.',
      'info',
    ),
  );
  await load();
  return wrap;
}

// ================================ תזונה ================================

export async function renderNutrition(ctx) {
  const wrap = el('div', { class: 'stack' });
  let data = await api.get('/api/nutrition');

  if (!data.plan) {
    mount(wrap, 
      note('עוד לא נבנתה תוכנית תזונה.', 'info'),
      button('בניית תוכנית תזונה', { variant: 'primary', block: true, size: 'lg', onClick: async () => {
        try {
          await api.post('/api/nutrition/generate');
          ctx.navigate('/nutrition');
        } catch (err) { toast(err.message, 'error'); }
      } }),
    );
    return wrap;
  }

  const plan = data.plan;

  if (plan.blocked) {
    mount(wrap, 
      noteList(plan.blockedReasonsHe, 'danger', 'לא נבנתה תוכנית תזונה:'),
      card('מה כן אפשר', [
        el('ul', {}, [
          el('li', { text: 'להמשיך באימונים לפי התוכנית.' }),
          el('li', { text: 'לעקוב אחרי ביצועים ואחרי ההרגשה, בלי יעדי קלוריות.' }),
          el('li', { text: 'לפנות לדיאטן קליני לליווי אישי - זה המקום שבו נדרשת התאמה אנושית.' }),
        ]),
      ]),
    );
    return wrap;
  }

  const e = plan.energy;
  const m = plan.macros;

  mount(wrap, 
    card({ title: 'אומדן אנרגיה', aside: badge(e.method) }, [
      el('div', { class: 'stats' }, [
        stat(e.bmrKcal, 'מנוחה (BMR)'),
        stat(`${e.tdeeRangeKcal[0]}–${e.tdeeRangeKcal[1]}`, 'הוצאה יומית (טווח)'),
        stat(m.kcal, 'יעד פתיחה'),
      ]),
      note(e.uncertaintyNoteHe, 'info'),
      accordion('הנחות החישוב', [el('ul', {}, e.assumptionsHe.map((a) => el('li', { text: a })))]),
    ]),
    card('יעדי מאקרו', [
      el('div', { class: 'stats' }, [
        stat(`${m.proteinG} ג׳`, 'חלבון'),
        stat(`${m.fatG} ג׳`, 'שומן'),
        stat(`${m.carbsG} ג׳`, 'פחמימה'),
      ]),
      accordion('למה המספרים האלה', [el('ul', {}, m.rationaleHe.map((r) => el('li', { text: r })))]),
      m.safetyNotesHe.length ? noteList(m.safetyNotesHe, 'warn', 'כללי בטיחות שהופעלו:') : null,
    ]),
  );

  // תפריט לפי יום
  let activeDay = new Date().getDay();
  const dayHost = el('div', { class: 'stack' });
  const dayTabs = el('div', { class: 'chips' }, DAY_NAMES.map((name, i) =>
    el('button', { type: 'button', class: `chip ${i === activeDay ? 'is-on' : ''}`.trim(), text: name,
      onclick: (ev) => {
        activeDay = i;
        for (const c of ev.target.parentElement.children) c.classList.remove('is-on');
        ev.target.classList.add('is-on');
        renderDay();
      } }),
  ));

  const foodsById = new Map((data.foods ?? []).map((f) => [f.id, f]));

  function renderDay() {
    clear(dayHost);
    const day = plan.days[activeDay % plan.days.length];
    dayHost.append(
      el('div', { class: 'stats' }, [
        stat(day.totals.kcal, 'קק"ל'),
        stat(`${day.totals.proteinG}`, 'חלבון'),
        stat(`${day.totals.fatG}`, 'שומן'),
        stat(`${day.totals.carbsG}`, 'פחמימה'),
        stat(`${day.totals.fiberG}`, 'סיבים'),
      ]),
    );
    for (const { meal, timing } of day.meals) {
      const rows = meal.components.map((c) => {
        const f = foodsById.get(c.foodId);
        return el('tr', {}, [
          el('td', { text: f?.nameHe ?? c.foodId }),
          el('td', { text: c.householdHe ?? `${c.grams} גרם` }),
          el('td', { text: f ? `${Math.round((f.kcal * c.grams) / 100)} קק"ל` : '' }),
        ]);
      });
      dayHost.append(
        accordion(
          `${meal.nameHe} · ${timing.suggestedTime}`,
          [
            el('table', { class: 'meal-table' }, [
              el('thead', {}, [el('tr', {}, [el('th', { text: 'פריט' }), el('th', { text: 'כמות' }), el('th', { text: 'אנרגיה' })])]),
              el('tbody', {}, rows),
            ]),
            el('p', { class: 'tiny muted', text: `זמן הכנה משוער: ${meal.prepMinutes} דקות` }),
            el('ol', {}, meal.instructionsHe.map((i) => el('li', { class: 'tiny', text: i }))),
            el('p', { class: 'tiny muted', text: `תזמון: ${timing.reasonHe}` }),
          ],
          badge(`${meal.prepMinutes} דק׳`),
        ),
      );
    }
  }

  mount(wrap, card('תפריט שבועי', [dayTabs, dayHost]));
  renderDay();

  // רשימת קניות
  mount(wrap, 
    accordion(
      'רשימת קניות לשבוע',
      [
        el('table', { class: 'meal-table' }, [
          el('thead', {}, [el('tr', {}, [el('th', { text: 'פריט' }), el('th', { text: 'כמות' })])]),
          el('tbody', {}, plan.shoppingList.map((item) =>
            el('tr', {}, [el('td', { text: item.nameHe }), el('td', { text: `${item.grams} גרם` })]),
          )),
        ]),
        el('p', { class: 'tiny muted', text:
          'הכמויות הן סכום שבועי של התפריט. כשהפריט מסומן "מבושל", המשקל היבש בקנייה קטן בהתאם.' }),
      ],
      badge(`${plan.shoppingList.length} פריטים`),
    ),
    plan.notesHe.length ? accordion('הערות לתפריט', [el('ul', {}, plan.notesHe.map((n) => el('li', { text: n })))]) : null,
    data.dataSource
      ? note(`מקור נתוני התזונה: ${data.dataSource.citation}`, 'info')
      : null,
    el('div', { class: 'btn-row' }, [
      button('בנייה מחדש', { variant: 'ghost', onClick: async () => {
        await api.post('/api/nutrition/generate');
        ctx.navigate('/nutrition');
      } }),
    ]),
  );
  return wrap;
}

// ================================ מעקב =================================

export async function renderProgress(ctx) {
  // טוענים את התוכנית כדי שיהיו שמות תרגילים בעברית בגרפי הביצועים.
  await loadActivePlan().catch(() => {});
  const data = await api.get('/api/progress');
  const wrap = el('div', { class: 'stack' });

  const weightInput = numberInput({ step: 0.1, min: 25, max: 400, placeholder: 'ק"ג' });
  const waistInput = numberInput({ step: 0.5, min: 40, max: 250, placeholder: 'ס"מ' });
  const thighInput = numberInput({ step: 0.5, min: 20, max: 120, placeholder: 'ס"מ' });
  const armInput = numberInput({ step: 0.5, min: 15, max: 100, placeholder: 'ס"מ' });

  const addForm = el('form', { class: 'stack stack--tight', onsubmit: async (ev) => {
    ev.preventDefault();
    try {
      await api.post('/api/measurements', {
        weightKg: weightInput.value || undefined,
        waistCm: waistInput.value || undefined,
        thighCm: thighInput.value || undefined,
        armCm: armInput.value || undefined,
      });
      toast('נשמר.', 'ok');
      ctx.navigate('/progress');
    } catch (err) { toast(err.message, 'error'); }
  } }, [
    data.eatingDisorderSafeMode
      ? note(
          'מעקב משקל יזום כבוי בחשבון הזה לפי מה שסימנת בשאלון. אפשר לתעד היקפים ותחושה, ' +
            'והמדד המרכזי כאן הוא הביצועים באימונים.',
          'warn',
        )
      : field('משקל', weightInput),
    field('היקף מתניים', waistInput),
    field('היקף ירך', thighInput),
    field('היקף זרוע', armInput),
    button('שמירת מדידה', { variant: 'primary', block: true, type: 'submit' }),
  ]);

  const weightPoints = data.weightTrend.movingAverage.map((p) => ({ value: p.value, label: p.date.slice(5) }));

  mount(wrap, 
    card({ title: 'התמדה', aside: badge(`${data.adherence.percent ?? 0}%`) }, [
      el('div', { class: 'row', style: 'gap:18px' }, [
        ring(data.adherence.percent ?? 0, `${data.adherence.completedLast4Weeks}`, 'אימונים'),
        el('div', { class: 'grow' }, [
          el('p', { class: 'tiny', text: `${data.adherence.completedLast4Weeks} מתוך ${data.adherence.plannedLast4Weeks} מתוכננים בארבעה השבועות האחרונים.` }),
          el('p', { class: 'tiny muted', text: data.adherence.noteHe }),
        ]),
      ]),
    ]),
    card('מגמת משקל', [
      weightPoints.length > 1 ? lineChart(weightPoints, { yLabel: 'ממוצע נע של משקל' }) : null,
      note(data.weightTrend.trendHe, 'info'),
    ]),
  );

  if (data.performance.length > 0) {
    const perfHost = el('div', { class: 'stack stack--tight' });
    for (const p of data.performance.slice(0, 8)) {
      const name = state.exercises.get(p.exerciseId)?.nameHe ?? p.exerciseId;
      const pts = p.points.map((x) => ({ value: x.volume || x.topWeight, label: x.date.slice(5) }));
      perfHost.append(
        accordion(name, [
          pts.length > 1 ? lineChart(pts, { teal: true, yLabel: `נפח ב${name}` }) : barChart(pts),
          el('p', { class: 'tiny muted', text: 'נפח = משקל × חזרות, מסוכם לכל האימון. עלייה הדרגתית לאורך שבועות היא הסימן הטוב.' }),
        ], badge(`${p.points.length} אימונים`)),
      );
    }
    mount(wrap, card('ביצועים לפי תרגיל', [perfHost]));
  }

  mount(wrap, 
    card('מדידות', [
      el('div', { class: 'stack' }, [
        addForm,
        note(data.measurementsNoteHe, 'info'),
      ]),
    ]),
  );

  if (data.measurements.length > 0) {
    mount(wrap, 
      accordion(
        'היסטוריית מדידות',
        [
          el('table', { class: 'meal-table' }, [
            el('thead', {}, [el('tr', {}, [el('th', { text: 'תאריך' }), el('th', { text: 'משקל' }), el('th', { text: 'מתניים' })])]),
            el('tbody', {}, [...data.measurements].reverse().map((m) =>
              el('tr', {}, [
                el('td', { text: fmtDate(m.takenAt) }),
                el('td', { text: m.weightKg ? `${m.weightKg} ק"ג` : '—' }),
                el('td', { text: m.waistCm ? `${m.waistCm} ס"מ` : '—' }),
              ]),
            )),
          ]),
        ],
        badge(`${data.measurements.length}`),
      ),
    );
  }
  return wrap;
}

// =========================== פרופיל והגדרות ===========================

export async function renderProfile(ctx) {
  const wrap = el('div', { class: 'stack' });
  const [me, profileData, privacy, versions] = await Promise.all([
    api.get('/api/me'),
    api.get('/api/profile'),
    api.get('/api/account/privacy'),
    api.get('/api/plan/versions').catch(() => ({ versions: [], changes: [] })),
  ]);

  mount(wrap, 
    card('החשבון', [
      el('dl', { class: 'kv' }, [
        ...(me.user.viaAccessCode === true
          ? [el('dt', { text: 'שם' }), el('dd', { text: me.user.displayName ?? '—' })]
          : [el('dt', { text: 'אימייל' }), el('dd', { text: me.user.email })]),
        el('dt', { text: 'סוג כניסה' }),
        el('dd', { text: me.user.viaAccessCode === true ? 'כניסה מהירה עם קוד גישה' : 'חשבון עם אימייל וסיסמה' }),
        el('dt', { text: 'הרשאה' }), el('dd', { text: me.user.role === 'admin' ? 'מנהל תוכן' : 'משתמש' }),
        el('dt', { text: 'נוצר' }), el('dd', { text: fmtDate(me.user.createdAt) }),
      ]),
      me.user.viaAccessCode === true
        ? note(
            'החשבון נוצר בכניסה מהירה. כדי לחזור לנתונים שלך, הזן את אותו שם ואת אותו קוד גישה. ' +
              'מי שמכיר את הקוד יכול להיכנס באותו שם, ולכן אין להזין כאן מידע שאינו מיועד לקבוצה.',
            'warn',
          )
        : null,
    ]),
  );

  // הסכמות
  const healthBox = el('input', { type: 'checkbox', checked: Boolean(me.user.consentHealthDataAt) });
  const aiBox = el('input', { type: 'checkbox', checked: Boolean(me.user.consentAiAt) });
  mount(wrap, 
    card('הסכמות', [
      el('label', { class: 'switch-row' }, [
        healthBox,
        el('span', { class: 'switch-row__text' }, [
          el('strong', { text: 'שמירת נתוני בריאות' }),
          'בלי זה לא נוכל לשמור פרופיל ולבנות תוכנית. ביטול לא מוחק נתונים קיימים - למחיקה יש כפתור נפרד.',
        ]),
      ]),
      el('label', { class: 'switch-row' }, [
        aiBox,
        el('span', { class: 'switch-row__text' }, [
          el('strong', { text: 'שימוש ב-AI לניסוח' }),
          'בלי זה האפליקציה עובדת במלואה עם ניסוח מקומי. מנוע הכללים לא תלוי ב-AI בשום מצב.',
        ]),
      ]),
      button('שמירת הסכמות', { onClick: async () => {
        await api.post('/api/consents', { consentHealthData: healthBox.checked, consentAi: aiBox.checked });
        await refreshMe();
        toast('ההסכמות עודכנו.', 'ok');
      } }),
    ]),
  );

  if (profileData.profile) {
    const p = profileData.profile;
    mount(wrap, 
      card('הפרופיל שלי', [
        el('dl', { class: 'kv' }, [
          el('dt', { text: 'גיל' }), el('dd', { text: String(p.ageYears) }),
          el('dt', { text: 'גובה' }), el('dd', { text: `${p.heightCm} ס"מ` }),
          el('dt', { text: 'משקל' }), el('dd', { text: `${p.weightKg} ק"ג` }),
          el('dt', { text: 'אימונים בשבוע' }), el('dd', { text: `${p.sessionsPerWeek} × ${p.minutesPerSession} דקות` }),
          el('dt', { text: 'מגבלות' }), el('dd', { text: p.limitations.map((l) => l.area).join(', ') || 'אין' }),
          el('dt', { text: 'אלרגנים' }), el('dd', { text: p.allergens.join(', ') || 'אין' }),
        ]),
        button('עדכון השאלון', { variant: 'ghost', block: true, onClick: () => ctx.navigate('/questionnaire') }),
      ]),
    );
  }

  if (versions.versions?.length) {
    mount(wrap, 
      accordion(
        'גרסאות התוכנית',
        [
          el('div', { class: 'list' }, versions.versions.map((v) =>
            el('div', { class: 'card card--flat row row--between' }, [
              el('div', {}, [
                el('div', { text: `גרסה ${v.version}`, style: 'font-weight:650' }),
                el('div', { class: 'tiny muted', text: fmtDate(v.createdAt) }),
              ]),
              badge(v.status === 'active' ? 'פעילה' : v.status === 'pending_approval' ? 'ממתינה לאישור' : 'הוחלפה',
                v.status === 'active' ? 'teal' : v.status === 'pending_approval' ? 'warn' : ''),
            ]),
          )),
          ...(versions.changes ?? []).slice(0, 5).map((c) =>
            el('div', { style: 'margin-top:10px' }, [
              el('strong', { text: `שינוי לגרסה ${c.diff.toVersion}` }),
              el('ul', {}, c.diff.changes.map((ch) => el('li', { class: 'tiny', text: `${ch.descriptionHe} — ${ch.reasonHe}` }))),
              c.approvedAt ? badge('אושר', 'teal') : badge('ממתין לאישור', 'warn'),
              !c.approvedAt
                ? button('אישור השינוי', { size: 'sm', variant: 'primary', onClick: async () => {
                    try {
                      await api.post(`/api/plan/approve/${c.id}`);
                      toast('השינוי אושר והתוכנית עודכנה.', 'ok');
                      ctx.navigate('/week');
                    } catch (err) { toast(err.message, 'error'); }
                  } })
                : null,
            ]),
          ),
        ],
        badge(`${versions.versions.length}`),
      ),
    );
  }

  mount(wrap, 
    accordion('פרטיות ואבטחה', [el('ul', {}, privacy.itemsHe.map((i) => el('li', { text: i })))]),
    card('הנתונים שלי', [
      el('div', { class: 'btn-row' }, [
        button('ייצוא כל הנתונים', { variant: 'ghost', onClick: async () => {
          const data = await api.get('/api/account/export');
          const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
          const a = el('a', { href: URL.createObjectURL(blob), download: 'coach-export.json' });
          document.body.append(a);
          a.click();
          a.remove();
          toast('הקובץ הורד.', 'ok');
        } }),
        button('מחיקת חשבון', { variant: 'danger', onClick: openDelete }),
      ]),
    ]),
    me.user.role === 'admin'
      ? button('פאנל ניהול תוכן', { variant: 'ghost', block: true, onClick: () => ctx.navigate('/admin') })
      : null,
    button('התנתקות', { variant: 'ghost', block: true, onClick: async () => {
      await api.post('/api/auth/logout');
      state.user = null;
      ctx.navigate('/auth');
    } }),
    note(
      'האפליקציה נותנת הנחיות כלליות למבוגרים בריאים ואינה מהווה ייעוץ רפואי. ' +
        'בכל שינוי משמעותי בבריאות - כדאי להתייעץ עם רופא ולעדכן את השאלון.',
      'warn',
    ),
    el('div', { class: 'app-footer' }, [
      el('a', { href: '/', text: 'לאתר' }),
      el('span', { text: ' · ' }),
      el('a', { href: '/transparency', text: 'שקיפות' }),
      el('span', { text: ' · ' }),
      el('a', { href: '/privacy', text: 'פרטיות' }),
      el('span', { text: ' · ' }),
      el('a', { href: '/download', text: 'התקנה' }),
      el('div', { class: 'app-footer__copy', text: '© 2026 רון בר. כל הזכויות שמורות.' }),
    ]),
  );

  function openDelete() {
    const quick = me.user.viaAccessCode === true;
    const pw = input({ type: 'password', placeholder: quick ? 'קוד הגישה' : 'הסיסמה שלך' });
    const confirmText = input({ type: 'text', placeholder: 'מחק את החשבון' });
    const { close } = sheet('מחיקת חשבון', [
      note('הפעולה הזו מוחקת לגמרי את הפרופיל, התוכניות, האימונים, המדידות והתזונה. אין שחזור.', 'danger'),
      field(quick ? 'קוד גישה' : 'סיסמה', pw),
      field('לאישור, כתבו: מחק את החשבון', confirmText),
      button('מחיקה סופית', { variant: 'danger', block: true, onClick: async () => {
        try {
          const res = await api.post('/api/account/delete', { password: pw.value, confirm: confirmText.value });
          close();
          toast(res.messageHe, 'ok');
          state.user = null;
          ctx.navigate('/auth');
        } catch (err) { toast(err.message, 'error'); }
      } }),
    ]);
  }

  return wrap;
}

// ============================= פאנל ניהול =============================

export async function renderAdmin(ctx) {
  const wrap = el('div', { class: 'stack' });
  let overview;
  try {
    overview = await api.get('/api/admin/overview');
  } catch (err) {
    mount(wrap, note(err.message, 'danger'));
    return wrap;
  }
  const [{ exercises }, { rules }] = await Promise.all([
    api.get('/api/admin/exercises'),
    api.get('/api/admin/rules'),
  ]);

  mount(wrap, 
    card('מצב המערכת', [
      el('div', { class: 'stats' }, [
        stat(overview.library.total, 'תרגילים'),
        stat(overview.verifiedMedia, 'מדיה מאומתת'),
        stat(overview.reviewedExercises, 'עברו ביקורת'),
        stat(overview.users, 'משתמשים'),
      ]),
      note(overview.readinessNoteHe, 'warn'),
      el('p', { class: 'tiny muted', text: `שכבת AI: ${overview.aiStatusHe}` }),
      el('p', { class: 'tiny muted', text: overview.mediaBaseConfigured
        ? 'MEDIA_BASE_URL מוגדר - נכסים מאומתים יוצגו למשתמשים.'
        : 'MEDIA_BASE_URL אינו מוגדר. חיבור חיצוני חסר: עד שיוגדר, כל התרגילים מוצגים בהוראות כתובות.' }),
    ]),
  );

  if (overview.pendingRules.length) {
    mount(wrap, 
      accordion(
        'כללים שממתינים לביקורת מקצועית',
        overview.pendingRules.map((r) =>
          el('div', { style: 'margin-bottom:10px' }, [
            el('strong', { text: r.titleHe }),
            el('p', { class: 'tiny muted', text: r.noteHe ?? '' }),
          ]),
        ),
        badge(`${overview.pendingRules.length}`, 'warn'),
      ),
    );
  }

  const list = el('div', { class: 'list' });
  for (const ex of exercises) {
    list.append(
      listItem({
        title: ex.nameHe,
        sub: `${ex.mediaVerified ? 'מדיה מאומתת' : ex.hasMedia ? 'מדיה לא מאומתת' : 'אין מדיה'} · ${ex.reviewed ? 'עבר ביקורת' : 'ממתין לביקורת'}`,
        aside: ex.ready ? badge('מוכן', 'teal') : badge('לא מוכן', 'warn'),
        onClick: () => openEditor(ex),
      }),
    );
  }
  mount(wrap, card('ניהול תוכן תרגילים', [list]));

  mount(wrap, 
    accordion(
      'מרשם הכללים והמקורות',
      rules.map((r) =>
        el('div', { style: 'margin-bottom:12px' }, [
          el('div', { class: 'row', style: 'gap:6px' }, [
            el('strong', { text: r.titleHe }),
            r.reviewState === 'reviewed' ? badge('מתועד', 'teal') : badge('ממתין', 'warn'),
            badge(`גרסה ${r.version}`),
          ]),
          el('p', { class: 'tiny', text: r.statementHe }),
          r.reviewNoteHe ? el('p', { class: 'tiny muted', text: r.reviewNoteHe }) : null,
        ]),
      ),
      badge(`${rules.length}`),
    ),
  );

  function openEditor(ex) {
    const path = input({ placeholder: 'exercises/squat.mp4' });
    const source = input({ placeholder: 'מאיפה הנכס הגיע' });
    const owner = input({ placeholder: 'מי הבעלים' });
    const license = input({ placeholder: 'למשל: CC BY 4.0 / רישיון מסחרי / הפקה עצמית' });
    const verified = el('input', { type: 'checkbox' });
    const aiGen = el('input', { type: 'checkbox' });
    const reviewer = input({ placeholder: 'שם המאמן/דיאטן שבדק' });
    const reviewed = el('input', { type: 'checkbox', checked: ex.reviewed });

    const { close } = sheet(`ניהול: ${ex.nameHe}`, [
      card('נכס מדיה', [
        el('div', { class: 'stack stack--tight' }, [
          field('נתיב הנכס (יחסי ל-MEDIA_BASE_URL)', path),
          field('מקור', source),
          field('בעלים', owner),
          field('רישיון', license),
          el('label', { class: 'switch-row' }, [verified, el('span', { class: 'switch-row__text' }, [
            el('strong', { text: 'נבדק ידנית ותואם בדיוק לגרסת התרגיל' }),
            'רק נכס מסומן כך יוצג למשתמשים.',
          ])]),
          el('label', { class: 'switch-row' }, [aiGen, el('span', { class: 'switch-row__text' }, [
            el('strong', { text: 'נוצר על ידי AI' }),
            'נכס כזה לא יוצג כתוכן שנבדק מקצועית.',
          ])]),
          button('שמירת נכס', { variant: 'primary', onClick: async () => {
            try {
              const res = await api.post('/api/admin/media', {
                exerciseId: ex.id,
                path: path.value,
                source: source.value,
                owner: owner.value,
                license: license.value,
                verified: verified.checked,
                aiGenerated: aiGen.checked,
              });
              toast(res.noteHe, 'ok');
            } catch (err) { toast(err.message, 'error'); }
          } }),
        ]),
      ]),
      card('ביקורת מקצועית', [
        el('div', { class: 'stack stack--tight' }, [
          field('שם הבודק', reviewer),
          el('label', { class: 'switch-row' }, [reviewed, el('span', { class: 'switch-row__text' }, [
            el('strong', { text: 'התוכן עבר ביקורת מקצועית' }),
          ])]),
          button('שמירת ביקורת', { onClick: async () => {
            try {
              await api.post('/api/admin/review', {
                exerciseId: ex.id,
                reviewed: reviewed.checked,
                reviewerName: reviewer.value || 'לא צוין',
              });
              close();
              toast('סטטוס הביקורת עודכן.', 'ok');
              ctx.navigate('/admin');
            } catch (err) { toast(err.message, 'error'); }
          } }),
        ]),
      ]),
    ]);
  }

  return wrap;
}
