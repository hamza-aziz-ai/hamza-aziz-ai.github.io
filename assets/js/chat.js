/*=============== CHAT ASSISTANT ===============*/
// "Ask about Hamza" chat. Talks to the Cloudflare Worker in worker/, which
// holds the model key; nothing secret lives here.
//
// The Worker URL comes from this script tag's data-endpoint. While it is
// empty the widget renders nothing, so this file can ship before the
// Worker is deployed. data-mode="page" (chat.html) renders the chat as the
// whole page instead of a floating panel.
(function () {
    const script = document.currentScript
    const endpoint = script && script.dataset.endpoint
    if (!endpoint) return
    const pageMode = script.dataset.mode === 'page'

    const SUGGESTIONS = [
        "What's something not on Hamza's resume?",
        'What was the hardest problem he solved?',
        'Is he open to roles in the UAE?',
    ]
    // Greeting is UI-only and never sent upstream: the conversation sent to
    // the model must start with a visitor message.
    const GREETING = "Hi, I'm Hamza's AI assistant. I answer on his behalf, from his portfolio and his own engineering notes. Ask about his projects, decisions or experience."
    // Carries the conversation into the full-page view; read once, then removed.
    const HANDOFF = 'chat-handoff'
    const UNAVAILABLE = 'The assistant is unavailable right now. Please drop your query at hamza.aziz.dev@gmail.com'

    const history = []
    let busy = false
    // One chat is one logged session (D-025): a random id made when the chat
    // starts, sent with every question, and closed with a beacon when the
    // visitor leaves the page. The full-page view continues the same session.
    let session = crypto.randomUUID()
    let handedOff = false
    let lastDay = ''
    // Touch screens: focusing the field pops the on-screen keyboard over the
    // answer, so it opens only when the visitor taps the field themselves.
    const touch = matchMedia('(pointer: coarse)').matches
    const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)')
    const focusInput = () => { if (!touch) input.focus() }

    const launcher = el('button', {
        class: 'chat__launcher', type: 'button',
        'aria-label': 'Ask about Hamza', 'aria-expanded': 'false', 'aria-controls': 'chat-panel',
    }, [icon('ri-robot-3-fill')])

    const log = el('div', { class: 'chat__log', 'aria-live': 'polite' })
    const input = el('textarea', {
        class: 'chat__input', rows: '1', maxlength: '800',
        placeholder: 'Ask about his projects, decisions…', 'aria-label': 'Your question',
    })
    const send = el('button', { class: 'chat__send', type: 'submit', 'aria-label': 'Send' }, [icon('ri-send-plane-2-line')])
    const form = el('form', { class: 'chat__form' }, [input, send])
    const expand = el('button', { class: 'chat__action', type: 'button', 'aria-label': 'Open chat in a new tab', title: 'Open in a new tab' },
        [icon('ri-external-link-line')])
    const close = el('button', { class: 'chat__action', type: 'button', 'aria-label': 'Close chat', title: 'Close' }, [icon('ri-close-line')])
    const home = el('a', { class: 'chat__action', href: '/', 'aria-label': 'Back to hamzaaziz.dev', title: 'Back to hamzaaziz.dev' },
        [icon('ri-home-4-line')])
    const chips = el('div', { class: 'chat__chips' },
        SUGGESTIONS.map(q => el('button', { class: 'chat__chip', type: 'button' }, [q])))

    const panel = el('section', {
        class: pageMode ? 'chat__panel chat__panel--page' : 'chat__panel',
        id: 'chat-panel', 'aria-label': "Ask about Hamza's work",
        ...(pageMode ? {} : { role: 'dialog', hidden: '' }),
    }, [
        el('header', { class: 'chat__header' }, [
            el('p', { class: 'chat__title' }, ['Ask about Hamza']),
            el('div', { class: 'chat__actions' }, pageMode ? [home] : [expand, close]),
        ]),
        log, chips, form,
        el('p', { class: 'chat__note' }, ['AI assistant answering on Hamza’s behalf. It can be wrong. Chats are recorded, with approximate location, to improve it.']),
    ])

    addMessage('model', GREETING)
    if (pageMode) {
        document.body.append(panel)
        restore()
        focusInput()
    } else {
        document.body.append(launcher, panel)
    }

    const open = () => {
        panel.hidden = false
        launcher.setAttribute('aria-expanded', 'true')
        focusInput()
    }
    const hide = () => {
        panel.hidden = true
        launcher.setAttribute('aria-expanded', 'false')
        launcher.focus()
    }

    launcher.addEventListener('click', () => (panel.hidden ? open() : hide()))
    close.addEventListener('click', hide)
    // In-page prompts (the homepage hero line) stay hidden until the chat
    // exists, then open it.
    for (const cta of document.querySelectorAll('[data-chat-cta]')) cta.hidden = false
    for (const btn of document.querySelectorAll('[data-chat-open]')) btn.addEventListener('click', open)
    expand.addEventListener('click', () => {
        try {
            localStorage.setItem(HANDOFF, JSON.stringify(history))
            localStorage.setItem(HANDOFF + '-session', session)
            handedOff = true  // the chat goes on in the new tab, so leaving this page does not end it
        } catch { /* opens empty */ }
        window.open('/chat.html', '_blank', 'noopener')
    })
    if (!pageMode) panel.addEventListener('keydown', e => { if (e.key === 'Escape') hide() })
    chips.addEventListener('click', e => {
        const chip = e.target.closest('.chat__chip')
        if (chip) ask(chip.textContent)
    })
    input.addEventListener('keydown', e => {
        // Enter sends, Shift+Enter adds a line.
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); form.requestSubmit() }
    })
    form.addEventListener('submit', e => { e.preventDefault(); ask(input.value) })
    // Leaving the page ends the chat. sendBeacon survives the unload and
    // sends text/plain, so it needs no CORS preflight.
    addEventListener('pagehide', () => {
        if (handedOff || !history.some(m => m.role === 'user')) return
        navigator.sendBeacon(endpoint + '/end', JSON.stringify({ session }))
    })

    async function ask(raw) {
        const text = raw.trim()
        if (!text || busy) return
        busy = true
        send.disabled = true
        chips.hidden = true
        input.value = ''
        if (touch) input.blur()  // drop the keyboard so the answer is readable

        const sentAt = Date.now()
        addMessage('user', text, '', sentAt)
        history.push({ role: 'user', text, at: sentAt })
        const pending = addMessage('model', 'Thinking', 'chat__msg--pending')
        // Three dots that bounce in turn (CSS), so the wait reads as work.
        pending.querySelector('.chat__body').append(
            ...[1, 2, 3].map(() => el('span', { class: 'chat__dot', 'aria-hidden': 'true' }, ['.'])))

        try {
            const res = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                // The visitor's timezone lets the assistant tell their local time.
                body: JSON.stringify({
                    messages: history.slice(-8).map(({ role, text }) => ({ role, text })),
                    tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
                    session,
                    page: location.pathname,
                }),
            })
            const data = await res.json().catch(() => ({}))
            const reply = res.ok ? data.reply : null
            if (!reply) throw new Error(failureText(data))
            history.push({ role: 'model', text: reply, at: settle(pending, '') })
            pending.classList.remove('chat__msg--pending')
            await reveal(pending, reply)
        } catch (err) {
            // A failed turn is dropped from history so the next question is
            // not sent after an unanswered one.
            history.pop()
            // fetch() itself rejects with a TypeError ("Failed to fetch") when
            // the network or CORS fails; only the Worker's own messages are shown.
            settle(pending, renderMarkdown((!(err instanceof TypeError) && err.message) || UNAVAILABLE))
            pending.classList.replace('chat__msg--pending', 'chat__msg--error')
        } finally {
            busy = false
            send.disabled = false
            focusInput()
            log.scrollTop = log.scrollHeight
        }
    }

    // Out of quota, the Worker sends when it resets; shown in the visitor's
    // own timezone as "03:30 PM, Tuesday, 21 October 2026".
    function failureText(data) {
        // Rounded up to the minute, so "try after" is never a little early.
        const at = new Date(Math.ceil(Date.parse(data.retryAt) / 60000) * 60000)
        if (!data.retryAt || isNaN(at)) return data.error || UNAVAILABLE
        const p = dateParts(at)
        const when = `${clock(at)}, ${p.weekday}, ${p.day} ${p.month} ${p.year}`
        return `The assistant is unavailable right now. Please try after ${when} or drop your query at hamza.aziz.dev@gmail.com`
    }

    // Times and dates in the visitor's own timezone, en-GB order.
    function dateParts(at) {
        return Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
            hour: '2-digit', minute: '2-digit', hour12: true,
            weekday: 'long', day: '2-digit', month: 'long', year: 'numeric',
        }).formatToParts(at).map(x => [x.type, x.value]))
    }
    // "09:05 PM"
    function clock(at) {
        const p = dateParts(at)
        return `${p.hour}:${p.minute} ${p.dayPeriod.toUpperCase()}`
    }
    // WhatsApp-style day label: "Today", "Yesterday" or "20 October 2026".
    function dayLabel(at) {
        const day = d => new Date(d).toDateString()
        if (day(at) === day(Date.now())) return 'Today'
        if (day(at) === day(Date.now() - 864e5)) return 'Yesterday'
        const p = dateParts(at)
        return `${p.day} ${p.month} ${p.year}`
    }

    // Replays the conversation handed over by the floating panel.
    function restore() {
        let saved = []
        try {
            saved = JSON.parse(localStorage.getItem(HANDOFF) || '[]')
            session = localStorage.getItem(HANDOFF + '-session') || session
            localStorage.removeItem(HANDOFF)
            localStorage.removeItem(HANDOFF + '-session')
        } catch { /* storage blocked or corrupt: start fresh */ }
        if (!Array.isArray(saved)) return
        for (const m of saved) {
            if (!m || (m.role !== 'user' && m.role !== 'model') || typeof m.text !== 'string') continue
            const at = Number.isFinite(m.at) ? m.at : Date.now()
            history.push({ role: m.role, text: m.text, at })
            addMessage(m.role, m.text, '', at)
        }
        if (history.length) chips.hidden = true
    }

    // A new reply appears at a steady 250 characters a second, however long
    // it is. Paced by elapsed time, so a slow timer never slows the reading
    // speed. Instant for visitors who ask for reduced motion. The bubble is
    // aria-busy meanwhile, so a screen reader reads the whole reply once.
    // Restored history is never animated.
    const CHARS_PER_SECOND = 250
    function reveal(msg, text) {
        const body = msg.querySelector('.chat__body')
        if (reducedMotion.matches) {
            body.replaceChildren(renderMarkdown(text))
            return Promise.resolve()
        }
        msg.setAttribute('aria-busy', 'true')
        const start = performance.now()
        return new Promise(done => {
            const tick = () => {
                const shown = Math.min(text.length, Math.floor((performance.now() - start) / 1000 * CHARS_PER_SECOND))
                let partial = text.slice(0, shown)
                if (shown < text.length) {
                    // Hold back a [link](url) until it is complete, so its
                    // brackets never flash on screen.
                    const open = partial.lastIndexOf('[')
                    if (open > partial.lastIndexOf(')')) partial = partial.slice(0, open)
                    // Close a half-shown **bold** so it renders bold, not as "**".
                    if ((partial.match(/\*\*/g) || []).length % 2) partial += '**'
                }
                const atBottom = log.scrollHeight - log.scrollTop - log.clientHeight < 40
                body.replaceChildren(renderMarkdown(partial))
                if (atBottom) log.scrollTop = log.scrollHeight
                if (shown < text.length) return setTimeout(tick, 30)
                msg.removeAttribute('aria-busy')
                done()
            }
            tick()
        })
    }

    // Model replies are rendered as Markdown; visitor text stays plain. Each
    // bubble carries its time, and a day label opens each new day.
    function addMessage(role, text, extra, at = Date.now()) {
        const label = dayLabel(at)
        if (label !== lastDay) {
            lastDay = label
            log.append(el('p', { class: 'chat__day' }, [label]))
        }
        const msg = el('div', { class: `chat__msg chat__msg--${role}${extra ? ' ' + extra : ''}` }, [
            el('div', { class: 'chat__body' }, role === 'model' && !extra ? [renderMarkdown(text)] : [text]),
            el('time', { class: 'chat__time', datetime: new Date(at).toISOString() }, [clock(at)]),
        ])
        log.append(msg)
        log.scrollTop = log.scrollHeight
        return msg
    }

    // Swaps a pending bubble's text and stamps it with the time it arrived.
    function settle(msg, content) {
        const now = Date.now()
        msg.querySelector('.chat__body').replaceChildren(content)
        const stamp = msg.querySelector('.chat__time')
        stamp.textContent = clock(now)
        stamp.setAttribute('datetime', new Date(now).toISOString())
        return now
    }

    // Minimal Markdown built as DOM nodes: nothing the model writes is ever
    // parsed as HTML. Covers what the model emits: paragraphs, "-" and "1."
    // lists, headings, **bold**, *italic*, `code`, [links](url), bare URLs and
    // email addresses.
    function renderMarkdown(text) {
        const frag = document.createDocumentFragment()
        let list = null
        let para = null
        for (const raw of String(text).replace(/\r/g, '').split('\n')) {
            const line = raw.trim()
            if (!line) { list = para = null; continue }
            const item = line.match(/^(?:[-*•]|(\d+)[.)])\s+(.*)$/)
            if (item) {
                const tag = item[1] ? 'ol' : 'ul'
                if (!list || list.localName !== tag) { list = el(tag, {}); frag.append(list) }
                list.append(el('li', {}, inline(item[2])))
                para = null
                continue
            }
            list = null
            const heading = line.match(/^#{1,6}\s+(.*)$/)
            const content = heading ? [el('strong', {}, inline(heading[1]))] : inline(line)
            if (para) para.append(el('br', {}))
            else { para = el('p', {}); frag.append(para) }
            para.append(...content)
        }
        return frag
    }

    function inline(text) {
        const INLINE = /\*\*(.+?)\*\*|`([^`]+)`|\[([^\]]+)\]\(([^)\s]+)\)|(https?:\/\/[^\s<>()]*[^\s<>().,;:!?'"])|([\w.+-]+@[\w-]+(?:\.[\w-]+)+)|(?<![\w*])\*(?!\s)([^*]+?)\*(?![\w*])|(?<!\w)_(?!\s)([^_]+?)_(?!\w)|(?<![\w+])(\+\d{1,3}[ -]?\d[\d -]{6,13}\d)(?!\d)/g
        const out = []
        let last = 0
        for (const m of text.matchAll(INLINE)) {
            const [all, bold, code, label, href, url, email, em1, em2, phone] = m
            if (m.index > last) out.push(text.slice(last, m.index))
            if (bold) out.push(el('strong', {}, inline(bold)))
            else if (code) out.push(el('code', {}, [code]))
            else if (label) out.push(link(href, inline(label)) || all)
            else if (url) out.push(link(url, [url]) || url)
            else if (email) out.push(link('mailto:' + email, [email]) || email)
            else if (phone) out.push(link('tel:' + phone.replace(/[ -]/g, ''), [phone]) || phone)
            else out.push(el('em', {}, inline(em1 || em2)))
            last = m.index + all.length
        }
        if (last < text.length) out.push(text.slice(last))
        return out
    }

    // Only web, mail and phone links; anything else (javascript:, data:) stays text.
    function link(href, children) {
        let url
        try { url = new URL(href, location.href) } catch { return null }
        if (!['https:', 'http:', 'mailto:', 'tel:'].includes(url.protocol)) return null
        const a = el('a', { class: 'chat__link', href: url.href }, children)
        if (url.protocol.startsWith('http')) { a.target = '_blank'; a.rel = 'noopener noreferrer' }
        return a
    }

    function icon(name) {
        return el('i', { class: name, 'aria-hidden': 'true' })
    }

    function el(tag, attrs, children = []) {
        const node = document.createElement(tag)
        for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v)
        for (const c of children) node.append(c)
        return node
    }
})()
