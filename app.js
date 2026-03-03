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

// ─── TIERS ───────────────────────────────────────────────
const TIERS = {
    silver: { label: 'Silver', icon: '🥈', xp: 20, cls: 'tier-silver' },
    gold: { label: 'Gold', icon: '🥇', xp: 40, cls: 'tier-gold' },
    diamond: { label: 'Diamond', icon: '💎', xp: 80, cls: 'tier-diamond' },
    aujla: { label: 'Karan Aujla', icon: '🔱', xp: 150, cls: 'tier-aujla' },
};

// ─── STATE ───────────────────────────────────────────────
let db = defaultDB();
let currentUser = null;
let saveTimer = null;
let calYear = new Date().getFullYear();
let calMonth = new Date().getMonth();
let selectedKey = todayKey();

function defaultDB() {
    return { theme: 'dark', xp: 0, level: 1, bestStreak: 0, unlocked: {}, days: {}, habits: [], events: {}, displayName: '', avatar: '' };
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
            habits: db.habits,
            events: db.events || {},
            displayName: db.displayName || '',
            avatar: db.avatar || '',
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
            db.habits = p.habits || [];
            db.events = p.events || {};
            db.displayName = p.displayName || '';
            db.avatar = p.avatar || '';
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

// ─── AUTH UI ───────────────────────────────────────────────
function showAuthScreen() {
    document.getElementById('authOverlay').style.display = 'flex';
    document.getElementById('appHeader').style.display = 'none';
    document.getElementById('appXpBar').style.display = 'none';
    document.getElementById('appMain').style.display = 'none';
    // Fade out main night-sky canvas
    document.getElementById('mainCanvas')?._stop?.();
}

function showApp() {
    const card = document.querySelector('.auth-card');
    const overlay = document.getElementById('authOverlay');
    const userBtn = document.getElementById('userBtn');

    // Reveal app content behind the overlay FIRST so it's visible through the dissolve
    document.getElementById('appHeader').style.display = 'flex';
    document.getElementById('appXpBar').style.display = 'flex';
    document.getElementById('appMain').style.display = 'grid';
    // Start night-sky canvas (fades in via CSS opacity transition)
    document.getElementById('mainCanvas')?._start?.();

    if (card && userBtn && overlay) {
        // Compute where the card needs to fly (center of card → center of userBtn)
        const cR = card.getBoundingClientRect();
        const bR = userBtn.getBoundingClientRect();
        const dx = (bR.left + bR.width / 2) - (cR.left + cR.width / 2);
        const dy = (bR.top + bR.height / 2) - (cR.top + cR.height / 2);
        card.style.setProperty('--fly-x', dx + 'px');
        card.style.setProperty('--fly-y', dy + 'px');

        overlay.classList.add('auth-overlay-exit');
        card.classList.add('auth-card-exit');

        // Pop the user avatar just as the card "arrives"
        setTimeout(() => {
            userBtn.classList.add('user-btn-pop');
            setTimeout(() => userBtn.classList.remove('user-btn-pop'), 450);
        }, 600);

        // Clean up once animation finishes
        setTimeout(() => {
            overlay.style.display = 'none';
            overlay.classList.remove('auth-overlay-exit');
            card.classList.remove('auth-card-exit');
        }, 800);
    } else {
        overlay.style.display = 'none';
    }
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
        'auth/weak-password': 'Password must be at least 8 characters with a special character.',
        'auth/too-many-requests': '⚠️ Too many attempts. Please try again later.',
        'auth/network-request-failed': '⚠️ Network error. Check your connection.',
        'auth/popup-closed-by-user': 'Google sign-in was cancelled.',
        'auth/popup-blocked': 'Popup was blocked. Allow popups for this site.',
    };
    return map[code] || err.message;
}

// ─── PASSWORD VALIDATION ─────────────────────────────────
function validatePassword(pw) {
    if (pw.length < 8) return 'Password must be at least 8 characters.';
    if (/\s/.test(pw)) return 'Password must not contain spaces.';
    if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(pw))
        return 'Password must include at least one special character (!@#$%^&* …)';
    return null; // valid
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
        const name = db.displayName || 'ELYTRA';
        showToast(`👋 Welcome back, ${name}!`);
        // Check for today's special event
        setTimeout(() => checkTodayEvent(), 1200);
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
    const pwError = validatePassword(password);
    if (pwError) { showAuthError(pwError); return; }
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
// Button removed from UI; handler kept for users clicking links from email
document.getElementById('magicLinkBtn')?.addEventListener('click', async () => {
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
// Check for redirect result first (returned after Google redirects back)
auth.getRedirectResult().then(result => {
    // If result.user is set a redirect sign-in just completed — onAuthStateChanged handles the rest
}).catch(err => {
    if (err.code && err.code !== 'auth/no-current-user') {
        showAuthError(friendlyAuthError(err));
    }
});

document.getElementById('googleBtn').addEventListener('click', async () => {
    const provider = new firebase.auth.GoogleAuthProvider();
    try {
        // Try popup first; if blocked, fall back to redirect
        await auth.signInWithPopup(provider);
    } catch (err) {
        if (err.code === 'auth/popup-blocked' || err.code === 'auth/popup-closed-by-user') {
            // Fall back to redirect
            try {
                await auth.signInWithRedirect(provider);
            } catch (redirectErr) {
                showAuthError(friendlyAuthError(redirectErr));
            }
        } else {
            showAuthError(friendlyAuthError(err));
        }
    }
});


// ─── LOGOUT ──────────────────────────────────────────────
// (Moved to profile modal block)

// ─── PASSWORD TOGGLE ─────────────────────────────────────
function setupPasswordToggle(inputId, toggleId, openSvgId, closedSvgId) {
    const input = document.getElementById(inputId);
    const btn = document.getElementById(toggleId);
    const eyeOpen = document.getElementById(openSvgId);
    const eyeClosed = document.getElementById(closedSvgId);
    if (!btn || !input) return;
    btn.addEventListener('click', () => {
        const isHidden = input.type === 'password';
        input.type = isHidden ? 'text' : 'password';
        eyeOpen.style.display = isHidden ? 'none' : '';
        eyeClosed.style.display = isHidden ? '' : 'none';
        btn.setAttribute('aria-label', isHidden ? 'Hide password' : 'Show password');
    });
}
setupPasswordToggle('loginPassword', 'toggleLoginPw', 'eyeLoginOpen', 'eyeLoginClosed');
setupPasswordToggle('signupPassword', 'toggleSignupPw', 'eyeSignupOpen', 'eyeSignupClosed');


// ─── PROFILE MODAL ─────────────────────────────────────────────
function openProfile() {
    renderProfile();
    document.getElementById('profileOverlay').style.display = 'flex';
}
function closeProfile() {
    document.getElementById('profileOverlay').style.display = 'none';
}

document.getElementById('userBtn')?.addEventListener('click', e => {
    e.stopPropagation(); openProfile();
});
document.getElementById('profileClose')?.addEventListener('click', closeProfile);
document.getElementById('profileOverlay')?.addEventListener('click', e => {
    if (e.target === e.currentTarget) closeProfile();
});

function updateHeaderAvatar() {
    const el = document.getElementById('headerAvatar');
    if (!el) return;
    if (db.avatar) {
        el.innerHTML = `<img src="${db.avatar}" style="width:100%;height:100%;border-radius:50%;object-fit:cover;display:block;" />`;
    } else if (db.displayName) {
        el.textContent = db.displayName[0].toUpperCase();
        el.style.cssText = 'display:flex;align-items:center;justify-content:center;width:32px;height:32px;border-radius:50%;background:var(--accent);color:#fff;font-weight:700;font-size:15px;';
    } else {
        el.textContent = '👤';
        el.style.cssText = '';
    }
}

function renderProfile() {
    // Avatar
    const avatarEl = document.getElementById('avatarImg');
    if (avatarEl) {
        if (db.avatar) {
            avatarEl.innerHTML = `<img src="${db.avatar}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;" />`;
        } else if (db.displayName) {
            avatarEl.textContent = db.displayName[0].toUpperCase();
            avatarEl.style.cssText = 'display:flex;align-items:center;justify-content:center;font-size:40px;font-weight:700;color:var(--accent);';
        } else {
            avatarEl.textContent = '👤';
            avatarEl.style.cssText = 'font-size:48px;display:flex;align-items:center;justify-content:center;';
        }
    }
    // Name + email
    const nameInput = document.getElementById('displayNameInput');
    if (nameInput) nameInput.value = db.displayName || '';
    const emailEl = document.getElementById('profileEmail');
    if (emailEl) emailEl.textContent = currentUser?.email || '';

    // Stats grid
    const statsEl = document.getElementById('profileStats');
    if (statsEl) {
        const streak = calcStreak();
        const done = totalDoneHabits();
        const habitsTotal = db.habits.length;
        const habitsDoneToday = Object.keys((db.days[todayKey()]?.habitLog) || {}).length;
        statsEl.innerHTML = [
            { icon: '⚡', label: 'Total XP', val: db.xp },
            { icon: '🏆', label: 'Level', val: `${db.level} — ${LEVEL_NAMES[db.level - 1]}` },
            { icon: '🔥', label: 'Current Streak', val: `${streak} days` },
            { icon: '🌟', label: 'Best Streak', val: `${db.bestStreak} days` },
            { icon: '✅', label: 'Habits Done Today', val: `${habitsDoneToday}/${habitsTotal}` },
            { icon: '�', label: 'Total Habits Done', val: totalDoneHabits?.() ?? 0 },
        ].map(s => `<div class="profile-stat">
                <span class="profile-stat-icon">${s.icon}</span>
                <span class="profile-stat-val">${s.val}</span>
                <span class="profile-stat-label">${s.label}</span>
            </div>`).join('');
    }
}

// Avatar upload
document.getElementById('avatarWrap')?.addEventListener('click', () =>
    document.getElementById('avatarInput').click()
);
document.getElementById('avatarInput')?.addEventListener('change', e => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
        const img = new Image();
        img.onload = () => {
            // Compress to 128x128 JPEG
            const canvas = document.createElement('canvas');
            canvas.width = canvas.height = 128;
            const ctx = canvas.getContext('2d');
            const size = Math.min(img.width, img.height);
            const sx = (img.width - size) / 2, sy = (img.height - size) / 2;
            ctx.drawImage(img, sx, sy, size, size, 0, 0, 128, 128);
            db.avatar = canvas.toDataURL('image/jpeg', 0.75);
            renderProfile();
            updateHeaderAvatar();
            scheduleSave();
        };
        img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
});

// Save display name
document.getElementById('saveProfileBtn')?.addEventListener('click', () => {
    const val = document.getElementById('displayNameInput').value.trim();
    db.displayName = val;
    updateHeaderAvatar();
    scheduleSave();
    showToast('✓ Profile saved!');
    renderProfile();
});

// In-modal theme + mute toggles
document.getElementById('profileThemeBtn')?.addEventListener('click', () => {
    setTheme(db.theme === 'dark' ? 'light' : 'dark'); scheduleSave();
});
document.getElementById('profileMuteBtn')?.addEventListener('click', () => setMute(!_muted));

// Export data removed per user request

// Hard reset
document.getElementById('hardResetBtn')?.addEventListener('click', () => {
    if (!confirm('⚠️ Are you sure? This will delete ALL your progress permanently.')) return;
    if (!confirm('💀 Last chance! Hit OK to wipe everything and start from zero.')) return;
    db.xp = 0; db.level = 1; db.bestStreak = 0;
    db.unlocked = {}; db.days = {}; db.habits = [];
    scheduleSave();
    renderAll(); renderProfile();
    showToast('💀 Everything has been reset.');
});

// Logout (in profile modal)
document.getElementById('logoutBtn')?.addEventListener('click', async () => {
    closeProfile();
    await auth.signOut();
});

// ─── XP / LEVEL ──────────────────────────────────────────
const XP_PER_TASK = 20; // Default (Silver tier) for regular tasks
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
        playSound('level_up');
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

// ─── STREAKS (habit-based) ───────────────────────────────
// A day counts as active if the user logged at least one habit.
function calcStreak() {
    let streak = 0, d = new Date();
    const MAX_DAYS = 3650;
    for (let i = 0; i < MAX_DAYS; i++) {
        const k = fmtKey(d);
        const log = db.days[k]?.habitLog || {};
        const anyDone = Object.values(log).some(v => v);
        if (anyDone) {
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

// ─── QUOTES (rotating with smooth crossfade) ────────────
const QUOTES = [
    { text: "If you are dreaming, make sure you dream big.", author: "Karan Aujla" },
    { text: "It was all a dream.", author: "Karan Aujla" },
    { text: "Hustle karo, trust the process.", author: "Karan Aujla" },
    { text: "They didn't believe in us, now they all see us.", author: "Karan Aujla" },
    { text: "Started from the bottom, now the whole team here.", author: "Karan Aujla" },
    { text: "Apni mehnat te yakeen rakh, baaki sab hoja.", author: "Karan Aujla" },
    { text: "Technoblade never dies.", author: "Technoblade" },
    { text: "I'm an entertainer. That's what I do.", author: "Technoblade" },
    { text: "Not even close, baby!", author: "Technoblade" },
    { text: "If you wish to defeat me, train for another 300 years.", author: "Technoblade" },
];

let _quoteIdx = 0;
let _quoteOnA = true; // which slide is currently showing
let _quoteTimer = null;

function showQuote(idx, instant) {
    const q = QUOTES[idx % QUOTES.length];
    // Pick the incoming slide (the one NOT currently active)
    const inSlide = document.getElementById(_quoteOnA ? 'quoteSlideB' : 'quoteSlideA');
    const outSlide = document.getElementById(_quoteOnA ? 'quoteSlideA' : 'quoteSlideB');
    const inText = document.getElementById(_quoteOnA ? 'quoteTextB' : 'quoteTextA');
    const inAuth = document.getElementById(_quoteOnA ? 'quoteAuthorB' : 'quoteAuthorA');
    if (!inSlide) return;

    // Set content on the hidden slide
    inText.textContent = `"${q.text}"`;
    inAuth.textContent = `— ${q.author}`;

    if (instant) {
        outSlide.classList.remove('active');
        inSlide.classList.add('active');
    } else {
        // Crossfade
        outSlide.classList.remove('active');
        inSlide.classList.add('active');
    }
    _quoteOnA = !_quoteOnA;
}

function renderQuote() {
    showQuote(_quoteIdx, true);
    clearInterval(_quoteTimer);
    _quoteTimer = setInterval(() => {
        _quoteIdx++;
        showQuote(_quoteIdx, false);
    }, 8000);
}

// ─── STATS (habit-based) ──────────────────────────────
function renderStats() {
    let totalDone = 0, productive = 0;
    const trackedDays = Object.values(db.days).filter(d =>
        d.habitLog && Object.values(d.habitLog).some(v => v)
    );
    trackedDays.forEach(day => {
        totalDone += Object.values(day.habitLog || {}).filter(v => v).length;
        productive++;
    });
    const possible = trackedDays.length * Math.max(1, db.habits.length);
    const rate = possible > 0 ? Math.round((totalDone / possible) * 100) : 0;
    document.getElementById('statTotal').textContent = totalDone;
    document.getElementById('statRate').textContent = rate + '%';
    document.getElementById('statProductiveDays').textContent = productive;
    renderStreak();
}

// ─── CALENDAR (habit-based + events) ──────────────────
function renderCalendar() {
    const grid = document.getElementById('calendarGrid');
    const label = document.getElementById('calMonthLabel');
    const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    label.textContent = `${MONTHS[calMonth]} ${calYear}`;
    grid.innerHTML = '';

    const firstDay = new Date(calYear, calMonth, 1).getDay();
    const days = new Date(calYear, calMonth + 1, 0).getDate();
    const today = todayKey();
    const total = db.habits.length;

    for (let i = 0; i < firstDay; i++) {
        const e = document.createElement('div'); e.className = 'cal-day cal-empty'; grid.appendChild(e);
    }
    for (let d = 1; d <= days; d++) {
        const key = `${calYear}-${pad(calMonth + 1)}-${pad(d)}`;
        const div = document.createElement('div');
        div.className = 'cal-day';
        div.textContent = d;
        const log = db.days[key]?.habitLog || {};
        const doneCount = Object.values(log).filter(v => v).length;
        const any = doneCount > 0;
        const all = total > 0 && doneCount >= total;
        if (key === today) div.classList.add('cal-today');
        if (all) div.classList.add('cal-done');
        else if (any) div.classList.add('cal-partial');

        // Event marker
        const evt = db.events?.[key];
        if (evt) {
            div.classList.add('cal-event');
            div.setAttribute('data-event-emoji', evt.emoji || '⭐');
        }

        div.addEventListener('click', () => openEventModal(key));
        grid.appendChild(div);
    }
}

// ─── CALENDAR EVENTS ─────────────────────────────────────
const EVENT_EMOJIS = ['🎂', '🎉', '🏆', '💼', '✈️', '❤️', '🎯', '📅', '🎊', '⭐', '🔔', '💡'];
let _eventModalKey = null;

function openEventModal(dateKey) {
    _eventModalKey = dateKey;
    const overlay = document.getElementById('eventOverlay');
    const dateLabel = document.getElementById('eventDateLabel');
    const input = document.getElementById('eventInput');
    const emojiGrid = document.getElementById('eventEmojiGrid');
    const deleteBtn = document.getElementById('eventDeleteBtn');

    // Format date nicely
    const [y, m, d] = dateKey.split('-');
    const dateObj = new Date(y, m - 1, d);
    const opts = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    dateLabel.textContent = dateObj.toLocaleDateString('en-US', opts);

    const existing = db.events?.[dateKey];
    input.value = existing?.text || '';

    // Render emoji picker
    emojiGrid.innerHTML = '';
    const selectedEmoji = existing?.emoji || '⭐';
    EVENT_EMOJIS.forEach(em => {
        const btn = document.createElement('button');
        btn.className = 'event-emoji-btn' + (em === selectedEmoji ? ' selected' : '');
        btn.textContent = em;
        btn.addEventListener('click', () => {
            emojiGrid.querySelectorAll('.event-emoji-btn').forEach(b => b.classList.remove('selected'));
            btn.classList.add('selected');
        });
        emojiGrid.appendChild(btn);
    });

    deleteBtn.style.display = existing ? 'block' : 'none';
    overlay.style.display = 'flex';
    setTimeout(() => input.focus(), 100);
}

function closeEventModal() {
    document.getElementById('eventOverlay').style.display = 'none';
    _eventModalKey = null;
}

function saveEvent() {
    if (!_eventModalKey) return;
    const text = document.getElementById('eventInput').value.trim();
    if (!text) { showToast('⚠️ Enter event text!'); return; }
    const selected = document.querySelector('.event-emoji-btn.selected');
    const emoji = selected ? selected.textContent : '⭐';
    if (!db.events) db.events = {};
    db.events[_eventModalKey] = { text, emoji };
    scheduleSave();
    renderCalendar();
    closeEventModal();
    showToast(`${emoji} Event saved!`);
}

function deleteEvent() {
    if (!_eventModalKey || !db.events?.[_eventModalKey]) return;
    delete db.events[_eventModalKey];
    scheduleSave();
    renderCalendar();
    closeEventModal();
    showToast('🗑️ Event removed.');
}

// Today's event popup — shown once per login
function checkTodayEvent() {
    const evt = db.events?.[todayKey()];
    if (!evt) return;
    const popup = document.getElementById('eventPopup');
    const popupEmoji = document.getElementById('eventPopupEmoji');
    const popupText = document.getElementById('eventPopupText');
    if (!popup) return;

    popupEmoji.textContent = evt.emoji || '⭐';
    popupText.textContent = evt.text;
    popup.style.display = 'flex';
    triggerConfetti();
    playSound('achievement');
}

function closeEventPopup() {
    document.getElementById('eventPopup').style.display = 'none';
}

// Event modal: Enter to save, backdrop to close
document.getElementById('eventInput')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') saveEvent();
});
document.getElementById('eventOverlay')?.addEventListener('click', e => {
    if (e.target === e.currentTarget) closeEventModal();
});
document.getElementById('eventPopup')?.addEventListener('click', e => {
    if (e.target === e.currentTarget) closeEventPopup();
});

document.getElementById('calPrev').addEventListener('click', () => {
    if (--calMonth < 0) { calMonth = 11; calYear--; } renderCalendar();
});
document.getElementById('calNext').addEventListener('click', () => {
    if (++calMonth > 11) { calMonth = 0; calYear++; } renderCalendar();
});


// ─── HABITS ──────────────────────────────────────────────

function addHabit(text, tier) {
    if (!text.trim()) return;
    db.habits.push({ id: crypto.randomUUID(), text: text.trim(), tier: tier || 'silver' });
    scheduleSave(); renderHabits(); showToast(`${TIERS[tier]?.icon} Habit added!`);
}

function deleteHabit(id) {
    // Deduct XP if ticked today
    const todayLog = (db.days[todayKey()] || {}).habitLog || {};
    if (todayLog[id]) {
        const habit = db.habits.find(h => h.id === id);
        if (habit) {
            const xpAmt = TIERS[habit.tier]?.xp ?? XP_PER_TASK;
            db.xp = Math.max(0, db.xp - xpAmt);
            db.level = calcLevel(db.xp);
            renderXPBar(); renderLevelBadge();
        }
    }
    db.habits = db.habits.filter(h => h.id !== id);
    scheduleSave(); renderHabits();
}

function toggleHabitToday(id) {
    const day = getDay(todayKey());
    if (!day.habitLog) day.habitLog = {};
    const habit = db.habits.find(h => h.id === id);
    if (!habit) return;
    const xpAmt = TIERS[habit.tier]?.xp ?? XP_PER_TASK;
    if (!day.habitLog[id]) {
        day.habitLog[id] = true;
        addXP(xpAmt);
        showToast(`${TIERS[habit.tier]?.icon} +${xpAmt} XP — ${habit.text} done!`);
        if (habit.tier === 'diamond' || habit.tier === 'aujla') {
            triggerTotemAnim(habit.tier);
            playSound('totem');
        } else {
            triggerCheckAnim();
            playSound('habit_complete');
        }
    } else {
        delete day.habitLog[id];
        db.xp = Math.max(0, db.xp - xpAmt);
        db.level = calcLevel(db.xp);
        renderXPBar(); renderLevelBadge();
    }
    scheduleSave();
    renderHabits(); renderStats(); renderCharts(); renderCalendar(); renderHeatmap(); renderAchievements();
}

function renderHabits() {
    const list = document.getElementById('habitList');
    const empty = document.getElementById('habitsEmpty');
    const badge = document.getElementById('habitCountBadge');
    if (!list) return;
    const todayLog = (db.days[todayKey()] || {}).habitLog || {};
    const doneTodayCount = db.habits.filter(h => todayLog[h.id]).length;
    badge.textContent = `${doneTodayCount}/${db.habits.length}`;
    list.innerHTML = '';
    empty.style.display = db.habits.length === 0 ? 'block' : 'none';

    db.habits.forEach(habit => {
        const tier = TIERS[habit.tier] || TIERS.silver;
        const isDone = !!todayLog[habit.id];
        const li = document.createElement('li');
        li.className = `task-item habit-item ${tier.cls}`;

        const cb = document.createElement('div');
        cb.className = 'task-checkbox' + (isDone ? ' checked' : '');
        cb.addEventListener('click', () => toggleHabitToday(habit.id));

        const badge = document.createElement('span');
        badge.className = `tier-badge ${tier.cls}`;
        badge.title = `${tier.label} · ${tier.xp} XP`;
        badge.textContent = tier.icon;

        const txt = document.createElement('span');
        txt.className = 'task-text' + (isDone ? ' done' : '');
        txt.textContent = habit.text;

        const xpTag = document.createElement('span');
        xpTag.className = `tier-xp-tag ${tier.cls}`;
        xpTag.textContent = `+${tier.xp}`;

        const del = document.createElement('button');
        del.className = 'task-delete';
        del.innerHTML = '✕';
        del.addEventListener('click', () => deleteHabit(habit.id));

        li.appendChild(cb);
        li.appendChild(badge);
        li.appendChild(txt);
        li.appendChild(xpTag);
        li.appendChild(del);
        list.appendChild(li);
    });
}

document.getElementById('addHabitBtn')?.addEventListener('click', () => {
    const inp = document.getElementById('habitInput');
    const tier = document.getElementById('tierSelect').value;
    addHabit(inp.value, tier); inp.value = ''; inp.focus();
});
document.getElementById('habitInput')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
        const tier = document.getElementById('tierSelect').value;
        addHabit(e.target.value, tier); e.target.value = '';
    }
});

// ─── BAR CHART (habit-based) ───────────────────────────
function renderBarChart() {
    const chart = document.getElementById('barChart');
    chart.innerHTML = '';
    const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const today = new Date();
    const days7 = Array.from({ length: 7 }, (_, i) => {
        const d = new Date(today); d.setDate(today.getDate() - (6 - i));
        return { key: fmtKey(d), label: DAYS[d.getDay()] };
    });
    const total = Math.max(1, db.habits.length);
    const maxDone = Math.max(...days7.map(({ key }) => {
        const log = db.days[key]?.habitLog || {};
        return Object.values(log).filter(v => v).length;
    }), 1);

    days7.forEach(({ key, label }) => {
        const log = db.days[key]?.habitLog || {};
        const done = Object.values(log).filter(v => v).length;
        const pending = Math.max(0, total - done);
        const H = Math.round((done / maxDone) * 140);
        const grp = document.createElement('div'); grp.className = 'bar-group';
        const vl = document.createElement('div'); vl.className = 'bar-value-label';
        vl.textContent = done > 0 ? `${done}/${total}` : '';
        const stk = document.createElement('div'); stk.className = 'bar-stack';
        if (done > 0) {
            const fd = document.createElement('div'); fd.className = 'bar-fill-completed';
            fd.style.height = Math.round((done / total) * H) + 'px'; stk.appendChild(fd);
        }
        if (pending > 0 && done > 0) {
            const fp = document.createElement('div'); fp.className = 'bar-fill-pending';
            fp.style.height = Math.round((pending / total) * H) + 'px'; stk.appendChild(fp);
        }
        if (!done) { stk.style.minHeight = '4px'; stk.style.background = 'var(--bar-bg)'; }
        const dl = document.createElement('div'); dl.className = 'bar-day-label'; dl.textContent = label;
        grp.appendChild(vl); grp.appendChild(stk); grp.appendChild(dl);
        chart.appendChild(grp);
    });
}

// ─── DONUT (habit-based) ──────────────────────────────
function renderDonut() {
    const now = new Date(), y = now.getFullYear(), m = now.getMonth();
    const days = new Date(y, m + 1, 0).getDate();
    let done = 0;
    const total = db.habits.length;
    for (let d = 1; d <= days; d++) {
        const row = db.days[`${y}-${pad(m + 1)}-${pad(d)}`];
        if (row?.habitLog) done += Object.values(row.habitLog).filter(v => v).length;
    }
    const possible = days * Math.max(1, total);
    const pct = possible > 0 ? Math.round((done / possible) * 100) : 0;
    const circ = 2 * Math.PI * 48;
    document.getElementById('donutFill').style.strokeDashoffset = circ - (pct / 100) * circ;
    document.getElementById('donutPct').textContent = pct + '%';
}

function renderCharts() { renderBarChart(); renderDonut(); }

// ─── HEATMAP (habit-based) ────────────────────────────
function renderHeatmap() {
    const grid = document.getElementById('heatmapGrid');
    grid.innerHTML = '';
    const total = Math.max(1, db.habits.length);
    for (let i = 97; i >= 0; i--) {
        const d = new Date(); d.setDate(d.getDate() - i);
        const key = fmtKey(d);
        const log = db.days[key]?.habitLog || {};
        const done = Object.values(log).filter(v => v).length;
        let lv = 0;
        if (done > 0) {
            const r = done / total;
            lv = r >= .9 ? 4 : r >= .65 ? 3 : r >= .35 ? 2 : 1;
        }
        const cell = document.createElement('div');
        cell.className = `heatmap-cell l${lv}`;
        cell.title = `${key}: ${done}/${total} habits`;
        grid.appendChild(cell);
    }
}

// ─── ACHIEVEMENTS (habit-based) ──────────────────────────
const ACHIEVEMENTS = [
    { id: 'first', icon: '🌱', name: 'First Step', desc: 'Complete your first habit', check: () => totalDoneHabits() >= 1 },
    { id: 'str2', icon: '�', name: 'Getting Started', desc: '2-day streak', check: () => calcStreak() >= 2 },
    { id: 'str4', icon: '⚡', name: 'Building Momentum', desc: '4-day streak', check: () => calcStreak() >= 4 },
    { id: 'str7', icon: '�', name: 'Week Warrior', desc: '7-day streak — one full week!', check: () => calcStreak() >= 7, sound: 'streak_7' },
    { id: 'str15', icon: '�', name: 'Half Month Hero', desc: '15-day streak', check: () => calcStreak() >= 15 },
    { id: 'str21', icon: '🏆', name: 'Habit Master', desc: '21-day streak — habits are forged!', check: () => calcStreak() >= 21, sound: 'streak_21' },
    { id: 'str30', icon: '👑', name: 'Legendary', desc: '30-day streak — one full month!', check: () => calcStreak() >= 30 },
    {
        id: 'perfect', icon: '✅', name: 'Perfectionist', desc: 'All habits for today are done',
        check: () => db.habits.length > 0 && (() => {
            const log = db.days[todayKey()]?.habitLog || {};
            return Object.values(log).filter(v => v).length >= db.habits.length;
        })()
    },
];

function totalDoneHabits() {
    return Object.values(db.days).reduce((s, d) =>
        s + Object.values(d.habitLog || {}).filter(v => v).length, 0);
}

// \u2500\u2500\u2500 AUDIO SYSTEM \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
const SOUNDS = {
    task_complete: 'media/sounds/task_complete.mp3',
    habit_complete: 'media/sounds/habit_complete.mp3',
    totem: 'media/sounds/totem.mp3',
    level_up: 'media/sounds/level_up.mp3',
    achievement: 'media/sounds/achievement.mp3',
    streak_7: 'media/sounds/streak_7.mp3',
    streak_21: 'media/sounds/streak_21.mp3',
};
const BG_MUSIC_SRC = 'media/sounds/bg_music.mp3';

// \u2500 Mute state (persisted) \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
let _muted = localStorage.getItem('elytra_muted') === '1';

function setMute(muted) {
    _muted = muted;
    localStorage.setItem('elytra_muted', muted ? '1' : '0');
    const icon = document.getElementById('muteIcon');
    const profileIcon = document.getElementById('profileMuteIcon');
    const btn = document.getElementById('muteBtn');
    const emoji = muted ? '🔇' : '🔊';
    if (icon) icon.textContent = emoji;
    if (profileIcon) profileIcon.textContent = emoji;
    // Tilt the button when muted so it looks "off"
    if (btn) btn.classList.toggle('btn-muted', muted);
    if (_bgMusic) {
        _bgMusic.muted = muted;
        if (!muted && _bgStarted) _bgMusic.play().catch(() => { });
    }
}

document.getElementById('muteBtn')?.addEventListener('click', () => setMute(!_muted));

// Apply persisted mute state immediately on load (moved below to after bgMusic init)

// \u2500 Web Audio API SFX \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
// Step 1: Pre-fetch ArrayBuffers RIGHT NOW (no gesture needed for fetch).
// Files download in background; by the time user clicks, they're ready.
let _audioCtx = null;
const _rawBuffers = {}; // name -> ArrayBuffer (pre-fetched)
const _audioBuffers = {}; // name -> AudioBuffer (decoded, ready to play)

Object.entries(SOUNDS).forEach(([name, src]) => {
    fetch(src)
        .then(r => r.ok ? r.arrayBuffer() : null)
        .then(buf => { if (buf) _rawBuffers[name] = buf; })
        .catch(() => { });
});

// Step 2: Create AudioContext & decode on first user gesture
function _initAudioCtx() {
    if (_audioCtx) return;
    _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    // Decode everything that has already been fetched
    Object.entries(_rawBuffers).forEach(([name, raw]) => {
        _audioCtx.decodeAudioData(raw.slice(0)) // .slice() to clone — decodeAudioData detaches the buffer
            .then(decoded => { _audioBuffers[name] = decoded; })
            .catch(() => { });
    });
    // Any file that arrives after gesture: auto-decode when fetched
    // (handled by the fetch chain below listening for _audioCtx)
}

['pointerdown', 'keydown'].forEach(ev =>
    window.addEventListener(ev, _initAudioCtx, { once: true })
);

function playSound(name) {
    if (_muted) return;
    _initAudioCtx();
    const buf = _audioBuffers[name];
    if (!buf || !_audioCtx) return;
    try {
        if (_audioCtx.state === 'suspended') _audioCtx.resume();
        const src = _audioCtx.createBufferSource();
        const gain = _audioCtx.createGain();
        gain.gain.value = 0.65;
        src.buffer = buf;
        src.connect(gain);
        gain.connect(_audioCtx.destination);
        src.start(0);
    } catch (e) { }
}

// \u2500 Background Music \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
// HTMLAudioElement loop is better for long music than Web Audio API
const _bgMusic = new Audio(BG_MUSIC_SRC);
_bgMusic.loop = true;
_bgMusic.volume = 0.25;
_bgMusic.muted = _muted;
let _bgStarted = false;

function _startBgMusic() {
    if (_bgStarted) return;
    _bgStarted = true;
    if (!_muted) _bgMusic.play().catch(() => { }); // graceful if file missing
}
// Start on first gesture (browser autoplay policy)
['pointerdown', 'keydown'].forEach(ev =>
    window.addEventListener(ev, _startBgMusic, { once: true })
);

// Apply persisted mute state immediately on load (now safe)
setMute(_muted);

// ─── MINECRAFT ACHIEVEMENT TOAST ─────────────────────────────
let achToastTimer = null;
function showAchievementToast(a) {
    const toast = document.getElementById('achievementToast');
    const icon = document.getElementById('achToastIcon');
    const name = document.getElementById('achToastName');
    const desc = document.getElementById('achToastDesc');
    if (!toast) return;

    // Populate
    icon.textContent = a.icon;
    name.textContent = a.name;
    desc.textContent = a.desc;

    // Reset & slide in
    clearTimeout(achToastTimer);
    toast.classList.remove('ach-out');
    toast.classList.add('ach-in');
    playSound(a.sound || 'achievement');

    // After 3.8 s, slide back out
    achToastTimer = setTimeout(() => {
        toast.classList.remove('ach-in');
        toast.classList.add('ach-out');
    }, 3800);
}

function renderAchievements() {
    const list = document.getElementById('achievementsList');
    list.innerHTML = ''; let dirty = false;
    ACHIEVEMENTS.forEach(a => {
        const ok = a.check();
        if (ok && !db.unlocked[a.id]) {
            db.unlocked[a.id] = true; dirty = true;
            showAchievementToast(a);
            if (a.sound) { triggerConfetti(); }
        }
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
    const isDark = db.theme === 'dark';
    const icon = document.getElementById('themeIcon');
    const profileIcon = document.getElementById('profileThemeIcon');
    const emoji = isDark ? '☀️' : '🌙';
    if (icon) icon.textContent = emoji;
    if (profileIcon) profileIcon.textContent = emoji;
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

// ─── TOTEM OF UNDYING ANIMATION ──────────────────────────
function triggerTotemAnim(tier) {
    // Inject keyframes once
    if (!document.getElementById('totemStyles')) {
        const s = document.createElement('style'); s.id = 'totemStyles';
        s.textContent = `
            @keyframes totemFlash {
                0%   { opacity: 0; }
                8%   { opacity: 0.55; }
                22%  { opacity: 0.18; }
                40%  { opacity: 0.42; }
                60%  { opacity: 0.08; }
                100% { opacity: 0; }
            }
            @keyframes totemEmoji {
                0%   { transform: translate(-50%,-50%) scale(0);   opacity: 0; filter: blur(12px); }
                12%  { transform: translate(-50%,-50%) scale(4.5); opacity: 1; filter: blur(0px);  }
                35%  { transform: translate(-50%,-50%) scale(3.2); opacity: 1; }
                60%  { transform: translate(-50%,-50%) scale(3.8); opacity: 0.9; }
                100% { transform: translate(-50%,-50%) scale(5.5); opacity: 0; filter: blur(8px);  }
            }
            @keyframes totemRay {
                0%   { transform: translate(-50%,-50%) rotate(var(--r)) scaleX(0);  opacity: 0.9; }
                35%  { opacity: 0.7; }
                100% { transform: translate(-50%,-50%) rotate(var(--r)) scaleX(1);  opacity: 0; }
            }
            @keyframes totemGlow {
                0%   { opacity: 0;   transform: translate(-50%,-50%) scale(0.2); }
                20%  { opacity: 0.7; transform: translate(-50%,-50%) scale(1.2); }
                100% { opacity: 0;   transform: translate(-50%,-50%) scale(2.8); }
            }
        `;
        document.head.appendChild(s);
    }

    const isDiamond = tier === 'diamond';
    const flashColor = isDiamond ? 'rgba(77,255,195,0.7)' : 'rgba(192,132,252,0.7)';
    const glowColor = isDiamond ? 'rgba(77,255,195,0.5)' : 'rgba(255,107,157,0.45)';
    const rayColors = isDiamond
        ? ['#4dffc3', '#7c6dff', '#4dffc3', '#fff', '#4dffc3']
        : ['#c084fc', '#ff6b9d', '#ffd700', '#c084fc', '#fff'];
    const icon = TIERS[tier]?.icon || '⚡';

    // 1. Full-screen flash
    const flash = document.createElement('div');
    flash.style.cssText = `position:fixed;inset:0;z-index:9995;pointer-events:none;
        background:${flashColor};animation:totemFlash 1.1s ease forwards;`;
    document.body.appendChild(flash);
    setTimeout(() => flash.remove(), 1200);

    // 2. Radial glow orb
    const glow = document.createElement('div');
    glow.style.cssText = `position:fixed;top:50%;left:50%;width:320px;height:320px;
        border-radius:50%;background:radial-gradient(circle,${glowColor} 0%,transparent 70%);
        z-index:9996;pointer-events:none;animation:totemGlow 1.3s ease forwards;`;
    document.body.appendChild(glow);
    setTimeout(() => glow.remove(), 1400);

    // 3. Radial rays (streak lines from center)
    const N_RAYS = 28;
    for (let i = 0; i < N_RAYS; i++) {
        const angle = (360 / N_RAYS) * i + (Math.random() - 0.5) * 6;
        const len = 160 + Math.random() * 200;
        const color = rayColors[i % rayColors.length];
        const delay = Math.random() * 0.18;
        const dur = 0.6 + Math.random() * 0.5;
        const w = 1.5 + Math.random() * 2;
        const ray = document.createElement('div');
        ray.style.cssText = `
            position:fixed;top:50%;left:50%;
            width:${len}px;height:${w}px;
            transform-origin:left center;
            --r:${angle}deg;
            background:linear-gradient(90deg,${color},transparent);
            border-radius:100px;
            z-index:9997;pointer-events:none;
            animation:totemRay ${dur}s ${delay}s cubic-bezier(0.2,0,0.8,1) forwards;
            opacity:0;
        `;
        /* small bright dot at tip */
        const dot = document.createElement('div');
        dot.style.cssText = `position:absolute;right:0;top:50%;transform:translateY(-50%);
            width:${w * 2.5}px;height:${w * 2.5}px;border-radius:50%;
            background:${color};box-shadow:0 0 6px ${color};`;
        ray.appendChild(dot);
        document.body.appendChild(ray);
        setTimeout(() => ray.remove(), (dur + delay) * 1000 + 100);
    }

    // 4. Big centre emoji burst — the TOTEM itself
    const em = document.createElement('div');
    em.style.cssText = `
        position:fixed;top:50%;left:50%;
        font-size:80px;line-height:1;
        z-index:9999;pointer-events:none;
        transform-origin:center;
        animation:totemEmoji 1.4s cubic-bezier(0.16,1,0.3,1) forwards;
    `;
    em.textContent = icon;
    document.body.appendChild(em);
    setTimeout(() => em.remove(), 1500);
}

// ─── RENDER ALL ──────────────────────────────────────────
function renderAll() {
    renderQuote(); renderXPBar(); renderLevelBadge();
    renderCalendar(); renderHabits(); renderHeatmap();
    renderStats(); renderCharts(); renderAchievements();
    updateHeaderAvatar();
}


// Kick off — show auth screen; onAuthStateChanged handles the rest
showAuthScreen();

// ─── 3D AUTH BACKGROUND ───────────────────────────────────
function initAuthBackground() {
    const canvas = document.getElementById('authCanvas');
    const overlay = document.getElementById('authOverlay');
    if (!canvas || !overlay) return;

    const ctx = canvas.getContext('2d');
    let W, H, cx, cy, animId = null;

    function resize() {
        W = canvas.width = overlay.offsetWidth || window.innerWidth;
        H = canvas.height = overlay.offsetHeight || window.innerHeight;
        cx = W / 2; cy = H / 2;
    }
    resize();
    window.addEventListener('resize', resize);

    /* ── Starfield ────────────────────────────────────────── */
    const N_STARS = 220;
    function mkStar() {
        return {
            x: (Math.random() - 0.5) * W * 3,
            y: (Math.random() - 0.5) * H * 3,
            z: Math.random() * W,
            pz: W
        };
    }
    const stars = Array.from({ length: N_STARS }, mkStar);

    /* ── Shooting stars ───────────────────────────────────── */
    const shooters = [];

    /* ── Particle sphere (Fibonacci distribution) ─────────── */
    const N_DOTS = 300;
    const spherePts = (() => {
        const G = Math.PI * (1 + Math.sqrt(5));
        return Array.from({ length: N_DOTS }, (_, i) => {
            const phi = Math.acos(1 - 2 * (i + .5) / N_DOTS);
            const theta = G * i;
            return [Math.sin(phi) * Math.cos(theta),
            Math.sin(phi) * Math.sin(theta),
            Math.cos(phi)];
        });
    })();

    /* ── Orbit rings definition ───────────────────────────── */
    const rings = [
        { tilt: 0.22, speed: 1.0, color: 'rgba(124,109,255,0.28)', width: 1.4 },
        { tilt: 1.15, speed: -0.65, color: 'rgba(255,107,157,0.22)', width: 1.0 },
        { tilt: 2.05, speed: 0.45, color: 'rgba(77,255,195,0.18)', width: 0.8 },
    ];

    let rotX = 0.35, rotY = 0, rotX2 = 1.1, rotY2 = 0.5, tick = 0;

    // Reusable: draw one sphere (glow + rings + dots) at (sox, soy)
    function renderSphere(sox, soy, sr, rX, rY, dir) {
        const glow = ctx.createRadialGradient(sox, soy, sr * 0.05, sox, soy, sr * 2.1);
        glow.addColorStop(0, 'rgba(124,109,255,0.20)');
        glow.addColorStop(0.5, 'rgba(100, 80,220,0.07)');
        glow.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = glow;
        ctx.fillRect(sox - sr * 2.3, soy - sr * 2.3, sr * 4.6, sr * 4.6);

        const rb = tick * 0.006;
        for (const r of rings) {
            ctx.save();
            ctx.translate(sox, soy);
            ctx.rotate(r.tilt + rb * r.speed * dir);
            ctx.scale(1, 0.26);
            ctx.beginPath();
            ctx.arc(0, 0, sr * 1.22, 0, Math.PI * 2);
            ctx.strokeStyle = r.color;
            ctx.lineWidth = r.width;
            ctx.stroke();
            ctx.restore();
        }

        const cX = Math.cos(rX), sX = Math.sin(rX);
        const cY = Math.cos(rY), sY = Math.sin(rY);
        const proj = spherePts.map(([ox, oy, oz]) => {
            const x = ox * cY - oz * sY;
            const z0 = ox * sY + oz * cY;
            const y2 = oy * cX - z0 * sX;
            const z2 = oy * sX + z0 * cX;
            return { px: sox + x * sr, py: soy + y2 * sr, d: (z2 + 1) / 2 };
        }).sort((a, b) => a.d - b.d);

        for (const { px, py, d } of proj) {
            const size = 0.5 + d * 2.0;
            const alpha = 0.12 + d * 0.88;
            const r = Math.round(100 + d * 155);
            const g = Math.round(80 - d * 10);
            const b = Math.round(255 - d * 60);
            ctx.beginPath();
            ctx.arc(px, py, size, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(${r},${g},${b},${alpha})`;
            ctx.fill();
        }
    }

    function draw() {
        animId = requestAnimationFrame(draw);
        tick++;

        ctx.clearRect(0, 0, W, H);

        const SR = Math.min(W, H) * 0.17;  // individual sphere radius
        const SY = H * 0.50;               // vertical centre

        /* ── Two spheres flanking the auth card ─────────────── */
        rotX += 0.0022; rotY += 0.0048;
        rotX2 += 0.0018; rotY2 -= 0.0040;
        if (W > 480) {
            renderSphere(W * 0.13, SY, SR, rotX, rotY, 1);
            renderSphere(W * 0.87, SY, SR, rotX2, rotY2, -1);
        }

        /* ── Warp starfield ─────────────────────────────────── */
        for (const s of stars) {
            s.pz = s.z;
            s.z -= 5;
            if (s.z <= 0) { Object.assign(s, mkStar()); continue; }

            const sx = (s.x / s.z) * W * 0.5 + cx;
            const sy = (s.y / s.z) * H * 0.5 + cy;
            const px = (s.x / s.pz) * W * 0.5 + cx;
            const py = (s.y / s.pz) * H * 0.5 + cy;

            const t = 1 - s.z / W;
            const alpha = t * t;              // quadratic fade-in
            const width = Math.max(0.3, t * 2.2);

            ctx.beginPath();
            ctx.moveTo(px, py);
            ctx.lineTo(sx, sy);
            ctx.strokeStyle = `rgba(210, 200, 255, ${alpha})`;
            ctx.lineWidth = width;
            ctx.stroke();
        }

        /* ── Shooting stars ─────────────────────────────────── */
        if (tick % 115 === 0 || tick % 178 === 0) {
            shooters.push({
                x: Math.random() * W * 0.75,
                y: Math.random() * H * 0.45,
                angle: Math.PI / 5.5 + (Math.random() - 0.5) * 0.5,
                len: 90 + Math.random() * 130,
                speed: 13 + Math.random() * 10,
                life: 1.0
            });
        }
        for (let i = shooters.length - 1; i >= 0; i--) {
            const s = shooters[i];
            const ex = s.x + Math.cos(s.angle) * s.len;
            const ey = s.y + Math.sin(s.angle) * s.len;
            const g = ctx.createLinearGradient(s.x, s.y, ex, ey);
            g.addColorStop(0, 'rgba(255,255,255,0)');
            g.addColorStop(1, `rgba(200, 160, 255, ${s.life})`);
            ctx.beginPath();
            ctx.moveTo(s.x, s.y);
            ctx.lineTo(ex, ey);
            ctx.strokeStyle = g;
            ctx.lineWidth = 1.5 * s.life;
            ctx.stroke();

            // Tiny glow at the head
            ctx.beginPath();
            ctx.arc(ex, ey, 1.5 * s.life, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(220, 180, 255, ${s.life * 0.7})`;
            ctx.fill();

            s.x += Math.cos(s.angle) * s.speed;
            s.y += Math.sin(s.angle) * s.speed;
            s.life -= 0.020;
            if (s.life <= 0) shooters.splice(i, 1);
        }

        // Pause when overlay not visible
        if (overlay.style.display === 'none') {
            cancelAnimationFrame(animId);
            animId = null;
        }
    }

    draw();

    // Restart animation on logout (overlay shown again)
    new MutationObserver(() => {
        if (overlay.style.display !== 'none' && !animId) draw();
    }).observe(overlay, { attributes: true, attributeFilter: ['style'] });
}

initAuthBackground();

// ─── MAIN PAGE — SUBTLE SHOOTING STARS ───────────────────
function initMainBackground() {
    const canvas = document.getElementById('mainCanvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let W, H, animId = null;

    function resize() {
        W = canvas.width = window.innerWidth;
        H = canvas.height = window.innerHeight;
    }
    resize();
    window.addEventListener('resize', resize);

    const meteors = [];
    let spawnCooldown = 0;

    function spawnMeteor() {
        const angle = Math.PI / 5 + (Math.random() - 0.5) * 0.4;
        meteors.push({
            x: Math.random() * W * 0.85,
            y: Math.random() * H * 0.35,
            len: 80 + Math.random() * 100,
            speed: 5 + Math.random() * 6,
            angle,
            life: 1,
            decay: 0.010 + Math.random() * 0.008,
        });
    }

    function draw() {
        animId = requestAnimationFrame(draw);
        ctx.clearRect(0, 0, W, H);

        // Spawn meteors more frequently (max 5 at a time)
        spawnCooldown--;
        if (spawnCooldown <= 0 && meteors.length < 5) {
            spawnMeteor();
            spawnCooldown = 60 + Math.random() * 60; // ~1–2 s at 60fps
        }

        for (let i = meteors.length - 1; i >= 0; i--) {
            const m = meteors[i];
            const ex = m.x + Math.cos(m.angle) * m.len;
            const ey = m.y + Math.sin(m.angle) * m.len;

            const g = ctx.createLinearGradient(m.x, m.y, ex, ey);
            g.addColorStop(0, 'rgba(255,255,255,0)');
            g.addColorStop(1, `rgba(200,185,255,${m.life * 0.75})`);

            ctx.beginPath();
            ctx.moveTo(m.x, m.y);
            ctx.lineTo(ex, ey);
            ctx.strokeStyle = g;
            ctx.lineWidth = 1.2;
            ctx.stroke();

            // Tiny bright head
            ctx.beginPath();
            ctx.arc(ex, ey, 1.2 * m.life, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(230, 215, 255, ${m.life * 0.7})`;
            ctx.fill();

            m.x += Math.cos(m.angle) * m.speed;
            m.y += Math.sin(m.angle) * m.speed;
            m.life -= m.decay;
            if (m.life <= 0) meteors.splice(i, 1);
        }

        // Stop only when the main app is hidden (user logged out)
        if (document.getElementById('appMain')?.style.display === 'none') {
            cancelAnimationFrame(animId);
            animId = null;
        }
    }

    canvas._start = () => { if (!animId) { canvas.classList.add('active'); draw(); } };
    canvas._stop = () => { canvas.classList.remove('active'); };

    new MutationObserver(() => {
        if (document.getElementById('appMain')?.style.display !== 'none' && !animId)
            canvas._start();
    }).observe(document.getElementById('appMain'), { attributes: true, attributeFilter: ['style'] });
}

initMainBackground();

