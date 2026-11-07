// סקריפט האתר: זיהוי פלטפורמה, התקנה בלחיצה אחת, ובדיקה אם קיים קובץ התקנה להורדה.
// בלי ספריות, בלי מעקב, בלי קריאות לשירותים חיצוניים.

(function () {
  'use strict';

  var ua = navigator.userAgent || '';
  var isIos = /iphone|ipad|ipod/i.test(ua) || (/Macintosh/.test(ua) && 'ontouchend' in document);
  var isAndroid = /android/i.test(ua);
  var platform = isIos ? 'ios' : isAndroid ? 'android' : 'desktop';
  var isStandalone =
    window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;

  // סימון הכרטיס של המכשיר הנוכחי
  document.querySelectorAll('[data-platform="' + platform + '"]').forEach(function (card) {
    card.classList.add('plat--on');
  });
  document.querySelectorAll('[data-flag="' + platform + '"]').forEach(function (flag) {
    flag.classList.remove('hidden');
  });

  // הודעת זיהוי בעמוד ההורדה
  var note = document.getElementById('detect-note');
  var noteText = document.getElementById('detect-text');
  if (note && noteText) {
    var messages = {
      ios: 'זיהינו שאתה על מכשיר של Apple. ההתקנה היא דרך Safari: כפתור השיתוף ואז ' +
        '"הוספה למסך הבית". זו הדרך היחידה ב-iOS, גם לאפליקציות מהחנות אין קיצור דרך אחר כאן.',
      android: 'זיהינו שאתה על אנדרואיד. אם הדפדפן תומך, כפתור "התקנה עכשיו" כאן יעשה את ' +
        'זה בלחיצה אחת. אחרת: תפריט ⋮ ואז "התקנת אפליקציה".',
      desktop: 'זיהינו שאתה על מחשב. אפשר להתקין את האפליקציה כחלון נפרד, או פשוט להשתמש ' +
        'בה בדפדפן. על הטלפון ההתקנה נותנת חוויה טובה יותר.',
    };
    noteText.textContent = messages[platform];
    note.classList.remove('hidden');

    if (isStandalone) {
      noteText.textContent = 'האפליקציה כבר מותקנת ואתה משתמש בה עכשיו במצב אפליקציה. אין מה להתקין שוב.';
    }
  }

  // התקנה בלחיצה אחת (Chromium בלבד - iOS לא מספק את האירוע הזה)
  var deferredPrompt = null;
  var installBtn = document.getElementById('install-now');

  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault();
    deferredPrompt = e;
    if (installBtn && !isStandalone) installBtn.classList.remove('hidden');
  });

  if (installBtn) {
    installBtn.addEventListener('click', function () {
      if (!deferredPrompt) return;
      deferredPrompt.prompt();
      deferredPrompt.userChoice.then(function (choice) {
        deferredPrompt = null;
        installBtn.classList.add('hidden');
        if (choice && choice.outcome === 'accepted' && noteText) {
          noteText.textContent = 'האפליקציה הותקנה. אפשר לפתוח אותה מהאייקון במסך הבית.';
        }
      });
    });
  }

  // בדיקה אם הועלה קובץ התקנה לשרת. אין קישור קבוע בקוד - רק מה שקיים בפועל.
  var apkAvailable = document.getElementById('apk-available');
  var apkMissing = document.getElementById('apk-missing');
  var apkList = document.getElementById('apk-list');
  if (apkAvailable && apkList) {
    fetch('/api/downloads', { credentials: 'same-origin' })
      .then(function (res) { return res.ok ? res.json() : null; })
      .then(function (data) {
        if (!data || !data.files || data.files.length === 0) return;
        data.files.forEach(function (file) {
          var row = document.createElement('div');
          row.className = 'plat__top';
          row.style.marginBottom = '12px';

          var info = document.createElement('div');
          var name = document.createElement('div');
          name.style.fontWeight = '700';
          name.textContent = file.name;
          var meta = document.createElement('div');
          meta.className = 'plat__sub';
          meta.textContent = file.sizeHe + (file.updatedHe ? ' · עודכן ' + file.updatedHe : '');
          info.appendChild(name);
          info.appendChild(meta);

          var link = document.createElement('a');
          link.className = 'btn btn--primary btn--sm';
          link.href = file.url;
          link.setAttribute('download', '');
          link.textContent = 'הורדה';
          link.style.marginInlineStart = 'auto';

          row.appendChild(info);
          row.appendChild(link);
          apkList.appendChild(row);
        });

        var warn = document.createElement('div');
        warn.className = 'note note--warn';
        var icon = document.createElement('span');
        icon.className = 'note__i';
        icon.textContent = '⚠';
        var text = document.createElement('div');
        text.innerHTML = '<strong>התקנה מקובץ APK דורשת אישור ידני.</strong> ' +
          'אנדרואיד יבקש אישור להתקנה ממקור שאינו החנות. התקינו רק קובץ שהגיע ממקור שאתם ' +
          'סומכים עליו, והשוו את החתימה אם יש לכם את טביעת האצבע.';
        warn.appendChild(icon);
        warn.appendChild(text);
        apkList.appendChild(warn);

        apkAvailable.classList.remove('hidden');
        if (apkMissing) apkMissing.classList.add('hidden');
      })
      .catch(function () {
        /* אין מה להציג - ההודעה שאין קובץ נשארת */
      });
  }

  // קישור לאפליקציה: אם היא כבר מותקנת, פתיחה רגילה תקפוץ לאפליקציה
  var openApp = document.getElementById('open-app');
  if (openApp && isStandalone) openApp.textContent = 'חזרה לאפליקציה';
})();
