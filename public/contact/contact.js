'use strict';
/* Contact (/contact/): the form. Send is pressable once everything is filled in, and never twice; the
 * server checks it all again (Turnstile, an IP rate limit, a honeypot) and emails the team. Signed in,
 * the name and email come filled in. */
(async function () {
    const $ = (id) => document.getElementById(id);
    const toast = RBToast;
    const MESSAGE_MIN = 10, MESSAGE_MAX = 5000;
    const form = $('contactForm'), send = $('ctSend');
    const topic = () => (form.querySelector('input[name="topic"]:checked') || {}).value || '';
    const cfg = await RBConfig();
    const turnstile = RBTurnstile($('ctTurnstile'), cfg.turnstile);
    if (cfg.user) {
        $('ctName').value = [cfg.user.first_name, cfg.user.last_name].filter(Boolean).join(' ') || cfg.user.username || '';
        $('ctEmail').value = cfg.user.email || '';
    }
    let sending = false;
    const ready = () => $('ctName').value.trim() && $('ctEmail').validity.valid && $('ctEmail').value.trim() && topic() && $('ctMessage').value.trim().length >= MESSAGE_MIN;
    const sync = () => {
        send.disabled = sending || !ready();
        const left = MESSAGE_MAX - $('ctMessage').value.length;
        $('ctLeft').textContent = left < 500 ? String(left) : '';
    };
    form.addEventListener('input', sync);
    form.addEventListener('change', sync);
    sync();
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (sending || !ready()) return;
        sending = true;
        const busy = RBBusy(send, { onEnd: sync });
        const r = await RBApi('contact_send', {
            name: $('ctName').value.trim(), email: $('ctEmail').value.trim(), topic: topic(),
            message: $('ctMessage').value.trim(), website: $('ctWebsite').value,
            turnstile: turnstile.token(), lang: window.RBi18n ? RBi18n.current() : 'en', page: document.referrer,
        });
        turnstile.reset(); // a token is good for one message
        sending = false;
        if (!r.ok) { busy.reset(); return toast(r.error || 'Could not send.'); }
        form.hidden = true;
        $('contactDone').hidden = false;
        $('contactDone').scrollIntoView({ block: 'center', behavior: 'smooth' });
    });
    window.addEventListener('rb-lang', sync);
})();
