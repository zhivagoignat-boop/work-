/* Хранилище состояния: localStorage + импорт/экспорт JSON.
   Всё, что вводит пользователь, живёт здесь. */
(function (root) {
  'use strict';

  var KEY = 'weightloss.v1';
  var D = root.APP_DATA;

  function emptyState() {
    return {
      v: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      profile: {
        startDate: D.profile.startDate,
        endDate: D.profile.endDate,
        startWeight: D.profile.startWeight,
        goalWeight: D.profile.goalWeight
      },
      bb: { lunch: ['', '', '', ''], dinner: ['', '', '', ''] },
      weights: [],
      days: {},
      photos: {},
      checklist: {},
      askClaude: ''
    };
  }

  /* ---- даты ---- */
  function iso(d) {
    var x = (d instanceof Date) ? d : new Date(d);
    return x.getFullYear() + '-' + pad(x.getMonth() + 1) + '-' + pad(x.getDate());
  }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function today() { return iso(new Date()); }
  function parse(s) { var p = String(s).split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); }
  function addDays(s, n) { var d = parse(s); d.setDate(d.getDate() + n); return iso(d); }
  function diffDays(a, b) { return Math.round((parse(b) - parse(a)) / 86400000); }
  function weekday(s) { return parse(s).getDay(); }
  var MONTHS = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
  var WD = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
  function human(s) { var d = parse(s); return WD[d.getDay()] + ' ' + d.getDate() + ' ' + MONTHS[d.getMonth()]; }

  /* ---- доступ ---- */
  var state = null;
  var saved = false;   // было ли хоть одно сохранение на этом устройстве

  function load() {
    if (state) return state;
    try {
      var raw = root.localStorage && root.localStorage.getItem(KEY);
      saved = !!raw;
      state = raw ? migrate(JSON.parse(raw)) : emptyState();
    } catch (e) {
      console.warn('Не удалось прочитать сохранение:', e);
      state = emptyState();
    }
    return state;
  }

  /* Есть ли у состояния реальное содержимое (пустые заготовки дней не считаются) */
  function hasContent(s) {
    s = s || load();
    if (s.weights && s.weights.length) return true;
    if (s.askClaude && s.askClaude.trim()) return true;
    if (s.checklist && Object.keys(s.checklist).length) return true;
    if (s.photos && Object.keys(s.photos).length) return true;
    var days = s.days || {};
    return Object.keys(days).some(function (k) {
      var d = days[k];
      if (!d) return false;
      if (d.w && (d.w.done || d.w.skipped || Object.keys(d.w.ex || {}).some(function (i) {
        return d.w.ex[i].done || d.w.ex[i].kg != null || d.w.ex[i].note;
      }) || (d.w.cardio && d.w.cardio.done))) return true;
      if (d.m && Object.keys(d.m).some(function (i) { return d.m[i]; })) return true;
      return !!(d.steps || d.sleep || d.water || d.pain || d.energy || (d.note && d.note.trim()));
    });
  }

  function wasSaved() { return saved; }

  function migrate(s) {
    var base = emptyState();
    for (var k in base) if (!(k in s)) s[k] = base[k];
    if (!s.bb.lunch) s.bb.lunch = ['', '', '', ''];
    if (!s.bb.dinner) s.bb.dinner = ['', '', '', ''];
    return s;
  }

  function persist() {
    try {
      root.localStorage.setItem(KEY, JSON.stringify(state));
      saved = true;
    } catch (e) {
      console.warn('Не удалось сохранить:', e);
    }
  }

  function save() {
    state.updatedAt = new Date().toISOString();
    persist();
    if (root.dispatchEvent) root.dispatchEvent(new CustomEvent('state:changed'));
  }

  /* Подменить состояние целиком (загрузка из облака Telegram или импорт).
     silent = не поднимать событие, чтобы не отправить данные обратно в облако. */
  function setState(obj, opts) {
    state = migrate(obj);
    persist();
    if (!(opts && opts.silent) && root.dispatchEvent) root.dispatchEvent(new CustomEvent('state:changed'));
    return state;
  }

  /* день */
  function day(date, create) {
    var s = load();
    if (!s.days[date] && create) {
      s.days[date] = {
        w: { done: false, skipped: false, ex: {}, cardio: { done: false, min: null } },
        m: { breakfast: null, lunch: null, snack: null, dinner: null, extra: null, freeKcal: null, freeP: null },
        steps: null, sleep: null, water: null, pain: 0, energy: null, note: ''
      };
    }
    return s.days[date] || null;
  }

  function exState(date, exId, create) {
    var d = day(date, create === true);
    if (!d) return null;
    if (!d.w.ex[exId] && create) d.w.ex[exId] = { done: false, kg: null, note: '' };
    return d.w.ex[exId] || null;
  }

  /* плановая тренировка на дату */
  function plannedWorkout(date) {
    var wd = weekday(date);
    var sch = D.schedule[wd];
    return sch && sch.workout ? D.workouts[sch.workout] : null;
  }

  function isTrainingDay(date) {
    var wd = weekday(date);
    return D.schedule[wd] && D.schedule[wd].type === 'train';
  }

  /* питание за день */
  function nutrition(date) {
    var d = day(date);
    var sum = { kcal: 0, p: 0, f: 0, c: 0, meals: [] };
    if (!d) return sum;
    ['breakfast', 'lunch', 'snack', 'dinner', 'extra'].forEach(function (slot) {
      var id = d.m[slot];
      if (!id) return;
      var opt = findOption(slot, id);
      if (!opt) return;
      sum.kcal += opt.kcal; sum.p += opt.p; sum.f += opt.f || 0; sum.c += opt.c || 0;
      var name = opt.name;
      if (opt.bb) {
        var bbIdx = d.m[slot + 'BB'];
        var bbName = (load().bb[opt.bbSlot] || [])[bbIdx || 0];
        name = 'БодиБалансом: ' + (bbName || ('опция ' + ((bbIdx || 0) + 1)));
      }
      sum.meals.push({ slot: slot, name: name, kcal: opt.kcal, p: opt.p });
    });
    if (d.m.freeKcal) { sum.kcal += +d.m.freeKcal; sum.p += (+d.m.freeP || 0); sum.meals.push({ slot: 'free', name: 'Своё', kcal: +d.m.freeKcal, p: +d.m.freeP || 0 }); }
    return sum;
  }

  function findOption(slot, id) {
    var group = D.meals[slot];
    if (!group) return null;
    for (var i = 0; i < group.options.length; i++) if (group.options[i].id === id) return group.options[i];
    return null;
  }

  /* вес */
  function addWeight(date, kg, note) {
    var s = load();
    var existing = s.weights.filter(function (w) { return w.d === date; })[0];
    if (existing) { existing.kg = kg; existing.note = note || ''; }
    else s.weights.push({ d: date, kg: kg, note: note || '' });
    s.weights.sort(function (a, b) { return a.d < b.d ? -1 : 1; });
    save();
  }

  function removeWeight(date) {
    var s = load();
    s.weights = s.weights.filter(function (w) { return w.d !== date; });
    save();
  }

  function lastWeight() {
    var s = load();
    return s.weights.length ? s.weights[s.weights.length - 1] : null;
  }

  /* плановый вес на дату (линейно 107 → 80 за 134 дня) */
  function planWeight(date) {
    var p = D.profile;
    var span = diffDays(p.startDate, p.endDate) || p.totalDays;
    var n = diffDays(p.startDate, date);
    if (n < 0) n = 0;
    if (n > span) n = span;
    return p.startWeight - (p.startWeight - p.goalWeight) * (n / span);
  }

  function exportJSON() { return JSON.stringify(load(), null, 2); }

  function importJSON(text) {
    var parsed = JSON.parse(text);
    if (!parsed || typeof parsed !== 'object' || !('days' in parsed)) throw new Error('Это не файл данных приложения');
    setState(parsed);
    return state;
  }

  function reset() { state = emptyState(); saved = false; save(); }

  root.Store = {
    KEY: KEY, load: load, save: save, day: day, exState: exState,
    plannedWorkout: plannedWorkout, isTrainingDay: isTrainingDay,
    nutrition: nutrition, findOption: findOption,
    addWeight: addWeight, removeWeight: removeWeight, lastWeight: lastWeight, planWeight: planWeight,
    exportJSON: exportJSON, importJSON: importJSON, reset: reset, emptyState: emptyState, setState: setState,
    hasContent: hasContent, wasSaved: wasSaved,
    iso: iso, today: today, parse: parse, addDays: addDays, diffDays: diffDays,
    weekday: weekday, human: human, WD: WD, MONTHS: MONTHS
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.Store;
})(typeof window !== 'undefined' ? window : globalThis);
