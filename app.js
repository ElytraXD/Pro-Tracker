/* ======================================================
   ELYTRA PROGRESS TRACKER — app.js
   Backend: Firebase Auth + Firestore
   ====================================================== */

// ─── FIREBASE CONFIG ──────────────────────────────────────
const firebaseConfig = {
    apiKey: "AIzaSyD-rELKbkaiQRGJxfqKNfiFB3KIK3q9RI4",
    authDomain: "pro-tracker-y53499.firebaseapp.com",
    projectId: "pro-tracker-y53499",
    storageBucket: "pro-tracker-y53499.firebasestorage.app",
    messagingSenderId: "276648197938",
    appId: "1:276648197938:web:4171d167876cb6a70e612b"
};

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const firestore = firebase.firestore();

// ─── STATE ───────────────────────────────────────────────
let db = defaultDB();
let currentUser = null;
let saveTimer = null;
let calYear = new Date().getFullYear();
let calMonth = new Date().getMonth();
let selectedKey = todayKey();

function defaultDB() {
    return { theme: 'dark', xp: 0, level: 1, bestStreak: 0, unlocked: {}, days: {} };
}

// ─── DATE HELPERS ────────────────────────────────────────
function todayKey() { return fmtKey(new Date()); }
function fmtKey(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
function pad(n) { return String(n).padStart(2, '0'); }
function getDay(k) {
    if (!db.days[k]) db.days[k] = { tasks: [], totalAdded: 0, totalDone: 0 };
    return db.days[k];
}

// ─── CLOUD SYNC ──────────────────────────────────────────
function scheduleSave() {
    showSync('saving');
    clearTimeout(saveTimer);
    saveTimer = setTimeout(pushCloud, 900);
}

async function pushCloud() {
    if (!currentUser) return;
    const uid = currentUser.uid;
    try {
        // Save profile
        await firestore.collection('profiles').doc(uid).set({
            xp: db.xp,
            level: db.level,
            best_streak: db.bestStreak,
            theme: db.theme,
            unlocked: db.unlocked,
            updated_at: firebase.firestore.FieldValue.serverTimestamp()
        });

        // Save daily tasks — stored as one document per user with a 'days' map.
        // (Firestore 1MB doc limit is safe for years of personal task data.)
        await firestore.collection('daily_tasks').doc(uid).set({
            days: db.days,
            updated_at: firebase.firestore.FieldValue.serverTimestamp()
        });

        showSync('saved');
    } catch (e) {
        console.error('Sync error:', e);
        showSync('error');
    }
}

async function pullCloud() {
    if (!currentUser) return;
    showSync('saving');
    const uid = currentUser.uid;
    try {
        // Pull profile
        const profileSnap = await firestore.collection('profiles').doc(uid).get();
        if (profileSnap.exists) {
            const p = profileSnap.data();
            db.xp = p.xp || 0;
            db.level = p.level || 1;
            db.bestStreak = p.best_streak || 0;
            db.theme = p.theme || 'dark';
            db.unlocked = p.unlocked || {};
        }

        // Pull daily tasks
        const tasksSnap = await firestore.collection('daily_tasks').doc(uid).get();
        if (tasksSnap.exists) {
            db.days = tasksSnap.data().days || {};
        }

        showSync('saved');
    } catch (e) {
        console.error('Pull error:', e);
        showSync('error');
    }
}

// ─── SYNC UI ─────────────────────────────────────────────
let syncHideTimer = null;
function showSync(state) {
    const el = document.getElementById('syncIndicator');
    const text = document.getElementById('syncText');
    if (!el) return;
    clearTimeout(syncHideTimer);
    el.className = `sync-indicator show ${state}`;
    text.textContent = state === 'saving' ? 'Saving…' : state === 'saved' ? 'Saved ✓' : 'Sync error';
    if (state !== 'saving') syncHideTimer = setTimeout(() => el.classList.remove('show'), 2200);
}

// ─── AUTH UI ─────────────────────────────────────────────
function showAuthScreen() {
    document.getElementById('authOverlay').style.display = 'flex';
    document.getElementById('appHeader').style.display = 'none';
    document.getElementById('appXpBar').style.display = 'none';
    document.getElementById('appMain').style.display = 'none';
}

function showApp() {
    document.getElementById('authOverlay').style.display = 'none';
    document.getElementById('appHeader').style.display = 'flex';
    document.getElementById('appXpBar').style.display = 'flex';
    document.getElementById('appMain').style.display = 'grid';
    const emailEl = document.getElementById('userEmail');
    if (emailEl) emailEl.textContent = currentUser?.email || '';
}

function showAuthError(msg, isSuccess) {
    const el = document.getElementById('authError');
    el.style.display = 'block';
    el.style.color = isSuccess ? 'var(--accent-3)' : 'var(--accent-2)';
    el.style.background = isSuccess ? '#4dffc318' : '#ff6b9d18';
    el.style.borderColor = isSuccess ? '#4dffc355' : '#ff6b9d55';
    el.textContent = msg;
}
function clearAuthError() { document.getElementById('authError').style.display = 'none'; }

// Pretty-print Firebase auth error codes
function friendlyAuthError(err) {
    const code = err.code || '';
    const map = {
        'auth/invalid-email': 'Invalid email address.',
        'auth/user-not-found': 'No account found with this email.',
        'auth/wrong-password': 'Incorrect password.',
        'auth/invalid-credential': 'Incorrect email or password.',
        'auth/email-already-in-use': 'An account with this email already exists.',
        'auth/weak-password': 'Password must be at least 6 characters.',
        'auth/too-many-requests': '⚠️ Too many attempts. Please try again later.',
        'auth/network-request-failed': '⚠️ Network error. Check your connection.',
        'auth/popup-closed-by-user': 'Google sign-in was cancelled.',
        'auth/popup-blocked': 'Popup was blocked. Allow popups for this site.',
    };
    return map[code] || err.message;
}

function setTabLoading(btnId, loading, defaultText) {
    const btn = document.getElementById(btnId);
    if (!btn) return;
    btn.disabled = loading;
    if (loading) {
        btn.textContent = btnId === 'loginBtn' ? 'Logging in…' : 'Creating account…';
    } else {
        btn.textContent = defaultText;
    }
}

// ─── AUTH STATE LISTENER ─────────────────────────────────
auth.onAuthStateChanged(async (user) => {
    if (user) {
        currentUser = user;
        await pullCloud();
        setTheme(db.theme);
        showApp();
        renderAll();
        showToast('👋 Welcome back, ELYTRA!');
    } else {
        currentUser = null;
        db = defaultDB();
        setTheme('dark');
        showAuthScreen();
    }
});

// ─── TAB SWITCH ──────────────────────────────────────────
document.getElementById('tabLogin').addEventListener('click', () => {
    document.getElementById('loginForm').style.display = 'flex';
    document.getElementById('signupForm').style.display = 'none';
    document.getElementById('tabLogin').classList.add('active');
    document.getElementById('tabSignup').classList.remove('active');
    clearAuthError();
});
document.getElementById('tabSignup').addEventListener('click', () => {
    document.getElementById('signupForm').style.display = 'flex';
    document.getElementById('loginForm').style.display = 'none';
    document.getElementById('tabSignup').classList.add('active');
    document.getElementById('tabLogin').classList.remove('active');
    clearAuthError();
});

// ─── LOGIN ───────────────────────────────────────────────
document.getElementById('loginBtn').addEventListener('click', async () => {
    clearAuthError();
    const email = document.getElementById('loginEmail').value.trim();
    const password = document.getElementById('loginPassword').value;
    if (!email || !password) { showAuthError('Please fill in all fields.'); return; }
    setTabLoading('loginBtn', true);
    try {
        await auth.signInWithEmailAndPassword(email, password);
        // onAuthStateChanged takes it from here
    } catch (err) {
        showAuthError(friendlyAuthError(err));
        setTabLoading('loginBtn', false, 'Log In');
    }
});
document.getElementById('loginPassword').addEventListener('keydown', e => {
    if (e.key === 'Enter') document.getElementById('loginBtn').click();
});

// ─── SIGN UP ─────────────────────────────────────────────
document.getElementById('signupBtn').addEventListener('click', async () => {
    clearAuthError();
    const email = document.getElementById('signupEmail').value.trim();
    const password = document.getElementById('signupPassword').value;
    if (!email || !password) { showAuthError('Please fill in all fields.'); return; }
    if (password.length < 6) { showAuthError('Password must be at least 6 characters.'); return; }
    setTabLoading('signupBtn', true, 'Create Account');
    try {
        await auth.createUserWithEmailAndPassword(email, password);
        // onAuthStateChanged handles the rest
    } catch (err) {
        showAuthError(friendlyAuthError(err));
        setTabLoading('signupBtn', false, 'Create Account');
    }
});
document.getElementById('signupPassword').addEventListener('keydown', e => {
    if (e.key === 'Enter') document.getElementById('signupBtn').click();
});

// ─── MAGIC LINK (Email Link Sign-In) ─────────────────────
document.getElementById('magicLinkBtn').addEventListener('click', async () => {
    const email = document.getElementById('loginEmail').value.trim();
    if (!email) { showAuthError('Enter your email above first.'); return; }
    try {
        await auth.sendSignInLinkToEmail(email, {
            url: window.location.href,
            handleCodeInApp: true
        });
        window.localStorage.setItem('emailForSignIn', email);
        showAuthError(`✓ Magic link sent to ${email}! Check your inbox.`, true);
    } catch (err) {
        showAuthError(friendlyAuthError(err));
    }
});

// Handle magic link return (when user clicks link in email)
if (auth.isSignInWithEmailLink(window.location.href)) {
    let email = window.localStorage.getItem('emailForSignIn');
    if (!email) email = window.prompt('Please confirm your email for sign-in:');
    auth.signInWithEmailLink(email, window.location.href)
        .then(() => window.localStorage.removeItem('emailForSignIn'))
        .catch(err => showAuthError(friendlyAuthError(err)));
}

// ─── GOOGLE SIGN-IN ───────────────────────────────────────
document.getElementById('googleBtn').addEventListener('click', async () => {
    const provider = new firebase.auth.GoogleAuthProvider();
    try {
        await auth.signInWithPopup(provider);
    } catch (err) {
        showAuthError(friendlyAuthError(err));
    }
});

// ─── LOGOUT ──────────────────────────────────────────────
document.getElementById('logoutBtn')?.addEventListener('click', async () => {
    document.getElementById('userMenu').style.display = 'none';
    await auth.signOut();
});

// ─── USER MENU TOGGLE ────────────────────────────────────
document.getElementById('userBtn')?.addEventListener('click', e => {
    e.stopPropagation();
    const m = document.getElementById('userMenu');
    m.style.display = m.style.display === 'none' ? 'block' : 'none';
});
document.addEventListener('click', () => {
    const m = document.getElementById('userMenu');
    if (m) m.style.display = 'none';
});

// ─── XP / LEVEL ──────────────────────────────────────────
const XP_PER_TASK = 15;
const XP_LEVELS = [0, 100, 250, 450, 700, 1000, 1400, 1900, 2500, 3200, 4000];
const LEVEL_NAMES = ['Novice', 'Seeker', 'Builder', 'Achiever', 'Champion', 'Veteran', 'Elite', 'Legend', 'Mythic', 'Ascendant', 'ELYTRA'];
const MAX_LEVEL = LEVEL_NAMES.length; // 11

function calcLevel(xp) {
    let lv = 1;
    for (let i = XP_LEVELS.length - 1; i >= 0; i--) {
        if (xp >= XP_LEVELS[i]) { lv = Math.min(i + 1, MAX_LEVEL); break; }
    }
    return lv;
}

function addXP(n) {
    db.xp += n;
    const newLevel = calcLevel(db.xp);
    if (newLevel > db.level) {
        db.level = newLevel;
        showToast(`🎉 Level up! You are now ${LEVEL_NAMES[db.level - 1]} (Lv.${db.level})`);
        triggerConfetti();
    }
    renderXPBar();
    renderLevelBadge();
}

function renderXPBar() {
    const lv = Math.min(db.level, MAX_LEVEL);
    const curBase = XP_LEVELS[lv - 1];
    const nextBase = lv < MAX_LEVEL ? XP_LEVELS[lv] : XP_LEVELS[MAX_LEVEL - 1] + 1000;
    const need = Math.max(1, nextBase - curBase);
    const pct = lv === MAX_LEVEL ? 100 : Math.min(100, Math.round(((db.xp - curBase) / need) * 100));
    document.getElementById('xpBarFill').style.width = pct + '%';
    document.getElementById('xpLabel').textContent = `${db.xp} XP · Lv.${db.level} ${LEVEL_NAMES[db.level - 1]}`;
}

function renderLevelBadge() {
    document.getElementById('levelDisplay').textContent = `Lv.${db.level}`;
}

// ─── STREAKS ─────────────────────────────────────────────
function calcStreak() {
    let streak = 0, d = new Date();
    const MAX_DAYS = 3650; // safety cap
    for (let i = 0; i < MAX_DAYS; i++) {
        const k = fmtKey(d);
        const day = db.days[k];
        if (day && day.tasks.some(t => t.done)) {
            streak++;
        } else if (k !== todayKey()) {
            break;
        }
        d.setDate(d.getDate() - 1);
    }
    return streak;
}

function renderStreak() {
    const s = calcStreak();
    if (s > db.bestStreak) db.bestStreak = s;
    document.getElementById('streakCount').textContent = s;
    document.getElementById('statBestStreak').textContent = db.bestStreak;
}

// ─── QUOTES ──────────────────────────────────────────────
const QUOTES = [
    { text: "The secret of getting ahead is getting started.", author: "Mark Twain" },
    { text: "Small steps every day build empires tomorrow.", author: "Unknown" },
    { text: "Discipline is choosing between what you want now and what you want most.", author: "Abraham Lincoln" },
    { text: "Done is better than perfect.", author: "Sheryl Sandberg" },
    { text: "Push yourself, because no one else is going to do it for you.", author: "Unknown" },
    { text: "Energy flows where attention goes.", author: "Ancient Wisdom" },
    { text: "Success is the sum of small efforts repeated day in and day out.", author: "Robert Collier" },
    { text: "Dream big. Start small. Act now.", author: "Robin Sharma" },
    { text: "Your future self is watching you right now.", author: "Aubrey de Grey" },
    { text: "Motivation gets you going. Habit keeps you growing.", author: "John C. Maxwell" },
];

function renderQuote() {
    const q = QUOTES[new Date().getDate() % QUOTES.length];
    document.getElementById('quoteText').textContent = `"${q.text}"`;
    document.getElementById('quoteAuthor').textContent = `— ${q.author}`;
}

// ─── STATS ───────────────────────────────────────────────
function renderStats() {
    let done = 0, added = 0, productive = 0;
    Object.values(db.days).forEach(d => {
        const n = d.tasks.filter(t => t.done).length;
        done += n; added += d.tasks.length;
        if (n > 0) productive++;
    });
    document.getElementById('statTotal').textContent = done;
    document.getElementById('statRate').textContent = added > 0 ? Math.round((done / added) * 100) + '%' : '0%';
    document.getElementById('statProductiveDays').textContent = productive;
    renderStreak();
}

// ─── CALENDAR ────────────────────────────────────────────
function renderCalendar() {
    const grid = document.getElementById('calendarGrid');
    const label = document.getElementById('calMonthLabel');
    const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    label.textContent = `${MONTHS[calMonth]} ${calYear}`;
    grid.innerHTML = '';

    const firstDay = new Date(calYear, calMonth, 1).getDay();
    const days = new Date(calYear, calMonth + 1, 0).getDate();
    const today = todayKey();

    for (let i = 0; i < firstDay; i++) {
        const e = document.createElement('div'); e.className = 'cal-day cal-empty'; grid.appendChild(e);
    }
    for (let d = 1; d <= days; d++) {
        const key = `${calYear}-${pad(calMonth + 1)}-${pad(d)}`;
        const div = document.createElement('div');
        div.className = 'cal-day';
        div.textContent = d;
        const day = db.days[key];
        const has = day && day.tasks.length > 0;
        const any = has && day.tasks.some(t => t.done);
        const all = has && day.tasks.every(t => t.done);
        if (key === today) div.classList.add('cal-today');
        if (key === selectedKey && key !== today) div.classList.add('cal-selected');
        if (all) div.classList.add('cal-done');
        else if (any) div.classList.add('cal-partial');
        div.addEventListener('click', () => { selectedKey = key; renderCalendar(); renderTasks(); });
        grid.appendChild(div);
    }
}

document.getElementById('calPrev').addEventListener('click', () => {
    if (--calMonth < 0) { calMonth = 11; calYear--; } renderCalendar();
});
document.getElementById('calNext').addEventListener('click', () => {
    if (++calMonth > 11) { calMonth = 0; calYear++; } renderCalendar();
});

// ─── TASKS ───────────────────────────────────────────────
function renderTasks() {
    const list = document.getElementById('taskList');
    const empty = document.getElementById('tasksEmpty');
    const badge = document.getElementById('taskCountBadge');
    const label = document.getElementById('taskDateLabel');
    const day = getDay(selectedKey);
    const done = day.tasks.filter(t => t.done).length;

    const isToday = selectedKey === todayKey();
    const d = new Date(selectedKey + 'T12:00:00');
    label.textContent = isToday ? "Today's Tasks"
        : `Tasks · ${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
    badge.textContent = `${done}/${day.tasks.length}`;
    list.innerHTML = '';
    empty.style.display = day.tasks.length === 0 ? 'block' : 'none';

    day.tasks.forEach(task => {
        const li = document.createElement('li'); li.className = 'task-item';
        const cb = document.createElement('div');
        cb.className = 'task-checkbox' + (task.done ? ' checked' : '');
        cb.addEventListener('click', () => toggleTask(selectedKey, task.id));
        const txt = document.createElement('span');
        txt.className = 'task-text' + (task.done ? ' done' : '');
        txt.textContent = task.text;
        const del = document.createElement('button');
        del.className = 'task-delete'; del.innerHTML = '✕';
        del.addEventListener('click', () => deleteTask(selectedKey, task.id));
        li.appendChild(cb); li.appendChild(txt); li.appendChild(del);
        list.appendChild(li);
    });

    renderCharts(); renderStats(); renderCalendar(); renderHeatmap(); renderAchievements();
}

function addTask(text) {
    if (!text.trim()) return;
    const day = getDay(selectedKey);
    // Use crypto.randomUUID() to guarantee unique IDs even on rapid additions
    day.tasks.push({ id: crypto.randomUUID(), text: text.trim(), done: false });
    day.totalAdded++;
    scheduleSave(); renderTasks(); showToast('✦ Task added!');
}

function toggleTask(key, id) {
    const day = getDay(key);
    const task = day.tasks.find(t => t.id === id);
    if (!task) return;
    if (!task.done) {
        task.done = true; day.totalDone++;
        addXP(XP_PER_TASK);
        showToast(`⚡ +${XP_PER_TASK} XP — Task complete!`);
        triggerCheckAnim();
    } else {
        task.done = false; day.totalDone = Math.max(0, day.totalDone - 1);
        db.xp = Math.max(0, db.xp - XP_PER_TASK);
        // FIX: recalculate level downward when XP is lost
        db.level = calcLevel(db.xp);
        renderXPBar(); renderLevelBadge();
    }
    scheduleSave(); renderTasks();
}

function deleteTask(key, id) {
    const day = getDay(key);
    const idx = day.tasks.findIndex(t => t.id === id);
    if (idx === -1) return;
    if (day.tasks[idx].done) day.totalDone--;
    day.tasks.splice(idx, 1);
    scheduleSave(); renderTasks();
}

document.getElementById('addTaskBtn').addEventListener('click', () => {
    const inp = document.getElementById('taskInput');
    addTask(inp.value); inp.value = ''; inp.focus();
});
document.getElementById('taskInput').addEventListener('keydown', e => {
    if (e.key === 'Enter') { addTask(e.target.value); e.target.value = ''; }
});

// ─── BAR CHART ───────────────────────────────────────────
function renderBarChart() {
    const chart = document.getElementById('barChart');
    chart.innerHTML = '';
    const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const today = new Date();
    const days7 = Array.from({ length: 7 }, (_, i) => {
        const d = new Date(today); d.setDate(today.getDate() - (6 - i));
        return { key: fmtKey(d), label: DAYS[d.getDay()] };
    });
    const maxT = Math.max(...days7.map(({ key }) => db.days[key]?.tasks.length || 0), 1);

    days7.forEach(({ key, label }) => {
        const d = db.days[key], total = d?.tasks.length || 0;
        const done = d?.tasks.filter(t => t.done).length || 0, pending = total - done;
        const H = Math.round((total / maxT) * 140);
        const grp = document.createElement('div'); grp.className = 'bar-group';
        const vl = document.createElement('div'); vl.className = 'bar-value-label';
        vl.textContent = total > 0 ? `${done}/${total}` : '';
        const stk = document.createElement('div'); stk.className = 'bar-stack';
        if (key === selectedKey) { stk.style.outline = '2px solid var(--accent-2)'; stk.style.outlineOffset = '2px'; }
        if (done > 0) {
            const fd = document.createElement('div'); fd.className = 'bar-fill-completed';
            fd.style.height = Math.round((done / Math.max(1, total)) * H) + 'px'; stk.appendChild(fd);
        }
        if (pending > 0) {
            const fp = document.createElement('div'); fp.className = 'bar-fill-pending';
            fp.style.height = Math.round((pending / Math.max(1, total)) * H) + 'px'; stk.appendChild(fp);
        }
        if (!total) { stk.style.minHeight = '4px'; stk.style.background = 'var(--bar-bg)'; }
        const dl = document.createElement('div'); dl.className = 'bar-day-label'; dl.textContent = label;
        grp.appendChild(vl); grp.appendChild(stk); grp.appendChild(dl);
        chart.appendChild(grp);
    });
}

// ─── DONUT ───────────────────────────────────────────────
function renderDonut() {
    const now = new Date(), y = now.getFullYear(), m = now.getMonth();
    const days = new Date(y, m + 1, 0).getDate();
    let added = 0, done = 0;
    for (let d = 1; d <= days; d++) {
        const row = db.days[`${y}-${pad(m + 1)}-${pad(d)}`];
        if (row) { added += row.tasks.length; done += row.tasks.filter(t => t.done).length; }
    }
    const pct = added > 0 ? Math.round((done / added) * 100) : 0;
    const circ = 2 * Math.PI * 48;
    document.getElementById('donutFill').style.strokeDashoffset = circ - (pct / 100) * circ;
    document.getElementById('donutPct').textContent = pct + '%';
}

function renderCharts() { renderBarChart(); renderDonut(); }

// ─── HEATMAP ─────────────────────────────────────────────
function renderHeatmap() {
    const grid = document.getElementById('heatmapGrid');
    grid.innerHTML = '';
    for (let i = 97; i >= 0; i--) {
        const d = new Date(); d.setDate(d.getDate() - i);
        const key = fmtKey(d), day = db.days[key];
        let lv = 0;
        if (day && day.tasks.length > 0) {
            const r = day.tasks.filter(t => t.done).length / day.tasks.length;
            lv = r >= .9 ? 4 : r >= .65 ? 3 : r >= .35 ? 2 : 1;
        }
        const cell = document.createElement('div');
        cell.className = `heatmap-cell l${lv}`;
        cell.title = `${key}: ${day?.tasks.filter(t => t.done).length || 0}/${day?.tasks.length || 0} tasks`;
        grid.appendChild(cell);
    }
}

// ─── ACHIEVEMENTS ────────────────────────────────────────
const ACHIEVEMENTS = [
    { id: 'first', icon: '🌱', name: 'First Step', desc: 'Complete your first task', check: () => totalDone() >= 1 },
    { id: 'ten', icon: '🚀', name: 'Getting Airborne', desc: 'Complete 10 tasks total', check: () => totalDone() >= 10 },
    { id: 'fifty', icon: '⚡', name: 'Power User', desc: 'Complete 50 tasks total', check: () => totalDone() >= 50 },
    { id: 'str3', icon: '🔥', name: 'On Fire', desc: '3-day streak', check: () => calcStreak() >= 3 },
    { id: 'str7', icon: '💫', name: 'Week Warrior', desc: '7-day streak', check: () => calcStreak() >= 7 },
    { id: 'lv5', icon: '🏆', name: 'Champion', desc: 'Reach level 5', check: () => db.level >= 5 },
    { id: 'perfect', icon: '✅', name: 'Perfectionist', desc: 'All tasks done in one day', check: () => Object.values(db.days).some(d => d.tasks.length > 0 && d.tasks.every(t => t.done)) },
    {
        id: 'month15', icon: '📅', name: 'Half Month', desc: '15+ productive days in a month',
        check: () => {
            const now = new Date(), prefix = `${now.getFullYear()}-${pad(now.getMonth() + 1)}`;
            return Object.keys(db.days).filter(k => k.startsWith(prefix) && db.days[k].tasks.some(t => t.done)).length >= 15;
        }
    },
];

function totalDone() {
    return Object.values(db.days).reduce((s, d) => s + d.tasks.filter(t => t.done).length, 0);
}

function renderAchievements() {
    const list = document.getElementById('achievementsList');
    list.innerHTML = ''; let dirty = false;
    ACHIEVEMENTS.forEach(a => {
        const ok = a.check();
        if (ok && !db.unlocked[a.id]) { db.unlocked[a.id] = true; dirty = true; showToast(`${a.icon} Unlocked: ${a.name}!`); }
        const el = document.createElement('div');
        el.className = `achievement-item ${ok ? 'unlocked' : 'locked'}`;
        el.innerHTML = `<span class="achievement-icon">${a.icon}</span>
      <div class="achievement-info">
        <div class="achievement-name">${a.name}</div>
        <div class="achievement-desc">${a.desc}</div>
      </div>${ok ? '<span style="color:var(--accent-3);font-size:16px;">✓</span>' : ''}`;
        list.appendChild(el);
    });
    if (dirty) scheduleSave();
}

// ─── THEME ───────────────────────────────────────────────
function setTheme(t) {
    db.theme = t || 'dark';
    document.documentElement.setAttribute('data-theme', db.theme);
    const icon = document.getElementById('themeIcon');
    if (icon) icon.textContent = db.theme === 'dark' ? '☀️' : '🌙';
}

document.getElementById('themeToggle').addEventListener('click', () => {
    setTheme(db.theme === 'dark' ? 'light' : 'dark'); scheduleSave();
});

// ─── TOAST ───────────────────────────────────────────────
let toastTimer = null;
function showToast(msg) {
    if (!msg) return;
    const t = document.getElementById('toast');
    t.textContent = msg; t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 2800);
}

// ─── ANIMATIONS ──────────────────────────────────────────
function triggerCheckAnim() {
    const el = document.createElement('div');
    el.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%) scale(0);font-size:80px;z-index:9999;pointer-events:none;animation:popCheck 0.6s ease forwards;';
    el.textContent = '✓';
    if (!document.getElementById('pcs')) {
        const s = document.createElement('style'); s.id = 'pcs';
        s.textContent = '@keyframes popCheck{0%{transform:translate(-50%,-50%) scale(0);opacity:1}60%{transform:translate(-50%,-50%) scale(1.2);opacity:.9}100%{transform:translate(-50%,-50%) scale(0);opacity:0}}';
        document.head.appendChild(s);
    }
    document.body.appendChild(el); setTimeout(() => el.remove(), 700);
}

function triggerConfetti() {
    const colors = ['#7c6dff', '#ff6b9d', '#4dffc3', '#ffcc00', '#fff'];
    if (!document.getElementById('cfs')) {
        const s = document.createElement('style'); s.id = 'cfs';
        s.textContent = '@keyframes cFall{from{transform:translateY(0) rotate(0deg);opacity:1}to{transform:translateY(110vh) rotate(720deg);opacity:0}}';
        document.head.appendChild(s);
    }
    for (let i = 0; i < 60; i++) {
        const p = document.createElement('div');
        const dur = Math.random() * 1.5 + 1;
        p.style.cssText = `position:fixed;top:-10px;left:${Math.random() * 100}vw;width:${Math.random() * 8 + 4}px;height:${Math.random() * 8 + 4}px;background:${colors[~~(Math.random() * 5)]};border-radius:${Math.random() > .5 ? '50%' : '2px'};z-index:9998;pointer-events:none;animation:cFall ${dur}s ease-in forwards;`;
        document.body.appendChild(p); setTimeout(() => p.remove(), dur * 1000 + 100);
    }
}

// ─── RENDER ALL ──────────────────────────────────────────
function renderAll() {
    renderQuote(); renderXPBar(); renderLevelBadge();
    renderCalendar(); renderTasks(); renderHeatmap();
    renderStats(); renderAchievements();
    document.querySelectorAll('.card').forEach((c, i) => { c.style.animationDelay = `${i * 50}ms`; });
}

// Kick off — show auth screen; onAuthStateChanged handles the rest
showAuthScreen();
